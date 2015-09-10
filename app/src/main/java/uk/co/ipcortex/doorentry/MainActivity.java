package uk.co.ipcortex.doorentry;

import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Environment;
import android.support.v7.app.AppCompatActivity;
import android.os.Bundle;
import android.util.Log;

import com.moandjiezana.toml.Toml;

import org.xwalk.core.JavascriptInterface;
import org.xwalk.core.XWalkPreferences;
import org.xwalk.core.XWalkView;

import java.io.File;
import java.net.DatagramPacket;
import java.net.DatagramSocket;


public class MainActivity extends AppCompatActivity {

    private XWalkView mXwalkView;
    private RefreshListener refreshListener;

    // listens for UDP packets on port 9953 in a separate thread
    // TODO: add other options such as enabling ADB. Functionality like this will need more robust security
    // TODO: include checks to ensure process stays alive
    private class RefreshListener extends Thread {
        private static final  String TAG = "RefreshListener";
        public void run() {
            String message;
            byte[] lmessage = new byte[100];
            DatagramPacket packet = new DatagramPacket(lmessage, lmessage.length);
            try {
                DatagramSocket socket = new DatagramSocket(9953);
                while(true) {
                    socket.receive(packet);
                    message = new String(lmessage, 0, packet.getLength());
                    Log.i(TAG, "received: " + message);
                    // Checks  refreshes page in webview
                    if (message.trim().equals("refresh")) {
                        runOnUiThread(refreshApp);
                    }
                    // add other functionality here
                }
            } catch (Throwable e) {
                e.printStackTrace();
            }
        }
    }

    // could change this to refresh whole android application
    // currently just refreshes app in web view
    private Runnable refreshApp = new Runnable() {
        @Override
        public void run() {
            Log.i("Refresher", "Refreshing!");
            mXwalkView.reload(XWalkView.RELOAD_NORMAL);
        }
    };

    // The next three classes are used for parsing the config file and exposing the data to the JS web application
    class PBXCredentials {
        String username;
        String password;
    }
    class PBX {
        String hostname;
        String user_prefix;
        PBXCredentials credentials;
    }
    class Config {
        PBX pbx;
        @JavascriptInterface
        public String getHost() {
            return this.pbx.hostname;
        }
        @JavascriptInterface
        public String getPrefix() {
            return this.pbx.user_prefix;
        }
        @JavascriptInterface
        public String getUsername() {
            return this.pbx.credentials.username;
        }
        @JavascriptInterface
        public String getPassword() {
            return this.pbx.credentials.password;
        }
    }
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // parse config file
        Config config = new Toml().parse(new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM) + "/PBX/config.toml")).to(Config.class);

        setContentView(R.layout.activity_main);
        mXwalkView = (XWalkView) findViewById(R.id.activity_main);

        // should probably be disabled but doesn't seem to harm anything and disabling ADB effectively disables this
        XWalkPreferences.setValue(XWalkPreferences.REMOTE_DEBUGGING, true);

        mXwalkView.addJavascriptInterface(config, "hostConfig");

        // delay page load until network is found
        ConnectivityManager connMgr = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        NetworkInfo networkInfo = connMgr.getActiveNetworkInfo();
        while(networkInfo == null || !networkInfo.isConnected()) {
            networkInfo = connMgr.getActiveNetworkInfo();
        }
        
        RefreshListener refreshListener = new RefreshListener();
        refreshListener.start();

        mXwalkView.load("file:///android_asset/index.html", null);
    }

}
