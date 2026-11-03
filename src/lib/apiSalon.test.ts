import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

/**
 * Lo que la web le manda al salón. Se fija el cuerpo de cada llamada contra
 * los DTO del backend (src/salon/dto/salon.dto.ts): con `whitelist` una clave
 * que el DTO no declara se descarta sin aviso, y así estuvieron muertas desde
 * el 07-sep tres acciones del mesero y la nota de la mesa.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function fetchQueDevuelve(cuerpo: unknown = {}) {
  const f = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", f);
  return f;
}

/** La ruta, el método y el cuerpo (ya parseado) del único pedido hecho. */
function pedido(f: ReturnType<typeof fetchQueDevuelve>) {
  const [url, init] = f.mock.calls[0];
  return {
    ruta: new URL(String(url), "https://x").pathname,
    metodo: init?.method,
    cuerpo: JSON.parse(String(init?.body ?? "{}")),
  };
}

describe("BUG-salon-1: pasar, juntar y unir mandan la otra mesa como mesaId", () => {
  // MoverMesaDto sólo declara `mesaId`. La web mandaba `destinoId`, `otraId`
  // y `mesaIds`: el backend respondía 400 SIEMPRE y Android (que manda
  // `mesaId`) andaba.
  it("pasar a otra mesa", async () => {
    const f = fetchQueDevuelve();
    await api.transferirMesa(1, 7);
    expect(pedido(f)).toEqual({
      ruta: expect.stringMatching(/\/salon\/mesas\/1\/transferir$/),
      metodo: "POST",
      cuerpo: { mesaId: 7 },
    });
  });

  it("juntar con otra mesa", async () => {
    const f = fetchQueDevuelve();
    await api.juntarMesa(1, 4);
    expect(pedido(f)).toEqual({
      ruta: expect.stringMatching(/\/salon\/mesas\/1\/juntar$/),
      metodo: "POST",
      cuerpo: { mesaId: 4 },
    });
  });

  it("unir otra mesa, de a una como une el backend", async () => {
    const f = fetchQueDevuelve();
    await api.unirMesa(1, 2);
    expect(pedido(f)).toEqual({
      ruta: expect.stringMatching(/\/salon\/mesas\/1\/unir$/),
      metodo: "POST",
      cuerpo: { mesaId: 2 },
    });
  });
});

describe("BUG-salon-2: la nota de la mesa viaja como nota", () => {
  it("al crear", async () => {
    const f = fetchQueDevuelve();
    await api.crearMesa({ codigo: "M7", zonaId: 1, capacidad: 4, nota: "Al lado de la parrilla" });
    const { cuerpo } = pedido(f);
    expect(cuerpo.nota).toBe("Al lado de la parrilla");
    expect(cuerpo).not.toHaveProperty("notaMesa");
  });

  it("al editar, también vacía (es como se borra)", async () => {
    const f = fetchQueDevuelve();
    await api.actualizarMesa(3, { nota: "" });
    expect(pedido(f)).toEqual({
      ruta: expect.stringMatching(/\/mesas\/3$/),
      metodo: "PATCH",
      cuerpo: { nota: "" },
    });
  });
});

describe("el cobro de una mesa lleva la propina y el total esperado", () => {
  it("manda tal cual lo que arma el cobro", async () => {
    const f = fetchQueDevuelve({ id: 9 });
    await api.cobrarMesa(5, {
      pagos: [{ formaPagoId: 1, monto: 52, recibido: 60 }],
      propina: 5,
      totalEsperado: 52,
      clienteRequestId: "abc",
    });
    expect(pedido(f)).toEqual({
      ruta: expect.stringMatching(/\/salon\/mesas\/5\/cobrar$/),
      metodo: "POST",
      cuerpo: {
        pagos: [{ formaPagoId: 1, monto: 52, recibido: 60 }],
        propina: 5,
        totalEsperado: 52,
        clienteRequestId: "abc",
      },
    });
  });
});

describe("la comanda y la reserva", () => {
  it("la comanda viaja con su clienteRequestId", async () => {
    const f = fetchQueDevuelve();
    await api.crearComanda(2, { items: [{ productoId: 3, cantidad: 1 }], clienteRequestId: "c-1" });
    expect(pedido(f).cuerpo).toEqual({ items: [{ productoId: 3, cantidad: 1 }], clienteRequestId: "c-1" });
  });

  it("la reserva siempre lleva las personas", async () => {
    const f = fetchQueDevuelve();
    await api.reservarMesa(2, { hora: "20:30", nombre: "Sra. Peredo", personas: 4 });
    expect(pedido(f).cuerpo).toEqual({ hora: "20:30", nombre: "Sra. Peredo", personas: 4 });
  });
});
