import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseDelGrupo } from "../../lib/academia/tipos";
import { puedeVer } from "../../lib/permisos";
import { grupoDetalle } from "../../test/academiaFixtures";

/**
 * Ítem 14 de la revisión del 08-nov: la lista de clases del grupo, para
 * corregir la lista de otro día desde la administración y hacer «No vino».
 */

const quien = vi.hoisted(() => ({ permisos: ["academia.ver", "academia.grupos", "asistencia.registrar", "asistencia.justificar"] }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_ADMIN: s } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, usuario: { ...s.usuario, permisos: quien.permisos, permisosPropios: [] }, puede: () => true }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { clasesDelGrupo: vi.fn(), suspenderClase: vi.fn(), docentes: vi.fn(async () => []) } };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import ClasesDelGrupo from "./ClasesDelGrupo";

const clase = (extra: Partial<ClaseDelGrupo>): ClaseDelGrupo => ({
  sesionId: 1,
  grupoId: 7,
  fecha: "2026-10-14",
  horaInicio: "09:00",
  horaFin: "11:00",
  estado: "PROGRAMADA",
  motivoSuspension: null,
  materia: { orden: 2, nombre: "Degradados" },
  docente: { personalId: 9, nombre: "Marco Rojas" },
  titular: { personalId: 9, nombre: "Marco Rojas" },
  reemplazo: false,
  llegadaEn: null,
  atrasoMin: null,
  toleranciaMin: 10,
  conAtraso: false,
  atrasoJustificado: false,
  justificacion: null,
  lista: { pasada: false, presentes: 0, total: 14 },
  ...extra,
});

const CLASES = [
  clase({ sesionId: 1, fecha: "2026-09-14", materia: { orden: 1, nombre: "Cortes" }, estado: "DICTADA", lista: { pasada: true, presentes: 13, total: 14 } }),
  clase({ sesionId: 2, fecha: "2026-10-14", estado: "DICTADA", llegadaEn: "2026-10-14T13:20:00.000Z", atrasoMin: 20, conAtraso: true, lista: { pasada: true, presentes: 12, total: 14 } }),
  clase({ sesionId: 3, fecha: "2026-10-15", estado: "SUSPENDIDA", motivoSuspension: "Feriado" }),
  clase({ sesionId: 4, fecha: "2026-10-16", docente: { personalId: 10, nombre: "Ana Paz" }, reemplazo: true }),
  clase({ sesionId: 5, fecha: "2026-10-19" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  quien.permisos = ["academia.ver", "academia.grupos", "asistencia.registrar", "asistencia.justificar"];
  vi.mocked(apiAcademia.clasesDelGrupo).mockResolvedValue({ grupoId: 7, hoy: "2026-10-16", toleranciaMin: 10, clases: CLASES });
});

async function montar() {
  render(
    <MemoryRouter>
      <ClasesDelGrupo g={grupoDetalle()} />
    </MemoryRouter>,
  );
  await act(async () => {});
  return within(screen.getByRole("list", { name: "Clases del grupo" }));
}

describe("Clases del grupo (ítem 14)", () => {
  it("arranca en el módulo de hoy, con el docente, la llegada, la lista y lo que cambió", async () => {
    const lista = await montar();
    expect(apiAcademia.clasesDelGrupo).toHaveBeenCalledWith(grupoDetalle().id);
    const filas = lista.getAllByRole("listitem");
    // Sólo las del M2 (el de hoy).
    expect(filas).toHaveLength(4);
    expect(filas[0]).toHaveTextContent("Marco Rojas · Llegó");
    expect(filas[0]).toHaveTextContent("20 min tarde · Lista 12/14");
    expect(filas[1]).toHaveTextContent("Suspendida · Feriado");
    expect(filas[2]).toHaveTextContent("hoy");
    expect(filas[2]).toHaveTextContent("Reemplazo de Marco Rojas");
    expect(filas[2]).toHaveTextContent("Sin llegada · Sin lista");
  });

  it("cada clase pasada abre su lista con la fecha; la suspendida y la futura, no", async () => {
    const lista = await montar();
    const filas = lista.getAllByRole("listitem");
    expect(within(filas[0]).getByRole("link", { name: "Lista del 14-oct" })).toHaveAttribute("href", "/academia/grupos/7/lista?fecha=2026-10-14");
    expect(within(filas[0]).getByRole("link", { name: "Lista del 14-oct" })).toHaveTextContent("Ver lista");
    expect(within(filas[1]).queryByRole("link", { name: /Lista del/ })).not.toBeInTheDocument();
    expect(within(filas[2]).getByRole("link", { name: /Lista del/ })).toHaveTextContent("Pasar lista");
    expect(within(filas[3]).queryByRole("link", { name: /Lista del/ })).not.toBeInTheDocument();
    // La futura sí admite «No vino» (un feriado que viene); la dada, «Justificar» el atraso.
    expect(within(filas[3]).getByRole("button", { name: /No vino/ })).toBeInTheDocument();
    expect(within(filas[0]).getByRole("button", { name: /Justificar/ })).toBeInTheDocument();
    expect(within(filas[0]).queryByRole("button", { name: /No vino/ })).not.toBeInTheDocument();
  });

  it("se cambia de módulo con los chips", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "M1" }));
    const filas = within(screen.getByRole("list", { name: "Clases del grupo" })).getAllByRole("listitem");
    expect(filas).toHaveLength(1);
    expect(filas[0]).toHaveTextContent("Lista 13/14");
  });

  it("sin academia.grupos ni justificar (la recepción), sólo las listas", async () => {
    quien.permisos = ["academia.ver", "asistencia.registrar"];
    const lista = await montar();
    expect(lista.queryByRole("button", { name: /No vino|Justificar|Deshacer|Quitar/ })).not.toBeInTheDocument();
    expect(lista.getAllByRole("link", { name: /Lista del/ }).length).toBeGreaterThan(0);
  });
});

describe("D9 · «Mis clases» para el dueño que también da clases", () => {
  const dueno = {
    features: ["academia", "asistencia", "notas"] as never,
    rubro: "ACADEMIA",
    permisos: ["academia.ver", "asistencia.registrar", "notas.registrar"],
    permisosPropios: [],
  };
  it("sin módulos asignados no la ve (es de alcance PROPIO); con módulos, sí", () => {
    expect(puedeVer(dueno, "academia_mis_clases")).toBe(false);
    expect(puedeVer({ ...dueno, dictaClases: true }, "academia_mis_clases")).toBe(true);
    // Sólo Mis clases: la lista y las notas del docente siguen siendo del docente.
    expect(puedeVer({ ...dueno, dictaClases: true }, "academia_lista")).toBe(false);
  });
  it("sin pasar lista, aunque dicte, no la ve", () => {
    expect(puedeVer({ ...dueno, permisos: ["academia.ver"], dictaClases: true }, "academia_mis_clases")).toBe(false);
  });
});
