import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Calendario } from "../../lib/academia/tipos";
import type { Persona } from "../../lib/personal";

/**
 * Docentes con 2+ sedes (PLAN-SUCURSAL-TOTAL §1): la organización elige la
 * sede, ve dónde dicta cada docente y la sede en el chip de cada grupo; quien
 * está atado a una sede no ve nada de eso; con una sede, nada cambia.
 */

const sesion = vi.hoisted(() => ({ sucursalId: null as number | null, sucursal: null as string | null, sedes: 2 }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_ADMIN: s } = await import("../../test/academiaFixtures");
  return {
    useAuth: () => ({
      ...s,
      usuario: {
        ...s.usuario,
        sucursalId: sesion.sucursalId,
        sucursal: sesion.sucursal,
        permisos: [...s.usuario.permisos, "personal.gestionar"],
      },
      negocio: { ...s.negocio, nombre: "Drick", alias: "drick", sucursalesActivas: sesion.sedes },
      puede: () => true,
    }),
  };
});

vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...real,
    api: {
      ...real.api,
      getSucursales: vi.fn(async () =>
        [
          { id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL", esPrincipal: true },
          { id: 2, nombre: "Norte", activo: true, tipo: "SUCURSAL", esPrincipal: false },
        ].slice(0, sesion.sedes),
      ),
    },
  };
});

vi.mock("../../lib/personal", () => ({
  apiPersonal: { listar: vi.fn(), cargos: vi.fn(), crear: vi.fn(), darAcceso: vi.fn() },
}));

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { calendario: vi.fn(), horarioDocente: vi.fn() } };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { apiPersonal } from "../../lib/personal";
import Docentes from "./Docentes";

const persona = (extra: Partial<Persona>): Persona => ({
  id: 1,
  nombre: "",
  cargoRolId: 5,
  cargo: "Docente",
  activo: true,
  color: null,
  sucursalIds: [1],
  usuarioId: null,
  conAcceso: false,
  recursoId: null,
  profesional: null,
  telefono: null,
  acceso: null,
  ...extra,
});

const LUCIA = persona({ id: 21, nombre: "Lucía Fernández", sucursalIds: [1, 2] });
const PEDRO = persona({ id: 22, nombre: "Pedro Gil", sucursalIds: [2] });
const SIN_SEDE = persona({ id: 23, nombre: "Zoe Rivas", sucursalIds: [] });

const grupoCal = (grupoId: number, nombre: string, personalId: number, sede: { id: number; nombre: string }) => ({
  grupoId,
  nombre,
  carrera: { id: 3, nombre: "Barbería" },
  sede,
  modulo: { orden: 2, nombre: "Degradados", total: 3 },
  ultimo: false,
  dias: [1, 3, 5],
  aula: null,
  docente: { personalId, nombre: "Lucía Fernández" },
  inscritos: 14,
  cupo: null,
  inscripcionAbierta: false,
  pagaronModulo: null,
});

const CALENDARIO: Calendario = {
  sede: null,
  meses: ["2026-11"],
  filas: [
    {
      inicio: "08:00",
      fin: "10:00",
      esFranja: true,
      celdas: [
        {
          mes: "2026-11",
          grupos: [
            grupoCal(7, "L-M-V 08:00", 21, { id: 1, nombre: "Central" }),
            grupoCal(8, "L-M-V 19:00", 21, { id: 2, nombre: "Norte" }),
          ],
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  sesion.sucursalId = null;
  sesion.sucursal = null;
  sesion.sedes = 2;
  vi.mocked(apiPersonal.listar).mockResolvedValue([LUCIA, PEDRO, SIN_SEDE]);
  vi.mocked(apiPersonal.cargos).mockResolvedValue([
    { id: 5, nombre: "Docente", esAdministrador: false, permisos: [{ codigo: "asistencia.registrar", alcance: "PROPIO" as const }] },
  ]);
  vi.mocked(apiAcademia.calendario).mockResolvedValue(CALENDARIO);
});

async function montar() {
  render(
    <MemoryRouter>
      <Docentes />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("Docentes con 2 sedes", () => {
  it("la organización ve dónde dicta cada uno y la sede en el chip de cada grupo", async () => {
    await montar();
    expect(screen.getByRole("listitem", { name: "Lucía Fernández" })).toHaveTextContent("Dicta en: Central, Norte");
    expect(screen.getByRole("listitem", { name: "Pedro Gil" })).toHaveTextContent("Dicta en: Norte");
    // Sin sedes cargadas = toda la organización.
    expect(screen.getByRole("listitem", { name: "Zoe Rivas" })).toHaveTextContent(/Dicta en: Todas las sedes/);
    const grupos = within(screen.getByRole("list", { name: "Grupos de Lucía Fernández" })).getAllByRole("link");
    expect(grupos.map((g) => g.textContent)).toEqual([
      "Barbería · L-M-V 08:00 · M2 Degradados · Central",
      "Barbería · L-M-V 19:00 · M2 Degradados · Norte",
    ]);
  });

  it("al elegir una sede quedan los docentes de esa sede (y los de toda la organización) y el calendario se pide por ella", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Norte" }));
    });
    expect(apiAcademia.calendario).toHaveBeenLastCalledWith(expect.objectContaining({ sede: 2 }));
    const nombres = within(screen.getByRole("list", { name: "Docentes" }))
      .getAllByRole("listitem", { name: /./ })
      .map((li) => li.getAttribute("aria-label"));
    expect(nombres).toEqual(["Lucía Fernández", "Pedro Gil", "Zoe Rivas"]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Central" }));
    });
    const deCentral = within(screen.getByRole("list", { name: "Docentes" }))
      .getAllByRole("listitem", { name: /./ })
      .map((li) => li.getAttribute("aria-label"));
    expect(deCentral).toEqual(["Lucía Fernández", "Zoe Rivas"]);
  });

  it("quien está atado a una sede no ve selector, ni «Dicta en», ni la sede en el chip", async () => {
    sesion.sucursalId = 1;
    sesion.sucursal = "Central";
    await montar();
    expect(screen.queryByRole("button", { name: /Todas las sedes/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Dicta en:/)).not.toBeInTheDocument();
    const grupos = within(screen.getByRole("list", { name: "Grupos de Lucía Fernández" })).getAllByRole("link");
    expect(grupos[0].textContent).toBe("Barbería · L-M-V 08:00 · M2 Degradados");
  });

  it("con una sola sede la pantalla queda como siempre", async () => {
    sesion.sedes = 1;
    await montar();
    expect(screen.queryByRole("button", { name: /Todas las sedes/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Dicta en:/)).not.toBeInTheDocument();
  });
});
