package com.sparkstack.sparkid

import android.os.Bundle
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

private enum class Screen { Welcome, Login, Register, Dashboard, Identity, Security }

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
    var screen by remember { mutableStateOf(Screen.Welcome) }
    var checkingSession by remember { mutableStateOf(true) }
    var user by remember { mutableStateOf<SparkUser?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var securityMessage by remember { mutableStateOf<String?>(null) }
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
                .onFailure { error = it.message ?: "Authentication failed. Please retry." }
        }
        if (register) auth.register(name, email, password, callback)
        else auth.login(email, password, callback)
    }
    BackHandler(!checkingSession && screen != Screen.Welcome) {
        screen = when (screen) {
            Screen.Identity, Screen.Security -> Screen.Dashboard
            Screen.Dashboard -> Screen.Dashboard
            Screen.Login, Screen.Register -> Screen.Welcome
            Screen.Welcome -> Screen.Welcome
        }
    }
    Surface(color = Background, modifier = Modifier.fillMaxSize()) {
        if (checkingSession) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Gold)
                    Spacer(Modifier.height(18.dp))
                    Text("Checking your Spark ID…", color = Muted)
                }
            }
        } else when (screen) {
            Screen.Welcome -> Welcome(onLogin = { screen = Screen.Login }, onRegister = { screen = Screen.Register })
            Screen.Login -> AuthScreen(false, busy, error, onSubmit = { name, email, password -> authenticate(false, name, email, password) }, onBack = { error = null; screen = Screen.Welcome }, onSwitch = { error = null; screen = Screen.Register })
            Screen.Register -> AuthScreen(true, busy, error, onSubmit = { name, email, password -> authenticate(true, name, email, password) }, onBack = { error = null; screen = Screen.Welcome }, onSwitch = { error = null; screen = Screen.Login })
            Screen.Dashboard -> if (user != null) Dashboard(user!!, busy, error, onIdentity = { screen = Screen.Identity }, onSecurity = { screen = Screen.Security }, onExit = {
                error = null; busy = true
                auth.logout { result ->
                    busy = false
                    result.onSuccess { user = null; screen = Screen.Welcome }
                        .onFailure { error = it.message ?: "Could not sign out." }
                }
            }) else Welcome(onLogin = { screen = Screen.Login }, onRegister = { screen = Screen.Register })
            Screen.Identity -> if (user != null) Identity(user!!, onBack = { screen = Screen.Dashboard }) else Welcome(onLogin = { screen = Screen.Login }, onRegister = { screen = Screen.Register })
            Screen.Security -> if (user != null) Security(user!!, busy, error, securityMessage,
                onPasswordChange = { oldPassword, newPassword ->
                    busy = true; error = null; securityMessage = null
                    auth.changePassword(oldPassword, newPassword) { result ->
                        busy = false
                        result.onSuccess { securityMessage = "Password updated successfully." }
                            .onFailure { error = it.message ?: "Password update failed." }
                    }
                }, onRefresh = {
                    busy = true; error = null
                    auth.refresh { result ->
                        busy = false
                        result.onSuccess { user = it }.onFailure { error = it.message }
                    }
                }, onBack = { screen = Screen.Dashboard })
                else Welcome(onLogin = { screen = Screen.Login }, onRegister = { screen = Screen.Register })
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
private fun AuthScreen(register: Boolean, busy: Boolean, error: String?, onSubmit: (String, String, String) -> Unit, onBack: () -> Unit, onSwitch: () -> Unit) {
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
        TextButton(onClick = onSwitch) {
            Text(if (register) "Already registered? Sign in" else "New here? Create Spark ID", color = Gold)
        }
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
private fun Dashboard(user: SparkUser, busy: Boolean, error: String?, onIdentity: () -> Unit, onSecurity: () -> Unit, onExit: () -> Unit) {
    Page {
        Text("SPARK STACK INTERNATIONAL", color = Gold, fontSize = 12.sp, letterSpacing = 2.sp, fontWeight = FontWeight.Bold)
        Text("Welcome, ${user.name.ifBlank { user.email }}.", color = Color.White, fontSize = 30.sp, lineHeight = 37.sp, fontWeight = FontWeight.Bold)
        Text(user.email, color = Muted)
        Spacer(Modifier.height(12.dp))
        InfoCard("✦ Spark ID", "Your connected identity card, profile and account settings.")
        Action("View Spark ID profile", onIdentity)
        Action("Account security", onSecurity, primary = false)
        InfoCard("Spark Academy", "Learn new skills and grow your career. Integration planned.")
        InfoCard("SparkSocial", "Find your people and build your network. Integration planned.")
        InfoCard("Ignite Pay", "A separate secure payments experience. Integration planned.")
        if (error != null) Text(error, color = Color(0xFFFF7777))
        Action(if (busy) "Signing out…" else "Sign out", onExit, primary = false, enabled = !busy)
    }
}

@Composable
private fun Identity(user: SparkUser, onBack: () -> Unit) {
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
        InfoCard("Security first", "Real identity issuance, account security and connected-app permissions will be implemented with the backend.")
    }
}

@Composable
private fun Security(user: SparkUser, busy: Boolean, error: String?, message: String?, onPasswordChange: (String, String) -> Unit, onRefresh: () -> Unit, onBack: () -> Unit) {
    var oldPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    Page {
        TextButton(onClick = onBack) { Text("← Dashboard", color = Gold) }
        Text("Account security", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text("Your account status is read from Appwrite, not assumed from sign-in.", color = Muted)
        InfoCard("Email address", user.email)
        InfoCard("Email verification", if (user.emailVerified) "Verified" else "Not verified")
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
        Text("Email verification and password recovery links will be enabled with a registered app callback URL. This screen does not claim identity/KYC verification.", color = Muted, fontSize = 12.sp)
    }
}
