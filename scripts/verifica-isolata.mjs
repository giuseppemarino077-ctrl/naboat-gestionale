import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const root = process.cwd();
const env = { ...process.env };
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of (await readFile(join(root, file), "utf8")).split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
const source = new URL(env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(source.hostname)) {
  throw new Error("La verifica isolata richiede un PostgreSQL locale.");
}
const name = `naboat_verifica_${randomBytes(8).toString("hex")}`;
const target = new URL(source);
target.pathname = `/${name}`;
const work = await mkdtemp(join(tmpdir(), "naboat-verifica-"));
const admin = new PrismaClient({ datasources: { db: { url: source.href } } });
let db;
let server;
let created = false;
let serverOutput = "";

Object.assign(env, {
  DATABASE_URL: target.href,
  DATABASE_URL_ADMIN: target.href,
  AUTH_SECRET: randomBytes(32).toString("hex"),
  CRON_SECRET: randomBytes(32).toString("hex"),
  SUPERADMIN_EMAIL: "admin@verifica.test",
  SUPERADMIN_PASSWORD: randomBytes(24).toString("hex"),
  REQUIRE_2FA: "false",
  REQUIRE_EMAIL_VERIFY: "false",
  RLS_ENABLED: "false",
  NODE_ENV: "development",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASS: "",
  TURNSTILE_SECRET: "",
  NEXT_PUBLIC_TURNSTILE_SITEKEY: "",
  PLATFORM_STRIPE_SECRET_KEY: "",
  PLATFORM_STRIPE_WEBHOOK_SECRET: "",
  GOOGLE_MAPS_API_KEY: "",
  STORAGE_DRIVER: "local",
  RATE_LIMIT_PREFIX: `${name}:`,
  APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_API_BASE: "",
  S3_ENDPOINT: "",
  S3_ACCESS_KEY: "",
  S3_SECRET_KEY: "",
  FTP_HOST: "",
  FTP_USER: "",
  FTP_PASS: "",
  UPLOADS_DIR: join(work, "public", "uploads"),
  PRIVATE_UPLOADS_DIR: join(work, "uploads-privati"),
  SMOKE_ORM_EMAIL: "ormeggiatore@demo.naboat.it",
  SMOKE_ORM_PASSWORD: randomBytes(24).toString("hex"),
});

async function run(command, args) {
  const child = spawn(command, args, { cwd: work, env, stdio: "inherit" });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`${command} ${args[0]}: uscita ${code}`);
}

try {
  for (const file of ["src", "prisma", "scripts", "public", "package.json", "package-lock.json", "next.config.js", "next-env.d.ts", "tsconfig.json", "tailwind.config.js", "postcss.config.js", "eslint.config.mjs"]) {
    await cp(join(root, file), join(work, file), { recursive: true, filter: (path) => path !== join(root, "public", "uploads") });
  }
  await cp(join(root, "node_modules"), join(work, "node_modules"), { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  created = true;
  console.log("Database temporaneo creato; migrazioni da zero.");
  await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  db = new PrismaClient({ datasources: { db: { url: target.href } } });
  const hash = (password) => bcrypt.hash(password, 12);
  await db.user.create({ data: { email: env.SUPERADMIN_EMAIL, passwordHash: await hash(env.SUPERADMIN_PASSWORD), role: "superadmin", emailVerified: true } });
  const tenant = await db.tenant.create({ data: { nome: "Ormeggio e Noleggio Verifica", status: "active", tipoModulo: "entrambi", moduloOrmeggio: true } });
  await db.user.create({ data: { tenantId: tenant.id, email: env.SMOKE_ORM_EMAIL, passwordHash: await hash(env.SMOKE_ORM_PASSWORD), role: "owner", emailVerified: true } });
  const noleggio = await db.tenant.create({ data: { nome: "Noleggio Verifica", status: "active", tipoModulo: "noleggio" } });
  await db.user.create({ data: { tenantId: noleggio.id, email: "titolare@demo.naboat.it", passwordHash: await hash("Demo-Titolare-2026!"), role: "owner", emailVerified: true } });

  env.NODE_ENV = "production";
  await run(process.execPath, ["scripts/verifica-confini.mjs"]);
  await run("npm", ["run", "build"]);
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "0"], { cwd: work, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let base;
  server.stdout.on("data", (data) => {
    output = (output + data.toString()).slice(-12000);
    serverOutput = output;
    const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) base = `http://127.0.0.1:${match[1]}`;
  });
  server.stderr.on("data", (data) => { output = (output + data.toString()).slice(-12000); serverOutput = output; });
  const deadline = Date.now() + 120000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("Il server temporaneo si è arrestato.");
    if (base) {
      const response = await fetch(`${base}/api/readyz`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
      if (response?.ok) { ready = true; break; }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Il server temporaneo non è pronto (DB/Redis).");
  env.APP_URL = base;
  console.log(`Server isolato pronto: ${base}`);
  await run(process.execPath, ["scripts/smoke-test.mjs", base]);
  await run(process.execPath, ["scripts/smoke-ormeggio.mjs", base]);
  await run(process.execPath, ["scripts/verifica-oggi.mjs", base]);
  await run(process.execPath, ["scripts/verifica-stabilizzazione.mjs", base]);
  await run(process.execPath, ["scripts/verifica-separazione.mjs", base]);
  if (env.ORMEGGIO_BROWSER === "1") await run(process.execPath, ["scripts/verifica-ormeggio-browser.mjs", base]);
} catch (e) {
  if (serverOutput) console.error(`Ultimi eventi del server temporaneo:\n${serverOutput}`);
  throw e;
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    const force = setTimeout(() => server.kill("SIGKILL"), 10000);
    await exited;
    clearTimeout(force);
  }
  await db?.$disconnect();
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.$disconnect();
  await rm(work, { recursive: true, force: true });
  console.log("Ambiente temporaneo rimosso.");
}
