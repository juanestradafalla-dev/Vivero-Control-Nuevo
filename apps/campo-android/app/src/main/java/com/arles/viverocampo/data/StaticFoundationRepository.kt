package com.arles.viverocampo.data

import com.arles.viverocampo.core.TechnicalIdentifiers
import com.arles.viverocampo.domain.FoundationRepository
import com.arles.viverocampo.domain.FoundationStatus

class StaticFoundationRepository : FoundationRepository {
    override fun currentStatus() = FoundationStatus(
        title = "Vivero Campo",
        message = "Fundación técnica instalada",
        firebaseStatus = TechnicalIdentifiers.FIREBASE_STATUS,
    )
}
