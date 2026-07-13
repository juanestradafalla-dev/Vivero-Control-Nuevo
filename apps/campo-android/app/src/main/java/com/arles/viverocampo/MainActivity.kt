package com.arles.viverocampo

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.arles.viverocampo.presentation.FoundationRoute
import com.arles.viverocampo.presentation.ViveroCampoTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ViveroCampoTheme {
                FoundationRoute()
            }
        }
    }
}
