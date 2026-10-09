import Schermata from "@/modules/noleggio/views/flotta/[id]/foto/page";
import { requirePaginaProdotto } from "@/modules/piattaforma/accesso-pagine";

export default async function Pagina() {
  await requirePaginaProdotto("noleggio");
  return <Schermata />;
}
