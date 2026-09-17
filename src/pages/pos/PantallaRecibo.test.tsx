import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Feature, Venta } from "../../types";

/**
 * La "M" (mesa) y "LL" (llevar) al lado de cada producto del ticket.
 *
 * En bamardev-restaurant las marcas dependen SÓLO de que el pedido sea en el
 * local, como antes de que existiera el rubro farmacia: si el panel le saca
 * `mesa_llevar` a un restaurante, su ticket no puede cambiar por eso. En una
 * farmacia no hay mesas, así que ahí no salen nunca.
 */

const sesion = vi.hoisted(() => ({
  rubro: "RESTAURANTE" as string | undefined,
  features: [] as string[],
}));

vi.mock("../../store/AuthContext", async () => {
  const { puede } = await import("../../lib/permisos");
  return {
    useAuth: () => ({
      negocio: { nombre: "Negocio de prueba" },
      rubro: sesion.rubro,
      incluye: (c: Parameters<typeof puede>[1]) =>
        puede(
          { rol: "ADMIN", modulos: [], features: sesion.features as Feature[], rubro: sesion.rubro },
          c,
        ),
    }),
  };
});

import PantallaRecibo from "./PantallaRecibo";

function venta(datos: Partial<Venta> = {}): Venta {
  return {
    id: 7,
    comprobante: "T-0007",
    estado: "APROBADO",
    fecha: "2026-09-16T12:00:00",
    total: 80,
    detalles: [
      {
        productoId: 1,
        producto: "Pollo entero",
        cantidad: 1,
        precio: 60,
        subtotal: 60,
        nota: null,
        consumo: "MESA",
      },
      {
        productoId: 2,
        producto: "Gaseosa 2L",
        cantidad: 1,
        precio: 20,
        subtotal: 20,
        nota: null,
        consumo: "LLEVAR",
      },
    ],
    pagos: [],
    formasPago: [],
    tipoPedido: "LOCAL",
    estadoEntrega: null,
    prepagado: false,
    clienteNombre: null,
    clienteDireccion: null,
    clienteTelefono: null,
    tarifaEnvio: 0,
    minutosEstimados: null,
    notaPedido: null,
    entregadoEn: null,
    ...datos,
  } as Venta;
}

function dibujar(v: Venta) {
  render(<PantallaRecibo venta={v} onNuevaVenta={() => {}} onHistorial={() => {}} />);
}

beforeEach(() => {
  sesion.features = [];
});

describe("bamardev-restaurant: marcas de mesa y llevar en el ticket", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("un pedido en el local marca cada producto", () => {
    dibujar(venta());
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("LL")).toBeInTheDocument();
  });

  it("las marcas no dependen de que el plan traiga mesa_llevar", () => {
    sesion.features = ["pos", "caja"];
    dibujar(venta());
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("LL")).toBeInTheDocument();
  });

  it("un delivery no lleva marcas", () => {
    dibujar(venta({ tipoPedido: "DELIVERY" }));
    expect(screen.queryByText("M")).not.toBeInTheDocument();
  });
});

describe("farmacia: sin mesas, sin marcas", () => {
  it("un pedido en el local no marca nada", () => {
    sesion.rubro = "FARMACIA";
    dibujar(venta());
    expect(screen.queryByText("M")).not.toBeInTheDocument();
    expect(screen.queryByText("LL")).not.toBeInTheDocument();
  });
});
