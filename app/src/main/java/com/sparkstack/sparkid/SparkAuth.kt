package com.sparkstack.sparkid

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors

data class SparkUser(val id: String, val name: String, val email: String)

/** Public Appwrite Account REST API. Session is held in memory, not backed up or logged. */
class SparkAuth(@Suppress("UNUSED_PARAMETER") context: Context) {
    private val endpoint = "https://fra.cloud.appwrite.io/v1"
    private val projectId = "6accc223002dbb161c74"
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var sessionCookie: String? = null

    private fun request(method: String, path: String, body: JSONObject? = null): JSONObject {
        val connection = URL(endpoint + "/account" + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.setRequestProperty("X-Appwrite-Project", projectId)
            connection.setRequestProperty("Accept", "application/json")
            sessionCookie?.let { connection.setRequestProperty("Cookie", it) }
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val raw = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(raw) }.getOrElse { JSONObject() }
            if (status !in 200..299) throw IllegalStateException(
                when (status) {
                    401 -> "Incorrect credentials or expired session."
                    409 -> "An account with this email already exists."
                    429 -> "Too many attempts. Please try again later."
                    else -> json.optString("message").ifBlank { "Request failed ($status)." }
                }
            )
            connection.headerFields.entries
                .firstOrNull { it.key?.equals("Set-Cookie", ignoreCase = true) == true }
                ?.value?.firstOrNull { it.startsWith("a_session_", ignoreCase = true) && !it.startsWith("a_session_${projectId}_legacy", ignoreCase = true) }
                ?.let { sessionCookie = it.substringBefore(';') }
            return json
        } finally { connection.disconnect() }
    }

    private fun parseUser(json: JSONObject) = SparkUser(
        json.getString("\$id"), json.optString("name"), json.getString("email")
    )

    fun login(email: String, password: String, done: (Result<SparkUser>) -> Unit) = execute(done) {
        request("POST", "/sessions/email", JSONObject().put("email", email.trim()).put("password", password))
        parseUser(request("GET", ""))
    }

    fun register(name: String, email: String, password: String, done: (Result<SparkUser>) -> Unit) = execute(done) {
        request("POST", "", JSONObject().put("userId", UUID.randomUUID().toString())
            .put("name", name.trim()).put("email", email.trim()).put("password", password))
        request("POST", "/sessions/email", JSONObject().put("email", email.trim()).put("password", password))
        parseUser(request("GET", ""))
    }

    fun logout(done: (Result<Unit>) -> Unit) = execute(done) {
        request("DELETE", "/sessions/current")
        sessionCookie = null
        Unit
    }

    private fun <T> execute(done: (Result<T>) -> Unit, action: () -> T) {
        worker.execute {
            val result = runCatching(action)
            main.post { done(result) }
        }
    }
}
