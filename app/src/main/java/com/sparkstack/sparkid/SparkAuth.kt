package com.sparkstack.sparkid

import android.content.Context
import android.net.Uri
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

    class MfaRequiredException : IllegalStateException("Additional verification required.")

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

    fun startEmailChallenge(done: (Result<String>) -> Unit) = execute(done) {
        val factors = request("GET", "/mfa/factors")
        check(factors.optBoolean("email")) {
            "Email verification unavailable for this account. Available factors: " +
                listOf("email", "phone", "recoveryCode").filter { factors.optBoolean(it) }
                    .joinToString(", ").ifBlank { "none reported" } +
                ". Confirm you are signing in to the intended account."
        }
        request("POST", "/mfa/challenge", JSONObject().put("factor", "email")).getString("\$id")
    }

    fun completeEmailChallenge(challengeId: String, code: String, done: (Result<SparkUser>) -> Unit) = execute(done) {
        require(code.matches(Regex("[0-9]{6}"))) { "Enter the six-digit code sent to your email." }
        request("PUT", "/mfa/challenge", JSONObject().put("challengeId", challengeId).put("otp", code))
        parseUser(request("GET", ""))
    }

    /**
     * Mint a short-lived first-party JWT only after the completed Appwrite session
     * can access /account. Never persist, log, or send this JWT to third-party apps.
     * The callback must deliver it only to a trusted first-party API transport.
     */
    fun createFirstPartyJwt(done: (Result<String>) -> Unit) = execute(done) {
        check(sessionCookie != null) { "Sign in before accessing developer services." }
        parseUser(request("GET", "")) // Appwrite enforces completed MFA here.
        val jwt = request("POST", "/jwts").getString("jwt")
        check(jwt.isNotBlank()) { "Appwrite did not issue an authentication token." }
        jwt
    }

    fun completeSparkStudioLink(
        requestToken: String,
        expectedState: String,
        done: (Result<String>) -> Unit,
    ) = execute(done) {
        require(requestToken.matches(Regex("[A-Za-z0-9_-]{43}"))) {
            "The Spark Studio link request is invalid or expired."
        }
        require(expectedState.matches(Regex("[A-Za-z0-9_-]{43}"))) {
            "The Spark Studio link request is invalid or expired."
        }
        check(sessionCookie != null) { "Sign in to Spark ID before linking." }
        parseUser(request("GET", "")) // Requires a valid, fully authenticated Appwrite session.
        val jwt = request("POST", "/jwts").getString("jwt")
        check(jwt.isNotBlank()) { "Appwrite did not issue an authentication token." }

        val publishableKey = BuildConfig.SPARK_STUDIO_PUBLISHABLE_KEY
        check(publishableKey.isNotBlank()) {
            "Spark Studio account linking is not configured in this Spark ID build."
        }
        val connection = URL(
            "https://omwraqylzsphvufvwcbr.supabase.co/functions/v1/complete-spark-id-link"
        ).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.setRequestProperty("apikey", publishableKey)
            connection.setRequestProperty("X-Spark-ID-JWT", jwt)
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true
            connection.outputStream.use {
                it.write(
                    JSONObject()
                        .put("requestToken", requestToken)
                        .put("confirm", true)
                        .toString()
                        .toByteArray(Charsets.UTF_8)
                )
            }
            val status = connection.responseCode
            val raw = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            val response = runCatching { JSONObject(raw) }.getOrElse { JSONObject() }
            if (status !in 200..299) {
                throw IllegalStateException(
                    response.optString("error")
                        .ifBlank { "Spark Studio account linking could not be completed." }
                )
            }
            check(response.optBoolean("linked")) {
                "Spark Studio did not confirm the account link."
            }
            val callback = Uri.parse(response.optString("callbackUrl"))
            check(
                callback.scheme == "sparkstudio" &&
                    callback.host == "identity-link-callback" &&
                    callback.userInfo == null &&
                    callback.getQueryParameter("state") == expectedState
            ) {
                "Spark Studio returned an invalid account-link confirmation."
            }
            callback.toString()
        } finally {
            connection.disconnect()
        }
    }

    private fun oidcServerBase(): String {
        val configured = BuildConfig.SPARK_ID_OIDC_SERVER_URL.trim().trimEnd('/')
        val parsed = runCatching { URL(configured) }.getOrElse {
            throw IllegalStateException("Spark ID sign-in server is not configured for this build.")
        }
        check(
            parsed.protocol == "https" && parsed.host.isNotBlank() &&
                parsed.userInfo == null && parsed.query == null && parsed.ref == null &&
                (parsed.path.isNullOrEmpty() || parsed.path == "/")
        ) { "Spark ID sign-in server must use its configured HTTPS address." }
        return parsed.toString().trimEnd('/')
    }

    private fun oidcHandoffRequest(path: String, ticket: String, appwriteJwt: String? = null): JSONObject {
        require(ticket.matches(Regex("[A-Za-z0-9_-]{43}"))) {
            "The Spark Studio sign-in request is invalid or expired."
        }
        val connection = URL(oidcServerBase() + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json")
            appwriteJwt?.let { connection.setRequestProperty("X-Spark-ID-JWT", it) }
            connection.doOutput = true
            connection.outputStream.use {
                it.write(JSONObject().put("ticket", ticket).toString().toByteArray(Charsets.UTF_8))
            }
            val status = connection.responseCode
            val raw = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            val response = runCatching { JSONObject(raw) }.getOrElse { JSONObject() }
            if (status !in 200..299) {
                throw IllegalStateException(
                    when (response.optString("error")) {
                        "account_not_eligible" -> "Verify your Spark ID email before using it to sign in to Spark Studio."
                        "request_expired" -> "This Spark Studio sign-in request expired. Return to the browser and try again."
                        else -> "Spark ID could not complete this sign-in request. Please retry."
                    }
                )
            }
            return response
        } finally {
            connection.disconnect()
        }
    }

    fun loadSparkStudioOidcRequest(ticket: String, done: (Result<Pair<String, List<String>>>) -> Unit) = execute(done) {
        val response = oidcHandoffRequest("/internal/oidc/handoff/details", ticket)
        val scopesJson = response.optJSONArray("scopes")
            ?: throw IllegalStateException("Spark ID returned an invalid sign-in request.")
        val scopes = (0 until scopesJson.length()).map { scopesJson.getString(it) }
        val clientName = response.optString("clientName")
        check(clientName == "Spark Studio" && scopes.isNotEmpty() && scopes.all { it in setOf("openid", "profile", "email") }) {
            "Spark ID returned an unsupported sign-in request."
        }
        clientName to scopes
    }

    fun approveSparkStudioOidcRequest(ticket: String, done: (Result<Unit>) -> Unit) = execute(done) {
        check(sessionCookie != null) { "Sign in to Spark ID before approving this request." }
        parseUser(request("GET", "")) // Appwrite enforces any required MFA here.
        val jwt = request("POST", "/jwts").getString("jwt")
        check(jwt.isNotBlank()) { "Appwrite did not issue an authentication token." }
        check(oidcHandoffRequest("/internal/oidc/handoff/approve", ticket, jwt).optBoolean("approved")) {
            "Spark ID did not confirm this sign-in request."
        }
        Unit
    }

    fun denySparkStudioOidcRequest(ticket: String, done: (Result<Unit>) -> Unit) = execute(done) {
        check(oidcHandoffRequest("/internal/oidc/handoff/deny", ticket).optBoolean("denied")) {
            "This Spark Studio sign-in request has expired."
        }
        Unit
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
