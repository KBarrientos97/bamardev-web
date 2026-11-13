import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  alCambiarLaSedeDeCaja,
  cabeceraDeSedeDeCaja,
  CABECERA_SEDE_DE_CAJA,
  fijarSedeDeCaja,
  sedeDeCajaGuardada,
  usaSedeDeCaja,
} from "./sedeDeCaja";

/**
 * La sede activa de la caja (13-nov): sólo rige para la organización con 2+
 * sucursales. Todo lo demás —cajero atado, un local, una sesión vieja— queda
 * exactamente como antes: sin cabecera y sin sede guardada.
 */

const ORGANIZACION = { id: 1, sucursalId: null };
const CAJERO_ATADO = { id: 2, sucursalId: 38 };
const CON_VARIAS = { id: 7, tipoNegocio: "RESTAURANTE", features: ["multi_almacen" as const], sucursalesActivas: 3 };

beforeEach(() => {
  localStorage.clear();
});

describe("usaSedeDeCaja", () => {
  it("organización con 2+ sucursales y multi_almacen: sí", () => {
    expect(usaSedeDeCaja({ usuario: ORGANIZACION, negocio: CON_VARIAS })).toBe(true);
  });

  it("una sesión vieja sin `sucursalId` también es de organización", () => {
    expect(usaSedeDeCaja({ usuario: { id: 1 } as never, negocio: CON_VARIAS })).toBe(true);
  });

  it("el cajero atado a una sede: no (ve su caja y nada más)", () => {
    expect(usaSedeDeCaja({ usuario: CAJERO_ATADO, negocio: CON_VARIAS })).toBe(false);
  });

  it("un solo local activo: no", () => {
    expect(usaSedeDeCaja({ usuario: ORGANIZACION, negocio: { ...CON_VARIAS, sucursalesActivas: 1 } })).toBe(false);
  });

  it("sin el conteo (sesión vieja) falla cerrado: no", () => {
    expect(usaSedeDeCaja({ usuario: ORGANIZACION, negocio: { ...CON_VARIAS, sucursalesActivas: undefined } })).toBe(false);
  });

  it("sin multi_almacen el negocio es de un local aunque haya más cargados (regla 4): no", () => {
    expect(usaSedeDeCaja({ usuario: ORGANIZACION, negocio: { ...CON_VARIAS, features: ["pos" as const] } })).toBe(false);
  });

  it("sin sesión: no", () => {
    expect(usaSedeDeCaja({ usuario: null, negocio: null })).toBe(false);
  });
});

describe("la sede guardada", () => {
  const sesion = { usuario: ORGANIZACION, negocio: CON_VARIAS };

  it("se guarda por negocio y usuario, y se lee", () => {
    expect(sedeDeCajaGuardada(sesion)).toBeNull();
    fijarSedeDeCaja(sesion, 39);
    expect(sedeDeCajaGuardada(sesion)).toBe(39);
    // Otro usuario en el mismo navegador no hereda la elección.
    expect(sedeDeCajaGuardada({ usuario: { id: 99, sucursalId: null }, negocio: CON_VARIAS })).toBeNull();
  });

  it("null la borra", () => {
    fijarSedeDeCaja(sesion, 39);
    fijarSedeDeCaja(sesion, null);
    expect(sedeDeCajaGuardada(sesion)).toBeNull();
  });

  it("avisa a quien escucha, y deja de avisar al darse de baja", () => {
    const oyente = vi.fn();
    const baja = alCambiarLaSedeDeCaja(oyente);
    fijarSedeDeCaja(sesion, 40);
    expect(oyente).toHaveBeenCalledTimes(1);
    baja();
    fijarSedeDeCaja(sesion, 41);
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it("sin almacenamiento (navegación privada) no rompe: queda sin elegir", () => {
    const roto = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("cuota");
    });
    expect(() => fijarSedeDeCaja(sesion, 39)).not.toThrow();
    roto.mockRestore();
    expect(sedeDeCajaGuardada(sesion)).toBeNull();
  });
});

describe("cabeceraDeSedeDeCaja", () => {
  it("la organización con sede elegida manda la cabecera", () => {
    const sesion = { usuario: ORGANIZACION, negocio: CON_VARIAS };
    fijarSedeDeCaja(sesion, 39);
    expect(cabeceraDeSedeDeCaja(sesion)).toEqual({ [CABECERA_SEDE_DE_CAJA]: "39" });
  });

  it("sin sede elegida no manda nada: el backend usa la caja más reciente", () => {
    expect(cabeceraDeSedeDeCaja({ usuario: ORGANIZACION, negocio: CON_VARIAS })).toEqual({});
  });

  it("una sede explícita (la de una venta encolada) gana sobre la activa", () => {
    const sesion = { usuario: ORGANIZACION, negocio: CON_VARIAS };
    fijarSedeDeCaja(sesion, 39);
    expect(cabeceraDeSedeDeCaja(sesion, 40)).toEqual({ [CABECERA_SEDE_DE_CAJA]: "40" });
  });

  it("el cajero atado no manda nada, ni aunque haya una sede guardada de otra época", () => {
    localStorage.setItem("bamardev.caja.sede:7:2", "39");
    expect(cabeceraDeSedeDeCaja({ usuario: CAJERO_ATADO, negocio: CON_VARIAS }, 40)).toEqual({});
  });

  it("un negocio de un local no manda nada", () => {
    const sesion = { usuario: ORGANIZACION, negocio: { ...CON_VARIAS, sucursalesActivas: 1 } };
    localStorage.setItem("bamardev.caja.sede:7:1", "39");
    expect(cabeceraDeSedeDeCaja(sesion)).toEqual({});
  });
});
