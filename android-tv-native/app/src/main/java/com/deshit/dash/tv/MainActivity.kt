package com.deshit.dash.tv

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.net.Inet4Address
import java.net.NetworkInterface

class MainActivity : AppCompatActivity() {

    private val PREFS = "tv_prefs"
    private val KEY_DEVICE_ID = "device_id"
    private val KEY_DEVICE_TOKEN = "device_token"
    private val KEY_DEVICE_NAME = "device_name"
    private val KEY_SUBCENTER = "subcenter_name"
    private val KEY_SERVER_URL = "server_url"

    private lateinit var editCode: EditText
    private lateinit var editManualIp: EditText
    private lateinit var manualIpContainer: LinearLayout
    private lateinit var btnPair: Button
    private lateinit var progress: ProgressBar
    private lateinit var statusText: TextView
    private lateinit var textSearchStatus: TextView
    private lateinit var textServerFound: TextView

    private var discoveredUrl: String? = null
    private var isDiscovering = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Register global crash handler
        CrashHandler(this).register()

        setContentView(R.layout.activity_main)

        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val deviceId = prefs.getString(KEY_DEVICE_ID, null)
        val token = prefs.getString(KEY_DEVICE_TOKEN, null)
        val savedServerUrl = prefs.getString(KEY_SERVER_URL, null)

        editCode = findViewById(R.id.editCode)
        editManualIp = findViewById(R.id.editManualIp)
        manualIpContainer = findViewById(R.id.manualIpContainer)
        btnPair = findViewById(R.id.btnPair)
        progress = findViewById(R.id.progress)
        statusText = findViewById(R.id.statusText)
        textSearchStatus = findViewById(R.id.textSearchStatus)
        textServerFound = findViewById(R.id.textServerFound)

        if (savedServerUrl != null) {
            editManualIp.setText(savedServerUrl.replace("http://", "").replace(":3001", "").replace("/api", ""))
        }

        btnPair.setOnClickListener { attemptPairing(prefs) }

        editCode.setOnEditorActionListener { _, actionId, event ->
            if (actionId == EditorInfo.IME_ACTION_DONE ||
                (event?.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_ENTER)
            ) {
                btnPair.performClick()
                true
            } else false
        }

        // If already paired, try to validate and auto-launch
        if (!deviceId.isNullOrEmpty() && !token.isNullOrEmpty() && savedServerUrl != null) {
            ApiClient.setBaseUrl(savedServerUrl)
            progress.visibility = View.VISIBLE
            textSearchStatus.text = "Checking saved pairing..."
            statusText.text = ""
            lifecycleScope.launch {
                val isValid = try {
                    ApiClient.validateDevice(deviceId, token)
                } catch (e: Exception) {
                    false
                }
                progress.visibility = View.GONE
                if (isValid) {
                    launchPlayer(deviceId, token)
                } else {
                    prefs.edit().remove(KEY_DEVICE_ID).remove(KEY_DEVICE_TOKEN).remove(KEY_SERVER_URL).apply()
                    val msg = "Previous pairing expired. Searching for server..."
                    statusText.text = msg
                    statusText.setTextColor(android.graphics.Color.parseColor("#aaaaaa"))
                    Toast.makeText(this@MainActivity, msg, Toast.LENGTH_LONG).show()
                    Log.w("TVPair", "Saved credentials invalid, cleared")
                    startDiscovery()
                }
            }
        } else {
            startDiscovery()
        }
    }

    private fun startDiscovery() {
        if (isDiscovering) return
        isDiscovering = true
        btnPair.isEnabled = false
        manualIpContainer.visibility = View.GONE
        progress.visibility = View.VISIBLE
        textSearchStatus.text = "Searching for server on your network..."
        textSearchStatus.visibility = View.VISIBLE
        statusText.text = ""
        textServerFound.visibility = View.GONE
        discoveredUrl = null

        if (!isOnWifi()) {
            progress.visibility = View.GONE
            isDiscovering = false
            showManualFallback("WiFi required. Connect to the same WiFi as your server, then tap Confirm Pairing to retry.")
            return
        }

        lifecycleScope.launch {
            val serverIp = discoverServer()
            isDiscovering = false
            progress.visibility = View.GONE

            if (serverIp != null) {
                discoveredUrl = "http://$serverIp:3001"
                ApiClient.setBaseUrl(discoveredUrl!!)
                textSearchStatus.visibility = View.GONE
                textServerFound.text = "Server found at $serverIp"
                textServerFound.visibility = View.VISIBLE
                statusText.text = "Ready to pair"
                statusText.setTextColor(android.graphics.Color.parseColor("#4CAF50"))
                btnPair.isEnabled = true
                editCode.requestFocus()
                Log.d("TVPair", "Auto-discovered server: $discoveredUrl")
            } else {
                showManualFallback("Server not found on your network.\n\nMake sure your PC and phone are on the same WiFi, then enter the PC's IP address below (find it by running 'ipconfig' on your PC).")
            }
        }
    }

    private fun showManualFallback(msg: String) {
        textSearchStatus.visibility = View.GONE
        textServerFound.visibility = View.GONE
        statusText.text = msg
        statusText.setTextColor(android.graphics.Color.parseColor("#ef4444"))
        manualIpContainer.visibility = View.VISIBLE
        btnPair.isEnabled = true
        btnPair.text = "Confirm Pairing"
        // Change button behavior to try manual IP
        btnPair.setOnClickListener {
            val manualIp = editManualIp.text.toString().trim()
            if (manualIp.isEmpty()) {
                Toast.makeText(this, "Enter server IP from ipconfig", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            val url = if (manualIp.startsWith("http")) manualIp else "http://$manualIp:3001"
            discoveredUrl = url
            ApiClient.setBaseUrl(url)
            attemptPairing(getSharedPreferences(PREFS, Context.MODE_PRIVATE))
        }
        editManualIp.requestFocus()
    }

    private fun attemptPairing(prefs: android.content.SharedPreferences) {
        val code = editCode.text.toString().trim()

        if (discoveredUrl.isNullOrEmpty()) {
            startDiscovery()
            return
        }

        if (code.length != 6) {
            showError("Enter a valid 6-digit code")
            return
        }

        progress.visibility = View.VISIBLE
        statusText.text = "Pairing..."
        statusText.setTextColor(android.graphics.Color.parseColor("#aaaaaa"))
        btnPair.isEnabled = false

        lifecycleScope.launch {
            try {
                // Try pairing first (new device)
                var result = ApiClient.pairDevice(code)

                // If pairing code invalid, try repair (existing device)
                if (result.status != "paired" && result.error?.contains("Invalid or expired", ignoreCase = true) == true) {
                    Log.d("TVPair", "Pair code invalid, trying repair...")
                    statusText.text = "Trying repair code..."
                    result = ApiClient.repairDevice(code)
                }

                progress.visibility = View.GONE
                btnPair.isEnabled = true
                val deviceId = result.deviceId
                val token = result.token
                if (result.status == "paired" && deviceId != null && token != null) {
                    prefs.edit().apply {
                        putString(KEY_SERVER_URL, discoveredUrl)
                        putString(KEY_DEVICE_ID, deviceId)
                        putString(KEY_DEVICE_TOKEN, token)
                        putString(KEY_DEVICE_NAME, result.name)
                        putString(KEY_SUBCENTER, result.subcenterName)
                        apply()
                    }
                    Toast.makeText(this@MainActivity, "Paired successfully!", Toast.LENGTH_SHORT).show()
                    launchPlayer(deviceId, token)
                } else {
                    val msg = result.error ?: "Pairing/Repair failed (status: ${result.status ?: "unknown"})"
                    showError(msg)
                    Log.e("TVPair", "Pair/Repair failed: $msg")
                }
            } catch (e: Exception) {
                progress.visibility = View.GONE
                btnPair.isEnabled = true
                val fullError = buildString {
                    appendLine("Error: ${e.javaClass.simpleName}: ${e.message}")
                    appendLine("Server: ${discoveredUrl ?: "not set"}")
                    appendLine()
                    appendLine("Stack trace:")
                    e.stackTrace.take(8).forEach { appendLine("  at ${it}") }
                }
                showError(fullError)
                Log.e("TVPair", fullError, e)
            }
        }
    }

    private suspend fun discoverServer(): String? = coroutineScope {
        val subnet = getLocalSubnet() ?: return@coroutineScope null
        Log.d("TVPair", "Scanning subnet: $subnet.1 - $subnet.254")

        // Scan in chunks to avoid overwhelming the network
        val chunkSize = 50
        for (chunk in (1..254).chunked(chunkSize)) {
            val jobs = chunk.map { i ->
                async {
                    val ip = "$subnet.$i"
                    if (ApiClient.checkHealth(ip, timeoutMs = 800)) ip else null
                }
            }
            val found = jobs.awaitAll().firstOrNull { it != null }
            if (found != null) return@coroutineScope found
        }
        null
    }

    private fun getLocalSubnet(): String? {
        val ip = getLocalIpAddress() ?: return null
        val lastDot = ip.lastIndexOf('.')
        if (lastDot < 0) return null
        return ip.substring(0, lastDot)
    }

    private fun getLocalIpAddress(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                val name = iface.name.lowercase()
                if (name.contains("tun") || name.contains("ppp") || name.contains("vpn")) continue

                val addresses = iface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (addr.isLoopbackAddress || addr !is Inet4Address) continue
                    val host = addr.hostAddress
                    if (host != null && !host.startsWith("127.")) {
                        Log.d("TVPair", "Local IP on ${iface.name}: $host")
                        return host
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("TVPair", "Failed to get local IP", e)
        }
        return null
    }

    private fun isOnWifi(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
               caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }

    private fun showError(msg: String) {
        statusText.text = msg
        statusText.setTextColor(android.graphics.Color.parseColor("#ef4444"))
        Toast.makeText(this, msg.take(200), Toast.LENGTH_LONG).show()

        // Show a dialog with full error and copy button
        android.app.AlertDialog.Builder(this)
            .setTitle("Error Details")
            .setMessage(msg.take(2000))
            .setPositiveButton("Copy Full Error") { _, _ ->
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Error", msg))
                Toast.makeText(this, "Error copied! Paste it to share.", Toast.LENGTH_LONG).show()
            }
            .setNegativeButton("Close", null)
            .show()
    }

    private fun launchPlayer(deviceId: String, token: String) {
        val intent = Intent(this, PlayerActivity::class.java).apply {
            putExtra("device_id", deviceId)
            putExtra("token", token)
        }
        startActivity(intent)
        finish()
    }
}
