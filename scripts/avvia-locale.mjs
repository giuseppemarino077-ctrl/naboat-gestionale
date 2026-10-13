import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const project = fileURLToPath(new URL("../", import.meta.url));
const base = "http://127.0.0.1:3000";
const browserUrl = "http://localhost:3000/gestionale/accesso";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server;
let stopping = false;

function stopServer(signal) {
  if (server?.pid && server.exitCode === null && server.signalCode === null) {
    try { process.kill(-server.pid, signal); } catch { /* processo già terminato */ }
  }
}

function run(command, args, quiet = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: project,
      env: process.env,
      stdio: quiet ? ["ignore", "pipe", "ignore"] : "inherit",
    });
    let output = "";
    child.stdout?.on("data", (data) => { output += data; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`Comando non riuscito: ${command} ${args[0] ?? ""}`));
    });
  });
}

async function json(path) {
  try {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(3000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function portBusy() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 3000 });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.once("timeout", () => { socket.destroy(); resolve(true); });
  });
}

async function waitReady() {
  const deadline = Date.now() + 120_000;
  while (!stopping && Date.now() < deadline) {
    const ready = await json("/api/readyz");
    if (ready?.ok && ready.checks?.db && ready.checks?.redis) return;
    if (server && (server.exitCode !== null || server.signalCode !== null)) break;
    await pause(1000);
  }
  throw new Error("NaBoat non è pronto. Controlla gli errori del server nel terminale.");
}

async function openBrowser() {
  console.log(`\nNaBoat pronto: ${browserUrl}`);
  if (process.platform === "darwin") {
    await run("open", [browserUrl], true).catch(() => {
      console.log("Apri il collegamento indicato nel browser.");
    });
  }
}

async function main() {
  process.chdir(project);
  process.env.NODE_ENV = "development";
  if (!existsSync(".env.local") || !existsSync(".env")) {
    throw new Error("Servono .env e .env.local: consulta README.md e i file .example.");
  }
  nextEnv.loadEnvConfig(project, true);
  for (const [name, port] of [["DATABASE_URL", "5434"], ["DATABASE_URL_ADMIN", "5434"], ["REDIS_URL", "6380"]]) {
    if (name === "DATABASE_URL_ADMIN" && !process.env[name]) continue;
    let url;
    try { url = new URL(process.env[name]); } catch { /* validazione sotto */ }
    if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.port !== port) {
      throw new Error(`${name} deve puntare al servizio locale sulla porta ${port}. Controlla .env.local.`);
    }
  }

  const endpoint = process.env.DOCKER_HOST || await run("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], true);
  if (!endpoint.startsWith("unix://")) throw new Error("Seleziona un contesto Docker Desktop locale prima di continuare.");
  try {
    await run("docker", ["info", "--format", "{{.ServerVersion}}"], true);
  } catch {
    if (process.platform !== "darwin") throw new Error("Avvia Docker prima di continuare.");
    console.log("Avvio Docker Desktop...");
    await run("open", ["-a", "Docker"]);
    const deadline = Date.now() + 120_000;
    while (true) {
      try {
        await run("docker", ["info", "--format", "{{.ServerVersion}}"], true);
        break;
      } catch {
        if (Date.now() >= deadline) throw new Error("Docker Desktop non è pronto: aprilo e riprova.");
        await pause(2000);
      }
    }
  }

  console.log("Avvio PostgreSQL e Redis...");
  await run("docker", ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.override.yml", "up", "-d", "--wait", "--wait-timeout", "90", "db", "redis"]);
  console.log("Controllo migrazioni (sola lettura)...");
  await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "status"]);

  if (await portBusy()) {
    const health = await json("/api/healthz");
    const pids = await run("lsof", ["-t", "-iTCP:3000", "-sTCP:LISTEN"], true).catch(() => "");
    const cwd = pids ? await run("lsof", ["-a", "-p", pids.split("\n").join(","), "-d", "cwd", "-Fn"], true).catch(() => "") : "";
    const ownServer = cwd.split("\n").some((line) => line === `n${realpathSync(project)}`);
    if (health?.service !== "naboat-gestionale" || !ownServer) {
      throw new Error("La porta 3000 è occupata da un altro processo. Liberala prima di avviare NaBoat.");
    }
    console.log("Il server di questo progetto è già acceso.");
    await waitReady();
    await openBrowser();
    return;
  }

  await run(process.execPath, ["node_modules/prisma/build/index.js", "generate"]);
  console.log("Avvio server. Lascia aperto il terminale; Ctrl+C ferma il server.\n");
  server = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000"], {
    cwd: project,
    env: process.env,
    stdio: "inherit",
    detached: true,
  });
  const exited = new Promise((resolve, reject) => {
    server.on("error", reject);
    server.on("exit", (code) => {
      if (code && code !== 130) reject(new Error(`Server terminato con codice ${code}.`));
      else resolve();
    });
  });
  await Promise.all([exited, waitReady().then(openBrowser)]);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    if (server) stopServer(signal);
    else process.exit(0);
  });
}

main().catch((error) => {
  if (server && !stopping) stopServer("SIGTERM");
  if (!stopping) {
    console.error(`\n${error.message}`);
    console.error("Se mancano migrazioni, applicale consapevolmente con npm run db:migrate dopo aver verificato il database locale.");
    process.exitCode = 1;
  }
});
