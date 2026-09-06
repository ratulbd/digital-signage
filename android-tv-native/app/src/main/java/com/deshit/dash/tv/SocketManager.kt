package com.deshit.dash.tv

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

class SocketManager(
    private val deviceId: String,
    private val deviceName: String?,
    private val token: String,
    private val onOverride: (mediaId: String, url: String, tier: String) -> Unit,
    private val onResume: () -> Unit,
    private val onSync: () -> Unit
) {
    private var socket: Socket? = null
    private val TAG = "SocketManager"

    fun connect() {
        try {
            val baseUrl = ApiClient.getBaseUrl().replace("/api", "")
            socket = IO.socket(baseUrl, IO.Options().apply {
                reconnection = true
                reconnectionDelay = 1000
                reconnectionDelayMax = 10000
                transports = arrayOf("websocket", "polling")
            })

            socket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "Socket connected")
                socket?.emit("register", JSONObject().apply {
                    put("deviceId", deviceId)
                    put("deviceName", deviceName ?: "TV")
                    put("token", token)
                })
            }

            socket?.on("PLAY_OVERRIDE") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    val mediaId = data?.optString("mediaId") ?: return@on
                    val url = data.optString("url") ?: return@on
                    val tier = data.optString("tier") ?: "TIER_1"
                    Log.d(TAG, "PLAY_OVERRIDE: $mediaId")
                    onOverride(mediaId, url, tier)
                }
            }

            socket?.on("RESUME_SCHEDULE") {
                Log.d(TAG, "RESUME_SCHEDULE")
                onResume()
            }

            socket?.on("SYNC_CONTENT") {
                Log.d(TAG, "SYNC_CONTENT")
                onSync()
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.d(TAG, "Socket disconnected")
            }

            socket?.on(Socket.EVENT_CONNECT_ERROR) {
                Log.w(TAG, "Socket connect error")
            }

            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Socket init error", e)
        }
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }
}
