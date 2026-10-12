package com.sparkstack.sparkid.ui.theme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val SparkColors = darkColorScheme(
    primary = SparkGold,
    onPrimary = SparkBackground,
    secondary = SparkBlue,
    background = SparkBackground,
    onBackground = Color.White,
    surface = SparkSurface,
    onSurface = Color.White
)
@Composable
fun SparkIDTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = SparkColors, typography = Typography, content = content)
}
