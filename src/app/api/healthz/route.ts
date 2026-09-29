import { NextResponse } from "next/server";

// Liveness: dice solo che il processo è vivo. NON tocca il database né Redis,
// così un DB lento non fa riavviare il container. È il controllo di salute del
// container; per capire se l'app può servire traffico usare /api/readyz.
export async function GET() {
  return NextResponse.json(
    { ok: true, service: "naboat-gestionale", time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
