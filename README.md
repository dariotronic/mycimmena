# myCimmena

App Android personale per tenere traccia di film e serie visti e da vedere. I dati restano sul telefono: niente account, niente server con i dati personali. Si installa come APK dalle [Release](https://github.com/dariotronic/mycimmena/releases).

È nata dal sito del [Club del Cimmena](https://www.clubdelcimmena.it/): vedi [ORIGINE.md](ORIGINE.md). Il piano completo è in [PIANO.md](PIANO.md).

## Struttura

- `www/`: l'app vera e propria (HTML, CSS e JavaScript senza bundler).
- `android/`: progetto Android generato da Capacitor.
- `tests/`: test con `node --test`.
- `tools/serve.js`: server locale per provare `www/` nel browser.
- `tools/version.js`: cambia la versione in tutti i file (`npm run set-version -- 1.2.0`).
- `tools/release.js`: controlla la firma dell'APK di release e lo copia in `dist/`.
- `server/`: `feedback.php` per le segnalazioni (vedi sotto).
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
