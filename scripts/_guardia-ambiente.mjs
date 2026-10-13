// Guardia per gli script dimostrativi e di seed.
// Si rifiutano di partire quando l'ambiente sembra di produzione, a meno che
// il proprietario non lo autorizzi esplicitamente con DEMO_CONFERMA_PRODUZIONE=true.
// Evita che un comando lanciato per errore tocchi i dati reali.

export function assicuraAmbienteDemo(nomeScript) {
  const produzione = process.env.NODE_ENV === "production";
  const url = process.env.DATABASE_URL ?? "";
  const hostRemoto = /(^|@|\/\/)(?!localhost|127\.0\.0\.1|db:)[^/:@]+\//.test(url) || /amazonaws|aruba|neon|supabase|render\.com/i.test(url);
  const autorizzato = process.env.DEMO_CONFERMA_PRODUZIONE === "true";

  if ((produzione || hostRemoto) && !autorizzato) {
    console.error(
      [
        `STOP: ${nomeScript} crea o modifica dati dimostrativi e non può girare su un ambiente di produzione.`,
        `NODE_ENV=${process.env.NODE_ENV ?? "(non impostato)"} · database=${hostRemoto ? "remoto" : "locale"}.`,
        "Per procedere su un ambiente di test isolato imposta DEMO_CONFERMA_PRODUZIONE=true solo se sei assolutamente certo.",
      ].join("\n"),
    );
    process.exit(1);
  }
}

export function assicuraDatabaseSmoke(nomeScript) {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const db = new URL(process.env.DATABASE_URL);
  if (!hosts.has(db.hostname)
    || !/^\/naboat_verifica_[a-f0-9]{16}$/.test(db.pathname)
    || db.pathname !== `/${process.env.NABOAT_TEST_DATABASE}`) {
    throw new Error(`${nomeScript}: usa npm run test:isolated; gli smoke modificano dati e impostazioni globali.`);
  }
}

export function assicuraAmbienteSmoke(nomeScript, base) {
  assicuraDatabaseSmoke(nomeScript);
  const api = new URL(base);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(api.hostname) || api.href !== process.env.NABOAT_TEST_BASE_URL) {
    throw new Error(`${nomeScript}: usare soltanto il server di npm run test:isolated.`);
  }
}
