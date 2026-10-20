import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseDelDia, HoyAcademia } from "../../lib/academia/tipos";

/**
 * E1 · Hoy, con la respuesta como la manda el backend: el alumno de cada
 * cobro llega como `{ id, nombre }` (pintarlo como texto tiraba la pantalla).
 * Ronda 2: las clases del día con la llegada del docente y la lista, y los
 * avisos nuevos (inscripciones online, grupos que empiezan).
 */

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: (sec: string) => sec !== "caja" }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { hoy: vi.fn(), llegada: vi.fn() } };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import Hoy from "./Hoy";

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
  avisos: [
    { tipo: "INSCRIPCIONES_ONLINE", titulo: "3 inscripciones online nuevas", texto: "Pagan en el instituto." },
    { tipo: "EMPIEZA", titulo: "Uñas · L-V 15:00–17:00 empieza el 10-nov", texto: "Quedan 11 cupos", grupoId: 9 },
    { tipo: "SIE", titulo: "Lista para el SIE", texto: "Ya no se muestra" },
  ],
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
  render(
    <MemoryRouter>
      <Hoy />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("E1 · Hoy", () => {
  it("pinta los cobros del día con el nombre del alumno", async () => {
    await montar();
    expect(screen.getByText("Bustillos Rek, Camila")).toBeInTheDocument();
    expect(screen.getByText("Rojas Lima, Thiago")).toBeInTheDocument();
  });

  it("las clases de hoy: terminó, en curso o por empezar, con la llegada y la lista", async () => {
    await montar();
    const clases = screen.getByRole("region", { name: /Clases de hoy/ });
    const filas = within(clases).getAllByRole("listitem");
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

  it("los avisos nuevos llevan a su pantalla y el del SIE ya no aparece", async () => {
    await montar();
    expect(screen.getByRole("link", { name: /3 inscripciones online nuevas/ })).toHaveAttribute("href", "/academia/preinscripciones");
    expect(screen.getByRole("link", { name: /empieza el 10-nov/ })).toHaveAttribute("href", "/academia/grupos/9");
    expect(screen.queryByText("Lista para el SIE")).not.toBeInTheDocument();
  });
});
