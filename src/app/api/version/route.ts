import { NextResponse } from "next/server";
import pkg from "../../../../package.json";

// Versione del processo in esecuzione: serve a riconoscere la release pubblicata
// senza esporre configurazione o segreti. Lo SHA arriva dalle variabili di build
// (GIT_SHA/BUILD_SHA/COMMIT_SHA), impostate dal Dockerfile o dal deploy.
export async function GET() {
  const sha =
    process.env.GIT_SHA ||
    process.env.BUILD_SHA ||
    process.env.COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "sconosciuto";
  return NextResponse.json(
    {
      service: "naboat-gestionale",
      version: pkg.version,
      sha,
      env: process.env.NODE_ENV ?? "unknown",
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
