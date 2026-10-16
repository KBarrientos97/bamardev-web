import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";

/**
 * El store del billar contra la frontera HTTP: se mira QUÉ se le pide al
 * backend (la URL y el cuerpo), que es donde se rompían las dos cosas de acá:
 * Mesas de billar pedía el tablero (y quien sólo administra no entraba) y el
 * dueño no podía pedir otra sucursal.
 */

const request = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", async (original) => ({
  ...(await original<typeof import("../../lib/api")>()),
  request,
  api: { getFormasPago: vi.fn(async () => []) },
}));

const TIPO = { id: "pool", nombre: "Pool", tarifa: 20, fraccion: 15, tolerancia: 3, minimo: 30, paquetes: [], promos: [] };
const AJUSTES = {
  avisos: [10, 5, 1],
  sonido: true,
  voz: true,
  pin: { anularConsumo: true, anularMesa: true },
  tieneTokenSalon: false,
};
const tablero = (sucursalId = 1) => ({
  ahora: Date.now(),
  sucursal: { id: sucursalId, nombre: `Sucursal ${sucursalId}` },
  caja: { abierta: false },
  ajustes: AJUSTES,
  tipos: [TIPO],
  mesas: [],
});

/** Lo que responde el backend de mentira, por ruta. */
function responder(url: string) {
  if (url.startsWith("/billar/tablero")) {
    const m = /sucursalId=(\d+)/.exec(url);
    return tablero(m ? Number(m[1]) : 1);
  }
  if (url.startsWith("/billar/admin/mesas")) return [];
  if (url === "/billar/admin/tipos") return [TIPO];
  if (url === "/billar/admin/ajustes") return AJUSTES;
  if (url.startsWith("/billar/productos")) return [];
  return {};
}

const urls = () => request.mock.calls.map((c) => c[0] as string);

/** El store es de módulo: cada test arranca con uno nuevo, como una pestaña recién abierta. */
async function storeNuevo() {
  vi.resetModules();
  return import("./store");
}

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (url: string) => responder(url));
  localStorage.clear();
});

describe("Mesas de billar (administración)", () => {
  it("carga mesas, tarifas y ajustes de /billar/admin, sin pedir el tablero", async () => {
    // 13-oct: el tablero pide atender el billar (`billar.operar`); un rol que
    // lo administra sin atenderlo se quedaba en "No se pudieron traer las mesas".
    const { billar, leerBillar } = await storeNuevo();
    await billar.cargarAdmin();
    expect(urls()).toEqual(expect.arrayContaining(["/billar/admin/mesas", "/billar/admin/tipos", "/billar/admin/ajustes"]));
    expect(urls().some((u) => u.startsWith("/billar/tablero"))).toBe(false);
    const e = leerBillar();
    expect(e.admin).toMatchObject({ cargado: true, error: null });
    expect(e.tipos.pool.tarifa).toBe(20);
    expect(e.ajustesNegocio.avisos).toEqual([10, 5, 1]);
  });
});

describe("la sucursal del dueño", () => {
  it("sin elegir (un solo local, o el cajero) se pide como siempre, sin sucursal", async () => {
    const { billar, recargar, usarNegocio } = await storeNuevo();
    usarNegocio("billar-uno");
    await recargar(true);
    await billar.cargarAdmin();
    expect(urls()).toContain("/billar/tablero");
    expect(urls()).toContain("/billar/admin/mesas");
    expect(urls().some((u) => u.includes("sucursalId"))).toBe(false);

    await billar.crearMesa({ numero: 1, tipo: "pool", estado: "activa" });
    const alta = request.mock.calls.find((c) => c[0] === "/billar/admin/mesas" && c[1]?.method === "POST");
    expect(JSON.parse(alta![1].body as string)).not.toHaveProperty("sucursalId");
  });

  it("la elegida va al tablero, al catálogo, a la administración y a la mesa nueva", async () => {
    const { billar, recargar, cargarProductos, usarNegocio, leerBillar } = await storeNuevo();
    usarNegocio("billar-dos");
    billar.elegirSucursal(7);
    await recargar(true);
    await cargarProductos();
    await billar.cargarAdmin();
    expect(urls()).toEqual(
      expect.arrayContaining(["/billar/tablero?sucursalId=7", "/billar/productos?sucursalId=7", "/billar/admin/mesas?sucursalId=7"]),
    );
    expect(leerBillar()).toMatchObject({ sucursalId: 7, sucursal: "Sucursal 7" });

    await billar.crearMesa({ numero: 3, tipo: "pool", estado: "activa" });
    const alta = request.mock.calls.find((c) => c[0] === "/billar/admin/mesas" && c[1]?.method === "POST");
    expect(JSON.parse(alta![1].body as string)).toMatchObject({ numero: 3, sucursalId: 7 });
  });

  it("se recuerda en el equipo, por negocio", async () => {
    let s = await storeNuevo();
    s.usarNegocio("billar-tres");
    s.billar.elegirSucursal(4);

    // Recargar la página: vuelve a la que había elegido.
    s = await storeNuevo();
    s.usarNegocio("billar-tres");
    expect(s.billar.sucursalElegida()).toBe(4);
    // El id de un local no significa nada en otro negocio.
    s.usarNegocio("otro-negocio");
    expect(s.billar.sucursalElegida()).toBeNull();
  });

  it("una sucursal recordada que ya no existe se olvida, y el billar no queda trabado", async () => {
    // Sin esto, "Reintentar" volvía a pedir la misma y el 400 no se iba nunca.
    request.mockImplementation(async (url: string) => {
      if (url === "/billar/tablero?sucursalId=9") throw new ApiError("El almacén 9 no existe", 400);
      return responder(url);
    });
    localStorage.setItem("bamardev.billar.sucursal.billar-cuatro", "9");
    const { billar, recargar, usarNegocio, leerBillar } = await storeNuevo();
    usarNegocio("billar-cuatro");
    expect(billar.sucursalElegida()).toBe(9);
    await recargar(true);
    expect(urls()).toEqual(["/billar/tablero?sucursalId=9", "/billar/tablero"]);
    expect(leerBillar()).toMatchObject({ cargado: true, error: null, sucursalId: 1 });
    expect(billar.sucursalElegida()).toBeNull();
    expect(localStorage.getItem("bamardev.billar.sucursal.billar-cuatro")).toBeNull();
  });

  it("al cambiar de local se vacía lo del anterior en el acto", async () => {
    const { billar, recargar, usarNegocio, leerBillar } = await storeNuevo();
    usarNegocio("billar-cinco");
    await recargar(true);
    expect(leerBillar().cargado).toBe(true);
    billar.elegirSucursal(2);
    // Hasta que llega el tablero nuevo no se dibujan las mesas del otro local.
    expect(leerBillar()).toMatchObject({ cargado: false, mesas: [], productos: [] });
  });

  it("al abrir la caja en otro local que el elegido, el tablero se va con la caja", async () => {
    const { billar, usarNegocio } = await storeNuevo();
    usarNegocio("billar-seis");
    billar.elegirSucursal(2);
    billar.seguirCaja(3);
    expect(billar.sucursalElegida()).toBe(3);
  });

  it("sin elección, abrir la caja no inventa una (un negocio de un solo local sigue igual)", async () => {
    const { billar, usarNegocio } = await storeNuevo();
    usarNegocio("billar-siete");
    billar.seguirCaja(1);
    expect(billar.sucursalElegida()).toBeNull();
    await vi.waitFor(() => expect(urls()).toContain("/billar/tablero"));
  });
});
