import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Mesa } from "../../types/salon";

/**
 * Lo que hace el panel cuando el mesero termina de cobrar (SAL-02) o el cobro
 * se frena porque la cuenta cambió (SAL-08). Las pantallas de adentro son de
 * mentira: lo que se prueba es a dónde lleva el panel y con qué.
 */

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
    estado: "CUENTA",
    meseroId: 7,
    comensales: 2,
    consumo: 52,
    propina: 0,
    comandas: [],
    ...p,
  };
}

const datos = vi.hoisted(() => ({
  cuenta: null as unknown as Mesa,
  cobrada: null as unknown as Mesa,
  recargada: null as unknown as Mesa,
}));
datos.cuenta = mesa();
datos.cobrada = mesa({
  estado: "PAGADA",
  cobro: { fecha: "2026-10-28T22:00:00.000Z", total: 52, pagos: [] },
});
datos.recargada = mesa({ estado: "OCUPADA", consumo: 72 });

vi.mock("./Salon", () => ({
  default: (p: { onVerMesa: (m: Mesa) => void; onMeserosCobran?: (v: boolean) => void }) => (
    <div>
      <button onClick={() => p.onMeserosCobran?.(true)}>el negocio deja cobrar</button>
      <button onClick={() => p.onVerMesa(datos.cuenta)}>ver M1</button>
    </div>
  ),
}));

vi.mock("./DetalleMesa", () => ({
  default: (p: {
    mesa: Mesa;
    aviso?: string;
    abrirRecibo?: boolean;
    onCobrarMesa?: (m: Mesa) => void;
  }) => (
    <div>
      <p>
        hoja de {p.mesa.codigo} ({p.mesa.estado}, {p.mesa.consumo})
      </p>
      {p.aviso && <p>aviso: {p.aviso}</p>}
      {p.abrirRecibo && <p>con el recibo abierto</p>}
      {p.onCobrarMesa && <button onClick={() => p.onCobrarMesa!(p.mesa)}>cobrar la mesa</button>}
    </div>
  ),
}));

vi.mock("./CobrarMesa", () => ({
  default: (p: {
    onCobrada: (mensaje: string, cobrada: Mesa | null) => void;
    onCuentaCambiada: (m: Mesa, aviso: string) => void;
  }) => (
    <div>
      <button onClick={() => p.onCobrada("M1 cobrada · Bs 52,00", datos.cobrada)}>cobró</button>
      <button onClick={() => p.onCobrada("M1 cobrada · Bs 52,00", null)}>cobró sin releer</button>
      <button onClick={() => p.onCuentaCambiada(datos.recargada, "La cuenta de M1 cambió")}>
        la cuenta cambió
      </button>
    </div>
  ),
}));

vi.mock("./PorServir", () => ({ default: () => <p>por servir</p> }));
vi.mock("./MiTurno", () => ({ default: () => <p>mi turno</p> }));
vi.mock("./AbrirMesa", () => ({ default: () => <p>abrir mesa</p> }));
vi.mock("./TomarPedido", () => ({ default: () => <p>tomar pedido</p> }));
vi.mock("./Entregas", () => ({ default: () => <p>entregas</p> }));

import PanelMesero from "./PanelMesero";

function irACobrar() {
  render(<PanelMesero />);
  fireEvent.click(screen.getByText("el negocio deja cobrar"));
  fireEvent.click(screen.getByText("ver M1"));
  fireEvent.click(screen.getByText("cobrar la mesa"));
}

describe("el panel después de que el mesero cobra", () => {
  it("vuelve a la mesa ya cobrada con el recibo abierto", () => {
    // Volvía al salón y el recibo había que ir a buscarlo, con el cliente
    // esperándolo al lado. La app lo abre sola.
    irACobrar();
    fireEvent.click(screen.getByText("cobró"));
    expect(screen.getByText("hoja de M1 (PAGADA, 52)")).toBeInTheDocument();
    expect(screen.getByText("con el recibo abierto")).toBeInTheDocument();
    expect(screen.getByText("M1 cobrada · Bs 52,00")).toBeInTheDocument();
  });

  it("si no pudo releer la mesa cobrada, vuelve al salón como antes", () => {
    irACobrar();
    fireEvent.click(screen.getByText("cobró sin releer"));
    expect(screen.queryByText(/hoja de M1/)).not.toBeInTheDocument();
    expect(screen.getByText("ver M1")).toBeInTheDocument();
    expect(screen.getByText("M1 cobrada · Bs 52,00")).toBeInTheDocument();
  });

  it("si la cuenta cambió, vuelve a la mesa recargada con el aviso", () => {
    irACobrar();
    fireEvent.click(screen.getByText("la cuenta cambió"));
    expect(screen.getByText("hoja de M1 (OCUPADA, 72)")).toBeInTheDocument();
    expect(screen.getByText("aviso: La cuenta de M1 cambió")).toBeInTheDocument();
    expect(screen.queryByText("con el recibo abierto")).not.toBeInTheDocument();
  });
});
