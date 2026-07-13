import {getApp, getApps, initializeApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithEmailAndPassword} from "firebase/auth";
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
    connectAuthEmulator(auth, `http://${config.host}:9099`, {disableWarnings: true});
    connectFirestoreEmulator(firestore, config.host, 8180);
    return new FirebaseMonitorRepository(auth, firestore);
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
      };
    } catch (error) {
      await this.auth.signOut();
      throw new Error(error instanceof Error ? error.message : "No fue posible iniciar sesión.", {cause: error});
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  observeMonitor(
    user: MonitorUser,
    onMonitorSnapshot: (snapshot: MonitorSnapshot) => void,
    onError: (message: string) => void,
  ): MonitorUnsubscribe {
    let journeyDisplayName: string | undefined;
    let lines: MonitorLine[] = [];
    let reservations = new Map<string, MonitorReservation>();

    const publish = () => {
      if (!journeyDisplayName) return;
      onMonitorSnapshot({
        journeyId: activeJourneyId,
        journeyDisplayName,
        lines: sortMonitorLines(lines.map((line) => ({...line, reservation: reservations.get(line.id)}))),
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
            if (!location || (data.estadoCentral !== "DISPONIBLE" && data.estadoCentral !== "EN_CONTEO")) {
              return [];
            }
            return [{id: documentSnapshot.id, state: data.estadoCentral, location}];
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

  observeMonitor(): MonitorUnsubscribe {
    return () => undefined;
  }
}
