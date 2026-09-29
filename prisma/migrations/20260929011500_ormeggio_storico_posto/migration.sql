-- O01: la posizione storica vive nelle assegnazioni con validità temporale.
-- Il vincolo sulla riga Permanenza (posto + intervallo dell'intera permanenza) non può
-- più rappresentare un trasferimento: la barca cambia posto nel tempo, quindi l'intervallo
-- della permanenza sul nuovo posto partirebbe dall'inizio e colpirebbe occupazioni passate
-- legittime. Resta il vincolo per barca; per il posto vale quello su AssegnazionePosto.
ALTER TABLE "Permanenza" DROP CONSTRAINT IF EXISTS "permanenza_posto_senza_sovrapposizioni";
