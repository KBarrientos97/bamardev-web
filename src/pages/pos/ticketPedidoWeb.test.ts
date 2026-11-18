import { describe, expect, it } from "vitest";
import type { PedidoWeb } from "../../lib/pedidosWeb/tipos";
import {
  datosDePedidoWeb,
  lineasTicketPedidoWeb,
  textoPagoPedidoWeb,
  textoTicketPedidoWeb,
  type DatosTicketPedidoWeb,
} from "./ticketPedidoWeb";

/**
 * El ticket del pedido web («Imprimir pedido», CONTRATO-DELIVERY-FULL-18NOV
 * §9). El primer caso es el ejemplo del contrato, letra por letra: la app
 * (Android) tiene que dar exactamente el mismo texto.
 */

const LAS_00_41 = new Date(2026, 10, 18, 0, 41);

const EJEMPLO: DatosTicketPedidoWeb = {
  negocio: "Nombre del negocio",
  sede: "Principal",
  numero: 7,
  tipo: "DELIVERY",
  fecha: LAS_00_41,
  cliente: "Carla Mamani",
  telefono: "70000000",
  direccion: "Calle Sucre 450",
  referencia: "Portón negro",
  repartidor: "Pedro Rojas",
  lineas: [
    { nombre: "Brasa entero", cantidad: 2, subtotal: 224 },
    { nombre: "Coca Cola 2L", cantidad: 1, subtotal: 18 },
  ],
  nota: "sin ají",
  productos: 242,
  envio: 7,
  total: 249,
  formaPago: "EFECTIVO",
  pagaCon: 300,
};

const RAYA = "-".repeat(32);

describe("ticket del pedido web", () => {
  it("el ejemplo del contrato, letra por letra", () => {
    expect(lineasTicketPedidoWeb(EJEMPLO)).toEqual([
      "       NOMBRE DEL NEGOCIO",
      // Centrado: (32 - 9) / 2 = 11,5 → 11 espacios adelante (el dibujo del contrato muestra 10, a ojo).
      " ".repeat(11) + "Principal",
      RAYA,
      "PEDIDO WEB N° 07 - DELIVERY",
      "18/11/2026 00:41",
      RAYA,
      "Cliente: Carla Mamani",
      "Tel: 70000000",
      "Dir: Calle Sucre 450",
      "Ref: Portón negro",
      "Repartidor: Pedro Rojas",
      RAYA,
      "2 x Brasa entero          224.00",
      "1 x Coca Cola 2L           18.00",
      "Nota: sin ají",
      RAYA,
      "Productos              Bs 242.00",
      "Envío                    Bs 7.00",
      "TOTAL A COBRAR         Bs 249.00",
      "Paga con Bs 300 - cambio Bs 51",
      RAYA,
    ]);
    expect(Math.max(...textoTicketPedidoWeb(EJEMPLO).split("\n").map((l) => l.length))).toBeLessThanOrEqual(32);
  });

  it("sin dirección: «Dir: Ubicación en el mapa», en un solo renglón (la frase de las pantallas no entraba)", () => {
    const l = lineasTicketPedidoWeb({ ...EJEMPLO, direccion: null, referencia: null });
    expect(l).toContain("Dir: Ubicación en el mapa");
    expect(l).not.toContain("mapa");
    expect(l.join("\n")).not.toContain("Ref:");
    expect(lineasTicketPedidoWeb({ ...EJEMPLO, direccion: "   " })).toContain("Dir: Ubicación en el mapa");
  });

  it("regla 8 · para recoger: sin dirección, referencia, repartidor ni envío, aunque vengan", () => {
    const l = lineasTicketPedidoWeb({
      ...EJEMPLO,
      tipo: "RECOGER",
      direccion: "Calle Sucre 450",
      referencia: "Portón negro",
      repartidor: "Pedro Rojas",
      envio: 7,
      total: 242,
      formaPago: "QR",
      pagaCon: null,
      sede: null,
    });
    expect(l).toEqual([
      "       NOMBRE DEL NEGOCIO",
      RAYA,
      "PEDIDO WEB N° 07 - RECOGER",
      "18/11/2026 00:41",
      RAYA,
      "Cliente: Carla Mamani",
      "Tel: 70000000",
      RAYA,
      "2 x Brasa entero          224.00",
      "1 x Coca Cola 2L           18.00",
      "Nota: sin ají",
      RAYA,
      "Productos              Bs 242.00",
      "TOTAL A COBRAR         Bs 242.00",
      "Paga por QR",
      RAYA,
    ]);
  });

  it("regla 7 · cómo paga, con la plata corta", () => {
    expect(textoPagoPedidoWeb("QR", 300, 249)).toBe("Paga por QR");
    expect(textoPagoPedidoWeb("EFECTIVO", null, 249)).toBe("Paga en efectivo");
    expect(textoPagoPedidoWeb("EFECTIVO", 300, 249)).toBe("Paga con Bs 300 - cambio Bs 51");
    expect(textoPagoPedidoWeb("EFECTIVO", 200, 100.5)).toBe("Paga con Bs 200 - cambio Bs 99.50");
    // Justo: no hay cambio que llevar, y se dice así (no «cambio Bs 0»). Android imprime lo mismo.
    expect(textoPagoPedidoWeb("EFECTIVO", 249, 249)).toBe("Paga con Bs 249 - justo");
    // La caja subió el envío al aceptar y el billete ya no alcanza; o no se sabe el total.
    expect(textoPagoPedidoWeb("EFECTIVO", 240, 249)).toBe("Paga con Bs 240");
    expect(textoPagoPedidoWeb("EFECTIVO", 300, null)).toBe("Paga con Bs 300");
  });

  it("regla 9 · el teléfono tal cual llega, la fecha de creación y el N° con dos dígitos", () => {
    const l = lineasTicketPedidoWeb({ ...EJEMPLO, numero: 112, telefono: "+591 70000000", fecha: new Date(2026, 0, 5, 9, 7) });
    expect(l).toContain("PEDIDO WEB N° 112 - DELIVERY");
    expect(l).toContain("Tel: +591 70000000");
    expect(l).toContain("05/01/2026 09:07");
    expect(lineasTicketPedidoWeb({ ...EJEMPLO, numero: 3 })).toContain("PEDIDO WEB N° 03 - DELIVERY");
  });

  it("una nota con saltos de línea queda en renglones de 32, sin romper las columnas", () => {
    const l = lineasTicketPedidoWeb({ ...EJEMPLO, nota: "sin ají\nsin cebolla y con mucha llajua aparte por favor" });
    expect(l).toContain("Nota: sin ají sin cebolla y con");
    expect(l).toContain("mucha llajua aparte por favor");
    expect(Math.max(...l.map((x) => x.length))).toBeLessThanOrEqual(32);
  });
});

describe("del pedido de la bandeja al ticket", () => {
  const PEDIDO: PedidoWeb = {
    id: 40,
    numero: 7,
    estado: "ACEPTADO",
    tipo: "DELIVERY",
    almacenId: 3,
    sucursal: "Principal",
    nombre: "Carla Mamani",
    telefono: "70000000",
    direccion: null,
    referencia: "Portón negro",
    nota: "sin ají",
    latitud: -17.78,
    longitud: -63.18,
    precisionM: 10,
    distanciaKm: 1.4,
    formaPago: "EFECTIVO",
    pagaCon: 300,
    subtotal: 242,
    envioSugerido: 9,
    envio: 7,
    total: 249,
    lineas: [
      { id: 1, titulo: "Brasa entero", cantidad: 2, precio: 112, subtotal: 224 },
      { id: 2, titulo: "Llajua", cantidad: 2, precio: 0, subtotal: 0, lineaPadreId: 1, incluido: true },
      { id: 3, titulo: "Coca Cola 2L", cantidad: 1, precio: 18, subtotal: 18 },
    ],
    motivoRechazo: null,
    ventaId: 900,
    repartidor: { id: 129, nombre: "Pedro Rojas" },
    creadoEn: "2026-11-18T04:41:00.000Z",
    aceptadoEn: "2026-11-18T04:43:00.000Z",
    salioEn: null,
  };

  it("el envío confirmado al aceptar, el total con él, el repartidor y los toppings debajo", () => {
    const d = datosDePedidoWeb(PEDIDO);
    expect(d).toMatchObject({ numero: 7, cliente: "Carla Mamani", direccion: null, envio: 7, total: 249, productos: 242, repartidor: "Pedro Rojas" });
    const l = lineasTicketPedidoWeb({ ...d, negocio: "Nombre del negocio" });
    expect(l).toContain("Dir: Ubicación en el mapa");
    expect(l).toContain("  + 2 x Llajua");
    expect(l).toContain("Paga con Bs 300 - cambio Bs 51");
  });

  it("todavía nuevo: el envío sugerido", () => {
    const d = datosDePedidoWeb({ ...PEDIDO, estado: "NUEVO", envio: undefined, total: undefined, repartidor: null });
    expect(d).toMatchObject({ envio: 9, total: 251, repartidor: null });
  });

  it("para recoger no lleva dirección ni envío", () => {
    const d = datosDePedidoWeb({ ...PEDIDO, tipo: "RECOGER", direccion: "Calle 1", total: 242 });
    expect(d).toMatchObject({ direccion: null, referencia: null, envio: null, total: 242 });
  });
});
