# myCimmena

<img src="www/assets/favicon/web-app-manifest-512x512.png" alt="Icona di myCimmena: il rapace color carta su rosso velluto" width="96" align="right">

**Il tuo diario di film e serie, sul telefono.** Tieni la lista di quello che vuoi vedere, organizza la prossima serata, fatti scegliere il film dal randomizer e annota cosa hai visto, con voto e note. Tutto resta sul tuo telefono: niente account, niente pubblicità, nessun server con i tuoi dati.

myCimmena è un'app per Android, gratuita. Nasce dal sito del [Club del Cimmena](https://www.clubdelcimmena.it/).

**[⬇ Scarica l'ultima versione](https://github.com/dariotronic/mycimmena/releases/latest)** · [Come si installa](#installazione) · [Cosa fa](#cosa-fa)

## Cosa fa

**Watchlist**
- Cerchi un film o una serie e lo aggiungi con un tocco: locandina, anno e attori arrivano da IMDb.
- Con l'**Hypometro** dici quanta voglia hai di vederlo, da 😶 a 🔥: la lista si ordina e si filtra anche così.
- Vista a lista o a card (2 o 3 per riga), ricerca, ordinamento per data, titolo, anno o hype.
- Importi la watchlist che hai già su **Letterboxd** o **IMDb**, dal file che quei siti ti fanno scaricare.

**La prossima serata**
- Data, luogo e titoli in programma, direttamente in Home.
- La condividi come immagine (WhatsApp, Telegram…) e la aggiungi al calendario del telefono.
- Il giorno della serata ti arriva un promemoria; quando è passata, l'app ti chiede com'è andata e mette i titoli nel diario.

**Randomizer**
- Non sapete cosa guardare? Una slot machine estrae un titolo dalla watchlist, se vuoi pesando l'Hypometro (più voglia, più probabilità).
- Filtri per film o serie, scarta un titolo e rigira, guarda le probabilità di ciascuno.

**Diario**
- Ogni visione con data, dove e con chi, voto da mezza a dieci "spipe" e note con grassetto, corsivo, citazioni ed elenchi.
- Le visioni si leggono per intero con l'occhio 👁 e si modificano con la matita.
- **Statistiche**: quanti film e episodi, quante ore, i voti, anno per anno.
- Importi diario e voti da Letterboxd o IMDb.

**Serie TV**
- Un tocco su un episodio lo segna visto (o toglie il segno); tenendolo premuto segni anche quelli prima. La data è una sola, in cima: oggi, o il giorno che scegli.
- Voti la stagione e la serie con i gatti, direttamente nella scheda; una nota sulla serie raccoglie tutti i tuoi commenti, anche ai singoli episodi.
- Nel diario gli episodi visti lo stesso giorno stanno in una riga sola; con la matita cambi data, dove e con chi per tutti.
- In "Stai guardando" vedi a che punto sei e il prossimo episodio, con un tocco lo segni come visto.

**Schede light o complete**
- *Light*: funziona subito, con i dati di IMDb.
- *Completa*: trama, regista, cast, durata, genere, voto IMDb e premi, e le stagioni delle serie, da [OMDb](https://www.omdbapi.com/) con una chiave gratuita personale (ti registri solo con la mail, in 2–3 minuti; l'app ti guida).

**Tutto tuo**
- Profilo con il tuo film del cuore e il compleanno: quel giorno l'app ti fa gli auguri.
- Tema giorno e notte, e se vuoi i **colori dell'app presi dalla locandina del tuo film del cuore**.
- **Backup** in un file, da tenere dove vuoi: serve anche per cambiare telefono.
- Gli aggiornamenti li trovi e li installi dall'app stessa.

## Installazione

myCimmena non è sul Play Store: si installa scaricando il file dell'app (un APK) da questa pagina. Serve **Android 7 o più recente**.

1. **Sul telefono**, apri la pagina **[dell'ultima versione](https://github.com/dariotronic/mycimmena/releases/latest)** e tocca il file **`mycimmena-X.Y.Z.apk`** in fondo, sotto *Assets*.
2. Quando il download è finito, tocca la notifica o apri il file dai *Download*.
3. La prima volta Android ti chiede di **consentire l'installazione di app da questa origine** (il browser, per esempio Chrome): tocca *Impostazioni*, attiva *Consenti da questa origine* e torna indietro.
4. Tocca **Installa**. Se compare *Play Protect* (“App non riconosciuta”), tocca *Altri dettagli* → *Installa comunque*: succede con tutte le app che non arrivano dal Play Store.
5. Apri **myCimmena**: un breve benvenuto ti chiede nome, gusti e che schede preferisci. Tutto si può cambiare dopo dalle Impostazioni.

> Se l'app mostra “Serve un aggiornamento”, aggiorna **Android System WebView** (o Chrome) dal Play Store e riaprila.

### Aggiornamenti

All'apertura l'app controlla se c'è una versione nuova e ti avvisa con le novità. Tocca **Aggiorna**: la scarica e la installa da sola, senza perdere i dati. La prima volta Android ti chiede di consentire a myCimmena di installare app: l'avviso ti porta alla pagina giusta. Puoi controllare anche a mano da *Impostazioni → Versione*.

### Cambiare telefono (o non perdere niente)

I dati stanno **solo sul telefono**: se disinstalli l'app o ne cancelli i dati, si perdono. Per questo:

1. Sul telefono vecchio: *Impostazioni → Backup → Esporta o ripristina* e salva il file (in Documenti, oppure con *Condividi…* su Drive, in una mail, su Telegram).
2. Sul telefono nuovo installa myCimmena e, nella prima schermata, tocca **Ho un backup: ripristinalo** e scegli il file.

L'app ti ricorda di fare un backup se non ne fai uno da 30 giorni (si può spegnere).

### Privacy

- Watchlist, diario, voti, profilo e la tua chiave OMDb restano sul telefono. Non ci sono account né server con i tuoi dati.
- L'app si collega solo a IMDb (ricerca e locandine), a OMDb (schede complete, con la tua chiave) e a GitHub (aggiornamenti); al server delle segnalazioni solo quando ne mandi una.
- Nessuna pubblicità, nessuna statistica d'uso. Le notifiche (compleanno e serata) le programma il telefono.
- Il file di backup contiene anche la chiave OMDb: tienilo per te.

Hai un problema o un'idea? *Impostazioni → Segnalazioni*.

---

# Per chi sviluppa

È nata dal sito del [Club del Cimmena](https://www.clubdelcimmena.it/): vedi [ORIGINE.md](ORIGINE.md). Il piano completo è in [PIANO.md](PIANO.md).

## Struttura

- `www/`: l'app vera e propria (HTML, CSS e JavaScript senza bundler).
- `android/`: progetto Android generato da Capacitor.
- `tests/`: test con `node --test`.
- `tools/serve.js`: server locale per provare `www/` nel browser.
- `tools/version.js`: cambia la versione in tutti i file (`npm run set-version -- 1.2.0`).
- `tools/release.js`: controlla la firma dell'APK di release e lo copia in `dist/`.
- `server/`: `feedback.php` per le segnalazioni (vedi sotto).
- `tools/icons.js`: rigenera icona, schermate di avvio e favicon dal logo di myCimmena (`www/assets/logo-my.svg`, serve Chrome).
- `tools/copy-server.js`: copia `server/` nella repo del sito (`--check` per confrontare).

## Cosa serve

- Node.js LTS
- Android SDK con le platform-tools (quello installato da Android Studio va bene)
- JDK 21: quello incluso in Android Studio, oppure un JDK 21 qualsiasi (per esempio Eclipse Temurin)

## Comandi

```sh
npm install          # dipendenze
npm test             # test
npm run serve        # prova nel browser su http://localhost:8080 (senza funzioni native)
npm run sync         # copia www/ nel progetto Android
npm run open         # apre il progetto in Android Studio
```

APK di debug da riga di comando (PowerShell), indicando il JDK se non è già in `JAVA_HOME`:

```powershell
$env:JAVA_HOME = "$env:LOCALAPPDATA\Programs\temurin-21\jdk-21.0.13.1+2"
npm run apk:debug
```

L'APK esce in `android/app/build/outputs/apk/debug/app-debug.apk`. Per installarlo su un telefono collegato con il debug USB attivo:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r android\app\build\outputs\apk\debug\app-debug.apk
```

### APK di prova senza Android Studio

Il workflow `debug-apk.yml` compila l'APK di debug a ogni push (o a mano, scheda Actions → APK di prova → Run workflow) e lo lascia come artifact per 14 giorni. Sul PC bastano [gh](https://cli.github.com/) (con `gh auth login`) e le platform-tools di Android per `adb`:

```powershell
gh run download --name mycimmena-dev --dir dist\dev
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r dist\dev\app-debug.apk
```

Gli APK di debug si firmano con la chiave fissa `android/app/debug.p12` (password e alias predefiniti di Android), che sta nella repo apposta: quelli compilati su Actions e quelli compilati in locale si installano uno sopra l'altro senza perdere i dati.

La versione di debug si chiama **myCimmena dev** e ha un id diverso (`it.mycimmena.app.debug`): si installa accanto a quella delle Release, con dati separati. Solo la versione di debug si può ispezionare da `chrome://inspect`.

## Versione

La versione sta in quattro posti che devono coincidere: `package.json` e `package-lock.json` (`version`), `www/assets/js/app-info.js` (`APP_VERSION`, quella che l'app confronta con le Release) e `android/app/build.gradle` (`versionName`, più `versionCode` = major·10000 + minor·100 + patch). Si cambiano tutti insieme:

```sh
npm run set-version -- 1.2.0
```

`npm test` controlla che siano allineate.

## Segnalazioni (server)

L'app manda le segnalazioni a `https://www.clubdelcimmena.it/mycimmena/feedback.php`, che le inoltra per mail con `mail()` di PHP.

- L'originale è `server/feedback.php` (più `server/.htaccess`). Dopo una modifica: `node tools/copy-server.js`, poi commit e push della repo `CLUBDELCIMMENA`, il cui deploy automatico carica `mycimmena/` su IONOS.
- L'indirizzo che riceve le segnalazioni è il Secret `MYCIMMENA_FEEDBACK_TO` della repo `CLUBDELCIMMENA` (Settings → Secrets and variables → Actions); il deploy lo scrive in `mycimmena/config.php` sul server. Facoltativo `MYCIMMENA_FEEDBACK_FROM` per il mittente (predefinito `noreply@clubdelcimmena.it`).
- `npm test` prova `feedback.php` con il server integrato di PHP se trova `php` (nel PATH, in `PHP_BIN` o in `C:\xampp\php`); altrimenti quel test si salta.

## Firma

Gli APK di release si firmano sempre con **la stessa chiave**: se si perde, gli aggiornamenti non si installano più sopra la versione vecchia (bisogna disinstallare, e senza backup si perdono i dati).

- La chiave e le password stanno **fuori dalla repo**, in `%USERPROFILE%\.mycimmena\`: `mycimmena-release.jks` e `keystore.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`). Per usare un altro percorso: variabile d'ambiente `MYCIMMENA_SIGNING` con il percorso del file `.properties`.
- Di quella cartella vanno tenute **almeno due copie** fuori dal PC (per esempio una chiavetta e un gestore di password o un cloud cifrato).
- Impronta SHA-256 del certificato: `ad2a03a1d2338cbf6e694a226625f6f1e92132e93e4fd978dc3d59d35b7b75f9` (CN=myCimmena).

## Pubblicare una release

### Con GitHub Actions (consigliato)

1. `npm run set-version -- X.Y.Z` e `npm test`.
2. Scrivi le note in `release-notes/X.Y.Z.md` (in italiano: l'app le mostra nell'avviso di aggiornamento).
3. Commit e push, poi il tag: `git tag vX.Y.Z` e `git push origin vX.Y.Z`.
4. Il workflow `release.yml` esegue i test, compila e firma l'APK e pubblica la Release con l'allegato.

Servono due Secrets nella repo myCimmena (Settings → Secrets and variables → Actions):
- `MYCIMMENA_KEYSTORE_BASE64`: il file `mycimmena-release.jks` in base64 (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.mycimmena\mycimmena-release.jks"))`);
- `MYCIMMENA_KEYSTORE_PASSWORD`: la password che sta in `keystore.properties`.

Per provare i Secrets senza pubblicare: scheda Actions → Release → Run workflow (compila e firma la versione di `package.json`, poi si ferma).

Senza i Secrets il workflow non compila (lo dice con un avviso, senza segnare errore) e si pubblica da PC, come sotto.

### Da PC

1. `npm run set-version -- X.Y.Z`, `npm test`, commit.
2. APK firmato:
   ```powershell
   $env:JAVA_HOME = "$env:LOCALAPPDATA\Programs\temurin-21\jdk-21.0.13.1+2"
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   npm run apk:release
   ```
   Controlla la firma e lascia l'APK in `dist/mycimmena-X.Y.Z.apk`.
3. Su GitHub, nuova Release con tag `vX.Y.Z` sul commit, titolo `myCimmena X.Y.Z`, note in italiano (l'app le mostra nell'avviso di aggiornamento) e l'APK allegato. Il nome dell'allegato deve finire con `.apk`.

L'app controlla `releases/latest` all'apertura, ogni ora e con "Controlla aggiornamenti" nelle Impostazioni: le Release segnate come pre-release o bozza non contano.
