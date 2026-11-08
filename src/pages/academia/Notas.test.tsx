import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ApiError } from "../../lib/api";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotasDelGrupo } from "../../lib/academia/tipos";

/**
 * E13 · Cargar notas: cada nota en letras y con su resultado; cerrar pide que
 * estén todas; la deuda no impide nada. L7 (28-oct): nada se guarda solo, todo
 * va en un "Guardar notas"; las pestañas son de lo guardado; salir con cambios
 * pregunta; y las notas se cargan sólo dentro del plazo del módulo.
 */

const sesion = vi.hoisted(() => ({ recepcion: false }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_DOCENTE, SESION_SECRETARIA } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...(sesion.recepcion ? SESION_SECRETARIA : SESION_DOCENTE), puede: () => true }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { notas: vi.fn(), guardarNotas: vi.fn(), cerrarNotas: vi.fn(), reabrirNotas: vi.fn(), grupo: vi.fn(), grupos: vi.fn() },
  };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { grupoDetalle } from "../../test/academiaFixtures";
import Notas from "./Notas";

const NOTAS: NotasDelGrupo = {
  materia: { id: 32, orden: 2, nombre: "Degradados", desde: "2026-10-10", hasta: "2026-11-09" },
  plazo: { desde: "2026-10-10", hasta: "2026-11-14", estado: "ABIERTO" },
  materias: [
    { id: 31, orden: 1, nombre: "Corte clásico", estado: "CERRADA" },
    { id: 32, orden: 2, nombre: "Degradados", estado: "ACTUAL" },
  ],
  cerrada: false,
  notaMinima: 51,
  escalaMax: 100,
  items: [
    { inscripcionId: 101, nombre: "Andrade Villca, Mateo", estadoPago: "PAGADO", nota: 76 },
    { inscripcionId: 102, nombre: "Bustillos Rek, Camila", estadoPago: "SIN_PAGAR", nota: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  sesion.recepcion = false;
  vi.mocked(apiAcademia.notas).mockResolvedValue(NOTAS);
  vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle());
  vi.mocked(apiAcademia.guardarNotas).mockResolvedValue(undefined);
  vi.mocked(apiAcademia.cerrarNotas).mockResolvedValue({});
});

/** Dónde quedó la app (para ver si salió o se quedó). */
let ubicacion = "";
function Ubicacion() {
  const l = useLocation();
  ubicacion = l.pathname + l.search;
  return null;
}

async function montar() {
  render(
    <MemoryRouter initialEntries={["/academia/notas?grupo=7"]}>
      <Ubicacion />
      <Routes>
        <Route path="/academia/notas" element={<Notas />} />
        <Route path="/academia/mis-clases" element={<p>Mis clases</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

/** Lo que devuelve el PUT: las notas como quedaron. */
const conNotas = (cambios: Record<number, number | null>): NotasDelGrupo => ({
  ...NOTAS,
  items: NOTAS.items.map((i) => (i.inscripcionId in cambios ? { ...i, nota: cambios[i.inscripcionId] } : i)),
});

const barra = () => screen.queryByRole("region", { name: "Notas sin guardar" });
const guardarNotas = async () => {
  await act(async () => {
    fireEvent.click(within(barra()!).getByRole("button", { name: "Guardar notas" }));
  });
};

describe("E13 · Notas", () => {
  it("rediseño de noviembre: el docente ve la escala, y cada fila «aprueba», «reprueba» o «sin nota» contra la mínima", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: "Notas · M2 Degradados" })).toBeInTheDocument();
    expect(screen.getByText(/· sobre 100, aprueba con 51$/)).toBeInTheDocument();
    expect(screen.getByText("aprueba")).toBeInTheDocument();
    expect(screen.getByText("sin nota")).toBeInTheDocument();
    // Lo tipeado ya dice si aprueba (antes de guardar): 50 con mínima 51 reprueba.
    fireEvent.change(screen.getByLabelText("Nota de Bustillos Rek, Camila"), { target: { value: "50" } });
    expect(screen.getByText("reprueba")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nota de Bustillos Rek, Camila"), { target: { value: "51" } });
    expect(screen.getAllByText("aprueba")).toHaveLength(2);
    // La casilla, de pulgar y numérica.
    const casilla = screen.getByLabelText("Nota de Andrade Villca, Mateo");
    expect(casilla).toHaveAttribute("inputmode", "numeric");
    expect(casilla.className).toContain("min-h-11");
    expect(casilla.className).toContain("text-center");
    // Sin indicadores, ni pago, ni nota en letras: la fila es el nombre, si aprueba y la nota.
    expect(screen.queryByText("setenta y seis")).not.toBeInTheDocument();
    expect(screen.queryByText("Promedio")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin pagar")).not.toBeInTheDocument();
  });

  it("rediseño de noviembre: «Guardar notas» y «Terminé: cerrar notas del módulo» quedan fijos abajo para el docente", async () => {
    await montar();
    const abajo = screen.getByRole("region", { name: "Acciones de las notas" });
    expect(abajo.className).toContain("fixed");
    // Sin cambios no hay nada que guardar.
    expect(within(abajo).getByRole("button", { name: "Guardar notas" })).toBeDisabled();
    expect(within(abajo).getByRole("button", { name: "Terminé: cerrar notas del módulo" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Nota de Bustillos Rek, Camila"), { target: { value: "60" } });
    expect(within(barra()!).getByRole("button", { name: "Guardar notas" })).toBeEnabled();
  });

  it("cerrar con notas que faltan avisa; con lo tipeado sin guardar, «Terminé» guarda y después cierra", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Terminé: cerrar notas del módulo" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Falta 1 nota");
    expect(apiAcademia.cerrarNotas).not.toHaveBeenCalled();
    vi.mocked(apiAcademia.guardarNotas).mockResolvedValue(conNotas({ 102: 60 }));
    fireEvent.change(screen.getByLabelText("Nota de Bustillos Rek, Camila"), { target: { value: "60" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Terminé: cerrar notas del módulo" }));
    });
    expect(apiAcademia.guardarNotas).toHaveBeenCalledTimes(1);
    expect(apiAcademia.guardarNotas).toHaveBeenCalledWith(7, 32, [{ inscripcionId: 102, nota: 60 }]);
    expect(apiAcademia.cerrarNotas).toHaveBeenCalledWith(7, 32);
    expect(vi.mocked(apiAcademia.guardarNotas).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(apiAcademia.cerrarNotas).mock.invocationCallOrder[0]);
  });

  it("recepción, sin notas.registrar, las ve en sólo lectura y sin cerrar (QA ronda 2, B-05)", async () => {
    sesion.recepcion = true;
    await montar();
    expect(screen.getByLabelText("Nota de Andrade Villca, Mateo")).toBeDisabled();
    expect(screen.getByLabelText("Nota de Bustillos Rek, Camila")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Cerrar notas/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Sólo lectura/)).toBeInTheDocument();
    // La recepción sigue con "Pagado / Sin pagar", la nota en letras y los indicadores.
    expect(screen.getByText("Sin pagar")).toBeInTheDocument();
    expect(screen.getByText("setenta y seis")).toBeInTheDocument();
    expect(screen.getByText("Promedio")).toBeInTheDocument();
    // Sin notas.registrar no se le dice hasta cuándo cargar.
    expect(screen.queryByText(/Podés cargar y corregir/)).not.toBeInTheDocument();
  });
});

describe("L7 · Notas: borrador y «Guardar notas»", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("nada se guarda solo: ni al soltar la casilla ni tras una pausa; queda «Sin guardar» con su barra", async () => {
    await montar();
    vi.useFakeTimers();
    const camila = screen.getByLabelText("Nota de Bustillos Rek, Camila");
    expect(barra()).not.toBeInTheDocument();
    fireEvent.change(camila, { target: { value: "62" } });
    fireEvent.blur(camila);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(apiAcademia.guardarNotas).not.toHaveBeenCalled();
    expect(screen.getByText("Sin guardar")).toBeInTheDocument();
    expect(barra()).toHaveTextContent("1 cambio sin guardar");
  });

  it("«Guardar notas» manda UN solo pedido con todas las cambiadas, y la barra se va", async () => {
    vi.mocked(apiAcademia.guardarNotas).mockResolvedValue(conNotas({ 101: 80, 102: 45 }));
    await montar();
    fireEvent.change(screen.getByLabelText("Nota de Andrade Villca, Mateo"), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("Nota de Bustillos Rek, Camila"), { target: { value: "45" } });
    expect(barra()).toHaveTextContent("2 cambios sin guardar");
    await guardarNotas();
    expect(apiAcademia.guardarNotas).toHaveBeenCalledTimes(1);
    expect(apiAcademia.guardarNotas).toHaveBeenCalledWith(7, 32, [
      { inscripcionId: 101, nota: 80 },
      { inscripcionId: 102, nota: 45 },
    ]);
    expect(barra()).not.toBeInTheDocument();
    expect(screen.getByText("2 notas guardadas.")).toBeInTheDocument();
    expect(screen.getByText("reprueba")).toBeInTheDocument();
  });

  it("una nota inválida se marca y no se manda nada (tampoco las buenas)", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Nota de Andrade Villca, Mateo"), { target: { value: "80" } });
    const camila = screen.getByLabelText("Nota de Bustillos Rek, Camila");
    fireEvent.change(camila, { target: { value: "75.5" } });
    expect(camila).toHaveValue("75.5");
    expect(screen.getByText("Sin decimales")).toBeInTheDocument();
    expect(barra()).toHaveTextContent("2 cambios sin guardar · 1 no es válida");
    await guardarNotas();
    expect(apiAcademia.guardarNotas).not.toHaveBeenCalled();
    expect(screen.getByText("Hay 1 nota que no es válida: corregila para guardar.")).toBeInTheDocument();
    fireEvent.change(camila, { target: { value: "150" } });
    expect(screen.getByText("De 1 a 100")).toBeInTheDocument();
  });

  it("si el backend responde NOTA_INVALIDA, se marcan las casillas de su detalle", async () => {
    vi.mocked(apiAcademia.guardarNotas).mockRejectedValue(
      new ApiError("Las notas van de 1 a 100.", 400, { codigo: "NOTA_INVALIDA", inscripciones: [102], escalaMax: 100 }),
    );
    await montar();
    const camila = screen.getByLabelText("Nota de Bustillos Rek, Camila");
    fireEvent.change(camila, { target: { value: "55" } });
    await guardarNotas();
    expect(screen.getByText("No se guardó: De 1 a 100")).toBeInTheDocument();
    expect(camila).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Las notas van de 1 a 100.")).toBeInTheDocument();
    // Sigue el borrador: no se perdió lo tipeado.
    expect(camila).toHaveValue("55");
  });

  it("«Sin nota»: 8 → 85, la fila sigue ahí y se guarda una sola vez con 85", async () => {
    vi.mocked(apiAcademia.guardarNotas).mockResolvedValue(conNotas({ 102: 85 }));
    await montar();
    fireEvent.click(screen.getByRole("tab", { name: /Sin nota/ }));
    const camila = screen.getByLabelText("Nota de Bustillos Rek, Camila");
    fireEvent.change(camila, { target: { value: "8" } });
    expect(screen.getByLabelText("Nota de Bustillos Rek, Camila")).toBe(camila);
    fireEvent.change(camila, { target: { value: "85" } });
    expect(screen.getByLabelText("Nota de Bustillos Rek, Camila")).toBe(camila);
    expect(apiAcademia.guardarNotas).not.toHaveBeenCalled();
    await guardarNotas();
    expect(apiAcademia.guardarNotas).toHaveBeenCalledTimes(1);
    expect(apiAcademia.guardarNotas).toHaveBeenCalledWith(7, 32, [{ inscripcionId: 102, nota: 85 }]);
    // Guardada, ya no es "sin nota".
    expect(screen.queryByLabelText("Nota de Bustillos Rek, Camila")).not.toBeInTheDocument();
  });

  it("Enter pasa a la casilla siguiente sin guardar", async () => {
    await montar();
    const mateo = screen.getByLabelText("Nota de Andrade Villca, Mateo");
    mateo.focus();
    fireEvent.keyDown(mateo, { key: "Enter" });
    expect(screen.getByLabelText("Nota de Bustillos Rek, Camila")).toHaveFocus();
    expect(apiAcademia.guardarNotas).not.toHaveBeenCalled();
  });

  it("con cambios, cambiar de módulo pregunta: «Seguir cargando» se queda y «Salir sin guardar» cambia", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Nota de Bustillos Rek, Camila"), { target: { value: "70" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "31" } });
    const dialogo = screen.getByRole("dialog", { name: "Hay notas sin guardar" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Seguir cargando" }));
    expect(ubicacion).toBe("/academia/notas?grupo=7");
    expect(screen.getByLabelText("Nota de Bustillos Rek, Camila")).toHaveValue("70");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "31" } });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Salir sin guardar" }));
    });
    expect(ubicacion).toBe("/academia/notas?grupo=7&modulo=31");
    expect(apiAcademia.guardarNotas).not.toHaveBeenCalled();
  });

  it("con cambios, «Mis clases» pregunta y «Guardar y salir» guarda antes de ir", async () => {
    vi.mocked(apiAcademia.guardarNotas).mockResolvedValue(conNotas({ 102: 70 }));
    await montar();
    fireEvent.change(screen.getByLabelText("Nota de Bustillos Rek, Camila"), { target: { value: "70" } });
    // El "volver" del encabezado y la barra del docente (celular): los dos preguntan.
    const [volver, barraDocente] = screen.getAllByRole("link", { name: /Mis clases/ });
    fireEvent.click(barraDocente);
    expect(ubicacion).toBe("/academia/notas?grupo=7");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Seguir cargando" }));
    fireEvent.click(volver);
    expect(ubicacion).toBe("/academia/notas?grupo=7");
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Guardar y salir" }));
    });
    expect(apiAcademia.guardarNotas).toHaveBeenCalledWith(7, 32, [{ inscripcionId: 102, nota: 70 }]);
    expect(ubicacion).toBe("/academia/mis-clases");
  });

  it("sin cambios, salir no pregunta; con cambios, cerrar o recargar la pestaña pide confirmación", async () => {
    await montar();
    const sinCambios = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(sinCambios);
    expect(sinCambios.defaultPrevented).toBe(false);
    fireEvent.change(screen.getByLabelText("Nota de Bustillos Rek, Camila"), { target: { value: "70" } });
    const conCambios = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(conCambios);
    expect(conCambios.defaultPrevented).toBe(true);
  });
});

describe("L7 · el plazo de las notas (del inicio a 5 días después del fin)", () => {
  it("dentro del plazo, el aviso dice hasta cuándo se cargan y corrigen", async () => {
    await montar();
    const aviso = screen.getByText(/Podés cargar y corregir notas/).closest("p")!;
    expect(aviso).toHaveTextContent("Podés cargar y corregir notas hasta el sábado 14 de noviembre. Después se cierran solas.");
    expect(aviso.className).toContain("bg-info-bg");
  });

  it("con un backend sin `plazo`, el aviso sale del `notasHasta` del grupo, sólo en su último módulo", async () => {
    const sinPlazo = { ...NOTAS, materias: [...NOTAS.materias, { id: 33, orden: 3, nombre: "Barba", estado: "FUTURA" as const }] };
    delete (sinPlazo as Partial<NotasDelGrupo>).plazo;
    vi.mocked(apiAcademia.notas).mockResolvedValue(sinPlazo);
    vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle({ notasHasta: "2026-11-18" }));
    await montar();
    // El M2 no es el último: no se inventa un plazo.
    expect(screen.queryByText(/Podés cargar y corregir/)).not.toBeInTheDocument();
    cleanup();
    vi.mocked(apiAcademia.notas).mockResolvedValue({ ...sinPlazo, materias: NOTAS.materias });
    await montar();
    expect(screen.getByText(/Podés cargar y corregir notas hasta el miércoles 18 de noviembre/)).toBeInTheDocument();
  });

  it("pasado el plazo: sólo lectura y lo dice, pero cerrar se puede", async () => {
    vi.mocked(apiAcademia.notas).mockResolvedValue({
      ...NOTAS,
      items: NOTAS.items.map((i) => ({ ...i, nota: 70 })),
      plazo: { desde: "2026-10-10", hasta: "2026-11-14", estado: "VENCIDO" },
    });
    await montar();
    expect(screen.getByLabelText("Nota de Bustillos Rek, Camila")).toBeDisabled();
    expect(screen.getByText(/Pasó el plazo: las notas de este módulo se cargaban del 10-oct al 14-nov\./)).toBeInTheDocument();
    expect(screen.queryByText(/Podés cargar y corregir/)).not.toBeInTheDocument();
    // Sin poder cargar, abajo queda sólo cerrar.
    expect(screen.queryByRole("button", { name: "Guardar notas" })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Terminé: cerrar notas del módulo" }));
    });
    expect(apiAcademia.cerrarNotas).toHaveBeenCalledWith(7, 32);
  });

  it("antes de que empiece: sólo lectura, el plazo y sin cerrar", async () => {
    vi.mocked(apiAcademia.notas).mockResolvedValue({
      ...NOTAS,
      plazo: { desde: "2026-11-10", hasta: "2026-12-14", estado: "ANTES" },
    });
    await montar();
    expect(screen.getByLabelText("Nota de Andrade Villca, Mateo")).toBeDisabled();
    expect(screen.getByText(/El módulo todavía no empezó: las notas se cargan del 10-nov al 14-dic\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminé: cerrar notas del módulo" })).toBeDisabled();
  });

  it("si el plazo vence con la pantalla abierta, el 409 se muestra y se vuelve a leer", async () => {
    vi.mocked(apiAcademia.guardarNotas).mockRejectedValue(
      new ApiError("Pasó el plazo de las notas de ese módulo: se cargaban del 10-oct al 14-nov.", 409, { codigo: "NOTAS_FUERA_DE_PLAZO" }),
    );
    await montar();
    fireEvent.change(screen.getByLabelText("Nota de Bustillos Rek, Camila"), { target: { value: "70" } });
    vi.mocked(apiAcademia.notas).mockResolvedValue({ ...NOTAS, plazo: { desde: "2026-10-10", hasta: "2026-11-14", estado: "VENCIDO" } });
    await guardarNotas();
    await act(async () => {});
    expect(screen.getByText(/Pasó el plazo de las notas de ese módulo/)).toBeInTheDocument();
    expect(apiAcademia.notas).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Nota de Bustillos Rek, Camila")).toBeDisabled();
  });
});

describe("B7 · el semáforo en las notas del docente", () => {
  it("rediseño de noviembre: el docente no ve el pago en las notas (está en Pasar lista), y la nota se carga igual", async () => {
    vi.mocked(apiAcademia.notas).mockResolvedValue({
      ...NOTAS,
      items: [
        { inscripcionId: 101, nombre: "Andrade Villca, Mateo", estadoPago: null, nota: 76, semaforo: "AMARILLO" },
        { inscripcionId: 102, nombre: "Bustillos Rek, Camila", estadoPago: null, nota: null, semaforo: null },
      ],
    });
    await montar();
    expect(screen.queryByLabelText("Debe, en semana de espera")).not.toBeInTheDocument();
    expect(screen.queryByText("Pagado")).not.toBeInTheDocument();
    // Nunca bloquea: la nota se carga igual.
    expect(screen.getByLabelText("Nota de Andrade Villca, Mateo")).toBeEnabled();
    expect(screen.getByText("aprueba")).toBeInTheDocument();
  });
});

describe("revisión 08-nov · el último módulo en los días de gracia", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 16, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  async function montarSinGrupo() {
    render(
      <MemoryRouter initialEntries={["/academia/notas"]}>
        <Ubicacion />
        <Routes>
          <Route path="/academia/notas" element={<Notas />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  const enCurso = grupoDetalle({ id: 7, estado: "EN_CURSO", fechaFin: "2026-12-12", notasHasta: "2026-12-17" });
  // Terminó el 13-nov: hoy (16-nov) todavía se cargan sus notas, hasta el 18.
  const enGracia = grupoDetalle({ id: 8, horaInicio: "15:00", horaFin: "17:00", estado: "TERMINADO", fechaFin: "2026-11-13", notasHasta: "2026-11-18" });
  // Terminó en octubre: su plazo ya pasó.
  const vencido = grupoDetalle({ id: 9, horaInicio: "18:00", horaFin: "20:00", estado: "TERMINADO", fechaFin: "2026-10-09", notasHasta: "2026-10-14" });
  const lista = (items: unknown[]) => ({ items, paginacion: { page: 1, pageSize: 100, total: items.length } }) as never;

  it("un grupo terminado sale mientras dure el plazo de sus notas (y lo dice); uno vencido, no", async () => {
    vi.mocked(apiAcademia.grupos).mockResolvedValue(lista([enCurso, enGracia, vencido]));
    await montarSinGrupo();
    const opciones = within(screen.getByRole("combobox", { name: "Grupo" }))
      .getAllByRole("option")
      .map((o) => o.getAttribute("value"));
    expect(opciones).toEqual(["", "7", "8"]);
    expect(screen.getByRole("option", { name: /terminó, notas hasta el/ })).toHaveValue("8");
  });

  it("si es el único que le queda al docente, entra directo (como uno en curso)", async () => {
    vi.mocked(apiAcademia.grupos).mockResolvedValue(lista([enGracia, vencido]));
    await montarSinGrupo();
    expect(ubicacion).toBe("/academia/notas?grupo=8");
  });

  it("con un backend sin `notasHasta`, la misma regla con el fin del grupo", async () => {
    const sinCampo = (g: ReturnType<typeof grupoDetalle>) => {
      const copia: Partial<ReturnType<typeof grupoDetalle>> = { ...g };
      delete copia.notasHasta;
      return copia;
    };
    vi.mocked(apiAcademia.grupos).mockResolvedValue(lista([sinCampo(enGracia), sinCampo(vencido)]));
    await montarSinGrupo();
    expect(ubicacion).toBe("/academia/notas?grupo=8");
  });
});
