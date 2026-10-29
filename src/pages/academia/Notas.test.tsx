import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
  it("cada nota con su estado de pago, en letras y con su resultado", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: "Notas · M2 Degradados" })).toBeInTheDocument();
    expect(screen.getByText("setenta y seis")).toBeInTheDocument();
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
    expect(screen.getAllByText("Sin nota").length).toBeGreaterThan(0);
    // El docente ve sólo el semáforo (QA 23-oct): nada de "Sin pagar".
    expect(screen.queryByText("Sin pagar")).not.toBeInTheDocument();
  });

  it("cerrar con notas que faltan avisa; con lo tipeado sin guardar, «Guardar y cerrar» guarda y después cierra", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar notas del módulo" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Falta 1 nota");
    expect(apiAcademia.cerrarNotas).not.toHaveBeenCalled();
    vi.mocked(apiAcademia.guardarNotas).mockResolvedValue(conNotas({ 102: 60 }));
    fireEvent.change(screen.getByLabelText("Nota de Bustillos Rek, Camila"), { target: { value: "60" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar y cerrar" }));
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
    // La recepción sigue con "Pagado / Sin pagar".
    expect(screen.getByText("Sin pagar")).toBeInTheDocument();
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
    expect(screen.getByText("Reprobado")).toBeInTheDocument();
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
  it("dentro del plazo, lo dice arriba", async () => {
    await montar();
    expect(screen.getByText(/Las notas se cargan del 10-oct al 14-nov\./)).toBeInTheDocument();
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
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cerrar notas del módulo" }));
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
    expect(screen.getByRole("button", { name: "Cerrar notas del módulo" })).toBeDisabled();
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
  it("con semáforo, rojo o amarillo en vez de «Pagado / Sin pagar»; la recepción sigue como siempre", async () => {
    vi.mocked(apiAcademia.notas).mockResolvedValue({
      ...NOTAS,
      items: [
        { inscripcionId: 101, nombre: "Andrade Villca, Mateo", estadoPago: null, nota: 76, semaforo: "AMARILLO" },
        { inscripcionId: 102, nombre: "Bustillos Rek, Camila", estadoPago: null, nota: null, semaforo: null },
      ],
    });
    await montar();
    expect(screen.getByLabelText("Debe, en semana de espera")).toBeInTheDocument();
    expect(screen.queryByText("Pagado")).not.toBeInTheDocument();
    // Nunca bloquea: la nota se carga igual.
    expect(screen.getByText("setenta y seis")).toBeInTheDocument();
  });
});
