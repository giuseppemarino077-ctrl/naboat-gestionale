import Schermata from "@/modules/ormeggio/views/configurazione/page";
import { requirePaginaProdotto } from "@/modules/piattaforma/accesso-pagine";

export default async function Pagina() {
  await requirePaginaProdotto("ormeggio");
  return <Schermata />;
}
