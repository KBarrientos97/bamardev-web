import { describe, expect, it } from "vitest";
import { fmtFechaHora } from "../../../lib/format";
import {
  aniosDelSelector,
  aspectoMetodo,
  cantidadCorta,
  chipEstado,
  esTiempoDeMesa,
  filasMensual,
  hojaVentas,
  lineaVenta,
  metodoDeVenta,
  nombreHojaPagina,
  quienVendio,
  textoMesa,
  textoOrigen,
  tituloLinea,
  variasSucursales,
  type VentaFila,
} from "./Ventas.datos";

function venta(p: Partial<VentaFila> = {}): VentaFila {
  return {
    id: 1,
    comprobante: "V001395",
    fecha: "2026-10-08T04:18:00.000Z",
    cliente: "Consumidor final",
    vendedor: "Luis Mamani",
    estado: "APROBADO",
    metodoPago: "QR",
    articulos: 4,
    sucursal: null,
    total: 89.35,
    ...p,
  };
}

describe("ventas: de dónde salió cada venta", () => {
  it("en un billar el mostrador se lee como venta rápida", () => {
    expect(textoOrigen({ origen: "Mostrador" }, true)).toBe("Venta rápida");
  });

  it("una venta de mesa de billar no se llama venta rápida aunque el origen diga mostrador", () => {
    // El backend marca `billar` antes de saber decir de qué mesa: llamarla
    // "venta rápida" la hacía pasar por una gaseosa al paso.
    expect(textoOrigen({ origen: "Mostrador", billar: true }, true)).toBe("Mesa de billar");
    expect(textoOrigen({ origen: "Mesa 6", billar: true }, true)).toBe("Mesa 6");
  });

  it("fuera del billar el origen se muestra tal cual", () => {
    expect(textoOrigen({ origen: "Mostrador" }, false)).toBe("Mostrador");
    expect(textoOrigen({ origen: "Mesa M4" }, false)).toBe("Mesa M4");
  });

  it("sin origen (un backend anterior) no se inventa uno", () => {
    expect(textoOrigen({}, false)).toBeNull();
    expect(textoOrigen({ origen: "  " }, true)).toBeNull();
  });
});

describe("ventas: cómo se ve cada fila", () => {
  it("el ícono sale del método: el QR violeta, el efectivo verde y lo no cobrado en ámbar", () => {
    expect(aspectoMetodo("QR", "APROBADO")).toEqual({ icono: "qr", tono: "morado" });
    expect(aspectoMetodo("Efectivo", "APROBADO")).toEqual({ icono: "billetera", tono: "verde" });
    expect(aspectoMetodo("Sin cobrar", "APROBADO").tono).toBe("ambar");
    expect(aspectoMetodo("Mixto", "APROBADO").icono).toBe("coins");
    expect(aspectoMetodo(null, "APROBADO")).toEqual({ icono: "dollar", tono: "gris" });
  });

  it("una anulada va en gris, sea cual sea el método", () => {
    expect(aspectoMetodo("QR", "ANULADO")).toEqual({ icono: "qr", tono: "gris" });
  });

  it("el estado se nombra con su color: completada, anulada en rojo, pendiente en ámbar", () => {
    expect(chipEstado("APROBADO")).toEqual({ texto: "Completada", tono: "verde" });
    expect(chipEstado("ANULADO")).toEqual({ texto: "Anulada", tono: "rojo" });
    expect(chipEstado("PENDIENTE")).toEqual({ texto: "Pendiente", tono: "ambar" });
  });

  it("con mesero dice quién cobró y quién atendió", () => {
    // En un resto bar toda venta del salón la cobra la caja: sin el mesero,
    // el historial decía que todo lo vendieron las cajeras.
    expect(quienVendio(venta({ vendedor: "Ana", mesero: "Juan" }), false)).toBe("Cobró Ana · atendió Juan");
    expect(quienVendio(venta({ vendedor: "Ana", mesero: "Ana" }), false)).toBe("Ana");
  });

  it("el cliente sólo se nombra si no es consumidor final, y el local sólo si hay varios", () => {
    expect(quienVendio(venta({ cliente: "Consumidor final", sucursal: "Centro" }), false)).toBe("Luis Mamani");
    expect(quienVendio(venta({ cliente: "Don Pepe", sucursal: "Centro" }), true)).toBe("Luis Mamani · Don Pepe · Centro");
  });

  it("varias sucursales es más de un local distinto a la vista", () => {
    expect(variasSucursales([{ sucursal: "Centro" }, { sucursal: "Centro" }, { sucursal: null }])).toBe(false);
    expect(variasSucursales([{ sucursal: "Centro" }, { sucursal: "Sur" }])).toBe(true);
  });
});

describe("ventas (26-oct): una venta pagada parte y parte dice cuánto fue por cada medio", () => {
  const mixta = venta({
    metodoPago: "Mixto",
    origen: "Mesa 1",
    billar: true,
    total: 160,
    partes: [
      { medio: "Efectivo", monto: 80 },
      { medio: "QR", monto: 80 },
    ],
  });

  it("en un billar, con las partes, la línea dice el efectivo y el QR", () => {
    // Con "Mixto" solo, Miguel no sabía cuánto de esa venta buscar en el banco.
    expect(metodoDeVenta(mixta, true)).toMatch(/^Mixto \(Efectivo Bs\s80,00 \+ QR Bs\s80,00\)$/);
    expect(lineaVenta(mixta, true)).toBe(`${fmtFechaHora(mixta.fecha)} · ${metodoDeVenta(mixta, true)} · Mesa 1`);
  });

  it("sin las partes (un backend anterior) se lee como antes", () => {
    const vieja = { ...mixta, partes: undefined };
    expect(lineaVenta(vieja, true)).toBe(`${fmtFechaHora(mixta.fecha)} · Mixto · Mesa 1`);
  });

  it("con una sola parte no es mixta: el método como siempre", () => {
    expect(metodoDeVenta(venta({ metodoPago: "QR", partes: [{ medio: "QR", monto: 89.35 }] }), true)).toBe("QR");
  });

  it("fuera del billar la línea queda exactamente igual, aunque el backend mande las partes", () => {
    expect(lineaVenta({ ...mixta, origen: "Mostrador", billar: undefined }, false)).toBe(`${fmtFechaHora(mixta.fecha)} · Mixto · Mostrador`);
  });

  it("el Excel de un billar lleva las mismas partes", () => {
    const h = hojaVentas([mixta], { page: 1, limite: 50, total: 1, totalPaginas: 1 }, true);
    const [titulos, fila] = h.filas;
    expect(fila[titulos.indexOf("Método de pago")]).toBe(metodoDeVenta(mixta, true));
    const fuera = hojaVentas([mixta], { page: 1, limite: 50, total: 1, totalPaginas: 1 }, false);
    expect(fuera.filas[1][titulos.indexOf("Método de pago")]).toBe("Mixto");
  });
});

describe("ventas: el detallado", () => {
  it("el tiempo de mesa sólo se reconoce en un billar", () => {
    expect(esTiempoDeMesa("Tiempo de mesa", true)).toBe(true);
    expect(esTiempoDeMesa("tiempo de mesa", true)).toBe(true);
    expect(esTiempoDeMesa("Tiempo de mesa", false)).toBe(false);
    expect(esTiempoDeMesa("Coca Cola 500 ml", true)).toBe(false);
  });

  it("la mesa se escribe una sola vez, venga como venga", () => {
    expect(textoMesa(7)).toBe("Mesa 7");
    expect(textoMesa("7")).toBe("Mesa 7");
    expect(textoMesa("Mesa 7")).toBe("Mesa 7");
    expect(textoMesa("")).toBeNull();
    expect(textoMesa(null)).toBeNull();
    expect(tituloLinea({ producto: "Tiempo de mesa", mesa: 7 })).toBe("Tiempo de mesa · Mesa 7");
    expect(tituloLinea({ producto: "Agua 600 ml" })).toBe("Agua 600 ml");
  });

  it("la cantidad corta respeta lo vendido por peso", () => {
    expect(cantidadCorta(2)).toBe("×2");
    expect(cantidadCorta(1.5)).toBe("×1,5");
  });
});

describe("ventas: el mensual", () => {
  const meses = [
    { mes: 1, nombre: "Enero", ventas: 888, total: 53_101.99, estado: "CON_VENTAS" as const },
    { mes: 2, nombre: "Febrero", ventas: 0, total: 0, estado: "SIN_VENTAS" as const },
    { mes: 3, nombre: "Marzo", ventas: 1019, total: 60_958.12, estado: "CON_VENTAS" as const },
    { mes: 4, nombre: "Abril", ventas: 0, total: 0, estado: "FUTURO" as const },
  ];

  it("los meses llevan su sigla y el mejor se marca", () => {
    const filas = filasMensual({ meses });
    expect(filas.map((f) => f.sigla)).toEqual(["ENE", "FEB", "MAR", "ABR"]);
    expect(filas.filter((f) => f.mejor).map((f) => f.nombre)).toEqual(["Marzo"]);
    expect(filas[2].fraccion).toBe(1);
    expect(filas[0].fraccion).toBeCloseTo(53_101.99 / 60_958.12);
  });

  it("un mes futuro no se mide como un cero", () => {
    const abril = filasMensual({ meses }).find((f) => f.mes === 4)!;
    expect(abril.fraccion).toBe(0);
    expect(abril.mejor).toBe(false);
  });

  it("un año sin ventas no tiene mejor mes", () => {
    const filas = filasMensual({ meses: meses.map((m) => ({ ...m, ventas: 0, total: 0, estado: "SIN_VENTAS" as const })) });
    expect(filas.some((f) => f.mejor)).toBe(false);
  });

  it("el selector de años trae el que se mira, el más nuevo primero", () => {
    expect(aniosDelSelector({ anio: 2026, anios: [2024, 2025] })).toEqual([2026, 2025, 2024]);
    expect(aniosDelSelector({ anio: 2025, anios: [2025, 2026] })).toEqual([2026, 2025]);
  });
});

describe("ventas: el Excel", () => {
  it("la hoja de una lista paginada dice qué página es", () => {
    // Se baja la página que se ve: sin decirlo, 50 ventas se leían como el
    // período entero.
    expect(nombreHojaPagina("Ventas", { page: 2, totalPaginas: 4 })).toBe("Ventas pág. 2 de 4");
    expect(nombreHojaPagina("Ventas", { page: 1, totalPaginas: 1 })).toBe("Ventas");
  });

  it("los montos van como número y el origen como en la pantalla", () => {
    const h = hojaVentas([venta({ origen: "Mostrador", total: 12 })], { page: 1, limite: 50, total: 1, totalPaginas: 1 }, true);
    const [titulos, fila] = h.filas;
    expect(fila[titulos.indexOf("Total (Bs)")]).toBe(12);
    expect(fila[titulos.indexOf("Origen")]).toBe("Venta rápida");
    expect(fila[titulos.indexOf("Estado")]).toBe("Completada");
  });
});
