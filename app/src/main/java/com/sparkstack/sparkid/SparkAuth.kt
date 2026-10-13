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

    class MfaRequiredException : IllegalStateException("Authenticator verification required.")

    private class SessionExpiredException : IllegalStateException("Session expired. Please sign in again.")

    private fun request(method: String, path: String, body: JSONObject? = null, sendSession: Boolean = true): JSONObject {
        val connection = URL(endpoint + "/account" + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.setRequestProperty("X-Appwrite-Project", projectId)
            connection.setRequestProperty("Accept", "application/json")
            if (sendSession) sessionCookie?.let { connection.setRequestProperty("Cookie", it) }
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
                    401 -> when { 
                        path.isEmpty() && method == "GET" && json.optString("type") == "user_more_factors_required" -> throw MfaRequiredException()
                        path.isEmpty() && method == "GET" -> throw SessionExpiredException()
                        path == "/sessions/email" && method == "POST" -> "Email or password was not accepted. Check your details or reset your password."
                        else -> "Authentication required. Please sign in again."
                    }
                    409 -> "An account with this email already exists."
                    429 -> "Too many attempts. Please try again later."
                    else -> json.optString("message").ifBlank { "Request failed ($status)." }
                }
            )
            // Appwrite REST may return both modern and legacy project session cookies.
            // Forward both as a Cookie header, not just the first Set-Cookie value.
            val cookieName = "a_session_${projectId}"
            val freshCookies = connection.headerFields.entries
                .filter { it.key?.equals("Set-Cookie", ignoreCase = true) == true }
                .flatMap { it.value.orEmpty() }
                .map { it.substringBefore(';').trim() }
                .filter { cookie ->
                    val name = cookie.substringBefore('=')
                    val value = cookie.substringAfter('=', "")
                    (name == cookieName || name == "${cookieName}_legacy") &&
                        value.isNotBlank() && value.lowercase() != "deleted"
                }
            if (freshCookies.isNotEmpty()) {
                sessionCookie = freshCookies.joinToString("; ")
                saveCookie(sessionCookie!!)
            }
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
        clearCookie()
        request("POST", "/sessions/email", JSONObject().put("email", email.trim()).put("password", password), sendSession = false)
        if (sessionCookie == null) throw IllegalStateException("Sign-in succeeded but no Appwrite session cookie was received. Please retry.")
        try { parseUser(request("GET", "")) }
        catch (e: MfaRequiredException) { throw e }
        catch (e: Exception) { throw IllegalStateException("After successful sign-in: ${e.message ?: "Account lookup failed."}") }
    }

    fun register(name: String, email: String, password: String, done: (Result<SparkUser>) -> Unit) = execute(done) {
        request("POST", "", JSONObject().put("userId", UUID.randomUUID().toString())
            .put("name", name.trim()).put("email", email.trim()).put("password", password))
        clearCookie()
        request("POST", "/sessions/email", JSONObject().put("email", email.trim()).put("password", password), sendSession = false)
        if (sessionCookie == null) throw IllegalStateException("Account created but no Appwrite session cookie was received. Please sign in.")
        parseUser(request("GET", ""))
    }

    fun startTotpChallenge(done: (Result<String>) -> Unit) = execute(done) {
        val factors = request("GET", "/mfa/factors")
        check(factors.optBoolean("totp")) { "Authenticator app is not an available MFA factor for this account." }
        request("POST", "/mfa/challenge", JSONObject().put("factor", "totp")).getString("\$id")
    }

    fun completeTotpChallenge(challengeId: String, code: String, done: (Result<SparkUser>) -> Unit) = execute(done) {
        require(code.matches(Regex("[0-9]{6}"))) { "Enter the six-digit code from your authenticator app." }
        request("PUT", "/mfa/challenge", JSONObject().put("challengeId", challengeId).put("otp", code))
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
