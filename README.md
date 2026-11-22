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

## Firma

Gli APK di release si firmano sempre con **la stessa chiave**: se si perde, gli aggiornamenti non si installano più sopra la versione vecchia (bisogna disinstallare, e senza backup si perdono i dati).

- La chiave e le password stanno **fuori dalla repo**, in `%USERPROFILE%\.mycimmena\`: `mycimmena-release.jks` e `keystore.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`). Per usare un altro percorso: variabile d'ambiente `MYCIMMENA_SIGNING` con il percorso del file `.properties`.
- Di quella cartella vanno tenute **almeno due copie** fuori dal PC (per esempio una chiavetta e un gestore di password o un cloud cifrato).
- Impronta SHA-256 del certificato: `ad2a03a1d2338cbf6e694a226625f6f1e92132e93e4fd978dc3d59d35b7b75f9` (CN=myCimmena).

## Pubblicare una release

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
