import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Almacen } from "../types";

/** Cuándo se ofrece el filtro "Todas las sucursales / una". Igual que la app (FiltroSucursal). */

const sesion = vi.hoisted(() => ({
  sucursalId: null as number | null,
  features: undefined as string[] | undefined,
  tipoNegocio: "RESTAURANTE",
}));

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { sucursalId: sesion.sucursalId },
    negocio: { features: sesion.features, tipoNegocio: sesion.tipoNegocio },
  }),
}));

vi.mock("./api", () => ({
  api: { getSucursales: vi.fn() },
}));

import { api } from "./api";
import { useSucursales } from "./useSucursales";

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
  sesion.features = undefined;
  sesion.tipoNegocio = "RESTAURANTE";
  vi.mocked(api.getSucursales).mockResolvedValue([local(1, "Principal"), local(2, "sucursal la pampa")]);
});

describe("useSucursales", () => {
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

  it("una sesión sin features sigue viendo el filtro", async () => {
    // Falla abierto, como el resto de los permisos: el backend valida igual.
    expect((await abrir()).elegir).toBe(true);
  });
});
