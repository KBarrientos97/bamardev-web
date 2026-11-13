import { describe, expect, it } from "vitest";
import type { Almacen } from "../../types";
import { almacenesElegibles, almacenInicial } from "./almacenInicial";

const a = (id: number, nombre: string, p: Partial<Almacen> = {}) =>
  ({ id, nombre, activo: true, tipo: "SUCURSAL", esPrincipal: false, ...p }) as Almacen;

const LISTA = [
  a(1, "Depósito", { tipo: "DEPOSITO" }),
  a(2, "Mostrador", { esPrincipal: true }),
  a(3, "Norte"),
  a(4, "Cerrada", { activo: false, esPrincipal: false }),
];

describe("con qué almacén arranca un movimiento", () => {
  it("el de organización arranca en la principal, no en el primero por nombre", () => {
    expect(almacenInicial(LISTA, null)?.nombre).toBe("Mostrador");
    expect(almacenInicial(LISTA, undefined)?.nombre).toBe("Mostrador");
  });

  it("el de un local arranca en el suyo", () => {
    expect(almacenInicial(LISTA, 3)?.nombre).toBe("Norte");
  });

  it("sin principal, el primero activo; sin nada, nada", () => {
    expect(almacenInicial([a(5, "Uno"), a(6, "Dos")], null)?.nombre).toBe("Uno");
    expect(almacenInicial([], null)).toBeUndefined();
  });

  it("nunca uno dado de baja", () => {
    expect(almacenInicial([a(4, "Cerrada", { activo: false, esPrincipal: true }), a(5, "Viva")], null)?.nombre).toBe("Viva");
  });

  it("no ofrece los inactivos, y al de un local sólo le deja el suyo", () => {
    expect(almacenesElegibles(LISTA, null).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(almacenesElegibles(LISTA, 3).map((x) => x.id)).toEqual([3]);
  });
});
