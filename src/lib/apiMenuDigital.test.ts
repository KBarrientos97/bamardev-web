import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECIBO_DE_FABRICA } from "../types/menuDigital";

/**
 * El diseño del recibo contra un backend que todavía no conoce los tres
 * ajustes del 16-nov (código de barras, letra gruesa, sucursal): QA hoy y PROD
 * un tiempo más. Lo que no llega se completa con los de fábrica, que son el
 * papel de siempre, y guardar manda el diseño entero sin romper nada.
 */

const request = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ request }));

import { apiMenuDigital } from "./apiMenuDigital";

/** El recibo como lo manda un backend anterior: sin los cuatro campos. */
const reciboViejo = () => {
  const r: Record<string, unknown> = { ...RECIBO_DE_FABRICA, ancho: 58 };
  delete r.codigoBarras;
  delete r.negrita;
  delete r.sucursal;
  delete r.impresionDirecta;
  return r;
};

beforeEach(() => {
  request.mockReset();
});

describe("apiMenuDigital: el recibo con los ajustes de la térmica (16-nov)", () => {
  it("de fábrica, los mismos valores que el backend: con código de barras, sin negrita, sin sucursal, sin impresión directa", () => {
    expect(RECIBO_DE_FABRICA.codigoBarras).toBe(true);
    expect(RECIBO_DE_FABRICA.negrita).toBe(false);
    expect(RECIBO_DE_FABRICA.sucursal).toBe(false);
    expect(RECIBO_DE_FABRICA.impresionDirecta).toBe(false);
  });

  it("un backend que no los manda: se leen los de fábrica, y lo demás queda como vino", async () => {
    request.mockResolvedValue({ recibo: reciboViejo(), logo: null, configurado: true });
    const r = await apiMenuDigital.recibo();
    expect(r.recibo).toMatchObject({
      codigoBarras: true,
      negrita: false,
      sucursal: false,
      impresionDirecta: false,
      ancho: 58,
    });
    // Sin la sucursal de la vista previa: no viene, y no se inventa.
    expect(r.sucursal).toBeUndefined();
  });

  it("un backend nuevo: se respeta lo guardado y llega la sucursal de la vista previa", async () => {
    const sucursal = { id: 13, nombre: "Norte", direccion: "Calle Norte 45", telefono: "70000200" };
    request.mockResolvedValue({
      recibo: { ...RECIBO_DE_FABRICA, codigoBarras: false, negrita: true, sucursal: true, impresionDirecta: true },
      logo: null,
      configurado: true,
      sucursal,
    });
    const r = await apiMenuDigital.recibo();
    expect(r.recibo).toMatchObject({ codigoBarras: false, negrita: true, sucursal: true, impresionDirecta: true });
    expect(r.sucursal).toEqual(sucursal);
  });

  it("guardar manda el diseño entero, con los cuatro, y lo que contesta un backend anterior se completa", async () => {
    request.mockResolvedValue(reciboViejo());
    const guardado = await apiMenuDigital.guardarRecibo({ ...RECIBO_DE_FABRICA, negrita: true, impresionDirecta: true });
    const [ruta, op] = request.mock.calls[0] as [string, RequestInit];
    expect(ruta).toBe("/pantallas/recibo");
    expect(op.method).toBe("PATCH");
    expect(JSON.parse(op.body as string).recibo).toMatchObject({
      codigoBarras: true,
      negrita: true,
      sucursal: false,
      impresionDirecta: true,
    });
    // El backend anterior no lo guardó: lo que vuelve es el de fábrica, no un `undefined`.
    expect(guardado).toMatchObject({ codigoBarras: true, negrita: false, sucursal: false, impresionDirecta: false });
  });
});
