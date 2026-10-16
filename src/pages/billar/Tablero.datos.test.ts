import { describe, expect, it } from "vitest";
import { atajoDelTablero, mirandoOtraSucursal } from "./Tablero.datos";

const tecla = (t: string, extra: Partial<Parameters<typeof atajoDelTablero>[0]> = {}) =>
  atajoDelTablero({ tecla: t, escribiendo: false, hayDialogo: false, ...extra });

describe("atajoDelTablero", () => {
  it('"/" busca y Escape cierra el panel', () => {
    expect(tecla("/")).toBe("buscar");
    expect(tecla("Escape")).toBe("cerrar");
    expect(tecla("a")).toBeNull();
  });

  it("con un diálogo abierto las teclas son de él", () => {
    // QA del 13-oct: "/" le sacaba el foco al modal y lo mandaba al buscador
    // de atrás, tapado por el velo.
    expect(tecla("/", { hayDialogo: true })).toBeNull();
    expect(tecla("Escape", { hayDialogo: true })).toBeNull();
  });

  it("escribiendo en un campo, la tecla es lo que se escribe", () => {
    expect(tecla("/", { escribiendo: true })).toBeNull();
    expect(tecla("Escape", { escribiendo: true })).toBeNull();
  });

  it("con el panel como hoja el buscador no se ve: no busca, pero Escape cierra la hoja", () => {
    expect(tecla("/", { buscadorTapado: true })).toBeNull();
    expect(tecla("Escape", { buscadorTapado: true })).toBe("cerrar");
  });
});

describe("mirandoOtraSucursal", () => {
  const caja = { abierta: true };

  it("el dueño con la caja en un local y el tablero de otro", () => {
    expect(mirandoOtraSucursal({ caja, sucursalId: 2, cajaSucursalId: 1 })).toBe(true);
  });

  it("la caja y el tablero en el mismo local (el cajero, o un negocio de un local) no avisa", () => {
    expect(mirandoOtraSucursal({ caja, sucursalId: 1, cajaSucursalId: 1 })).toBe(false);
  });

  it("sin caja, o con una de antes de las sucursales, no hay con qué comparar", () => {
    expect(mirandoOtraSucursal({ caja: { abierta: false }, sucursalId: 2, cajaSucursalId: null })).toBe(false);
    expect(mirandoOtraSucursal({ caja, sucursalId: 2, cajaSucursalId: null })).toBe(false);
    expect(mirandoOtraSucursal({ caja, sucursalId: null, cajaSucursalId: 1 })).toBe(false);
  });
});
