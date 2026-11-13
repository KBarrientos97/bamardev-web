import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, NEGOCIO_KEY, USER_KEY } from "./api";

/**
 * La cabecera `X-Caja-Sucursal` (13-nov): `request()` la manda sola, así todas
 * las pantallas que piden la caja siguen la sede que el admin eligió en el POS.
 * Sólo al usuario de organización con 2+ sucursales; a todos los demás el
 * pedido sale idéntico al de siempre.
 */

const NEGOCIO = { id: 7, nombre: "Sabor", tipoNegocio: "RESTAURANTE", features: ["pos", "multi_almacen"], sucursalesActivas: 3 };

function sesion(usuario: object, negocio: object = NEGOCIO) {
  localStorage.setItem(USER_KEY, JSON.stringify(usuario));
  localStorage.setItem(NEGOCIO_KEY, JSON.stringify(negocio));
}

function fetchQueDevuelve(cuerpo: unknown) {
  const f = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", f);
  return f;
}

const cabeceras = (f: ReturnType<typeof fetchQueDevuelve>, i = 0) =>
  new Headers(f.mock.calls[i][1]?.headers as Record<string, string>);

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cabecera de la sede de caja en cada pedido", () => {
  it("el admin de organización con sede elegida: la manda en /caja/actual", async () => {
    sesion({ id: 1, sucursalId: null });
    localStorage.setItem("bamardev.caja.sede:7:1", "39");
    const f = fetchQueDevuelve({ caja: null });
    await api.cajaActual();
    expect(cabeceras(f).get("X-Caja-Sucursal")).toBe("39");
  });

  it("sin sede elegida no manda nada", async () => {
    sesion({ id: 1, sucursalId: null });
    const f = fetchQueDevuelve({ caja: null });
    await api.cajaActual();
    expect(cabeceras(f).has("X-Caja-Sucursal")).toBe(false);
  });

  it("el cajero atado a una sede no la manda nunca", async () => {
    sesion({ id: 2, sucursalId: 38 });
    localStorage.setItem("bamardev.caja.sede:7:2", "39");
    const f = fetchQueDevuelve({ caja: null });
    await api.cajaActual();
    expect(cabeceras(f).has("X-Caja-Sucursal")).toBe(false);
  });

  it("un negocio de un solo local no la manda", async () => {
    sesion({ id: 1, sucursalId: null }, { ...NEGOCIO, sucursalesActivas: 1 });
    localStorage.setItem("bamardev.caja.sede:7:1", "39");
    const f = fetchQueDevuelve({ caja: null });
    await api.cajaActual();
    expect(cabeceras(f).has("X-Caja-Sucursal")).toBe(false);
  });

  it("sin sesión guardada tampoco", async () => {
    const f = fetchQueDevuelve({ caja: null });
    await api.cajaActual();
    expect(cabeceras(f).has("X-Caja-Sucursal")).toBe(false);
  });

  it("una venta con su almacenId manda ESA sede aunque la activa ahora sea otra (cola sin conexión)", async () => {
    sesion({ id: 1, sucursalId: null });
    localStorage.setItem("bamardev.caja.sede:7:1", "40");
    const f = fetchQueDevuelve({ id: 5 });
    await api.crearVenta({ almacenId: 39, detalles: [] });
    expect(cabeceras(f).get("X-Caja-Sucursal")).toBe("39");
  });

  it("una venta sin almacenId (todos los demás) sale como siempre", async () => {
    sesion({ id: 2, sucursalId: 38 });
    const f = fetchQueDevuelve({ id: 5 });
    await api.crearVenta({ detalles: [] });
    expect(cabeceras(f).has("X-Caja-Sucursal")).toBe(false);
  });

  it("cajasAbiertas pide /caja/abiertas", async () => {
    sesion({ id: 1, sucursalId: null });
    const f = fetchQueDevuelve({ cajas: [] });
    await api.cajasAbiertas();
    expect(String(f.mock.calls[0][0])).toMatch(/\/caja\/abiertas$/);
  });
});
