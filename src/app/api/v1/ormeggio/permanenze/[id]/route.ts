import { operazioneCondivisa } from "@/modules/ormeggio/server/condivisione";
import { PATCH as eseguiPATCH } from "@/modules/ormeggio/server/permanenze/[id]/operazioni";
export { GET } from "@/modules/ormeggio/server/permanenze/[id]/operazioni";
export const PATCH = operazioneCondivisa(eseguiPATCH);
