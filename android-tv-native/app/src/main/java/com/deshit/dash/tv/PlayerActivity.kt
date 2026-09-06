package com.deshit.dash.tv

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.animation.doOnEnd
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.PlayerView
import com.bumptech.glide.Glide
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@UnstableApi
class PlayerActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    private lateinit var playerView: PlayerView
    private lateinit var imageView: ImageView
    private lateinit var infoContainer: LinearLayout
    private lateinit var infoTitle: TextView
    private lateinit var infoSubtitle: TextView
    private lateinit var deviceInfoPill: LinearLayout
    private lateinit var textSubcenter: TextView
    private lateinit var textLiveClock: TextView
    private lateinit var scheduleInfoPill: LinearLayout
    private lateinit var textMeta: TextView
    private lateinit var textTitle: TextView
    private lateinit var loadingSpinner: ProgressBar
    private lateinit var tapOverlay: View

    // Text / TTS views
    private lateinit var textContainer: FrameLayout
    private lateinit var narrativeLoader: LinearLayout
    private lateinit var loaderTitle: TextView
    private lateinit var loaderSubtitle: TextView
    private lateinit var monolithStage: LinearLayout
    private lateinit var ghostPrev: TextView
    private lateinit var activeSentence: TextView
    private lateinit var ghostNext: TextView
    private lateinit var readingProgressFill: View

    private var player: ExoPlayer? = null
    private var socketManager: SocketManager? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    private var deviceId: String = ""
    private var deviceToken: String = ""
    private var deviceName: String = ""
    private var subcenterName: String = ""
    private var schedule: List<ScheduleItem> = emptyList()
    private var currentIndex = 0
    private var isOverrideActive = false
    private var overrideItem: ScheduleItem? = null
    private var currentMedia: ScheduleItem? = null

    // TTS state
    private var ttsSentences: List<String> = emptyList()
    private var ttsSentenceIndex = 0
    private var ttsRenderId = 0
    private var currentTtsLocale: Locale? = null

    private lateinit var updateManager: UpdateManager

    private val handler = Handler(Looper.getMainLooper())
    private var heartbeatRunnable: Runnable? = null
    private var imageRunnable: Runnable? = null
    private var guardRunnable: Runnable? = null

    private val clockRunnable = object : Runnable {
        override fun run() {
            try {
                val cal = ApiClient.getCalibratedCalendar()
                val timeFmt = SimpleDateFormat("hh:mm:ss a", Locale.US).apply {
                    timeZone = ApiClient.OPERATIONAL_TIMEZONE
                }
                textLiveClock.text = timeFmt.format(cal.time)

                if (schedule.isEmpty() && infoContainer.visibility == View.VISIBLE) {
                    updateWaitingDiagnostics()
                }
            } catch (_: Exception) {}
            handler.postDelayed(this, 1000L)
        }
    }

    private val TAG = "PlayerActivity"
    private val IMAGE_DURATION_MS = 10000L
    private val CROSSFADE_DURATION_MS = 600L

    // Browser-matched messages
    private val MSG_NO_CONTENT_TITLE = "Waiting for Content"
    private val MSG_NO_CONTENT_SUBTITLE = "Create a schedule in the CMS dashboard to start playback"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        CrashHandler(this).register()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_player)

        // Immersive fullscreen — hide system bars
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).let { controller ->
            controller.hide(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.navigationBars())
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        bindViews()
        loadCredentials()
        setupUiInteractions()

        initPlayer()
        initTts()
        updateManager = UpdateManager(this)
        updateManager.startPeriodicChecks()
        connectSocket()
        startHeartbeat()
        startPlaylistGuard()
        handler.post(clockRunnable)

        lifecycleScope.launch {
            loadSchedule()
        }
    }

    private fun bindViews() {
        playerView = findViewById(R.id.playerView)
        imageView = findViewById(R.id.imageView)
        infoContainer = findViewById(R.id.infoContainer)
        infoTitle = findViewById(R.id.infoTitle)
        infoSubtitle = findViewById(R.id.infoSubtitle)
        deviceInfoPill = findViewById(R.id.deviceInfoPill)
        textSubcenter = findViewById(R.id.textSubcenter)
        textLiveClock = findViewById(R.id.textLiveClock)
        scheduleInfoPill = findViewById(R.id.scheduleInfoPill)
        textMeta = findViewById(R.id.textMeta)
        textTitle = findViewById(R.id.textTitle)
        loadingSpinner = findViewById(R.id.loadingSpinner)
        tapOverlay = findViewById(R.id.tapOverlay)

        textContainer = findViewById(R.id.textContainer)
        narrativeLoader = findViewById(R.id.narrativeLoader)
        loaderTitle = findViewById(R.id.loaderTitle)
        loaderSubtitle = findViewById(R.id.loaderSubtitle)
        monolithStage = findViewById(R.id.monolithStage)
        ghostPrev = findViewById(R.id.ghostPrev)
        activeSentence = findViewById(R.id.activeSentence)
        ghostNext = findViewById(R.id.ghostNext)
        readingProgressFill = findViewById(R.id.readingProgressFill)
    }

    private fun loadCredentials() {
        deviceId = intent.getStringExtra("device_id") ?: return finish()
        deviceToken = intent.getStringExtra("token") ?: return finish()

        val prefs = getSharedPreferences("tv_prefs", MODE_PRIVATE)
        deviceName = prefs.getString("device_name", "TV Player") ?: "TV Player"
        subcenterName = prefs.getString("subcenter_name", "") ?: ""

        textSubcenter.text = subcenterName.ifEmpty { "—" }
        deviceInfoPill.visibility = View.VISIBLE
    }

    private fun setupUiInteractions() {
        tapOverlay.setOnClickListener {
            deviceInfoPill.alpha = 1f
            if (schedule.isNotEmpty() || (isOverrideActive && overrideItem != null)) {
                scheduleInfoPill.alpha = 1f
            }
        }
    }

    private fun showResetDialog() {
        android.app.AlertDialog.Builder(this)
            .setTitle("Reset Device")
            .setMessage("Clear all pairing data and return to setup?")
            .setPositiveButton("Reset") { _, _ ->
                getSharedPreferences("tv_prefs", MODE_PRIVATE).edit().clear().apply()
                startActivity(android.content.Intent(this, MainActivity::class.java))
                finish()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun initPlayer() {
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(15000, 60000, 2500, 5000)
            .build()

        val trackSelector = DefaultTrackSelector(this)

        val renderersFactory = DefaultRenderersFactory(this)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)

        player = ExoPlayer.Builder(this)
            .setLoadControl(loadControl)
            .setTrackSelector(trackSelector)
            .setRenderersFactory(renderersFactory)
            .build()
            .apply {
                playerView.player = this
                playerView.useController = false

                addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(state: Int) {
                        when (state) {
                            Player.STATE_READY -> loadingSpinner.visibility = View.GONE
                            Player.STATE_BUFFERING -> loadingSpinner.visibility = View.VISIBLE
                            Player.STATE_ENDED -> playNext()
                        }
                    }

                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        Log.e(TAG, "Player error: ${error.message}")
                        loadingSpinner.visibility = View.GONE
                        playNext()
                    }
                })
            }
    }

    private fun initTts() {
        tts = TextToSpeech(this, this)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            ttsReady = true
            Log.d(TAG, "TTS initialized successfully")
        } else {
            Log.e(TAG, "TTS initialization failed")
        }
    }

    private var rawScheduleItems: List<ScheduleItem> = emptyList()

    private fun connectSocket() {
        socketManager = SocketManager(
            deviceId = deviceId,
            deviceName = deviceName,
            token = deviceToken,
            onOverride = { mediaId, url, tier ->
                runOnUiThread {
                    val inferredType = inferMediaType(url)
                    overrideItem = ScheduleItem(
                        id = "override", mediaId = mediaId, url = url,
                        filename = null, type = inferredType, tier = tier,
                        contentName = "Override", categoryName = null, contentTypeName = null,
                        startDate = null, endDate = null,
                        startTime = null, endTime = null
                    )
                    isOverrideActive = true
                    currentIndex = 0
                    playCurrent()
                }
            },
            onResume = {
                runOnUiThread {
                    isOverrideActive = false
                    overrideItem = null
                    currentIndex = 0
                    playCurrent()
                }
            },
            onSync = {
                lifecycleScope.launch { loadSchedule() }
            },
            onUpdate = { versionCode, apkUrl, changelog ->
                runOnUiThread {
                    updateManager.checkForUpdate(silent = false, forcedApkUrl = apkUrl, targetVersion = versionCode)
                }
            },
            onMigrate = { newServerUrl ->
                runOnUiThread {
                    ApiClient.setBaseUrl(newServerUrl)
                    getSharedPreferences("tv_prefs", MODE_PRIVATE).edit()
                        .putString("server_url", newServerUrl)
                        .apply()
                    Toast.makeText(this@PlayerActivity, "Server migrated to: $newServerUrl", Toast.LENGTH_LONG).show()
                    lifecycleScope.launch { loadSchedule() }
                }
            }
        )
        socketManager?.connect()
    }

    private fun startHeartbeat() {
        heartbeatRunnable = object : Runnable {
            override fun run() {
                lifecycleScope.launch {
                    ApiClient.sendHeartbeat(deviceId, deviceToken)
                }
                handler.postDelayed(this, 60000)
            }
        }
        handler.post(heartbeatRunnable!!)
    }

    private var lastScheduleFetchMs: Long = 0L

    private fun startPlaylistGuard() {
        guardRunnable = object : Runnable {
            override fun run() {
                if (!isOverrideActive) {
                    evaluateAndSyncSchedule()
                }

                // Precision boundary timing
                val nowMs = System.currentTimeMillis()
                val msToNextMinute = 60000L - (nowMs % 60000L)

                // High frequency (2s) check when idle to catch schedule start with 0s delay;
                // Otherwise re-check right on the minute boundary + 100ms.
                val delayMs = if (schedule.isEmpty()) {
                    2000L.coerceAtMost(msToNextMinute)
                } else {
                    msToNextMinute + 100L
                }
                handler.postDelayed(this, delayMs)
            }
        }
        handler.post(guardRunnable!!)
    }

    private fun evaluateAndSyncSchedule() {
        val nowMs = System.currentTimeMillis()
        // If playlist is empty, re-query server every 10 seconds to catch newly scheduled CMS items
        if (rawScheduleItems.isEmpty() || (schedule.isEmpty() && nowMs - lastScheduleFetchMs > 10000L)) {
            lastScheduleFetchMs = nowMs
            lifecycleScope.launch { loadSchedule() }
            return
        }
        val active = filterActiveItems(rawScheduleItems)
        updateActiveSchedule(active)
    }

    private suspend fun loadSchedule() {
        try {
            lastScheduleFetchMs = System.currentTimeMillis()
            val items = ApiClient.fetchSchedule(deviceId, deviceToken)
            rawScheduleItems = items
            val active = filterActiveItems(items)
            updateActiveSchedule(active)
        } catch (e: Exception) {
            Log.e(TAG, "Schedule load failed", e)
        }
    }

    private fun updateActiveSchedule(active: List<ScheduleItem>) {
        val wasEmpty = schedule.isEmpty()
        val isNowEmpty = active.isEmpty()

        if (isNowEmpty && !wasEmpty) {
            // Schedule strictly ended at this second — halt immediately
            runOnUiThread { stopAllPlayback() }
        }

        if (isNowEmpty && wasEmpty) {
            // Still empty — show waiting card and update diagnostics
            runOnUiThread {
                updateWaitingDiagnostics()
                showNoContent(MSG_NO_CONTENT_TITLE, MSG_NO_CONTENT_SUBTITLE)
            }
        }

        // Trigger playback if we have active items and (playlist changed OR playback is not currently playing)
        if (active.isNotEmpty() && (active != schedule || currentMedia == null)) {
            schedule = active
            Log.d(TAG, "Active schedule matched: ${active.size} items — triggering playback")
            if (!isOverrideActive) {
                runOnUiThread {
                    currentIndex = 0
                    playCurrent()
                }
            }
        }
    }

    private fun updateWaitingDiagnostics() {
        if (schedule.isNotEmpty()) return
        try {
            val cal = ApiClient.getCalibratedCalendar()
            val timeFmt = SimpleDateFormat("hh:mm:ss a", Locale.US).apply {
                timeZone = ApiClient.OPERATIONAL_TIMEZONE
            }
            val currentTimeStr = timeFmt.format(cal.time)

            val nextItem = rawScheduleItems.firstOrNull()
            val subtitle = if (nextItem != null) {
                val window = "${nextItem.startTime ?: "—"} to ${nextItem.endTime ?: "—"}"
                val name = nextItem.contentName ?: nextItem.filename ?: "Content"
                "Current Time: $currentTimeStr (BST)\nScheduled: $name ($window)"
            } else {
                "Current Time: $currentTimeStr (BST)\nCreate a schedule in the CMS dashboard to start playback"
            }
            infoSubtitle.text = subtitle
        } catch (_: Exception) {}
    }

    private fun parseTimeToSeconds(timeStr: String?, defaultSecond: Int = 0): Int? {
        if (timeStr.isNullOrBlank()) return null
        val parts = timeStr.trim().split(":")
        val h = parts.getOrNull(0)?.toIntOrNull() ?: return null
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val s = parts.getOrNull(2)?.toIntOrNull() ?: defaultSecond
        return h * 3600 + m * 60 + s
    }

    private fun filterActiveItems(items: List<ScheduleItem>): List<ScheduleItem> {
        val cal = ApiClient.getCalibratedCalendar()
        val secondsNow = cal.get(java.util.Calendar.HOUR_OF_DAY) * 3600 +
                         cal.get(java.util.Calendar.MINUTE) * 60 +
                         cal.get(java.util.Calendar.SECOND)

        val fmtDate = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
            timeZone = ApiClient.OPERATIONAL_TIMEZONE
        }
        val todayStr = fmtDate.format(cal.time)

        return items.filter { item ->
            val type = (item.type ?: "image").lowercase()
            // Accept video, image, text, pdf, docx
            if (type != "video" && type != "image" && type != "text" &&
                type != "pdf" && type != "docx" && type != "document") {
                val ext = item.url?.substringAfterLast('.', "")?.lowercase() ?: ""
                if (ext !in listOf("mp4", "webm", "ogg", "mov", "mkv", "jpg", "jpeg", "png", "gif", "webp", "pdf", "txt", "md", "docx")) {
                    return@filter false
                }
            }

            // Robust string comparison on "yyyy-MM-dd"
            val dateOk = try {
                val startStr = item.startDate?.let {
                    if (it.length >= 10) it.substring(0, 10) else it
                }
                val endStr = item.endDate?.let {
                    if (it.length >= 10) it.substring(0, 10) else it
                }
                (startStr == null || startStr <= todayStr) &&
                (endStr == null || endStr >= todayStr)
            } catch (_: Exception) { true }

            val timeOk = try {
                val startSec = parseTimeToSeconds(item.startTime, defaultSecond = 0)
                // If endTime is e.g. "13:20", it means inclusive of that entire minute (13:20:59)
                val endSec = parseTimeToSeconds(item.endTime, defaultSecond = 59)

                (startSec == null || startSec <= secondsNow) &&
                (endSec == null || endSec >= secondsNow)
            } catch (_: Exception) { true }

            dateOk && timeOk && !item.url.isNullOrEmpty()
        }
    }

    private fun inferMediaType(url: String?): String {
        if (url == null) return "image"
        val ext = url.substringAfterLast('.', "").lowercase().substringBefore("?")
        return when (ext) {
            "mp4", "webm", "ogg", "mov", "mkv" -> "video"
            "pdf" -> "pdf"
            "txt", "md", "json" -> "text"
            "docx" -> "docx"
            else -> "image"
        }
    }

    private fun getMediaType(item: ScheduleItem): String {
        val type = (item.type ?: "").lowercase()
        return when {
            type == "video" -> "video"
            type == "image" -> "image"
            type == "text" -> "text"
            type == "pdf" -> "pdf"
            type == "docx" -> "docx"
            type == "document" -> inferMediaType(item.url)
            else -> inferMediaType(item.url)
        }
    }

    private fun playCurrent() {
        val playlist = if (isOverrideActive && overrideItem != null) {
            listOf(overrideItem!!)
        } else schedule

        if (playlist.isEmpty()) {
            showNoContent(MSG_NO_CONTENT_TITLE, MSG_NO_CONTENT_SUBTITLE)
            return
        }

        hideNoContent()

        if (currentIndex >= playlist.size) currentIndex = 0
        val item = playlist[currentIndex]
        val url = item.url ?: return playNext()

        currentMedia = item
        showScheduleInfo(item)
        reportPlayback(item.mediaId, "started")

        val mediaType = getMediaType(item)
        when (mediaType) {
            "video" -> playVideo(url)
            "image" -> playImage(url)
            "text", "pdf", "docx" -> playTextMedia(item)
            else -> playImage(url)
        }
    }

    private fun playVideo(url: String) {
        hideTextContainer()
        loadingSpinner.visibility = View.VISIBLE
        imageView.animate().alpha(0f).setDuration(CROSSFADE_DURATION_MS).start()
        playerView.animate().alpha(1f).setDuration(CROSSFADE_DURATION_MS).start()
        imageRunnable?.let { handler.removeCallbacks(it) }

        player?.setMediaItem(MediaItem.fromUri(Uri.parse(url)))
        player?.prepare()
        player?.playWhenReady = true
    }

    private fun playImage(url: String) {
        hideTextContainer()
        loadingSpinner.visibility = View.VISIBLE
        playerView.animate().alpha(0f).setDuration(CROSSFADE_DURATION_MS).start()
        player?.pause()

        Glide.with(this)
            .load(url)
            .fitCenter()
            .into(imageView)

        handler.postDelayed({ loadingSpinner.visibility = View.GONE }, 500)
        imageView.animate().alpha(1f).setDuration(CROSSFADE_DURATION_MS).start()

        imageRunnable?.let { handler.removeCallbacks(it) }
        imageRunnable = Runnable { playNext() }
        handler.postDelayed(imageRunnable!!, IMAGE_DURATION_MS)
    }

    private fun playNext() {
        if (isOverrideActive && overrideItem != null) {
            playCurrent()
            return
        }
        currentIndex++
        if (currentIndex >= schedule.size) currentIndex = 0
        playCurrent()
    }

    // ── Text / Narrative Playback ──────────────────────────────────────────────

    private fun playTextMedia(item: ScheduleItem) {
        val mediaType = getMediaType(item)

        // Show text container with loading state
        textContainer.visibility = View.VISIBLE
        textContainer.alpha = 0f
        textContainer.animate().alpha(1f).setDuration(CROSSFADE_DURATION_MS).start()
        narrativeLoader.visibility = View.VISIBLE
        monolithStage.visibility = View.GONE
        readingProgressFill.visibility = View.GONE

        // Set loader messages matching browser
        when (mediaType) {
            "pdf" -> {
                loaderTitle.text = "Narrating via AI"
                loaderSubtitle.text = "Transforming document content into a professional storytelling experience..."
            }
            "text" -> {
                loaderTitle.text = "Opening the book"
                loaderSubtitle.text = "AI is crafting a professional narration for this content..."
            }
            "docx" -> {
                loaderTitle.text = "Curating narrative"
                loaderSubtitle.text = "Polishing the text and preparing a professional audiobook script..."
            }
        }

        // Fade out video/image
        playerView.animate().alpha(0f).setDuration(CROSSFADE_DURATION_MS).start()
        imageView.animate().alpha(0f).setDuration(CROSSFADE_DURATION_MS).start()
        player?.pause()

        lifecycleScope.launch {
            val text = ApiClient.fetchNarrative(item.mediaId, deviceToken)
            if (text.isNullOrBlank()) {
                Log.w(TAG, "Narrative empty for ${item.mediaId}")
                reportPlayback(item.mediaId, "ended")
                playNext()
                return@launch
            }

            // Only proceed if this is still the current media
            if (currentMedia?.mediaId != item.mediaId) return@launch

            runOnUiThread {
                narrativeLoader.visibility = View.GONE
                monolithStage.visibility = View.VISIBLE
                readingProgressFill.visibility = View.VISIBLE
                startTtsPlayback(text, item)
            }
        }
    }

    private fun startTtsPlayback(text: String, item: ScheduleItem) {
        ttsRenderId++
        val currentRenderId = ttsRenderId

        // Sanitize text
        val sanitized = text
            .replace(Regex("\\.\\.+"), ".")
            .replace(Regex("-+"), "-")
            .replace(Regex("\\s\\s+"), " ")
            .trim()

        if (sanitized.isEmpty()) {
            reportPlayback(item.mediaId, "ended")
            playNext()
            return
        }

        // Parse sentences — match browser logic
        val sentenceRegex = Regex("[^.!?।]+[.!?।]*")
        ttsSentences = sentenceRegex.findAll(sanitized).map { it.value.trim() }.filter { it.isNotEmpty() }.toList()
        if (ttsSentences.isEmpty()) {
            ttsSentences = listOf(sanitized)
        }
        ttsSentenceIndex = 0

        // Set TTS locale based on language
        val isBengali = containsBengali(sanitized)
        currentTtsLocale = if (isBengali) {
            Locale("bn", "BD")
        } else {
            Locale.US
        }

        tts?.let { engine ->
            val result = engine.setLanguage(currentTtsLocale)
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                // Fallback to default
                engine.language = Locale.getDefault()
            }
        }

        // Set utterance listener for progress tracking
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) {
                runOnUiThread {
                    if (ttsRenderId != currentRenderId || currentMedia?.mediaId != item.mediaId) return@runOnUiThread
                    ttsSentenceIndex++
                    if (ttsSentenceIndex >= ttsSentences.size) {
                        reportPlayback(item.mediaId, "ended")
                        playNext()
                    } else {
                        speakCurrentSentence(currentRenderId, item)
                    }
                }
            }
            override fun onError(utteranceId: String?) {
                runOnUiThread {
                    if (ttsRenderId != currentRenderId || currentMedia?.mediaId != item.mediaId) return@runOnUiThread
                    ttsSentenceIndex++
                    if (ttsSentenceIndex >= ttsSentences.size) {
                        reportPlayback(item.mediaId, "ended")
                        playNext()
                    } else {
                        speakCurrentSentence(currentRenderId, item)
                    }
                }
            }
        })

        speakCurrentSentence(currentRenderId, item)
    }

    private fun speakCurrentSentence(renderId: Int, item: ScheduleItem) {
        if (ttsRenderId != renderId || currentMedia?.mediaId != item.mediaId) return
        if (ttsSentenceIndex >= ttsSentences.size) {
            reportPlayback(item.mediaId, "ended")
            playNext()
            return
        }

        updateMonolithUi()

        val sentence = ttsSentences[ttsSentenceIndex]
        val utteranceId = "tts_${renderId}_${ttsSentenceIndex}"

        tts?.speak(sentence, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
    }

    private fun updateMonolithUi() {
        val prev = if (ttsSentenceIndex > 0) ttsSentences[ttsSentenceIndex - 1] else ""
        val curr = ttsSentences.getOrNull(ttsSentenceIndex) ?: ""
        val next = if (ttsSentenceIndex < ttsSentences.size - 1) ttsSentences[ttsSentenceIndex + 1] else ""

        ghostPrev.text = prev
        activeSentence.text = curr
        ghostNext.text = next

        // Update progress
        val pct = if (ttsSentences.isNotEmpty()) (ttsSentenceIndex.toFloat() / ttsSentences.size) else 0f
        val parentWidth = (readingProgressFill.parent as? View)?.width ?: 180
        readingProgressFill.layoutParams.width = (parentWidth * pct).toInt()
        readingProgressFill.requestLayout()
    }

    private fun containsBengali(text: String): Boolean {
        val bengaliRegex = Regex("[\\u0980-\\u09FF]")
        return bengaliRegex.containsMatchIn(text.substring(0, text.length.coerceAtMost(100)))
    }

    private fun hideTextContainer() {
        if (textContainer.visibility == View.VISIBLE) {
            textContainer.animate()
                .alpha(0f)
                .setDuration(CROSSFADE_DURATION_MS)
                .withEndAction {
                    textContainer.visibility = View.GONE
                }
                .start()
        }
        stopTts()
    }

    private fun stopTts() {
        ttsRenderId++
        tts?.stop()
        ttsSentences = emptyList()
        ttsSentenceIndex = 0
    }

    // ── Playback Control ───────────────────────────────────────────────────────

    /** Hard stop all playback — called when schedule strictly ends */
    private fun stopAllPlayback() {
        Log.d(TAG, "stopAllPlayback: halting all media")
        player?.stop()
        player?.clearMediaItems()
        imageRunnable?.let { handler.removeCallbacks(it) }
        imageRunnable = null
        playerView.animate().alpha(0f).setDuration(CROSSFADE_DURATION_MS).start()
        imageView.animate().alpha(0f).setDuration(CROSSFADE_DURATION_MS).start()
        hideTextContainer()
        hideScheduleInfo()
        currentMedia = null
    }

    private fun showNoContent(title: String, subtitle: String) {
        stopAllPlayback()
        infoTitle.text = title
        infoSubtitle.text = subtitle
        infoContainer.visibility = View.VISIBLE
        infoContainer.alpha = 0f
        infoContainer.animate().alpha(1f).setDuration(600).start()
    }

    private fun hideNoContent() {
        if (infoContainer.visibility == View.VISIBLE) {
            infoContainer.animate()
                .alpha(0f)
                .setDuration(400)
                .setListener(object : AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) {
                        infoContainer.visibility = View.GONE
                    }
                }).start()
        }
    }

    /** Shows schedule info pill matching browser #schedule-info design - permanently visible while playing */
    private fun showScheduleInfo(item: ScheduleItem) {
        val hierarchy = listOfNotNull(item.categoryName, item.contentTypeName)
            .filter { it.isNotBlank() }
            .joinToString(" → ")
        val title = item.contentName ?: item.filename ?: "Now Playing"

        textMeta.text = hierarchy.ifEmpty { "MPL-Dash-TV System" }
        textTitle.text = title

        scheduleInfoPill.visibility = View.VISIBLE
        scheduleInfoPill.alpha = 1f
    }

    private fun hideScheduleInfo() {
        scheduleInfoPill.visibility = View.GONE
        scheduleInfoPill.alpha = 0f
    }

    private fun reportPlayback(mediaId: String, event: String) {
        lifecycleScope.launch {
            try {
                ApiClient.reportPlayback(deviceId, deviceToken, mediaId, event, event == "ended")
            } catch (_: Exception) {}
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        showResetDialog()
    }

    override fun onPause() {
        super.onPause()
        player?.playWhenReady = false
        tts?.stop()
    }

    override fun onResume() {
        super.onResume()
        WindowInsetsControllerCompat(window, window.decorView).let { controller ->
            controller.hide(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.navigationBars())
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        player?.playWhenReady = true
        // Resume TTS if we were in the middle of a text
        if (currentMedia != null && getMediaType(currentMedia!!) in listOf("text", "pdf", "docx")) {
            // TTS will resume from next sentence on its own loop
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        heartbeatRunnable?.let { handler.removeCallbacks(it) }
        imageRunnable?.let { handler.removeCallbacks(it) }
        guardRunnable?.let { handler.removeCallbacks(it) }
        handler.removeCallbacks(clockRunnable)
        updateManager.stopPeriodicChecks()
        socketManager?.disconnect()
        player?.release()
        player = null
        tts?.stop()
        tts?.shutdown()
        tts = null
    }
}
