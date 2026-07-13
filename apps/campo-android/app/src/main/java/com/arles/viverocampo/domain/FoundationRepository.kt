package com.arles.viverocampo.domain

interface FoundationRepository {
    fun currentStatus(): FoundationStatus
}
