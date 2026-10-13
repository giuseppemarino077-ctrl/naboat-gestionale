import { operazioneCondivisa } from "@/modules/ormeggio/server/condivisione";
import { PATCH as eseguiPATCH, DELETE as eseguiDELETE } from "@/modules/ormeggio/server/addebiti/[id]/operazioni";
export const PATCH = operazioneCondivisa(eseguiPATCH);
export const DELETE = operazioneCondivisa(eseguiDELETE);
