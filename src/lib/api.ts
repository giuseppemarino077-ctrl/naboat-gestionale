import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
// TODO Fase2: verificare JWT + SET LOCAL app.tenant prima di ogni query.
export function getTenantId(req: Request): string | null {
  return new URL(req.url).searchParams.get("tenantId");
}
