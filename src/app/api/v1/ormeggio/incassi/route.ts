import { operazioneCondivisa } from "@/modules/ormeggio/server/condivisione";
import { POST as eseguiPOST } from "@/modules/ormeggio/server/incassi/operazioni";
export { GET } from "@/modules/ormeggio/server/incassi/operazioni";
export const POST = operazioneCondivisa(eseguiPOST);
