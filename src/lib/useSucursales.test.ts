import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Almacen } from "../types";

/** Cuándo se ofrece el filtro "Todas las sucursales / una". Igual que la app (FiltroSucursal). */

const sesion = vi.hoisted(() => ({
  sucursalId: null as number | null | undefined,
  /** Nombre de la sede del asignado (`usuario.sucursal`). */
  sucursal: undefined as string | null | undefined,
  /** Conteo que manda el login; `undefined` = sesión vieja. */
  sucursalesActivas: undefined as number | undefined,
  features: undefined as string[] | undefined,
  tipoNegocio: "RESTAURANTE",
}));

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, sucursalId: sesion.sucursalId, sucursal: sesion.sucursal },
    negocio: {
      id: 1,
      features: sesion.features,
      tipoNegocio: sesion.tipoNegocio,
      sucursalesActivas: sesion.sucursalesActivas,
    },
    rubro: sesion.tipoNegocio,
  }),
}));

vi.mock("./api", () => ({
  api: { getSucursales: vi.fn() },
}));

import { api } from "./api";
import { esUnLocal, hayVariasEntre, modoDeSucursal, useSedeAsignada, useSucursales } from "./useSucursales";

function local(id: number, nombre: string): Almacen {
  return {
    id,
    nombre,
    grupo: null,
    activo: true,
    tipo: "SUCURSAL",
    esPrincipal: id === 1,
    direccion: null,
    telefono: null,
    totalArticulos: 0,
    totalUnidades: 0,
    valorTotal: 0,
    articulos: [],
  };
}

async function abrir() {
  const { result } = renderHook(() => useSucursales());
  await waitFor(() => expect(result.current.sucursales).toHaveLength(2));
  return result.current;
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.sucursalId = null;
  sesion.sucursal = undefined;
  sesion.sucursalesActivas = undefined;
  sesion.features = undefined;
  sesion.tipoNegocio = "RESTAURANTE";
  vi.mocked(api.getSucursales).mockResolvedValue([local(1, "Principal"), local(2, "sucursal la pampa")]);
});

describe("useSucursales", () => {
  it("Lista 2 #9: «Todas las sedes» en el instituto, «Todas las sucursales» en los demás", async () => {
    sesion.features = ["inventario", "reportes", "multi_almacen"];
    expect((await abrir()).opciones[0]).toEqual(["", "Todas las sucursales"]);
    sesion.tipoNegocio = "ACADEMIA";
    const suc = await abrir();
    expect(suc.opciones[0]).toEqual(["", "Todas las sedes"]);
    expect(suc.todas).toBe("Todas las sedes");
  });

  it("con varios almacenes y dos locales se elige", async () => {
    sesion.features = ["inventario", "reportes", "multi_almacen"];
    expect((await abrir()).elegir).toBe(true);
  });

  it("sin varios almacenes no se elige aunque haya otras sucursales cargadas", async () => {
    // Kevin, 15-oct: con el multisucursal apagado en el panel, Reportes dejaba
    // elegir "sucursal la pampa". Sin la feature el negocio es de un local; la
    // caja abre en la sugerida, que es la principal.
    sesion.features = ["inventario", "reportes"];
    const suc = await abrir();
    expect(suc.elegir).toBe(false);
    expect(suc.sugerida?.nombre).toBe("Principal");
  });

  it("en belleza las sucursales no dependen de varios almacenes", async () => {
    // Una peluquería con dos locales y sólo `agenda` es un caso real: sus
    // sucursales se cargan desde la agenda. Ahí el filtro sigue como antes.
    sesion.tipoNegocio = "PELUQUERIA";
    sesion.features = ["agenda"];
    expect((await abrir()).elegir).toBe(true);
  });

  it("en una academia las sedes no dependen de varios almacenes", async () => {
    // Cada grupo es de una sede: el calendario y los cobros se arman por sede.
    sesion.tipoNegocio = "ACADEMIA";
    sesion.features = ["academia"];
    expect((await abrir()).elegir).toBe(true);
  });

  it("una sesión sin features sigue viendo el filtro", async () => {
    // Falla abierto, como el resto de los permisos: el backend valida igual.
    expect((await abrir()).elegir).toBe(true);
  });
});

describe("modo de la sucursal (PLAN-SUCURSAL-TOTAL §1)", () => {
  const CON_VARIOS = ["inventario", "multi_almacen"];

  it("organización con 2+ locales: modo organizacion, hayVarias y mostrarColumna", async () => {
    sesion.features = CON_VARIOS;
    const { result } = renderHook(() => useSucursales());
    await waitFor(() => expect(result.current.sucursales).toHaveLength(2));
    expect(result.current.modo).toBe("organizacion");
    expect(result.current.hayVarias).toBe(true);
    expect(result.current.miSede).toBeNull();
    // La columna sólo si las filas son de más de un local.
    expect(result.current.mostrarColumna([{ s: 1 }, { s: 2 }], (f) => f.s)).toBe(true);
    expect(result.current.mostrarColumna([{ s: 1 }, { s: 1 }], (f) => f.s)).toBe(false);
  });

  it("organización con un solo local: modo una, sin nada nuevo", async () => {
    sesion.features = CON_VARIOS;
    vi.mocked(api.getSucursales).mockResolvedValue([local(1, "Principal")]);
    const { result } = renderHook(() => useSucursales());
    await waitFor(() => expect(result.current.sucursales).toHaveLength(1));
    expect(result.current.modo).toBe("una");
    expect(result.current.hayVarias).toBe(false);
    expect(result.current.elegir).toBe(false);
  });

  it("los depósitos no hacen que haya varias sucursales", async () => {
    sesion.features = CON_VARIOS;
    vi.mocked(api.getSucursales).mockResolvedValue([
      local(1, "Principal"),
      { ...local(2, "Central"), tipo: "DEPOSITO" },
    ]);
    const { result } = renderHook(() => useSucursales({ incluirDepositos: true }));
    await waitFor(() => expect(result.current.sucursales).toHaveLength(2));
    // El selector de inventario sí ofrece el depósito; "varias sucursales", no.
    expect(result.current.elegir).toBe(true);
    expect(result.current.modo).toBe("una");
    expect(result.current.hayVarias).toBe(false);
  });

  it("asignado con 2+ locales: modo asignado, su sede, sin selector ni columna ni pedir la lista", () => {
    sesion.features = CON_VARIOS;
    sesion.sucursalId = 2;
    sesion.sucursal = "sucursal la pampa";
    sesion.sucursalesActivas = 2;
    const { result } = renderHook(() => useSucursales());
    expect(result.current.modo).toBe("asignado");
    expect(result.current.hayVarias).toBe(true);
    expect(result.current.miSede).toBe("sucursal la pampa");
    expect(result.current.sedeVista).toBe("sucursal la pampa");
    expect(result.current.elegir).toBe(false);
    expect(result.current.mostrarColumna([{ s: 1 }, { s: 2 }], (f) => f.s)).toBe(false);
    // No puede listar los locales: ni lo intenta.
    expect(api.getSucursales).not.toHaveBeenCalled();
  });

  it("asignado con un solo local: modo una y ninguna etiqueta", () => {
    sesion.features = CON_VARIOS;
    sesion.sucursalId = 1;
    sesion.sucursal = "Principal";
    sesion.sucursalesActivas = 1;
    const { result } = renderHook(() => useSucursales());
    expect(result.current.modo).toBe("una");
    expect(result.current.hayVarias).toBe(false);
    expect(result.current.miSede).toBeNull();
  });

  it("asignado en una sesión vieja (sin conteo) falla cerrado: no inventa que hay varias", () => {
    sesion.features = CON_VARIOS;
    sesion.sucursalId = 2;
    sesion.sucursal = "sucursal la pampa";
    sesion.sucursalesActivas = undefined;
    const { result } = renderHook(() => useSucursales());
    expect(result.current.modo).toBe("una");
    expect(result.current.hayVarias).toBe(false);
    expect(result.current.miSede).toBeNull();
  });

  it("una sesión vieja con sucursalId undefined se trata como organización, no como asignada", async () => {
    sesion.features = CON_VARIOS;
    sesion.sucursalId = undefined;
    const { result } = renderHook(() => useSucursales());
    await waitFor(() => expect(result.current.sucursales).toHaveLength(2));
    expect(result.current.modo).toBe("organizacion");
  });

  it("regla 4: sin varios almacenes el asignado tampoco ve etiqueta (unLocal)", () => {
    sesion.features = ["inventario", "reportes"];
    sesion.sucursalId = 2;
    sesion.sucursal = "sucursal la pampa";
    sesion.sucursalesActivas = 2;
    const { result } = renderHook(() => useSucursales());
    expect(result.current.unLocal).toBe(true);
    expect(result.current.modo).toBe("una");
    expect(result.current.miSede).toBeNull();
  });

  it("regla 4: una peluquería con dos locales y sólo agenda sí tiene modo asignado", () => {
    sesion.tipoNegocio = "PELUQUERIA";
    sesion.features = ["agenda"];
    sesion.sucursalId = 2;
    sesion.sucursal = "Centro";
    sesion.sucursalesActivas = 2;
    const { result } = renderHook(() => useSucursales());
    expect(result.current.unLocal).toBe(false);
    expect(result.current.modo).toBe("asignado");
  });

  it("useSedeAsignada: el nombre sólo con 2+ locales y usuario asignado", () => {
    sesion.features = CON_VARIOS;
    sesion.sucursalId = 2;
    sesion.sucursal = "sucursal la pampa";
    sesion.sucursalesActivas = 3;
    expect(renderHook(() => useSedeAsignada()).result.current).toBe("sucursal la pampa");
    sesion.sucursalesActivas = 1;
    expect(renderHook(() => useSedeAsignada()).result.current).toBeNull();
    sesion.sucursalesActivas = 3;
    sesion.sucursalId = null;
    expect(renderHook(() => useSedeAsignada()).result.current).toBeNull();
  });
});

describe("modoDeSucursal y esUnLocal (puras)", () => {
  it("la tabla de §1", () => {
    expect(modoDeSucursal({ asignado: false, unLocal: false, locales: 2 })).toBe("organizacion");
    expect(modoDeSucursal({ asignado: true, unLocal: false, locales: 2 })).toBe("asignado");
    expect(modoDeSucursal({ asignado: true, unLocal: false, locales: 1 })).toBe("una");
    expect(modoDeSucursal({ asignado: false, unLocal: true, locales: 5 })).toBe("una");
    // No se sabe cuántos hay: falla cerrado.
    expect(modoDeSucursal({ asignado: true, unLocal: false, locales: undefined })).toBe("una");
    expect(modoDeSucursal({ asignado: false, unLocal: false, locales: undefined })).toBe("una");
  });

  it("esUnLocal: sólo sin multi_almacen y fuera de belleza y academia", () => {
    expect(esUnLocal({ tipoNegocio: "RESTAURANTE", features: ["pos"] })).toBe(true);
    expect(esUnLocal({ tipoNegocio: "RESTAURANTE", features: ["pos", "multi_almacen"] })).toBe(false);
    expect(esUnLocal({ tipoNegocio: "ACADEMIA", features: ["pos"] })).toBe(false);
    expect(esUnLocal({ tipoNegocio: "PELUQUERIA", features: ["agenda"] })).toBe(false);
    // Sin features: falla abierto (se ve el filtro).
    expect(esUnLocal({ tipoNegocio: "RESTAURANTE" })).toBe(false);
    expect(esUnLocal(null)).toBe(false);
  });
});

describe("hayVariasEntre", () => {
  const clave = (f: { s?: number | null }) => f.s;

  it("falso con cero, una o ninguna sucursal distinta", () => {
    expect(hayVariasEntre([], clave)).toBe(false);
    expect(hayVariasEntre(null, clave)).toBe(false);
    expect(hayVariasEntre([{ s: 1 }, { s: 1 }, { s: 1 }], clave)).toBe(false);
  });

  it("verdadero con dos sucursales distintas", () => {
    expect(hayVariasEntre([{ s: 1 }, { s: 1 }, { s: 2 }], clave)).toBe(true);
  });

  it("las filas sin sucursal no cuentan como una más", () => {
    expect(hayVariasEntre([{ s: 1 }, { s: null }, { s: undefined }], clave)).toBe(false);
  });

  it("con contarSinSucursal, 'general del negocio' es una más", () => {
    expect(hayVariasEntre([{ s: 1 }, { s: null }], clave, true)).toBe(true);
    expect(hayVariasEntre([{ s: null }, { s: null }], clave, true)).toBe(false);
  });

  it("sirve con claves de texto", () => {
    expect(hayVariasEntre([{ n: "Centro" }, { n: "Norte" }], (f) => f.n)).toBe(true);
  });
});
