package com.sparkstack.sparkid

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class DeveloperApplication(val clientId: String, val name: String, val status: String)

/**
 * First-party HTTPS API client. No endpoint is configured until a controlled backend is deployed.
 * Never pass an Appwrite JWT to a third-party origin or store it on disk.
 */
class DeveloperApi(private val trustedOrigin: String? = null) {
    val configured: Boolean get() = trustedOrigin != null
    init {
        if (trustedOrigin != null) {
            val url = URL(trustedOrigin)
            require(url.protocol == "https" && url.userInfo == null && url.query == null &&
                url.ref == null && url.path.trimEnd('/').isEmpty() && url.port == -1 &&
                url.host.isNotBlank() && !url.host.equals("localhost", true)) {
                "Developer API must use a configured trusted HTTPS origin."
            }
        }
    }


    /** Registration is restricted to independently approved developers by the backend. */
    fun register(jwt: String, name: String, type: String, redirect: String): DeveloperApplication {
        val origin = trustedOrigin ?: throw IllegalStateException("Developer API is not configured.")
        require(name.trim().length in 3..80) { "Enter an application name (3–80 characters)." }
        require(type in setOf("web", "native", "confidential")) { "Choose a supported application type." }
        require(redirect.length <= 2048 && redirect.startsWith("https://") && !redirect.contains('#')) {
            "Enter a canonical HTTPS redirect URI."
        }
        require(jwt.matches(Regex("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+"))) { "Invalid authentication token." }
        val connection = URL(origin + "/v1/developer/apps").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.doOutput = true
            connection.setRequestProperty("Authorization", "Bearer $jwt")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.setRequestProperty("Cache-Control", "no-store")
            val payload = JSONObject().put("name", name.trim()).put("type", type)
                .put("redirects", org.json.JSONArray().put(redirect))
            connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            return when (connection.responseCode) {
                200, 201 -> {
                    val item = JSONObject(connection.inputStream.bufferedReader().use { it.readText() }).getJSONObject("application")
                    DeveloperApplication(item.getString("id"), item.getString("name"), item.getString("status"))
                }
                400, 413, 415 -> throw IllegalArgumentException("Application details or redirect URI were rejected.")
                401 -> throw IllegalStateException("Session expired. Sign in again.")
                403 -> throw IllegalStateException("Developer access is not approved or has been revoked.")
                else -> throw IllegalStateException("Developer service unavailable. Try again later.")
            }
        } finally { connection.disconnect() }
    }

    fun listOwnApplications(jwt: String): List<DeveloperApplication> {
        val origin = trustedOrigin ?: throw IllegalStateException("Developer API is not deployed yet.")
        require(jwt.matches(Regex("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+"))) {
            "Invalid first-party authentication token."
        }
        val connection = URL(origin + "/v1/developer/apps").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.setRequestProperty("Authorization", "Bearer $jwt")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Cache-Control", "no-store")
            return when (connection.responseCode) {
                200 -> {
                    val raw = connection.inputStream.bufferedReader().use { it.readText() }
                    val data = JSONObject(raw).getJSONArray("applications")
                    require(data.length() <= 100) { "Unexpected developer API response." }
                    (0 until data.length()).map { i ->
                        val item = data.getJSONObject(i)
                        DeveloperApplication(item.getString("id"), item.getString("name"), item.getString("status"))
                    }
                }
                401 -> throw IllegalStateException("Session expired. Sign in again.")
                403 -> throw IllegalStateException("Developer access is not approved or has been revoked.")
                else -> throw IllegalStateException("Developer service is unavailable. Please try again later.")
            }
        } finally { connection.disconnect() }
    }
}
