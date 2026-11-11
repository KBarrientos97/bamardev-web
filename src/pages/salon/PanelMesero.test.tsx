import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const montajes = vi.hoisted(() => ({ salon: 0 }));

vi.mock("./Salon", async () => {
  const { useEffect } = await import("react");
  function SalonDePrueba(p: {
    onVerMesa: (m: Mesa) => void;
    onAbrirMesa: (m: Mesa) => void;
    onMeserosCobran?: (v: boolean) => void;
  }) {
      // Cuenta los montajes: al volver de otra pestaña o de un flujo, el salón
      // tiene que seguir siendo el mismo (con su scroll), no uno nuevo.
      useEffect(() => {
        montajes.salon++;
      }, []);
      return (
        <div>
          <button onClick={() => p.onMeserosCobran?.(true)}>el negocio deja cobrar</button>
          <button onClick={() => p.onVerMesa(datos.cuenta)}>ver M1</button>
          <button onClick={() => p.onAbrirMesa(datos.cuenta)}>abrir M1</button>
        </div>
      );
  }
  return { default: SalonDePrueba };
});

vi.mock("./cartaGuardada", () => ({ precargarCarta: vi.fn() }));

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
vi.mock("./AbrirMesa", () => ({
  default: (p: { onAtras: () => void }) => (
    <div>
      <p>abrir mesa</p>
      <button onClick={p.onAtras}>volver del alta</button>
    </div>
  ),
}));
vi.mock("./TomarPedido", () => ({ default: () => <p>tomar pedido</p> }));
vi.mock("./Entregas", () => ({ default: () => <p>entregas</p> }));

import PanelMesero from "./PanelMesero";

beforeEach(() => {
  vi.useFakeTimers();
  montajes.salon = 0;
});
afterEach(() => vi.useRealTimers());

/** Lo que tarda en salir una pantalla apilada. */
const salida = () => act(() => vi.advanceTimersByTime(400));

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
    salida();
    expect(screen.getByText("hoja de M1 (PAGADA, 52)")).toBeInTheDocument();
    expect(screen.getByText("con el recibo abierto")).toBeInTheDocument();
    expect(screen.getByText("M1 cobrada · Bs 52,00")).toBeInTheDocument();
  });

  it("si no pudo releer la mesa cobrada, vuelve al salón como antes", () => {
    irACobrar();
    fireEvent.click(screen.getByText("cobró sin releer"));
    salida();
    expect(screen.queryByText(/hoja de M1/)).not.toBeInTheDocument();
    expect(screen.getByText("ver M1")).toBeInTheDocument();
    expect(screen.getByText("M1 cobrada · Bs 52,00")).toBeInTheDocument();
  });

  it("si la cuenta cambió, vuelve a la mesa recargada con el aviso", () => {
    irACobrar();
    fireEvent.click(screen.getByText("la cuenta cambió"));
    salida();
    expect(screen.getByText("hoja de M1 (OCUPADA, 72)")).toBeInTheDocument();
    expect(screen.getByText("aviso: La cuenta de M1 cambió")).toBeInTheDocument();
    expect(screen.queryByText("con el recibo abierto")).not.toBeInTheDocument();
  });
});

describe("el panel se siente como una app (UX nativa, 10-nov)", () => {
  it("cambiar de pestaña y volver no rearma el salón", () => {
    render(<PanelMesero />);
    fireEvent.click(screen.getByRole("button", { name: /Mi turno/ }));
    expect(screen.getByText("mi turno")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Salón/ }));
    expect(montajes.salon).toBe(1);
  });

  it("abrir una mesa se apila sobre el salón, que sigue vivo debajo", () => {
    render(<PanelMesero />);
    fireEvent.click(screen.getByText("abrir M1"));
    expect(screen.getByText("abrir mesa")).toBeInTheDocument();
    // El salón sigue montado detrás (se ve al volver desde el borde).
    expect(screen.getByText("ver M1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("volver del alta"));
    salida();
    expect(screen.queryByText("abrir mesa")).not.toBeInTheDocument();
    expect(montajes.salon).toBe(1);
  });

  it("se vuelve arrastrando desde el borde izquierdo", () => {
    render(<PanelMesero />);
    fireEvent.click(screen.getByText("abrir M1"));
    const pantalla = screen.getByText("abrir mesa").closest(".fixed")!;
    fireEvent.touchStart(pantalla, { touches: [{ clientX: 8, clientY: 300 }] });
    for (const x of [20, 150, 300]) fireEvent.touchMove(pantalla, { touches: [{ clientX: x, clientY: 305 }] });
    fireEvent.touchEnd(pantalla, { touches: [] });
    salida();
    expect(screen.queryByText("abrir mesa")).not.toBeInTheDocument();
  });

  it("arrastrar desde el medio de la pantalla no vuelve", () => {
    render(<PanelMesero />);
    fireEvent.click(screen.getByText("abrir M1"));
    const pantalla = screen.getByText("abrir mesa").closest(".fixed")!;
    fireEvent.touchStart(pantalla, { touches: [{ clientX: 120, clientY: 300 }] });
    for (const x of [140, 260, 380]) fireEvent.touchMove(pantalla, { touches: [{ clientX: x, clientY: 305 }] });
    fireEvent.touchEnd(pantalla, { touches: [] });
    salida();
    expect(screen.getByText("abrir mesa")).toBeInTheDocument();
  });
});
