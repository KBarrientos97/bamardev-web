import { describe, expect, it } from "vitest";
import type { PedidoPlataforma } from "../../lib/pedidosPlataforma/tipos";
import {
  lineasDePedidoPlataforma,
  lineasDelCarrito,
  lineasTicketPlataforma,
  pedidoParaImprimir,
  textoTicketPlataforma,
  type DatosTicketPlataforma,
} from "./ticketPlataforma";

/**
 * El ticket de un pedido de Yango o PedidosYa (CONTRATO-DELIVERY-FULL-18NOV
 * §9). El primer caso es el ejemplo del contrato, letra por letra: la app
 * (Android) tiene que dar exactamente el mismo texto.
 */

/** La hora del local: el ticket la escribe en la hora de este equipo. */
const LAS_00_41 = new Date(2026, 10, 18, 0, 41);

const EJEMPLO: DatosTicketPlataforma = {
  negocio: "Nombre del negocio",
  sede: "Principal",
  plataforma: "YANGO",
  codigoExterno: "12345",
  fecha: LAS_00_41,
  atendio: "Admin Demo",
  lineas: [
    { nombre: "Brasa entero", cantidad: 2, subtotal: 224, agregados: [{ nombre: "Arroz (porción)", cantidad: 1, subtotal: 6 }] },
    { nombre: "Coca Cola 2L", cantidad: 1, subtotal: 18 },
  ],
  total: 248,
};

const ancho = (lineas: string[]) => Math.max(...lineas.map((l) => l.length));
/** Un renglón de 32 columnas: lo de la izquierda y el monto pegado al borde. */
const fila = (izq: string, monto: string) => izq + " ".repeat(32 - izq.length - monto.length) + monto;

describe("ticket de plataforma", () => {
  it("el ejemplo del contrato, letra por letra", () => {
    expect(lineasTicketPlataforma(EJEMPLO)).toEqual([
      "       NOMBRE DEL NEGOCIO",
      // Centrado: (32 - 9) / 2 = 11,5 → 11 espacios adelante (el dibujo del contrato muestra 10, a ojo).
      " ".repeat(11) + "Principal",
      "--------------------------------",
      "PEDIDO YANGO",
      "N° de la app: 12345",
      "18/11/2026 00:41",
      "Atendió: Admin Demo",
      "--------------------------------",
      "2 x Brasa entero          224.00",
      "  + Arroz (porción)         6.00",
      "1 x Coca Cola 2L           18.00",
      "--------------------------------",
      "TOTAL                  Bs 248.00",
      "3 unidades",
      "--------------------------------",
    ]);
  });

  it("todo el papel entra en 32 columnas y es un solo texto con saltos de línea", () => {
    const texto = textoTicketPlataforma(EJEMPLO);
    expect(ancho(texto.split("\n"))).toBeLessThanOrEqual(32);
    expect(texto.split("\n")).toHaveLength(15);
  });

  it("PedidosYa, sin N° de la app y sin sucursal (un solo local)", () => {
    const l = lineasTicketPlataforma({ ...EJEMPLO, plataforma: "PEDIDOS_YA", codigoExterno: null, sede: null });
    expect(l.slice(0, 5)).toEqual([
      "       NOMBRE DEL NEGOCIO",
      "--------------------------------",
      "PEDIDO PEDIDOSYA",
      "18/11/2026 00:41",
      "Atendió: Admin Demo",
    ]);
    expect(l.join("\n")).not.toContain("N° de la app");
  });

  it("un nombre largo se parte en renglones, nunca con «…», y el monto queda en el primero", () => {
    const l = lineasTicketPlataforma({
      ...EJEMPLO,
      negocio: "Restaurante de prueba con un nombre muy largo",
      lineas: [{ nombre: "Pollo a la brasa entero con papas fritas y ensalada", cantidad: 1, subtotal: 112 }],
      total: 112,
    });
    // 28 y 16 letras: 2 y 8 espacios adelante.
    expect(l.slice(0, 2)).toEqual(["  RESTAURANTE DE PRUEBA CON UN", " ".repeat(8) + "NOMBRE MUY LARGO"]);
    const primero = fila("1 x Pollo a la brasa", "112.00");
    expect(l).toContain(primero);
    const i = l.indexOf(primero);
    expect(l.slice(i + 1, i + 3)).toEqual(["    entero con papas fritas y", "    ensalada"]);
    expect(l.join("\n")).not.toContain("…");
    expect(ancho(l)).toBeLessThanOrEqual(32);
    expect(l).toContain("1 unidad");
  });

  it("toppings: el incluido sin monto, el repetido con su cantidad; las unidades no los cuentan", () => {
    const l = lineasTicketPlataforma({
      ...EJEMPLO,
      lineas: [
        {
          nombre: "Arroz con leche L",
          cantidad: 2,
          subtotal: 70,
          agregados: [
            { nombre: "Canela", cantidad: 2, subtotal: 0, incluido: true },
            { nombre: "Oreo", cantidad: 2, subtotal: 8 },
          ],
        },
      ],
      total: null,
    });
    expect(l).toContain(fila("2 x Arroz con leche L", "70.00"));
    expect(l).toContain("  + 2 x Canela");
    expect(l).toContain(fila("  + 2 x Oreo", "8.00"));
    // Sin el total del servidor (la cola), se suman las líneas con sus toppings.
    expect(l).toContain(fila("TOTAL", "Bs 78.00"));
    expect(l).toContain("2 unidades");
  });
});

describe("las reglas finas que comparte con la app (18-nov)", () => {
  it("regla 1 · centrado: floor((32 - largo) / 2) espacios adelante y nada al final", () => {
    const l = lineasTicketPlataforma({ ...EJEMPLO, negocio: "Pollos", sede: "Sucursal Norte 2" });
    expect(l[0]).toBe(" ".repeat(13) + "POLLOS"); // (32 - 6) / 2 = 13
    expect(l[1]).toBe(" ".repeat(8) + "Sucursal Norte 2"); // (32 - 16) / 2 = 8
    expect(lineasTicketPlataforma({ ...EJEMPLO, negocio: "Abc" })[0]).toBe(" ".repeat(14) + "ABC"); // 14,5 → 14
    expect(l.every((r) => !r.endsWith(" "))).toBe(true);
  });

  it("regla 3 · las unidades cuentan sólo los productos, ningún topping (ni incluido ni cobrado)", () => {
    const l = lineasTicketPlataforma({
      ...EJEMPLO,
      lineas: [
        {
          nombre: "Brasa entero",
          cantidad: 1,
          subtotal: 112,
          agregados: [
            { nombre: "Arroz (porción)", cantidad: 3, subtotal: 18 },
            { nombre: "Llajua", cantidad: 1, subtotal: 0, incluido: true },
          ],
        },
      ],
      total: null,
    });
    expect(l).toContain("1 unidad");
    expect(l).toContain(fila("TOTAL", "Bs 130.00"));
  });

  it("regla 4 · topping de uno sin cantidad, de varios con «2 x» (la x común, nunca «×»); el incluido sin plata", () => {
    const l = lineasTicketPlataforma({
      ...EJEMPLO,
      lineas: [
        {
          nombre: "Arroz con leche L",
          cantidad: 1,
          subtotal: 35,
          agregados: [
            { nombre: "Oreo", cantidad: 1, subtotal: 4 },
            { nombre: "Chubi", cantidad: 2, subtotal: 8 },
            { nombre: "Canela", cantidad: 1, subtotal: 0, incluido: true },
          ],
        },
      ],
    });
    expect(l).toContain(fila("  + Oreo", "4.00"));
    expect(l).toContain(fila("  + 2 x Chubi", "8.00"));
    expect(l).toContain("  + Canela");
    expect(l.join("\n")).not.toContain("×");
  });

  it("regla 5 · un topping de nombre largo también lleva su plata en el primer renglón y la sangría de su prefijo", () => {
    const l = lineasTicketPlataforma({
      ...EJEMPLO,
      lineas: [
        { nombre: "Brasa entero", cantidad: 1, subtotal: 112, agregados: [{ nombre: "Porción de papas fritas con queso derretido", cantidad: 2, subtotal: 30 }] },
      ],
    });
    const i = l.indexOf(fila("  + 2 x Porción de papas", "30.00"));
    expect(i).toBeGreaterThan(0);
    // Los que siguen, bajo el nombre (8 de sangría) y hasta el borde: 24 columnas.
    expect(l.slice(i + 1, i + 3)).toEqual(["        fritas con queso", "        derretido"]);
  });
});

describe("el descuento de la app y las observaciones (CONTRATO-PRECIO-PLATAFORMA, 19-nov)", () => {
  const BASE: DatosTicketPlataforma = {
    negocio: "Nombre del negocio",
    plataforma: "PEDIDOS_YA",
    fecha: LAS_00_41,
    lineas: [{ nombre: "Brasa economico", cantidad: 2, subtotal: 42 }],
  };
  /** Lo que va de la raya de los productos al final: el ejemplo del contrato. */
  const pie = (l: string[]) => l.slice(l.indexOf(fila("2 x Brasa economico", "42.00")));

  it("el ejemplo del contrato, letra por letra: subtotal, descuento, total neto y la nota", () => {
    const l = lineasTicketPlataforma({ ...BASE, total: 41, descuento: 1, observaciones: "sin aji" });
    expect(pie(l)).toEqual([
      "2 x Brasa economico        42.00",
      "--------------------------------",
      "Subtotal                   42.00",
      "Descuento                  -1.00",
      "TOTAL                   Bs 41.00",
      "2 unidades",
      "Obs: sin aji",
      "--------------------------------",
    ]);
    expect(ancho(l)).toBeLessThanOrEqual(32);
  });

  it("sin descuento ni observaciones el papel es el de siempre (0 y vacío no dicen nada)", () => {
    const antes = lineasTicketPlataforma({ ...BASE, total: 42 });
    expect(lineasTicketPlataforma({ ...BASE, total: 42, descuento: 0, observaciones: "  " })).toEqual(antes);
    expect(lineasTicketPlataforma({ ...BASE, total: 42, descuento: null, observaciones: null })).toEqual(antes);
    expect(antes.join("\n")).not.toMatch(/Subtotal|Descuento|Obs:/);
  });

  it("de la cola (sin total del servidor): el total es la suma de las líneas menos el descuento", () => {
    const l = lineasTicketPlataforma({ ...BASE, total: null, descuento: 1.5 });
    expect(l).toContain(fila("Subtotal", "42.00"));
    expect(l).toContain(fila("Descuento", "-1.50"));
    expect(l).toContain(fila("TOTAL", "Bs 40.50"));
  });

  it("una nota larga se parte a 32 columnas, sin «…»", () => {
    const l = lineasTicketPlataforma({ ...BASE, total: 42, observaciones: "sin aji, la cliente llama al llegar al portón" });
    const i = l.indexOf("2 unidades");
    expect(l.slice(i + 1, i + 3)).toEqual(["Obs: sin aji, la cliente llama", "al llegar al portón"]);
    expect(ancho(l)).toBeLessThanOrEqual(32);
    expect(l.join("\n")).not.toContain("…");
  });

  it("en la cola sin señal sale con los precios de la app, el descuento y la nota del diálogo", () => {
    const p = pedidoParaImprimir({
      plataforma: "PEDIDOS_YA",
      pedido: null,
      // El precio de la app (21), no el del local (18).
      carrito: [{ nombre: "Brasa economico", cantidad: 2, precio: 21 }],
      descuento: 1,
      observaciones: " sin aji ",
      sede: null,
      atendio: null,
      ahora: LAS_00_41,
    });
    expect(p).toMatchObject({ encolado: true, total: 41, descuento: 1, observaciones: "sin aji" });
    expect(pie(lineasTicketPlataforma({ ...p, negocio: "Nombre del negocio" }))).toEqual([
      "2 x Brasa economico        42.00",
      "--------------------------------",
      "Subtotal                   42.00",
      "Descuento                  -1.00",
      "TOTAL                   Bs 41.00",
      "2 unidades",
      "Obs: sin aji",
      "--------------------------------",
    ]);
  });

  it("del servidor: el descuento y la nota que guardó; un backend viejo (sin esos campos) da el papel de siempre", () => {
    const pedido = {
      id: 1,
      clienteRequestId: "x",
      plataforma: "PEDIDOS_YA",
      codigoExterno: null,
      fecha: "2026-11-18T04:41:00.000Z",
      almacen: { id: 1, nombre: "Principal" },
      usuario: null,
      total: 41,
      sinStock: false,
      anuladoEn: null,
      motivoAnulacion: null,
      detalles: [{ id: 1, lineaPadreId: null, productoId: 7, nombre: "Brasa economico", cantidad: 2, precio: 21, subtotal: 42 }],
    } satisfies PedidoPlataforma;
    const nuevo = pedidoParaImprimir({ plataforma: "PEDIDOS_YA", pedido: { ...pedido, subtotal: 42, descuento: 1, observaciones: "sin aji" }, carrito: [], sede: null, atendio: null });
    expect(nuevo).toMatchObject({ total: 41, descuento: 1, observaciones: "sin aji" });
    const viejo = pedidoParaImprimir({ plataforma: "PEDIDOS_YA", pedido: { ...pedido, total: 42 }, carrito: [], sede: null, atendio: null });
    expect(viejo).toMatchObject({ total: 42, descuento: 0, observaciones: null });
    expect(lineasTicketPlataforma({ ...viejo, negocio: "N" }).join("\n")).not.toMatch(/Subtotal|Descuento|Obs:/);
  });
});

describe("de dónde salen los productos", () => {
  const PEDIDO: PedidoPlataforma = {
    id: 12,
    clienteRequestId: "uuid",
    plataforma: "YANGO",
    codigoExterno: "A-123",
    fecha: "2026-11-18T04:41:00.000Z",
    almacen: { id: 3, nombre: "Principal" },
    usuario: { id: 1, nombre: "Admin Demo" },
    total: 248,
    sinStock: false,
    anuladoEn: null,
    motivoAnulacion: null,
    detalles: [
      { id: 1, lineaPadreId: null, productoId: 7, nombre: "Brasa entero", cantidad: 2, precio: 112, subtotal: 224 },
      { id: 2, lineaPadreId: 1, incluido: false, productoId: 9, nombre: "Arroz (porción)", cantidad: 1, precio: 6, subtotal: 6 },
      { id: 3, lineaPadreId: null, productoId: 8, nombre: "Coca Cola 2L", cantidad: 1, precio: 18, subtotal: 18 },
    ],
  };

  it("del servidor: las hijas van debajo de su producto", () => {
    expect(lineasDePedidoPlataforma(PEDIDO)).toEqual([
      { nombre: "Brasa entero", cantidad: 2, subtotal: 224, agregados: [{ nombre: "Arroz (porción)", cantidad: 1, subtotal: 6, incluido: false }] },
      { nombre: "Coca Cola 2L", cantidad: 1, subtotal: 18 },
    ]);
  });

  it("del carrito (la cola sin señal): los toppings vienen por unidad y se escalan", () => {
    expect(
      lineasDelCarrito([
        {
          nombre: "Arroz con leche L",
          cantidad: 2,
          precio: 35,
          hijas: [
            { nombre: "Canela", cantidad: 1, subtotal: 0, incluido: true },
            { nombre: "Oreo", cantidad: 1, subtotal: 4, incluido: false },
          ],
        },
        { nombre: "Coca Cola 2L", cantidad: 1, precio: 18 },
      ]),
    ).toEqual([
      {
        nombre: "Arroz con leche L",
        cantidad: 2,
        subtotal: 70,
        agregados: [
          { nombre: "Canela", cantidad: 2, subtotal: 0, incluido: true },
          { nombre: "Oreo", cantidad: 2, subtotal: 8, incluido: false },
        ],
      },
      { nombre: "Coca Cola 2L", cantidad: 1, subtotal: 18 },
    ]);
  });

  const CARRITO = [
    { nombre: "Brasa entero", cantidad: 2, precio: 112, hijas: [{ nombre: "Arroz (porción)", cantidad: 1, subtotal: 3, incluido: false }] },
    { nombre: "Coca Cola 2L", cantidad: 1, precio: 18 },
  ];

  it("registrado: lo que guardó el servidor (hora, total, quién y local)", () => {
    const p = pedidoParaImprimir({ plataforma: "YANGO", pedido: PEDIDO, carrito: CARRITO, sede: "Otra", atendio: "Cajera" });
    expect(p).toMatchObject({ encolado: false, fecha: PEDIDO.fecha, total: 248, atendio: "Admin Demo", sede: "Principal", codigoExterno: "A-123" });
    expect(p.lineas).toEqual(lineasDePedidoPlataforma(PEDIDO));
  });

  it("en la cola sin señal: se imprime con lo que se cargó, la hora del equipo y quien está en la caja", () => {
    const p = pedidoParaImprimir({
      plataforma: "YANGO",
      codigoExterno: "12345",
      pedido: null,
      carrito: CARRITO,
      sede: "Principal",
      atendio: "Admin Demo",
      ahora: LAS_00_41,
    });
    expect(p).toMatchObject({ encolado: true, codigoExterno: "12345", atendio: "Admin Demo", sede: "Principal", total: 248 });
    // El mismo papel que el del servidor: el arroz de cada brasa (1 por unidad) suma 2, como lo guarda el backend.
    expect(lineasTicketPlataforma({ ...p, negocio: "Nombre del negocio" })).toEqual(
      lineasTicketPlataforma(EJEMPLO).map((r) => (r.includes("Arroz") ? fila("  + 2 x Arroz (porción)", "6.00") : r)),
    );
  });

  it("si el servidor no devolvió las líneas, salen las del carrito con su total", () => {
    const p = pedidoParaImprimir({ plataforma: "YANGO", pedido: { ...PEDIDO, detalles: [] }, carrito: CARRITO, sede: null, atendio: null });
    expect(p.encolado).toBe(false);
    expect(p.lineas).toEqual(lineasDelCarrito(CARRITO));
    expect(p.total).toBe(248);
  });
});
