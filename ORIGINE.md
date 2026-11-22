# Origine del codice

Il frontend di myCimmena (`www/`) è partito da una copia del sito del Club del Cimmena:

- **Repo:** `dariotronic/clubdelcimmena`
- **Commit:** `48eb2c4` ("Randomizer: niente toast per il film estratto, toast quando lo si scarta")
- **Data della copia:** 22 novembre 2026

Da allora le due repo vanno ognuna per conto suo. Quando si corregge qualcosa in una delle due, si guarda se vale anche per l'altra e la si riporta a mano; ogni correzione riportata si annota in fondo.

## Cosa è stato copiato

| Sito | App |
|---|---|
| `index.php` | `www/index.html`, statico: niente PHP, nonce e import map; CSP in un `<meta>` |
| `script.js` | `www/script.js`, senza login, push, link per la password, copia offline dei dati e aggiornamento periodico dal server |
| `style.css` | `www/style.css`, con i temi "my" e senza gli stili delle parti tolte |
| `assets/js/*.js` | `www/assets/js/`, meno i moduli tolti (sotto) |
| `assets/fonts/`, `assets/logo.svg` | uguali |
| `assets/favicon/` | solo `favicon.svg` e l'immagine da 512 px, come base per l'icona |
| `tests/frontend.test.js` | `tests/frontend.test.js`, senza i test delle parti tolte e con i percorsi in `www/` |

## Cosa è stato tolto

- **Moduli:** `profile.js` (login e profilo), `push.js`, `password-link.js`, `user-admin.js`, `reactions.js`, `review-reactions.js`, `review-replies.js`.
- **Nel resto del codice:** token del dispositivo e controlli `hasDeviceAuthorization()`, "Aggiunto da" (scheda, filtri della watchlist e del randomizer), autori, avatar e titoli del club nelle recensioni, 💫 "hanno recensito tutti", service worker.
- **Non copiati:** `api/`, `db/`, `tools/`, `sw.js`, `manifest.webmanifest`, avatar e locandine salvate sul server, documenti del sito.

## Cosa è cambiato

- `api.js` è uno strato provvisorio: dati vuoti all'avvio e un errore chiaro a ogni modifica. Nella Fase 1 lo sostituisce `store.js`; le chiamate `apiRequest('api/...')` rimaste in `meeting.js`, `movie-info.js`, `reviews.js`, `search.js` e `watchlist.js` sono quelle da riscrivere.
- Il "Calendario" si chiama "Serata", il "Profilo" diventa "Impostazioni" (`#impostazioni`; `#profilo` ci porta comunque).
- Chiavi di `localStorage` da `clubdelcimmena-*` a `mycimmena-*`.
- Modalità colore "giorno" e "notte" al posto di "colonizzatore" e "colonizzato".
- Testi del cineforum ("Il prossimo cineforum", "Quando ci vediamo?", "Solo horror e sci-fi, pls.") resi neutri.
- Nuovi: `boot.js` (tema salvato e controllo della WebView), `app-info.js` (versione e credit), `tests/app.test.js`, `tools/serve.js`.

## Correzioni riportate

| Data | Da → a | Commit di origine | Cosa |
|---|---|---|---|
| | | | |
