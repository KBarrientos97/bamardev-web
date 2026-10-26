import { describe, expect, it } from "vitest";
import type { Producto } from "../../types";
import { concentracionAparte, puntoVencimiento } from "./medicamento";

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

describe("la concentración al lado del nombre", () => {
  it("no se repite si el nombre ya la trae, con o sin espacio", () => {
    expect(concentracionAparte({ nombre: "Paracetamol 500 mg x20", concentracion: "500 mg" })).toBeNull();
    expect(concentracionAparte({ nombre: "Amoxidal 500mg x12 cápsulas", concentracion: "500 mg" })).toBeNull();
    expect(concentracionAparte({ nombre: "Alcohol medicinal 70% 250ml", concentracion: "70 %" })).toBeNull();
    expect(concentracionAparte({ nombre: "Loratadina Inti 10MG x10", concentracion: "10 mg" })).toBeNull();
  });

  it("se muestra si el nombre no la trae", () => {
    expect(concentracionAparte({ nombre: "Suero fisiológico 500ml", concentracion: "0,9 %" })).toBe("0,9 %");
    expect(concentracionAparte({ nombre: "Diclofenaco gel 30 g", concentracion: "1 %" })).toBe("1 %");
    expect(concentracionAparte({ nombre: "Ácido fólico", concentracion: null })).toBeNull();
  });

  it("un número que es la cola de otro no cuenta: 5 mg no está en 15mg", () => {
    expect(concentracionAparte({ nombre: "Meloxicam 15mg", concentracion: "5 mg" })).toBe("5 mg");
    expect(concentracionAparte({ nombre: "Suero 10,9%", concentracion: "0,9 %" })).toBe("0,9 %");
  });
});

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

  it("ámbar hasta 90 días y el color del negocio lo que está lejos", () => {
    expect(
      puntoVencimiento(med({ proximoVencimiento: { fecha: "x", dias: 73, tramo: "HASTA_90" } })).color,
    ).toBe("bg-warning");
    expect(
      puntoVencimiento(med({ proximoVencimiento: { fecha: "x", dias: 388, tramo: "LEJOS" } })).color,
    ).toBe("bg-primary");
  });

  it("gris lo que no vence, y lo que no tiene lote con fecha", () => {
    expect(puntoVencimiento(med({ manejaLote: false }))).toMatchObject({
      color: "bg-slate-300",
      texto: "No vence",
    });
    expect(puntoVencimiento(med({ proximoVencimiento: null })).texto).toBe("Sin fecha");
  });

  it("si lo único que queda está vencido, rojo y dice Vencido, no Sin fecha", () => {
    expect(puntoVencimiento(med({ proximoVencimiento: null, stockVencido: 6 }))).toMatchObject({
      color: "bg-danger",
      corto: "Vencido",
      urgente: true,
    });
  });
});
