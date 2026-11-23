<?php
// Configurazione di feedback.php, da copiare in config.php accanto a feedback.php. NON va nella repo.
// Sul sito la scrive il deploy (.github/workflows/deploy.yml di CLUBDELCIMMENA) dai Secrets:
//   MYCIMMENA_FEEDBACK_TO    indirizzo che riceve le segnalazioni (obbligatorio)
//   MYCIMMENA_FEEDBACK_FROM  mittente, un indirizzo @clubdelcimmena.it (facoltativo)
return [
    'to' => 'INSERISCI_LA_TUA_EMAIL',
    'from' => 'noreply@clubdelcimmena.it',
    // Sale per l'impronta degli IP nel limite giornaliero (facoltativo: senza, si ricava da 'to').
    // 'salt' => 'una-stringa-casuale',
    // Solo per le prove in locale: la mail si scrive in data/last-mail.eml invece di partire.
    // 'dry_run' => true,
];
