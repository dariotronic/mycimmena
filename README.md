# myCimmena

App Android personale per tenere traccia di film e serie visti e da vedere. I dati restano sul telefono: niente account, niente server con i dati personali. Si installa come APK dalle [Release](https://github.com/dariotronic/mycimmena/releases).

È nata dal sito del [Club del Cimmena](https://www.clubdelcimmena.it/): vedi [ORIGINE.md](ORIGINE.md). Il piano completo è in [PIANO.md](PIANO.md).

## Struttura

- `www/`: l'app vera e propria (HTML, CSS e JavaScript senza bundler).
- `android/`: progetto Android generato da Capacitor.
- `tests/`: test con `node --test`.
- `tools/serve.js`: server locale per provare `www/` nel browser.

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

## Versione

La versione sta in tre posti che devono coincidere: `package.json` (`version`), `www/assets/js/app-info.js` (`APP_VERSION`) e `android/app/build.gradle` (`versionName`, più `versionCode` che cresce di 1 a ogni release). `npm test` controlla che siano allineate.

## Pubblicare una release

Arriva con la Fase 3 (PIANO.md, §10): APK firmato con la chiave di release, Release su GitHub con tag `vX.Y.Z` e APK allegato.
