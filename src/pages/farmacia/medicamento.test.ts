import { describe, expect, it } from "vitest";
import type { Producto } from "../../types";
import { puntoVencimiento } from "./medicamento";

function med(over: Partial<Producto>): Producto {
  return {
    id: 1,
    nombre: "Ibuprofeno 400 mg",
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio: 0.7,
    costo: 0.3,
    stockMinimo: 10,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 180,
    componentes: [],
    principioActivo: "Ibuprofeno",
    concentracion: "400 mg",
    formaFarmaceutica: "Comprimido",
    laboratorio: "INTI",
    registroSanitario: null,
    condicionVenta: "LIBRE",
    manejaLote: true,
    controlado: false,
    ...over,
  };
}

describe("el punto de vencimiento del mostrador", () => {
  it("rojo a 30 días o menos, y vencido también", () => {
    const pronto = puntoVencimiento(
      med({ proximoVencimiento: { fecha: "2026-10-09", dias: 13, tramo: "HASTA_30" } }),
    );
    expect(pronto).toMatchObject({ color: "bg-danger", texto: "13 días", urgente: true });

    const vencido = puntoVencimiento(
      med({ proximoVencimiento: { fecha: "2026-09-02", dias: -24, tramo: "VENCIDO" } }),
    );
    expect(vencido).toMatchObject({ color: "bg-danger", texto: "Venció hace 24 d", corto: "Vencido" });
  });

  it("ámbar hasta 90 días y verde lo que está lejos", () => {
    expect(
      puntoVencimiento(med({ proximoVencimiento: { fecha: "x", dias: 73, tramo: "HASTA_90" } })).color,
    ).toBe("bg-warning");
    expect(
      puntoVencimiento(med({ proximoVencimiento: { fecha: "x", dias: 388, tramo: "LEJOS" } })).color,
    ).toBe("bg-emerald-500");
  });

  it("gris lo que no vence, y lo que no tiene lote con fecha", () => {
    expect(puntoVencimiento(med({ manejaLote: false }))).toMatchObject({
      color: "bg-slate-300",
      texto: "No vence",
    });
    expect(puntoVencimiento(med({ proximoVencimiento: null })).texto).toBe("Sin fecha");
  });
});
