package com.arles.viverocampo.data

import androidx.room.withTransaction
import com.arles.viverocampo.core.FirebaseServices
import com.arles.viverocampo.data.local.ConfirmedReservationEntity
import com.arles.viverocampo.data.local.CountDraftEntity
import com.arles.viverocampo.data.local.CountLocalPersistence
import com.arles.viverocampo.data.local.DiscardDraftEntity
import com.arles.viverocampo.data.local.DiscardLineEntity
import com.arles.viverocampo.data.local.ViveroCampoDatabase
import com.arles.viverocampo.data.security.EncryptedReservationToken
import com.arles.viverocampo.data.security.ReservationTokenVault
import com.arles.viverocampo.domain.CampoRepository
import com.arles.viverocampo.domain.CampoEnvironment
import com.arles.viverocampo.domain.ActiveJourney
import com.arles.viverocampo.domain.CampoRepositoryException
import com.arles.viverocampo.domain.ConfirmedReservation
import com.arles.viverocampo.domain.CountFormValidator
import com.arles.viverocampo.domain.CountInput
import com.arles.viverocampo.domain.CountSyncOutcome
import com.arles.viverocampo.domain.DiscardFormValidator
import com.arles.viverocampo.domain.DiscardInput
import com.arles.viverocampo.domain.DiscardLine
import com.arles.viverocampo.domain.DiscardSyncOutcome
import com.arles.viverocampo.domain.FrozenCountPayload
import com.arles.viverocampo.domain.FrozenDiscardPayload
import com.arles.viverocampo.domain.InitiateCountCorrectionPayload
import com.arles.viverocampo.domain.JourneyLine
import com.arles.viverocampo.domain.JourneySnapshot
import com.arles.viverocampo.domain.LocalCountDraft
import com.arles.viverocampo.domain.LocalDiscardDraft
import com.arles.viverocampo.domain.InventoryValues
import com.arles.viverocampo.domain.ReserveLinePayload
import com.arles.viverocampo.domain.RELEASED_RESERVATION_MESSAGE
import com.arles.viverocampo.domain.ReturnedCount
import com.arles.viverocampo.domain.SessionProfileRecord
import com.arles.viverocampo.domain.SessionRestorationPolicy
import com.arles.viverocampo.domain.SessionRestoreResult
import com.arles.viverocampo.domain.SyncState
import com.arles.viverocampo.domain.UserProfile
import com.arles.viverocampo.domain.VisibleLocation
import com.google.firebase.functions.FirebaseFunctionsException
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.Source
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

class FirebaseCampoRepository(
    private val services: FirebaseServices,
    private val database: ViveroCampoDatabase,
    private val tokenVault: ReservationTokenVault,
    override val environment: CampoEnvironment,
) : CampoRepository {
    private val reservationDao = database.confirmedReservationDao()
    private val draftDao = database.countDraftDao()
    private val discardLineDao = database.discardLineDao()
    private val discardDraftDao = database.discardDraftDao()
    private val localPersistence = CountLocalPersistence(database)

    override suspend fun signIn(email: String, password: String): UserProfile {
        try {
            val user = services.auth.signInWithEmailAndPassword(email.trim(), password).await().user
                ?: throw CampoRepositoryException("UNAUTHENTICATED", "No fue posible iniciar sesión.")
            val profile = services.firestore.collection("usuarios").document(user.uid).get().await()
            if (!profile.exists()) {
                services.auth.signOut()
                throw CampoRepositoryException("USER_NOT_FOUND", "La cuenta no tiene un perfil operativo.")
            }
            if (profile.getBoolean("activo") != true) {
                services.auth.signOut()
                throw CampoRepositoryException("USER_INACTIVE", "La cuenta está inactiva.")
            }
            val role = (profile.get("roles") as? List<*>)?.firstOrNull() as? String
                ?: throw CampoRepositoryException("PERMISSION_DENIED", "La cuenta no tiene un rol operativo.")
            return UserProfile(user.uid, profile.getString("nombreVisible") ?: "Usuario", role)
        } catch (error: CampoRepositoryException) {
            throw error
        } catch (error: Exception) {
            throw CampoRepositoryException("UNAUTHENTICATED", "Correo o contraseña incorrectos.", error)
        }
    }

    override suspend fun restoreSession(): SessionRestoreResult {
        val user = services.auth.currentUser ?: return SessionRestoreResult.NoSession
        val profileReference = services.firestore.collection("usuarios").document(user.uid)
        val authoritative = try {
            SessionRestorationPolicy.authoritative(
                user.uid,
                profileReference.get(Source.SERVER).await().toSessionProfileRecord(),
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: FirebaseFirestoreException) {
            if (!error.isTransientProfileReadFailure()) {
                return SessionRestoreResult.VerificationPending(user.uid)
            }
            null
        } catch (_: Exception) {
            return SessionRestoreResult.VerificationPending(user.uid)
        }
        if (authoritative != null) {
            if (authoritative is SessionRestoreResult.Revoked) services.auth.signOut()
            return authoritative
        }
        val cached = try {
            profileReference.get(Source.CACHE).await().toSessionProfileRecord()
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            null
        }
        return SessionRestorationPolicy.cached(user.uid, cached)
    }

    override suspend fun signOut() {
        services.auth.signOut()
    }

    override fun observeAccountActive(userId: String): Flow<Boolean> = callbackFlow {
        val registration = services.firestore.collection("usuarios").document(userId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(CampoRepositoryException("PROFILE_MONITOR_ERROR", "No fue posible comprobar el estado de la cuenta.", error))
                    return@addSnapshotListener
                }
                if (snapshot == null) return@addSnapshotListener
                if (!snapshot.exists()) {
                    if (!snapshot.metadata.isFromCache) trySend(false)
                    return@addSnapshotListener
                }
                val active = snapshot.getBoolean("activo") == true
                if (active || !snapshot.metadata.isFromCache) trySend(active)
            }
        awaitClose { registration.remove() }
    }

    private fun DocumentSnapshot.toSessionProfileRecord() = SessionProfileRecord(
        exists = exists(),
        active = getBoolean("activo"),
        displayName = getString("nombreVisible"),
        role = (get("roles") as? List<*>)?.firstOrNull() as? String,
    )

    private fun FirebaseFirestoreException.isTransientProfileReadFailure(): Boolean = when (code) {
        FirebaseFirestoreException.Code.ABORTED,
        FirebaseFirestoreException.Code.CANCELLED,
        FirebaseFirestoreException.Code.DEADLINE_EXCEEDED,
        FirebaseFirestoreException.Code.INTERNAL,
        FirebaseFirestoreException.Code.RESOURCE_EXHAUSTED,
        FirebaseFirestoreException.Code.UNAVAILABLE,
        FirebaseFirestoreException.Code.UNKNOWN,
        -> true
        else -> false
    }

    override suspend fun listActiveJourneys(): List<ActiveJourney> {
        try {
            val response = services.functions.getHttpsCallable("listarJornadasActivas")
                .call(emptyMap<String, Any>()).await().data as? Map<*, *>
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "El backend devolvió una lista de jornadas inválida.")
            val journeys = response["jornadas"] as? List<*>
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "La respuesta no contiene jornadas.")
            return journeys.map { value ->
                val journey = value as? Map<*, *>
                    ?: throw CampoRepositoryException("INVALID_RESPONSE", "Una jornada no tiene formato válido.")
                ActiveJourney(
                    id = journey["jornadaId"] as? String ?: invalidResponse("Falta jornadaId."),
                    displayName = journey["nombreVisible"] as? String ?: invalidResponse("Falta nombreVisible."),
                    state = journey["estado"] as? String ?: invalidResponse("Falta estado."),
                    effectiveRole = journey["rolEfectivo"] as? String ?: invalidResponse("Falta rolEfectivo."),
                    canCount = journey["puedeContar"] as? Boolean ?: invalidResponse("Falta puedeContar."),
                    lineCount = (journey["cantidadLineas"] as? Number)?.toInt()
                        ?: invalidResponse("Falta cantidadLineas."),
                )
            }
        } catch (error: CampoRepositoryException) {
            throw error
        } catch (error: FirebaseFunctionsException) {
            val controlledCode = (error.details as? Map<*, *>)?.get("code") as? String ?: "NETWORK_ERROR"
            throw CampoRepositoryException(controlledCode, error.message ?: "No fue posible consultar las jornadas.", error)
        } catch (error: Exception) {
            throw CampoRepositoryException("NETWORK_ERROR", "No fue posible consultar las jornadas activas.", error)
        }
    }

    override fun observeJourney(journeyId: String): Flow<JourneySnapshot> = callbackFlow {
        var journeyName: String? = null
        var lines: List<JourneyLine>? = null
        fun publishWhenReady() {
            val currentName = journeyName ?: return
            val currentLines = lines ?: return
            trySend(JourneySnapshot(journeyId, currentName, currentLines))
        }
        val journeyRegistration = services.firestore.collection("jornadas").document(journeyId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(CampoRepositoryException("NETWORK_ERROR", "No fue posible leer la jornada.", error))
                } else if (snapshot?.exists() == true) {
                    if (snapshot.getString("estadoAdministrativo") != "ACTIVA") {
                        close(CampoRepositoryException(
                            "JOURNEY_NOT_ACTIVE",
                            "La jornada fue cerrada por supervisión.",
                        ))
                        return@addSnapshotListener
                    }
                    journeyName = snapshot.getString("nombreVisible") ?: journeyId
                    publishWhenReady()
                }
            }
        val linesRegistration = services.firestore.collection("jornadaLineas")
            .whereEqualTo("jornadaId", journeyId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(CampoRepositoryException("NETWORK_ERROR", "No fue posible leer las líneas.", error))
                } else if (snapshot != null) {
                    lines = snapshot.documents.filter { document ->
                        document.getBoolean("activa") == true
                    }.mapNotNull { document ->
                        JourneyLine(
                            id = document.id,
                            state = document.getString("estadoCentral") ?: return@mapNotNull null,
                            version = document.getLong("version")?.toInt() ?: 0,
                            location = parseLocation(document.get("ubicacion")) ?: return@mapNotNull null,
                        )
                    }.sortedBy { it.location.order }
                    publishWhenReady()
                }
            }
        awaitClose {
            journeyRegistration.remove()
            linesRegistration.remove()
        }
    }

    override fun observeReturnedCounts(userId: String, journeyId: String): Flow<List<ReturnedCount>> = callbackFlow {
        data class LineState(
            val state: String,
            val currentCountId: String?,
            val responsibleUserId: String?,
            val responsibleName: String?,
            val reassignmentId: String?,
            val reassignedByName: String?,
            val reassignmentReason: String?,
        )

        var lineStates = emptyMap<String, LineState>()
        var ownCounts = emptyMap<String, ReturnedCount>()
        var assignedCounts = emptyMap<String, ReturnedCount>()
        var reasons = emptyMap<String, String>()

        fun publish() {
            val returned = (ownCounts + assignedCounts).values.mapNotNull { count ->
                val line = lineStates[count.journeyLineId]
                if (line?.state != "DEVUELTA" || line.currentCountId != count.countId) return@mapNotNull null
                val responsibleUserId = line.responsibleUserId ?: count.originalAuthorUserId
                val reason = reasons[count.countId] ?: count.reason
                if (reason.isBlank()) return@mapNotNull null
                count.copy(
                    reason = reason,
                    correctionResponsibleUserId = responsibleUserId,
                    correctionResponsibleName = line.responsibleName ?: count.correctionResponsibleName,
                    reassignedByName = line.reassignedByName ?: count.reassignedByName,
                    reassignmentReason = line.reassignmentReason ?: count.reassignmentReason,
                    isReassigned = line.reassignmentId != null,
                    canCorrect = responsibleUserId == userId,
                )
            }.sortedBy { it.location.order }
            trySend(returned)
        }

        val linesRegistration = services.firestore.collection("jornadaLineas")
            .whereEqualTo("jornadaId", journeyId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(CampoRepositoryException("NETWORK_ERROR", "No fue posible leer conteos devueltos.", error))
                } else if (snapshot != null) {
                    lineStates = snapshot.documents.associate { document ->
                        document.id to LineState(
                            state = document.getString("estadoCentral") ?: "",
                            currentCountId = document.getString("conteoVigenteId"),
                            responsibleUserId = document.getString("responsableCorreccionUsuarioId"),
                            responsibleName = document.getString("responsableCorreccionNombreVisible"),
                            reassignmentId = document.getString("reasignacionActivaId"),
                            reassignedByName = document.getString("reasignadaPorNombreVisible"),
                            reassignmentReason = document.getString("motivoReasignacion"),
                        )
                    }
                    publish()
                }
            }
        val countsRegistration = services.firestore.collection("conteos")
            .whereEqualTo("autorUsuarioId", userId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(CampoRepositoryException("NETWORK_ERROR", "No fue posible leer tus conteos.", error))
                } else if (snapshot != null) {
                    ownCounts = snapshot.documents.mapNotNull { document ->
                        val journeyLineId = document.getString("jornadaLineaId") ?: return@mapNotNull null
                        val location = parseLocation(document.get("ubicacion")) ?: return@mapNotNull null
                        val females = document.getLong("hembras") ?: return@mapNotNull null
                        val males = document.getLong("machos") ?: return@mapNotNull null
                        val rootstocks = document.getLong("patrones") ?: return@mapNotNull null
                        val version = document.getLong("versionNumero")?.toInt() ?: return@mapNotNull null
                        val authorId = document.getString("autorUsuarioId") ?: return@mapNotNull null
                        val authorName = document.getString("autorNombreVisible") ?: "Usuario"
                        document.id to ReturnedCount(
                            countId = document.id,
                            journeyLineId = journeyLineId,
                            version = version,
                            reason = "",
                            input = CountInput(
                                females = females.toString(),
                                males = males.toString(),
                                rootstocks = rootstocks.toString(),
                                observations = document.getString("observaciones").orEmpty(),
                            ),
                            location = location,
                            originalAuthorUserId = authorId,
                            originalAuthorName = authorName,
                            correctionResponsibleUserId = authorId,
                            correctionResponsibleName = authorName,
                        )
                    }.toMap()
                    publish()
                }
            }
        val reassignmentsRegistration = services.firestore.collection("reasignacionesCorreccion")
            .whereEqualTo("nuevoUsuarioId", userId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(CampoRepositoryException("NETWORK_ERROR", "No fue posible leer correcciones reasignadas.", error))
                } else if (snapshot != null) {
                    assignedCounts = snapshot.documents.mapNotNull { document ->
                        val countId = document.getString("conteoId") ?: return@mapNotNull null
                        val journeyLineId = document.getString("jornadaLineaId") ?: return@mapNotNull null
                        val originalAuthorId = document.getString("autorOriginalUsuarioId") ?: return@mapNotNull null
                        val reference = document.get("conteoReferencia") as? Map<*, *> ?: return@mapNotNull null
                        val location = parseLocation(reference["ubicacion"]) ?: return@mapNotNull null
                        val females = reference["hembras"] as? Long ?: return@mapNotNull null
                        val males = reference["machos"] as? Long ?: return@mapNotNull null
                        val rootstocks = reference["patrones"] as? Long ?: return@mapNotNull null
                        val version = (reference["versionNumero"] as? Long)?.toInt() ?: return@mapNotNull null
                        countId to ReturnedCount(
                            countId = countId,
                            journeyLineId = journeyLineId,
                            version = version,
                            reason = document.getString("motivoDevolucion").orEmpty(),
                            input = CountInput(
                                females = females.toString(),
                                males = males.toString(),
                                rootstocks = rootstocks.toString(),
                                observations = reference["observaciones"] as? String ?: "",
                            ),
                            location = location,
                            originalAuthorUserId = originalAuthorId,
                            originalAuthorName = document.getString("autorOriginalNombreVisible") ?: "Usuario",
                            correctionResponsibleUserId = userId,
                            correctionResponsibleName = document.getString("nuevoUsuarioNombreVisible") ?: "Usuario",
                            reassignedByName = document.getString("actorNombreVisible"),
                            reassignmentReason = document.getString("motivo"),
                            isReassigned = true,
                            canCorrect = true,
                        )
                    }.toMap()
                    publish()
                }
            }
        val decisionsRegistration = services.firestore.collection("decisionesRevision")
            .whereEqualTo("autorUsuarioId", userId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(CampoRepositoryException("NETWORK_ERROR", "No fue posible leer motivos de devolución.", error))
                } else if (snapshot != null) {
                    reasons = snapshot.documents.mapNotNull { document ->
                        if (document.getString("decision") != "DEVOLVER") return@mapNotNull null
                        val countId = document.getString("conteoId") ?: return@mapNotNull null
                        val reason = document.getString("motivo") ?: return@mapNotNull null
                        countId to reason
                    }.toMap()
                    publish()
                }
            }
        awaitClose {
            linesRegistration.remove()
            countsRegistration.remove()
            reassignmentsRegistration.remove()
            decisionsRegistration.remove()
        }
    }

    override suspend fun reserveLine(payload: ReserveLinePayload, userId: String): ConfirmedReservation {
        assertMutableOperationsEnabled()
        try {
            val response = services.functions.getHttpsCallable("reservarLinea").call(payload.toWireMap()).await().data
                as? Map<*, *> ?: throw CampoRepositoryException("INVALID_RESPONSE", "El backend devolvió una respuesta inválida.")
            val token = response["tokenReserva"] as? String
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "La confirmación no contiene un token opaco válido.")
            val reservation = parseReservation(response, userId, payload.dispositivoId)
            val encrypted = try {
                tokenVault.encrypt(token)
            } catch (error: Exception) {
                throw CampoRepositoryException(
                    "TOKEN_ENCRYPTION_FAILED",
                    "No fue posible proteger la reserva en este dispositivo.",
                    error,
                )
            }
            reservationDao.save(reservation.toEntity(encrypted))
            return reservation
        } catch (error: CampoRepositoryException) {
            throw error
        } catch (error: FirebaseFunctionsException) {
            val controlledCode = (error.details as? Map<*, *>)?.get("code") as? String ?: "NETWORK_ERROR"
            throw CampoRepositoryException(controlledCode, error.message ?: "No fue posible reservar la línea.", error)
        } catch (error: Exception) {
            throw CampoRepositoryException(
                "NETWORK_ERROR",
                "No se recibió confirmación central. Reintenta con la misma solicitud.",
                error,
            )
        }
    }

    override suspend fun initiateCountCorrection(
        payload: InitiateCountCorrectionPayload,
        userId: String,
        initialInput: CountInput,
    ): ConfirmedReservation {
        assertMutableOperationsEnabled()
        try {
            val response = services.functions.getHttpsCallable("iniciarCorreccionConteo")
                .call(payload.toWireMap()).await().data as? Map<*, *>
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "El backend devolvió una respuesta inválida.")
            val token = response["tokenReserva"] as? String
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "La corrección no contiene un token opaco válido.")
            val reservation = parseReservation(response, userId, payload.dispositivoId)
            val encrypted = try {
                tokenVault.encrypt(token)
            } catch (error: Exception) {
                throw CampoRepositoryException(
                    "TOKEN_ENCRYPTION_FAILED",
                    "No fue posible proteger la corrección en este dispositivo.",
                    error,
                )
            }
            database.withTransaction {
                reservationDao.save(reservation.toEntity(encrypted))
                draftDao.save(
                    emptyDraft(reservation.reservationId, userId, payload.dispositivoId).copy(
                        femalesInput = initialInput.females,
                        malesInput = initialInput.males,
                        rootstocksInput = initialInput.rootstocks,
                        observationsInput = initialInput.observations,
                    ),
                )
            }
            return reservation
        } catch (error: CampoRepositoryException) {
            throw error
        } catch (error: FirebaseFunctionsException) {
            val controlledCode = (error.details as? Map<*, *>)?.get("code") as? String ?: "NETWORK_ERROR"
            throw CampoRepositoryException(controlledCode, error.message ?: "No fue posible iniciar la corrección.", error)
        } catch (error: Exception) {
            throw CampoRepositoryException(
                "NETWORK_ERROR",
                "No se recibió confirmación central. Reintenta con la misma solicitud.",
                error,
            )
        }
    }

    override suspend fun latestActiveReservation(userId: String, deviceId: String): ConfirmedReservation? =
        reservationDao.latestActiveForUserAndDevice(userId, deviceId)?.toDomain()

    override fun observeCountDraft(
        reservationId: String,
        userId: String,
        deviceId: String,
    ): Flow<LocalCountDraft?> = draftDao.observe(reservationId, userId, deviceId).map { it?.toDomain() }

    override fun observeReservationState(reservationId: String): Flow<String> = callbackFlow {
        val registration = services.firestore.collection("reservas").document(reservationId)
            .addSnapshotListener { snapshot, error ->
                when {
                    error != null -> close(
                        CampoRepositoryException(
                            "NETWORK_ERROR",
                            "No fue posible comprobar el estado central de la reserva.",
                            error,
                        ),
                    )
                    snapshot == null || !snapshot.exists() -> close(
                        CampoRepositoryException("RESERVATION_NOT_FOUND", "La reserva central no existe."),
                    )
                    else -> trySend(snapshot.getString("estadoReserva") ?: "DESCONOCIDA")
                }
            }
        awaitClose { registration.remove() }
    }

    override suspend fun markReservationReleased(reservationId: String) {
        assertMutableOperationsEnabled()
        localPersistence.markReleasedAndKeepDraft(reservationId)
    }

    override suspend fun saveCountInput(
        reservationId: String,
        userId: String,
        deviceId: String,
        input: CountInput,
    ) {
        assertMutableOperationsEnabled()
        val existing = draftDao.byReservationId(reservationId)
        if (existing != null && (existing.userId != userId || existing.deviceId != deviceId)) {
            throw CampoRepositoryException("DRAFT_ACCESS_DENIED", "El borrador pertenece a otra cuenta o dispositivo.")
        }
        if (existing?.syncState == SyncState.ENVIADA.name) return
        if (existing?.idempotencyKey != null && existing.syncState != SyncState.ERROR.name) return
        val changedAfterError = existing?.syncState == SyncState.ERROR.name && existing.input() != input
        draftDao.save(
            (existing ?: emptyDraft(reservationId, userId, deviceId)).copy(
                femalesInput = input.females,
                malesInput = input.males,
                rootstocksInput = input.rootstocks,
                observationsInput = input.observations,
                syncState = if (changedAfterError) SyncState.PENDIENTE.name else existing?.syncState ?: SyncState.PENDIENTE.name,
                frozenFemales = if (changedAfterError) null else existing?.frozenFemales,
                frozenMales = if (changedAfterError) null else existing?.frozenMales,
                frozenRootstocks = if (changedAfterError) null else existing?.frozenRootstocks,
                frozenObservations = if (changedAfterError) null else existing?.frozenObservations,
                frozenDeviceTimestamp = if (changedAfterError) null else existing?.frozenDeviceTimestamp,
                idempotencyKey = if (changedAfterError) null else existing?.idempotencyKey,
                errorCode = if (changedAfterError) null else existing?.errorCode,
                errorMessage = if (changedAfterError) null else existing?.errorMessage,
                updatedAtEpochMillis = System.currentTimeMillis(),
            ),
        )
    }

    override suspend fun freezeCountAttempt(
        reservationId: String,
        userId: String,
        deviceId: String,
        idempotencyKey: String,
        deviceTimestamp: String,
    ): LocalCountDraft = database.withTransaction {
        assertMutableOperationsEnabled()
        val existing = draftDao.byReservationId(reservationId)
            ?: throw CampoRepositoryException("INVALID_ARGUMENT", "No existe un borrador para confirmar.")
        if (existing.userId != userId || existing.deviceId != deviceId) {
            throw CampoRepositoryException("DRAFT_ACCESS_DENIED", "El borrador pertenece a otra cuenta o dispositivo.")
        }
        if (existing.idempotencyKey != null) return@withTransaction existing.toDomain()
        val validation = CountFormValidator.validate(existing.input())
        if (!validation.valid) throw CampoRepositoryException("INVALID_ARGUMENT", "Corrige los campos marcados antes de confirmar.")
        val frozen = existing.copy(
            syncState = SyncState.PENDIENTE.name,
            frozenFemales = requireNotNull(validation.females),
            frozenMales = requireNotNull(validation.males),
            frozenRootstocks = requireNotNull(validation.rootstocks),
            frozenObservations = existing.observationsInput,
            frozenDeviceTimestamp = deviceTimestamp,
            idempotencyKey = idempotencyKey,
            errorCode = null,
            errorMessage = null,
            updatedAtEpochMillis = System.currentTimeMillis(),
        )
        draftDao.save(frozen)
        frozen.toDomain()
    }

    override suspend fun synchronizeCount(reservationId: String): CountSyncOutcome {
        assertMutableOperationsEnabled()
        val draft = draftDao.byReservationId(reservationId) ?: return CountSyncOutcome.PermanentFailure("DRAFT_NOT_FOUND")
        if (draft.syncState == SyncState.ENVIADA.name) return CountSyncOutcome.Success
        val reservation = reservationDao.byId(reservationId)
            ?: return markFailure(draft, "RESERVATION_NOT_FOUND", "La reserva local ya no está disponible.", false)
        if (reservation.state == "LIBERADA") {
            return markFailure(draft, "RESERVATION_RELEASED", RELEASED_RESERVATION_MESSAGE, false)
        }
        if (services.auth.currentUser?.uid != draft.userId || reservation.userId != draft.userId || reservation.deviceId != draft.deviceId) {
            return markFailure(draft, "DRAFT_ACCESS_DENIED", "Inicia sesión con la cuenta responsable para reintentar.", false)
        }
        val frozen = draft.toDomain().frozenPayload
            ?: return markFailure(draft, "ATTEMPT_NOT_CONFIRMED", "Confirma el resumen antes de sincronizar.", false)
        val encrypted = if (reservation.tokenCiphertext != null && reservation.tokenIv != null) {
            EncryptedReservationToken(reservation.tokenCiphertext, reservation.tokenIv)
        } else {
            return markFailure(draft, "TOKEN_NOT_AVAILABLE", "La reserva protegida ya no está disponible.", false)
        }
        draftDao.save(draft.copy(syncState = SyncState.SINCRONIZANDO.name, errorCode = null, errorMessage = null))
        val token = try {
            tokenVault.decrypt(encrypted)
        } catch (_: Exception) {
            return markFailure(draft, "TOKEN_DECRYPTION_FAILED", "No fue posible abrir la reserva protegida.", false)
        }
        return try {
            val response = services.functions.getHttpsCallable("enviarConteo")
                .call(frozen.toWireMap(token)).await().data as? Map<*, *>
                ?: return markFailure(draft, "INVALID_RESPONSE", "El servidor devolvió una respuesta inválida.", true)
            val countId = response["conteoId"] as? String
                ?: return markFailure(draft, "INVALID_RESPONSE", "Falta la confirmación del conteo.", true)
            val centralState = response["estadoCentral"] as? String
                ?: return markFailure(draft, "INVALID_RESPONSE", "Falta el estado central confirmado.", true)
            val receivedAt = response["recibidoEn"] as? String
                ?: return markFailure(draft, "INVALID_RESPONSE", "Falta la hora central confirmada.", true)
            localPersistence.markSentAndRemoveToken(reservationId, countId, centralState, receivedAt)
            CountSyncOutcome.Success
        } catch (error: FirebaseFunctionsException) {
            val controlledCode = (error.details as? Map<*, *>)?.get("code") as? String
            if (controlledCode == null || controlledCode in RETRYABLE_CODES) {
                markFailure(draft, controlledCode ?: "NETWORK_ERROR", "Sin confirmación central; se reintentará sin duplicar.", true)
            } else {
                markFailure(draft, controlledCode, actionableMessage(controlledCode), false)
            }
        } catch (_: Exception) {
            markFailure(draft, "NETWORK_ERROR", "Sin confirmación central; se reintentará sin duplicar.", true)
        }
    }

    override suspend fun listDiscardLines(): List<DiscardLine> {
        assertMutableOperationsEnabled()
        return try {
            val response = services.functions.getHttpsCallable("listarLineasDescarte")
                .call(emptyMap<String, Any>()).await().data as? Map<*, *>
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "La lista de líneas de descarte es inválida.")
            val rawLines = response["lineas"] as? List<*>
                ?: throw CampoRepositoryException("INVALID_RESPONSE", "La respuesta no contiene líneas de descarte.")
            val lines = rawLines.map { parseDiscardLine(it) }
            database.withTransaction {
                discardLineDao.clear()
                discardLineDao.saveAll(lines.map { it.toEntity() })
            }
            lines
        } catch (error: Exception) {
            val cached = discardLineDao.all().map { it.toDomain() }
            if (cached.isNotEmpty()) cached else if (error is CampoRepositoryException) throw error else {
                throw CampoRepositoryException(
                    "NETWORK_ERROR",
                    "No hay conexión ni un catálogo de descarte guardado en este teléfono.",
                    error,
                )
            }
        }
    }

    override suspend fun latestPendingDiscard(userId: String, deviceId: String): LocalDiscardDraft? =
        discardDraftDao.latestPending(userId, deviceId)?.toDomain()

    override suspend fun startDiscardDraft(
        draftId: String,
        line: DiscardLine,
        userId: String,
        deviceId: String,
    ): LocalDiscardDraft {
        assertMutableOperationsEnabled()
        val entity = emptyDiscardDraft(draftId, line, userId, deviceId)
        discardDraftDao.save(entity)
        return entity.toDomain()
    }

    override fun observeDiscardDraft(
        draftId: String,
        userId: String,
        deviceId: String,
    ): Flow<LocalDiscardDraft?> = discardDraftDao.observe(draftId, userId, deviceId).map { it?.toDomain() }

    override suspend fun saveDiscardInput(
        draftId: String,
        userId: String,
        deviceId: String,
        input: DiscardInput,
    ) {
        assertMutableOperationsEnabled()
        val existing = discardDraftDao.byId(draftId)
            ?: throw CampoRepositoryException("INVALID_ARGUMENT", "No existe el borrador de descarte.")
        if (existing.userId != userId || existing.deviceId != deviceId) {
            throw CampoRepositoryException("DRAFT_ACCESS_DENIED", "El borrador pertenece a otra cuenta o dispositivo.")
        }
        if (existing.syncState == SyncState.ENVIADA.name) return
        if (existing.idempotencyKey != null && existing.syncState != SyncState.ERROR.name) return
        val changedAfterError = existing.syncState == SyncState.ERROR.name && existing.input() != input
        discardDraftDao.save(
            existing.copy(
                femalesInput = input.females,
                malesInput = input.males,
                rootstocksInput = input.rootstocks,
                deadInput = input.dead,
                nematodesInput = input.nematodes,
                gooseNeckInput = input.gooseNeck,
                bifurcatedRootsInput = input.bifurcatedRoots,
                doubleGraftingInput = input.doubleGrafting,
                observationsInput = input.observations,
                syncState = if (changedAfterError) SyncState.PENDIENTE.name else existing.syncState,
                frozenFemales = if (changedAfterError) null else existing.frozenFemales,
                frozenMales = if (changedAfterError) null else existing.frozenMales,
                frozenRootstocks = if (changedAfterError) null else existing.frozenRootstocks,
                frozenDead = if (changedAfterError) null else existing.frozenDead,
                frozenNematodes = if (changedAfterError) null else existing.frozenNematodes,
                frozenGooseNeck = if (changedAfterError) null else existing.frozenGooseNeck,
                frozenBifurcatedRoots = if (changedAfterError) null else existing.frozenBifurcatedRoots,
                frozenDoubleGrafting = if (changedAfterError) null else existing.frozenDoubleGrafting,
                frozenObservations = if (changedAfterError) null else existing.frozenObservations,
                frozenDeviceTimestamp = if (changedAfterError) null else existing.frozenDeviceTimestamp,
                idempotencyKey = if (changedAfterError) null else existing.idempotencyKey,
                errorCode = if (changedAfterError) null else existing.errorCode,
                errorMessage = if (changedAfterError) null else existing.errorMessage,
                updatedAtEpochMillis = System.currentTimeMillis(),
            ),
        )
    }

    override suspend fun freezeDiscardAttempt(
        draftId: String,
        userId: String,
        deviceId: String,
        idempotencyKey: String,
        deviceTimestamp: String,
    ): LocalDiscardDraft = database.withTransaction {
        assertMutableOperationsEnabled()
        val existing = discardDraftDao.byId(draftId)
            ?: throw CampoRepositoryException("INVALID_ARGUMENT", "No existe el borrador de descarte.")
        if (existing.userId != userId || existing.deviceId != deviceId) {
            throw CampoRepositoryException("DRAFT_ACCESS_DENIED", "El borrador pertenece a otra cuenta o dispositivo.")
        }
        if (existing.idempotencyKey != null) return@withTransaction existing.toDomain()
        val validation = DiscardFormValidator.validate(existing.input())
        if (!validation.valid) throw CampoRepositoryException("INVALID_ARGUMENT", "Corrige los campos marcados.")
        val values = validation.values.map { requireNotNull(it) }
        if (
            values[0] > existing.inventoryFemales || values[1] > existing.inventoryMales ||
            values[2] > existing.inventoryRootstocks
        ) {
            throw CampoRepositoryException("DISCARD_EXCEEDS_INVENTORY", "El descarte supera el inventario guardado.")
        }
        val frozen = existing.copy(
            syncState = SyncState.PENDIENTE.name,
            frozenFemales = values[0],
            frozenMales = values[1],
            frozenRootstocks = values[2],
            frozenDead = values[3],
            frozenNematodes = values[4],
            frozenGooseNeck = values[5],
            frozenBifurcatedRoots = values[6],
            frozenDoubleGrafting = values[7],
            frozenObservations = existing.observationsInput,
            frozenDeviceTimestamp = deviceTimestamp,
            idempotencyKey = idempotencyKey,
            errorCode = null,
            errorMessage = null,
            updatedAtEpochMillis = System.currentTimeMillis(),
        )
        discardDraftDao.save(frozen)
        frozen.toDomain()
    }

    override suspend fun synchronizeDiscard(draftId: String): DiscardSyncOutcome {
        assertMutableOperationsEnabled()
        val draft = discardDraftDao.byId(draftId)
            ?: return DiscardSyncOutcome.PermanentFailure("DRAFT_NOT_FOUND")
        if (draft.syncState == SyncState.ENVIADA.name) return DiscardSyncOutcome.Success
        if (services.auth.currentUser?.uid != draft.userId) {
            return markDiscardFailure(draft, "DRAFT_ACCESS_DENIED", "Inicia sesión con la cuenta responsable.", false)
        }
        val frozen = draft.toDomain().frozenPayload
            ?: return markDiscardFailure(draft, "ATTEMPT_NOT_CONFIRMED", "Confirma el resumen primero.", false)
        discardDraftDao.save(draft.copy(syncState = SyncState.SINCRONIZANDO.name, errorCode = null, errorMessage = null))
        return try {
            val response = services.functions.getHttpsCallable("registrarDescarte")
                .call(frozen.toWireMap()).await().data as? Map<*, *>
                ?: return markDiscardFailure(draft, "INVALID_RESPONSE", "Respuesta inválida del servidor.", true)
            val discardId = response["descarteId"] as? String
                ?: return markDiscardFailure(draft, "INVALID_RESPONSE", "Falta el identificador del descarte.", true)
            val centralState = response["estado"] as? String
                ?: return markDiscardFailure(draft, "INVALID_RESPONSE", "Falta el estado del descarte.", true)
            val receivedAt = response["recibidoEn"] as? String
                ?: return markDiscardFailure(draft, "INVALID_RESPONSE", "Falta la hora de recepción.", true)
            discardDraftDao.save(
                draft.copy(
                    syncState = SyncState.ENVIADA.name,
                    errorCode = null,
                    errorMessage = null,
                    discardId = discardId,
                    centralState = centralState,
                    serverReceivedAt = receivedAt,
                    updatedAtEpochMillis = System.currentTimeMillis(),
                ),
            )
            DiscardSyncOutcome.Success
        } catch (error: FirebaseFunctionsException) {
            val code = (error.details as? Map<*, *>)?.get("code") as? String ?: "NETWORK_ERROR"
            val retryable = code in RETRYABLE_CODES
            val message = when (code) {
                "DISCARD_STALE_INVENTORY" -> "El inventario cambió; vuelve a elegir la línea y registra nuevamente."
                "DISCARD_EXCEEDS_INVENTORY" -> "El descarte supera el inventario oficial disponible."
                else -> if (retryable) "Sin confirmación central; se reintentará sin duplicar." else "Envío rechazado ($code)."
            }
            markDiscardFailure(draft, code, message, retryable)
        } catch (_: Exception) {
            markDiscardFailure(draft, "NETWORK_ERROR", "Sin confirmación central; se reintentará sin duplicar.", true)
        }
    }

    override suspend fun abandonDiscardDraft(draftId: String, userId: String, deviceId: String) {
        val draft = discardDraftDao.byId(draftId)
            ?: throw CampoRepositoryException("DRAFT_NOT_FOUND", "El borrador ya no existe.")
        if (draft.userId != userId || draft.deviceId != deviceId) {
            throw CampoRepositoryException("DRAFT_ACCESS_DENIED", "El borrador pertenece a otra cuenta o dispositivo.")
        }
        if (draft.syncState == SyncState.SINCRONIZANDO.name || draft.syncState == SyncState.ENVIADA.name) {
            throw CampoRepositoryException("DRAFT_STATE_INVALID", "Este borrador ya no puede eliminarse localmente.")
        }
        discardDraftDao.delete(draftId, userId, deviceId)
    }

    private suspend fun markDiscardFailure(
        draft: DiscardDraftEntity,
        code: String,
        message: String,
        retryable: Boolean,
    ): DiscardSyncOutcome {
        val current = discardDraftDao.byId(draft.draftId) ?: draft
        discardDraftDao.save(
            current.copy(
                syncState = SyncState.ERROR.name,
                errorCode = code,
                errorMessage = message,
                updatedAtEpochMillis = System.currentTimeMillis(),
            ),
        )
        return if (retryable) DiscardSyncOutcome.Retryable(code) else DiscardSyncOutcome.PermanentFailure(code)
    }

    private suspend fun markFailure(
        draft: CountDraftEntity,
        code: String,
        message: String,
        retryable: Boolean,
    ): CountSyncOutcome {
        val current = draftDao.byReservationId(draft.reservationId) ?: draft
        draftDao.save(
            current.copy(
                syncState = SyncState.ERROR.name,
                errorCode = code,
                errorMessage = message,
                updatedAtEpochMillis = System.currentTimeMillis(),
            ),
        )
        return if (retryable) CountSyncOutcome.Retryable(code) else CountSyncOutcome.PermanentFailure(code)
    }

    private fun actionableMessage(code: String): String = when (code) {
        "RESERVATION_RELEASED" -> RELEASED_RESERVATION_MESSAGE
        "RESERVATION_NOT_ACTIVE", "LINE_NOT_IN_COUNT", "LINE_RESERVATION_MISMATCH" ->
            "La reserva cambió en el servidor. Solicita revisión al supervisor."
        "USER_INACTIVE", "JOURNEY_ACCESS_DENIED", "PERMISSION_DENIED" ->
            "La cuenta ya no está autorizada. Contacta al supervisor."
        else -> "El servidor rechazó el envío ($code). Corrige la causa antes de reintentar."
    }

    private fun assertMutableOperationsEnabled() {
        if (!mutableOperationsEnabled) {
            throw CampoRepositoryException(
                "OPERATIONS_DISABLED",
                "Las operaciones están deshabilitadas por una configuración de ambiente no válida.",
            )
        }
    }

    private fun parseReservation(response: Map<*, *>, userId: String, deviceId: String) = ConfirmedReservation(
        reservationId = response["reservaId"] as? String ?: invalidResponse("Falta reservaId."),
        userId = userId,
        deviceId = deviceId,
        journeyId = response["jornadaId"] as? String ?: invalidResponse("Falta jornadaId."),
        journeyLineId = response["jornadaLineaId"] as? String ?: invalidResponse("Falta jornadaLineaId."),
        state = response["estadoCentral"] as? String ?: invalidResponse("Falta estadoCentral."),
        confirmedAt = response["reservadaEn"] as? String ?: invalidResponse("Falta reservadaEn."),
        version = (response["version"] as? Number)?.toInt() ?: invalidResponse("Falta version."),
        location = parseLocation(response["ubicacion"]) ?: invalidResponse("Falta ubicación."),
        reservationType = response["tipoReserva"] as? String ?: "INICIAL",
        previousCountId = response["conteoAnteriorId"] as? String,
        nextCountVersion = (response["versionConteoSiguiente"] as? Number)?.toInt() ?: 1,
    )

    private fun invalidResponse(message: String): Nothing = throw CampoRepositoryException("INVALID_RESPONSE", message)

    private fun parseLocation(value: Any?): VisibleLocation? {
        val location = value as? Map<*, *> ?: return null
        return VisibleLocation(
            nursery = location["vivero"] as? String ?: return null,
            module = location["modulo"] as? String ?: return null,
            bed = location["cama"] as? String ?: return null,
            line = location["linea"] as? String ?: return null,
            displayName = location["nombreVisible"] as? String ?: return null,
            order = (location["orden"] as? Number)?.toInt() ?: return null,
        )
    }

    private fun ConfirmedReservation.toEntity(encrypted: EncryptedReservationToken) = ConfirmedReservationEntity(
        reservationId = reservationId,
        userId = userId,
        deviceId = deviceId,
        journeyId = journeyId,
        journeyLineId = journeyLineId,
        state = state,
        confirmedAt = confirmedAt,
        version = version,
        nursery = location.nursery,
        module = location.module,
        bed = location.bed,
        line = location.line,
        displayName = location.displayName,
        orderValue = location.order,
        tokenCiphertext = encrypted.ciphertext,
        tokenIv = encrypted.iv,
        reservationType = reservationType,
        previousCountId = previousCountId,
        nextCountVersion = nextCountVersion,
    )

    private fun ConfirmedReservationEntity.toDomain() = ConfirmedReservation(
        reservationId = reservationId,
        userId = userId,
        deviceId = deviceId,
        journeyId = journeyId,
        journeyLineId = journeyLineId,
        state = state,
        confirmedAt = confirmedAt,
        version = version,
        location = VisibleLocation(nursery, module, bed, line, displayName, orderValue),
        reservationType = reservationType,
        previousCountId = previousCountId,
        nextCountVersion = nextCountVersion,
    )

    private fun CountDraftEntity.input() = CountInput(femalesInput, malesInput, rootstocksInput, observationsInput)

    private fun CountDraftEntity.toDomain() = LocalCountDraft(
        reservationId = reservationId,
        userId = userId,
        deviceId = deviceId,
        input = input(),
        syncState = SyncState.valueOf(syncState),
        frozenPayload = if (
            frozenFemales != null && frozenMales != null && frozenRootstocks != null &&
            frozenObservations != null && frozenDeviceTimestamp != null && idempotencyKey != null
        ) {
            FrozenCountPayload(
                reservationId,
                deviceId,
                frozenFemales,
                frozenMales,
                frozenRootstocks,
                frozenObservations,
                frozenDeviceTimestamp,
                idempotencyKey,
            )
        } else {
            null
        },
        errorCode = errorCode,
        errorMessage = errorMessage,
        countId = countId,
        centralState = centralState,
        serverReceivedAt = serverReceivedAt,
    )

    private fun parseDiscardLine(value: Any?): DiscardLine {
        val line = value as? Map<*, *> ?: invalidResponse("Una línea de descarte no tiene formato válido.")
        val inventory = line["inventario"] as? Map<*, *> ?: invalidResponse("Falta el inventario de la línea.")
        return DiscardLine(
            lineId = line["lineaId"] as? String ?: invalidResponse("Falta lineaId."),
            location = parseLocation(line["ubicacion"]) ?: invalidResponse("Falta la ubicación."),
            inventory = InventoryValues(
                females = (inventory["hembras"] as? Number)?.toLong() ?: invalidResponse("Faltan hembras."),
                males = (inventory["machos"] as? Number)?.toLong() ?: invalidResponse("Faltan machos."),
                rootstocks = (inventory["patrones"] as? Number)?.toLong() ?: invalidResponse("Faltan patrones."),
                total = (inventory["total"] as? Number)?.toLong() ?: invalidResponse("Falta el total."),
            ),
            inventoryVersion = (line["versionInventario"] as? Number)?.toLong()
                ?: invalidResponse("Falta la versión del inventario."),
        )
    }

    private fun DiscardLine.toEntity() = DiscardLineEntity(
        lineId = lineId,
        nursery = location.nursery,
        module = location.module,
        bed = location.bed,
        line = location.line,
        displayName = location.displayName,
        orderValue = location.order,
        inventoryFemales = inventory.females,
        inventoryMales = inventory.males,
        inventoryRootstocks = inventory.rootstocks,
        inventoryTotal = inventory.total,
        inventoryVersion = inventoryVersion,
        cachedAtEpochMillis = System.currentTimeMillis(),
    )

    private fun DiscardLineEntity.toDomain() = DiscardLine(
        lineId = lineId,
        location = VisibleLocation(nursery, module, bed, line, displayName, orderValue),
        inventory = InventoryValues(inventoryFemales, inventoryMales, inventoryRootstocks, inventoryTotal),
        inventoryVersion = inventoryVersion,
    )

    private fun DiscardDraftEntity.input() = DiscardInput(
        femalesInput, malesInput, rootstocksInput, deadInput, nematodesInput,
        gooseNeckInput, bifurcatedRootsInput, doubleGraftingInput, observationsInput,
    )

    private fun DiscardDraftEntity.toDomain(): LocalDiscardDraft {
        val line = DiscardLine(
            lineId = lineId,
            location = VisibleLocation(nursery, module, bed, this.line, displayName, orderValue),
            inventory = InventoryValues(inventoryFemales, inventoryMales, inventoryRootstocks, inventoryTotal),
            inventoryVersion = inventoryVersion,
        )
        val frozenValues = listOf(
            frozenFemales, frozenMales, frozenRootstocks, frozenDead, frozenNematodes,
            frozenGooseNeck, frozenBifurcatedRoots, frozenDoubleGrafting,
        )
        return LocalDiscardDraft(
            draftId = draftId,
            userId = userId,
            deviceId = deviceId,
            line = line,
            input = input(),
            syncState = SyncState.valueOf(syncState),
            frozenPayload = if (
                frozenValues.all { it != null } && frozenObservations != null &&
                frozenDeviceTimestamp != null && idempotencyKey != null
            ) {
                FrozenDiscardPayload(
                    draftId = draftId,
                    lineId = lineId,
                    inventoryVersion = inventoryVersion,
                    deviceId = deviceId,
                    values = frozenValues.map { requireNotNull(it) },
                    observations = frozenObservations,
                    deviceTimestamp = frozenDeviceTimestamp,
                    idempotencyKey = idempotencyKey,
                )
            } else {
                null
            },
            errorCode = errorCode,
            errorMessage = errorMessage,
            discardId = discardId,
            centralState = centralState,
            serverReceivedAt = serverReceivedAt,
        )
    }

    private fun emptyDiscardDraft(
        draftId: String,
        line: DiscardLine,
        userId: String,
        deviceId: String,
    ) = DiscardDraftEntity(
        draftId = draftId,
        userId = userId,
        deviceId = deviceId,
        lineId = line.lineId,
        inventoryVersion = line.inventoryVersion,
        nursery = line.location.nursery,
        module = line.location.module,
        bed = line.location.bed,
        line = line.location.line,
        displayName = line.location.displayName,
        orderValue = line.location.order,
        inventoryFemales = line.inventory.females,
        inventoryMales = line.inventory.males,
        inventoryRootstocks = line.inventory.rootstocks,
        inventoryTotal = line.inventory.total,
        femalesInput = "",
        malesInput = "",
        rootstocksInput = "",
        deadInput = "",
        nematodesInput = "",
        gooseNeckInput = "",
        bifurcatedRootsInput = "",
        doubleGraftingInput = "",
        observationsInput = "",
        syncState = SyncState.PENDIENTE.name,
        frozenFemales = null,
        frozenMales = null,
        frozenRootstocks = null,
        frozenDead = null,
        frozenNematodes = null,
        frozenGooseNeck = null,
        frozenBifurcatedRoots = null,
        frozenDoubleGrafting = null,
        frozenObservations = null,
        frozenDeviceTimestamp = null,
        idempotencyKey = null,
        errorCode = null,
        errorMessage = null,
        discardId = null,
        centralState = null,
        serverReceivedAt = null,
        updatedAtEpochMillis = System.currentTimeMillis(),
    )

    private fun emptyDraft(reservationId: String, userId: String, deviceId: String) = CountDraftEntity(
        reservationId, userId, deviceId, "", "", "", "", SyncState.PENDIENTE.name,
        null, null, null, null, null, null, null, null, null, null, null, System.currentTimeMillis(),
    )

    private companion object {
        val RETRYABLE_CODES = setOf("NETWORK_ERROR", "INTERNAL_ERROR")
    }
}
