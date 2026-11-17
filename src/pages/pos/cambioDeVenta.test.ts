import { describe, expect, it } from "vitest";
import type { FormaPago, Producto, Venta } from "../../types";
import {
  cambioDeProductos,
  catalogoParaModificar,
  diferenciaDelCambio,
  hayCambios,
  lineasDeVenta,
  mediosDeDevolucion,
  medioDeLaPlata,
  motivoNoModificable,
  plataDelCambio,
  recordatorioDeLaPlata,
  rubroModificaVentas,
  textoDelMotivo,
} from "./cambioDeVenta";

/**
 * Modificar una venta ya cobrada (15-nov): el cuarto broaster y la Coca de 3
 * litros que el cliente cambia por el cuarto a la brasa y la de 2 litros.
 */

const producto = (id: number, nombre: string, precio: number, extra: Partial<Producto> = {}): Producto =>
  ({
    id,
    nombre,
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio,
    costo: 0,
    stockMinimo: 0,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 10,
    componentes: [],
    ...extra,
  }) as Producto;

const BROASTER = producto(1, "Broaster cuarto", 28, { tipoProducto: "SERVICIO", stockTotal: 0 });
const COCA3 = producto(2, "Coca Cola 3L", 23, { stockTotal: 9 });
const BRASA = producto(3, "Brasa cuarto", 30, { tipoProducto: "SERVICIO", stockTotal: 0 });
const COCA2 = producto(4, "Coca Cola 2L", 18);
const CATALOGO = [BROASTER, COCA3, BRASA, COCA2];

const venta = (extra: Partial<Venta> = {}): Venta =>
  ({
    id: 7,
    comprobante: "V-000007",
    estado: "APROBADO",
    fecha: "2026-11-15T15:56:00Z",
    cajaId: 3,
    total: 51,
    detalles: [
      { productoId: 1, producto: "Broaster cuarto", cantidad: 1, precio: 28, subtotal: 28, nota: null, consumo: "MESA" },
      { productoId: 2, producto: "Coca Cola 3L", cantidad: 1, precio: 23, subtotal: 23, nota: null, consumo: "MESA" },
    ],
    pagos: [{ formaPagoId: 1, formaPago: "Efectivo", monto: 51, recibido: 100, entregado: 49 }],
    tipoPedido: "LOCAL",
    estadoEntrega: null,
    prepagado: true,
    clienteNombre: null,
    clienteDireccion: null,
    clienteTelefono: null,
    tarifaEnvio: 0,
    minutosEstimados: null,
    notaPedido: null,
    entregadoEn: null,
    ...extra,
  }) as Venta;

const FORMAS = [
  { id: 1, nombre: "Efectivo" },
  { id: 2, nombre: "QR" },
] as FormaPago[];

describe("dónde se ofrece modificar", () => {
  it("en el restaurante y los comercios; no donde la venta lleva algo atado", () => {
    expect(rubroModificaVentas("RESTAURANTE")).toBe(true);
    expect(rubroModificaVentas("MINIMARKET")).toBe(true);
    expect(rubroModificaVentas("FERRETERIA")).toBe(true);
    expect(rubroModificaVentas(undefined)).toBe(true);
    expect(rubroModificaVentas("FARMACIA")).toBe(false);
    expect(rubroModificaVentas("PELUQUERIA")).toBe(false);
    expect(rubroModificaVentas("BILLAR")).toBe(false);
    expect(rubroModificaVentas("ACADEMIA")).toBe(false);
  });

  it("la venta de mostrador del turno abierto: sí", () => {
    expect(motivoNoModificable(venta(), 3)).toBeNull();
  });

  it("una anulada, una de otro turno o un pedido: no", () => {
    expect(motivoNoModificable(venta({ estado: "ANULADO" }), 3)).toMatch(/anulada/);
    // La caja abierta es otra: el turno de esa venta ya se cerró.
    expect(motivoNoModificable(venta(), 4)).toMatch(/turno abierto/);
    expect(motivoNoModificable(venta(), null)).toMatch(/turno abierto/);
    expect(motivoNoModificable(venta({ cajaId: undefined }), 3)).toMatch(/turno abierto/);
    expect(motivoNoModificable(venta({ tipoPedido: "RECOGER" }), 3)).toMatch(/pedido/);
    expect(motivoNoModificable(venta({ pendienteSync: true }), 3)).toMatch(/no subió/);
  });

  it("lo que tiene algo atado: no", () => {
    expect(motivoNoModificable(venta({ credito: { id: 1 } as Venta["credito"] }), 3)).toMatch(/crédito/);
    expect(motivoNoModificable(venta({ mesa: "M1" }), 3)).toMatch(/mesa/);
    expect(motivoNoModificable(venta({ citaId: 9 }), 3)).toMatch(/cita/);
    expect(motivoNoModificable(venta({ descuentoTotal: 5 }), 3)).toMatch(/descuento/);
    expect(motivoNoModificable(venta({ cuotas: [{}] as Venta["cuotas"] }), 3)).toMatch(/cuotas/);
    expect(
      motivoNoModificable(venta({ propinas: [{ recursoId: 1, recurso: "Ana", monto: 5, formaPago: "Efectivo" }] }), 3),
    ).toMatch(/vales o propinas/);
    const conProfesional = venta();
    conProfesional.detalles![0].recursoId = 4;
    expect(motivoNoModificable(conProfesional, 3)).toMatch(/profesional/);
  });

  it("con toppings: no, y dice lo mismo que el backend", () => {
    // PLAN-AGREGADOS §7.3: en F1 el servidor da 400; la web ni ofrece el botón.
    const conToppings = venta();
    conToppings.detalles![0].id = 501;
    conToppings.detalles!.push({
      id: 502,
      lineaPadreId: 501,
      incluido: true,
      productoId: 9,
      producto: "Oreo",
      cantidad: 1,
      precio: 0,
      subtotal: 0,
      nota: null,
      consumo: "LLEVAR",
    });
    expect(motivoNoModificable(conToppings, 3)).toBe("Esta venta tiene toppings: anulala y cargala de nuevo.");
  });
});

describe("el carrito con el que arranca el cambio", () => {
  it("lo que ya está en la venta sigue a su precio y recupera sus unidades en el estante", () => {
    // El dueño subió la Coca de 3 a Bs 25 después de la venta: para ESTA venta sigue a 23.
    const catalogo = catalogoParaModificar([BROASTER, { ...COCA3, precio: 25 }, BRASA, COCA2], venta());
    const coca3 = catalogo.find((p) => p.id === 2)!;
    expect(coca3.precio).toBe(23);
    // Quedaban 9 y la venta ya lleva 1: dejarla no gasta stock.
    expect(coca3.stockTotal).toBe(10);
    // Lo que no estaba en la venta no cambia.
    expect(catalogo.find((p) => p.id === 4)).toEqual(COCA2);
  });

  it("un producto de la venta que ya no está en el catálogo se puede dejar o bajar, no subir", () => {
    const catalogo = catalogoParaModificar([BROASTER, BRASA, COCA2], venta());
    const coca3 = catalogo.find((p) => p.id === 2)!;
    expect(coca3).toMatchObject({ nombre: "Coca Cola 3L", precio: 23, habilitado: false, stockTotal: 1 });
  });

  it("una línea por producto, con su reparto mesa/llevar y su nota", () => {
    const v = venta({
      detalles: [
        { productoId: 2, producto: "Coca Cola 3L", cantidad: 2, precio: 23, subtotal: 46, nota: "fría", consumo: "MESA" },
        { productoId: 2, producto: "Coca Cola 3L", cantidad: 1, precio: 23, subtotal: 23, nota: "fría", consumo: "LLEVAR" },
        { productoId: 1, producto: "Broaster cuarto", cantidad: 1, precio: 28, subtotal: 28, nota: null, consumo: "LLEVAR" },
      ],
    });
    const lineas = lineasDeVenta(v, catalogoParaModificar(CATALOGO, v));
    expect(lineas.map((l) => [l.producto.id, l.cantidad, l.enMesa, l.nota])).toEqual([
      [2, 3, 2, "fría"],
      [1, 1, 0, ""],
    ]);
  });
});

describe("qué cambia", () => {
  it("no hay cambios si queda lo mismo, en el orden que sea", () => {
    expect(
      hayCambios(venta(), [
        { productoId: 2, cantidad: 1, consumo: "MESA" },
        { productoId: 1, cantidad: 1, consumo: "MESA" },
      ]),
    ).toBe(false);
  });

  it("cambia con otro producto, otra cantidad, mesa/llevar u otra nota", () => {
    const igual = [
      { productoId: 1, cantidad: 1, consumo: "MESA" as const },
      { productoId: 2, cantidad: 1, consumo: "MESA" as const },
    ];
    expect(hayCambios(venta(), [igual[0], { productoId: 4, cantidad: 1, consumo: "MESA" }])).toBe(true);
    expect(hayCambios(venta(), [igual[0], { ...igual[1], cantidad: 2 }])).toBe(true);
    expect(hayCambios(venta(), [igual[0], { ...igual[1], consumo: "LLEVAR" }])).toBe(true);
    expect(hayCambios(venta(), [igual[0], { ...igual[1], nota: "sin hielo" }])).toBe(true);
    expect(hayCambios(venta(), [igual[0]])).toBe(true);
  });

  it("dice qué sale y qué entra, producto por producto", () => {
    expect(
      cambioDeProductos(venta().detalles!, [
        { productoId: 3, producto: "Brasa cuarto", cantidad: 1 },
        { productoId: 4, producto: "Coca Cola 2L", cantidad: 2 },
      ]),
    ).toEqual({
      sale: [
        { producto: "Broaster cuarto", cantidad: 1 },
        { producto: "Coca Cola 3L", cantidad: 1 },
      ],
      entra: [
        { producto: "Brasa cuarto", cantidad: 1 },
        { producto: "Coca Cola 2L", cantidad: 2 },
      ],
    });
  });

  it("lo que sólo cambia de cantidad sale o entra por la diferencia", () => {
    expect(
      cambioDeProductos(venta().detalles!, [
        { productoId: 1, producto: "Broaster cuarto", cantidad: 1 },
        { productoId: 2, producto: "Coca Cola 3L", cantidad: 3 },
      ]),
    ).toEqual({ sale: [], entra: [{ producto: "Coca Cola 3L", cantidad: 2 }] });
  });
});

describe("la plata", () => {
  it("la diferencia: negativa se devuelve, positiva se cobra", () => {
    expect(diferenciaDelCambio(venta(), 48)).toBe(-3);
    expect(diferenciaDelCambio(venta(), 55)).toBe(4);
    expect(diferenciaDelCambio(venta(), 51)).toBe(0);
    // Sin residuos de punto flotante.
    expect(diferenciaDelCambio(venta({ total: 26.7 }), 3 * 8.9)).toBe(0);
  });

  it("una venta en efectivo se devuelve en efectivo", () => {
    expect(mediosDeDevolucion(venta(), FORMAS, 3)).toEqual([{ formaPagoId: 1, nombre: "Efectivo", saleDelCajon: true }]);
  });

  it("una venta por QR: primero el efectivo (lo que pasa en el mostrador), y también por QR", () => {
    const porQr = venta({ pagos: [{ formaPagoId: 2, formaPago: "QR", monto: 51 }] });
    expect(mediosDeDevolucion(porQr, FORMAS, 3)).toEqual([
      { formaPagoId: 1, nombre: "Efectivo", saleDelCajon: true },
      { formaPagoId: 2, nombre: "QR", saleDelCajon: false },
    ]);
  });

  it("por QR sólo si por ahí entró al menos lo que hay que devolver", () => {
    const mixta = venta({
      pagos: [
        { formaPagoId: 2, formaPago: "QR", monto: 2 },
        { formaPagoId: 1, formaPago: "Efectivo", monto: 49 },
      ],
    });
    expect(mediosDeDevolucion(mixta, FORMAS, 3).map((m) => m.nombre)).toEqual(["Efectivo"]);
    expect(mediosDeDevolucion(mixta, FORMAS, 2).map((m) => m.nombre)).toEqual(["Efectivo", "QR"]);
  });

  it("nunca a un vale", () => {
    const conVale = venta({ pagos: [{ formaPagoId: 9, formaPago: "Gift card", monto: 51 }] });
    expect(mediosDeDevolucion(conVale, FORMAS, 3).map((m) => m.nombre)).toEqual(["Efectivo"]);
  });

  it("en palabras: lo que pasó con la plata de un cambio", () => {
    expect(plataDelCambio({ diferencia: -3, pagos: [{ formaPago: "Efectivo" }] })).toBe(
      "se devolvieron Bs 3,00 en efectivo",
    );
    expect(plataDelCambio({ diferencia: 4, pagos: [{ formaPago: "QR" }] })).toBe("se cobraron Bs 4,00 más por QR");
    expect(plataDelCambio({ diferencia: 0, pagos: [] })).toBe("sin diferencia de plata");
    expect(medioDeLaPlata([{ formaPago: "QR" }, { formaPago: "Efectivo" }])).toBe("por QR y en efectivo");
  });

  it("el recordatorio para la cajera al terminar", () => {
    const efectivo = { formaPagoId: 1, nombre: "Efectivo", saleDelCajon: true };
    const qr = { formaPagoId: 2, nombre: "QR", saleDelCajon: false };
    expect(recordatorioDeLaPlata({ diferencia: -3, devolucion: efectivo })).toBe(
      "Devolvele Bs 3,00 al cliente en efectivo.",
    );
    expect(recordatorioDeLaPlata({ diferencia: -3, devolucion: qr })).toBe(
      "Devolvele Bs 3,00 al cliente por QR o transferencia: no salen de la caja.",
    );
    expect(recordatorioDeLaPlata({ diferencia: 4, devolucion: null })).toBe("El cliente pagó Bs 4,00 de diferencia.");
    expect(recordatorioDeLaPlata({ diferencia: 0, devolucion: null })).toMatch(/Sin diferencia/);
  });
});

describe("el motivo", () => {
  it("el elegido y, si hay, el detalle; con «Otro», sólo lo escrito", () => {
    expect(textoDelMotivo("El cliente cambió de idea", "")).toBe("El cliente cambió de idea");
    expect(textoDelMotivo("Producto agotado", " se acabó la de 3 ")).toBe("Producto agotado · se acabó la de 3");
    expect(textoDelMotivo("Otro", " se equivocó de mesa ")).toBe("se equivocó de mesa");
  });
});
