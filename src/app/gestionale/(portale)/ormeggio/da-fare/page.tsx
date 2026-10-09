import Schermata from "@/modules/ormeggio/views/da-fare/page";
import { requirePaginaProdotto } from "@/modules/piattaforma/accesso-pagine";

export default async function Pagina() {
  await requirePaginaProdotto("ormeggio");
  return <Schermata />;
}
