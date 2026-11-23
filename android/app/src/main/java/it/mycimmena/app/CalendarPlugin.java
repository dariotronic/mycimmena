package it.mycimmena.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.CalendarContract;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Calendar;
import java.util.TimeZone;

/**
 * Serata nel calendario: apre la schermata "nuovo evento" dell'app calendario del telefono, già compilata (giornata
 * intera, titolo, luogo, titoli in programma). L'utente sceglie il calendario e salva. Niente permessi: è il
 * calendario a scrivere l'evento. Dal JavaScript: Capacitor.Plugins.Calendar.
 *
 * - addEvent({ date: "AAAA-MM-GG", title, location?, description? })  rifiuta se non c'è nessuna app calendario
 */
@CapacitorPlugin(name = "Calendar")
public class CalendarPlugin extends Plugin {

    @PluginMethod
    public void addEvent(PluginCall call) {
        String date = call.getString("date", "");
        if (!date.matches("\\d{4}-\\d{2}-\\d{2}")) {
            call.reject("Data della serata non valida.");
            return;
        }
        String[] parts = date.split("-");
        // Gli eventi di un giorno intero vanno da mezzanotte a mezzanotte in UTC.
        Calendar start = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        start.clear();
        start.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, Integer.parseInt(parts[2]));
        Calendar end = (Calendar) start.clone();
        end.add(Calendar.DAY_OF_MONTH, 1);

        Intent intent = new Intent(Intent.ACTION_INSERT)
            .setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, true)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start.getTimeInMillis())
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end.getTimeInMillis())
            .putExtra(CalendarContract.Events.TITLE, call.getString("title", "Serata film"));
        String location = call.getString("location", "");
        if (!location.isEmpty()) intent.putExtra(CalendarContract.Events.EVENT_LOCATION, location);
        String description = call.getString("description", "");
        if (!description.isEmpty()) intent.putExtra(CalendarContract.Events.DESCRIPTION, description);
        try {
            // Dall'attività dell'app: con "Indietro" o dopo il salvataggio si torna a myCimmena.
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("Sul telefono non c'è un'app calendario.");
        }
    }
}
