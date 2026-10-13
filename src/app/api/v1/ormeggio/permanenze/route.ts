import { operazioneCondivisa } from "@/modules/ormeggio/server/condivisione";
import { POST as eseguiPOST } from "@/modules/ormeggio/server/permanenze/operazioni";
export { GET } from "@/modules/ormeggio/server/permanenze/operazioni";
export const POST = operazioneCondivisa(eseguiPOST);
