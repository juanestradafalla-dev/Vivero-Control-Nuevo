import {createHash, randomUUID} from "node:crypto";

import {Timestamp, type DocumentData, type DocumentSnapshot, type Firestore} from "firebase-admin/firestore";

import type {
  RegisterInitialInventoryRequest,
  RegisterInitialInventoryResult,
  TrustedOperationContext
} from "./contracts.js";
import {domainErrors} from "./errors.js";

interface IdempotencyDocument {
  readonly payloadHash?: string;
  readonly resultado?: RegisterInitialInventoryResult;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertActiveAdmin(snapshot: DocumentSnapshot): DocumentData {
  if (!snapshot.exists) throw domainErrors.userNotFound();
  const actor = snapshot.data() as DocumentData;
  if (actor.activo !== true) throw domainErrors.userInactive();
  if (!Array.isArray(actor.roles) || !actor.roles.includes("ADMINISTRADOR")) {
    throw domainErrors.permissionDenied();
  }
  return actor;
}

function validVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

export class RegisterInitialInventoryService {
  constructor(private readonly firestore: Firestore) {}

  async execute(
    request: RegisterInitialInventoryRequest,
    context: TrustedOperationContext
  ): Promise<RegisterInitialInventoryResult> {
    const idempotencyId = sha256(
      `${context.actorId}:REGISTRAR_INVENTARIO_INICIAL:${request.claveIdempotencia}`
    );
    const payloadHash = sha256(JSON.stringify({
      lineaId: request.lineaId,
      versionLineaEsperada: request.versionLineaEsperada,
      hembras: request.hembras,
      machos: request.machos,
      patrones: request.patrones,
      referenciaFuente: request.referenciaFuente
    }));
    const auditId = randomUUID();

    return this.firestore.runTransaction(async (transaction) => {
      const actorRef = this.firestore.collection("usuarios").doc(context.actorId);
      const lineRef = this.firestore.collection("lineas").doc(request.lineaId);
      const inventoryRef = this.firestore.collection("inventarioOficialLineas").doc(request.lineaId);
      const initialLoadRef = this.firestore.collection("cargasInventarioInicial").doc(request.lineaId);
      const occupationRef = this.firestore.collection("ocupacionesLineasActivas").doc(request.lineaId);
      const idempotencyRef = this.firestore.collection("idempotencia").doc(idempotencyId);
      const [actorSnapshot, lineSnapshot, inventorySnapshot, initialLoadSnapshot, occupationSnapshot, previous] =
        await transaction.getAll(actorRef, lineRef, inventoryRef, initialLoadRef, occupationRef, idempotencyRef);
      if (!actorSnapshot || !lineSnapshot || !inventorySnapshot || !initialLoadSnapshot || !occupationSnapshot || !previous) {
        throw domainErrors.internal();
      }
      const actor = assertActiveAdmin(actorSnapshot);
      if (previous.exists) {
        const stored = previous.data() as IdempotencyDocument;
        if (stored.payloadHash !== payloadHash || !stored.resultado) throw domainErrors.idempotencyConflict();
        return stored.resultado;
      }
      if (!lineSnapshot.exists) throw domainErrors.catalogLineNotFound();
      const line = lineSnapshot.data() as DocumentData;
      if (line.activa !== true) throw domainErrors.initialInventoryLineInactive();
      if (!validVersion(line.version) || line.version !== request.versionLineaEsperada) {
        throw domainErrors.initialInventoryStaleVersion();
      }
      if (inventorySnapshot.exists || initialLoadSnapshot.exists) throw domainErrors.inventoryAlreadyExists();

      const [journeyLines, reservations, counts, decisions, reassignments, movements] = await Promise.all([
        transaction.get(this.firestore.collection("jornadaLineas").where("lineaId", "==", request.lineaId)),
        transaction.get(this.firestore.collection("reservas").where("lineaId", "==", request.lineaId)),
        transaction.get(this.firestore.collection("conteos").where("lineaId", "==", request.lineaId)),
        transaction.get(this.firestore.collection("decisionesRevision").where("lineaId", "==", request.lineaId)),
        transaction.get(this.firestore.collection("reasignacionesCorreccion").where("lineaId", "==", request.lineaId)),
        transaction.get(this.firestore.collection("movimientosInventario").where("lineaId", "==", request.lineaId))
      ]);
      if ([reservations, counts, decisions, reassignments, movements].some((snapshot) => !snapshot.empty)) {
        throw domainErrors.initialInventoryOperationalActivity();
      }

      const activeJourneyLines = journeyLines.docs.filter((snapshot) => snapshot.data().activa === true);
      let jornadaId: string | null = null;
      let jornadaLineaId: string | null = null;
      if (occupationSnapshot.exists) {
        const occupation = occupationSnapshot.data() as DocumentData;
        const activeLine = activeJourneyLines.find((snapshot) => snapshot.data().jornadaId === occupation.jornadaId);
        if (!activeLine) throw domainErrors.initialInventoryOperationalActivity();
        const journeyLine = activeLine.data();
        if (
          journeyLine.estadoCentral !== "DISPONIBLE" || journeyLine.reservaActivaId !== null ||
          journeyLine.conteoVigenteId != null || journeyLine.decisionVigenteId != null ||
          journeyLine.responsableCorreccionUsuarioId != null || journeyLine.reasignacionActivaId != null
        ) {
          throw domainErrors.initialInventoryOperationalActivity();
        }
        if (typeof journeyLine.jornadaId !== "string") throw domainErrors.internal();
        const journeySnapshot = await transaction.get(this.firestore.collection("jornadas").doc(journeyLine.jornadaId));
        if (!journeySnapshot.exists || journeySnapshot.data()?.estadoAdministrativo !== "ACTIVA") {
          throw domainErrors.initialInventoryOperationalActivity();
        }
        jornadaId = journeyLine.jornadaId;
        jornadaLineaId = activeLine.id;
      } else if (activeJourneyLines.length > 0) {
        throw domainErrors.initialInventoryOperationalActivity();
      }

      const now = Timestamp.now();
      const total = request.hembras + request.machos + request.patrones;
      const actorName = typeof actor.nombreVisible === "string" ? actor.nombreVisible : "Administrador de prueba";
      const result: RegisterInitialInventoryResult = {
        lineaId: request.lineaId,
        cargaInventarioInicialId: request.lineaId,
        jornadaId,
        jornadaLineaId,
        hembras: request.hembras,
        machos: request.machos,
        patrones: request.patrones,
        total,
        versionInventario: 1,
        origen: "CARGA_INICIAL_ADMINISTRATIVA_EMULADOR",
        conteoAprobadoId: null,
        referenciaFuente: request.referenciaFuente,
        registradaPorUsuarioId: context.actorId,
        registradaPorNombreVisible: actorName,
        registradaEn: now.toDate().toISOString()
      };

      transaction.create(inventoryRef, {
        id: request.lineaId, jornadaId, jornadaLineaId, lineaId: request.lineaId,
        hembras: request.hembras, machos: request.machos, patrones: request.patrones, total,
        conteoAprobadoId: null, version: 1, origen: "CARGA_INICIAL_ADMINISTRATIVA_EMULADOR",
        actualizadoPorUsuarioId: context.actorId, actualizadoEn: now
      });
      transaction.create(initialLoadRef, {
        id: request.lineaId, lineaId: request.lineaId, jornadaId, jornadaLineaId,
        hembras: request.hembras, machos: request.machos, patrones: request.patrones, total,
        versionInventario: 1, origen: "CARGA_INICIAL_ADMINISTRATIVA_EMULADOR", conteoAprobadoId: null,
        referenciaFuente: request.referenciaFuente, actorUsuarioId: context.actorId,
        actorNombreVisible: actorName, registradaEn: now, inmutable: true
      });
      transaction.create(this.firestore.collection("auditoria").doc(auditId), {
        id: auditId, tipo: "INVENTARIO_INICIAL_REGISTRADO", actorUsuarioId: context.actorId,
        recursoTipo: "LINEA", recursoId: request.lineaId, claveIdempotencia: request.claveIdempotencia,
        ocurridoEn: now, metadatos: {
          versionInventario: 1, origen: result.origen, referenciaFuente: request.referenciaFuente
        }
      });
      transaction.create(idempotencyRef, {
        id: idempotencyId, actorUsuarioId: context.actorId, operacion: "REGISTRAR_INVENTARIO_INICIAL",
        claveHash: idempotencyId, payloadHash, resultado: result, creadoEn: now
      });
      return result;
    });
  }
}
