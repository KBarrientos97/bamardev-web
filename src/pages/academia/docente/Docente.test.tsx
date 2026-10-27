import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseDelDia, ListaDeClase } from "../../../lib/academia/tipos";

/**
 * Las pantallas del docente (E11a, N6, E16): sus clases con cuántos pagaron,
 * pasar lista con el estado de pago (nunca montos) y su planilla con
 * cantidades, sin nombres ni montos por estudiante.
 */

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_DOCENTE: s } = await import("../../../test/academiaFixtures");
  const { puedeVer } = await import("../../../lib/permisos");
  return {
    useAuth: () => ({
      ...s,
      puede: (sec: Parameters<typeof puedeVer>[1]) =>
        puedeVer({ features: s.negocio.features, rubro: "ACADEMIA", permisos: s.usuario.permisos, permisosPropios: s.usuario.permisosPropios }, sec),
    }),
  };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { misClases: vi.fn(), lista: vi.fn(), guardarLista: vi.fn(), grupo: vi.fn(), planilla: vi.fn(), planillaDocente: vi.fn() },
  };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { ApiError } from "../../../lib/api";
import { grupoDetalle } from "../../../test/academiaFixtures";
import MisClases from "./MisClases";
import PasarLista from "./PasarLista";

const CLASE: ClaseDelDia = {
  sesionId: 11,
  grupoId: 7,
  nombre: "L-M-V 09:00–11:00",
  carrera: "Barbería",
  materia: { orden: 2, nombre: "Degradados" },
  horaInicio: "09:00",
  horaFin: "11:00",
  aula: "Aula 2",
  sede: "Central",
  docente: null,
  inscritos: 22,
  pagaronModulo: 17,
  llegadaEn: null,
  atrasoMin: null,
  lista: { pasada: false, presentes: 0, total: 22 },
};

const LISTA: ListaDeClase = {
  sesion: { id: 11, fecha: "2026-10-16", horaInicio: "09:00", horaFin: "11:00", estado: "PROGRAMADA", materia: { orden: 2, nombre: "Degradados" } },
  guardada: false,
  editable: true,
  resumen: { pagaron: 1, total: 3 },
  alumnos: [
    { inscripcionId: 101, nombre: "Andrade Villca, Mateo", estadoPago: "PAGADO", estado: null },
    { inscripcionId: 102, nombre: "Bustillos Rek, Camila", estadoPago: "SIN_PAGAR", estado: null },
    { inscripcionId: 103, nombre: "Céspedes Molina, Joaquín", estadoPago: "ABONO", estado: "AUSENTE" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 8, 48));
  vi.mocked(apiAcademia.misClases).mockResolvedValue({
    fecha: "2026-10-16",
    clases: [CLASE],
    proximas: [{ fecha: "2026-10-19", grupoId: 7, nombre: "Barbería", materia: { orden: 2, nombre: "Degradados" }, horaInicio: "09:00", horaFin: "11:00", aula: "Aula 2" }],
  });
  vi.mocked(apiAcademia.lista).mockResolvedValue(LISTA);
  vi.mocked(apiAcademia.guardarLista).mockResolvedValue(undefined);
  vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle());
});

afterEach(() => vi.useRealTimers());

describe("E11a · Mis clases", () => {
  it("saluda, dice cuántas clases da y cuándo empieza; sin «pagaron el módulo» (sólo el semáforo, QA 23-oct)", async () => {
    render(
      <MemoryRouter>
        <MisClases />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "Hola, Marco" })).toBeInTheDocument();
    expect(screen.getByText("Hoy das 1 clase")).toBeInTheDocument();
    expect(screen.getByText("en 12 min")).toBeInTheDocument();
    expect(screen.queryByText(/pagaron el M2/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pasar lista/ })).toHaveAttribute("href", "/academia/lista?grupo=7");
    expect(screen.getByRole("region", { name: "Próximas clases" })).toBeInTheDocument();
    // Su barra de abajo en el celular: Mis clases y Notas (sin "Mi planilla" desde D1, 22-oct).
    const barra = within(screen.getByRole("navigation", { name: "Secciones del docente" }));
    expect(barra.getAllByRole("link").map((l) => l.textContent)).toEqual(["Mis clases", "Notas"]);
  });
});

describe("N6 · Pasar lista", () => {
  async function montar(ruta = "/academia/lista?grupo=7") {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/academia/lista" element={<PasarLista />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  it("sin montos ni «pagaron»; los no marcados arrancan presentes y se guarda todo junto", async () => {
    await montar();
    // El docente ve sólo el semáforo (QA 23-oct): ni "Pagaron el M2" ni "Sin pagar".
    expect(screen.queryByText("Pagaron el M2")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin pagar")).not.toBeInTheDocument();
    expect(screen.queryByText("Abonó")).not.toBeInTheDocument();
    expect(screen.queryByText(/Bs/)).not.toBeInTheDocument();
    const camila = screen.getByRole("group", { name: "Asistencia de Bustillos Rek, Camila" });
    expect(within(camila).getByRole("button", { name: "Presente" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(camila).getByRole("button", { name: "Ausente" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar lista (1 presente, 2 ausentes)" }));
    });
    expect(apiAcademia.guardarLista).toHaveBeenCalledWith(7, "2026-10-16", [
      { inscripcionId: 101, estado: "PRESENTE" },
      { inscripcionId: 102, estado: "AUSENTE" },
      { inscripcionId: 103, estado: "AUSENTE" },
    ]);
    expect(screen.getByRole("status")).toHaveTextContent(/podés corregirla hasta el final del día/);
  });

  it("sin semáforo prendido, «Con deuda» queda vacío", async () => {
    await montar();
    fireEvent.click(screen.getByRole("tab", { name: /Con deuda/ }));
    expect(screen.queryByText("Andrade Villca, Mateo")).not.toBeInTheDocument();
  });

  it("sin clase ese día lo dice, sin error", async () => {
    vi.mocked(apiAcademia.lista).mockRejectedValue(new ApiError("No hay clase", 404, { codigo: "SIN_CLASE" }));
    await montar();
    expect(screen.getByText("Ese día no hay clase de este grupo")).toBeInTheDocument();
  });

  it("un grupo que no es suyo (404 GRUPO_NO_EXISTE) no es \"no hay clase\": no lo encontramos, y a sus clases (N-3)", async () => {
    vi.mocked(apiAcademia.lista).mockRejectedValue(new ApiError("Ese grupo no existe", 404, { codigo: "GRUPO_NO_EXISTE" }));
    vi.mocked(apiAcademia.grupo).mockRejectedValue(new ApiError("Ese grupo no existe", 404, { codigo: "GRUPO_NO_EXISTE" }));
    await montar("/academia/lista?grupo=83");
    expect(screen.getByRole("heading", { name: "No encontramos este grupo" })).toBeInTheDocument();
    expect(screen.queryByText("Ese día no hay clase de este grupo")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a mis clases" })).toHaveAttribute("href", "/academia/mis-clases");
  });

  it("sin grupo y con una sola clase hoy, abre esa", async () => {
    await montar("/academia/lista");
    expect(apiAcademia.lista).toHaveBeenCalledWith(7, undefined);
  });
});


describe("B7 · semáforo y B8 · Tarde y Justificado en Pasar lista", () => {
  const CON_SEMAFORO: ListaDeClase = {
    ...LISTA,
    alumnos: [
      { inscripcionId: 101, nombre: "Andrade Villca, Mateo", estadoPago: null, estado: null, semaforo: null },
      { inscripcionId: 102, nombre: "Bustillos Rek, Camila", estadoPago: null, estado: null, semaforo: "ROJO" },
      { inscripcionId: 103, nombre: "Céspedes Molina, Joaquín", estadoPago: null, estado: "TARDE", semaforo: "AMARILLO" },
    ],
  };

  async function montar() {
    render(
      <MemoryRouter initialEntries={["/academia/lista?grupo=7"]}>
        <Routes>
          <Route path="/academia/lista" element={<PasarLista />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  it("el docente ve rojo o amarillo, sin «Pagado / Abonó / Sin pagar» ni montos; «Con deuda» filtra por el semáforo", async () => {
    vi.mocked(apiAcademia.lista).mockResolvedValue(CON_SEMAFORO);
    await montar();
    expect(screen.getByLabelText("Debe, pasó la semana de espera")).toHaveTextContent("Debe, pasó la espera");
    expect(screen.getByLabelText("Debe, en semana de espera")).toHaveTextContent("Debe, en espera");
    expect(screen.getByLabelText("Sin deudas vencidas")).toBeInTheDocument();
    for (const viejo of ["Pagado", "Abonó", "Sin pagar"]) expect(screen.queryByText(viejo)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bs/)).not.toBeInTheDocument();
    // Nunca bloquea: el que debe se marca igual.
    const camila = screen.getByRole("group", { name: "Asistencia de Bustillos Rek, Camila" });
    expect(within(camila).getByRole("button", { name: "Ausente" })).toBeEnabled();
    // El indicador cuenta los que tienen deuda, con el color del peor.
    expect(screen.getByText("Con deuda", { selector: "p, span, dt, div" })).toBeInTheDocument();
    expect(screen.getByText("1 pasó la espera")).toBeInTheDocument();
    expect(screen.queryByText(/Pagaron el M/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Con deuda/ }));
    expect(screen.queryByText("Andrade Villca, Mateo")).not.toBeInTheDocument();
    expect(screen.getByText("Bustillos Rek, Camila")).toBeInTheDocument();
    expect(screen.getByText("Céspedes Molina, Joaquín")).toBeInTheDocument();
  });

  it("cuatro estados por estudiante: Tarde y Justificado se guardan con el resto", async () => {
    vi.mocked(apiAcademia.lista).mockResolvedValue(CON_SEMAFORO);
    await montar();
    const joaquin = screen.getByRole("group", { name: "Asistencia de Céspedes Molina, Joaquín" });
    expect(within(joaquin).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Presente",
      "Tarde",
      "Ausente",
      "Justificado",
    ]);
    // Lo guardado manda: venía Tarde.
    expect(within(joaquin).getByRole("button", { name: "Tarde" })).toHaveAttribute("aria-pressed", "true");
    const camila = screen.getByRole("group", { name: "Asistencia de Bustillos Rek, Camila" });
    fireEvent.click(within(camila).getByRole("button", { name: "Justificado" }));
    expect(within(camila).getByRole("button", { name: "Justificado" })).toHaveAttribute("aria-pressed", "true");
    expect(within(camila).getByRole("button", { name: "Presente" })).toHaveAttribute("aria-pressed", "false");
    // Tarde cuenta como presente; Justificado, como ausente.
    expect(screen.getByText(/1 ausente · 1 tarde · 1 justificado/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar lista (2 presentes, 1 ausente)" }));
    });
    expect(apiAcademia.guardarLista).toHaveBeenCalledWith(7, "2026-10-16", [
      { inscripcionId: 101, estado: "PRESENTE" },
      { inscripcionId: 102, estado: "JUSTIFICADO" },
      { inscripcionId: 103, estado: "TARDE" },
    ]);
  });

  it("sin semáforo en la respuesta el docente ve la raya, nunca «Pagado / Sin pagar»", async () => {
    await montar();
    expect(screen.queryByText("Sin pagar")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Sin deudas vencidas").length).toBe(3);
  });
});

describe("QA 23-oct · el docente sin los campos de cobro", () => {
  async function montarLista(ruta = "/academia/lista?grupo=7") {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/academia/lista" element={<PasarLista />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  it("Pasar lista sin `resumen.pagaron` ni `estadoPago`: nada de undefined", async () => {
    vi.mocked(apiAcademia.lista).mockResolvedValue({
      ...LISTA,
      resumen: { total: 3, semaforos: { rojo: 0, amarillo: 1 } },
      alumnos: LISTA.alumnos.map((a, i) => ({ ...a, estadoPago: undefined as never, semaforo: i === 1 ? "AMARILLO" : null })),
    });
    await montarLista();
    expect(document.body).not.toHaveTextContent("undefined");
    expect(screen.getByText("1 de 3")).toBeInTheDocument();
    expect(screen.getByText("en semana de espera")).toBeInTheDocument();
  });

  it("una lista de un día pasado no dice «hasta el final del día»", async () => {
    vi.mocked(apiAcademia.lista).mockResolvedValue({ ...LISTA, sesion: { ...LISTA.sesion, fecha: "2026-10-14" } });
    await montarLista("/academia/lista?grupo=7&fecha=2026-10-14");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Guardar lista/ }));
    });
    const estado = screen.getByRole("status");
    expect(estado).toHaveTextContent(/lista del 14-oct/);
    expect(estado).not.toHaveTextContent(/hasta el final del día/);
  });

  it("Mis clases sin `pagaronModulo`, con los semáforos de la clase", async () => {
    vi.mocked(apiAcademia.misClases).mockResolvedValue({
      fecha: "2026-10-16",
      clases: [{ ...CLASE, pagaronModulo: undefined, semaforos: { rojo: 1, amarillo: 2 } }],
      proximas: [],
    });
    render(
      <MemoryRouter>
        <MisClases />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(document.body).not.toHaveTextContent("undefined");
    expect(screen.getByText("1 pasó la espera")).toBeInTheDocument();
    expect(screen.getByText("2 en semana de espera")).toBeInTheDocument();
  });
});

describe("Pasar lista: CLASE_DE_OTRO_DOCENTE (403)", () => {
  it("muestra el mensaje del backend tal cual cuando la clase la dicta otro docente", async () => {
    const mensaje = "Esa clase la dicta otro docente: la lista la pasa quien la dicta.";
    vi.mocked(apiAcademia.guardarLista).mockRejectedValue(new ApiError(mensaje, 403, { codigo: "CLASE_DE_OTRO_DOCENTE" }));
    render(
      <MemoryRouter initialEntries={["/academia/lista?grupo=7"]}>
        <Routes>
          <Route path="/academia/lista" element={<PasarLista />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Guardar lista/ }));
    });
    expect(screen.getByText(mensaje)).toBeInTheDocument();
    expect(screen.queryByText("No se pudo guardar la lista")).not.toBeInTheDocument();
  });
});
