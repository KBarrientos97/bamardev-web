import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * E9 · Cuotas por cobrar en el POS: buscar al alumno, sus cuotas con la
 * vencida marcada, el monto editable para un abono (nunca sobre el saldo),
 * quién paga y el aviso de otra sede.
 */

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { cuotasPorCobrar: vi.fn(), carrito: vi.fn() } };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import CuotasPorCobrar from "./CuotasPorCobrar";

const onAgregar = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAcademia.cuotasPorCobrar).mockResolvedValue({
    alumnos: [
      {
        alumnoId: 53,
        inscripcionId: 103,
        nombre: "Céspedes Molina, Joaquín",
        codigo: "2026-0103",
        grupo: "Barbería · Sáb 08:00",
        sede: { id: 2, nombre: "Norte" },
        saldo: 866,
        vencido: true,
      },
    ],
  });
  vi.mocked(apiAcademia.carrito).mockResolvedValue({
    alumno: { id: 53, nombre: "Céspedes Molina, Joaquín" },
    pagadores: [
      { clienteId: 70, nombre: "Rosa Molina", rol: "TUTOR", principal: true },
      { clienteId: 53, nombre: "Joaquín", rol: "ALUMNO", principal: false },
    ],
    lineas: [
      { productoId: 77, cuotaId: 906, descripcion: "Barbería · M3", saldo: 533, vence: "2026-10-17", vencida: false },
      { productoId: 77, cuotaId: 905, descripcion: "Barbería · M2", saldo: 333, vence: "2026-09-17", vencida: true },
    ],
  });
});

async function buscarYElegir() {
  render(<CuotasPorCobrar caja={{ id: 1, nombre: "Central" }} onAtras={vi.fn()} onAgregar={onAgregar} />);
  fireEvent.change(screen.getByLabelText("Buscar estudiante"), { target: { value: "cesp" } });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 350));
  });
  const fila = await screen.findByRole("button", { name: /Céspedes Molina, Joaquín/ });
  expect(fila).toHaveTextContent("Otra sede");
  await act(async () => {
    fireEvent.click(fila);
  });
}

describe("E9 · cuotas por cobrar", () => {
  it("la vencida arriba y marcada; un abono va con su monto, quien paga y el aviso de sede", async () => {
    await buscarYElegir();
    expect(apiAcademia.cuotasPorCobrar).toHaveBeenCalledWith("cesp");
    expect(apiAcademia.carrito).toHaveBeenCalledWith(103);
    expect(screen.getByRole("status")).toHaveTextContent("Grupo de Norte · se cobra en Central");
    const cajas = screen.getAllByRole("checkbox");
    expect(cajas[0]).toBeChecked();
    expect(cajas[1]).not.toBeChecked();
    fireEvent.click(screen.getAllByRole("radio", { name: "Una parte" })[0]);
    fireEvent.change(screen.getByLabelText(/Monto del adelanto/), { target: { value: "200" } });
    expect(within(screen.getByRole("radiogroup", { name: "Quién paga" })).getByRole("radio", { name: /Rosa Molina/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /Agregar al carrito/ }));
    expect(onAgregar).toHaveBeenCalledWith({
      inscripcionId: 103,
      alumno: { id: 53, nombre: "Céspedes Molina, Joaquín" },
      pagadores: expect.any(Array),
      pagadorId: 70,
      sedeGrupo: "Norte",
      otraSede: true,
      lineas: [{ cuotaId: 905, productoId: 77, descripcion: "Barbería · M2", monto: 200, saldo: 333, vencida: true }],
    });
  });

  it("no deja cobrar más que el saldo", async () => {
    await buscarYElegir();
    fireEvent.click(screen.getAllByRole("radio", { name: "Una parte" })[0]);
    fireEvent.change(screen.getByLabelText(/Monto del adelanto/), { target: { value: "400" } });
    expect(screen.getByText("Más que cero y nunca por encima del saldo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agregar al carrito/ })).toBeDisabled();
  });

  it("con la inscripción en la mano va directo a sus cuotas", async () => {
    render(
      <CuotasPorCobrar
        caja={{ id: 1, nombre: "Central" }}
        inicial={{ inscripcionId: 103, sede: { id: 1, nombre: "Central" } }}
        onAtras={vi.fn()}
        onAgregar={onAgregar}
      />,
    );
    await act(async () => {});
    expect(apiAcademia.carrito).toHaveBeenCalledWith(103);
    expect(apiAcademia.cuotasPorCobrar).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
