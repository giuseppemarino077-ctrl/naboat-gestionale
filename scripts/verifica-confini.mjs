import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, relative, dirname, extname } from "node:path";
import ts from "typescript";

const root = process.cwd();
const graph = new Map();
const source = new Map();

async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (/\.tsx?$/.test(path) && !path.endsWith(".d.ts")) result.push(path);
  }
  return result;
}

async function localImport(file, name) {
  const base = name.startsWith("@/") ? resolve(root, "src", name.slice(2)) : name.startsWith(".") ? resolve(dirname(file), name) : null;
  if (!base) return null;
  for (const candidate of [base, base + ".ts", base + ".tsx", resolve(base, "index.ts"), resolve(base, "index.tsx")]) {
    if ((await stat(candidate).catch(() => null))?.isFile()) return candidate;
  }
  throw new Error(`Import locale irrisolto: ${relative(root, file)} → ${name}`);
}

function importedNames(file, text) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, extname(file) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const names = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) names.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require") && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) names.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return names;
}

function owner(file) {
  return relative(root, file).match(/^src\/modules\/(noleggio|ormeggio|piattaforma)\//)?.[1] ?? null;
}

function forbiddenPath(start, edges, ownership) {
  const product = ownership(start);
  const queue = [[start]];
  const seen = new Set([start]);
  for (let i = 0; i < queue.length; i++) {
    const chain = queue[i];
    for (const next of edges.get(chain.at(-1)) ?? []) {
      if (seen.has(next)) continue;
      const target = ownership(next);
      if (target && target !== "piattaforma" && target !== product) return [...chain, next];
      seen.add(next);
      queue.push([...chain, next]);
    }
  }
  return null;
}

const model = new Map([['orm', ['legacy']], ['legacy', ['nol']], ['nol', []], ['platform', ['legacy']]]);
const ownership = (name) => ({ orm: 'ormeggio', nol: 'noleggio', platform: 'piattaforma' })[name] ?? null;
assert.deepEqual(forbiddenPath('orm', model, ownership), ['orm', 'legacy', 'nol']);
assert.deepEqual(forbiddenPath('platform', model, ownership), ['platform', 'legacy', 'nol']);
assert.equal(forbiddenPath('nol', new Map([['nol', ['platform']], ['platform', []]]), ownership), null);
assert.deepEqual(importedNames('test.ts', 'export { a } from "./uno"; const b = import("./due"); const c = require("./tre");'), ['./uno', './due', './tre']);

for (const file of await files(resolve(root, "src"))) {
  const text = await readFile(file, "utf8");
  source.set(file, text);
  graph.set(file, (await Promise.all(importedNames(file, text).map((name) => localImport(file, name)))).filter(Boolean));
}

const errors = [];
let checked = 0;
let guarded = 0;
for (const [file, text] of source) {
  const product = owner(file);
  if (!product) continue;
  checked++;
  const chain = forbiddenPath(file, graph, owner);
  if (chain) errors.push(chain.map((p) => relative(root, p)).join(" → "));
  for (const imported of graph.get(file)) {
    if (relative(root, imported).startsWith("src/app/")) errors.push(`${relative(root, file)} importa un adattatore App Router`);
  }
  if (product === "ormeggio" && /\/api\/v1\/(?:boats|bookings|calendar|customers|tariffe|today)(?:[/?`"$]|$)/.test(text)) errors.push(`${relative(root, file)} usa un'API estranea all'Ormeggio`);
  if (product === "noleggio" && /\/api\/v1\/ormeggio(?:[/?`"$]|$)/.test(text)) errors.push(`${relative(root, file)} usa un'API dell'Ormeggio`);
  if (relative(root, file).includes("/server/")) {
    const publicRoute = /\/server\/(?:richieste|contratto\/public|payments\/public|contratto-public)\//.test(relative(root, file));
    if (!publicRoute) {
      const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      for (const node of ast.statements) {
        if (!ts.isFunctionDeclaration(node) || !node.body || !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(node.name?.text ?? "")) continue;
        if (relative(root, file).includes("/server/seo/") && node.name.text === "POST") continue;
        if (product === "piattaforma") continue;
        const body = node.body.getText(ast);
        const access = product === "ormeggio" ? /require(?:Ormeggio|Importi(?:Ormeggio)?)\(/ : /require(?:AziendaNoleggio|Noleggio|Azienda)\(/;
        if (!access.test(body)) errors.push(`${relative(root, file)}: ${node.name.text} senza controllo del prodotto`);
        else guarded++;
      }
    }
  }
}

if (errors.length) {
  console.error("Confini dei prodotti violati:\n" + errors.map((e) => `- ${e}`).join("\n"));
  process.exitCode = 1;
} else console.log(`Confini: ${checked} file di modulo, ${graph.size} file del grafo e ${guarded} operazioni private verificate; nessuna dipendenza diretta o transitiva vietata. 4 regressioni del verificatore superate.`);
