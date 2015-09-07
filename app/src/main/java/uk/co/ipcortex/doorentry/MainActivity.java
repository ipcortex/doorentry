package uk.co.ipcortex.doorentry;

import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Environment;
import android.support.annotation.MainThread;
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
                    if (message.trim().equals("refresh")) {
                        runOnUiThread(refreshApp);
                    }
                }
            } catch (Throwable e) {
                e.printStackTrace();
            }
        }
    }
    private Runnable refreshApp = new Runnable() {
        @Override
        public void run() {
            Log.i("Refresher", "Refreshing!");
            mXwalkView.reload(XWalkView.RELOAD_NORMAL);
        }
    };
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
        Config config = new Toml().parse(new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM) + "/PBX/config.toml")).to(Config.class);
        setContentView(R.layout.activity_main);
        mXwalkView = (XWalkView) findViewById(R.id.activity_main);
        XWalkPreferences.setValue(XWalkPreferences.REMOTE_DEBUGGING, true);
        mXwalkView.addJavascriptInterface(config, "hostConfig");
        ConnectivityManager connMgr = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        NetworkInfo networkInfo = connMgr.getActiveNetworkInfo();
        while(networkInfo == null || !networkInfo.isConnected()) {
            networkInfo = connMgr.getActiveNetworkInfo();
        }
        refreshListener = new RefreshListener();
        refreshListener.start();
        mXwalkView.load("file:///android_asset/index.html", null);
    }

}
