import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ajustesDePrueba } from "../../../test/academiaFixtures";

/**
 * N4 · Ajustes: cada cambio se guarda solo, las franjas se validan antes de
 * mandarse, la retención y los atrasos quedan "por confirmar" sin tocarse.
 */

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_ADMIN: s } = await import("../../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
});

vi.mock("../../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/api")>();
  return { ...real, api: { ...real.api, getSucursales: vi.fn().mockResolvedValue([]) } };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { ajustes: vi.fn(), guardarAjustes: vi.fn(), carreras: vi.fn(), calendario: vi.fn() },
  };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import AjustesAcademia from "./AjustesAcademia";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ topePromoSinPinPct: 0 }));
  vi.mocked(apiAcademia.guardarAjustes).mockImplementation(async (c) => ajustesDePrueba({ topePromoSinPinPct: 0, ...c }));
  vi.mocked(apiAcademia.carreras).mockResolvedValue([]);
  vi.mocked(apiAcademia.calendario).mockResolvedValue({
    sede: null,
    meses: ["2026-10"],
    filas: [
      {
        inicio: "07:00",
        fin: "09:00",
        esFranja: true,
        celdas: [
          {
            mes: "2026-10",
            grupos: [
              {
                grupoId: 7,
                nombre: "Barbería",
                carrera: { id: 3, nombre: "Barbería" },
                modulo: { orden: 1, nombre: "Corte", total: 3 },
                ultimo: false,
                dias: [1, 3, 5],
                aula: null,
                docente: null,
                inscritos: 10,
                cupo: 25,
                inscripcionAbierta: true,
                pagaronModulo: 8,
              },
            ],
          },
        ],
      },
    ],
  });
});

async function montar() {
  render(
    <MemoryRouter>
      <AjustesAcademia />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("N4 · Ajustes del instituto", () => {
  it("el día de inicio se guarda al soltar el campo, y dice que quedó guardado", async () => {
    await montar();
    const dia = screen.getByLabelText(/empiezan el día/);
    fireEvent.change(dia, { target: { value: "5" } });
    fireEvent.blur(dia);
    await act(async () => {});
    expect(apiAcademia.guardarAjustes).toHaveBeenCalledWith({ diaInicioModulo: 5 });
    expect(screen.getByRole("status")).toHaveTextContent("Cambios guardados");
  });

  it("un día fuera de 1..28 no se manda", async () => {
    await montar();
    const dia = screen.getByLabelText(/empiezan el día/);
    fireEvent.change(dia, { target: { value: "31" } });
    fireEvent.blur(dia);
    expect(apiAcademia.guardarAjustes).not.toHaveBeenCalled();
    expect(screen.getByText(/entre 1 y 28/)).toBeInTheDocument();
  });

  it("la franja con grupos no se puede quitar; agregar una suma 2 horas después de la última", async () => {
    await montar();
    expect(screen.getByRole("button", { name: "Quitar franja 07:00–09:00" })).toBeDisabled();
    expect(screen.getByText("1 grupo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Agregar franja/ }));
    await act(async () => {});
    expect(apiAcademia.guardarAjustes).toHaveBeenCalledWith({
      franjas: [
        { almacenId: null, inicio: "07:00", fin: "09:00" },
        { almacenId: null, inicio: "19:00", fin: "21:00" },
        { almacenId: null, inicio: "21:00", fin: "23:00" },
      ],
    });
  });

  it("una franja que pisa a otra no se guarda", async () => {
    await montar();
    const desde = screen.getByLabelText("Desde, franja 2");
    fireEvent.change(desde, { target: { value: "08:00" } });
    fireEvent.blur(desde);
    expect(apiAcademia.guardarAjustes).not.toHaveBeenCalled();
    expect(screen.getByText(/se pisan/)).toBeInTheDocument();
  });

  it("retención y atrasos, por confirmar y sin tocar; el PIN de los descuentos sí se cambia", async () => {
    await montar();
    expect(screen.getByRole("switch", { name: /Retención por facturación/ })).toBeDisabled();
    expect(screen.getByRole("switch", { name: /Descuento por atrasos/ })).toBeDisabled();
    expect(screen.getAllByText("Pronto")).toHaveLength(2);
    fireEvent.click(screen.getByRole("switch", { name: /piden PIN/ }));
    await act(async () => {});
    expect(apiAcademia.guardarAjustes).toHaveBeenCalledWith({ topePromoSinPinPct: 100 });
  });
});
