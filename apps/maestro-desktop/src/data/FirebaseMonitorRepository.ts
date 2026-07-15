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
  MonitorCount,
  MonitorInventory,
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

const activeJourneyId = "JORNADA-PRUEBA-ETAPA-3";

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
      };
    } catch (error) {
      await this.auth.signOut();
      throw new Error(error instanceof Error ? error.message : "No fue posible iniciar sesión.", {cause: error});
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
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

  async returnCount(countId: string, reason: string, idempotencyKey: string): Promise<void> {
    const callable = httpsCallable(this.functions, "devolverConteo");
    try {
      await callable({conteoId: countId, motivo: reason, claveIdempotencia: idempotencyKey});
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "No fue posible devolver el conteo.", {cause: error});
    }
  }

  observeMonitor(
    user: MonitorUser,
    onMonitorSnapshot: (snapshot: MonitorSnapshot) => void,
    onError: (message: string) => void,
  ): MonitorUnsubscribe {
    let journeyDisplayName: string | undefined;
    let lines: MonitorLine[] = [];
    let reservations = new Map<string, MonitorReservation>();
    let counts = new Map<string, MonitorCount>();
    let inventories = new Map<string, MonitorInventory>();

    const publish = () => {
      if (!journeyDisplayName) return;
      onMonitorSnapshot({
        journeyId: activeJourneyId,
        journeyDisplayName,
        lines: sortMonitorLines(lines.map((line) => ({
          ...line,
          reservation: reservations.get(line.id),
          count: counts.get(line.id),
          inventory: inventories.get(line.lineId),
        }))),
      });
    };
    const subscriptions = [
      onSnapshot(
        doc(this.firestore, "jornadas", activeJourneyId),
        (snapshot) => {
          if (!snapshot.exists()) {
            onError("La jornada ficticia no existe.");
            return;
          }
          journeyDisplayName = typeof snapshot.data().nombreVisible === "string"
            ? snapshot.data().nombreVisible
            : activeJourneyId;
          publish();
        },
        () => onError("No fue posible leer la jornada de prueba."),
      ),
      onSnapshot(
        query(collection(this.firestore, "jornadaLineas"), where("jornadaId", "==", activeJourneyId)),
        (snapshot) => {
          lines = snapshot.docs.flatMap((documentSnapshot) => {
            const data = documentSnapshot.data();
            const location = parseLocation(data.ubicacion);
            if (
              !location ||
              typeof data.lineaId !== "string" ||
              !["DISPONIBLE", "EN_CONTEO", "PENDIENTE_REVISION", "DEVUELTA", "APROBADA"].includes(data.estadoCentral as string)
            ) {
              return [];
            }
            return [{id: documentSnapshot.id, lineId: data.lineaId, state: data.estadoCentral, location}];
          });
          publish();
        },
        () => onError("No fue posible leer las líneas de prueba."),
      ),
    ];

    if (user.canViewReservationDetails) {
      subscriptions.push(
        onSnapshot(
          query(collection(this.firestore, "reservas"), where("jornadaId", "==", activeJourneyId)),
          (snapshot) => {
            reservations = new Map(
              snapshot.docs.flatMap((documentSnapshot) => {
                const data = documentSnapshot.data();
                const timestamp = data.reservadaEn;
                if (
                  typeof data.jornadaLineaId !== "string" ||
                  typeof data.autorUsuarioId !== "string" ||
                  typeof data.usuarioNombreVisible !== "string" ||
                  !(timestamp instanceof Timestamp)
                ) {
                  return [];
                }
                return [[
                  data.jornadaLineaId,
                  {userDisplayName: data.usuarioNombreVisible, reservedAt: timestamp.toDate().toISOString()},
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
          query(collection(this.firestore, "conteos"), where("jornadaId", "==", activeJourneyId)),
          (snapshot) => {
            counts = new Map(
              snapshot.docs.flatMap((documentSnapshot) => {
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
                  return [];
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
                };
                return [[data.jornadaLineaId, count] as const];
              }),
            );
            publish();
          },
          () => onError("No fue posible leer los conteos pendientes."),
        ),
      );
      subscriptions.push(
        onSnapshot(
          query(collection(this.firestore, "inventarioOficialLineas"), where("jornadaId", "==", activeJourneyId)),
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

  async approveCount(): Promise<void> {
    throw new Error("Firebase de producción permanece deshabilitado.");
  }

  async returnCount(): Promise<void> {
    throw new Error("Firebase de producción permanece deshabilitado.");
  }

  observeMonitor(): MonitorUnsubscribe {
    return () => undefined;
  }
}
