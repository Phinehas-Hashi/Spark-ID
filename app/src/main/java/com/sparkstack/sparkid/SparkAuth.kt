package com.sparkstack.sparkid

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors

data class SparkUser(val id: String, val name: String, val email: String, val emailVerified: Boolean)

/** Public Appwrite Account REST API. Session is held in memory, not backed up or logged. */
class SparkAuth(context: Context) {
    private val prefs = context.getSharedPreferences("spark_auth", Context.MODE_PRIVATE)
    private val keyAlias = "spark_id_session_key"
    private fun secretKey(): java.security.Key {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        store.getKey(keyAlias, null)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }
    private fun saveCookie(cookie: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encoded = Base64.encodeToString(cipher.iv + cipher.doFinal(cookie.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        prefs.edit().putString("session", encoded).apply()
    }
    private fun loadCookie(): String? {
        val stored = prefs.getString("session", null) ?: return null
        return try {
            val bytes = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
        } catch (_: Exception) {
            prefs.edit().remove("session").apply()
            null
        }
    }
    private fun clearCookie() {
        sessionCookie = null
        prefs.edit().remove("session").apply()
    }
    private val endpoint = "https://fra.cloud.appwrite.io/v1"
    private val projectId = "6accc223002dbb161c74"
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var sessionCookie: String? = null

    private class SessionExpiredException : IllegalStateException("Session expired. Please sign in again.")

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
                    401 -> if (path.isEmpty() && method == "GET") throw SessionExpiredException() else "Incorrect credentials or expired session."
                    409 -> "An account with this email already exists."
                    429 -> "Too many attempts. Please try again later."
                    else -> json.optString("message").ifBlank { "Request failed ($status)." }
                }
            )
            connection.headerFields.entries
                .firstOrNull { it.key?.equals("Set-Cookie", ignoreCase = true) == true }
                ?.value?.firstOrNull { it.startsWith("a_session_", ignoreCase = true) && !it.startsWith("a_session_${projectId}_legacy", ignoreCase = true) }
                ?.let { sessionCookie = it.substringBefore(';'); saveCookie(sessionCookie!!) }
            return json
        } finally { connection.disconnect() }
    }

    private fun parseUser(json: JSONObject) = SparkUser(
        json.getString("\$id"), json.optString("name"), json.getString("email"), json.optBoolean("emailVerification", false)
    )

    fun restore(done: (Result<SparkUser?>) -> Unit) = execute(done) {
        sessionCookie = loadCookie()
        if (sessionCookie == null) null else {
            try { parseUser(request("GET", "")) }
            catch (e: Exception) {
                if (e is SessionExpiredException) { clearCookie(); null } else throw e
            }
        }
    }

    fun refresh(done: (Result<SparkUser>) -> Unit) = execute(done) {
        parseUser(request("GET", ""))
    }

    private val callbackBase = "https://phinehas-hashi.github.io/Spark-ID/"

    fun sendVerification(done: (Result<Unit>) -> Unit) = execute(done) {
        request("POST", "/verification", JSONObject().put("url", callbackBase + "?mode=verify"))
        Unit
    }

    fun sendRecovery(email: String, done: (Result<Unit>) -> Unit) = execute(done) {
        require(email.trim().contains("@")) { "Enter a valid email address." }
        request("POST", "/recovery", JSONObject().put("email", email.trim()).put("url", callbackBase + "?mode=recover"))
        Unit
    }

    fun updateName(name: String, done: (Result<SparkUser>) -> Unit) = execute(done) {
        require(name.trim().isNotEmpty()) { "Enter a display name." }
        require(name.trim().length <= 128) { "Display name is too long." }
        parseUser(request("PATCH", "/name", JSONObject().put("name", name.trim())))
    }

    fun changePassword(oldPassword: String, newPassword: String, done: (Result<Unit>) -> Unit) = execute(done) {
        require(newPassword.length >= 8) { "New password must contain at least 8 characters." }
        request("PATCH", "/password", JSONObject().put("password", newPassword).put("oldPassword", oldPassword))
        Unit
    }

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
        clearCookie()
        Unit
    }

    private fun <T> execute(done: (Result<T>) -> Unit, action: () -> T) {
        worker.execute {
            val result = runCatching(action)
            main.post { done(result) }
        }
    }
}
