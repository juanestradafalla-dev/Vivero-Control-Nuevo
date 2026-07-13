package com.arles.viverocampo

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import com.arles.viverocampo.core.AppContainer
import com.arles.viverocampo.presentation.CampoRoute
import com.arles.viverocampo.presentation.CampoViewModel
import com.arles.viverocampo.presentation.CampoViewModelFactory
import com.arles.viverocampo.presentation.ViveroCampoTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = AppContainer.create(this)
        setContent {
            ViveroCampoTheme {
                val campoViewModel: CampoViewModel = viewModel(
                    factory = CampoViewModelFactory(container.repository, container.deviceId),
                )
                CampoRoute(campoViewModel)
            }
        }
    }
}
