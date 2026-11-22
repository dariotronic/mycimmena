# myCimmena: piano

App Android personale per tenere traccia dei film e delle serie visti e da vedere. È un progetto separato dal sito del Club del Cimmena (repo `CLUBDELCIMMENA`): parte dal suo frontend, ma ha una propria repo e può cambiarne l'architettura. Le correzioni utili a entrambi si fanno a mano su tutte e due.

L'app si distribuisce come APK fuori dal Play Store. I dati dell'utente restano sul telefono: non c'è nessun account e nessun server con i dati personali.

---

## 1. Decisioni prese

| Tema | Decisione |
|---|---|
| Nome | **myCimmena**: cartella, repo e nome dell'app |
| Repo | `github.com/dariotronic/mycimmena`, pubblica, separata da `CLUBDELCIMMENA` |
| `appId` | `it.mycimmena.app` (non si cambia più dopo la prima release) |
| Distribuzione | APK firmato, scaricato dalle Release della repo GitHub |
| Contenitore | Capacitor (HTML/CSS/JS dentro una WebView Android) |
| Android minimo | **Android 7.0** (API 24), con WebView aggiornata (§2) |
| Dati | Solo sul telefono, con backup ed esportazione/importazione in JSON |
| Ricerca film | Endpoint pubblico di suggerimenti di IMDb, senza chiave |
| Dettagli film | OMDb con la **chiave personale** dell'utente (gratuita, 1000 richieste al giorno) |
| Proxy sul server | **No**: l'app non passa dal server per cercare o caricare film |
| Senza chiave | Modalità **light**: scelta dell'utente, oppure temporanea in attesa della chiave |
| Voto | **Per visione**; la scheda mostra tutte le visioni nella sezione "I miei voti" (§6) |
| Serie TV | Avanzamento per episodio, struttura delle stagioni da OMDb o personalizzata (§7) |
| Aggiornamenti | Controllo dell'ultima Release GitHub a ogni apertura e ogni ora, più "Controlla ora" (§10) |
| Importazione | Watchlist da Letterboxd e IMDb (CSV), spiegata nell'onboarding (§9) |
| Tema | Variante "my" dei temi giorno e notte del Club (§13) |
| Segnalazioni | Modulo nell'app → `feedback.php` sul server IONOS → mail a Dario |
| Informazioni | Pagina con fonti dei dati, licenze e privacy; credit in fondo alle Impostazioni (§14) |
| Social | Tolti: account, reaction, risposte, notifiche push, "aggiunto da" |

---

## 2. Architettura

### Contenitore
- **Capacitor** con progetto Android in `android/`. Il codice web sta in `www/` e resta JavaScript vanilla senza bundler: `npx cap sync` lo copia nell'APK.
- `index.php` del sito diventa `www/index.html` statico (sprite SVG, template, import map). Niente nonce né CSP generata da PHP: la CSP va in un `<meta>`.
- Plugin previsti:
  - `@capacitor/preferences`: impostazioni piccole
  - `@capacitor/filesystem`: backup, locandine salvate, APK scaricato
  - `@capacitor/share`: esportazione del backup
  - `@capacitor/local-notifications`: compleanno e serata in programma
  - `@capacitor/browser`: pagina di registrazione OMDb, link esterni (Instagram, GitHub)
  - `@capacitor/app`: versione dell'app e ritorno in primo piano
  - `@capacitor/clipboard`: rilevamento della chiave copiata
  - `CapacitorHttp` (incluso nel core): richieste a IMDb, OMDb e GitHub senza problemi di CORS
  - Un selettore di file per l'importazione (backup JSON e CSV/ZIP di Letterboxd e IMDb), per esempio `@capawesome/capacitor-file-picker` (da verificare)
  - Un plugin per aprire l'APK con l'installer (per esempio `@capacitor-community/file-opener`, da verificare)

### Versione minima di Android
- **Android 7.0 (API 24)**: è il `minSdkVersion` di Capacitor 8, la versione attuale. Se in Fase 0 la versione di Capacitor in uso ne richiede una diversa, si aggiorna questa riga.
- Il vero requisito è la **WebView**, non Android. Su Android 7+ "Android System WebView" (o Chrome) si aggiorna dal Play Store, ma su telefoni senza Play Store o mai aggiornati può essere vecchia. L'app usa moduli ES e import map, che richiedono **Chromium 89 o successivo** (2021).
- In `index.html` uno script minimo, non a modulo, controlla `HTMLScriptElement.supports?.('importmap')`. Se manca il supporto mostra "Aggiorna Android System WebView dal Play Store" invece di una pagina bianca.
- `targetSdkVersion` quello richiesto dalla versione di Capacitor (oggi 36). Non conta per gli APK fuori dal Play Store, ma Android avvisa all'installazione se è troppo vecchio.

### Dati sul telefono
- **IndexedDB** nella WebView, attraverso un unico modulo `www/assets/js/store.js`. Le viste non toccano mai IndexedDB direttamente.
- Al posto di `apiRequest('api/...')` i moduli chiamano funzioni del negozio dati: `store.addToWatchlist(movie)`, `store.saveViewing(...)` e così via. Non si imitano gli indirizzi PHP: essendo una repo separata conviene un'interfaccia pulita.
- All'avvio si chiede `navigator.storage.persist()`, così il sistema non cancella i dati per liberare spazio.
- **Attenzione:** IndexedDB, come i file interni dell'app, si cancella con la disinstallazione o con "Cancella dati". Il backup (§8) è l'unica protezione e l'app deve ricordarlo.
- Lo schema ha un numero di versione e migrazioni in `onupgradeneeded`, come le migrazioni SQL del sito.

### Servizi esterni
| Servizio | Uso | Chiave |
|---|---|---|
| `v2.sg.media-imdb.com/suggestion/...` | Ricerca: titolo, anno, tipo, locandina, attori principali | No |
| `www.omdbapi.com/?i=tt...&apikey=...` | Dettagli: trama, regista, attori, durata, genere, premi, voto IMDb, incassi, `totalSeasons` | Sì, personale |
| `www.omdbapi.com/?i=tt...&Season=N&apikey=...` | Episodi di una stagione (§7) | Sì, personale |
| `api.github.com/repos/dariotronic/mycimmena/releases/latest` | Controllo aggiornamenti | No |
| `feedback.php` su IONOS | Invio segnalazioni | No (limite per dispositivo) |

- OMDb si chiama **solo quando serve**: aggiunta di un film o apertura di una scheda senza dettagli. **Non** a ogni risultato di ricerca, come fa oggi `api/search.php` sul sito (che arricchisce fino a 8 risultati per ricerca). I dettagli scaricati restano sul telefono: ogni film costa una richiesta sola.
- L'endpoint IMDb non è ufficiale: se cambia o non risponde, la ricerca mostra un errore chiaro e l'app resta usabile.
- Locandine: miniatura `._V1_SX400` salvata nel Filesystem al momento dell'aggiunta, così si vedono anche offline.

---

## 3. Modello dati

Store IndexedDB (nomi indicativi):

- **`profile`** (record unico): `name`, `birthday` (facoltativa), risposte di flavour dell'onboarding (§4), `createdAt`.
- **`settings`** (record unico):
  - `detailMode`: `'light' | 'full'`, la scelta fatta dall'utente
  - `omdbKey`: chiave OMDb, o vuoto
  - `omdbKeyStatus`: `'missing' | 'valid' | 'invalid'`
  - `bannerSnoozedUntil`
  - `theme`
  - preferenze di watchlist e randomizer
- **`movies`**: catalogo dei titoli conosciuti, per id IMDb: `id`, `title`, `year`, `type` (`movie`/`series`), `posterUrl`, `posterLocal`, `stars` (da IMDb), `details` (oggetto OMDb o `null`), `detailsFetchedAt`.
  - Solo per le serie, **`seasons`**: la struttura delle stagioni (§7), o `null` se non è ancora nota.
- **`watchlist`**: `movieId`, `addedAt`, `hype` (0–5, oppure `null` se non votato), `note`, `source` (`'app' | 'letterboxd' | 'imdb'`).
- **`viewings`** (il diario, sostituisce archivio e recensioni):
  - `id`, `movieId`, `date`
  - `place` e `withWhom`, facoltativi
  - `rating`: 1–20, cioè mezze spipe da ½ a 10, facoltativo
  - `notes`: HTML filtrato dall'editor delle recensioni
  - Solo per le serie: `episodes` (elenco di `{ s, e }` visti in quella sessione) e `scope` (`'episodes' | 'season' | 'series'`, cioè a cosa si riferisce il voto; §7)
  - `createdAt`, `updatedAt`
  - Un film può avere più visioni (rivisto).
- **`series`**: avanzamento delle serie, per `movieId`: `status` (`'watching' | 'paused' | 'finished' | 'dropped'`), `round` (1 al primo giro, 2 se la si riguarda…), `startedAt`, `updatedAt`. Gli episodi visti si ricavano dalle `viewings` del giro corrente, così non ci sono due copie da tenere allineate.
- **`planned`** (record unico, facoltativo): la prossima serata in programma, con `date`, `place` e `movieIds` ordinati. È l'erede dell'"appuntamento".
- **`meta`**: `schemaVersion`, `lastBackupAt`, `feedbackSentAt[]`, `updateCheck` (§10: `lastAt`, `etag`, `latest`, `rateLimitResetAt`, `dismissedVersion`, `dismissedUntil`).

---

## 4. Onboarding (primo avvio)

Ogni passaggio ha "Indietro". Alla fine niente è definitivo: tutto si cambia dalle Impostazioni.

1. **Benvenuto:** logo, una riga su cos'è myCimmena, pulsante "Iniziamo".
2. **Chi sei:** nome (con cui l'app ti saluta), data di nascita facoltativa ("per farti gli auguri").
3. **Due chiacchiere** (facoltativo, "Salta" sempre visibile): le domande di flavour scelte da §18.
4. **Quanto dettagliate vuoi le schede?** Due schede di esempio dello **stesso film vero**, una accanto all'altra:
   - **Light:** locandina, titolo, anno, tipo, attori principali. "Funziona subito, non serve nient'altro."
   - **Completa:** in più trama, regista, cast, durata, genere, voto IMDb, premi, episodi delle serie. "Serve una chiave gratuita di OMDb: ti registri solo con la mail, senza altri dati personali, e ci vogliono 2–3 minuti."
5. **Conferma:** riepilogo della scelta con i pro e i contro dei due piani affiancati. "Confermo Light" oppure "Confermo Completa", più "Torna al confronto".
6. **Solo se ha scelto Completa: attivazione della chiave.**
   1. Spiegazione breve: cos'è OMDb, che la chiave è gratuita e personale e che arriva per email (con Hotmail/Outlook può tardare fino a un'ora).
   2. "Apri la pagina di registrazione": apre `https://www.omdbapi.com/apikey.aspx` nel browser interno. L'utente sceglie FREE, scrive la mail e preme "Generate API Key". L'app **non** compila il modulo al suo posto.
   3. "Controlla la tua mail": la chiave arriva per email, insieme a un eventuale link di attivazione da cliccare.
   4. "Incolla la chiave": quando l'app torna in primo piano, se negli appunti c'è un testo che sembra una chiave (8 caratteri esadecimali, da verificare) propone "Usare questa?". C'è anche il campo per incollarla a mano.
   5. **Verifica immediata** con una richiesta di prova a OMDb:
      - ok → "Funziona ✓"
      - chiave rifiutata → "Chiave non valida o non ancora attivata: hai cliccato il link nella mail?"
      - rete assente → riprova
   6. "La inserisco più tardi" è sempre disponibile e porta alla modalità completa **in attesa** (§5).
7. **Il backup:** una schermata spiega che i dati vivono solo su questo telefono e dove trovare "Esporta backup".
8. **Hai già una watchlist altrove?** Si possono portare in myCimmena i film da vedere salvati su Letterboxd o IMDb. Due schede, una per servizio, con i passaggi per scaricare il file (dettagli in §9):
   - **Letterboxd:** dal sito (non dall'app), Impostazioni → Data → "Export your data". Si scarica un file `.zip`: myCimmena lo legge così com'è, non serve estrarlo.
   - **IMDb:** dal sito, apri la tua Watchlist → menu "⋯" → "Export". Il file si prepara nella pagina "Your exports", da cui si scarica il `.csv`.
   - Pulsanti: **"Ho il file, importa"** (apre il selettore e poi il riepilogo di §9) e **"Più tardi"**, con la nota "Lo trovi sempre in Impostazioni → Importa watchlist".
   - Se l'utente ha scelto Light, una riga avverte che con Letterboxd l'abbinamento dei titoli è un po' meno preciso (§9).
9. **Fine:** "Ciao, {nome}!" e si entra nella Watchlist (vuota, con un invito a cercare il primo film, oppure con i film importati).

Se l'app viene chiusa a metà, al riavvio riparte dal passaggio raggiunto.

---

## 5. Modalità light, completa e in attesa

| Stato | Condizione | Comportamento |
|---|---|---|
| **Light** | `detailMode = 'light'` | Schede con i dati di IMDb. Nessun banner. Nelle Impostazioni c'è "Passa alla versione completa". |
| **Completa** | `detailMode = 'full'` e chiave valida | Dettagli OMDb all'aggiunta e all'apertura delle schede. |
| **In attesa** | `detailMode = 'full'` e chiave mancante o non valida | Funziona come Light, più un **banner** sottile sempre visibile: "Versione completa in attesa: tocca per inserire la chiave". Il tocco apre il passaggio 6.4 dell'onboarding. Con "Più tardi" il banner sparisce per 24 ore. |

- **Completamento dei film già salvati:** quando una chiave diventa valida, l'app scarica in sottofondo i dettagli dei film che non li hanno ancora, pochi alla volta (per esempio uno ogni secondo, al massimo 100 per sessione), con un indicatore discreto "Completamento schede: 12/40". Vale anche dopo un'importazione (§9).
- **Chiave che smette di funzionare** (revocata, limite superato): con il limite giornaliero superato si mostra un toast e si riprova il giorno dopo; con la chiave rifiutata si torna "in attesa" con il banner.
- Il voto IMDb e gli altri dettagli si mostrano solo se presenti: la scheda non mostra mai campi vuoti.

---

## 6. Funzionalità rispetto al sito

### Si tengono (adattate)
- **Watchlist:** ricerca, aggiunta, rimozione con Annulla, ordinamento, filtri (tipo), vista a lista o a cards.
- **Hypometro:** diventa personale ("quanta voglia ho di vederlo", 😶→🔥). Si può ordinare per hype e il randomizer lo usa come peso. Senza totali 🍿·👥.
- **Randomizer:** estrazione pesata, filtri, rullo di locandine, suoni.
- **Scheda film:** locandina ingrandibile, dati light o completi, più la sezione **"I miei voti"** (sotto).
- **Tema** giorno/notte (nella variante "my", §13), toast, sagoma di caricamento, accessibilità.
- **Condivisione** dell'immagine della serata in programma e file `.ics`.
- **Editor** di testo delle recensioni, riusato per le note del diario.
- **Voto in spipe**, con i gatti calico.

### "I miei voti" nella scheda
- Compare solo se il titolo ha almeno una visione nel diario.
- In cima, se le visioni con voto sono più di una, la media e il numero di visioni: "Media 7 spipe e ½ · 3 visioni".
- Sotto, ogni visione, dalla più recente: data ("sabato 14 marzo 2026"), voto in gatti e in parole ("7 spipe su 10", oppure "senza voto"), luogo e con chi se ci sono, e l'inizio delle note con "Leggi tutto".
- Toccando una visione si apre il diario su quella voce per modificarla o eliminarla.
- Alla fine della sezione c'è "Segna come visto di nuovo".
- Per le serie la sezione è raggruppata per stagione (§7).

### Si trasformano
- **Archivio + Recensioni → Diario:** "Segna come visto" dalla watchlist o dalla scheda (data, luogo e con chi facoltativi, voto, note). La lista è per data, con ricerca per titolo. Un film rivisto ha più voci.
- **Appuntamento / Calendario → Serata in programma:** facoltativa, con data, luogo e film. Quando passa, l'app propone "Com'è andata?" per registrare le visioni nel diario.
- **Home:** la serata in programma se c'è, altrimenti un riepilogo (serie in corso con il prossimo episodio, ultimi visti, prossimo dalla watchlist, eventuale compleanno 🎂).
- **Profilo → Impostazioni:**
  - nome e altri dati dell'onboarding
  - modalità light o completa e chiave OMDb
  - tema
  - backup ed esportazione/importazione
  - importazione della watchlist da Letterboxd o IMDb
  - notifiche
  - segnalazioni
  - versione dell'app, "Controlla aggiornamenti"
  - Informazioni (§14)
  - in fondo, il credit (§14)

### Si tolgono
- Login, account, gestione utenti, inviti, link per la password
- Reaction e risposte alle recensioni
- Notifiche push (VAPID, `sw.js` per le push)
- "Aggiunto da", filtro per membro, 💫 "hanno recensito tutti", medie tra membri
- Service worker per l'offline: nell'APK i file sono già locali (da verificare se serve ancora per la cache delle locandine, ma col Filesystem non dovrebbe)

### Si aggiungono
- Onboarding (§4) e modalità di dettaglio (§5)
- Serie TV (§7)
- Backup (§8) e importazione della watchlist (§9)
- Aggiornamenti (§10)
- Segnalazioni (§11)
- Notifiche locali (§12)
- Pagina Informazioni e credit (§14)
- *Fase 5:* statistiche personali (film per anno/mese, voto medio, generi e registi più visti) e importazione di diario e voti da Letterboxd o IMDb

---

## 7. Serie TV

Le serie si guardano in più giorni: l'app tiene il segno dell'episodio a cui si è arrivati e permette di registrare le visioni un po' alla volta.

### Struttura delle stagioni
Per sapere quanti episodi mancano serve la struttura: quante stagioni e quanti episodi in ognuna. Si salva in `movies.seasons`:

```
seasons: {
  source: 'omdb' | 'custom' | 'mixed',
  list: [ { n: 1, episodes: 10, titles: ['Pilot', …] | null, source: 'omdb' }, … ],
  updatedAt
}
```

- **Modalità completa:** quando l'utente apre la sezione "Episodi" di una serie (o la segna come iniziata), l'app legge `totalSeasons` dai dettagli già scaricati e chiede a OMDb le stagioni una alla volta (`&Season=N`), **solo quando servono**: prima la stagione 1 e quella in corso, le altre quando si aprono. Ogni stagione costa una richiesta e poi resta sul telefono.
- **Modalità light:** la struttura si inserisce a mano (sotto). I titoli degli episodi non ci sono, si vedono solo i numeri.
- **Struttura personalizzata:** a volte OMDb conosce solo una parte della serie (per esempio una sola stagione, quando le stagioni sono quasi dieci). Nella sezione "Episodi" c'è sempre **"La struttura non è giusta?"**, che apre un piccolo editor:
  - "Numero di stagioni": un campo numerico.
  - "Episodi per stagione": un valore unico per tutte, già compilato con quello della stagione nota se c'è.
  - Sotto, l'elenco delle stagioni con il numero di episodi di ognuna, modificabile una per una (per le stagioni più corte o più lunghe).
  - Le stagioni trovate su OMDb restano con i loro titoli degli episodi; quelle aggiunte a mano sono segnate "inserita da te" e hanno solo i numeri. In questo caso `source` diventa `'mixed'`.
  - "Ripristina da OMDb" riporta la struttura a quella del servizio.
- Se una struttura personalizzata ha **meno** episodi di quelli già segnati come visti, l'app avvisa prima di salvare ("3 episodi visti non esisterebbero più: li togliamo dal diario?").
- Le stagioni nuove (serie ancora in corso) si aggiungono dall'editor; in modalità completa l'app riprova OMDb al massimo una volta alla settimana per le serie non finite.

### Avanzamento
- Nella scheda di una serie c'è la sezione **"Episodi"**: stagioni a fisarmonica, ognuna con la barra "6/10" e la griglia degli episodi (numero e titolo, se c'è). Gli episodi visti sono pieni.
- **Pulsante principale "Visto S2·E4"**: segna il prossimo episodio con la data di oggi. Toccandolo più volte nello stesso giorno gli episodi si aggiungono alla **stessa** sessione del diario ("Oggi: S2·E4–E6").
- Toccando un episodio della griglia lo si segna o si toglie il segno. Una pressione lunga su un episodio segna anche tutti i precedenti ("Segna fino a qui").
- "Segna la stagione come vista" per recuperare in fretta una stagione vista in passato, con la data da scegliere.
- Il primo episodio segnato porta la serie nello stato **In corso** e la toglie dalla watchlist (con Annulla). Si può mettere **In pausa** o **Abbandonata** a mano.
- Quando si segna l'ultimo episodio dell'ultima stagione nota: "Hai finito {serie}! Vuoi darle un voto?" → visione con `scope: 'series'`. Lo stato diventa **Finita**.
- **Riguardarla:** "Ricomincia da capo" apre un nuovo giro (`round` + 1); il giro precedente resta nel diario.
- In Home e in testa alla Watchlist, una fila **"Stai guardando"** con le serie in corso, la locandina, "S2·E4 · 18 episodi rimasti" e il pulsante per segnare il prossimo.

### Voti delle serie
- Ogni sessione nel diario può avere un voto facoltativo, che vale per gli episodi di quella sessione (`scope: 'episodes'`).
- Alla fine di una stagione l'app propone un voto alla stagione (`scope: 'season'`); alla fine della serie un voto complessivo (`scope: 'series'`). Si possono sempre saltare.
- In "I miei voti" le serie mostrano: il voto complessivo se c'è, poi una riga per stagione (voto della stagione o, se manca, la media delle sessioni), poi le sessioni per data.

### Diario
- Una sessione di serie appare nel diario come "Severance · S2·E4–E6" con data, voto e note.
- Sessioni dello stesso giorno sulla stessa serie si uniscono in una sola voce.

---

## 8. Backup

- **Esporta:** un file `mycimmena-backup-AAAA-MM-GG.json` con profilo, impostazioni (chiave OMDb compresa, avvisando l'utente), film, struttura delle serie, avanzamento, watchlist, diario, serata in programma e versione dello schema. Si salva in Documenti o si condivide (Drive, mail, Telegram…) con il menu di Android.
- **Importa:** sceglie un file e mostra un riepilogo ("120 film, 45 visioni, salvato il …"). L'utente sceglie tra **sostituire** tutto o **unire**: nell'unione vince la voce modificata più di recente. Le locandine non sono nel backup e si riscaricano.
- **Promemoria:** se non c'è un backup da 30 giorni e ci sono dati nuovi, un toast con "Esporta ora".
- Il backup è anche il modo per cambiare telefono.

---

## 9. Importazione della watchlist da Letterboxd e IMDb

Si raggiunge dall'onboarding (§4, passaggio 8) e da Impostazioni → "Importa watchlist". Importa **solo la watchlist**; diario e voti arrivano in Fase 5.

### Come ottenere il file (testi mostrati nell'app)
- **Letterboxd:**
  1. Apri letterboxd.com dal browser (l'esportazione non c'è nell'app di Letterboxd).
  2. Impostazioni → scheda **Data** → **Export your data**.
  3. Si scarica `letterboxd-<utente>-<data>.zip`. Puoi darlo a myCimmena così com'è: l'app usa solo `watchlist.csv` (colonne `Date`, `Name`, `Year`, `Letterboxd URI`).
- **IMDb:**
  1. Apri imdb.com e la tua **Watchlist**.
  2. Menu **⋯** → **Export**.
  3. Apri la pagina **Your exports** (imdb.com/exports) e, quando l'esportazione è pronta, scarica il `.csv` (colonne `Const`, `Title`, `Title Type`, `Year`, `Created`, …).
- Le voci dei menu dei due siti vanno ricontrollate quando si implementa: se cambiano, si aggiornano i testi.

### Come funziona
- Il selettore accetta `.zip` e `.csv`. Lo zip si apre nell'app con una piccola libreria (per esempio `fflate`, copiata in `www/assets/js/vendor/`, senza bundler).
- L'app riconosce il formato dalle intestazioni delle colonne, non dal nome del file.
- **IMDb:** ogni riga ha già l'id (`tt…`): l'abbinamento è esatto. Titolo, anno e tipo vengono dal CSV, la locandina dalla ricerca IMDb, i dettagli da OMDb in sottofondo se la chiave c'è (§5).
- **Letterboxd:** il CSV non ha l'id IMDb. L'app cerca ogni titolo con l'endpoint di suggerimenti di IMDb e tiene il risultato con titolo e anno uguali (anno ±1 di tolleranza). Le ricerche vanno piano (per esempio una ogni mezzo secondo) con l'indicatore "Abbinamento 34/120".
- **Riepilogo prima di salvare:** "118 trovati, 2 da controllare, 5 già nella tua watchlist". I titoli dubbi (più risultati o nessuno) si sistemano uno per uno scegliendo tra i candidati, oppure si saltano.
- La data di aggiunta originale diventa `addedAt`; l'hype resta vuoto. I doppioni non si importano due volte.
- L'importazione si può interrompere: quello già abbinato resta e si può riprendere.

---

## 10. Aggiornamenti

- La versione sta in `package.json` e in `android/app/build.gradle` (`versionName` 1.2.0, `versionCode` intero crescente). Un piccolo script le tiene allineate.
- **Pubblicare:**
  1. Compilare l'APK firmato.
  2. Creare su GitHub una Release con tag `v1.2.0`, APK allegato (`mycimmena-1.2.0.apk`) e note in italiano.

### Quando si controlla
- A **ogni apertura** dell'app (avvio a freddo), se c'è connessione.
- **Ogni ora** finché l'app resta aperta, e al ritorno in primo piano se l'ultimo controllo ha più di un'ora.
- **"Controlla aggiornamenti"** nelle Impostazioni, a richiesta dell'utente.

### Restare nei limiti di GitHub
GitHub concede 60 richieste l'ora **per indirizzo IP** senza login, e il conto è condiviso con tutto quello che passa dalla stessa rete. Un controllo all'ora più uno per apertura ne usa pochi, ma l'app si protegge comunque:
- Ogni richiesta manda l'**ETag** dell'ultima risposta (`If-None-Match`). Se non c'è una release nuova GitHub risponde `304`, che non consuma il limite.
- L'app legge `X-RateLimit-Remaining` e `X-RateLimit-Reset` e li salva in `meta.updateCheck`. I controlli automatici si fermano quando ne restano meno di 5 e ripartono dopo l'ora indicata da GitHub.
- Il pulsante manuale funziona sempre, salvo due casi:
  - Se è stato premuto meno di 30 secondi prima, risponde con l'esito dell'ultimo controllo invece di rifare la richiesta.
  - Se GitHub ha esaurito il limite (risposta `403`/`429`), mostra "GitHub ha ricevuto troppe richieste da questa rete: riprova dopo le 15:40", con l'ora presa da `X-RateLimit-Reset`.
- Gli esiti del pulsante manuale si mostrano sempre: "Hai già l'ultima versione (1.2.0)", "Sei offline", l'errore di limite. Quelli dei controlli automatici sono silenziosi.

### Cosa vede l'utente
- Se il tag è più nuovo della versione installata, un avviso "È disponibile myCimmena 1.2.0" con le note della release e i pulsanti **Aggiorna** e **Più tardi**.
- Con **Più tardi**, l'avviso per **quella** versione non riappare per 24 ore anche se i controlli orari la ritrovano. Nel frattempo resta un pallino su Impostazioni e la riga "Aggiornamento disponibile" accanto alla versione.

### Installazione
- **v1:** "Aggiorna" apre il link dell'APK nel browser di sistema, che lo scarica; l'utente lo apre dalla notifica.
- **v2:** download dentro l'app (Filesystem) e apertura dell'installer. Richiede il permesso `REQUEST_INSTALL_PACKAGES` e un FileProvider. Android chiede una sola volta di consentire a myCimmena di "installare app sconosciute".

### Firma
- Tutti gli APK vanno firmati con **la stessa chiave** (`mycimmena-release.jks`). Se la chiave si perde, gli aggiornamenti non si installano più sopra la versione vecchia: bisogna disinstallare e si perdono i dati senza backup.
- La chiave e le password **non** vanno nella repo. Copie di sicurezza in almeno due posti; se si usa GitHub Actions, la chiave va nei Secrets.
- La repo è **pubblica**, così le Release si scaricano senza login.

---

## 11. Segnalazioni

- **Sezione nelle Impostazioni:** "Segnala un problema o proponi un'idea".
  - Tipo: Bug / Idea / Altro.
  - Testo obbligatorio (massimo 5000 caratteri).
  - Email per la risposta facoltativa.
  - Fino a 3 immagini facoltative: l'app le riduce a 1600 px sul lato lungo, in JPEG, prima dell'invio.
- **Informazioni tecniche** allegate con una casella attiva di default e "Vedi cosa viene inviato": versione dell'app, versione di Android e della WebView, modello del telefono, modalità light o completa. Mai la chiave OMDb né i dati del diario.
- **Invio** con `POST multipart` a `server/feedback.php` su IONOS (§18 per il dominio), con `CapacitorHttp`.
- **Server:**
  - **Controlli:** dimensioni (testo, numero e peso delle immagini, solo JPEG/PNG/WebP verificati dal contenuto), campo trappola nascosto contro i bot, limite di 5 invii al giorno per IP (file su disco con hash dell'IP, come `admin_auth_attempts` del sito).
  - **Invio della mail** a Dario con gli allegati, tramite SMTP IONOS (PHPMailer) o `mail()`. L'indirizzo di destinazione sta in un `config.php` non versionato e non raggiungibile dal web.
  - Risponde in JSON. **Non** salva copie delle segnalazioni né le immagini dopo l'invio.
- Senza connessione: "Sei offline, riprova quando torna la connessione". Il testo resta nel modulo.

---

## 12. Notifiche locali

- **Compleanno:** se l'utente ha dato la data di nascita, alle 9:00 del giorno arriva una notifica di auguri e la Home mostra un messaggio speciale (🎂, magari un film estratto dalla watchlist "per festeggiare").
- **Serata in programma:** promemoria la mattina del giorno.
- Android 13+ chiede il permesso per le notifiche: lo si chiede al primo momento in cui serve (data di nascita inserita o serata salvata), non all'avvio.
- Si attivano e disattivano dalle Impostazioni.

---

## 13. Temi

Una variante "my" dei temi del Club: stessa struttura di variabili CSS di `style.css` del sito (`--paper`, `--ink`, `--rust`, …), stessi caratteri (Montserrat e Spectral), stessi gatti. Cambia la tavolozza, per riconoscere l'app senza perdere la parentela: il Club è terracotta e albicocca, myCimmena è **velluto rosso da sala e popcorn**.

| Variabile | Club giorno | **my giorno** | Club notte | **my notte** |
|---|---|---|---|---|
| `--paper` (sfondo) | `#fbf4ec` | `#f8f2ef` | `#171512` | `#141114` |
| `--ink` (testo) | `#422007` | `#2b1419` | `#f2e9dd` | `#f3e8e6` |
| `--clay` (secondario) | `#9c7151` | `#94696f` | `#c6a281` | `#c9a1a6` |
| `--rust` (accento scuro, icone) | `#7b3c10` | `#8a1f2d` | `#f3ab6d` | `#f29a8e` |
| `--apricot` (accento chiaro) | `#ee9e59` | `#eaa83f` | `#edaa68` | `#f0b64f` |
| `--muted` | `#795f4d` | `#77595f` | `#b8aa99` | `#b9a5a9` |
| `--surface` | `#ffffff` | `#ffffff` | `#24211d` | `#221c21` |
| `--surface-strong` | `#ffffff` | `#ffffff` | `#302b24` | `#2e262c` |
| `--error-color` | `#9a2516` | `#a3301a` | `#ff9a8f` | `#ffa38a` |
| `--loader-fill` | `#612329` | `#6b1824` | `#9d514e` | `#a3474f` |
| `--loader-accent` | `#eb6b3e` | `#eaa83f` | `#ef9a68` | `#f0b64f` |

- Le trasparenze (`--line`, `--accent-wash`, `--rust-wash`, ombre…) si ricavano dai nuovi colori con le stesse opacità del sito.
- `--error-color` si sposta verso l'arancio per non confondersi con il rosso dell'accento.
- Prima di fissare i valori: prova a schermo su un telefono vero e controllo del contrasto (almeno 4.5:1 per testo e icone su `--paper` e `--surface`).
- Colore della barra di stato e dello splash di Android uguali a `--paper` del tema attivo.
- **Icona:** la stessa del Club ricolorata con la nuova tavolozza, oppure una variante con "my" (§18).

---

## 14. Informazioni e credit

### Pagina "Informazioni" (dalle Impostazioni)
- Versione dell'app e link alla repo GitHub e alle note di rilascio.
- **Fonti dei dati:**
  - Ricerca e locandine: IMDb, attraverso un indirizzo pubblico non ufficiale. myCimmena non è collegata a IMDb.
  - Dettagli: OMDb API (omdbapi.com), con la chiave personale dell'utente; i dati OMDb sono sotto licenza CC BY-NC 4.0.
  - Aggiornamenti: GitHub.
- **Privacy:**
  - Tutti i dati restano sul telefono; non ci sono account né server con i dati personali.
  - L'app contatta solo IMDb, OMDb e GitHub, e il server delle segnalazioni quando l'utente ne invia una.
  - Cosa contiene una segnalazione (§11), e che non viene conservata dopo l'invio della mail.
  - Nessuna pubblicità, nessuna statistica d'uso.
- Licenze dei componenti usati (Capacitor, caratteri, `fflate`…).

### Credit
In fondo alle Impostazioni, piccolo e centrato, sotto tutto il resto:

> made with 🎬 by **@dariotronic**

"@dariotronic" è un link a `https://www.instagram.com/dariotronic/`, aperto con il browser di sistema (o nell'app di Instagram, se Android la propone).

---

## 15. Struttura della repo

```
mycimmena/
├── PIANO.md                 questo file
├── README.md                cos'è, come si compila, come si pubblica una release
├── ORIGINE.md               commit del sito da cui è partita la copia, correzioni riportate
├── package.json             Capacitor e plugin, script (sync, build, test)
├── capacitor.config.json    appId it.mycimmena.app, appName myCimmena, webDir www
├── www/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── assets/              js/ (con vendor/), fonts/, logo, icone
├── android/                 generato da Capacitor e versionato (manifest, icone, firma)
├── server/
│   └── feedback.php         da caricare su IONOS (§11)
├── tests/                   node --test, come nel sito
└── .github/workflows/       (facoltativo) build dell'APK su tag
```

`ORIGINE.md` annota da quale commit di `CLUBDELCIMMENA` è stato copiato il frontend (oggi `48eb2c4`), così quando sul sito si corregge qualcosa si sa se vale anche qui.

Repo remota: `https://github.com/dariotronic/mycimmena` (da creare su GitHub come pubblica e collegare con `git remote add origin`; oggi la cartella locale non ha ancora un remote né commit).

---

## 16. Strumenti per compilare (Windows)

- Node.js LTS, Android Studio (con SDK e JDK inclusi), un telefono in modalità sviluppatore o un emulatore.
- Comandi tipici: `npm install`, `npx cap sync android`, `npx cap open android` (oppure `cd android && gradlew assembleRelease`).
- Prova veloce senza APK: aprire `www/` con un server locale nel browser (le funzioni native hanno sostituti semplici sul web, dove possibile).
- Per la prova su Android 7 basta un emulatore con API 24 e una WebView aggiornata.

---

## 17. Fasi

**Fase 0: base**
- [ ] Creare la repo `dariotronic/mycimmena` su GitHub e collegarla
- [ ] Copiare il frontend da `CLUBDELCIMMENA@48eb2c4` in `www/`, scrivere `ORIGINE.md`
- [ ] `index.php` → `index.html` statico, con il controllo della WebView
- [ ] Togliere login, push, reaction, risposte, gestione utenti
- [ ] Inizializzare Capacitor (`it.mycimmena.app`, minSdk 24) e il progetto Android; primo APK di debug che si apre
- [ ] Temi "my" giorno e notte

**Fase 1: dati locali**
- [ ] `store.js` con IndexedDB e le migrazioni
- [ ] Watchlist, hype, randomizer sul negozio locale
- [ ] Ricerca IMDb con `CapacitorHttp`, modalità light
- [ ] Diario ("Segna come visto", voto, note), "I miei voti" nella scheda, serata in programma
- [ ] Locandine salvate nel Filesystem

**Fase 2: onboarding, OMDb e serie**
- [ ] Schermate dell'onboarding (§4) con ripresa dal punto lasciato
- [ ] Chiave OMDb: browser interno, appunti, verifica
- [ ] Stati light, completa e in attesa con il banner; completamento in sottofondo
- [ ] Serie TV: struttura da OMDb e personalizzata, avanzamento, "Stai guardando", voti per sessione, stagione e serie
- [ ] Impostazioni, pagina Informazioni e credit

**Fase 3: backup, importazione e distribuzione**
- [ ] Esportazione e importazione del backup (sostituisci/unisci), promemoria
- [ ] Importazione della watchlist da Letterboxd (zip/csv) e IMDb (csv), con abbinamento e riepilogo
- [ ] Chiave di firma, APK di release, prima Release GitHub
- [ ] Controllo aggiornamenti all'apertura, ogni ora e manuale, con ETag e limiti (v1: apertura nel browser)

**Fase 4: segnalazioni e notifiche**
- [ ] `server/feedback.php` e deploy su IONOS
- [ ] Modulo nell'app con immagini ridotte e informazioni tecniche
- [ ] Notifiche locali: compleanno e serata

**Fase 5: extra**
- [ ] Statistiche
- [ ] Importazione di diario e voti da Letterboxd o IMDb
- [ ] Aggiornamento dentro l'app (v2)
- [ ] Build automatica su GitHub Actions

---

## 18. Da decidere

### Domande di flavour dell'onboarding
Proposte; ne sceglierei 3 o 4, tutte saltabili, sulla stessa schermata. Le prime due servono anche a qualcosa, le altre solo a dare carattere all'app.

| Domanda | Risposte | A cosa serve |
|---|---|---|
| **Il tuo film del cuore?** | Ricerca IMDb, un titolo | Locandina in Impostazioni accanto al nome; il giorno del compleanno la Home lo propone "da riguardare" |
| **Dove guardi i film di solito?** | Divano · Letto · Cinema · Computer · In giro col telefono | Precompila "Luogo" nel diario |
| **Con chi?** | Da solo · In coppia · Con gli amici · In famiglia · Dipende | Precompila "Con chi" nel diario |
| **Doppiato o sottotitoli?** | Doppiato · Sottotitoli · Lingua originale pura | Solo flavour: una frase nel saluto ("Ciao Dario, purista della lingua originale") |
| **Popcorn: dolci o salati?** | Dolci · Salati · Misti · Niente popcorn | Solo flavour: l'icona dell'hypometro al massimo cambia di conseguenza (🍿 o 🍬) |
| **Che spettatore sei?** | "Arrivo ai titoli di coda" · "Mi addormento al secondo tempo" · "Commento tutto" · "Guai a chi parla" | Solo flavour: compare sotto il nome in Impostazioni |
| **Il regista che non sbaglia mai?** | Testo libero | Solo flavour; in Fase 5 le statistiche lo confrontano con i registi più visti davvero |

Proposta: **film del cuore, dove, con chi, popcorn**.

### Altro
- **Icona:** logo del Club ricolorato con la tavolozza "my", oppure una variante con "my" ben visibile.
- **Dominio di `feedback.php`:** proposta `https://www.clubdelcimmena.it/mycimmena/feedback.php`, sullo stesso spazio IONOS del sito.
