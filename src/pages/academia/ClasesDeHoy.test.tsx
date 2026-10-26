import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseDelDia, HoyAcademia } from "../../lib/academia/tipos";

/**
 * Las clases de hoy, arriba del Calendario (26-oct): las de la pantalla "Hoy",
 * que salió del menú, con la llegada del docente y la lista.
 */

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { hoy: vi.fn(), llegada: vi.fn() } };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import ClasesDeHoy from "./ClasesDeHoy";

const clase = (extra: Partial<ClaseDelDia>): ClaseDelDia => ({
  sesionId: 1,
  grupoId: 7,
  nombre: "L-M-V 09:00–11:00",
  carrera: "Barbería",
  materia: { orden: 2, nombre: "Degradados" },
  horaInicio: "09:00",
  horaFin: "11:00",
  aula: "Aula 2",
  sede: "Central",
  docente: { personalId: 9, nombre: "Marco Rojas" },
  inscritos: 22,
  pagaronModulo: 17,
  llegadaEn: null,
  atrasoMin: null,
  lista: { pasada: false, presentes: 0, total: 22 },
  ...extra,
});

const HOY: HoyAcademia = {
  fecha: "2026-10-16",
  sede: null,
  cobrar: { venceHoy: 0, venceHoyCuotas: 0, vencido: 0, vencidoCuotas: 0, items: [] },
  preinscripcionesNuevas: 0,
  avisos: [],
  clases: [
    clase({
      sesionId: 1,
      carrera: "Tatuaje",
      nombre: "L-M-V 07:00–09:00",
      horaInicio: "07:00",
      horaFin: "09:00",
      llegadaEn: "2026-10-16T11:12:00.000Z",
      atrasoMin: 12,
      lista: { pasada: true, presentes: 17, total: 18 },
    }),
    clase({ sesionId: 2 }),
    clase({ sesionId: 3, carrera: "Uñas", nombre: "L-V 15:00–17:00", horaInicio: "15:00", horaFin: "17:00", grupoId: 9 }),
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  // 09:40 en Bolivia.
  vi.setSystemTime(new Date(2026, 9, 16, 9, 40));
  vi.mocked(apiAcademia.hoy).mockResolvedValue(HOY);
  vi.mocked(apiAcademia.llegada).mockResolvedValue({});
});

afterEach(() => vi.useRealTimers());

async function montar() {
  const r = render(
    <MemoryRouter>
      <ClasesDeHoy sucursalId={1} />
    </MemoryRouter>,
  );
  await act(async () => {});
  return r;
}

describe("Clases de hoy (arriba del Calendario)", () => {
  it("terminó, en curso o por empezar, con la llegada y la lista", async () => {
    await montar();
    expect(apiAcademia.hoy).toHaveBeenCalledWith(1);
    const filas = within(screen.getByRole("region", { name: /Clases de hoy/ })).getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("terminó");
    expect(filas[0]).toHaveTextContent(/12 min tarde/);
    expect(filas[0]).toHaveTextContent("Lista 17 de 18");
    expect(filas[1]).toHaveTextContent("en curso");
    expect(filas[1]).toHaveTextContent("Todavía no");
    expect(filas[2]).toHaveTextContent("por empezar");
    // La que ya terminó no ofrece marcar la llegada.
    expect(within(filas[0]).queryByRole("button", { name: "Marcar llegada" })).not.toBeInTheDocument();
  });

  it("marcar la llegada del docente la pide al servidor y recarga", async () => {
    await montar();
    const filas = within(screen.getByRole("region", { name: /Clases de hoy/ })).getAllByRole("listitem");
    await act(async () => {
      fireEvent.click(within(filas[1]).getByRole("button", { name: "Marcar llegada" }));
    });
    expect(apiAcademia.llegada).toHaveBeenCalledWith(2);
    expect(apiAcademia.hoy).toHaveBeenCalledTimes(2);
  });

  it("sin clases hoy no se dibuja nada", async () => {
    vi.mocked(apiAcademia.hoy).mockResolvedValue({ ...HOY, clases: [] });
    const { container } = await montar();
    expect(container).toBeEmptyDOMElement();
  });
});
