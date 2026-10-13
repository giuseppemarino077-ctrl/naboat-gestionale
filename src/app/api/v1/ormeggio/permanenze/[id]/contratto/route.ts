import { operazioneCondivisa } from "@/modules/ormeggio/server/condivisione";
import { POST as eseguiPOST } from "@/modules/ormeggio/server/permanenze/[id]/contratto/operazioni";
export const POST = operazioneCondivisa(eseguiPOST);
