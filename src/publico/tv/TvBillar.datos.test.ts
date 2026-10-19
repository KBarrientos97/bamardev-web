import { describe, expect, it } from "vitest";
import { ErrorTv, type SalonPublicoApi } from "./apiTv";
import { clasificarFalla, esperaTrasFallo, llaveConForma, mesasDelSalon, sucursalDeLaDireccion } from "./TvBillar.datos";

describe("TV pública del billar: qué hace con cada respuesta", () => {
  it("sólo el 404 apaga la TV; el tope de pedidos y el servidor caído se reintentan", () => {
    expect(clasificarFalla(new ErrorTv("Esta pantalla no está habilitada", 404))).toBe("anulada");
    expect(clasificarFalla(new ErrorTv("El almacén 9 no existe", 400))).toBe("invalida");
    // Un 429 (diez TVs detrás de la misma IP) o un deploy no pueden mostrar
    // "ya no está habilitada": el dueño generaría otro enlace sin motivo.
    expect(clasificarFalla(new ErrorTv("Demasiados pedidos", 429))).toBe("sinConexion");
    expect(clasificarFalla(new ErrorTv("error 502", 502))).toBe("sinConexion");
    expect(clasificarFalla(new ErrorTv("sin internet", 0))).toBe("sinConexion");
    expect(clasificarFalla(new TypeError("Failed to fetch"))).toBe("sinConexion");
  });

  it("sin conexión se espacia hasta 30 s y no más", () => {
    expect([1, 2, 3, 4, 10].map(esperaTrasFallo)).toEqual([10_000, 20_000, 30_000, 30_000, 30_000]);
  });

  it("reconoce un enlace cortado y un local que no es un número", () => {
    expect(llaveConForma("Qm9sYS1vY2hvLWVuLWxhLXRyb25lcmEx")).toBe(true);
    expect(llaveConForma("Qm9sYS1v")).toBe(false);
    expect(llaveConForma("con espacio en el medio de la llave")).toBe(false);
    expect(sucursalDeLaDireccion("7")).toBe(7);
    expect(sucursalDeLaDireccion(null)).toBeUndefined();
    expect(sucursalDeLaDireccion("norte")).toBeUndefined();
    expect(sucursalDeLaDireccion("0")).toBeUndefined();
  });
});

describe("TV pública del billar: la pausa", () => {
  it("conserva desde cuándo está en pausa de verdad, no la hora del cambio de mesa", () => {
    // Prueba profunda del 18-oct: tras pasar una cuenta pausada a otra mesa,
    // `pausedAt` es la hora del cambio y la TV decía "hace 0 min" sin ámbar.
    const r = {
      negocio: "Billar",
      tipos: [],
      mesas: [
        {
          id: 3,
          numero: 3,
          tipo: "pool",
          estado: "abierta",
          sesion: { start: 1_000, pausedAt: 9_000, pausaDesde: 4_000, pausedTotal: 0, prepago: null, prev: null, consumos: [], pagos: [] },
        },
      ],
    } as unknown as SalonPublicoApi;
    expect(mesasDelSalon(r)[0].sesion?.pausaDesde).toBe(4_000);
  });
});
