import {Timestamp, type Firestore} from "firebase-admin/firestore";

import type {
  ActiveJourneySummary,
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
}

const roles = new Set<UserRole>(["AUXILIAR", "SUPERVISOR", "ADMINISTRADOR"]);

function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && roles.has(value as UserRole);
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
      const summary: ActiveJourneySummary = {
        jornadaId: authorization.jornadaId,
        nombreVisible: journey.nombreVisible,
        estado: "ACTIVA",
        rolEfectivo: authorization.rolEfectivo,
        puedeContar: authorization.puedeContar,
        cantidadLineas: linesSnapshot.docs.filter((line) => line.data().activa === true).length,
        version: journey.version as number,
        puedeCerrar: userRoles.includes("ADMINISTRADOR") ||
          (userRoles.includes("SUPERVISOR") && journey.creadaPorUsuarioId === context.actorId)
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
