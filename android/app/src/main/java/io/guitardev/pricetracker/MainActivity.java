package io.guitardev.pricetracker;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VcgWebPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
