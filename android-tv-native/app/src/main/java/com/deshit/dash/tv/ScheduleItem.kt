package com.deshit.dash.tv

data class ScheduleItem(
    val id: String,
    val mediaId: String,
    val url: String?,
    val filename: String?,
    val type: String?,
    val tier: String?,
    val contentName: String?,
    val categoryName: String?,
    val contentTypeName: String?,
    val startDate: String?,
    val endDate: String?,
    val startTime: String?,
    val endTime: String?
)

data class PairingResponse(
    val status: String?,
    val deviceId: String?,
    val token: String?,
    val name: String?,
    val subcenterName: String?,
    val error: String?
)

data class DeviceInfo(
    val id: String,
    val name: String,
    val subcenterName: String?
)
