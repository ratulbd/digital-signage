package com.deshit.dash.tv

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

object MediaCacheManager {
    private const val TAG = "MediaCacheManager"
    private const val CACHE_DIR_NAME = "media_cache"
    private const val BUFFER_SIZE = 64 * 1024 // 64 KB chunks

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    // Track active downloads by mediaId to avoid duplicate requests
    private val activeDownloads = ConcurrentHashMap<String, MutableList<(bytesRead: Long, totalBytes: Long, percentage: Int) -> Unit>>()
    private val downloadMutex = Mutex()

    fun getCacheDirectory(context: Context): File {
        val dir = File(context.filesDir, CACHE_DIR_NAME)
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }

    fun getCachedFile(context: Context, item: ScheduleItem): File {
        val ext = item.url?.substringAfterLast('.', "")?.substringBefore('?') ?: "mp4"
        val rawName = (item.filename ?: "media").replace(Regex("[^a-zA-Z0-9._-]"), "_")
        val safeName = "${item.mediaId}_$rawName"
        val fileName = if (safeName.endsWith(".$ext", ignoreCase = true)) safeName else "$safeName.$ext"
        return File(getCacheDirectory(context), fileName)
    }

    fun isCached(context: Context, item: ScheduleItem): Boolean {
        val file = getCachedFile(context, item)
        if (!file.exists() || file.length() <= 0L) {
            return false
        }
        val expectedSize = item.size ?: 0L
        if (expectedSize > 0L) {
            // Valid if file size matches expected size (within 100 bytes tolerance for chunk boundaries)
            return file.length() >= expectedSize
        }
        return true
    }

    suspend fun downloadMedia(
        context: Context,
        item: ScheduleItem,
        onProgress: ((bytesRead: Long, totalBytes: Long, percentage: Int) -> Unit)? = null
    ): File? = withContext(Dispatchers.IO) {
        val mediaId = item.mediaId
        val targetFile = getCachedFile(context, item)

        // 1. If already cached and valid, notify 100% and return immediately
        if (isCached(context, item)) {
            val length = targetFile.length()
            onProgress?.invoke(length, length, 100)
            return@withContext targetFile
        }

        val url = item.url
        if (url.isNullOrBlank()) {
            Log.e(TAG, "Cannot download: URL is null for media $mediaId")
            return@withContext null
        }

        // 2. Check if a download is already in progress for this mediaId
        var isFirstDownloader = false
        downloadMutex.withLock {
            val listeners = activeDownloads.getOrPut(mediaId) {
                isFirstDownloader = true
                mutableListOf()
            }
            if (onProgress != null) {
                listeners.add(onProgress)
            }
        }

        if (!isFirstDownloader) {
            Log.d(TAG, "Download already in progress for $mediaId, attached progress listener")
            // Wait until the other coroutine finishes the download
            while (activeDownloads.containsKey(mediaId)) {
                kotlinx.coroutines.delay(200)
            }
            return@withContext if (isCached(context, item)) targetFile else null
        }

        val tempFile = File(getCacheDirectory(context), "${targetFile.name}.tmp")

        try {
            Log.d(TAG, "Starting download for media $mediaId from $url")
            val request = Request.Builder().url(url).build()
            val response = httpClient.newCall(request).execute()

            if (!response.isSuccessful) {
                Log.e(TAG, "Failed to download $mediaId: HTTP ${response.code}")
                response.close()
                return@withContext null
            }

            val body = response.body
            if (body == null) {
                Log.e(TAG, "Response body was null for $mediaId")
                return@withContext null
            }

            val contentLength = if (body.contentLength() > 0L) {
                body.contentLength()
            } else {
                item.size ?: -1L
            }

            var totalBytesRead = 0L
            val buffer = ByteArray(BUFFER_SIZE)

            body.byteStream().use { input ->
                FileOutputStream(tempFile).use { output ->
                    var bytesRead: Int
                    var lastReportedPct = -1

                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        totalBytesRead += bytesRead

                        val pct = if (contentLength > 0L) {
                            ((totalBytesRead * 100L) / contentLength).toInt().coerceIn(0, 100)
                        } else {
                            -1
                        }

                        if (pct != lastReportedPct) {
                            lastReportedPct = pct
                            notifyProgress(mediaId, totalBytesRead, contentLength, pct)
                        }
                    }
                    output.flush()
                }
            }

            // Verify integrity
            if (contentLength > 0L && totalBytesRead < contentLength) {
                Log.w(TAG, "Download incomplete for $mediaId: read $totalBytesRead of $contentLength")
                tempFile.delete()
                return@withContext null
            }

            // Atomic rename to final target file
            if (tempFile.exists()) {
                if (targetFile.exists()) targetFile.delete()
                if (tempFile.renameTo(targetFile)) {
                    Log.d(TAG, "Successfully cached media $mediaId (${targetFile.length()} bytes)")
                    notifyProgress(mediaId, targetFile.length(), targetFile.length(), 100)
                    return@withContext targetFile
                } else {
                    Log.e(TAG, "Failed to rename temp file to ${targetFile.absolutePath}")
                    tempFile.delete()
                }
            }
            null
        } catch (e: Exception) {
            Log.e(TAG, "Download error for media $mediaId", e)
            if (tempFile.exists()) tempFile.delete()
            null
        } finally {
            downloadMutex.withLock {
                activeDownloads.remove(mediaId)
            }
        }
    }

    private fun notifyProgress(mediaId: String, bytesRead: Long, totalBytes: Long, percentage: Int) {
        val listeners = activeDownloads[mediaId] ?: return
        synchronized(listeners) {
            for (listener in listeners) {
                try {
                    listener(bytesRead, totalBytes, percentage)
                } catch (_: Exception) {}
            }
        }
    }

    fun pruneUnused(context: Context, activeMediaIds: Set<String>) {
        try {
            val cacheDir = getCacheDirectory(context)
            val files = cacheDir.listFiles() ?: return
            for (file in files) {
                if (file.name.endsWith(".tmp")) {
                    // Clean up abandoned temp files older than 5 minutes
                    if (System.currentTimeMillis() - file.lastModified() > 300000L) {
                        file.delete()
                    }
                    continue
                }
                // Check if file belongs to any active schedule item
                val isKeep = activeMediaIds.any { id -> file.name.startsWith("${id}_") }
                if (!isKeep) {
                    Log.d(TAG, "Storage Management: Evicting unreferenced cached file: ${file.name}")
                    file.delete()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error pruning cache", e)
        }
    }
}
