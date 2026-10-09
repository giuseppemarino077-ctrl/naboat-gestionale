import Schermata from "@/modules/noleggio/views/prenotazioni/[id]/contratto/page";
import { requirePaginaProdotto } from "@/modules/piattaforma/accesso-pagine";

export default async function Pagina() {
  await requirePaginaProdotto("noleggio");
  return <Schermata />;
}
