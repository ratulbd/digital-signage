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

        // If already paired, auto-launch PlayerActivity without re-pairing
        if (!deviceId.isNullOrEmpty() && !token.isNullOrEmpty()) {
            progress.visibility = View.VISIBLE
            textSearchStatus.text = "Starting player..."
            statusText.text = ""
            lifecycleScope.launch {
                val resolvedUrl = ApiClient.resolveServerUrl(savedServerUrl)
                discoveredUrl = resolvedUrl
                prefs.edit().putString(KEY_SERVER_URL, resolvedUrl).apply()

                val statusCode = ApiClient.validateDeviceStatus(deviceId, token)
                progress.visibility = View.GONE
                
                // Only clear pairing if server explicitly rejects with 401 Unauthorized or 404 Not Found
                if (statusCode == 401 || statusCode == 403 || statusCode == 404) {
                    prefs.edit().remove(KEY_DEVICE_ID).remove(KEY_DEVICE_TOKEN).apply()
                    val msg = "Previous pairing expired. Ready to pair again."
                    statusText.text = msg
                    statusText.setTextColor(android.graphics.Color.parseColor("#aaaaaa"))
                    Toast.makeText(this@MainActivity, msg, Toast.LENGTH_LONG).show()
                    Log.w("TVPair", "Saved credentials rejected by server ($statusCode), cleared")
                    initCloudConnection(prefs)
                } else {
                    // Success (200) or temporarily offline (-1) -> seamlessly launch PlayerActivity!
                    Log.d("TVPair", "Launching player with saved pairing (validation status: $statusCode)")
                    launchPlayer(deviceId, token)
                }
            }
        } else {
            initCloudConnection(prefs)
        }
    }

    private fun initCloudConnection(prefs: android.content.SharedPreferences) {
        progress.visibility = View.VISIBLE
        textSearchStatus.text = "Connecting to server..."
        textSearchStatus.visibility = View.VISIBLE
        statusText.text = ""
        manualIpContainer.visibility = View.GONE
        btnPair.isEnabled = false

        // Long press server text allows manual URL override for developer testing
        textServerFound.setOnLongClickListener {
            manualIpContainer.visibility = if (manualIpContainer.visibility == View.VISIBLE) View.GONE else View.VISIBLE
            true
        }

        lifecycleScope.launch {
            val savedServerUrl = prefs.getString(KEY_SERVER_URL, null)
            val resolvedUrl = ApiClient.resolveServerUrl(savedServerUrl)
            discoveredUrl = resolvedUrl
            prefs.edit().putString(KEY_SERVER_URL, resolvedUrl).apply()

            progress.visibility = View.GONE
            textSearchStatus.visibility = View.GONE
            textServerFound.text = "Connected to Server"
            textServerFound.visibility = View.VISIBLE
            statusText.text = "Enter the 6-digit pairing code from CMS"
            statusText.setTextColor(android.graphics.Color.parseColor("#4CAF50"))
            btnPair.isEnabled = true
            editCode.requestFocus()
            Log.d("TVPair", "Auto-configured server: $discoveredUrl")
        }
    }

    private fun attemptPairing(prefs: android.content.SharedPreferences) {
        val code = editCode.text.toString().trim()

        if (discoveredUrl.isNullOrEmpty()) {
            initCloudConnection(prefs)
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
