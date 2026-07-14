package com.arles.viverocampo

import android.app.Application
import com.arles.viverocampo.core.AppContainer

class ViveroCampoApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer.create(this)
    }
}
