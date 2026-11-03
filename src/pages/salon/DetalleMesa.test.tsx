import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Comanda, Mesa } from "../../types/salon";

/**
 * La hoja de la mesa con "mesero cobra" prendido (BUG-salon-3 / SAL-02): el
 * botón Cobrar sólo cuando corresponde, como en la app. Las reglas finas viven
 * en `pieDeMesa` (y su test); acá, que la hoja las respete.
 */

const sesion = vi.hoisted(() => ({ sinPermisos: [] as string[] }));

vi.mock("../../store/AuthContext", async () => {
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      negocio: { id: 1, nombre: "Resto Bar", tipoNegocio: "RESTAURANTE", features: [] },
      usuario: { id: 7, username: "carla", rol: "MESERO", ...permisosDe("MESERO", { sin: sesion.sinPermisos }) },
    }),
  };
});

vi.mock("../../lib/api", () => ({
  api: {
    pedirCuentaMesa: vi.fn(),
    liberarMesa: vi.fn(),
    marcarComandaServida: vi.fn(),
  },
}));

import DetalleMesa from "./DetalleMesa";

function comanda(p: Partial<Comanda> = {}): Comanda {
  return {
    id: 1,
    estado: "SERVIDA",
    enviadaEn: "2026-10-28T20:00:00.000Z",
    items: [{ id: 1, productoId: 1, nombre: "Brasa cuarto", cantidad: 2, precio: 26 }],
    ...p,
  };
}

function mesa(p: Partial<Mesa> = {}): Mesa {
  return {
    id: 1,
    codigo: "M1",
    nombre: "Mesa M1",
    zonaCodigo: "salon",
    zonaNombre: "Salón",
    capacidad: 4,
    capacidadTotal: 4,
    unidas: [],
    activa: true,
    estado: "OCUPADA",
    meseroId: 7,
    meseroNombre: "Carla",
    comensales: 2,
    consumo: 52,
    propina: 0,
    comandas: [comanda()],
    ...p,
  };
}

function montar(m: Mesa, extra: { aviso?: string; abrirRecibo?: boolean } = {}) {
  const onCobrarMesa = vi.fn();
  render(
    <DetalleMesa
      mesa={m}
      mesasDelSalon={[m]}
      onCerrar={() => {}}
      onCambio={() => {}}
      onAgregarPedido={() => {}}
      onAbrirMesa={() => {}}
      onCobrarMesa={onCobrarMesa}
      {...extra}
    />,
  );
  return onCobrarMesa;
}

const botonCobrar = () => screen.queryByRole("button", { name: /^Cobrar Bs/ });

beforeEach(() => {
  sesion.sinPermisos = [];
});

describe("Cobrar en la hoja de la mesa", () => {
  it("BUG-salon-3: en una mesa pagada no ofrece Cobrar, y liberar es el botón principal", () => {
    // Aparecía en TODA mesa pagada: "Cobrar Bs 52" grande, que el backend
    // rechazaba ("la mesa ya se cobró"), y "Levantar y liberar" de segundo.
    montar(mesa({ estado: "PAGADA" }));
    expect(botonCobrar()).not.toBeInTheDocument();
    expect(screen.getByText("El cliente ya pagó Bs 52,00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Levantar y liberar la mesa" })).toBeInTheDocument();
  });

  it("su mesa con todo servido: Cobrar abre el cobro de esa mesa", () => {
    const m = mesa();
    const onCobrarMesa = montar(m);
    fireEvent.click(screen.getByRole("button", { name: /^Cobrar Bs\s52,00$/ }));
    expect(onCobrarMesa).toHaveBeenCalledWith(m);
  });

  it("la mesa de otro mesero no se cobra, y la hoja dice quién la atiende", () => {
    montar(mesa({ meseroId: 3, meseroNombre: "Luis" }));
    expect(botonCobrar()).not.toBeInTheDocument();
    expect(
      screen.getByText("Esta mesa la atiende Luis. Sólo puede cobrarla quien la atendió, o la caja."),
    ).toBeInTheDocument();
  });

  it("con platos sin servir no hay Cobrar", () => {
    montar(mesa({ comandas: [comanda({ estado: "ENVIADA" })] }));
    expect(botonCobrar()).not.toBeInTheDocument();
  });

  it("sin el permiso salon.cobrar_mesero no hay Cobrar, aunque el negocio lo habilite", () => {
    sesion.sinPermisos = ["salon.cobrar_mesero"];
    montar(mesa());
    expect(botonCobrar()).not.toBeInTheDocument();
  });
});

describe("después de cobrar o de un cobro frenado", () => {
  it("recién cobrada, abre sola el recibo para dárselo al cliente", () => {
    montar(
      mesa({
        estado: "PAGADA",
        cobro: {
          fecha: "2026-10-28T22:00:00.000Z",
          total: 52,
          pagos: [{ formaPago: "Efectivo", monto: 52, recibido: 60, entregado: 8 }],
        },
      }),
      { abrirRecibo: true },
    );
    expect(screen.getByRole("dialog", { name: "Recibo" })).toBeInTheDocument();
  });

  it("si la cuenta cambió mientras se cobraba, el aviso queda a la vista", () => {
    const aviso = "La cuenta de M1 cambió mientras cobrabas: ahora son Bs 72,00. Revisala con el cliente antes de cobrar.";
    montar(mesa({ consumo: 72 }), { aviso });
    expect(screen.getByRole("alert")).toHaveTextContent(aviso);
  });
});
