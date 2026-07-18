import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import type {Auth} from "firebase-admin/auth";
import type {Firestore} from "firebase-admin/firestore";
import {describe, expect, it, vi} from "vitest";

import {CreateManageableUserService} from "../src/domain/adminUsers.js";
import {parseCreateManageableUserRequest} from "../src/domain/validation.js";

const request = {
  nombreVisible: "Usuario ficticio",
  correo: "usuario.nuevo@prueba.local",
  password: "Solo-Prueba-25!",
  rol: "AUXILIAR" as const,
  claveIdempotencia: "crear-usuario-etapa-25"
};

function fakeFirestore(failCommit = false): {firestore: Firestore; writes: unknown[]} {
  const writes: unknown[] = [];
  const documents = new Map<string, unknown>();
  let transactionNumber = 0;
  const actorSnapshot = {
    exists: true,
    data: () => ({nombreVisible: "Administrador", roles: ["ADMINISTRADOR"], activo: true, version: 1})
  };
  const snapshot = (path: string) => path === "usuarios/uid-administrador" ? actorSnapshot : {
    exists: documents.has(path),
    data: () => documents.get(path)
  };
  const collection = (name: string) => ({
    doc: (id: string) => ({
      path: `${name}/${id}`,
      get: async () => snapshot(`${name}/${id}`)
    })
  });
  const firestore = {
    collection,
    runTransaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
      transactionNumber += 1;
      if (failCommit && transactionNumber === 2) throw new Error("fallo Firestore simulado");
      const transaction = {
        get: async (ref: {path: string}) => snapshot(ref.path),
        getAll: async (...refs: {path: string}[]) => refs.map((ref) => snapshot(ref.path)),
        create: (ref: {path: string}, value: unknown) => {
          documents.set(ref.path, value);
          writes.push(value);
        },
        update: (ref: {path: string}, value: unknown) => {
          documents.set(ref.path, {...documents.get(ref.path) as object, ...value as object});
          writes.push(value);
        },
        delete: (ref: {path: string}) => documents.delete(ref.path)
      };
      return callback(transaction);
    }
  } as unknown as Firestore;
  return {firestore, writes};
}

describe("alta administrativa de usuarios", () => {
  it("normaliza el correo y valida campos, rol y contrasena", () => {
    expect(parseCreateManageableUserRequest({...request, correo: "  USUARIO.NUEVO@PRUEBA.LOCAL "}))
      .toMatchObject({correo: "usuario.nuevo@prueba.local"});
    expect(() => parseCreateManageableUserRequest({...request, password: "corta"}))
      .toThrow(expect.objectContaining({code: "USER_PASSWORD_WEAK"}));
    expect(() => parseCreateManageableUserRequest({...request, correo: "correo-invalido"}))
      .toThrow(expect.objectContaining({code: "USER_EMAIL_INVALID"}));
    expect(() => parseCreateManageableUserRequest({...request, nombreVisible: "N".repeat(161)}))
      .toThrow(expect.objectContaining({code: "INVALID_ARGUMENT"}));
    expect(() => parseCreateManageableUserRequest({...request, adicional: true}))
      .toThrow(expect.objectContaining({code: "INVALID_ARGUMENT"}));
  });

  it("no persiste ni devuelve la contrasena ni un hash derivado de ella", async () => {
    const {firestore, writes} = fakeFirestore();
    const auth = {
      createUser: vi.fn().mockResolvedValue({uid: "uid-nuevo-etapa-25"}),
      deleteUser: vi.fn(),
      getUser: vi.fn()
    } as unknown as Auth;
    const result = await new CreateManageableUserService(firestore, auth).execute(
      request,
      {actorId: "uid-administrador"}
    );
    const serialized = JSON.stringify({writes, result});
    const passwordHash = createHash("sha256").update(request.password, "utf8").digest("hex");
    expect(serialized).not.toContain(request.password);
    expect(serialized).not.toContain(passwordHash);
    expect(result).toMatchObject({operacion: "USUARIO_CREADO", activo: true, version: 1});
    const profile = writes.find((value) => Array.isArray((value as {roles?: unknown}).roles));
    expect(Object.keys(profile as object).sort()).toEqual([
      "activo", "actualizadoEn", "creadoEn", "id", "nombreVisible", "roles", "version"
    ]);
  });

  it("elimina compensatoriamente la cuenta Auth cuando falla Firestore", async () => {
    const {firestore} = fakeFirestore(true);
    const auth = {
      createUser: vi.fn().mockResolvedValue({uid: "uid-compensacion-etapa-25"}),
      deleteUser: vi.fn().mockResolvedValue(undefined),
      getUser: vi.fn()
    } as unknown as Auth;
    await expect(new CreateManageableUserService(firestore, auth).execute(
      request,
      {actorId: "uid-administrador"}
    )).rejects.toThrow("fallo Firestore simulado");
    expect(auth.deleteUser).toHaveBeenCalledTimes(1);
    expect(vi.mocked(auth.deleteUser).mock.calls[0]?.[0]).toMatch(/^et25-[a-f0-9]{64}$/u);
  });

  it("el logger de la Callable no serializa la solicitud ni sus datos", () => {
    const source = readFileSync(resolve("src/index.ts"), "utf8");
    const callableStart = source.indexOf("export const crearUsuarioAdministrable = onCall(");
    const nextCallable = source.indexOf("\nexport const ", callableStart + 1);
    const callable = source.slice(callableStart, nextCallable);
    const loggerStart = callable.indexOf("logger.error(");
    const loggerEnd = callable.indexOf(");", loggerStart);
    const loggerCall = callable.slice(loggerStart, loggerEnd);
    expect(loggerCall).toContain("errorName");
    expect(loggerCall).not.toMatch(/request|data|correo|password/iu);
  });
});
