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
    private var baseUrl = ""
    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    fun setBaseUrl(url: String) {
        val cleanUrl = if (url.endsWith("/")) url.substring(0, url.length - 1) else url
        baseUrl = if (cleanUrl.endsWith("/api")) cleanUrl else "$cleanUrl/api"
    }

    fun getBaseUrl(): String = baseUrl

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
