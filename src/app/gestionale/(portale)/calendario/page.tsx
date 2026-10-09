import Schermata from "@/modules/noleggio/views/calendario/page";
import { requirePaginaProdotto } from "@/modules/piattaforma/accesso-pagine";

export default async function Pagina() {
  await requirePaginaProdotto("noleggio");
  return <Schermata />;
}
