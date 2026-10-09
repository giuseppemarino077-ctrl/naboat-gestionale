import type { FormaBarca } from "@/modules/piattaforma/barche";

// Sagome laterali (profilo, prua a destra) distinte per tipo di barca, con un
// dettaglio tecnico riconoscibile: linea di falchetta, consolle, cabinato con
// finestrini, motori, albero e chiglia. Lo scafo prende il colore dello stato.

const HULL =
  "M5 31 L60 31 C74 31 86 34 91 40 C92.5 43.5 89.5 46.5 84 47.5 C63 51 22 51 10 46 C4 44 2.5 39 3.5 34 C4.2 32 4.5 31 5 31 Z";
const GUNWALE = "M7 33.5 C28 36 60 36 87 38.5";

function disegno(forma: FormaBarca, cor: string) {
  switch (forma) {
    case "open":
      return (
        <>
          <path d={HULL} fill={cor} />
          <path d={GUNWALE} stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.45" />
          <rect x="24" y="27.5" width="14" height="3.5" rx="1.5" fill="#ffffff" opacity="0.5" />
          <rect x="47" y="23" width="13" height="8" rx="2" fill={cor} />
          <path d="M48 23 L53 18 L60 18 L60 23 Z" fill="#ffffff" opacity="0.85" />
          <path d="M64 31 C71 29.5 79 29.5 86 31" stroke={cor} strokeWidth="1.4" fill="none" opacity="0.65" />
        </>
      );
    case "cabinato":
      return (
        <>
          <path d={HULL} fill={cor} />
          <path d={GUNWALE} stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.45" />
          <path d="M26 31 L32 15 L56 15 L62 31 Z" fill={cor} />
          <path d="M38 19 L54 19 L57 27 L35 27 Z" fill="#ffffff" opacity="0.6" />
          <path d="M45 19 L45 27 M51 19 L51 27" stroke={cor} strokeWidth="1" opacity="0.5" />
          <path d="M62 31 C72 29 81 29 87 31" stroke={cor} strokeWidth="1.4" fill="none" opacity="0.6" />
          <rect x="33" y="9" width="1.8" height="6" rx="0.9" fill={cor} opacity="0.75" />
          <circle cx="34" cy="8.5" r="1.4" fill={cor} opacity="0.75" />
        </>
      );
    case "gozzo":
      return (
        <>
          <path d="M4 30 L56 30 C72 30 86 33 91 40 C92.5 44 89 47.5 83 49 C61 53 19 53 8 48 C1.5 45.5 0.8 39 2.2 33 C2.8 31 3.4 30 4 30 Z" fill={cor} />
          <path d="M6 32.5 C28 35.5 58 35.5 86 39" stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.45" />
          <path d="M30 30 L36 21 L52 21 L57 30 Z" fill={cor} />
          <path d="M39 24 L50 24 L52 28 L37 28 Z" fill="#ffffff" opacity="0.6" />
          <path d="M57 30 Q70 27 82 30" stroke={cor} strokeWidth="1.5" fill="none" opacity="0.6" />
        </>
      );
    case "motoscafo":
      return (
        <>
          <path d="M3 33 L58 33 C74 33 89 36 93 42 C94.5 45 91 47 86 48 C64 52 20 52 9 47 C3.5 45 2 41 2.5 37 C2.8 34.5 3 33 3 33 Z" fill={cor} />
          <path d="M6 35 C28 37.5 58 37.5 90 40" stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.4" />
          <path d="M40 33 L60 33 L56 29 L44 29 Z" fill={cor} opacity="0.5" />
          <path d="M30 33 L36 25 L50 25 L55 33 Z" fill={cor} />
          <path d="M31.5 32.5 L37 26 L49 26 L53.5 32.5 Z" fill="#ffffff" opacity="0.9" />
          <path d="M64 33 C74 31 84 31 91 34" stroke={cor} strokeWidth="1.4" fill="none" opacity="0.55" />
        </>
      );
    case "gommone":
      return (
        <>
          <path d="M16 33 C14 29 18 27 24 27 L62 27 C78 27 90 32 93 39 C93.5 43 88 46.5 80 46.5 L22 46.5 C10 46.5 6 42 8 37 C9 34.5 12 33 16 33 Z" fill={cor} />
          <path d="M18 31.5 C30 29.5 58 29.5 84 35" stroke="#ffffff" strokeWidth="2.4" fill="none" opacity="0.4" />
          <path d="M24 40 C44 42.5 66 42.5 84 39" stroke="#ffffff" strokeWidth="1.3" fill="none" opacity="0.28" />
          <rect x="40" y="17" width="13" height="11" rx="2.5" fill={cor} />
          <path d="M41 17 L46 12 L53 12 L53 17 Z" fill="#ffffff" opacity="0.85" />
          <rect x="6" y="37" width="8" height="12" rx="2" fill={cor} />
          <path d="M60 30 L78 30" stroke={cor} strokeWidth="2" opacity="0.6" />
        </>
      );
    case "tender":
      return (
        <>
          <path d="M14 38 C18 32 32 30 48 30 L72 30 C82 30 89 34 90 38 C87 42 68 44 42 44 C22 44 16 42 14 38 Z" fill={cor} />
          <path d="M20 33.5 C34 31.5 56 31.5 72 33.5" stroke="#ffffff" strokeWidth="2" fill="none" opacity="0.4" />
          <rect x="30" y="27" width="14" height="3" rx="1.4" fill="#ffffff" opacity="0.5" />
          <rect x="8" y="37" width="7" height="10" rx="2" fill={cor} />
        </>
      );
    case "moto_acqua":
      return (
        <>
          <path d="M14 40 C10 40 8 36 12 33 L38 26 C50 22 62 23 70 29 C76 33 77 38 73 40 Z" fill={cor} />
          <path d="M38 27 Q50 24 58 28 L56 32 Q46 30 38 31 Z" fill="#ffffff" opacity="0.5" />
          <path d="M30 34 L44 32" stroke={cor} strokeWidth="1.5" fill="none" opacity="0.5" />
          <path d="M50 24 L54 17" stroke={cor} strokeWidth="3" strokeLinecap="round" />
          <circle cx="55" cy="15.5" r="2" fill={cor} />
        </>
      );
    case "pesca":
      return (
        <>
          <path d={HULL} fill={cor} />
          <path d={GUNWALE} stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.4" />
          <path d="M40 31 L43 14 L68 14 L71 31 Z" fill={cor} />
          <rect x="46" y="17" width="20" height="6" rx="1" fill="#ffffff" opacity="0.7" />
          <path d="M46 14 L46 10 M66 14 L66 10 M46 10 L66 10" stroke={cor} strokeWidth="1.2" fill="none" opacity="0.7" />
          <path d="M66 14 L71 5" stroke={cor} strokeWidth="1.4" fill="none" />
          <path d="M30 31 L28 40" stroke={cor} strokeWidth="1.4" fill="none" opacity="0.5" />
        </>
      );
    case "lancia":
      return (
        <>
          <path d={HULL} fill={cor} />
          <path d={GUNWALE} stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.4" />
          <path d="M30 31 L36 20 Q46 16 58 19 L64 31 Z" fill={cor} />
          <path d="M41 22 Q51 20 58 22 L61 28 L38 28 Z" fill="#ffffff" opacity="0.55" />
          <path d="M41 25 L60 25" stroke={cor} strokeWidth="1" opacity="0.4" />
          <path d="M64 31 C74 29 82 29 88 31" stroke={cor} strokeWidth="1.4" fill="none" opacity="0.6" />
        </>
      );
    case "vela":
      return (
        <>
          <path d="M6 41 C22 48 64 48 88 40 C91 39 91 42 88 43 C64 52 22 52 6 45 Z" fill={cor} />
          <path d="M52 3 L52 41" stroke={cor} strokeWidth="2.4" />
          <path d="M52 41 L52 50" stroke={cor} strokeWidth="2" opacity="0.8" />
          <path d="M52 6 L52 39 L22 39 Z" fill={cor} opacity="0.85" />
          <path d="M56 6 L56 39 L88 39 Z" fill={cor} opacity="0.45" />
          <path d="M52 6 L88 39" stroke={cor} strokeWidth="1" opacity="0.5" fill="none" />
        </>
      );
    case "catamarano":
      return (
        <>
          <path d="M18 34 C30 40 56 40 76 34 L74 40 C54 45 26 44 18 38 Z" fill={cor} opacity="0.45" />
          <path d="M10 39 C22 46 54 46 76 39 L74 45 C52 50 24 49 12 44 Z" fill={cor} />
          <path d="M10 31 L86 31 L86 36 L10 36 Z" fill={cor} />
          <path d="M30 31 L34 20 L62 20 L66 31 Z" fill={cor} />
          <path d="M38 23 L58 23 L60 28 L36 28 Z" fill="#ffffff" opacity="0.55" />
          <path d="M38 26 L60 26" stroke={cor} strokeWidth="1" opacity="0.4" />
        </>
      );
    case "houseboat":
      return (
        <>
          <path d="M8 30 L82 30 C90 30 93 34 93 40 L90 47 L10 47 C5 47 3 43 4 38 C4.5 34 6 30 8 30 Z" fill={cor} />
          <path d="M16 13 L78 13 L78 30 L16 30 Z" fill={cor} />
          <path d="M16 30 L78 30" stroke="#ffffff" strokeWidth="1" opacity="0.3" />
          <rect x="22" y="17" width="9" height="8" rx="1.5" fill="#ffffff" opacity="0.7" />
          <rect x="37" y="17" width="9" height="8" rx="1.5" fill="#ffffff" opacity="0.7" />
          <rect x="52" y="17" width="9" height="8" rx="1.5" fill="#ffffff" opacity="0.7" />
          <rect x="67" y="17" width="6" height="8" rx="1.5" fill="#ffffff" opacity="0.7" />
          <rect x="40" y="8" width="6" height="5" rx="1" fill={cor} opacity="0.8" />
        </>
      );
    case "remi":
      return (
        <>
          <path d="M6 35 L70 35 C84 35 92 38 94 42 C90 46 66 48 36 48 C14 48 6 45 6 41 Z" fill={cor} />
          <path d="M8 37.5 C30 40 62 40 90 42" stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.4" />
          <path d="M30 45 L13 28" stroke={cor} strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
          <path d="M54 45 L37 28" stroke={cor} strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
          <rect x="24" y="33" width="10" height="2.5" rx="1" fill="#ffffff" opacity="0.5" />
          <rect x="44" y="33" width="10" height="2.5" rx="1" fill="#ffffff" opacity="0.5" />
        </>
      );
  }
}

export function SagomaBarca({
  forma,
  cor,
  className = "h-11 w-auto",
}: {
  forma: FormaBarca;
  cor: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 96 56" className={className} aria-hidden>
      {disegno(forma, cor)}
    </svg>
  );
}
