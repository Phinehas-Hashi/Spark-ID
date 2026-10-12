package com.sparkstack.sparkid

import android.os.Bundle
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

private enum class Screen { Welcome, Login, Register, Dashboard, Identity }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { SparkIDTheme { SparkApp() } }
    }
}

@Composable
private fun SparkApp() {
    var screen by remember { mutableStateOf(Screen.Welcome) }
    BackHandler(screen != Screen.Welcome) {
        screen = when (screen) {
            Screen.Identity -> Screen.Dashboard
            Screen.Dashboard, Screen.Login, Screen.Register -> Screen.Welcome
            Screen.Welcome -> Screen.Welcome
        }
    }
    Surface(color = Background, modifier = Modifier.fillMaxSize()) {
        when (screen) {
            Screen.Welcome -> Welcome(onLogin = { screen = Screen.Login }, onRegister = { screen = Screen.Register })
            Screen.Login -> AuthScreen(false, onBack = { screen = Screen.Welcome }, onSwitch = { screen = Screen.Register })
            Screen.Register -> AuthScreen(true, onBack = { screen = Screen.Welcome }, onSwitch = { screen = Screen.Login })
            Screen.Dashboard -> Dashboard(onIdentity = { screen = Screen.Identity }, onExit = { screen = Screen.Welcome })
            Screen.Identity -> Identity(onBack = { screen = Screen.Dashboard })
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
        Text("UI preview • Accounts are not active yet", color = Muted, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center, fontSize = 12.sp)
    }
}

@Composable
private fun AuthScreen(register: Boolean, onBack: () -> Unit, onSwitch: () -> Unit) {
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
        Action(if (register) "Create account (coming soon)" else "Sign in (coming soon)", {}, enabled = false)
        Text("Authentication will be enabled after secure Appwrite configuration. No credentials are submitted or stored in this preview.", color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
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
private fun Dashboard(onIdentity: () -> Unit, onExit: () -> Unit) {
    Page {
        Text("SPARK STACK INTERNATIONAL", color = Gold, fontSize = 12.sp, letterSpacing = 2.sp, fontWeight = FontWeight.Bold)
        Text("Your universe starts here.", color = Color.White, fontSize = 30.sp, lineHeight = 37.sp, fontWeight = FontWeight.Bold)
        Text("Experience preview — not a signed-in account.", color = Muted)
        Spacer(Modifier.height(12.dp))
        InfoCard("✦ Spark ID", "Your connected identity card, profile and account settings.")
        Action("View identity preview", onIdentity)
        InfoCard("Spark Academy", "Learn new skills and grow your career. Integration planned.")
        InfoCard("SparkSocial", "Find your people and build your network. Integration planned.")
        InfoCard("Ignite Pay", "A separate secure payments experience. Integration planned.")
        Action("Return to welcome", onExit, primary = false)
    }
}

@Composable
private fun Identity(onBack: () -> Unit) {
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
            Text("DIGITAL IDENTITY • PREVIEW", color = Gold, fontSize = 12.sp, letterSpacing = 1.sp)
            Text("Your name", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Text("Spark ID not issued", color = Muted)
            HorizontalDivider(color = Muted.copy(alpha = 0.3f))
            Text("Verification: Not started", color = Muted)
            Text("This is a visual sample, not proof of identity or account ownership.", color = Muted, fontSize = 12.sp)
        }
        InfoCard("Security first", "Real identity issuance, account security and connected-app permissions will be implemented with the backend.")
    }
}
