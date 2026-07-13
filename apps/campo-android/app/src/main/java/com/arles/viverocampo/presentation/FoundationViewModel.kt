package com.arles.viverocampo.presentation

import androidx.lifecycle.ViewModel
import com.arles.viverocampo.data.StaticFoundationRepository
import com.arles.viverocampo.domain.FoundationRepository

class FoundationViewModel(
    repository: FoundationRepository = StaticFoundationRepository(),
) : ViewModel() {
    val uiState = repository.currentStatus()
}
