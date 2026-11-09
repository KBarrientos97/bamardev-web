import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseDelDia, ListaDeClase, ProximaClase } from "../../../lib/academia/tipos";

/**
 * Tanda 2 de la revisión del 08-nov, del lado de quien da clases: la clase
 * suspendida y la que ese día da otro en Mis clases y en Pasar lista, y el
 * dueño que también enseña (D9), que pasa la lista por las rutas del grupo.
 */

/** La sesión de cada prueba: el docente de fábrica o el dueño. */
const quien = vi.hoisted(() => ({ dueno: false }));

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_DOCENTE, SESION_ADMIN } = await import("../../../test/academiaFixtures");
  const { puedeVer } = await import("../../../lib/permisos");
  return {
    useAuth: () => {
      const s = quien.dueno ? SESION_ADMIN : SESION_DOCENTE;
      return {
        ...s,
        puede: (sec: Parameters<typeof puedeVer>[1]) =>
          puedeVer(
            { features: s.negocio.features, rubro: "ACADEMIA", permisos: s.usuario.permisos, permisosPropios: s.usuario.permisosPropios, dictaClases: quien.dueno },
            sec,
          ),
      };
    },
  };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { misClases: vi.fn(), llegada: vi.fn(), lista: vi.fn(), guardarLista: vi.fn(), grupo: vi.fn() } };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { grupoDetalle } from "../../../test/academiaFixtures";
import MisClases from "./MisClases";
import PasarLista from "./PasarLista";

const clase = (extra: Partial<ClaseDelDia>): ClaseDelDia => ({
  sesionId: 11,
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
  llegadaEn: null,
  atrasoMin: null,
  lista: { pasada: false, presentes: 0, total: 22 },
  mia: true,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  quien.dueno = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 8, 0));
  vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle());
});
afterEach(() => vi.useRealTimers());

async function misClases(clases: ClaseDelDia[], proximas: ProximaClase[] = []) {
  vi.mocked(apiAcademia.misClases).mockResolvedValue({ fecha: "2026-10-16", clases, proximas });
  render(
    <MemoryRouter>
      <MisClases />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("Mis clases con clases cambiadas", () => {
  it("la suspendida se ve con su motivo, sin botones, y no cuenta como clase que da", async () => {
    await misClases([
      clase({ sesionId: 11, estado: "SUSPENDIDA", suspendida: true, motivoSuspension: "Feriado" }),
      clase({ sesionId: 12, horaInicio: "15:00", horaFin: "17:00" }),
    ]);
    expect(screen.getByText("Hoy das 1 clase")).toBeInTheDocument();
    const suspendida = screen.getByRole("article", { name: "Clase de las 09:00" });
    expect(suspendida).toHaveTextContent("suspendida");
    expect(suspendida).toHaveTextContent("Hoy no hay clase: Feriado. No se pasa lista.");
    expect(within(suspendida).queryByRole("link", { name: /Pasar lista/ })).not.toBeInTheDocument();
    expect(within(suspendida).queryByRole("button", { name: "Llegué" })).not.toBeInTheDocument();
    // La grande es la que sí da.
    expect(screen.getByRole("article", { name: "Tu próxima clase" })).toHaveTextContent("15:00 a 17:00");
  });

  it("la suya que hoy da otro dice «la da X»; la que él da como reemplazo, «Reemplazás a»", async () => {
    await misClases([
      clase({ sesionId: 11, mia: false, reemplazo: true, docente: { personalId: 10, nombre: "Ana Paz" }, titular: { personalId: 9, nombre: "Marco Rojas" } }),
      clase({ sesionId: 12, horaInicio: "15:00", horaFin: "17:00", reemplazo: true, titular: { personalId: 30, nombre: "Lucía Fernández" } }),
    ]);
    expect(screen.getByText("Hoy das 1 clase")).toBeInTheDocument();
    const deOtro = screen.getByRole("article", { name: "Clase de las 09:00" });
    expect(deOtro).toHaveTextContent("Hoy la da Ana Paz. No tenés que hacer nada.");
    expect(within(deOtro).queryByRole("link", { name: /Pasar lista/ })).not.toBeInTheDocument();
    const mia = screen.getByRole("article", { name: "Tu próxima clase" });
    expect(mia).toHaveTextContent("Reemplazás a Lucía Fernández");
    expect(within(mia).getByRole("link", { name: /Pasar lista/ })).toHaveAttribute("href", "/academia/lista?grupo=7");
  });

  it("las próximas dicen si están suspendidas o las da otro", async () => {
    await misClases(
      [],
      [
        { fecha: "2026-10-19", grupoId: 7, nombre: "G", materia: { orden: 2, nombre: "Degradados" }, horaInicio: "09:00", horaFin: "11:00", aula: null, suspendida: true },
        { fecha: "2026-10-20", grupoId: 7, nombre: "G", materia: { orden: 2, nombre: "Degradados" }, horaInicio: "09:00", horaFin: "11:00", aula: null, mia: false, docente: { personalId: 10, nombre: "Ana Paz" } },
      ],
    );
    const proximas = screen.getByRole("region", { name: "Próximas clases" });
    expect(proximas).toHaveTextContent("suspendida");
    expect(proximas).toHaveTextContent("la da Ana Paz");
  });

  it("D9: el dueño que da clases pasa la lista y carga notas por las rutas del grupo", async () => {
    quien.dueno = true;
    await misClases([clase({})]);
    const mia = screen.getByRole("article", { name: "Tu próxima clase" });
    expect(within(mia).getByRole("link", { name: /Pasar lista/ })).toHaveAttribute("href", "/academia/grupos/7/lista");
    expect(within(mia).getByRole("link", { name: /Notas del/ })).toHaveAttribute("href", "/academia/grupos/7/notas");
  });
});

describe("Pasar lista de una clase suspendida o de reemplazo", () => {
  const lista = (sesion: Partial<ListaDeClase["sesion"]>, editable: boolean): ListaDeClase => ({
    sesion: { id: 11, fecha: "2026-10-16", horaInicio: "09:00", horaFin: "11:00", estado: "PROGRAMADA", materia: { orden: 2, nombre: "Degradados" }, ...sesion },
    guardada: false,
    editable,
    resumen: { pagaron: 1, total: 1 },
    alumnos: [{ inscripcionId: 101, nombre: "Andrade Villca, Mateo", estadoPago: "PAGADO", estado: null }],
  });

  async function abrir(l: ListaDeClase) {
    quien.dueno = true;
    vi.mocked(apiAcademia.lista).mockResolvedValue(l);
    render(
      <MemoryRouter initialEntries={["/academia/grupos/7/lista"]}>
        <Routes>
          <Route path="/academia/grupos/:id/lista" element={<PasarLista />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  it("la suspendida lo dice y no ofrece guardar", async () => {
    await abrir(lista({ estado: "SUSPENDIDA", suspendida: true, motivoSuspension: "Corte de luz" }, false));
    expect(screen.getByRole("status")).toHaveTextContent("Esta clase está suspendida (Corte de luz): no se pasa lista y a nadie le cuenta como falta.");
    expect(screen.queryByRole("button", { name: "Guardar lista" })).not.toBeInTheDocument();
    expect(screen.getByText("Clase suspendida: no hay lista que pasar.")).toBeInTheDocument();
  });

  it("la de reemplazo dice quién la da", async () => {
    await abrir(lista({ reemplazo: true, docente: { personalId: 10, nombre: "Ana Paz" }, titular: { personalId: 9, nombre: "Marco Rojas" } }, true));
    expect(screen.getByText(/La da Ana Paz, en lugar de Marco Rojas \(reemplazo\)/)).toBeInTheDocument();
  });
});
