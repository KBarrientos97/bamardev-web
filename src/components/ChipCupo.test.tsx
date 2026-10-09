import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CupoEstado } from "../types";
import { CUPO_ILIMITADO, cupoEmprendedor } from "../test/cupoFixtures";

/**
 * El chip "Hoy 32/50 · Créditos 240" (§5.1): sólo en un negocio Emprendedor.
 * Sin `cupo`, o con `ilimitado` (Básico, Profesional: Omar), no existe.
 */

const sesion = vi.hoisted(() => ({ cupo: null as CupoEstado | null | undefined }));

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({ cupo: sesion.cupo, actualizarCupo: vi.fn(), refrescarCupo: vi.fn(async () => {}), licencia: null }),
}));

// El chip compara contra el día del negocio: se fija para que el snapshot sea de hoy.
vi.mock("../lib/agenda/horaAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/agenda/horaAgenda")>();
  return { ...real, fechaNegocio: () => "2026-10-09" };
});

import { EVENTO_HOJA_CUPO } from "../lib/hojaCupo";
import ChipCupo, { BarraCupo } from "./ChipCupo";

beforeEach(() => {
  localStorage.clear();
  sesion.cupo = null;
});

describe("ChipCupo", () => {
  it("sin cupo no se muestra nada", () => {
    sesion.cupo = undefined;
    const { container } = render(<ChipCupo unidad="VENTA" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("con ilimitado (Básico, Profesional) no se muestra nada", () => {
    sesion.cupo = CUPO_ILIMITADO;
    const { container } = render(
      <>
        <ChipCupo unidad="VENTA" />
        <ChipCupo unidad="CITA" />
        <BarraCupo chip="VENTA" avisos={["VENTA", "CITA"]} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('Emprendedor: "Hoy 32/50 · Créditos 240" y en la agenda "Citas hoy 12/50 · Créditos 240"', () => {
    sesion.cupo = cupoEmprendedor({ ventas: 32, citas: 12, saldo: 240 });
    render(
      <>
        <ChipCupo unidad="VENTA" />
        <ChipCupo unidad="CITA" />
      </>,
    );
    const [ventas, citas] = screen.getAllByRole("button");
    expect(ventas).toHaveTextContent("Hoy 32/50 · Créditos 240");
    expect(citas).toHaveTextContent("Citas hoy 12/50 · Créditos 240");
  });

  it("con saldo negativo muestra «Créditos −3» en rojo", () => {
    sesion.cupo = cupoEmprendedor({ ventas: 50, saldo: -3 });
    render(<ChipCupo unidad="VENTA" />);
    const creditos = screen.getByText("Créditos −3");
    expect(creditos).toHaveClass("text-danger-text");
  });

  it("tocarlo pide la hoja de compra", () => {
    sesion.cupo = cupoEmprendedor({ ventas: 3, saldo: 20 });
    const pedido = vi.fn();
    window.addEventListener(EVENTO_HOJA_CUPO, pedido);
    render(<ChipCupo unidad="CITA" />);
    fireEvent.click(screen.getByRole("button"));
    expect(pedido).toHaveBeenCalledTimes(1);
    expect((pedido.mock.calls[0][0] as CustomEvent).detail).toEqual({ unidad: "CITA" });
    window.removeEventListener(EVENTO_HOJA_CUPO, pedido);
  });
});

describe("BarraCupo: el chip del Layout y los avisos del día", () => {
  afterEach(() => vi.useRealTimers());

  it("el aviso del 80 % sale una sola vez en el día", () => {
    sesion.cupo = cupoEmprendedor({ ventas: 40, saldo: 100 });
    const { unmount } = render(<BarraCupo chip="VENTA" avisos={["VENTA"]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Te quedan 10 ventas en el cupo de hoy");
    fireEvent.click(screen.getByLabelText("Cerrar aviso"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();
    // Otra pantalla, mismo día: ya se mostró.
    render(<BarraCupo chip="VENTA" avisos={["VENTA"]} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hoy 40\/50/ })).toBeInTheDocument();
  });

  it("la primera vez que se usan créditos avisa cuánto cuesta cada una", () => {
    sesion.cupo = cupoEmprendedor({ ventas: 50, saldo: 240 });
    render(<BarraCupo avisos={["VENTA"]} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ya usaste las 50 de hoy: desde ahora cada venta usa 1 crédito (te quedan 240)",
    );
  });

  it("sin chip y sin avisos no ocupa lugar", () => {
    sesion.cupo = cupoEmprendedor({ ventas: 2, saldo: 100 });
    const { container } = render(<BarraCupo avisos={["VENTA"]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("un cupo que cambia (otra venta) puede traer el aviso siguiente", () => {
    sesion.cupo = cupoEmprendedor({ ventas: 10, saldo: 100 });
    const { rerender } = render(<BarraCupo chip="VENTA" avisos={["VENTA"]} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    sesion.cupo = cupoEmprendedor({ ventas: 41, saldo: 100 });
    act(() => rerender(<BarraCupo chip="VENTA" avisos={["VENTA"]} />));
    expect(screen.getByRole("status")).toHaveTextContent("Te quedan 9 ventas en el cupo de hoy");
  });
});
