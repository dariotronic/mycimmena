package it.mycimmena.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin dell'app (non da npm): aggiornamento scaricato e installato dall'app stessa.
        registerPlugin(UpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
