import {Timestamp, type Firestore} from "firebase-admin/firestore";

import type {
  ActiveJourneySummary,
  InventoryReportConfiguration,
  ListActiveJourneysResult,
  TrustedOperationContext,
  UserRole
} from "./contracts.js";
import {domainErrors} from "./errors.js";

interface UserDocument {
  readonly activo?: boolean;
  readonly roles?: unknown;
}

interface AuthorizationDocument {
  readonly jornadaId?: string;
  readonly usuarioId?: string;
  readonly activa?: boolean;
  readonly rolEfectivo?: unknown;
  readonly puedeContar?: boolean;
}

interface JourneyDocument {
  readonly nombreVisible?: string;
  readonly estadoAdministrativo?: string;
  readonly creadaEn?: unknown;
  readonly version?: unknown;
  readonly creadaPorUsuarioId?: unknown;
  readonly configuracionInformeInventario?: unknown;
}

const roles = new Set<UserRole>(["AUXILIAR", "SUPERVISOR", "ADMINISTRADOR"]);

function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && roles.has(value as UserRole);
}

function isInventoryReportConfiguration(value: unknown): value is InventoryReportConfiguration {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const configuration = value as Record<string, unknown>;
  return Object.keys(configuration).length === 4 &&
    Object.keys(configuration).every((field) =>
      ["habilitado", "mes", "anio", "fuentePlantasMuertas"].includes(field)
    ) &&
    configuration.habilitado === true &&
    Number.isSafeInteger(configuration.mes) && (configuration.mes as number) >= 1 &&
    (configuration.mes as number) <= 12 &&
    Number.isSafeInteger(configuration.anio) && (configuration.anio as number) >= 2000 &&
    (configuration.anio as number) <= 2100 &&
    (configuration.fuentePlantasMuertas === "CONTEO_FISICO" ||
      configuration.fuentePlantasMuertas === "DESCARTES_APROBADOS");
}

export class ListActiveJourneysService {
  constructor(private readonly firestore: Firestore) {}

  async execute(context: TrustedOperationContext): Promise<ListActiveJourneysResult> {
    const userSnapshot = await this.firestore.collection("usuarios").doc(context.actorId).get();
    if (!userSnapshot.exists) throw domainErrors.userNotFound();
    const user = userSnapshot.data() as UserDocument;
    if (user.activo !== true) throw domainErrors.userInactive();
    const userRoles = Array.isArray(user.roles) ? user.roles : [];

    const authorizationsSnapshot = await this.firestore.collectionGroup("autorizaciones")
      .where("usuarioId", "==", context.actorId)
      .get();
    const authorizations = authorizationsSnapshot.docs.flatMap((snapshot) => {
      const authorization = snapshot.data() as AuthorizationDocument;
      if (
        authorization.usuarioId !== context.actorId ||
        authorization.activa !== true ||
        typeof authorization.jornadaId !== "string" ||
        !isRole(authorization.rolEfectivo) ||
        !userRoles.includes(authorization.rolEfectivo)
      ) {
        return [];
      }
      return [{
        jornadaId: authorization.jornadaId,
        rolEfectivo: authorization.rolEfectivo,
        puedeContar: authorization.puedeContar === true
      }];
    });

    const uniqueAuthorizations = [...new Map(
      authorizations.map((authorization) => [authorization.jornadaId, authorization])
    ).values()];
    const candidates = await Promise.all(uniqueAuthorizations.map(async (authorization) => {
      const [journeySnapshot, linesSnapshot] = await Promise.all([
        this.firestore.collection("jornadas").doc(authorization.jornadaId).get(),
        this.firestore.collection("jornadaLineas").where("jornadaId", "==", authorization.jornadaId).get()
      ]);
      if (!journeySnapshot.exists) return undefined;
      const journey = journeySnapshot.data() as JourneyDocument;
      if (
        journey.estadoAdministrativo !== "ACTIVA" ||
        typeof journey.nombreVisible !== "string" ||
        !(journey.creadaEn instanceof Timestamp) ||
        !Number.isSafeInteger(journey.version) ||
        typeof journey.creadaPorUsuarioId !== "string"
      ) {
        return undefined;
      }
      if (journey.configuracionInformeInventario !== undefined &&
          !isInventoryReportConfiguration(journey.configuracionInformeInventario)) {
        throw domainErrors.inventoryReportConfigurationInvalid();
      }
      const configuration = isInventoryReportConfiguration(journey.configuracionInformeInventario)
        ? journey.configuracionInformeInventario
        : undefined;
      const pendingDiscards = configuration?.fuentePlantasMuertas === "DESCARTES_APROBADOS"
        ? await this.firestore.collection("descartes")
            .where("jornadaId", "==", authorization.jornadaId)
            .get()
        : undefined;
      const summary: ActiveJourneySummary = {
        jornadaId: authorization.jornadaId,
        nombreVisible: journey.nombreVisible,
        estado: "ACTIVA",
        rolEfectivo: authorization.rolEfectivo,
        puedeContar: authorization.puedeContar,
        cantidadLineas: linesSnapshot.docs.filter((line) => line.data().activa === true).length,
        version: journey.version as number,
        puedeCerrar: userRoles.includes("ADMINISTRADOR") ||
          (userRoles.includes("SUPERVISOR") && journey.creadaPorUsuarioId === context.actorId),
        ...(configuration === undefined ? {} : {configuracionInformeInventario: configuration}),
        ...(pendingDiscards === undefined ? {} : {
          cantidadDescartesPendientes: pendingDiscards.docs.filter((snapshot) =>
            snapshot.data().estado === "PENDIENTE_REVISION"
          ).length
        })
      };
      return {summary, createdAt: journey.creadaEn.toMillis()};
    }));

    return {
      jornadas: candidates
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
        .sort((left, right) =>
          right.createdAt - left.createdAt ||
          left.summary.nombreVisible.localeCompare(right.summary.nombreVisible, "es")
        )
        .map((candidate) => candidate.summary)
    };
  }
}
