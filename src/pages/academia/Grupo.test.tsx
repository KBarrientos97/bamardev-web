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
      aulas: vi.fn(async () => []),
      choques: vi.fn(async () => ({ hayChoques: false, aula: [], docentes: [] })),
      alumnosDelGrupo: vi.fn(),
      alumno: vi.fn(),
      recordatorio: vi.fn(),
      editarGrupo: vi.fn(),
      docentes: vi.fn(async () => []),
    },
  };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { ESPERA_CHOQUES_MS } from "../../lib/academia/choques";
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
    // U4: «Al día» es el complemento de «Deben»; ya no es un filtro ni se cuenta aparte.
    expect(within(filtros).queryByRole("tab", { name: /Al día/ })).not.toBeInTheDocument();
    expect(apiAcademia.alumnosDelGrupo).not.toHaveBeenCalledWith(7, "aldia", expect.anything());
    expect(within(filtros).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Todos 28", "Deben 5", "Retirados 1"]);
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
    // D6: el módulo con su nombre, como habla el instituto (los nombres vienen en la cuota).
    expect(within(panel).getByText("Cuota 2 · M2 Degradados y M3 Barba y color")).toBeInTheDocument();
    expect(within(panel).getByText(/vencida 12 d/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: /Cobrar Bs\s?750/ }));
    expect(screen.getByTestId("destino")).toHaveTextContent("/academia/cobranza/cobrar?inscripcion=102&sede=1&sedeNombre=Central");
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

  it("el docente ve a sus estudiantes sin montos, sin Cobrar y sin «pagaron» (sólo el semáforo, QA 23-oct)", async () => {
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
    expect(screen.queryByText("Sin pagar")).not.toBeInTheDocument();
    expect(screen.queryByText("Pagado")).not.toBeInTheDocument();
    expect(screen.queryByText(/Pagaron el M/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Falta pagar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pagado por/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bs/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver a Bustillos Rek, Camila" }));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ficha completa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Deben/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cobrar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Inscribir/ })).not.toBeInTheDocument();
  });

  it("B7: con el semáforo, el docente ve rojo o amarillo en vez de «Pagado / Sin pagar»", async () => {
    sesion.permisos = ["academia.ver"];
    sesion.propios = ["academia.ver"];
    vi.mocked(apiAcademia.alumnosDelGrupo).mockImplementation(async (_id, _f, p = {}) =>
      p.pageSize === 1
        ? { items: [], total: 2, page: 1, pageSize: 1 }
        : {
            items: [
              { ...MATEO, saldo: null, estadoPago: null, semaforo: null },
              { ...CAMILA, saldo: null, estadoPago: null, semaforo: "ROJO", pagos: CAMILA.pagos.map((x) => ({ ...x, detalle: null })) },
            ],
            total: 2,
            page: 1,
            pageSize: 20,
          },
    );
    await montar();
    expect(screen.getAllByLabelText("Debe, pasó la semana de espera").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sin pagar")).not.toBeInTheDocument();
    expect(screen.queryByText("Pagado")).not.toBeInTheDocument();
    expect(screen.queryByText(/Bs/)).not.toBeInTheDocument();
  });

  it("QA 23-oct: al docente le llega el grupo sin deben, alDia ni resumenCobro; «Con deuda» cuenta por semáforo", async () => {
    sesion.permisos = ["academia.ver"];
    sesion.propios = ["academia.ver"];
    const { deben: _d, alDia: _a, resumenCobro: _r, montoDebe: _m, ...sinCobro } = grupoDetalle();
    vi.mocked(apiAcademia.grupo).mockResolvedValue(sinCobro as never);
    await montar();
    expect(document.body).not.toHaveTextContent("undefined");
    expect(document.body).not.toHaveTextContent("NaN");
    expect(screen.getByRole("tab", { name: /Con deuda/ })).toBeInTheDocument();
    expect(apiAcademia.alumnosDelGrupo).toHaveBeenCalledWith(7, "deben", expect.anything());
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

  it("con el panel del estudiante abierto, editar o cancelar el grupo lo cierran antes (sin dos cosas abiertas a la vez)", async () => {
    sesion.permisos = ["academia.ver", "academia.grupos", "academia.inscribir", "academia.cobranza"];
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver a Bustillos Rek, Camila" }));
    await act(async () => {});
    expect(screen.getByRole("complementary", { name: "Bustillos Rek, Camila" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones del grupo" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Editar grupo" }));
    });
    expect(screen.getByRole("dialog", { name: "Editar grupo" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Bustillos Rek, Camila" })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: "Editar grupo" })).getByRole("button", { name: "Cancelar" }));
    });

    fireEvent.click(screen.getByRole("button", { name: "Ver a Bustillos Rek, Camila" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Más acciones del grupo" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Cancelar grupo" }));
    });
    expect(screen.getByRole("dialog", { name: "Cancelar el grupo" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Bustillos Rek, Camila" })).not.toBeInTheDocument();
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

describe("Errores del backend con código (auditoría de octubre): el mensaje se muestra tal cual", () => {
  const COORDINACION = ["academia.ver", "academia.grupos", "academia.inscribir", "academia.cobranza"];

  it("GRUPO_CON_INSCRITOS (409) al cancelar: el mensaje del backend dice qué hacer y el grupo no queda cancelado", async () => {
    sesion.permisos = COORDINACION;
    const mensaje =
      "El grupo tiene 3 estudiantes inscritos: pasalos a otro grupo (Cambiar de grupo) o retiralos antes de cancelarlo. Lo que pagaron no se toca.";
    vi.mocked(apiAcademia.editarGrupo).mockRejectedValue(new ApiError(mensaje, 409, { codigo: "GRUPO_CON_INSCRITOS", inscritos: 3 }));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones del grupo" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancelar grupo" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: "Cancelar el grupo" })).getByRole("button", { name: "Cancelar grupo" }));
    });
    expect(screen.getByText(mensaje)).toBeInTheDocument();
    expect(screen.queryByText("No se pudo guardar")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("INICIO_NO_MOVIBLE (409) al editar el grupo: el mensaje queda dentro del formulario, sin taparlo", async () => {
    sesion.permisos = COORDINACION;
    const mensaje = "Ya hay clases dictadas: el inicio del grupo ya no se mueve. Cambiá las fechas de los módulos que faltan desde cada módulo.";
    vi.mocked(apiAcademia.editarGrupo).mockRejectedValue(new ApiError(mensaje, 409, { codigo: "INICIO_NO_MOVIBLE" }));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones del grupo" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Editar grupo" }));
    });
    const dialogo = screen.getByRole("dialog", { name: "Editar grupo" });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(within(dialogo).getByText(mensaje)).toBeInTheDocument();
    expect(dialogo).toBeInTheDocument();
  });

  it("GRUPO_CANCELADO (400) en el recordatorio: se muestra el mensaje y el panel vuelve a pedir la ficha", async () => {
    const mensaje = "Esa cuota es de un grupo cancelado: no se le manda recordatorio.";
    vi.mocked(apiAcademia.recordatorio).mockRejectedValue(new ApiError(mensaje, 400, { codigo: "GRUPO_CANCELADO" }));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver a Bustillos Rek, Camila" }));
    await act(async () => {});
    const antes = vi.mocked(apiAcademia.alumno).mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar QR por WhatsApp" }));
    });
    expect(screen.getByText(mensaje)).toBeInTheDocument();
    expect(vi.mocked(apiAcademia.alumno).mock.calls.length).toBeGreaterThan(antes);
  });
});

describe("BACK-5 y C10 · editar el aula y los docentes del grupo", () => {
  const COORDINACION = ["academia.ver", "academia.grupos", "academia.inscribir", "academia.cobranza"];
  const aula = (id: number, nombre: string) => ({ id, almacenId: 1, sede: { id: 1, nombre: "Central" }, nombre, capacidad: null, activa: true, enUso: 0 });
  const LUCIA = { personalId: 10, nombre: "Lucía Paz", sedes: [{ id: 1, nombre: "Central" }], pctDocente: null, retencionPct: null, tieneLogin: false };
  const esperarAviso = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, ESPERA_CHOQUES_MS + 80));
    });

  async function abrirEdicion() {
    sesion.permisos = COORDINACION;
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones del grupo" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Editar grupo" }));
    });
    return screen.getByRole("dialog", { name: "Editar grupo" });
  }

  it("elige el aula de la lista de la sede del grupo y manda aulaId", async () => {
    vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle({ aulaId: 22, aula: "Aula 2" }));
    vi.mocked(apiAcademia.aulas).mockResolvedValue([aula(21, "Aula 1"), aula(22, "Aula 2")]);
    vi.mocked(apiAcademia.editarGrupo).mockResolvedValue(grupoDetalle({ aulaId: 21, aula: "Aula 1" }));
    const dialogo = await abrirEdicion();
    expect(apiAcademia.aulas).toHaveBeenCalledWith({ sede: 1, soloActivas: true });
    const select = within(dialogo).getByLabelText("Aula") as HTMLSelectElement;
    expect(select).toHaveValue("22");
    fireEvent.change(select, { target: { value: "21" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    const cambios = vi.mocked(apiAcademia.editarGrupo).mock.calls[0][1];
    expect(cambios.aulaId).toBe(21);
    expect(cambios).not.toHaveProperty("aula");
  });

  it("«Sin aula» manda aulaId null", async () => {
    vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle({ aulaId: 22, aula: "Aula 2" }));
    vi.mocked(apiAcademia.aulas).mockResolvedValue([aula(22, "Aula 2")]);
    vi.mocked(apiAcademia.editarGrupo).mockResolvedValue(grupoDetalle({ aulaId: null, aula: null }));
    const dialogo = await abrirEdicion();
    fireEvent.change(within(dialogo).getByLabelText("Aula"), { target: { value: "" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(vi.mocked(apiAcademia.editarGrupo).mock.calls[0][1].aulaId).toBeNull();
  });

  it("un aula de baja que el grupo ya tenía se conserva en el selector, marcada, y no se pierde al editar el cupo", async () => {
    vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle({ aulaId: 22, aula: "Aula 2" }));
    // La lista de activas ya no la trae.
    vi.mocked(apiAcademia.aulas).mockResolvedValue([aula(21, "Aula 1")]);
    vi.mocked(apiAcademia.editarGrupo).mockResolvedValue(grupoDetalle());
    const dialogo = await abrirEdicion();
    const select = within(dialogo).getByLabelText("Aula") as HTMLSelectElement;
    expect(select).toHaveValue("22");
    expect(within(select).getByRole("option", { name: "Aula 2 (de baja)" })).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText(/^Cupo/), { target: { value: "25" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    const cambios = vi.mocked(apiAcademia.editarGrupo).mock.calls[0][1];
    expect(cambios.cupo).toBe(25);
    expect(cambios).not.toHaveProperty("aulaId");
    expect(cambios).not.toHaveProperty("aula");
  });

  it("un grupo viejo con el aula en texto sin enlazar la conserva hasta que se elija otra", async () => {
    vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle({ aulaId: null, aula: "Sala B" }));
    vi.mocked(apiAcademia.aulas).mockResolvedValue([aula(21, "Aula 1")]);
    vi.mocked(apiAcademia.editarGrupo).mockResolvedValue(grupoDetalle());
    const dialogo = await abrirEdicion();
    expect(within(dialogo).getByRole("option", { name: "Sala B (sin enlazar)" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(vi.mocked(apiAcademia.editarGrupo).mock.calls[0][1]).not.toHaveProperty("aulaId");
  });

  it("al cambiar el aula avisa el choque (sin contarse a sí mismo), y guarda igual", async () => {
    vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle({ aulaId: 22, aula: "Aula 2" }));
    vi.mocked(apiAcademia.aulas).mockResolvedValue([aula(21, "Aula 1"), aula(22, "Aula 2")]);
    vi.mocked(apiAcademia.choques).mockResolvedValue({
      hayChoques: true,
      aula: [
        {
          grupoId: 40,
          nombre: "Base",
          carrera: { id: 4, nombre: "Uñas" },
          sede: { id: 1, nombre: "Central" },
          horario: "Lu Ma Mi Ju Vi 10:00–12:00",
          dias: [1, 2, 3, 4, 5],
          horaInicio: "10:00",
          horaFin: "12:00",
          fechaInicio: "2026-08-17",
          fechaFin: "2026-11-13",
        },
      ],
      docentes: [],
    });
    vi.mocked(apiAcademia.editarGrupo).mockResolvedValue(grupoDetalle());
    const dialogo = await abrirEdicion();
    // Sin tocar nada no hay nada que avisar.
    await esperarAviso();
    expect(apiAcademia.choques).not.toHaveBeenCalled();
    fireEvent.change(within(dialogo).getByLabelText("Aula"), { target: { value: "21" } });
    await esperarAviso();
    expect(apiAcademia.choques).toHaveBeenCalledWith(
      expect.objectContaining({ almacenId: 1, aulaId: 21, excluirGrupoId: 7, horaInicio: "10:00", horaFin: "12:00", fechaInicio: "2026-08-17", fechaFin: "2026-11-13" }),
    );
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("El aula «Aula 1» ya está ocupada de Lu Ma Mi Ju Vi 10:00–12:00 por Uñas (Base).");
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar igual" }));
    });
    expect(apiAcademia.editarGrupo).toHaveBeenCalledTimes(1);
  });

  it("al cambiar el docente de un módulo, pregunta sólo por el nuevo", async () => {
    vi.mocked(apiAcademia.docentes).mockResolvedValue([
      { personalId: 9, nombre: "Marco Rojas", sedes: [{ id: 1, nombre: "Central" }], pctDocente: null, retencionPct: null, tieneLogin: true },
      LUCIA,
    ]);
    vi.mocked(apiAcademia.choques).mockResolvedValue({
      hayChoques: true,
      aula: [],
      docentes: [
        {
          personalId: 10,
          docente: "Lucía Paz",
          grupoId: 41,
          nombre: "Base",
          carrera: { id: 3, nombre: "Barbería" },
          sede: { id: 2, nombre: "Base" },
          horario: "Lu Ma Mi Ju Vi 10:00–12:00",
          dias: [1, 2, 3, 4, 5],
          horaInicio: "10:00",
          horaFin: "12:00",
          desde: "2026-10-17",
          hasta: "2026-11-13",
        },
      ],
    });
    const dialogo = await abrirEdicion();
    fireEvent.change(within(dialogo).getByLabelText("Docente de M3"), { target: { value: "10" } });
    await esperarAviso();
    expect(vi.mocked(apiAcademia.choques).mock.calls.at(-1)![0]).toMatchObject({ docentes: [10], excluirGrupoId: 7 });
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("El docente Lucía Paz ya dicta Barbería (Base) Lu Ma Mi Ju Vi 10:00–12:00 en Base.");
  });

  it("si el aviso falla, se puede guardar igual", async () => {
    vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle({ aulaId: 22, aula: "Aula 2" }));
    vi.mocked(apiAcademia.aulas).mockResolvedValue([aula(21, "Aula 1"), aula(22, "Aula 2")]);
    vi.mocked(apiAcademia.choques).mockRejectedValue(new Error("Failed to fetch"));
    vi.mocked(apiAcademia.editarGrupo).mockResolvedValue(grupoDetalle());
    const dialogo = await abrirEdicion();
    fireEvent.change(within(dialogo).getByLabelText("Aula"), { target: { value: "21" } });
    await esperarAviso();
    expect(within(dialogo).getByText(/No pudimos revisar/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(apiAcademia.editarGrupo).toHaveBeenCalledTimes(1);
  });
});
