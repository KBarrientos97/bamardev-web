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

describe("belleza: un corte no se sirve en mesa (QA M-09)", () => {
  it.each(["PELUQUERIA", "BARBERIA", "SPA", "UNAS"])("%s: el ticket no marca M ni LL", (rubro) => {
    sesion.rubro = rubro;
    dibujar(venta());
    expect(screen.queryByText("M")).not.toBeInTheDocument();
    expect(screen.queryByText("LL")).not.toBeInTheDocument();
  });
});

describe("bamardev-restaurant: la mesa y quién la atendió", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("cobrando una mesa dice la mesa y quién la atendió", () => {
    // Visto en QA: la caja cobraba M3 y el ticket salía como uno de
    // mostrador, sin mesa ni mesero.
    dibujar(
      venta({
        cajero: "Administrador",
        mesa: "M3",
        mesaNombre: "Mesa M3",
        mesero: "Mesero Auditoria",
      }),
    );
    expect(screen.getByText("Mesa:")).toBeInTheDocument();
    expect(screen.getByText("M3")).toBeInTheDocument();
    expect(screen.getByText("Atendió:")).toBeInTheDocument();
    expect(screen.getByText("Mesero Auditoria")).toBeInTheDocument();
    // El que cobró sigue siendo otro dato.
    expect(screen.getByText("Administrador")).toBeInTheDocument();
  });

  it("una venta de mostrador no inventa mesa ni mesero", () => {
    dibujar(venta({ cajero: "Administrador" }));
    expect(screen.queryByText("Mesa:")).not.toBeInTheDocument();
    expect(screen.queryByText("Atendió:")).not.toBeInTheDocument();
  });
});

describe("belleza: profesional y paquetes en el ticket (07-oct)", () => {
  beforeEach(() => {
    sesion.rubro = "PELUQUERIA";
    sesion.features = [];
  });

  const linea = (extra: Partial<NonNullable<Venta["detalles"]>[number]>) => ({
    productoId: 9,
    producto: "Corte",
    cantidad: 1,
    precio: 0,
    subtotal: 0,
    nota: null,
    consumo: "LLEVAR" as const,
    ...extra,
  });

  it("la sesión de un paquete dice cuál fue y cuántas quedan, y quién la hizo", () => {
    dibujar(
      venta({
        total: 0,
        detalles: [
          linea({
            recursoId: 3,
            recurso: "Carla",
            paquete: {
              tipo: "SESION",
              paqueteClienteId: 1,
              nombre: "10 masajes",
              desde: 3,
              hasta: 3,
              sesiones: 10,
              restantes: 7,
              ultimoDia: "2027-01-05",
              texto: "Sesión 3 de 10 · quedan 7",
            },
          }),
        ],
      }),
    );
    expect(screen.getByText("10 masajes: Sesión 3 de 10 · quedan 7")).toBeInTheDocument();
    expect(screen.getByText("Atendió: Carla")).toBeInTheDocument();
  });

  it("la venta del paquete dice cuántas sesiones trae y hasta cuándo vale", () => {
    dibujar(
      venta({
        total: 120,
        detalles: [
          linea({
            producto: "3 cortes",
            precio: 120,
            subtotal: 120,
            paquete: {
              tipo: "COMPRA",
              paqueteClienteId: 1,
              nombre: "3 cortes",
              sesiones: 3,
              items: [{ servicio: "Corte", sesiones: 3 }],
              ultimoDia: "2027-01-05",
              estado: "ACTIVO",
              texto: "3 sesiones · vale hasta el 05/01/2027",
            },
          }),
        ],
      }),
    );
    expect(screen.getByText("3 sesiones · vale hasta el 05/01/2027")).toBeInTheDocument();
  });

  it("sin profesional ni paquete, el renglón de siempre", () => {
    dibujar(venta({ detalles: [linea({ precio: 50, subtotal: 50 })], total: 50 }));
    expect(screen.queryByText(/Atendió: /)).not.toBeInTheDocument();
    expect(screen.queryByText(/sesi/i)).not.toBeInTheDocument();
  });
});
