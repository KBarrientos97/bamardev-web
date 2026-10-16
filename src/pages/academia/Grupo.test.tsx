import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAMILA, fichaCamila, grupoDetalle, MATEO } from "../../test/academiaFixtures";

/**
 * E3 · Detalle de grupo, versión limpia: los indicadores son los filtros,
 * tocar una fila abre el panel del alumno con su estado de cuenta y "Cobrar"
 * lleva al POS con la inscripción. Asistencia y Notas: próximamente (F1b).
 */

const sesion = vi.hoisted(() => ({ permisos: null as string[] | null, propios: [] as string[] }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return {
    useAuth: () => ({
      ...s,
      usuario: { ...s.usuario, permisos: sesion.permisos ?? s.usuario.permisos, permisosPropios: sesion.propios },
      puede: () => true,
    }),
  };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: {
      grupo: vi.fn(),
      alumnosDelGrupo: vi.fn(),
      alumno: vi.fn(),
      recordatorio: vi.fn(),
      editarGrupo: vi.fn(),
      docentes: vi.fn(async () => []),
    },
  };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import Grupo from "./Grupo";

function DondeEstoy() {
  const l = useLocation();
  return <p data-testid="destino">{`${l.pathname}${l.search}`}</p>;
}

async function montar() {
  render(
    <MemoryRouter initialEntries={["/academia/grupos/7"]}>
      <Routes>
        <Route path="/academia/grupos/:id" element={<Grupo />} />
        <Route path="*" element={<DondeEstoy />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.permisos = null;
  sesion.propios = [];
  vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle());
  vi.mocked(apiAcademia.alumnosDelGrupo).mockResolvedValue({ items: [MATEO, CAMILA], total: 28, page: 1, pageSize: 20 });
  vi.mocked(apiAcademia.alumno).mockResolvedValue(fichaCamila());
});

describe("E3 · detalle de grupo", () => {
  it("cabecera, materias y los indicadores como filtros", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: "Barbería y Peluquería · L-V 10:00–12:00" })).toBeInTheDocument();
    expect(screen.getByText(/Central · Aula 2 · Prof. Marco Rojas · hasta el 13-nov/)).toBeInTheDocument();
    expect(screen.getByText(/M2 Degradados · actual/)).toBeInTheDocument();
    const filtros = screen.getByRole("tablist", { name: "Filtrar alumnos" });
    expect(within(filtros).getByRole("tab", { name: "Todos 28" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(within(filtros).getByRole("tab", { name: "Deben 5" }));
    await act(async () => {});
    expect(apiAcademia.alumnosDelGrupo).toHaveBeenLastCalledWith(7, "deben", { page: 1, pageSize: 20 });
    // 28 alumnos: la barra de páginas con el pie del grupo.
    expect(screen.getByText(/Mostrando 1–20 de 28/)).toHaveTextContent(/M2 cobrado a 22 · base del docente Bs\s?6\.930/);
  });

  it("tocar la fila abre el panel con el estado de cuenta, y Cobrar lleva al POS", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver a Bustillos Rek, Camila" }));
    await act(async () => {});
    const panel = screen.getByRole("complementary", { name: "Bustillos Rek, Camila" });
    expect(apiAcademia.alumno).toHaveBeenCalledWith(52);
    expect(within(panel).getByText("Cuota 2 · M2–M3")).toBeInTheDocument();
    expect(within(panel).getByText(/vencida 12 d/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: /Cobrar Bs\s?750/ }));
    expect(screen.getByTestId("destino")).toHaveTextContent("/pos?inscripcion=102&sede=1&sedeNombre=Central");
  });

  it("WhatsApp desde el panel pide el recordatorio de la cuota vencida y abre wa.me", async () => {
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.mocked(apiAcademia.recordatorio).mockResolvedValue({ telefono: "59175512340", texto: "Hola", url: "https://wa.me/59175512340?text=Hola" });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver a Bustillos Rek, Camila" }));
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    });
    expect(apiAcademia.recordatorio).toHaveBeenCalledWith(902);
    expect(abrir).toHaveBeenCalledWith("https://wa.me/59175512340?text=Hola", "_blank", "noopener,noreferrer");
    abrir.mockRestore();
  });

  it("Asistencia y Notas llegan después", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Asistencia" }));
    expect(screen.getByText("Próximamente")).toBeInTheDocument();
  });

  it("el docente ve a sus alumnos sin montos ni Cobrar", async () => {
    sesion.permisos = ["academia.ver"];
    sesion.propios = ["academia.ver"];
    await montar();
    expect(screen.queryByRole("tab", { name: /Deben/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cobrar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Inscribir/ })).not.toBeInTheDocument();
  });

  it("cancelar el grupo pide confirmación, lo marca y deja de inscribir", async () => {
    // La coordinación: arma los grupos.
    sesion.permisos = ["academia.ver", "academia.grupos", "academia.inscribir", "academia.cobranza"];
    vi.mocked(apiAcademia.editarGrupo).mockResolvedValue(grupoDetalle({ cancelado: true, avisos: [] }));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones del grupo" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancelar grupo" }));
    const confirmar = screen.getByRole("dialog", { name: "Cancelar el grupo" });
    await act(async () => {
      fireEvent.click(within(confirmar).getByRole("button", { name: "Cancelar grupo" }));
    });
    expect(apiAcademia.editarGrupo).toHaveBeenCalledWith(7, { cancelado: true });
    expect(screen.getByRole("status")).toHaveTextContent("Grupo cancelado");
    expect(screen.getByRole("button", { name: "Inscribir alumno" })).toBeDisabled();
  });
});
