import { describe, expect, it } from "vitest";
import type { FormaPago } from "../../types";
import { aMesa, aPagos, aVenta, type MesaApi, type VentaApi } from "./api";

const FORMAS = [
  { id: 7, nombre: "Efectivo" },
  { id: 9, nombre: "QR" },
] as FormaPago[];

describe("aPagos: el cobro de la pantalla como pagos del backend", () => {
  it("efectivo lleva lo recibido, para el vuelto", () => {
    expect(aPagos({ metodo: "Efectivo", monto: 35, recibido: 50 }, FORMAS)).toEqual([
      { formaPagoId: 7, monto: 35, recibido: 50 },
    ]);
  });

  it("el mixto son dos pagos, como en el POS", () => {
    // Un solo renglón "Mixto" no cuadra el arqueo: el efectivo va al cajón y el QR no.
    expect(aPagos({ metodo: "Mixto", monto: 50, partes: { efectivo: 20, qr: 30 } }, FORMAS)).toEqual([
      { formaPagoId: 7, monto: 20 },
      { formaPagoId: 9, monto: 30 },
    ]);
  });

  it("sin la forma de pago dada de alta no cobra, y dice cuál falta", () => {
    expect(() => aPagos({ metodo: "QR", monto: 10 }, [FORMAS[0]])).toThrow('forma de pago "QR"');
  });

  it("encuentra la forma aunque esté escrita con otra mayúscula", () => {
    expect(aPagos({ metodo: "QR", monto: 10 }, [{ id: 3, nombre: "qr" } as FormaPago])).toEqual([
      { formaPagoId: 3, monto: 10 },
    ]);
  });
});

describe("aMesa: la mesa del backend con el número a la vista", () => {
  const api: MesaApi = {
    id: 412,
    numero: 5,
    tipo: "pool",
    estado: "abierta",
    sesion: {
      id: 88,
      version: 3,
      start: 1_000,
      pausedAt: null,
      pausedTotal: 0,
      prepago: null,
      prev: null,
      tarifa: { id: "pool", nombre: "Pool", tarifa: 20, fraccion: 15, tolerancia: 3, minimo: 30, paquetes: [], promos: [] },
      consumos: [{ id: 3, productoId: 1, nombre: "Paceña", precio: 15, cant: 2, hora: 2_000, anulado: false }],
      pagos: [{ id: 4, hora: 3_000, formaPagoId: 7, metodo: "Efectivo", monto: 20, recibido: 20, concepto: "ADELANTO" }],
    },
  };

  it("el id es el número que se ve y las rutas usan el interno", () => {
    // Las pantallas dicen "Mesa 5" y navegan por el número; el backend la busca por 412.
    const m = aMesa(api);
    expect(m.id).toBe(5);
    expect(m.idInterno).toBe(412);
    expect(m.sesion?.id).toBe("88");
  });

  it("el pago dice qué fue (adelanto, tiempo fijo) y el recibido justo no se muestra", () => {
    expect(aMesa(api).sesion?.pagos[0]).toMatchObject({ metodo: "Efectivo", monto: 20, nota: "Adelanto", recibido: undefined });
  });
});

describe("aVenta", () => {
  it("el QR del negocio se agrupa como QR aunque se llame en minúscula", () => {
    const v = {
      id: 1,
      codigo: "V-000001",
      hora: 0,
      cajero: "Ana",
      origen: "rapida",
      tiempoMin: 0,
      tiempoBs: 0,
      items: [],
      consumosBs: 8,
      total: 8,
      pagos: [{ id: "1", hora: 0, metodo: "qr", monto: 8 }],
    } satisfies VentaApi;
    expect(aVenta(v).pagos[0].metodo).toBe("QR");
  });
});
