import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAMILA, fichaCamila, grupoDetalle, MATEO } from "../../test/academiaFixtures";

/**
 * E3 · Detalle de grupo, versión limpia: los indicadores son los filtros,
 * tocar una fila abre el panel del estudiante con su estado de cuenta y "Cobrar"
 * lleva a "Cobrar a estudiante" con la inscripción. Asistencia y Notas son sus pantallas; el
 * docente ve sólo si pagaron el módulo actual (ronda 2, D6).
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
import { ApiError } from "../../lib/api";
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
  // La lista, y los números de cada filtro (pedidos con una página de 1 fila).
  const TOTALES = { todos: 28, deben: 5, aldia: 23, retirados: 1 } as const;
  vi.mocked(apiAcademia.alumnosDelGrupo).mockImplementation(async (_id, filtro = "todos", p = {}) =>
    p.pageSize === 1
      ? { items: [], total: TOTALES[filtro], page: 1, pageSize: 1 }
      : { items: [MATEO, CAMILA], total: TOTALES[filtro], page: 1, pageSize: 20 },
  );
  vi.mocked(apiAcademia.alumno).mockResolvedValue(fichaCamila());
});

describe("E3 · detalle de grupo", () => {
  it("cabecera, materias y los indicadores como filtros", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: "Barbería y Peluquería · L-V 10:00–12:00" })).toBeInTheDocument();
    expect(screen.getByText(/Central · Aula 2 · Prof. Marco Rojas · M2 Degradados \(17-sep al 16-oct\)/)).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === "M2 Degradados · oct · actual")).toBeInTheDocument();
    const filtros = screen.getByRole("tablist", { name: "Filtrar estudiantes" });
    expect(within(filtros).getByRole("tab", { name: "Todos 28" })).toHaveAttribute("aria-selected", "true");
    // 28 alumnos: la barra de páginas con el pie del grupo.
    expect(screen.getByText(/Mostrando 1–20 de 28/)).toHaveTextContent(/M2 pagado por 22 de 28/);
    // Los números son los de cada lista: "Todos" incluye al retirado.
    expect(within(filtros).getByRole("tab", { name: "Retirados 1" })).toBeInTheDocument();
    expect(within(filtros).getByRole("tab", { name: "Al día 23" })).toBeInTheDocument();
    fireEvent.click(within(filtros).getByRole("tab", { name: "Deben 5" }));
    await act(async () => {});
    expect(apiAcademia.alumnosDelGrupo).toHaveBeenLastCalledWith(7, "deben", { page: 1, pageSize: 20 });
  });

  it("el nombre abre el panel, Cobrar es otro botón (no uno dentro del otro) y con el panel se va la columna", async () => {
    await montar();
    const ver = screen.getByRole("button", { name: "Ver a Bustillos Rek, Camila" });
    const cobrarFila = screen.getByRole("button", { name: "Cobrar a Bustillos Rek, Camila" });
    expect(ver.contains(cobrarFila)).toBe(false);
    expect(cobrarFila.closest("button")).toBe(cobrarFila);
    fireEvent.click(ver);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Cobrar a Bustillos Rek, Camila" })).not.toBeInTheDocument();
    expect(screen.getByText("Debe")).toBeInTheDocument();
  });

  it("tocar la fila abre el panel con el estado de cuenta, y Cobrar lleva a Cobrar a estudiante", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver a Bustillos Rek, Camila" }));
    await act(async () => {});
    const panel = screen.getByRole("complementary", { name: "Bustillos Rek, Camila" });
    expect(apiAcademia.alumno).toHaveBeenCalledWith(52);
    expect(within(panel).getByText("Cuota 2 · M2–M3")).toBeInTheDocument();
    expect(within(panel).getByText(/vencida 12 d/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: /Cobrar Bs\s?750/ }));
    expect(screen.getByTestId("destino")).toHaveTextContent("/academia/cobrar?inscripcion=102&sede=1&sedeNombre=Central");
  });

  it("WhatsApp desde el panel pide el recordatorio de la cuota vencida y abre wa.me", async () => {
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.mocked(apiAcademia.recordatorio).mockResolvedValue({ telefono: "59175512340", texto: "Hola", url: "https://wa.me/59175512340?text=Hola" });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver a Bustillos Rek, Camila" }));
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar QR por WhatsApp" }));
    });
    expect(apiAcademia.recordatorio).toHaveBeenCalledWith(902);
    expect(abrir).toHaveBeenCalledWith("https://wa.me/59175512340?text=Hola", "_blank", "noopener,noreferrer");
    abrir.mockRestore();
  });

  it("Asistencia y Notas llevan a sus pantallas", async () => {
    await montar();
    expect(screen.getByRole("link", { name: "Asistencia" })).toHaveAttribute("href", "/academia/grupos/7/lista");
    expect(screen.getByRole("link", { name: "Notas" })).toHaveAttribute("href", "/academia/grupos/7/notas");
  });

  it("el docente ve a sus estudiantes sin montos ni Cobrar: sólo si pagaron el módulo", async () => {
    sesion.permisos = ["academia.ver"];
    sesion.propios = ["academia.ver"];
    vi.mocked(apiAcademia.alumnosDelGrupo).mockImplementation(async (_id, _f, p = {}) =>
      p.pageSize === 1
        ? { items: [], total: 2, page: 1, pageSize: 1 }
        : {
            items: [
              { ...MATEO, saldo: null, estadoPago: "PAGADO" },
              { ...CAMILA, saldo: null, estadoPago: "SIN_PAGAR", pagos: CAMILA.pagos.map((x) => ({ ...x, detalle: null })) },
            ],
            total: 2,
            page: 1,
            pageSize: 20,
          },
    );
    await montar();
    expect(screen.getAllByText("Sin pagar").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pagado").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Bs/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver a Bustillos Rek, Camila" }));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ficha completa" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Inscribir estudiante" })).toBeDisabled();
  });

  it("recepción, que no carga notas, ve \"Ver notas\" en el menú y no \"Cargar notas\" (QA ronda 2, B-05)", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones del grupo" }));
    expect(screen.getByRole("menuitem", { name: "Ver notas" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Cargar notas" })).not.toBeInTheDocument();
  });

  it("quien carga notas ve \"Cargar notas\"", async () => {
    sesion.permisos = ["academia.ver", "academia.grupos", "notas.registrar"];
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones del grupo" }));
    expect(screen.getByRole("menuitem", { name: "Cargar notas" })).toBeInTheDocument();
  });
});

describe("E3 · errores por alcance (QA ronda 2, N-3)", () => {
  it("un grupo de otra sede: \"Es de otra sede\", con el motivo y volver, sin Reintentar", async () => {
    vi.mocked(apiAcademia.grupo).mockRejectedValue(
      new ApiError("Ese grupo es de otra sede: sólo podés operar en la tuya.", 403, { codigo: "OTRA_SEDE" }),
    );
    await montar();
    expect(screen.getByRole("heading", { name: "Es de otra sede" })).toBeInTheDocument();
    expect(screen.getByText("Ese grupo es de otra sede: sólo podés operar en la tuya.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al calendario" })).toHaveAttribute("href", "/academia/calendario");
  });

  it("un corte de red sigue con Reintentar", async () => {
    vi.mocked(apiAcademia.grupo).mockRejectedValueOnce(new Error("Sin conexión"));
    await montar();
    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(apiAcademia.grupo).toHaveBeenCalledTimes(2);
  });
});
