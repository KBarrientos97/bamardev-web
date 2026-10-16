import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HoyAcademia } from "../../lib/academia/tipos";

/**
 * E1 · Hoy, con la respuesta como la manda el backend: el alumno de cada
 * cobro llega como `{ id, nombre }` (pintarlo como texto tiraba la pantalla).
 */

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: (sec: string) => sec !== "caja" }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { hoy: vi.fn() } };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import Hoy from "./Hoy";

const HOY: HoyAcademia = {
  fecha: "2026-10-15",
  sede: null,
  cobrar: {
    venceHoy: 1283,
    venceHoyCuotas: 2,
    vencido: 750,
    vencidoCuotas: 1,
    items: [
      { alumno: { id: 52, nombre: "Bustillos Rek, Camila" }, detalle: "Cuota 2 · Barbería · venció 17-sep", monto: 750 },
      { alumno: { id: 60, nombre: "Rojas Lima, Thiago" }, detalle: "M2 · Barbería · vence hoy", monto: 533 },
    ],
  },
  preinscripcionesNuevas: 3,
  avisos: [{ tipo: "PREINSCRIPCIONES", titulo: "3 preinscripciones nuevas", texto: "Desde la página." }],
  clases: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAcademia.hoy).mockResolvedValue(HOY);
});

describe("E1 · Hoy", () => {
  it("pinta los cobros del día con el nombre del alumno y los avisos", async () => {
    render(
      <MemoryRouter>
        <Hoy />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByText("Bustillos Rek, Camila")).toBeInTheDocument();
    expect(screen.getByText("Rojas Lima, Thiago")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /3 preinscripciones nuevas/ })).toHaveAttribute("href", "/academia/preinscripciones");
  });
});
