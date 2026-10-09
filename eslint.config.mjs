import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "scripts/**",
      "prisma/migrations/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Il progetto usa `any` in punti mirati (payload eterogenei delle route):
      // segnalato come avviso, non come errore bloccante.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Regole cosmetiche preesistenti (apostrofi nel testo italiano, tag <a> interni):
      // segnalate ma non bloccanti, per avere un controllo di qualità utilizzabile in CI.
      "react/no-unescaped-entities": "warn",
      "@next/next/no-html-link-for-pages": "warn",
    },
  },
  {
    files: ["src/modules/piattaforma/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{
        group: ["**/noleggio", "**/noleggio/**", "**/ormeggio", "**/ormeggio/**", "@/lib/disponibilita", "@/lib/ormeggio", "@/lib/servizi-ormeggio", "@/lib/marketplace", "@/lib/planning", "@/lib/presenze", "@/lib/contratto-link", "@/lib/contratti", "@/lib/payments", "@/lib/modelli-barche", "@/lib/opzioni-barche", "@/app/**"],
        message: "La piattaforma comune non deve dipendere dai moduli Noleggio o Ormeggio.",
      }] }],
    },
  },
  {
    files: ["src/modules/ormeggio/**/*.{ts,tsx}", "src/app/api/v1/ormeggio/**/*.ts", "src/app/gestionale/(portale)/ormeggio/**/*.tsx", "src/components/ormeggio/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{
        group: ["**/noleggio", "**/noleggio/**", "@/lib/disponibilita", "@/lib/marketplace", "@/lib/planning", "@/lib/presenze", "@/lib/contratto-link", "@/lib/contratti", "@/lib/payments", "@/lib/modelli-barche", "@/lib/opzioni-barche", "@/app/**"],
        message: "Ormeggio può usare la piattaforma comune, ma non la logica del Noleggio.",
      }] }],
    },
  },
  {
    files: ["src/modules/noleggio/**/*.{ts,tsx}", "src/app/api/v1/bookings/**/*.ts", "src/app/api/v1/blocks/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{
        group: ["**/ormeggio", "**/ormeggio/**", "@/lib/ormeggio", "@/lib/servizi-ormeggio", "@/lib/contratti", "@/lib/payments", "@/app/**"],
        message: "Noleggio può usare la piattaforma comune, ma non la logica dell’Ormeggio.",
      }] }],
    },
  },
  {
    files: ["src/modules/ormeggio/regole.ts", "src/modules/ormeggio/servizi.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{
        group: ["**/noleggio", "**/noleggio/**", "@/lib/disponibilita", "@/lib/marketplace", "@/lib/contratti", "@/lib/payments", "@/app/**", "@/lib/db", "@/lib/session", "@/lib/tenant", "@/lib/guard", "@/modules/piattaforma/accesso-azienda", "@/modules/ormeggio/accesso"],
        message: "Le regole e il catalogo Ormeggio devono restare indipendenti da database, sessioni e servizi server.",
      }] }],
    },
  },
];

export default eslintConfig;
