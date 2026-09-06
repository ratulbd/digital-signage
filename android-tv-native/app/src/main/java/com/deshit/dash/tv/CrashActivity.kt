package com.deshit.dash.tv

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.widget.Button
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class CrashActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val report = intent.getStringExtra("error_report") ?: "Unknown error"

        val scrollView = ScrollView(this).apply {
            setPadding(32, 32, 32, 32)
            setBackgroundColor(android.graphics.Color.parseColor("#0a0a0b"))
        }

        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
        }

        val titleText = TextView(this).apply {
            text = "App Crashed"
            textSize = 24f
            setTextColor(android.graphics.Color.parseColor("#ef4444"))
            setPadding(0, 0, 0, 16)
        }

        val descText = TextView(this).apply {
            text = "Something went wrong. Please copy the report below and share it to get help."
            textSize = 14f
            setTextColor(android.graphics.Color.parseColor("#aaaaaa"))
            setPadding(0, 0, 0, 24)
        }

        val reportText = TextView(this).apply {
            text = report
            textSize = 12f
            setTextColor(android.graphics.Color.parseColor("#ffffff"))
            setBackgroundColor(android.graphics.Color.parseColor("#1e1e2e"))
            setPadding(16, 16, 16, 16)
            setTextIsSelectable(true)
        }

        val copyBtn = Button(this).apply {
            text = "Copy Report to Clipboard"
            setBackgroundColor(android.graphics.Color.parseColor("#3b82f6"))
            setTextColor(android.graphics.Color.parseColor("#ffffff"))
            setPadding(24, 16, 24, 16)
            setOnClickListener {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("Crash Report", report))
                Toast.makeText(this@CrashActivity, "Report copied! Paste it to share.", Toast.LENGTH_LONG).show()
            }
        }

        val restartBtn = Button(this).apply {
            text = "Restart App"
            setBackgroundColor(android.graphics.Color.parseColor("#2A2A2A"))
            setTextColor(android.graphics.Color.parseColor("#ffffff"))
            setPadding(24, 16, 24, 16)
            setOnClickListener {
                val intent = packageManager.getLaunchIntentForPackage(packageName)
                intent?.addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP)
                startActivity(intent)
                finish()
            }
        }

        layout.addView(titleText)
        layout.addView(descText)
        layout.addView(reportText)
        layout.addView(copyBtn)
        layout.addView(restartBtn)
        scrollView.addView(layout)
        setContentView(scrollView)
    }
}
