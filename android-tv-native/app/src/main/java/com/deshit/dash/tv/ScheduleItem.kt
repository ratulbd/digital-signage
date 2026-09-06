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
    val status: String? = null,
    val deviceId: String? = null,
    val token: String? = null,
    val name: String? = null,
    val subcenterName: String? = null,
    val error: String? = null
)

data class DeviceInfo(
    val id: String,
    val name: String,
    val subcenterName: String?
)
