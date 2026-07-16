import {getApp, getApps, initializeApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import {
  Timestamp,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  where,
  type Firestore,
} from "firebase/firestore";

import {loadEmulatorConfig} from "../core/emulatorConfig";
import type {
  CancelledDraftJourney,
  DraftActivationResult,
  DraftActivationVersions,
  DraftCatalogLine,
  DraftParticipant,
  DraftParticipantCandidate,
  DraftParticipantInput,
  DraftParticipantsData,
  ManageableDraftJourney,
  ManageableJourneysData,
  ManageableUser,
  MonitorCount,
  MonitorCorrectionCandidate,
  MonitorCorrectionResponsibility,
  MonitorInventory,
  MonitorJourney,
  MonitorLine,
  MonitorLocation,
  MonitorRepository,
  MonitorReservation,
  MonitorRole,
  MonitorSnapshot,
  MonitorUnsubscribe,
  MonitorUser,
} from "../domain/MonitorModels";
import {sortMonitorLines} from "../domain/MonitorModels";

function isRole(value: unknown): value is MonitorRole {
  return value === "AUXILIAR" || value === "SUPERVISOR" || value === "ADMINISTRADOR";
}

function parseLocation(value: unknown): MonitorLocation | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const location = value as Record<string, unknown>;
  if (
    typeof location.vivero !== "string" ||
    typeof location.modulo !== "string" ||
    typeof location.cama !== "string" ||
    typeof location.linea !== "string" ||
    typeof location.nombreVisible !== "string" ||
    typeof location.orden !== "number"
  ) {
    return undefined;
  }
  return {
    nursery: location.vivero,
    module: location.modulo,
    bed: location.cama,
    line: location.linea,
    displayName: location.nombreVisible,
    order: location.orden,
  };
}

function parseDraftJourney(value: unknown): ManageableDraftJourney {
  if (typeof value !== "object" || value === null) throw new Error("Un borrador no tiene formato vÃ¡lido.");
  const journey = value as Record<string, unknown>;
  if (
    typeof journey.jornadaId !== "string" ||
    typeof journey.nombreVisible !== "string" ||
    journey.estado !== "BORRADOR" ||
    typeof journey.creadorUsuarioId !== "string" ||
    typeof journey.creadorNombreVisible !== "string" ||
    !Number.isSafeInteger(journey.version) ||
    !Array.isArray(journey.lineaIds) ||
    journey.lineaIds.some((lineId) => typeof lineId !== "string") ||
    typeof journey.creadaEn !== "string" ||
    typeof journey.actualizadaEn !== "string"
  ) {
    throw new Error("Un borrador no tiene formato vÃ¡lido.");
  }
  return {
    id: journey.jornadaId,
    displayName: journey.nombreVisible,
    state: "BORRADOR",
    creatorUserId: journey.creadorUsuarioId,
    creatorDisplayName: journey.creadorNombreVisible,
    version: journey.version as number,
    lineIds: journey.lineaIds as string[],
    createdAt: journey.creadaEn,
    updatedAt: journey.actualizadaEn,
  };
}

function parseDraftCatalogLine(value: unknown): DraftCatalogLine {
  if (typeof value !== "object" || value === null) throw new Error("Una lÃ­nea de catÃ¡logo no es vÃ¡lida.");
  const line = value as Record<string, unknown>;
  const location = parseLocation(line.ubicacion);
  if (
    typeof line.lineaId !== "string" ||
    typeof line.nombreVisible !== "string" ||
    typeof line.seleccionable !== "boolean" ||
    !location ||
    (line.motivoNoSeleccionable !== undefined && line.motivoNoSeleccionable !== "JORNADA_ACTIVA")
  ) {
    throw new Error("Una lÃ­nea de catÃ¡logo no es vÃ¡lida.");
  }
  return {
    id: line.lineaId,
    displayName: line.nombreVisible,
    selectable: line.seleccionable,
    ...(line.motivoNoSeleccionable === "JORNADA_ACTIVA"
      ? {unavailableReason: "JORNADA_ACTIVA" as const}
      : {}),
    location,
  };
}

function parseDraftParticipantCandidate(value: unknown): DraftParticipantCandidate {
  if (typeof value !== "object" || value === null) throw new Error("Un usuario del catalogo no es valido.");
  const user = value as Record<string, unknown>;
  if (
    typeof user.usuarioId !== "string" ||
    typeof user.nombreVisible !== "string" ||
    !isRole(user.rol)
  ) {
    throw new Error("Un usuario del catalogo no es valido.");
  }
  return {id: user.usuarioId, displayName: user.nombreVisible, role: user.rol};
}

function parseDraftParticipant(value: unknown): DraftParticipant {
  const candidate = parseDraftParticipantCandidate(value);
  if (typeof value !== "object" || value === null || typeof (value as Record<string, unknown>).puedeContar !== "boolean") {
    throw new Error("Un participante no es valido.");
  }
  return {...candidate, canCount: (value as Record<string, unknown>).puedeContar as boolean};
}

function parseCancelledDraftJourney(value: unknown): CancelledDraftJourney {
  if (typeof value !== "object" || value === null) throw new Error("Un borrador cancelado no tiene formato valido.");
  const journey = value as Record<string, unknown>;
  if (
    typeof journey.jornadaId !== "string" ||
    typeof journey.nombreVisible !== "string" ||
    journey.estado !== "INACTIVA" ||
    journey.tipoInactivacion !== "CANCELACION_BORRADOR" ||
    typeof journey.creadorUsuarioId !== "string" ||
    typeof journey.creadorNombreVisible !== "string" ||
    !Number.isSafeInteger(journey.version) ||
    !Array.isArray(journey.lineaIds) ||
    journey.lineaIds.some((lineId) => typeof lineId !== "string") ||
    !Array.isArray(journey.participantes) ||
    typeof journey.cancelacionId !== "string" ||
    typeof journey.canceladaPorUsuarioId !== "string" ||
    typeof journey.canceladaPorNombreVisible !== "string" ||
    typeof journey.motivoCancelacion !== "string" ||
    typeof journey.canceladaEn !== "string" ||
    typeof journey.creadaEn !== "string" ||
    typeof journey.actualizadaEn !== "string"
  ) {
    throw new Error("Un borrador cancelado no tiene formato valido.");
  }
  return {
    id: journey.jornadaId,
    displayName: journey.nombreVisible,
    state: "INACTIVA",
    inactiveType: "CANCELACION_BORRADOR",
    creatorUserId: journey.creadorUsuarioId,
    creatorDisplayName: journey.creadorNombreVisible,
    version: journey.version as number,
    lineIds: journey.lineaIds as string[],
    participants: journey.participantes.map(parseDraftParticipant),
    cancellationId: journey.cancelacionId,
    cancelledByUserId: journey.canceladaPorUsuarioId,
    cancelledByDisplayName: journey.canceladaPorNombreVisible,
    cancellationReason: journey.motivoCancelacion,
    cancelledAt: journey.canceladaEn,
    createdAt: journey.creadaEn,
    updatedAt: journey.actualizadaEn,
  };
}

function parseManageableUser(value: unknown): ManageableUser {
  if (typeof value !== "object" || value === null) throw new Error("Un perfil administrativo no es valido.");
  const profile = value as Record<string, unknown>;
  const work = profile.resumenTrabajoActivo;
  if (
    typeof profile.usuarioId !== "string" ||
    typeof profile.nombreVisible !== "string" ||
    !isRole(profile.rol) ||
    typeof profile.activo !== "boolean" ||
    !Number.isSafeInteger(profile.version) ||
    typeof profile.puedeCambiarRol !== "boolean" ||
    typeof work !== "object" ||
    work === null
  ) {
    throw new Error("Un perfil administrativo no es valido.");
  }
  const summary = work as Record<string, unknown>;
  const blockers = summary.bloqueosCambioRol;
  if (
    !Number.isSafeInteger(summary.jornadasActivas) ||
    !Number.isSafeInteger(summary.reservasActivas) ||
    !Number.isSafeInteger(summary.correccionesPendientes) ||
    typeof summary.tieneTrabajoActivo !== "boolean" ||
    !Array.isArray(blockers) ||
    blockers.some((blocker) =>
      blocker !== "JORNADA_ACTIVA" && blocker !== "RESERVA_ACTIVA" && blocker !== "CORRECCION_PENDIENTE"
    )
  ) {
    throw new Error("El resumen de trabajo del perfil no es valido.");
  }
  return {
    id: profile.usuarioId,
    displayName: profile.nombreVisible,
    role: profile.rol,
    active: profile.activo,
    version: profile.version as number,
    canChangeRole: profile.puedeCambiarRol,
    activeWork: {
      activeJourneys: summary.jornadasActivas as number,
      activeReservations: summary.reservasActivas as number,
      pendingCorrections: summary.correccionesPendientes as number,
      hasActiveWork: summary.tieneTrabajoActivo,
      roleChangeBlockers: blockers,
    },
  };
}

export class FirebaseMonitorRepository implements MonitorRepository {
  readonly emulatorEnabled = true;

  private constructor(
    private readonly auth: ReturnType<typeof getAuth>,
    private readonly firestore: Firestore,
    private readonly functions: Functions,
  ) {}

  static create(): FirebaseMonitorRepository {
    const config = loadEmulatorConfig();
    const app = getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: "demo-api-key",
          appId: "1:1234567890:web:demo-etapa3",
          authDomain: `${config.projectId}.firebaseapp.com`,
          projectId: config.projectId,
        });
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    const functions = getFunctions(app, "us-central1");
    connectAuthEmulator(auth, `http://${config.host}:9099`, {disableWarnings: true});
    connectFirestoreEmulator(firestore, config.host, 8180);
    connectFunctionsEmulator(functions, config.host, 5001);
    return new FirebaseMonitorRepository(auth, firestore, functions);
  }

  async signIn(email: string, password: string): Promise<MonitorUser> {
    try {
      const credential = await signInWithEmailAndPassword(this.auth, email.trim(), password);
      const profile = await getDoc(doc(this.firestore, "usuarios", credential.user.uid));
      if (!profile.exists()) throw new Error("La cuenta no tiene un perfil operativo.");
      if (profile.data().activo !== true) throw new Error("La cuenta está inactiva.");
      const roles = profile.data().roles;
      const role = Array.isArray(roles) ? roles.find(isRole) : undefined;
      if (!role) throw new Error("La cuenta no tiene un rol operativo.");
      return {
        id: credential.user.uid,
        displayName: typeof profile.data().nombreVisible === "string"
          ? profile.data().nombreVisible
          : "Usuario de prueba",
        role,
        canViewReservationDetails: role === "SUPERVISOR" || role === "ADMINISTRADOR",
        canReview: role === "SUPERVISOR" || role === "ADMINISTRADOR",
        canRelease: role === "SUPERVISOR" || role === "ADMINISTRADOR",
        canManageDraftJourneys: role === "SUPERVISOR" || role === "ADMINISTRADOR",
        canManageUsers: role === "ADMINISTRADOR",
      };
    } catch (error) {
      await this.auth.signOut();
      throw new Error(error instanceof Error ? error.message : "No fue posible iniciar sesión.", {cause: error});
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  observeAccountStatus(
    userId: string,
    onActiveChanged: (active: boolean) => void,
    onError: (message: string) => void,
  ): MonitorUnsubscribe {
    return onSnapshot(
      doc(this.firestore, "usuarios", userId),
      (snapshot) => {
        if (!snapshot.exists()) {
          onError("La cuenta ya no tiene un perfil operativo.");
          return;
        }
        onActiveChanged(snapshot.data().activo === true);
      },
      () => onError("No fue posible comprobar el estado de la cuenta."),
    );
  }

  async listActiveJourneys(): Promise<readonly MonitorJourney[]> {
    const callable = httpsCallable<Record<string, never>, {jornadas: unknown[]}>(this.functions, "listarJornadasActivas");
    try {
      const response = await callable({});
      if (!Array.isArray(response.data.jornadas)) throw new Error("La respuesta no contiene jornadas.");
      return response.data.jornadas.map((value) => {
        if (typeof value !== "object" || value === null) throw new Error("Una jornada no tiene formato válido.");
        const journey = value as Record<string, unknown>;
        if (
          typeof journey.jornadaId !== "string" ||
          typeof journey.nombreVisible !== "string" ||
          journey.estado !== "ACTIVA" ||
          !isRole(journey.rolEfectivo) ||
          typeof journey.puedeContar !== "boolean" ||
          !Number.isSafeInteger(journey.cantidadLineas) ||
          !Number.isSafeInteger(journey.version) ||
          typeof journey.puedeCerrar !== "boolean"
        ) throw new Error("Una jornada no tiene formato válido.");
        return {
          id: journey.jornadaId,
          displayName: journey.nombreVisible,
          state: "ACTIVA" as const,
          effectiveRole: journey.rolEfectivo,
          canCount: journey.puedeContar,
          lineCount: journey.cantidadLineas as number,
          version: journey.version as number,
          canClose: journey.puedeCerrar,
        };
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible consultar las jornadas activas.", {cause: error});
    }
  }

  async listManageableJourneys(): Promise<ManageableJourneysData> {
    const callable = httpsCallable<Record<string, never>, {
      jornadas: unknown[];
      jornadasCanceladas: unknown[];
      lineasCatalogo: unknown[];
    }>(
      this.functions,
      "listarJornadasAdministrables",
    );
    try {
      const response = await callable({});
      if (
        !Array.isArray(response.data.jornadas) ||
        !Array.isArray(response.data.jornadasCanceladas) ||
        !Array.isArray(response.data.lineasCatalogo)
      ) {
        throw new Error("La respuesta administrativa no tiene formato vÃ¡lido.");
      }
      return {
        journeys: response.data.jornadas.map(parseDraftJourney),
        cancelledJourneys: response.data.jornadasCanceladas.map(parseCancelledDraftJourney),
        catalogLines: response.data.lineasCatalogo.map(parseDraftCatalogLine),
      };
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "No fue posible consultar los borradores.",
        {cause: error},
      );
    }
  }

  async listManageableUsers(): Promise<readonly ManageableUser[]> {
    const callable = httpsCallable<Record<string, never>, {usuarios: unknown[]}>(
      this.functions,
      "listarUsuariosAdministrables",
    );
    try {
      const response = await callable({});
      if (!Array.isArray(response.data.usuarios)) {
        throw new Error("La respuesta de usuarios no tiene formato valido.");
      }
      return response.data.usuarios.map(parseManageableUser);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible consultar los usuarios.", {cause: error});
    }
  }

  async updateUserStatus(
    userId: string,
    expectedVersion: number,
    active: boolean,
    reason: string,
    idempotencyKey: string,
  ): Promise<ManageableUser> {
    const callable = httpsCallable(this.functions, "actualizarEstadoUsuario");
    try {
      const response = await callable({
        usuarioId: userId,
        versionEsperada: expectedVersion,
        nuevoEstado: active ? "ACTIVO" : "INACTIVO",
        motivo: reason,
        claveIdempotencia: idempotencyKey,
      });
      if (
        typeof response.data !== "object" ||
        response.data === null ||
        (response.data as Record<string, unknown>).operacion !== "ESTADO_USUARIO_ACTUALIZADO"
      ) {
        throw new Error("La respuesta del cambio de estado no es valida.");
      }
      return parseManageableUser(response.data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible actualizar el estado.", {cause: error});
    }
  }

  async updateUserRole(
    userId: string,
    expectedVersion: number,
    role: MonitorRole,
    reason: string,
    idempotencyKey: string,
  ): Promise<ManageableUser> {
    const callable = httpsCallable(this.functions, "actualizarRolUsuario");
    try {
      const response = await callable({
        usuarioId: userId,
        versionEsperada: expectedVersion,
        nuevoRol: role,
        motivo: reason,
        claveIdempotencia: idempotencyKey,
      });
      if (
        typeof response.data !== "object" ||
        response.data === null ||
        (response.data as Record<string, unknown>).operacion !== "ROL_USUARIO_ACTUALIZADO"
      ) {
        throw new Error("La respuesta del cambio de rol no es valida.");
      }
      return parseManageableUser(response.data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible actualizar el rol.", {cause: error});
    }
  }

  async createDraftJourney(displayName: string, idempotencyKey: string): Promise<ManageableDraftJourney> {
    const callable = httpsCallable(this.functions, "crearJornadaBorrador");
    try {
      const response = await callable({nombreVisible: displayName, claveIdempotencia: idempotencyKey});
      return parseDraftJourney(response.data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible crear el borrador.", {cause: error});
    }
  }

  async updateDraftJourneyLines(
    journeyId: string,
    lineIds: readonly string[],
    idempotencyKey: string,
  ): Promise<void> {
    const callable = httpsCallable(this.functions, "actualizarLineasJornadaBorrador");
    try {
      await callable({jornadaId: journeyId, lineaIds: lineIds, claveIdempotencia: idempotencyKey});
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible guardar la selecciÃ³n.", {cause: error});
    }
  }

  async listDraftJourneyParticipants(journeyId: string): Promise<DraftParticipantsData> {
    const callable = httpsCallable(this.functions, "listarParticipantesJornadaBorrador");
    try {
      const response = await callable({jornadaId: journeyId});
      if (typeof response.data !== "object" || response.data === null) {
        throw new Error("La respuesta de participantes no tiene formato valido.");
      }
      const data = response.data as Record<string, unknown>;
      if (
        data.jornadaId !== journeyId ||
        data.estado !== "BORRADOR" ||
        !Number.isSafeInteger(data.version) ||
        !Number.isSafeInteger(data.versionSeleccionLineas) ||
        !Number.isSafeInteger(data.versionSeleccionParticipantes) ||
        !Array.isArray(data.participantes) ||
        !Array.isArray(data.usuariosActivos)
      ) {
        throw new Error("La respuesta de participantes no tiene formato valido.");
      }
      return {
        journeyId,
        state: "BORRADOR",
        version: data.version as number,
        lineSelectionVersion: data.versionSeleccionLineas as number,
        participantSelectionVersion: data.versionSeleccionParticipantes as number,
        participants: data.participantes.map(parseDraftParticipant),
        activeUsers: data.usuariosActivos.map(parseDraftParticipantCandidate),
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible consultar participantes.", {cause: error});
    }
  }

  async updateDraftJourneyParticipants(
    journeyId: string,
    participants: readonly DraftParticipantInput[],
    idempotencyKey: string,
  ): Promise<void> {
    const callable = httpsCallable(this.functions, "actualizarParticipantesJornadaBorrador");
    try {
      await callable({
        jornadaId: journeyId,
        participantes: participants.map((participant) => ({
          usuarioId: participant.userId,
          puedeContar: participant.canCount,
        })),
        claveIdempotencia: idempotencyKey,
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible guardar participantes.", {cause: error});
    }
  }

  async activateDraftJourney(
    journeyId: string,
    versions: DraftActivationVersions,
    idempotencyKey: string,
  ): Promise<DraftActivationResult> {
    const callable = httpsCallable(this.functions, "activarJornada");
    try {
      const response = await callable({
        jornadaId: journeyId,
        versionJornadaEsperada: versions.journey,
        versionSeleccionLineasEsperada: versions.lineSelection,
        versionSeleccionParticipantesEsperada: versions.participantSelection,
        claveIdempotencia: idempotencyKey,
      });
      if (typeof response.data !== "object" || response.data === null) {
        throw new Error("La respuesta de activación no tiene formato válido.");
      }
      const data = response.data as Record<string, unknown>;
      if (
        data.jornadaId !== journeyId ||
        data.estado !== "ACTIVA" ||
        !Number.isSafeInteger(data.version) ||
        !Number.isSafeInteger(data.cantidadLineas) ||
        !Number.isSafeInteger(data.cantidadParticipantes) ||
        typeof data.activadaEn !== "string"
      ) {
        throw new Error("La respuesta de activación no tiene formato válido.");
      }
      return {
        journeyId,
        state: "ACTIVA",
        version: data.version as number,
        lineCount: data.cantidadLineas as number,
        participantCount: data.cantidadParticipantes as number,
        activatedAt: data.activadaEn,
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible activar la jornada.", {cause: error});
    }
  }

  async approveCount(countId: string, idempotencyKey: string, exceptionReason?: string): Promise<void> {
    const callable = httpsCallable(this.functions, "aprobarConteo");
    try {
      await callable({
        conteoId: countId,
        claveIdempotencia: idempotencyKey,
        ...(exceptionReason === undefined ? {} : {motivoExcepcion: exceptionReason}),
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible aprobar el conteo.", {cause: error});
    }
  }

  async cancelDraftJourney(
    journeyId: string,
    expectedVersion: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<void> {
    const callable = httpsCallable(this.functions, "cancelarJornadaBorrador");
    try {
      const response = await callable({
        jornadaId: journeyId,
        versionEsperada: expectedVersion,
        motivo: reason,
        claveIdempotencia: idempotencyKey,
      });
      if (typeof response.data !== "object" || response.data === null) {
        throw new Error("La respuesta de cancelacion no tiene formato valido.");
      }
      const data = response.data as Record<string, unknown>;
      if (
        data.jornadaId !== journeyId ||
        data.estado !== "INACTIVA" ||
        data.tipoInactivacion !== "CANCELACION_BORRADOR" ||
        !Number.isSafeInteger(data.version) ||
        typeof data.cancelacionId !== "string" ||
        typeof data.canceladaEn !== "string"
      ) {
        throw new Error("La respuesta de cancelacion no tiene formato valido.");
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible cancelar el borrador.", {cause: error});
    }
  }

  async reopenCancelledJourney(journeyId: string, expectedVersion: number, idempotencyKey: string): Promise<void> {
    const callable = httpsCallable(this.functions, "reabrirJornadaCancelada");
    try {
      const response = await callable({
        jornadaId: journeyId,
        versionEsperada: expectedVersion,
        claveIdempotencia: idempotencyKey,
      });
      if (typeof response.data !== "object" || response.data === null) {
        throw new Error("La respuesta de reapertura no tiene formato valido.");
      }
      const data = response.data as Record<string, unknown>;
      if (
        data.jornadaId !== journeyId ||
        data.estado !== "BORRADOR" ||
        !Number.isSafeInteger(data.version) ||
        typeof data.cancelacionAnteriorId !== "string" ||
        typeof data.reabiertaEn !== "string"
      ) {
        throw new Error("La respuesta de reapertura no tiene formato valido.");
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible reabrir el borrador.", {cause: error});
    }
  }

  async closeJourney(journeyId: string, expectedVersion: number, idempotencyKey: string): Promise<void> {
    const callable = httpsCallable(this.functions, "cerrarJornada");
    try {
      const response = await callable({
        jornadaId: journeyId,
        versionEsperada: expectedVersion,
        claveIdempotencia: idempotencyKey,
      });
      if (typeof response.data !== "object" || response.data === null) {
        throw new Error("La respuesta de cierre no tiene formato válido.");
      }
      const data = response.data as Record<string, unknown>;
      if (data.jornadaId !== journeyId || data.estado !== "INACTIVA" || !Number.isSafeInteger(data.version)) {
        throw new Error("La respuesta de cierre no tiene formato válido.");
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible cerrar la jornada.", {cause: error});
    }
  }

  async returnCount(countId: string, reason: string, idempotencyKey: string): Promise<void> {
    const callable = httpsCallable(this.functions, "devolverConteo");
    try {
      await callable({conteoId: countId, motivo: reason, claveIdempotencia: idempotencyKey});
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible devolver el conteo.", {cause: error});
    }
  }

  async reassignCountCorrection(
    countId: string,
    newUserId: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<void> {
    const callable = httpsCallable(this.functions, "reasignarCorreccionConteo");
    try {
      await callable({
        conteoId: countId,
        nuevoUsuarioId: newUserId,
        motivo: reason,
        claveIdempotencia: idempotencyKey,
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible reasignar la corrección.", {cause: error});
    }
  }

  async releaseReservation(reservationId: string, reason: string, idempotencyKey: string): Promise<void> {
    const callable = httpsCallable(this.functions, "liberarReservaLinea");
    try {
      await callable({reservaId: reservationId, motivo: reason, claveIdempotencia: idempotencyKey});
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible liberar la reserva.", {cause: error});
    }
  }

  observeMonitor(
    user: MonitorUser,
    journeyId: string,
    onMonitorSnapshot: (snapshot: MonitorSnapshot) => void,
    onError: (message: string) => void,
  ): MonitorUnsubscribe {
    let journeyDisplayName: string | undefined;
    let lines: MonitorLine[] = [];
    let reservations = new Map<string, MonitorReservation>();
    let counts = new Map<string, MonitorCount[]>();
    let returnReasons = new Map<string, string>();
    let inventories = new Map<string, MonitorInventory>();
    let reassignments = new Map<string, MonitorCorrectionResponsibility>();
    let correctionCandidates: MonitorCorrectionCandidate[] = [];

    const publish = () => {
      if (!journeyDisplayName) return;
      onMonitorSnapshot({
        journeyId,
        journeyDisplayName,
        lines: sortMonitorLines(lines.map((line) => {
          const history = (counts.get(line.id) ?? [])
            .map((count) => ({...count, returnReason: returnReasons.get(count.id)}))
            .sort((left, right) => left.version - right.version);
          return {
            ...line,
            reservation: reservations.get(line.id),
            count: history.find((count) => count.id === line.currentCountId) ?? history.at(-1),
            countHistory: history,
            inventory: inventories.get(line.lineId),
            ...(line.activeReassignmentId && reassignments.has(line.activeReassignmentId)
              ? {correctionResponsibility: reassignments.get(line.activeReassignmentId)}
              : {}),
          };
        })),
        correctionCandidates,
      });
    };
    const subscriptions = [
      onSnapshot(
        doc(this.firestore, "jornadas", journeyId),
        (snapshot) => {
          if (!snapshot.exists()) {
            onError("La jornada ficticia no existe.");
            return;
          }
          journeyDisplayName = typeof snapshot.data().nombreVisible === "string"
            ? snapshot.data().nombreVisible
            : journeyId;
          publish();
        },
        () => onError("No fue posible leer la jornada de prueba."),
      ),
      onSnapshot(
        query(collection(this.firestore, "jornadaLineas"), where("jornadaId", "==", journeyId)),
        (snapshot) => {
          lines = snapshot.docs.flatMap((documentSnapshot) => {
            const data = documentSnapshot.data();
            const location = parseLocation(data.ubicacion);
            if (
              !location ||
              typeof data.lineaId !== "string" ||
              !Number.isSafeInteger(data.version) ||
              !["DISPONIBLE", "EN_CONTEO", "PENDIENTE_REVISION", "DEVUELTA", "APROBADA"].includes(data.estadoCentral as string)
            ) {
              return [];
            }
            return [{
              id: documentSnapshot.id,
              lineId: data.lineaId,
              version: data.version,
              state: data.estadoCentral,
              location,
              ...(typeof data.conteoVigenteId === "string" ? {currentCountId: data.conteoVigenteId} : {}),
              ...(typeof data.reasignacionActivaId === "string"
                ? {activeReassignmentId: data.reasignacionActivaId}
                : {}),
            }];
          });
          publish();
        },
        () => onError("No fue posible leer las líneas de prueba."),
      ),
    ];

    if (user.canViewReservationDetails) {
      subscriptions.push(
        onSnapshot(
          query(collection(this.firestore, "reasignacionesCorreccion"), where("jornadaId", "==", journeyId)),
          (snapshot) => {
            reassignments = new Map(snapshot.docs.flatMap((documentSnapshot) => {
              const data = documentSnapshot.data();
              const assignedAt = data.reasignadaEn;
              if (
                typeof data.autorOriginalUsuarioId !== "string" ||
                typeof data.autorOriginalNombreVisible !== "string" ||
                typeof data.nuevoUsuarioId !== "string" ||
                typeof data.nuevoUsuarioNombreVisible !== "string" ||
                typeof data.actorUsuarioId !== "string" ||
                typeof data.actorNombreVisible !== "string" ||
                typeof data.motivo !== "string" ||
                !(assignedAt instanceof Timestamp)
              ) return [];
              return [[documentSnapshot.id, {
                reassignmentId: documentSnapshot.id,
                originalAuthorUserId: data.autorOriginalUsuarioId,
                originalAuthorDisplayName: data.autorOriginalNombreVisible,
                responsibleUserId: data.nuevoUsuarioId,
                responsibleDisplayName: data.nuevoUsuarioNombreVisible,
                assignedByUserId: data.actorUsuarioId,
                assignedByDisplayName: data.actorNombreVisible,
                reason: data.motivo,
                assignedAt: assignedAt.toDate().toISOString(),
              }] as const];
            }));
            publish();
          },
          () => onError("No fue posible leer las reasignaciones de corrección."),
        ),
      );
      subscriptions.push(
        onSnapshot(
          collection(this.firestore, "jornadas", journeyId, "autorizaciones"),
          (snapshot) => {
            correctionCandidates = snapshot.docs.flatMap((documentSnapshot) => {
              const data = documentSnapshot.data();
              if (
                data.activa !== true ||
                data.usuarioActivo !== true ||
                data.puedeContar !== true ||
                typeof data.usuarioNombreVisible !== "string" ||
                !isRole(data.rolEfectivo)
              ) return [];
              return [{
                id: documentSnapshot.id,
                displayName: data.usuarioNombreVisible,
                role: data.rolEfectivo,
              }];
            }).sort((left, right) => left.displayName.localeCompare(right.displayName, "es"));
            publish();
          },
          () => onError("No fue posible leer las autorizaciones de la jornada."),
        ),
      );
      subscriptions.push(
        onSnapshot(
          query(collection(this.firestore, "reservas"), where("jornadaId", "==", journeyId)),
          (snapshot) => {
            reservations = new Map(
              snapshot.docs.flatMap((documentSnapshot) => {
                const data = documentSnapshot.data();
                const timestamp = data.reservadaEn;
                if (
                  typeof data.jornadaLineaId !== "string" ||
                  data.estadoReserva !== "ACTIVA" ||
                  typeof data.usuarioNombreVisible !== "string" ||
                  typeof data.dispositivoId !== "string" ||
                  !["INICIAL", "CORRECCION"].includes((data.tipoReserva ?? "INICIAL") as string) ||
                  !(timestamp instanceof Timestamp)
                ) {
                  return [];
                }
                return [[
                  data.jornadaLineaId,
                  {
                    id: documentSnapshot.id,
                    userDisplayName: data.usuarioNombreVisible,
                    type: data.tipoReserva ?? "INICIAL",
                    deviceId: data.dispositivoId,
                    reservedAt: timestamp.toDate().toISOString(),
                  },
                ] as const];
              }),
            );
            publish();
          },
          () => onError("No fue posible leer las reservas operativas."),
        ),
      );
      subscriptions.push(
        onSnapshot(
          query(collection(this.firestore, "conteos"), where("jornadaId", "==", journeyId)),
          (snapshot) => {
            const nextCounts = new Map<string, MonitorCount[]>();
            snapshot.docs.forEach((documentSnapshot) => {
                const data = documentSnapshot.data();
                const receivedAt = data.recibidoEn;
                if (
                  typeof data.jornadaLineaId !== "string" ||
                  typeof data.autorNombreVisible !== "string" ||
                  !isRole(data.rolEfectivo) ||
                  typeof data.dispositivoId !== "string" ||
                  !Number.isSafeInteger(data.hembras) ||
                  !Number.isSafeInteger(data.machos) ||
                  !Number.isSafeInteger(data.patrones) ||
                  !Number.isSafeInteger(data.total) ||
                  typeof data.timestampDispositivo !== "string" ||
                  !(receivedAt instanceof Timestamp) ||
                  !Number.isSafeInteger(data.versionNumero)
                ) {
                  return;
                }
                const count: MonitorCount = {
                  id: documentSnapshot.id,
                  authorUserId: data.autorUsuarioId,
                  authorDisplayName: data.autorNombreVisible,
                  effectiveRole: data.rolEfectivo,
                  deviceId: data.dispositivoId,
                  females: data.hembras,
                  males: data.machos,
                  rootstocks: data.patrones,
                  total: data.total,
                  ...(typeof data.observaciones === "string" && data.observaciones !== ""
                    ? {observations: data.observaciones}
                    : {}),
                  deviceTimestamp: data.timestampDispositivo,
                  serverTimestamp: receivedAt.toDate().toISOString(),
                  version: data.versionNumero,
                  ...(typeof data.conteoAnteriorId === "string"
                    ? {previousCountId: data.conteoAnteriorId}
                    : {}),
                };
                const history = nextCounts.get(data.jornadaLineaId) ?? [];
                history.push(count);
                nextCounts.set(data.jornadaLineaId, history);
              });
            counts = nextCounts;
            publish();
          },
          () => onError("No fue posible leer los conteos pendientes."),
        ),
      );
      subscriptions.push(
        onSnapshot(
          query(collection(this.firestore, "decisionesRevision"), where("jornadaId", "==", journeyId)),
          (snapshot) => {
            returnReasons = new Map(snapshot.docs.flatMap((documentSnapshot) => {
              const data = documentSnapshot.data();
              if (data.decision !== "DEVOLVER" || typeof data.conteoId !== "string" || typeof data.motivo !== "string") {
                return [];
              }
              return [[data.conteoId, data.motivo] as const];
            }));
            publish();
          },
          () => onError("No fue posible leer los motivos de devolución."),
        ),
      );
      subscriptions.push(
        onSnapshot(
          query(collection(this.firestore, "inventarioOficialLineas"), where("jornadaId", "==", journeyId)),
          (snapshot) => {
            inventories = new Map(
              snapshot.docs.flatMap((documentSnapshot) => {
                const data = documentSnapshot.data();
                if (
                  typeof data.lineaId !== "string" ||
                  !Number.isSafeInteger(data.hembras) ||
                  !Number.isSafeInteger(data.machos) ||
                  !Number.isSafeInteger(data.patrones) ||
                  !Number.isSafeInteger(data.total) ||
                  !Number.isSafeInteger(data.version)
                ) {
                  return [];
                }
                return [[data.lineaId, {
                  females: data.hembras,
                  males: data.machos,
                  rootstocks: data.patrones,
                  total: data.total,
                  version: data.version,
                }] as const];
              }),
            );
            publish();
          },
          () => onError("No fue posible leer el inventario oficial ficticio."),
        ),
      );
    }

    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }
}

export class DisabledMonitorRepository implements MonitorRepository {
  readonly emulatorEnabled = false;

  async signIn(): Promise<MonitorUser> {
    throw new Error("Configuración de emulador inválida. No se intentará conectar a producción.");
  }

  async signOut(): Promise<void> {}

  observeAccountStatus(): MonitorUnsubscribe {
    return () => undefined;
  }

  async listActiveJourneys(): Promise<readonly MonitorJourney[]> {
    throw new Error("Firebase de producción permanece deshabilitado.");
  }

  async listManageableJourneys(): Promise<ManageableJourneysData> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async listManageableUsers(): Promise<readonly ManageableUser[]> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async updateUserStatus(): Promise<ManageableUser> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async updateUserRole(): Promise<ManageableUser> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async createDraftJourney(): Promise<ManageableDraftJourney> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async updateDraftJourneyLines(): Promise<void> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async listDraftJourneyParticipants(): Promise<DraftParticipantsData> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async updateDraftJourneyParticipants(): Promise<void> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async activateDraftJourney(): Promise<DraftActivationResult> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async cancelDraftJourney(): Promise<void> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async reopenCancelledJourney(): Promise<void> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async closeJourney(): Promise<void> {
    throw new Error("Firebase de produccion permanece deshabilitado.");
  }

  async approveCount(): Promise<void> {
    throw new Error("Firebase de producción permanece deshabilitado.");
  }

  async returnCount(): Promise<void> {
    throw new Error("Firebase de producción permanece deshabilitado.");
  }

  async reassignCountCorrection(): Promise<void> {
    throw new Error("Firebase de producción permanece deshabilitado.");
  }

  async releaseReservation(): Promise<void> {
    throw new Error("Firebase de producción permanece deshabilitado.");
  }

  observeMonitor(): MonitorUnsubscribe {
    return () => undefined;
  }
}
