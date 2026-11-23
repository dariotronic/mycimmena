package it.mycimmena.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;

/**
 * Aggiornamento dentro l'app (PIANO.md, §10, v2): scarica l'APK di una Release di GitHub nella cache, controlla
 * che sia davvero myCimmena (stesso nome di pacchetto, versione più nuova, stessa firma, impronta SHA-256 uguale
 * a quella dichiarata da GitHub) e apre l'installer di Android. Dal JavaScript: Capacitor.Plugins.Updater.
 *
 * - canInstall()            { allowed }: se Android permette a myCimmena di installare app (Android 8+ lo chiede una volta)
 * - openInstallSettings()   apre la pagina di Android per dare quel permesso
 * - download({ url, version, sha256?, size? })  { path, versionName }; durante il download manda eventi "progress" { done, total }
 * - install({ path })       apre l'installer con l'APK scaricato
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    private static final String PACKAGE = "it.mycimmena.app";
    private static final String URL_PREFIX = "https://github.com/dariotronic/mycimmena/releases/download/";
    private static final long MAX_BYTES = 100L * 1024 * 1024;

    private File updatesDir() {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", "");
        String version = call.getString("version", "");
        String sha256 = call.getString("sha256", "");
        if (!url.startsWith(URL_PREFIX) || !url.endsWith(".apk") || !version.matches("\\d+\\.\\d+\\.\\d+")) {
            call.reject("Indirizzo dell'aggiornamento non valido.");
            return;
        }
        new Thread(() -> {
            File target = new File(updatesDir(), "mycimmena-" + version + ".apk");
            File partial = new File(updatesDir(), "download.part");
            try {
                for (File old : updatesDir().listFiles()) old.delete();
                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(30000);
                int status = connection.getResponseCode();
                if (status != 200) throw new Exception("Il download dell'aggiornamento non è partito (HTTP " + status + ").");
                if (!connection.getURL().getProtocol().equals("https")) throw new Exception("Il download dell'aggiornamento non è sicuro.");
                long total = connection.getContentLengthLong();
                if (total > MAX_BYTES) throw new Exception("Il file dell'aggiornamento è troppo grande.");
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long done = 0;
                long lastEvent = 0;
                try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(partial)) {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        digest.update(buffer, 0, read);
                        done += read;
                        if (done > MAX_BYTES) throw new Exception("Il file dell'aggiornamento è troppo grande.");
                        if (done - lastEvent > 128 * 1024) {
                            lastEvent = done;
                            JSObject progress = new JSObject();
                            progress.put("done", done);
                            progress.put("total", total);
                            notifyListeners("progress", progress);
                        }
                    }
                }
                if (!sha256.isEmpty() && !hex(digest.digest()).equals(sha256.toLowerCase(Locale.ROOT))) {
                    throw new Exception("Il file scaricato non corrisponde a quello della Release: riprova.");
                }
                if (!partial.renameTo(target)) throw new Exception("Non riesco a salvare l'aggiornamento.");
                PackageInfo info = check(target, version);
                JSObject result = new JSObject();
                result.put("path", target.getAbsolutePath());
                result.put("versionName", info.versionName);
                call.resolve(result);
            } catch (Exception error) {
                partial.delete();
                target.delete();
                call.reject(error.getMessage() != null ? error.getMessage() : "Download non riuscito.");
            }
        }).start();
    }

    // L'APK deve essere myCimmena, della versione annunciata, più nuova di quella installata e con la stessa firma.
    private PackageInfo check(File apk, String version) throws Exception {
        PackageManager manager = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo info = manager.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (info == null || !PACKAGE.equals(info.packageName)) throw new Exception("Il file scaricato non è myCimmena.");
        if (!version.equals(info.versionName)) throw new Exception("Il file scaricato non è la versione " + version + ".");
        try {
            PackageInfo installed = manager.getPackageInfo(PACKAGE, flags);
            if (versionCode(info) <= versionCode(installed)) throw new Exception("Hai già questa versione, o una più nuova.");
            if (!Arrays.equals(signatures(installed), signatures(info))) throw new Exception("L'aggiornamento non è firmato con la chiave di myCimmena.");
        } catch (PackageManager.NameNotFoundException notInstalled) {
            // Nella versione di sviluppo (it.mycimmena.app.debug) quella delle Release può non esserci: niente confronto.
        }
        return info;
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    @SuppressWarnings("deprecation")
    private static byte[] signatures(PackageInfo info) throws Exception {
        Signature[] list;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (info.signingInfo == null) return new byte[0];
            list = info.signingInfo.hasMultipleSigners() ? info.signingInfo.getApkContentsSigners() : info.signingInfo.getSigningCertificateHistory();
        } else {
            list = info.signatures;
        }
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        if (list != null) for (Signature signature : list) digest.update(signature.toByteArray());
        return digest.digest();
    }

    private static String hex(byte[] bytes) {
        StringBuilder builder = new StringBuilder();
        for (byte value : bytes) builder.append(String.format("%02x", value));
        return builder.toString();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File apk = new File(call.getString("path", ""));
        try {
            if (!apk.getCanonicalPath().startsWith(updatesDir().getCanonicalPath() + File.separator) || !apk.exists()) {
                call.reject("Aggiornamento non trovato: scaricalo di nuovo.");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Non riesco ad aprire l'installazione: " + error.getMessage());
        }
    }
}
