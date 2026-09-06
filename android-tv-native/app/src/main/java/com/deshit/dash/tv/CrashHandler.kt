package com.deshit.dash.tv

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Looper
import android.util.Log
import android.widget.Toast

class CrashHandler(private val context: Context) : Thread.UncaughtExceptionHandler {

    private val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()

    fun register() {
        Thread.setDefaultUncaughtExceptionHandler(this)
    }

    override fun uncaughtException(thread: Thread, throwable: Throwable) {
        val errorReport = buildErrorReport(thread, throwable)
        Log.e("CrashHandler", errorReport, throwable)

        try {
            val intent = Intent(context, CrashActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                putExtra("error_report", errorReport)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            defaultHandler?.uncaughtException(thread, throwable)
        }

        // Kill the app after showing the crash screen
        android.os.Process.killProcess(android.os.Process.myPid())
        System.exit(10)
    }

    private fun buildErrorReport(thread: Thread, throwable: Throwable): String {
        return buildString {
            appendLine("=== DESH-IT DASH CRASH REPORT ===")
            appendLine("Time: ${java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US).format(java.util.Date())}")
            appendLine("App Version: 1.0")
            appendLine("Android Version: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            appendLine("Device: ${Build.MANUFACTURER} ${Build.MODEL}")
            appendLine("Thread: ${thread.name}")
            appendLine()
            appendLine("=== STACK TRACE ===")
            appendLine(Log.getStackTraceString(throwable))
            appendLine()
            appendLine("=== END REPORT ===")
        }
    }

    companion object {
        fun showErrorDialog(activity: Activity, title: String, message: String) {
            AlertDialog.Builder(activity)
                .setTitle(title)
                .setMessage(message)
                .setPositiveButton("Copy & Share") { _, _ ->
                    val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(ClipData.newPlainText("Error", message))
                    Toast.makeText(activity, "Error copied to clipboard! Paste it to share.", Toast.LENGTH_LONG).show()
                }
                .setNegativeButton("Close", null)
                .setCancelable(false)
                .show()
        }
    }
}
