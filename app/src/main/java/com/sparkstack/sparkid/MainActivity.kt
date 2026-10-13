package com.sparkstack.sparkid

import android.os.Bundle
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.togetherWith
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.ui.platform.LocalContext
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sparkstack.sparkid.ui.theme.SparkIDTheme

private val Gold = Color(0xFFFFB703)
private val Blue = Color(0xFF219EBC)
private val Muted = Color(0xFF9AA6BD)
private val Panel = Color(0xFF111B30)
private val Background = Color(0xFF050816)

private enum class Screen { Welcome, Login, Register, Mfa, Dashboard, Identity, Security, Recovery, Apps, Developer, Notifications, FounderConsole }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { SparkIDTheme { SparkApp() } }
    }
}

@Composable
private fun SparkApp() {
    val context = LocalContext.current
    val auth = remember { SparkAuth(context.applicationContext) }
    val developerApi = remember { DeveloperApi() }
    var screen by remember { mutableStateOf(Screen.Welcome) }
    var checkingSession by remember { mutableStateOf(true) }
    var user by remember { mutableStateOf<SparkUser?>(null) }
    var busy by remember { mutableStateOf(false) }
    var mfaChallengeId by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var securityMessage by remember { mutableStateOf<String?>(null) }
    var profileMessage by remember { mutableStateOf<String?>(null) }
    var developerLoading by remember { mutableStateOf(false) }
    var developerError by remember { mutableStateOf<String?>(null) }
    var developerApps by remember { mutableStateOf<List<DeveloperApplication>?>(null) }
    val developerWorker = remember { java.util.concurrent.Executors.newSingleThreadExecutor() }
    val developerMain = remember { android.os.Handler(android.os.Looper.getMainLooper()) }
    LaunchedEffect(Unit) {
        auth.restore { result ->
            result.onSuccess { restored -> if (restored != null) { user = restored; screen = Screen.Dashboard } }
            checkingSession = false
        }
    }
    fun authenticate(register: Boolean, name: String, email: String, password: String) {
        error = null
        busy = true
        val callback: (Result<SparkUser>) -> Unit = { result ->
            busy = false
            result.onSuccess { user = it; screen = Screen.Dashboard }
                .onFailure { failure ->
                    if (failure is SparkAuth.MfaRequiredException) {
                        busy = true
                        auth.startEmailChallenge { challenge ->
                            busy = false
                            challenge.onSuccess { mfaChallengeId = it; error = null; screen = Screen.Mfa }
                                .onFailure { error = it.message ?: "Could not send email verification code." }
                        }
                    } else error = failure.message ?: "Authentication failed. Please retry."
                }
        }
        if (register) auth.register(name, email, password, callback)
        else auth.login(email, password, callback)
    }
    BackHandler(!checkingSession && screen != Screen.Welcome) {
        screen = when (screen) {
            Screen.Identity, Screen.Apps, Screen.Notifications -> Screen.Dashboard
            Screen.Security -> Screen.Identity
            Screen.FounderConsole -> Screen.Developer
            Screen.Developer -> Screen.Dashboard
            Screen.Dashboard -> Screen.Dashboard
            Screen.Login, Screen.Register, Screen.Recovery, Screen.Mfa -> Screen.Welcome
            Screen.Welcome -> Screen.Welcome
        }
    }
    val tabs = setOf(Screen.Dashboard, Screen.Apps, Screen.Notifications, Screen.Identity)
    Scaffold(containerColor = Background, bottomBar = {
        if (!checkingSession && user != null && screen in tabs) {
            NavigationBar(containerColor = Panel) {
                listOf(
                    Triple(Screen.Dashboard, "Home", "⌂"),
                    Triple(Screen.Apps, "Apps", "▦"),
                    Triple(Screen.Notifications, "Alerts", "♧"),
                    Triple(Screen.Identity, "Profile", "◉")
                ).forEach { (destination, label, symbol) ->
                    NavigationBarItem(
                        selected = screen == destination, onClick = { screen = destination },
                        icon = { Text(symbol, fontSize = 22.sp) }, label = { Text(label) },
                        alwaysShowLabel = true,
                        colors = NavigationBarItemDefaults.colors(selectedIconColor = Background, selectedTextColor = Gold, indicatorColor = Gold, unselectedIconColor = Muted, unselectedTextColor = Muted)
                    )
                }
            }
        }
    }) { insets ->
    Box(Modifier.fillMaxSize().padding(insets)) {
        if (checkingSession) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Gold)
                    Spacer(Modifier.height(18.dp))
                    Text("Checking your Spark ID…", color = Muted)
                }
            }
        } else AnimatedContent(targetState = screen, transitionSpec = {
            slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.Left, tween(260)) + androidx.compose.animation.fadeIn(tween(260)) togetherWith
                slideOutOfContainer(AnimatedContentTransitionScope.SlideDirection.Left, tween(220)) + androidx.compose.animation.fadeOut(tween(220))
        }, label = "Spark ID navigation") { activeScreen -> when (activeScreen) {
            Screen.Welcome -> Welcome(onLogin = { screen = Screen.Login }, onRegister = { screen = Screen.Register })
            Screen.Login -> AuthScreen(false, busy, error, onSubmit = { name, email, password -> authenticate(false, name, email, password) }, onBack = { error = null; screen = Screen.Welcome }, onSwitch = { error = null; screen = Screen.Register }, onForgot = { error = null; securityMessage = null; screen = Screen.Recovery })
            Screen.Register -> AuthScreen(true, busy, error, onSubmit = { name, email, password -> authenticate(true, name, email, password) }, onBack = { error = null; screen = Screen.Welcome }, onSwitch = { error = null; screen = Screen.Login })
            Screen.Mfa -> MfaScreen(busy, error, onSubmit = { code ->
                val id = mfaChallengeId
                if (id == null) error = "Verification challenge missing. Please sign in again."
                else {
                    busy = true; error = null
                    auth.completeEmailChallenge(id, code) { result ->
                        busy = false
                        result.onSuccess { user = it; mfaChallengeId = null; screen = Screen.Dashboard }
                            .onFailure { error = it.message ?: "Verification failed. Try a fresh code." }
                    }
                }
            }, onBack = { mfaChallengeId = null; error = null; screen = Screen.Login })
            Screen.Recovery -> Recovery(busy, error, securityMessage, onSend = { email ->
                busy = true; error = null; securityMessage = null
                auth.sendRecovery(email) { result ->
                    busy = false
                    result.onSuccess { securityMessage = "If the address is eligible, Appwrite will send a recovery email. Check your inbox and spam folder." }
                        .onFailure { error = it.message ?: "Could not request recovery." }
                }
            }, onBack = { error = null; securityMessage = null; screen = Screen.Login })
            Screen.Dashboard -> if (user != null) Dashboard(user!!, busy, error, onIdentity = { screen = Screen.Identity }, onSecurity = { screen = Screen.Security }, onApps = { screen = Screen.Apps }, onDeveloper = { screen = Screen.Developer }) else Welcome(onLogin = { screen = Screen.Login }, onRegister = { screen = Screen.Register })
            Screen.FounderConsole -> if (user != null) FounderConsole(onBack = { screen = Screen.Developer }) else Welcome(onLogin = { screen = Screen.Login }, onRegister = { screen = Screen.Register })
            Screen.Notifications -> if (user != null) NotificationsScreen(onBack = { screen = Screen.Dashboard }) else Welcome(onLogin = { screen = Screen.Login }, onRegister = { screen = Screen.Register })
            Screen.Apps -> if (user != null) ConnectedApps(onBack = { screen = Screen.Dashboard }) else Welcome(onLogin = { screen = Screen.Login }, onRegister = { screen = Screen.Register })
            Screen.Developer -> if (user != null) DeveloperHub(
                apiConfigured = developerApi.configured,
                loading = developerLoading, error = developerError, applications = developerApps,
                onRefresh = {
                    if (developerApi.configured && !developerLoading) {
                        developerLoading = true; developerError = null; developerApps = null
                        auth.createFirstPartyJwt { jwtResult ->
                            jwtResult.onSuccess { jwt ->
                                developerWorker.execute {
                                    val result = runCatching { developerApi.listOwnApplications(jwt) }
                                    developerMain.post {
                                        developerLoading = false
                                        result.onSuccess { developerApps = it }
                                            .onFailure { developerError = it.message ?: "Could not load developer applications." }
                                    }
                                }
                            }.onFailure {
                                developerLoading = false
                                developerError = it.message ?: "Please sign in again."
                            }
                        }
                    }
                },
                onBack = { screen = Screen.Dashboard }, onFounder = { screen = Screen.FounderConsole }) else Welcome(onLogin = { screen = Screen.Login }, onRegister = { screen = Screen.Register })
            Screen.Identity -> if (user != null) Identity(user!!, busy, error, profileMessage,
                onSecurity = { screen = Screen.Security }, onDeveloper = { screen = Screen.Developer }, onSave = { name ->
                    busy = true; error = null; profileMessage = null
                    auth.updateName(name) { result ->
                        busy = false
                        result.onSuccess { user = it; profileMessage = "Profile updated successfully." }
                            .onFailure { error = it.message ?: "Could not update profile." }
                    }
                }, onBack = { screen = Screen.Dashboard }) else Welcome(onLogin = { screen = Screen.Login }, onRegister = { screen = Screen.Register })
            Screen.Security -> if (user != null) Security(user!!, busy, error, securityMessage,
                onPasswordChange = { oldPassword, newPassword ->
                    busy = true; error = null; securityMessage = null
                    auth.changePassword(oldPassword, newPassword) { result ->
                        busy = false
                        result.onSuccess { securityMessage = "Password updated successfully." }
                            .onFailure { error = it.message ?: "Password update failed." }
                    }
                }, onVerify = {
                    busy = true; error = null; securityMessage = null
                    auth.sendVerification { result ->
                        busy = false
                        result.onSuccess { securityMessage = "Verification email requested. Open the link in your inbox, then refresh your account status." }
                            .onFailure { error = it.message ?: "Could not send verification email." }
                    }
                }, onRefresh = {
                    busy = true; error = null
                    auth.refresh { result ->
                        busy = false
                        result.onSuccess { user = it }.onFailure { error = it.message }
                    }
                }, onExit = {
                error = null; busy = true
                auth.logout { result ->
                    busy = false
                    result.onSuccess { user = null; screen = Screen.Welcome }
                        .onFailure { error = it.message ?: "Could not sign out." }
                }
            }, onBack = { screen = Screen.Identity })
                else Welcome(onLogin = { screen = Screen.Login }, onRegister = { screen = Screen.Register })
        } }
    }
    }
}

@Composable
private fun Brand(modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(88.dp).background(
                Brush.linearGradient(listOf(Gold, Blue)),
                RoundedCornerShape(26.dp)
            ), contentAlignment = Alignment.Center
        ) { Text("✦", fontSize = 54.sp, color = Background, fontWeight = FontWeight.Black) }
        Spacer(Modifier.height(18.dp))
        Text("SPARK ID", fontSize = 31.sp, fontWeight = FontWeight.Black, letterSpacing = 3.sp, color = Color.White)
        Spacer(Modifier.height(6.dp))
        Text("One identity. Every opportunity.", color = Muted, fontSize = 14.sp)
    }
}

@Composable
private fun Page(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .statusBarsPadding().navigationBarsPadding().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
        content = content
    )
}

@Composable
private fun Action(text: String, onClick: () -> Unit, primary: Boolean = true, enabled: Boolean = true) {
    Button(
        onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().height(54.dp),
        shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (primary) Gold else Panel,
            contentColor = if (primary) Background else Color.White
        )
    ) { Text(text, fontWeight = FontWeight.Bold, fontSize = 16.sp) }
}

@Composable
private fun Welcome(onLogin: () -> Unit, onRegister: () -> Unit) {
    Page {
        Spacer(Modifier.height(75.dp))
        Brand(Modifier.fillMaxWidth())
        Spacer(Modifier.height(44.dp))
        Text("Your world.\nOne secure identity.", color = Color.White, fontSize = 35.sp, lineHeight = 42.sp, fontWeight = FontWeight.Bold)
        Text("A single home for your Spark Stack experience. Learn, connect, build and unlock opportunities.", color = Muted, lineHeight = 23.sp)
        Spacer(Modifier.height(20.dp))
        Action("Create Spark ID", onRegister)
        Action("I already have an account", onLogin, primary = false)
        Text("Accounts powered by Appwrite", color = Muted, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center, fontSize = 12.sp)
    }
}

@Composable
private fun AuthScreen(register: Boolean, busy: Boolean, error: String?, onSubmit: (String, String, String) -> Unit, onBack: () -> Unit, onSwitch: () -> Unit, onForgot: (() -> Unit)? = null) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Page {
        TextButton(onClick = onBack) { Text("← Back", color = Gold) }
        Spacer(Modifier.height(22.dp))
        Text(if (register) "Create your Spark ID" else "Welcome back", fontSize = 30.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Text(if (register) "Your identity across the Spark Stack ecosystem." else "Sign in to your connected world.", color = Muted)
        if (register) {
            SparkField(name, { name = it }, "Full name")
        }
        SparkField(email, { email = it }, "Email address", KeyboardType.Email)
        SparkField(password, { password = it }, "Password", password = true)
        if (error != null) Text(error, color = Color(0xFFFF7777), fontSize = 13.sp)
        if (busy) CircularProgressIndicator(color = Gold)
        Action(if (register) "Create account" else "Sign in", { onSubmit(name, email, password) },
            enabled = !busy && email.contains("@") && password.length >= 8 && (!register || name.isNotBlank()))
        Text("Password must be at least 8 characters.", color = Muted, fontSize = 12.sp)
        if (!register && onForgot != null) TextButton(onClick = onForgot, enabled = !busy) { Text("Forgot password?", color = Gold) }
        TextButton(onClick = onSwitch) {
            Text(if (register) "Already registered? Sign in" else "New here? Create Spark ID", color = Gold)
        }
    }
}

@Composable
private fun MfaScreen(busy: Boolean, error: String?, onSubmit: (String) -> Unit, onBack: () -> Unit) {
    var code by remember { mutableStateOf("") }
    Page {
        TextButton(onClick = onBack, enabled = !busy) { Text("← Back to sign in", color = Gold) }
        Text("Email verification", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Text("Enter the six-digit verification code Appwrite sent to your account email. Check spam if it does not arrive.", color = Muted)
        OutlinedTextField(value = code, onValueChange = { input ->
            if (input.length <= 6 && input.all { it.isDigit() }) code = input
        }, label = { Text("Six-digit code") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            modifier = Modifier.fillMaxWidth())
        if (error != null) Text(error, color = Color(0xFFFF7777))
        if (busy) CircularProgressIndicator(color = Gold)
        Action("Verify and continue", { onSubmit(code) }, enabled = !busy && code.length == 6)
        Text("Codes expire quickly. If your code fails, sign in again to request a new challenge. Never share your code.", color = Muted, fontSize = 12.sp)
    }
}

@Composable
private fun SparkField(value: String, onValue: (String) -> Unit, label: String, keyboardType: KeyboardType = KeyboardType.Text, password: Boolean = false) {
    OutlinedTextField(
        value = value, onValueChange = onValue, label = { Text(label) },
        modifier = Modifier.fillMaxWidth(), singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboardType),
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = Color.White, unfocusedTextColor = Color.White,
            focusedBorderColor = Gold, unfocusedBorderColor = Muted,
            focusedLabelColor = Gold, unfocusedLabelColor = Muted,
            cursorColor = Gold
        )
    )
}

@Composable
private fun InfoCard(title: String, detail: String) {
    Column(Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(20.dp)).padding(20.dp)) {
        Text(title, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(detail, color = Muted, lineHeight = 21.sp)
    }
}

@Composable
private fun Dashboard(user: SparkUser, busy: Boolean, error: String?, onIdentity: () -> Unit, onSecurity: () -> Unit, onApps: () -> Unit, onDeveloper: () -> Unit) {
    Page {
        Text("SPARK STACK  /  IDENTITY", color = Gold, fontSize = 12.sp, letterSpacing = 2.sp, fontWeight = FontWeight.Bold)
        Text("Your identity hub", color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.Bold)
        Text("Welcome back, ${user.name.ifBlank { "Spark member" }}", color = Muted)
        Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Color(0xFF193654), Panel)), RoundedCornerShape(24.dp))
            .border(1.dp, Blue.copy(alpha = .55f), RoundedCornerShape(24.dp)).padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("✦  SPARK ID", color = Gold, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
            Text(user.name.ifBlank { "Spark member" }, color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Bold)
            Text(user.email, color = Muted)
            HorizontalDivider(color = Muted.copy(alpha = .25f))
            Text(if (user.emailVerified) "✓ Email verified" else "○ Email verification pending", color = if (user.emailVerified) Color(0xFF79D7B0) else Gold)
            Text("ACCOUNT  •  ${user.id.take(12)}…", color = Muted, fontSize = 11.sp)
        }
        Text("Manage", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Action("My Spark ID  →", onIdentity)
        Action("Account security  →", onSecurity, primary = false)
        Action("Connected apps  →", onApps, primary = false)
        Text("Build with Spark ID", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        InfoCard("Developer platform", "Explore integration architecture, developer onboarding and the upcoming secure authorization platform.")
        Action("Open Developer Hub  →", onDeveloper, primary = false)
        if (error != null) Text(error, color = Color(0xFFFF7777))
    }
}

@Composable
private fun ConnectedApps(onBack: () -> Unit) {
    Page {
        Text("Connected apps", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text("Your future home for reviewing and managing access to Spark Stack services.", color = Muted, lineHeight = 22.sp)
        InfoCard("Spark Stack Academy", "Learning and student services • Integration planned")
        InfoCard("SparkSocial", "Community and social identity • Integration planned")
        InfoCard("Ignite Pay", "Payments will require separate financial safeguards and explicit authorization • Integration planned")
        InfoCard("Spark Studio", "Creative and developer services • Integration planned")
        Text("No app connections are reported yet. This directory does not grant access or share your account credentials.", color = Muted, fontSize = 12.sp)
    }
}

@Composable
private fun DeveloperHub(apiConfigured: Boolean, loading: Boolean, error: String?, applications: List<DeveloperApplication>?, onRefresh: () -> Unit, onBack: () -> Unit, onFounder: () -> Unit) {
    val context = LocalContext.current
    Page {
        TextButton(onClick = onBack) { Text("← Identity hub", color = Gold) }
        Text("Developer Hub", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text("Build experiences that can eventually connect to Spark ID.", color = Muted, lineHeight = 22.sp)
        InfoCard("Developer API", if (apiConfigured) "A trusted backend is configured. Developer access still requires independent approval." else "Not connected: a trusted HTTPS developer backend has not been deployed. No JWT is requested or sent.")
        if (apiConfigured) {
            Action(if (loading) "Loading applications…" else "Refresh my applications", onRefresh, enabled = !loading)
            if (loading) CircularProgressIndicator(color = Gold)
            if (error != null) Text(error, color = Color(0xFFFF7777), fontSize = 13.sp)
            if (applications != null) {
                if (applications.isEmpty()) InfoCard("My applications", "No registered applications found.")
                applications.forEach { app -> InfoCard(app.name, "Client ID: ${app.clientId} • Status: ${app.status}") }
            }
        }
        InfoCard("Developer access • Coming soon", "Third-party app registration, client identifiers, approved redirect URIs and integration credentials are not issued yet.")
        InfoCard("Integration model", "Planned standards-based OAuth 2.1 / OpenID Connect authorization with PKCE for public clients, scoped permissions and server-side token validation.")
        InfoCard("App management", "Future tools: register an app, manage redirect URIs, rotate credentials, inspect integration activity and revoke access.")
        InfoCard("Security first", "Never collect another user's Spark ID password in your own app. Never embed privileged Appwrite API keys or share Android session cookies between apps.")
        InfoCard("Current status", "Spark ID account registration, sign-in, email verification and password recovery work in the first-party Android app. Public developer authentication APIs are not live.")
        Action("Founder / Admin console status  →", onFounder, primary = false)
        Action("Read developer integration guide  ↗", onClick = {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://phinehas-hashi.github.io/Spark-ID/developers.html")))
        })
    }
}

@Composable
private fun Identity(user: SparkUser, busy: Boolean, error: String?, message: String?, onSave: (String) -> Unit, onSecurity: () -> Unit, onDeveloper: () -> Unit, onBack: () -> Unit) {
    var editedName by remember(user.id) { mutableStateOf(user.name) }
    Page {
        TextButton(onClick = onBack) { Text("← Dashboard", color = Gold) }
        Spacer(Modifier.height(18.dp))
        Brand(Modifier.fillMaxWidth())
        Spacer(Modifier.height(20.dp))
        Column(
            Modifier.fillMaxWidth().background(
                Brush.linearGradient(listOf(Color(0xFF182F4D), Panel)),
                RoundedCornerShape(24.dp)
            ).border(1.dp, Blue, RoundedCornerShape(24.dp)).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("SPARK ACCOUNT • PROFILE", color = Gold, fontSize = 12.sp, letterSpacing = 1.sp)
            Text(user.name.ifBlank { "Spark member" }, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Text(user.email, color = Muted)
            HorizontalDivider(color = Muted.copy(alpha = 0.3f))
            Text("Account ID: ${user.id}", color = Muted, fontSize = 12.sp)
            Text("Account profile only. This is not government ID or verified KYC.", color = Muted, fontSize = 12.sp)
        }
        Action("Security & password  →", onSecurity, primary = false)
        Action("Developer Hub  →", onDeveloper, primary = false)
        Text("Edit account profile", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.Bold)
        SparkField(editedName, { editedName = it }, "Display name")
        if (error != null) Text(error, color = Color(0xFFFF7777), fontSize = 13.sp)
        if (message != null) Text(message, color = Gold, fontSize = 13.sp)
        if (busy) CircularProgressIndicator(color = Gold)
        Action("Save profile", { onSave(editedName.trim()) }, enabled = !busy && editedName.trim().isNotEmpty() && editedName.trim() != user.name)
        InfoCard("About your profile", "Your display name is stored in your Appwrite account. Changing it does not verify your legal identity.")
    }
}

@Composable
private fun Security(user: SparkUser, busy: Boolean, error: String?, message: String?, onPasswordChange: (String, String) -> Unit, onVerify: () -> Unit, onRefresh: () -> Unit, onExit: () -> Unit, onBack: () -> Unit) {
    var oldPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    Page {
        TextButton(onClick = onBack) { Text("← Profile", color = Gold) }
        Text("Account security", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text("Your account status is read from Appwrite, not assumed from sign-in.", color = Muted)
        InfoCard("Email address", user.email)
        InfoCard("Email verification", if (user.emailVerified) "Verified" else "Not verified")
        if (!user.emailVerified) Action("Send verification email", onVerify, enabled = !busy)
        InfoCard("Session", "Your current session is encrypted on this device and checked against Appwrite at startup.")
        Text("Change password", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.Bold)
        SparkField(oldPassword, { oldPassword = it }, "Current password", password = true)
        SparkField(newPassword, { newPassword = it }, "New password", password = true)
        SparkField(confirmPassword, { confirmPassword = it }, "Confirm new password", password = true)
        if (newPassword.isNotEmpty() && confirmPassword.isNotEmpty() && newPassword != confirmPassword)
            Text("New passwords do not match.", color = Color(0xFFFF7777), fontSize = 12.sp)
        if (error != null) Text(error, color = Color(0xFFFF7777))
        if (message != null) Text(message, color = Gold)
        if (busy) CircularProgressIndicator(color = Gold)
        Action("Update password", {
            onPasswordChange(oldPassword, newPassword)
            oldPassword = ""; newPassword = ""; confirmPassword = ""
        }, enabled = !busy && oldPassword.isNotEmpty() && newPassword.length >= 8 && newPassword == confirmPassword)
        Action(if (busy) "Checking…" else "Refresh account status", onRefresh, primary = false, enabled = !busy)
        HorizontalDivider(color = Muted.copy(alpha = .3f))
        Text("Settings", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.Bold)
        Text("Manage this device session. Signing out does not delete your Spark ID.", color = Muted, fontSize = 13.sp)
        var confirmSignOut by remember { mutableStateOf(false) }
        if (confirmSignOut) {
            Text("Sign out of Spark ID on this device?", color = Color.White)
            Action("Confirm sign out", onExit, primary = false, enabled = !busy)
            TextButton(onClick = { confirmSignOut = false }) { Text("Cancel", color = Gold) }
        } else {
            Action("Sign out", { confirmSignOut = true }, primary = false, enabled = !busy)
        }
        Text("Verification and recovery links open the Spark ID HTTPS callback page. Email verification does not constitute government identity/KYC verification.", color = Muted, fontSize = 12.sp)
    }
}

@Composable
private fun Recovery(busy: Boolean, error: String?, message: String?, onSend: (String) -> Unit, onBack: () -> Unit) {
    var email by remember { mutableStateOf("") }
    Page {
        TextButton(onClick = onBack) { Text("← Sign in", color = Gold) }
        Spacer(Modifier.height(22.dp))
        Text("Recover your Spark ID", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text("Enter your account email. A recovery link will open our secure HTTPS callback page.", color = Muted)
        SparkField(email, { email = it }, "Email address", KeyboardType.Email)
        if (error != null) Text(error, color = Color(0xFFFF7777), fontSize = 13.sp)
        if (message != null) Text(message, color = Gold, fontSize = 13.sp)
        if (busy) CircularProgressIndicator(color = Gold)
        Action("Send recovery email", { onSend(email.trim()) }, enabled = !busy && email.trim().contains("@"))
        Text("Never share recovery links or codes. After resetting your password, return here to sign in.", color = Muted, fontSize = 12.sp)
    }
}

@Composable
private fun NotificationsScreen(onBack: () -> Unit) {
    Page {
        Text("Notifications", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text("Your security and developer activity, in one place.", color = Muted)
        InfoCard("No live notifications connected", "This screen is ready for an authenticated notifications service. No events, unread counts, or real-time delivery are simulated.")
        InfoCard("Privacy by design", "Notifications must be scoped to your verified account. Founder and developer events require separate server-side authorization.")
    }
}

@Composable
private fun FounderConsole(onBack: () -> Unit) {
    Page {
        TextButton(onClick = onBack) { Text("← Developer Hub", color = Gold) }
        Text("Founder Control Center", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text("Privileged workspace · Access not yet enabled", color = Gold, fontWeight = FontWeight.Bold)
        InfoCard("Secure access required", "The Android client cannot grant founder privileges. A trusted backend must authenticate the session, verify the administrator identity, and authorize each request.")
        InfoCard("Developer approvals", "Pending reviews, approval and revocation actions will be loaded from the protected service. No sample records are treated as live.")
        InfoCard("Platform intelligence", "Registered applications, verified developers and operational health will be displayed only after authenticated metrics endpoints are deployed.")
        InfoCard("Security and audit", "Every privileged action must produce a durable audit event. Until then, write controls remain unavailable.")
        Text("This screen is a secure integration placeholder, not an administrator login or authorization bypass.", color = Muted, fontSize = 12.sp)
    }
}
