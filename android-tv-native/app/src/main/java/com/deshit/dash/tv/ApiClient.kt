package com.deshit.dash.tv

import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

object ApiClient {
    const val DEFAULT_SERVER_URL = "https://api.sbmoffice.net"
    private const val GITHUB_CONFIG_URL = "https://raw.githubusercontent.com/ratulbd/digital-signage/main/config/server.json"

    data class ServerConfig(
        val apiUrl: String?,
        val webTvUrl: String?,
        val cmsUrl: String?,
        val latestAppVersion: Int?,
        val latestAppVersionName: String?,
        val apkUrl: String?,
        val releaseNotes: String?
    )

    data class AppVersionInfo(
        val versionCode: Int,
        val versionName: String,
        val apkUrl: String,
        val releaseNotes: String?
    )

    val OPERATIONAL_TIMEZONE: java.util.TimeZone = java.util.TimeZone.getTimeZone("Asia/Dhaka")

    @Volatile
    private var serverClockOffsetMs: Long = 0L
    @Volatile
    private var hasSyncedClock: Boolean = false

    private var baseUrl = DEFAULT_SERVER_URL + "/api"
    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val request = chain.request()
            val response = chain.proceed(request)
            val dateHeader = response.header("Date")
            if (!dateHeader.isNullOrBlank()) {
                try {
                    val format = SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z", Locale.US)
                    val serverDate = format.parse(dateHeader)
                    if (serverDate != null) {
                        serverClockOffsetMs = serverDate.time - System.currentTimeMillis()
                        hasSyncedClock = true
                        Log.d("ApiClient", "Server clock calibrated: offset=${serverClockOffsetMs}ms (server: $dateHeader)")
                    }
                } catch (e: Exception) {
                    Log.w("ApiClient", "Failed to parse server Date header: $dateHeader")
                }
            }
            response
        }
        .build()

    fun getSyncedTimeMs(): Long = System.currentTimeMillis() + serverClockOffsetMs
    fun getServerClockOffsetMs(): Long = serverClockOffsetMs
    fun hasSyncedClock(): Boolean = hasSyncedClock

    fun getCalibratedCalendar(): java.util.Calendar {
        val cal = java.util.Calendar.getInstance(OPERATIONAL_TIMEZONE)
        cal.timeInMillis = getSyncedTimeMs()
        return cal
    }

    fun setBaseUrl(url: String) {
        val cleanUrl = if (url.endsWith("/")) url.substring(0, url.length - 1) else url
        baseUrl = if (cleanUrl.endsWith("/api")) cleanUrl else "$cleanUrl/api"
    }

    fun getBaseUrl(): String = baseUrl
    fun getServerRootUrl(): String = baseUrl.removeSuffix("/api")

    suspend fun resolveServerUrl(cachedUrl: String? = null): String = withContext(Dispatchers.IO) {
        try {
            val fastClient = OkHttpClient.Builder()
                .connectTimeout(2500, TimeUnit.MILLISECONDS)
                .readTimeout(2500, TimeUnit.MILLISECONDS)
                .build()
            val req = Request.Builder().url(GITHUB_CONFIG_URL).build()
            fastClient.newCall(req).execute().use { res ->
                if (res.isSuccessful) {
                    val body = res.body?.string() ?: ""
                    val config = gson.fromJson(body, ServerConfig::class.java)
                    if (!config.apiUrl.isNullOrBlank()) {
                        Log.d("ApiClient", "Resolved dynamic server URL from GitHub config: ${config.apiUrl}")
                        setBaseUrl(config.apiUrl)
                        return@withContext config.apiUrl
                    }
                }
            }
        } catch (e: Exception) {
            Log.w("ApiClient", "GitHub config lookup skipped or failed: ${e.message}")
        }

        val fallback = if (!cachedUrl.isNullOrBlank()) cachedUrl else DEFAULT_SERVER_URL
        Log.d("ApiClient", "Using fallback server URL: $fallback")
        setBaseUrl(fallback)
        fallback
    }

    suspend fun checkAppVersion(): AppVersionInfo? = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder()
                .url("$baseUrl/app/version")
                .header("Cache-Control", "no-cache")
                .build()
            client.newCall(req).execute().use { res ->
                if (res.isSuccessful) {
                    val body = res.body?.string() ?: return@use null
                    return@withContext gson.fromJson(body, AppVersionInfo::class.java)
                }
                null
            }
        } catch (e: Exception) {
            Log.w("ApiClient", "Direct app/version check failed: ${e.message}")
        }

        try {
            val req = Request.Builder().url(GITHUB_CONFIG_URL).build()
            client.newCall(req).execute().use { res ->
                if (res.isSuccessful) {
                    val body = res.body?.string() ?: return@use null
                    val config = gson.fromJson(body, ServerConfig::class.java)
                    if (config.latestAppVersion != null && !config.apkUrl.isNullOrBlank()) {
                        return@withContext AppVersionInfo(
                            versionCode = config.latestAppVersion,
                            versionName = config.latestAppVersionName ?: "latest",
                            apkUrl = config.apkUrl,
                            releaseNotes = config.releaseNotes
                        )
                    }
                }
                null
            }
        } catch (e: Exception) {
            Log.w("ApiClient", "GitHub app/version check failed: ${e.message}")
        }
        null
    }

    private fun jsonBody(json: String) = json.toRequestBody("application/json".toMediaType())

    suspend fun checkHealth(ip: String, timeoutMs: Long = 800): Boolean = withContext(Dispatchers.IO) {
        try {
            val testClient = OkHttpClient.Builder()
                .connectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .build()
            val req = Request.Builder()
                .url("http://$ip:3001/api/health")
                .build()
            testClient.newCall(req).execute().use { res ->
                val ok = res.isSuccessful
                if (ok) Log.d("ApiClient", "FOUND server at $ip:3001")
                ok
            }
        } catch (_: Exception) {
            false
        }
    }

    suspend fun validateDevice(deviceId: String, token: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder()
                .url("$baseUrl/devices/$deviceId/schedule")
                .header("Authorization", "Bearer $token")
                .header("Cache-Control", "no-cache")
                .build()
            client.newCall(req).execute().use { res ->
                Log.d("ApiClient", "Validate device [${res.code}]")
                res.isSuccessful
            }
        } catch (e: Exception) {
            Log.e("ApiClient", "Validate failed: ${e.javaClass.simpleName}: ${e.message}")
            false
        }
    }

    private suspend fun confirmCode(code: String, endpoint: String): PairingResponse = withContext(Dispatchers.IO) {
        val url = "$baseUrl/devices/$endpoint"
        Log.d("ApiClient", "Confirming to: $url with code: $code")
        val req = Request.Builder()
            .url(url)
            .post(jsonBody("{\"code\":\"$code\"}"))
            .build()
        client.newCall(req).execute().use { res ->
            val body = res.body?.string()?.trim() ?: "{}"
            Log.d("ApiClient", "Confirm response [${res.code}]: $body")
            if (!body.startsWith("{")) {
                return@use PairingResponse(
                    status = "error", 
                    error = "Invalid response from server (${res.code}). Please ensure Server URL is https://api.sbmoffice.net"
                )
            }
            try {
                val result = gson.fromJson(body, PairingResponse::class.java)
                if (result.status == null && result.error != null) {
                    return@use PairingResponse(status = "error", deviceId = null, token = null, name = null, subcenterName = null, error = result.error)
                }
                result
            } catch (e: Exception) {
                PairingResponse(status = "error", error = "Failed to parse response: ${e.message}")
            }
        }
    }

    suspend fun pairDevice(code: String): PairingResponse = confirmCode(code, "pair/confirm")

    suspend fun repairDevice(code: String): PairingResponse = confirmCode(code, "repair/confirm")

    suspend fun fetchSchedule(deviceId: String, token: String): List<ScheduleItem> = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url("$baseUrl/devices/$deviceId/schedule")
            .header("Authorization", "Bearer $token")
            .header("Cache-Control", "no-cache")
            .build()
        client.newCall(req).execute().use { res ->
            val body = res.body?.string() ?: "[]"
            val type = object : TypeToken<List<ScheduleItem>>() {}.type
            gson.fromJson(body, type)
        }
    }

    suspend fun fetchDeviceInfo(deviceId: String, token: String): DeviceInfo? = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url("$baseUrl/devices/$deviceId/info")
            .header("Authorization", "Bearer $token")
            .build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) return@withContext null
            val body = res.body?.string() ?: return@withContext null
            gson.fromJson(body, DeviceInfo::class.java)
        }
    }

    private fun nowIso(): String {
        return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date())
    }

    suspend fun sendHeartbeat(deviceId: String, token: String) = withContext(Dispatchers.IO) {
        val body = "{\"timestamp\":\"${nowIso()}\",\"online\":true}"
        val req = Request.Builder()
            .url("$baseUrl/devices/$deviceId/heartbeat")
            .header("Authorization", "Bearer $token")
            .header("Content-Type", "application/json")
            .post(jsonBody(body))
            .build()
        try { client.newCall(req).execute().close() } catch (_: IOException) {}
    }

    suspend fun reportPlayback(deviceId: String, token: String, mediaId: String, event: String, completed: Boolean) = withContext(Dispatchers.IO) {
        val body = "{\"mediaId\":\"$mediaId\",\"tier\":3,\"event\":\"$event\",\"completed\":$completed,\"timestamp\":\"${nowIso()}\"}"
        val req = Request.Builder()
            .url("$baseUrl/devices/$deviceId/playback")
            .header("Authorization", "Bearer $token")
            .header("Content-Type", "application/json")
            .post(jsonBody(body))
            .build()
        try { client.newCall(req).execute().close() } catch (_: IOException) {}
    }

    data class NarrativeResponse(val text: String?)

    suspend fun fetchNarrative(mediaId: String, token: String): String? = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url("$baseUrl/media/narrative")
            .header("Authorization", "Bearer $token")
            .header("Content-Type", "application/json")
            .post(jsonBody("{\"mediaId\":\"$mediaId\"}"))
            .build()
        try {
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return@withContext null
                val body = res.body?.string() ?: return@withContext null
                val data = gson.fromJson(body, NarrativeResponse::class.java)
                data.text
            }
        } catch (_: Exception) {
            null
        }
    }
}
