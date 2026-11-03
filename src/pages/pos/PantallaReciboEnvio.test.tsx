import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cuerpoEncolado, reciboLocal } from "../../lib/offline/ventas";
import type { Producto, TipoPedido, Venta } from "../../types";

/**
 * El ticket de un pedido con envío (BUG-pedidos-11, BUG-cobro-5).
 *
 * El backend guarda en `total` sólo lo de los productos y la tarifa aparte
 * (`tarifaEnvio`). El ticket pintaba TOTAL = `total`, así que salía "Subtotal
 * 50 · Envío 8 · TOTAL 50", y el de la misma venta hecha sin internet sí
 * sumaba el envío: dos papeles distintos para la misma venta.
 */

const sesion = vi.hoisted(() => ({ rubro: "RESTAURANTE" }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { nombre: "Pollos Omar" },
    rubro: sesion.rubro,
    incluye: () => false,
  }),
}));

import PantallaRecibo from "./PantallaRecibo";

/** Un delivery cobrado en caja: Bs 50 de productos, Bs 8 de envío. */
function deliveryCobradoEnCaja(datos: Partial<Venta> = {}): Venta {
  return {
    id: 31,
    comprobante: "V-000031",
    estado: "APROBADO",
    fecha: "2026-10-29T20:00:00.000Z",
    total: 50,
    detalles: [
      { productoId: 1, producto: "Brasa cuarto", cantidad: 2, precio: 25, subtotal: 50, nota: null, consumo: "LLEVAR" },
    ],
    pagos: [{ formaPagoId: 1, formaPago: "Efectivo", monto: 50, recibido: 50, entregado: 0 }],
    formasPago: ["Efectivo"],
    tipoPedido: "DELIVERY",
    estadoEntrega: "PENDIENTE",
    prepagado: true,
    clienteNombre: "Lucía Fernández",
    clienteDireccion: "Calle Jordán 123",
    clienteTelefono: "70490686",
    tarifaEnvio: 8,
    totalACobrar: 8,
    montoRendicion: 0,
    minutosEstimados: null,
    notaPedido: null,
    entregadoEn: null,
    ...datos,
  } as Venta;
}

function dibujar(v: Venta) {
  return render(<PantallaRecibo venta={v} onNuevaVenta={() => {}} onHistorial={() => {}} />);
}

beforeEach(() => {
  sesion.rubro = "RESTAURANTE";
});

/** El renglón de totales del ticket, por su etiqueta. */
function fila(etiqueta: string) {
  return screen.getByText(etiqueta, { selector: "dt" }).parentElement!;
}

describe("BUG-pedidos-11 / BUG-cobro-5: Subtotal + Envío = TOTAL", () => {
  it("un delivery cobrado en caja suma el envío al TOTAL", () => {
    dibujar(deliveryCobradoEnCaja());
    expect(fila("Subtotal")).toHaveTextContent(/Bs.50,00/);
    expect(fila("Envío")).toHaveTextContent(/Bs.8,00/);
    expect(fila("TOTAL")).toHaveTextContent(/Bs.58,00/);
    // Lo pagado en la caja son los 50: el papel dice a quién se le pagan los 8.
    expect(screen.getByText("El envío lo cobra el repartidor.")).toBeInTheDocument();
  });

  it("un pedido contra entrega, desde «Ver comprobante», también", () => {
    dibujar(deliveryCobradoEnCaja({ prepagado: false, pagos: [], formasPago: [], totalACobrar: 58, montoRendicion: 50 }));
    expect(fila("TOTAL")).toHaveTextContent(/Bs.58,00/);
  });

  it("con un descuento, Subtotal − descuento + Envío = TOTAL", () => {
    dibujar(
      deliveryCobradoEnCaja({
        total: 40,
        subtotal: 50,
        descuentoTotal: 10,
        descuentos: [{ nombre: "Martes de brasa", codigo: null, monto: 10 }],
        pagos: [{ formaPagoId: 1, formaPago: "Efectivo", monto: 40, recibido: 40, entregado: 0 }],
      }),
    );
    expect(fila("Subtotal")).toHaveTextContent(/Bs.50,00/);
    expect(fila("TOTAL")).toHaveTextContent(/Bs.48,00/);
  });

  it.each(["RESTAURANTE", "FARMACIA", "PELUQUERIA"])(
    "una venta de mostrador (%s) no cambia: TOTAL es lo cobrado y no hay envío",
    (rubro) => {
      // Guarda del código compartido: el ticket es el mismo para todos los
      // rubros, y sin envío tiene que salir exactamente como antes.
      sesion.rubro = rubro;
      dibujar(deliveryCobradoEnCaja({ tipoPedido: "LOCAL", tarifaEnvio: 0, estadoEntrega: null }));
      expect(fila("TOTAL")).toHaveTextContent(/Bs.50,00/);
      expect(screen.queryByText("Envío", { selector: "dt" })).not.toBeInTheDocument();
      expect(screen.queryByText("El envío lo cobra el repartidor.")).not.toBeInTheDocument();
    },
  );

  it("el ticket sin internet dice el mismo TOTAL que el del servidor", () => {
    // El recibo local sumaba la tarifa a `total` y el del servidor no: la
    // misma venta daba Bs 58 en un papel y Bs 50 en el otro.
    const productos = [{ id: 1, nombre: "Brasa cuarto", precio: 25 }] as unknown as Producto[];
    const local = reciboLocal(
      cuerpoEncolado({
        clienteRequestId: "req-1",
        detalles: [{ productoId: 1, cantidad: 2, precio: 25, consumo: "LLEVAR" }],
        pagos: [{ formaPagoId: 1, monto: 50, recibido: 50 }],
        tipoPedido: "DELIVERY",
        clienteNombre: "Lucía Fernández",
        clienteDireccion: "Calle Jordán 123",
        repartidorId: 3,
        tarifaEnvio: 8,
        prepagado: true,
      }),
      { productos, formasPago: [{ id: 1, nombre: "Efectivo" }] },
    );
    // Como el servidor: `total` es lo de los productos y la tarifa va aparte.
    expect(local.total).toBe(50);
    expect(local.tarifaEnvio).toBe(8);
    dibujar(local);
    expect(fila("Subtotal")).toHaveTextContent(/Bs.50,00/);
    expect(fila("TOTAL")).toHaveTextContent(/Bs.58,00/);
  });
});

describe("BUG-cobro-5: el ticket sin internet dice lo que se cobra al entregar", () => {
  const productos = [{ id: 1, nombre: "Brasa cuarto", precio: 25 }] as unknown as Producto[];

  /** Un pedido de Bs 50 (dos cuartos), cargado sin señal. */
  function sinSenal(datos: { tipoPedido: TipoPedido; prepagado: boolean; tarifaEnvio?: number }) {
    return reciboLocal(
      cuerpoEncolado({
        clienteRequestId: "req-2",
        detalles: [{ productoId: 1, cantidad: 2, precio: 25, consumo: "LLEVAR" }],
        ...(datos.prepagado ? { pagos: [{ formaPagoId: 1, monto: 50, recibido: 50 }] } : {}),
        clienteNombre: "Lucía Fernández",
        ...datos,
      }),
      { productos, formasPago: [{ id: 1, nombre: "Efectivo" }] },
    );
  }

  it("un delivery contra entrega: a cobrar, productos más envío; a rendir, sin el envío", () => {
    // Con el envío fuera de `total` y sin `totalACobrar`, la pantalla del
    // pedido caía en `total`: "A cobrar al entregar Bs 50" debajo de "Envío Bs 8".
    const r = sinSenal({ tipoPedido: "DELIVERY", prepagado: false, tarifaEnvio: 8 });
    expect(r.total).toBe(50);
    expect(r.totalACobrar).toBe(58);
    expect(r.montoRendicion).toBe(50);
  });

  it("un delivery cobrado en caja: al entregar se cobra sólo el envío y no hay nada que rendir", () => {
    const r = sinSenal({ tipoPedido: "DELIVERY", prepagado: true, tarifaEnvio: 8 });
    expect(r.totalACobrar).toBe(8);
    expect(r.montoRendicion).toBe(0);
  });

  it("para recoger sin pagar: se cobra lo de los productos, sin envío", () => {
    const r = sinSenal({ tipoPedido: "RECOGER", prepagado: false });
    expect(r.totalACobrar).toBe(50);
    expect(r.montoRendicion).toBe(50);
  });

  it("una venta de mostrador queda en cero, como la manda el servidor", () => {
    // Guarda del código compartido: el ticket local de cualquier rubro.
    const r = sinSenal({ tipoPedido: "LOCAL", prepagado: true });
    expect(r.totalACobrar).toBe(0);
    expect(r.montoRendicion).toBe(0);
    expect(r.total).toBe(50);
  });
});
