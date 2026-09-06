package com.deshit.dash.tv

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import androidx.core.content.FileProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

class UpdateManager(private val context: Context) {

    private val TAG = "UpdateManager"
    private val handler = Handler(Looper.getMainLooper())
    private val checkIntervalMs = 6 * 60 * 60 * 1000L // 6 hours
    private var isDownloading = false

    private val periodicRunnable = object : Runnable {
        override fun run() {
            checkForUpdate(silent = true)
            handler.postDelayed(this, checkIntervalMs)
        }
    }

    fun startPeriodicChecks() {
        handler.removeCallbacks(periodicRunnable)
        // Run first check after 30 seconds of app start, then every 6 hours
        handler.postDelayed(periodicRunnable, 30000L)
    }

    fun stopPeriodicChecks() {
        handler.removeCallbacks(periodicRunnable)
    }

    fun getInstalledVersionCode(): Long {
        return try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pInfo.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                pInfo.versionCode.toLong()
            }
        } catch (e: Exception) {
            1L
        }
    }

    fun checkForUpdate(silent: Boolean = false, forcedApkUrl: String? = null, targetVersion: Int? = null) {
        if (isDownloading) {
            if (!silent) Toast.makeText(context, "Update download already in progress...", Toast.LENGTH_SHORT).show()
            return
        }

        CoroutineScope(Dispatchers.Main).launch {
            val installedCode = getInstalledVersionCode()

            // If forced via Socket.io
            if (!forcedApkUrl.isNullOrBlank()) {
                val targetCode = targetVersion ?: (installedCode + 1).toInt()
                if (targetCode > installedCode) {
                    Log.d(TAG, "Instant update pushed: version $targetCode (installed: $installedCode)")
                    showUpdatePromptAndDownload(forcedApkUrl, targetCode, "Immediate update broadcasted by server.")
                }
                return@launch
            }

            // Normal version check
            val info = ApiClient.checkAppVersion()
            if (info != null && info.versionCode > installedCode) {
                Log.d(TAG, "Newer version available: ${info.versionCode} (installed: $installedCode)")
                showUpdatePromptAndDownload(info.apkUrl, info.versionCode, info.releaseNotes)
            } else {
                if (!silent) {
                    Toast.makeText(context, "App is up to date (v$installedCode)", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun showUpdatePromptAndDownload(apkUrl: String, newVersionCode: Int, notes: String?) {
        val message = buildString {
            append("A newer version (v$newVersionCode) is available.\n")
            if (!notes.isNullOrBlank()) {
                append("\nWhat's new:\n$notes\n")
            }
            append("\nDownloading and installing update...")
        }

        Toast.makeText(context, "Updating app to v$newVersionCode...", Toast.LENGTH_LONG).show()
        downloadAndInstallApk(apkUrl)
    }

    private fun downloadAndInstallApk(apkUrl: String) {
        isDownloading = true
        CoroutineScope(Dispatchers.IO).launch {
            try {
                Log.d(TAG, "Starting download from: $apkUrl")
                val client = OkHttpClient.Builder()
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .readTimeout(120, TimeUnit.SECONDS)
                    .build()

                val request = Request.Builder().url(apkUrl).build()
                val response = client.newCall(request).execute()

                if (!response.isSuccessful) {
                    withContext(Dispatchers.Main) {
                        isDownloading = false
                        Log.e(TAG, "Download failed with HTTP ${response.code}")
                        Toast.makeText(context, "Update download failed (${response.code})", Toast.LENGTH_LONG).show()
                    }
                    return@launch
                }

                val body = response.body ?: throw Exception("Empty response body")
                val updateDir = File(context.cacheDir, "updates")
                if (!updateDir.exists()) updateDir.mkdirs()
                val apkFile = File(updateDir, "update.apk")
                if (apkFile.exists()) apkFile.delete()

                val inputStream = body.byteStream()
                val outputStream = FileOutputStream(apkFile)
                val buffer = ByteArray(8192)
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                }
                outputStream.flush()
                outputStream.close()
                inputStream.close()

                Log.d(TAG, "Download complete: ${apkFile.length()} bytes")

                withContext(Dispatchers.Main) {
                    isDownloading = false
                    installApk(apkFile)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error downloading update", e)
                withContext(Dispatchers.Main) {
                    isDownloading = false
                    Toast.makeText(context, "Error downloading update: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun installApk(apkFile: File) {
        try {
            val contentUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch installer", e)
            Toast.makeText(context, "Failed to launch installer: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
}
