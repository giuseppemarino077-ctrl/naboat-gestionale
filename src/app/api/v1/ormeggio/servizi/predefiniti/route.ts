import { operazioneCondivisa } from "@/modules/ormeggio/server/condivisione";
import { POST as eseguiPOST } from "@/modules/ormeggio/server/servizi/predefiniti/operazioni";
export const POST = operazioneCondivisa(eseguiPOST);
