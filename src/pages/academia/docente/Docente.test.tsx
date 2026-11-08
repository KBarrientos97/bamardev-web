import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseDelDia, ListaDeClase, LlegadaRegistrada } from "../../../lib/academia/tipos";
import { fmtHora } from "../../../lib/format";

/**
 * Las pantallas del docente (E11a, N6, E16): sus clases con cuántos pagaron,
 * pasar lista con el estado de pago (nunca montos) y su planilla con
 * cantidades, sin nombres ni montos por estudiante.
 */

/** Los permisos del docente en cada prueba: `null` = los de fábrica. */
const quien = vi.hoisted(() => ({ permisos: null as string[] | null }));

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_DOCENTE: base } = await import("../../../test/academiaFixtures");
  const { puedeVer } = await import("../../../lib/permisos");
  return {
    useAuth: () => {
      const s = quien.permisos
        ? { ...base, usuario: { ...base.usuario, permisos: quien.permisos, permisosPropios: quien.permisos } }
        : base;
      return {
      ...s,
      puede: (sec: Parameters<typeof puedeVer>[1]) =>
        puedeVer({ features: s.negocio.features, rubro: "ACADEMIA", permisos: s.usuario.permisos, permisosPropios: s.usuario.permisosPropios }, sec),
      };
    },
  };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { misClases: vi.fn(), llegada: vi.fn(), lista: vi.fn(), guardarLista: vi.fn(), grupo: vi.fn(), planilla: vi.fn(), planillaDocente: vi.fn() },
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
  quien.permisos = null;
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
    // Su barra de abajo en el celular: Mis clases y Notas (sin "Mi planilla" desde D1, 22-oct,
    // y sin "Pasar lista" desde el rediseño de noviembre: se pasa desde cada clase).
    const barra = within(screen.getByRole("navigation", { name: "Secciones del docente" }));
    expect(barra.getAllByRole("link").map((l) => l.textContent)).toEqual(["Mis clases", "Notas"]);
  });

  it("rediseño de noviembre: la clase que sigue va grande, con el horario, cuántos son y los dos botones", async () => {
    vi.mocked(apiAcademia.misClases).mockResolvedValue({
      fecha: "2026-10-16",
      clases: [
        { ...CLASE, sesionId: 12, horaInicio: "07:00", horaFin: "08:30", nombre: "L-M-V 07:00–08:30" },
        { ...CLASE, semaforos: { rojo: 1, amarillo: 1 } },
      ],
      proximas: [{ fecha: "2026-10-19", grupoId: 7, nombre: "L-M-V 09:00–11:00", carrera: "Barbería", materia: { orden: 2, nombre: "Degradados" }, horaInicio: "09:00", horaFin: "11:00", aula: "Aula 2" }],
    });
    render(
      <MemoryRouter>
        <MisClases />
      </MemoryRouter>,
    );
    await act(async () => {});
    // La de las 07:00 ya terminó: la grande es la de las 09:00.
    const grande = screen.getByRole("article", { name: "Tu próxima clase" });
    expect(grande).toHaveTextContent("09:00 a 11:00");
    expect(grande).toHaveTextContent("Barbería · M2 Degradados");
    expect(grande).toHaveTextContent("Aula 2 · Central");
    expect(within(grande).getByText("en 12 min")).toBeInTheDocument();
    expect(grande).toHaveTextContent("22estudiantes");
    expect(grande).toHaveTextContent("2deben la cuota");
    expect(within(grande).getByRole("link", { name: "Pasar lista" })).toHaveAttribute("href", "/academia/lista?grupo=7");
    expect(within(grande).getByRole("link", { name: "Notas del módulo" })).toHaveAttribute("href", "/academia/notas?grupo=7");
    // La que terminó, chica debajo.
    expect(screen.getByRole("region", { name: "Más clases de hoy" })).toHaveTextContent("07:00 a 08:30");
    // Las próximas, con el cuadrito del día.
    const proxima = within(screen.getByRole("region", { name: "Próximas clases" })).getByRole("listitem");
    expect(proxima).toHaveTextContent("19LUN");
    expect(proxima).toHaveTextContent("09:00 · Barbería");
    expect(proxima).toHaveTextContent("M2 Degradados · Aula 2");
  });

  it("al volver a la pestaña vuelve a pedir las clases (la llegada que marcó la recepción no queda vieja)", async () => {
    render(
      <MemoryRouter>
        <MisClases />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(apiAcademia.misClases).toHaveBeenCalledTimes(1);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(apiAcademia.misClases).toHaveBeenCalledTimes(2);
  });
});

describe("D7 · el «Llegué» del docente en Mis clases", () => {
  const LLEGADA_8_48 = new Date(2026, 9, 16, 8, 48).toISOString();
  const REGISTRADA: LlegadaRegistrada = {
    sesionId: 11,
    llegadaEn: LLEGADA_8_48,
    atrasoMin: 0,
    toleranciaMin: 10,
    conAtraso: false,
    minutosAntes: 12,
    muyTemprano: false,
    // Como lo manda el backend real cuando no hay descuento: null (ronda 2, T6).
    descuento: null,
  };

  async function montar() {
    render(
      <MemoryRouter>
        <MisClases />
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  it("marca la llegada con la hora del servidor y muestra la hora, sin montos ni descuentos", async () => {
    // El backend manda el descuento; el docente no lo ve jamás (RM 0008/2016, semáforo).
    vi.mocked(apiAcademia.llegada).mockResolvedValue({ ...REGISTRADA, descuento: { monto: 150, porMinuto: 5 } });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Llegué" }));
    });
    expect(apiAcademia.llegada).toHaveBeenCalledWith(11, false);
    // Con los espacios normalizados como los lee getByText: en Node 24 (ICU 77)
    // la hora sale "08:48 a.\u00A0m." (con espacio duro) y la pantalla se lee
    // con espacio común, así que comparar el texto crudo fallaba según la PC.
    expect(screen.getByText(`Llegaste a las ${fmtHora(LLEGADA_8_48)}`.replace(/\s+/g, " "))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Llegué" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Bs|150|descuento|atraso/i);
    // Vuelve a pedir las clases: el estado viene del servidor.
    expect(apiAcademia.misClases).toHaveBeenCalledTimes(2);
  });

  it("si llegó con atraso, dice los minutos con tono neutro (sin monto)", async () => {
    vi.mocked(apiAcademia.llegada).mockResolvedValue({ ...REGISTRADA, atrasoMin: 6, conAtraso: true, descuento: { monto: 30 } });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Llegué" }));
    });
    const linea = screen.getByText(/Llegaste a las/).closest("p")!;
    expect(linea).toHaveTextContent("6 min de atraso");
    expect(linea.innerHTML).not.toMatch(/warning|danger/);
    expect(document.body).not.toHaveTextContent(/Bs|descuento/i);
  });

  it("más de una hora antes: pregunta y, si confirma, reenvía con confirmarTemprano", async () => {
    vi.mocked(apiAcademia.llegada)
      .mockRejectedValueOnce(
        new ApiError("Faltan 120 minutos para la clase.", 409, { codigo: "LLEGADA_MUY_TEMPRANO", minutosAntes: 120, horaInicio: "09:00" }),
      )
      .mockResolvedValueOnce({ ...REGISTRADA, muyTemprano: true, minutosAntes: 120 });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Llegué" }));
    });
    const dialogo = screen.getByRole("dialog", { name: "Todavía falta para la clase" });
    expect(dialogo).toHaveTextContent("Faltan 2 h para que empiece la clase (09:00). ¿Marcás tu llegada igual?");
    // Todavía no se registró nada.
    expect(screen.queryByText(/Llegaste a las/)).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Sí, marcar mi llegada" }));
    });
    expect(apiAcademia.llegada).toHaveBeenLastCalledWith(11, true);
    expect(screen.getByText(/Llegaste a las/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Todavía falta para la clase" })).not.toBeInTheDocument();
  });

  it("«Cancelar» deja todo como estaba", async () => {
    vi.mocked(apiAcademia.llegada).mockRejectedValue(
      new ApiError("Faltan 90 minutos.", 409, { codigo: "LLEGADA_MUY_TEMPRANO", minutosAntes: 90, horaInicio: "09:00" }),
    );
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Llegué" }));
    });
    expect(screen.getByRole("dialog")).toHaveTextContent("Faltan 1 h 30 min para que empiece la clase");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Llegué" })).toBeEnabled();
    expect(apiAcademia.llegada).toHaveBeenCalledTimes(1);
  });

  it("otro error del servidor (otro día, clase de un compañero) se muestra tal cual", async () => {
    vi.mocked(apiAcademia.llegada).mockRejectedValue(new ApiError("La llegada se marca el día de la clase.", 400, { codigo: "LLEGADA_OTRO_DIA" }));
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Llegué" }));
    });
    expect(screen.getByText("La llegada se marca el día de la clase.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Llegué" })).toBeEnabled();
  });

  it("si ya marcó su llegada (la recepción o él antes), muestra la hora y no ofrece el botón", async () => {
    vi.mocked(apiAcademia.misClases).mockResolvedValue({
      fecha: "2026-10-16",
      clases: [{ ...CLASE, llegadaEn: LLEGADA_8_48, atrasoMin: 4 }],
      proximas: [],
    });
    await montar();
    expect(screen.getByText(`Llegaste a las ${fmtHora(LLEGADA_8_48)}`.replace(/\s+/g, " "))).toBeInTheDocument();
    expect(screen.getByText(/4 min de atraso/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Llegué" })).not.toBeInTheDocument();
  });

  it("revisión 08-nov: dentro de la tolerancia es llegar a horario (sin «min de atraso»); pasada, los minutos", async () => {
    vi.mocked(apiAcademia.misClases).mockResolvedValue({
      fecha: "2026-10-16",
      clases: [{ ...CLASE, llegadaEn: LLEGADA_8_48, atrasoMin: 3, conAtraso: false, toleranciaMin: 10 }],
      proximas: [],
    });
    await montar();
    expect(screen.getByText(/Llegaste a las/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/atraso/);
    cleanup();
    vi.mocked(apiAcademia.misClases).mockResolvedValue({
      fecha: "2026-10-16",
      clases: [{ ...CLASE, llegadaEn: LLEGADA_8_48, atrasoMin: 12, conAtraso: true, toleranciaMin: 10 }],
      proximas: [],
    });
    await montar();
    expect(screen.getByText(/12 min de atraso/)).toBeInTheDocument();
  });

  it("revisión 08-nov: el «Llegué» dentro de la tolerancia tampoco dice atraso", async () => {
    vi.mocked(apiAcademia.llegada).mockResolvedValue({ ...REGISTRADA, atrasoMin: 3, conAtraso: false });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Llegué" }));
    });
    expect(screen.getByText(/Llegaste a las/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/atraso/);
  });

  it("sin el permiso asistencia.llegadas no hay botón: dice que la marca la recepción", async () => {
    quien.permisos = ["academia.ver", "asistencia.registrar", "notas.registrar"];
    await montar();
    expect(screen.queryByRole("button", { name: "Llegué" })).not.toBeInTheDocument();
    expect(screen.getByText("La recepción marca tu llegada cuando llegás")).toBeInTheDocument();
  });

  it("rediseño de noviembre: sin el permiso, la llegada que marcó la recepción en verde, y «tarde» sólo con conAtraso", async () => {
    quien.permisos = ["academia.ver", "asistencia.registrar", "notas.registrar"];
    vi.mocked(apiAcademia.misClases).mockResolvedValue({
      fecha: "2026-10-16",
      clases: [{ ...CLASE, llegadaEn: LLEGADA_8_48, atrasoMin: 4, conAtraso: false, toleranciaMin: 10 }],
      proximas: [],
    });
    await montar();
    const linea = screen.getByText(/La recepción marcó tu llegada a las/).closest("p")!;
    expect(linea).toHaveTextContent(`La recepción marcó tu llegada a las ${fmtHora(LLEGADA_8_48)}`.replace(/\s+/g, " "));
    expect(linea).not.toHaveTextContent(/tarde/);
    expect(linea.className).toMatch(/emerald/);
    expect(screen.queryByRole("button", { name: "Llegué" })).not.toBeInTheDocument();
    cleanup();
    vi.mocked(apiAcademia.misClases).mockResolvedValue({
      fecha: "2026-10-16",
      clases: [{ ...CLASE, llegadaEn: LLEGADA_8_48, atrasoMin: 12, conAtraso: true, toleranciaMin: 10 }],
      proximas: [],
    });
    await montar();
    expect(screen.getByText(/La recepción marcó tu llegada a las/).closest("p")).toHaveTextContent("· 12 min tarde");
    expect(document.body).not.toHaveTextContent(/Bs|descuento/i);
  });

  it("con el permiso, la llegada ya marcada no dice «la recepción»", async () => {
    vi.mocked(apiAcademia.misClases).mockResolvedValue({
      fecha: "2026-10-16",
      clases: [{ ...CLASE, llegadaEn: LLEGADA_8_48, atrasoMin: 0 }],
      proximas: [],
    });
    await montar();
    expect(screen.getByText(/Llegaste a las/)).toBeInTheDocument();
    expect(screen.queryByText(/La recepción/)).not.toBeInTheDocument();
  });

  it("ronda 2 · más de 3 h antes: no hay botón, y dice desde qué hora se marca (texto a la vista)", async () => {
    // 05:30 para una clase de las 09:00: la ventana abre a las 06:00.
    vi.setSystemTime(new Date(2026, 9, 16, 5, 30));
    await montar();
    expect(screen.queryByRole("button", { name: "Llegué" })).not.toBeInTheDocument();
    expect(screen.getByText("Tu llegada se marca desde las 06:00.")).toBeInTheDocument();
  });

  it("ronda 2 · justo a las 3 h antes ya hay botón", async () => {
    vi.setSystemTime(new Date(2026, 9, 16, 6, 0));
    await montar();
    expect(screen.getByRole("button", { name: "Llegué" })).toBeEnabled();
    expect(screen.queryByText(/Tu llegada se marca desde/)).not.toBeInTheDocument();
  });

  it("ronda 2: si el servidor dice LLEGADA_FUERA_DE_HORARIO (reloj distinto), muestra su mensaje sin dejar nada a medias", async () => {
    vi.mocked(apiAcademia.llegada).mockRejectedValue(
      new ApiError("Tu clase es a las 09:00: la llegada se marca desde 3 horas antes.", 400, { codigo: "LLEGADA_FUERA_DE_HORARIO", horaInicio: "09:00" }),
    );
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Llegué" }));
    });
    expect(screen.getByText("Tu clase es a las 09:00: la llegada se marca desde 3 horas antes.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Llegué" })).toBeEnabled();
  });

  it("una clase que ya terminó no ofrece el botón", async () => {
    vi.setSystemTime(new Date(2026, 9, 16, 11, 30));
    await montar();
    expect(screen.queryByRole("button", { name: "Llegué" })).not.toBeInTheDocument();
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

  it("R13: la barra de «Guardar lista» se apoya en la del docente sólo si esa se dibuja", async () => {
    const barra = () => screen.getByRole("button", { name: /^Guardar lista/ }).closest(".fixed")!;
    await montar();
    expect(screen.getByRole("navigation", { name: "Secciones del docente" })).toBeInTheDocument();
    expect(barra().className).toContain("bottom-[57px]");
    cleanup();
    // Sin Notas queda una sola sección: no hay barra de abajo y no se deja el hueco de 57 px.
    quien.permisos = ["academia.ver", "asistencia.registrar"];
    await montar();
    expect(screen.queryByRole("navigation", { name: "Secciones del docente" })).not.toBeInTheDocument();
    expect(barra().className).not.toContain("bottom-[57px]");
    expect(barra().className).toContain("bottom-0");
  });

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
    // Las pastillas de arriba, en vivo.
    expect(screen.getByLabelText("Totales de la lista")).toHaveTextContent("1 presente0 tarde2 ausentes");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar lista" }));
    });
    expect(apiAcademia.guardarLista).toHaveBeenCalledWith(7, "2026-10-16", [
      { inscripcionId: 101, estado: "PRESENTE" },
      { inscripcionId: 102, estado: "AUSENTE" },
      { inscripcionId: 103, estado: "AUSENTE" },
    ]);
    expect(screen.getByRole("status")).toHaveTextContent(/podés corregirla hasta el final del día/);
  });

  it("rediseño de noviembre: el encabezado dice de qué clase es, ayuda a empezar y, guardada, ofrece volver a mis clases", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: "Pasar lista" })).toBeInTheDocument();
    expect(screen.getByText("Barbería y Peluquería · M2 Degradados · Vie 16-oct, 09:00")).toBeInTheDocument();
    expect(screen.getByText("Todos arrancan presentes: tocá sólo a quien faltó o llegó tarde.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Volver a mis clases" })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar lista" }));
    });
    expect(screen.getByRole("link", { name: "Volver a mis clases" })).toHaveAttribute("href", "/academia/mis-clases");
  });

  it("sin semáforo prendido nadie «debe la cuota» y no hay filtro", async () => {
    await montar();
    expect(screen.queryByText("debe la cuota")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Deben la cuota/ })).not.toBeInTheDocument();
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

describe("revisión 08-nov · Pasar lista avisa antes de perder lo marcado", () => {
  /** Dónde quedó la app (para ver si salió o se quedó). */
  let ubicacion = "";
  function Ubicacion() {
    const l = useLocation();
    ubicacion = l.pathname + l.search;
    return null;
  }

  async function montar() {
    render(
      <MemoryRouter initialEntries={["/academia/lista?grupo=7"]}>
        <Ubicacion />
        <Routes>
          <Route path="/academia/lista" element={<PasarLista />} />
          <Route path="/academia/mis-clases" element={<p>Mis clases</p>} />
          <Route path="/academia/notas" element={<p>Notas</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  const marcarAusente = (nombre: string) =>
    fireEvent.click(within(screen.getByRole("group", { name: `Asistencia de ${nombre}` })).getByRole("button", { name: "Ausente" }));

  it("sin tocar nada (todos arrancan presentes) sale sin preguntar", async () => {
    await montar();
    fireEvent.click(screen.getAllByRole("link", { name: /Mis clases/ })[0]);
    expect(ubicacion).toBe("/academia/mis-clases");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("con cambios, volver pregunta: «Seguir pasando lista» se queda y «Salir sin guardar» sale sin guardar", async () => {
    await montar();
    marcarAusente("Bustillos Rek, Camila");
    // El «volver» del encabezado y la barra del docente (celular): los dos preguntan.
    const [volver, barraDocente] = screen.getAllByRole("link", { name: /Mis clases/ });
    fireEvent.click(barraDocente);
    expect(ubicacion).toBe("/academia/lista?grupo=7");
    const dialogo = screen.getByRole("dialog", { name: "La lista no se guardó" });
    expect(dialogo).toHaveTextContent("Cambiaste la asistencia de 1");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Seguir pasando lista" }));
    expect(ubicacion).toBe("/academia/lista?grupo=7");
    expect(within(screen.getByRole("group", { name: "Asistencia de Bustillos Rek, Camila" })).getByRole("button", { name: "Ausente" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(volver);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Salir sin guardar" }));
    expect(ubicacion).toBe("/academia/mis-clases");
    expect(apiAcademia.guardarLista).not.toHaveBeenCalled();
  });

  it("«Notas del módulo» con cambios pregunta, y «Guardar y salir» guarda la lista antes de ir", async () => {
    await montar();
    marcarAusente("Bustillos Rek, Camila");
    fireEvent.click(screen.getByRole("link", { name: /Notas del/ }));
    expect(ubicacion).toBe("/academia/lista?grupo=7");
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Guardar y salir" }));
    });
    expect(apiAcademia.guardarLista).toHaveBeenCalledWith(7, "2026-10-16", [
      { inscripcionId: 101, estado: "PRESENTE" },
      { inscripcionId: 102, estado: "AUSENTE" },
      { inscripcionId: 103, estado: "AUSENTE" },
    ]);
    expect(ubicacion).toBe("/academia/notas?grupo=7");
  });

  it("si guardar falla, no sale y muestra el error", async () => {
    vi.mocked(apiAcademia.guardarLista).mockRejectedValue(new ApiError("La lista cerró", 403, { codigo: "LISTA_CERRADA" }));
    await montar();
    marcarAusente("Bustillos Rek, Camila");
    fireEvent.click(screen.getAllByRole("link", { name: /Mis clases/ })[0]);
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Guardar y salir" }));
    });
    expect(ubicacion).toBe("/academia/lista?grupo=7");
    expect(screen.getByText(/La lista de ese día ya cerró/)).toBeInTheDocument();
  });

  it("con cambios el navegador pregunta al cerrar; ya guardada, ni el navegador ni volver preguntan", async () => {
    await montar();
    const sinCambios = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(sinCambios);
    expect(sinCambios.defaultPrevented).toBe(false);
    marcarAusente("Bustillos Rek, Camila");
    const conCambios = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(conCambios);
    expect(conCambios.defaultPrevented).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Guardar lista/ }));
    });
    const guardada = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(guardada);
    expect(guardada.defaultPrevented).toBe(false);
    fireEvent.click(screen.getAllByRole("link", { name: /Mis clases/ })[0]);
    expect(ubicacion).toBe("/academia/mis-clases");
  });

  it("una lista que ya cerró (no editable) no pregunta nada", async () => {
    vi.mocked(apiAcademia.lista).mockResolvedValue({ ...LISTA, editable: false });
    await montar();
    fireEvent.click(screen.getAllByRole("link", { name: /Mis clases/ })[0]);
    expect(ubicacion).toBe("/academia/mis-clases");
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
    // «debe la cuota» (rediseño de noviembre), rojo o ámbar según el semáforo; el detalle en la etiqueta.
    expect(screen.getByLabelText("Debe, pasó la semana de espera")).toHaveTextContent("debe la cuota");
    expect(screen.getByLabelText("Debe, pasó la semana de espera").innerHTML).toMatch(/danger/);
    expect(screen.getByLabelText("Debe, en semana de espera")).toHaveTextContent("debe la cuota");
    expect(screen.getByLabelText("Debe, en semana de espera").innerHTML).toMatch(/warning/);
    expect(screen.getAllByText("debe la cuota")).toHaveLength(2);
    for (const viejo of ["Pagado", "Abonó", "Sin pagar"]) expect(screen.queryByText(viejo)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bs/)).not.toBeInTheDocument();
    // Nunca bloquea: el que debe se marca igual.
    const camila = screen.getByRole("group", { name: "Asistencia de Bustillos Rek, Camila" });
    expect(within(camila).getByRole("button", { name: "Ausente" })).toBeEnabled();
    expect(screen.queryByText(/Pagaron el M/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Deben la cuota/ }));
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
    // Cuatro botones iguales, de pulgar, con lo que entra en un cuarto de celular.
    expect(within(joaquin).getAllByRole("button").map((b) => b.textContent)).toEqual(["Presente", "Tarde", "Ausente", "Justif."]);
    for (const b of within(joaquin).getAllByRole("button")) expect(b.className).toContain("min-h-11");
    // Lo guardado manda: venía Tarde.
    expect(within(joaquin).getByRole("button", { name: "Tarde" })).toHaveAttribute("aria-pressed", "true");
    const camila = screen.getByRole("group", { name: "Asistencia de Bustillos Rek, Camila" });
    fireEvent.click(within(camila).getByRole("button", { name: "Justificado" }));
    expect(within(camila).getByRole("button", { name: "Justificado" })).toHaveAttribute("aria-pressed", "true");
    expect(within(camila).getByRole("button", { name: "Presente" })).toHaveAttribute("aria-pressed", "false");
    // Cada estado en su pastilla.
    expect(screen.getByLabelText("Totales de la lista")).toHaveTextContent("1 presente1 tarde0 ausentes1 justificado");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar lista" }));
    });
    expect(apiAcademia.guardarLista).toHaveBeenCalledWith(7, "2026-10-16", [
      { inscripcionId: 101, estado: "PRESENTE" },
      { inscripcionId: 102, estado: "JUSTIFICADO" },
      { inscripcionId: 103, estado: "TARDE" },
    ]);
  });

  it("sin semáforo en la respuesta el docente no ve nada del pago, nunca «Pagado / Sin pagar»", async () => {
    await montar();
    expect(screen.queryByText("Sin pagar")).not.toBeInTheDocument();
    expect(screen.queryByText("debe la cuota")).not.toBeInTheDocument();
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
    expect(screen.getByLabelText("Debe, en semana de espera")).toHaveTextContent("debe la cuota");
    expect(screen.queryByText(/Pagaron el M/)).not.toBeInTheDocument();
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
    expect(screen.getByText("deben la cuota")).toBeInTheDocument();
    expect(screen.getByText("1 pasó la espera · 2 en semana de espera")).toBeInTheDocument();
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
