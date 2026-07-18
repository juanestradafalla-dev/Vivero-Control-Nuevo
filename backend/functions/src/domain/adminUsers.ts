import {createHash, randomUUID} from "node:crypto";

import type {Auth} from "firebase-admin/auth";
import {
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction
} from "firebase-admin/firestore";

import type {
  CreateManageableUserRequest,
  CreateManageableUserResult,
  ListManageableUsersResult,
  ManageableUserSummary,
  TrustedOperationContext,
  UpdateUserRoleRequest,
  UpdateUserRoleResult,
  UpdateUserStatusRequest,
  UpdateUserStatusResult,
  UserActiveWorkSummary,
  UserRole,
  UserRoleChangeBlocker
} from "./contracts.js";
import {domainErrors} from "./errors.js";

interface UserDocument {
  readonly nombreVisible?: string;
  readonly roles?: unknown;
  readonly activo?: boolean;
  readonly version?: number;
}

interface AuthorizationDocument {
  readonly activa?: boolean;
  readonly usuarioId?: string;
}

interface ReservationDocument {
  readonly usuarioId?: string;
  readonly estadoReserva?: string;
}

interface JourneyLineDocument {
  readonly estadoCentral?: string;
  readonly responsableCorreccionUsuarioId?: string | null;
}

interface IdempotencyDocument<Result> {
  readonly payloadHash?: string;
  readonly resultado?: Result;
}

interface UserCreationClaimDocument {
  readonly payloadHash?: string;
  readonly propietarioIntentoId?: string;
}

type UserCreationAuth = Pick<Auth, "createUser" | "deleteUser" | "getUser">;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function roleFromProfile(profile: UserDocument): UserRole {
  if (!Array.isArray(profile.roles) || profile.roles.length !== 1) throw domainErrors.internal();
  const role = profile.roles[0];
  if (role !== "AUXILIAR" && role !== "SUPERVISOR" && role !== "ADMINISTRADOR") {
    throw domainErrors.internal();
  }
  return role;
}

function assertActiveAdmin(snapshot: DocumentSnapshot): UserDocument {
  if (!snapshot.exists) throw domainErrors.userNotFound();
  const profile = snapshot.data() as UserDocument;
  if (profile.activo !== true) throw domainErrors.userInactive();
  if (roleFromProfile(profile) !== "ADMINISTRADOR") throw domainErrors.permissionDenied();
  return profile;
}

function profileVersion(profile: UserDocument): number {
  if (!Number.isSafeInteger(profile.version) || (profile.version as number) < 1) throw domainErrors.internal();
  return profile.version as number;
}

function nextVersion(version: number): number {
  if (version >= Number.MAX_SAFE_INTEGER) throw domainErrors.internal();
  return version + 1;
}

function activeWorkSummary(
  activeJourneyCount: number,
  activeReservationCount: number,
  pendingCorrectionCount: number
): UserActiveWorkSummary {
  const blockers: UserRoleChangeBlocker[] = [];
  if (activeJourneyCount > 0) blockers.push("JORNADA_ACTIVA");
  if (activeReservationCount > 0) blockers.push("RESERVA_ACTIVA");
  if (pendingCorrectionCount > 0) blockers.push("CORRECCION_PENDIENTE");
  return {
    jornadasActivas: activeJourneyCount,
    reservasActivas: activeReservationCount,
    correccionesPendientes: pendingCorrectionCount,
    tieneTrabajoActivo: blockers.length > 0,
    bloqueosCambioRol: blockers
  };
}

function manageableUser(
  userId: string,
  profile: UserDocument,
  work: UserActiveWorkSummary
): ManageableUserSummary {
  if (typeof profile.nombreVisible !== "string" || profile.nombreVisible.trim() === "") {
    throw domainErrors.internal();
  }
  return {
    usuarioId: userId,
    nombreVisible: profile.nombreVisible,
    rol: roleFromProfile(profile),
    activo: profile.activo === true,
    version: profileVersion(profile),
    puedeCambiarRol: work.bloqueosCambioRol.length === 0,
    resumenTrabajoActivo: work
  };
}

function emptyWorkSummary(): UserActiveWorkSummary {
  return activeWorkSummary(0, 0, 0);
}

function authErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function mapUserCreationAuthError(error: unknown): never {
  const code = authErrorCode(error);
  if (code === "auth/email-already-exists") throw domainErrors.userEmailAlreadyExists();
  if (code === "auth/invalid-email") throw domainErrors.userEmailInvalid();
  if (code === "auth/invalid-password" || code === "auth/password-does-not-meet-requirements") {
    throw domainErrors.userPasswordWeak();
  }
  throw domainErrors.internal();
}

function deterministicUserId(idempotencyId: string): string {
  return `et25-${idempotencyId}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class CreateManageableUserService {
  constructor(
    private readonly firestore: Firestore,
    private readonly auth: UserCreationAuth
  ) {}

  async execute(
    request: CreateManageableUserRequest,
    context: TrustedOperationContext
  ): Promise<CreateManageableUserResult> {
    const idempotencyId = sha256(`${context.actorId}:CREAR_USUARIO:${request.claveIdempotencia}`);
    // La contrasena se excluye deliberadamente: no se persiste ni siquiera un hash derivado de ella.
    const payloadHash = sha256(JSON.stringify({
      nombreVisible: request.nombreVisible,
      correo: request.correo,
      rol: request.rol
    }));
    const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
    const claimRef = this.firestore.collection("bloqueosCreacionUsuarios").doc(idempotencyId);
    const attemptId = randomUUID();
    const targetUserId = deterministicUserId(idempotencyId);

    const claim = await this.firestore.runTransaction(async (transaction) => {
      const [actorSnapshot, idempotencySnapshot, claimSnapshot] = await transaction.getAll(
        this.firestore.collection("usuarios").doc(context.actorId),
        idempotencyRef,
        claimRef
      );
      if (!actorSnapshot || !idempotencySnapshot || !claimSnapshot) throw domainErrors.internal();
      assertActiveAdmin(actorSnapshot);
      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<CreateManageableUserResult>;
        if (previous.payloadHash !== payloadHash) throw domainErrors.idempotencyConflict();
        if (!previous.resultado) throw domainErrors.internal();
        return {owner: false, result: previous.resultado};
      }
      if (claimSnapshot.exists) {
        const previousClaim = claimSnapshot.data() as UserCreationClaimDocument;
        if (previousClaim.payloadHash !== payloadHash) throw domainErrors.idempotencyConflict();
        return {owner: false, result: null};
      }
      transaction.create(claimRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "CREAR_USUARIO",
        propietarioIntentoId: attemptId,
        usuarioIdObjetivo: targetUserId,
        payloadHash,
        creadoEn: Timestamp.now()
      });
      return {owner: true, result: null};
    });
    if (claim.result) return claim.result;
    if (!claim.owner) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await delay(Math.min(25 * (attempt + 1), 250));
        const concurrent = await idempotencyRef.get();
        if (concurrent.exists) {
          const previous = concurrent.data() as IdempotencyDocument<CreateManageableUserResult>;
          if (previous.payloadHash !== payloadHash) throw domainErrors.idempotencyConflict();
          if (previous.resultado) return previous.resultado;
        } else if (!(await claimRef.get()).exists) {
          break;
        }
      }
      throw domainErrors.internal();
    }

    let createdAuthThisAttempt = false;
    try {
      await this.auth.createUser({
        uid: targetUserId,
        email: request.correo,
        password: request.password,
        displayName: request.nombreVisible,
        disabled: false,
        emailVerified: false
      });
      createdAuthThisAttempt = true;
    } catch (error) {
      const code = authErrorCode(error);
      if (code === "auth/email-already-exists" || code === "auth/uid-already-exists") {
        let existing;
        try {
          existing = await this.auth.getUser(targetUserId);
        } catch (lookupError) {
          await this.removePendingClaim(claimRef, attemptId);
          if (authErrorCode(lookupError) === "auth/user-not-found") mapUserCreationAuthError(error);
          throw domainErrors.internal();
        }
        if (
          existing.email === request.correo &&
          existing.displayName === request.nombreVisible &&
          existing.disabled === false &&
          existing.emailVerified === false
        ) {
          createdAuthThisAttempt = false;
        } else {
          await this.removePendingClaim(claimRef, attemptId);
          mapUserCreationAuthError(error);
        }
      } else {
        await this.removePendingClaim(claimRef, attemptId);
        mapUserCreationAuthError(error);
      }
    }

    try {
      const outcome = await this.firestore.runTransaction(async (transaction) => {
        const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
        const targetRef = this.firestore.collection("usuarios").doc(targetUserId);
        const [actorSnapshot, targetSnapshot, idempotencySnapshot, claimSnapshot] = await transaction.getAll(
          actorRef,
          targetRef,
          idempotencyRef,
          claimRef
        );
        if (!actorSnapshot || !targetSnapshot || !idempotencySnapshot || !claimSnapshot) {
          throw domainErrors.internal();
        }
        assertActiveAdmin(actorSnapshot);
        if (idempotencySnapshot.exists) {
          const previous = idempotencySnapshot.data() as IdempotencyDocument<CreateManageableUserResult>;
          if (previous.payloadHash !== payloadHash) throw domainErrors.idempotencyConflict();
          if (previous.resultado) return previous.resultado;
          throw domainErrors.internal();
        }
        if (!claimSnapshot.exists) throw domainErrors.internal();
        const currentClaim = claimSnapshot.data() as UserCreationClaimDocument;
        if (currentClaim.payloadHash !== payloadHash || currentClaim.propietarioIntentoId !== attemptId) {
          throw domainErrors.internal();
        }
        if (targetSnapshot.exists) throw domainErrors.internal();

        const now = Timestamp.now();
        const work = emptyWorkSummary();
        const result: CreateManageableUserResult = {
          usuarioId: targetUserId,
          nombreVisible: request.nombreVisible,
          rol: request.rol,
          activo: true,
          version: 1,
          puedeCambiarRol: true,
          resumenTrabajoActivo: work,
          operacion: "USUARIO_CREADO",
          creadoEn: now.toDate().toISOString()
        };
        const auditId = randomUUID();
        transaction.create(targetRef, {
          id: targetUserId,
          nombreVisible: request.nombreVisible,
          roles: [request.rol],
          activo: true,
          version: 1,
          creadoEn: now,
          actualizadoEn: now
        });
        transaction.create(this.firestore.collection("auditoria").doc(auditId), {
          id: auditId,
          tipo: "CREAR_USUARIO",
          actorUsuarioId: context.actorId,
          recursoTipo: "USUARIO",
          recursoId: targetUserId,
          claveIdempotencia: request.claveIdempotencia,
          ocurridoEn: now,
          metadatos: {rol: request.rol, version: 1, payloadHash}
        });
        transaction.create(idempotencyRef, {
          id: idempotencyId,
          actorUsuarioId: context.actorId,
          operacion: "CREAR_USUARIO",
          claveHash: idempotencyId,
          payloadHash,
          resultado: result,
          creadoEn: now
        });
        transaction.delete(claimRef);
        return result;
      });
      return outcome;
    } catch (error) {
      if (createdAuthThisAttempt) {
        try {
          await this.auth.deleteUser(targetUserId);
        } catch {
          throw domainErrors.internal();
        }
      }
      await this.removePendingClaim(claimRef, attemptId);
      throw error;
    }
  }

  private async removePendingClaim(
    claimRef: DocumentReference,
    attemptId: string
  ): Promise<void> {
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(claimRef);
      if (!snapshot.exists) return;
      const current = snapshot.data() as UserCreationClaimDocument;
      if (current.propietarioIntentoId === attemptId) transaction.delete(claimRef);
    });
  }
}

async function readActiveWorkInTransaction(
  transaction: Transaction,
  firestore: Firestore,
  userId: string
): Promise<UserActiveWorkSummary> {
  const [activeJourneys, reservations, correctionLines] = await Promise.all([
    transaction.get(firestore.collection("jornadas").where("estadoAdministrativo", "==", "ACTIVA")),
    transaction.get(firestore.collection("reservas").where("usuarioId", "==", userId)),
    transaction.get(firestore.collection("jornadaLineas").where("responsableCorreccionUsuarioId", "==", userId))
  ]);
  const authorizationSnapshots = activeJourneys.empty
    ? []
    : await transaction.getAll(...activeJourneys.docs.map((journey) =>
        journey.ref.collection("autorizaciones").doc(userId)
      ));
  const activeJourneyCount = authorizationSnapshots.filter((snapshot) =>
    snapshot.exists && (snapshot.data() as AuthorizationDocument).activa === true
  ).length;
  const activeReservationCount = reservations.docs.filter((snapshot) =>
    (snapshot.data() as ReservationDocument).estadoReserva === "ACTIVA"
  ).length;
  const pendingCorrectionCount = correctionLines.docs.filter((snapshot) => {
    const state = (snapshot.data() as JourneyLineDocument).estadoCentral;
    return state === "DEVUELTA" || state === "EN_CONTEO";
  }).length;
  return activeWorkSummary(activeJourneyCount, activeReservationCount, pendingCorrectionCount);
}

async function assertAnotherActiveAdmin(
  transaction: Transaction,
  firestore: Firestore,
  targetUserId: string
): Promise<void> {
  const users = await transaction.get(firestore.collection("usuarios"));
  const activeAdmins = users.docs.filter((snapshot) => {
    const profile = snapshot.data() as UserDocument;
    return snapshot.id !== targetUserId &&
      profile.activo === true &&
      Array.isArray(profile.roles) &&
      profile.roles.includes("ADMINISTRADOR");
  });
  if (activeAdmins.length === 0) throw domainErrors.lastActiveAdminRequired();
}

export class ListManageableUsersService {
  constructor(private readonly firestore: Firestore) {}

  async execute(context: TrustedOperationContext): Promise<ListManageableUsersResult> {
    const [actorSnapshot, usersSnapshot, activeJourneys, reservations, journeyLines] = await Promise.all([
      this.firestore.collection("usuarios").doc(context.actorId).get(),
      this.firestore.collection("usuarios").get(),
      this.firestore.collection("jornadas").where("estadoAdministrativo", "==", "ACTIVA").get(),
      this.firestore.collection("reservas").where("estadoReserva", "==", "ACTIVA").get(),
      this.firestore.collection("jornadaLineas").get()
    ]);
    assertActiveAdmin(actorSnapshot);
    const authorizationSnapshots = await Promise.all(activeJourneys.docs.map((journey) =>
      journey.ref.collection("autorizaciones").where("activa", "==", true).get()
    ));
    const activeJourneyCounts = new Map<string, number>();
    for (const snapshot of authorizationSnapshots) {
      for (const authorization of snapshot.docs) {
        const data = authorization.data() as AuthorizationDocument;
        const userId = data.usuarioId ?? authorization.id;
        activeJourneyCounts.set(userId, (activeJourneyCounts.get(userId) ?? 0) + 1);
      }
    }
    const activeReservationCounts = new Map<string, number>();
    for (const reservation of reservations.docs) {
      const userId = (reservation.data() as ReservationDocument).usuarioId;
      if (typeof userId === "string") {
        activeReservationCounts.set(userId, (activeReservationCounts.get(userId) ?? 0) + 1);
      }
    }
    const pendingCorrectionCounts = new Map<string, number>();
    for (const line of journeyLines.docs) {
      const data = line.data() as JourneyLineDocument;
      if (
        typeof data.responsableCorreccionUsuarioId === "string" &&
        (data.estadoCentral === "DEVUELTA" || data.estadoCentral === "EN_CONTEO")
      ) {
        pendingCorrectionCounts.set(
          data.responsableCorreccionUsuarioId,
          (pendingCorrectionCounts.get(data.responsableCorreccionUsuarioId) ?? 0) + 1
        );
      }
    }
    return {
      usuarios: usersSnapshot.docs.map((snapshot) => manageableUser(
        snapshot.id,
        snapshot.data() as UserDocument,
        activeWorkSummary(
          activeJourneyCounts.get(snapshot.id) ?? 0,
          activeReservationCounts.get(snapshot.id) ?? 0,
          pendingCorrectionCounts.get(snapshot.id) ?? 0
        )
      )).sort((left, right) => left.nombreVisible.localeCompare(right.nombreVisible, "es"))
    };
  }
}

export class UpdateUserStatusService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: UpdateUserStatusRequest,
    context: TrustedOperationContext
  ): Promise<UpdateUserStatusResult> {
    const idempotencyId = sha256(`${context.actorId}:ACTUALIZAR_ESTADO_USUARIO:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({
      usuarioId: request.usuarioId,
      versionEsperada: request.versionEsperada,
      nuevoEstado: request.nuevoEstado,
      motivo: request.motivo
    }));
    const auditId = randomUUID();

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const targetRef = this.firestore.collection("usuarios").doc(request.usuarioId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [actorSnapshot, targetSnapshot, idempotencySnapshot] = await transaction.getAll(
        actorRef,
        targetRef,
        idempotencyRef
      );
      if (!actorSnapshot || !targetSnapshot || !idempotencySnapshot) throw domainErrors.internal();
      assertActiveAdmin(actorSnapshot);
      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<UpdateUserStatusResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) throw domainErrors.idempotencyConflict();
        return previous.resultado;
      }
      if (!targetSnapshot.exists) throw domainErrors.userNotFound();
      const target = targetSnapshot.data() as UserDocument;
      const currentVersion = profileVersion(target);
      if (currentVersion !== request.versionEsperada) throw domainErrors.userProfileStaleVersion();
      const nextActive = request.nuevoEstado === "ACTIVO";
      if (target.activo === nextActive) throw domainErrors.userProfileNoChange();
      if (!nextActive && request.usuarioId === context.actorId) throw domainErrors.selfDeactivationForbidden();
      const role = roleFromProfile(target);
      if (!nextActive && role === "ADMINISTRADOR" && target.activo === true) {
        await assertAnotherActiveAdmin(transaction, this.firestore, request.usuarioId);
      }
      const work = await readActiveWorkInTransaction(transaction, this.firestore, request.usuarioId);
      const version = nextVersion(currentVersion);
      const now = Timestamp.now();
      const updatedProfile: UserDocument = {...target, activo: nextActive, version};
      const result: UpdateUserStatusResult = {
        ...manageableUser(request.usuarioId, updatedProfile, work),
        operacion: "ESTADO_USUARIO_ACTUALIZADO",
        actualizadoEn: now.toDate().toISOString()
      };
      transaction.update(targetRef, {
        activo: nextActive,
        version,
        actualizadoEn: now,
        ultimoCambioEstado: request.nuevoEstado,
        ultimoCambioEstadoMotivo: request.motivo,
        ultimoCambioEstadoPorUsuarioId: context.actorId,
        ultimoCambioEstadoEn: now
      });
      transaction.create(this.firestore.collection("auditoria").doc(auditId), {
        id: auditId,
        tipo: nextActive ? "USUARIO_REACTIVADO" : "USUARIO_DESACTIVADO",
        actorUsuarioId: context.actorId,
        recursoTipo: "USUARIO",
        recursoId: request.usuarioId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now,
        metadatos: {
          estadoAnterior: target.activo === true ? "ACTIVO" : "INACTIVO",
          estadoNuevo: request.nuevoEstado,
          motivo: request.motivo,
          version,
          resumenTrabajoActivo: work,
          payloadHash
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "ACTUALIZAR_ESTADO_USUARIO",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: now
      });
      return result;
    });
  }
}

export class UpdateUserRoleService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: UpdateUserRoleRequest,
    context: TrustedOperationContext
  ): Promise<UpdateUserRoleResult> {
    const idempotencyId = sha256(`${context.actorId}:ACTUALIZAR_ROL_USUARIO:${request.claveIdempotencia}`);
    const payloadHash = sha256(JSON.stringify({
      usuarioId: request.usuarioId,
      versionEsperada: request.versionEsperada,
      nuevoRol: request.nuevoRol,
      motivo: request.motivo
    }));
    const auditId = randomUUID();

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const targetRef = this.firestore.collection("usuarios").doc(request.usuarioId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [actorSnapshot, targetSnapshot, idempotencySnapshot] = await transaction.getAll(
        actorRef,
        targetRef,
        idempotencyRef
      );
      if (!actorSnapshot || !targetSnapshot || !idempotencySnapshot) throw domainErrors.internal();
      assertActiveAdmin(actorSnapshot);
      if (idempotencySnapshot.exists) {
        const previous = idempotencySnapshot.data() as IdempotencyDocument<UpdateUserRoleResult>;
        if (previous.payloadHash !== payloadHash || !previous.resultado) throw domainErrors.idempotencyConflict();
        return previous.resultado;
      }
      if (!targetSnapshot.exists) throw domainErrors.userNotFound();
      const target = targetSnapshot.data() as UserDocument;
      const currentVersion = profileVersion(target);
      if (currentVersion !== request.versionEsperada) throw domainErrors.userProfileStaleVersion();
      const currentRole = roleFromProfile(target);
      if (currentRole === request.nuevoRol) throw domainErrors.userProfileNoChange();
      if (target.activo === true && currentRole === "ADMINISTRADOR" && request.nuevoRol !== "ADMINISTRADOR") {
        await assertAnotherActiveAdmin(transaction, this.firestore, request.usuarioId);
      }
      if (request.usuarioId === context.actorId && request.nuevoRol !== "ADMINISTRADOR") {
        throw domainErrors.selfAdminRoleRemovalForbidden();
      }
      const work = await readActiveWorkInTransaction(transaction, this.firestore, request.usuarioId);
      if (work.tieneTrabajoActivo) throw domainErrors.userRoleChangeBlockedActiveWork();
      const version = nextVersion(currentVersion);
      const now = Timestamp.now();
      const updatedProfile: UserDocument = {...target, roles: [request.nuevoRol], version};
      const result: UpdateUserRoleResult = {
        ...manageableUser(request.usuarioId, updatedProfile, work),
        operacion: "ROL_USUARIO_ACTUALIZADO",
        actualizadoEn: now.toDate().toISOString()
      };
      transaction.update(targetRef, {
        roles: [request.nuevoRol],
        version,
        actualizadoEn: now,
        ultimoCambioRolAnterior: currentRole,
        ultimoCambioRolNuevo: request.nuevoRol,
        ultimoCambioRolMotivo: request.motivo,
        ultimoCambioRolPorUsuarioId: context.actorId,
        ultimoCambioRolEn: now
      });
      transaction.create(this.firestore.collection("auditoria").doc(auditId), {
        id: auditId,
        tipo: "USUARIO_ROL_ACTUALIZADO",
        actorUsuarioId: context.actorId,
        recursoTipo: "USUARIO",
        recursoId: request.usuarioId,
        claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now,
        metadatos: {
          rolAnterior: currentRole,
          rolNuevo: request.nuevoRol,
          motivo: request.motivo,
          version,
          payloadHash
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId,
        actorUsuarioId: context.actorId,
        operacion: "ACTUALIZAR_ROL_USUARIO",
        claveHash: idempotencyId,
        payloadHash,
        resultado: result,
        creadoEn: now
      });
      return result;
    });
  }
}
