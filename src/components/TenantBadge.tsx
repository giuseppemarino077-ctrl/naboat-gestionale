"use client";
import { useEffect, useState } from "react";

export default function TenantBadge() {
  const [dati, setDati] = useState<{ tenantNome: string | null; tenantLogo: string | null; tenantStatus: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/v1/auth/me")
      .then((r) => r.json())
      .then((j) => setDati(j.user ?? null))
      .catch(() => {});
  }, []);

  if (!dati?.tenantNome) return null;

  return (
    <div className="mt-auto border-t border-white/10 p-2 text-xs text-[#f3cba6]">
      <div>{(dati.tenantStatus ?? "").toUpperCase()}</div>
      <div className="mt-1 flex items-center gap-2">
        {dati.tenantLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dati.tenantLogo} alt={dati.tenantNome} className="h-7 w-7 rounded-md bg-white object-contain p-0.5" />
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-md bg-white/15 font-bold text-white">
            {dati.tenantNome.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="truncate text-white">{dati.tenantNome}</span>
      </div>
    </div>
  );
}
