import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseDelDia, HoyAcademia } from "../../lib/academia/tipos";

/**
 * Las clases de hoy, arriba del Calendario (26-oct): las de la pantalla "Hoy",
 * que salió del menú, con la llegada del docente y la lista.
 */

/** Los permisos de la sesión en cada prueba: `null` = los de la secretaría. */
const quien = vi.hoisted(() => ({ permisos: null as string[] | null, propios: [] as string[] }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return {
    useAuth: () => ({
      ...s,
      usuario: { ...s.usuario, permisos: quien.permisos ?? s.usuario.permisos, permisosPropios: quien.propios },
      puede: () => true,
    }),
  };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: {
      hoy: vi.fn(),
      llegada: vi.fn(),
      borrarLlegada: vi.fn(),
      // Tanda 2 del 08-nov.
      suspenderClase: vi.fn(),
      quitarSuspension: vi.fn(),
      ponerReemplazo: vi.fn(),
      quitarReemplazo: vi.fn(),
      justificarAtraso: vi.fn(),
      quitarJustificacion: vi.fn(),
      docentes: vi.fn(),
    },
  };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { ApiError } from "../../lib/api";
import ClasesDeHoy from "./ClasesDeHoy";

const clase = (extra: Partial<ClaseDelDia>): ClaseDelDia => ({
  sesionId: 1,
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
  pagaronModulo: 17,
  llegadaEn: null,
  atrasoMin: null,
  lista: { pasada: false, presentes: 0, total: 22 },
  ...extra,
});

const HOY: HoyAcademia = {
  fecha: "2026-10-16",
  sede: null,
  cobrar: { venceHoy: 0, venceHoyCuotas: 0, vencido: 0, vencidoCuotas: 0, items: [] },
  preinscripcionesNuevas: 0,
  avisos: [],
  clases: [
    clase({
      sesionId: 1,
      carrera: "Tatuaje",
      nombre: "L-M-V 07:00–09:00",
      horaInicio: "07:00",
      horaFin: "09:00",
      llegadaEn: "2026-10-16T11:12:00.000Z",
      atrasoMin: 12,
      lista: { pasada: true, presentes: 17, total: 18 },
    }),
    clase({ sesionId: 2 }),
    clase({ sesionId: 3, carrera: "Uñas", nombre: "L-V 15:00–17:00", horaInicio: "15:00", horaFin: "17:00", grupoId: 9 }),
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  quien.permisos = null;
  quien.propios = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  // 09:40 en Bolivia.
  vi.setSystemTime(new Date(2026, 9, 16, 9, 40));
  vi.mocked(apiAcademia.hoy).mockResolvedValue(HOY);
  vi.mocked(apiAcademia.llegada).mockResolvedValue({} as never);
});

afterEach(() => vi.useRealTimers());

async function montar() {
  const r = render(
    <MemoryRouter>
      <ClasesDeHoy sucursalId={1} />
    </MemoryRouter>,
  );
  await act(async () => {});
  return r;
}

describe("Clases de hoy (arriba del Calendario)", () => {
  it("terminó, en curso o por empezar, con la llegada y la lista", async () => {
    await montar();
    expect(apiAcademia.hoy).toHaveBeenCalledWith(1);
    const filas = within(screen.getByRole("region", { name: /Clases de hoy/ })).getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("terminó");
    expect(filas[0]).toHaveTextContent(/12 min tarde/);
    expect(filas[0]).toHaveTextContent("Lista 17 de 18");
    expect(filas[1]).toHaveTextContent("en curso");
    expect(filas[1]).toHaveTextContent("Todavía no llegó");
    expect(filas[2]).toHaveTextContent("por empezar");
    // La que ya terminó no ofrece marcar la llegada.
    expect(within(filas[0]).queryByRole("button", { name: "Marcar llegada" })).not.toBeInTheDocument();
  });

  it("marcar la llegada del docente la pide al servidor y recarga", async () => {
    await montar();
    const filas = within(screen.getByRole("region", { name: /Clases de hoy/ })).getAllByRole("listitem");
    await act(async () => {
      fireEvent.click(within(filas[1]).getByRole("button", { name: "Marcar llegada" }));
    });
    expect(apiAcademia.llegada).toHaveBeenCalledWith(2);
    expect(apiAcademia.hoy).toHaveBeenCalledTimes(2);
  });

  it("revisión 08-nov: dentro de la tolerancia es a horario (sin «min tarde» ni ámbar); pasada, sí", async () => {
    const llegada = { llegadaEn: "2026-10-16T13:03:00.000Z", toleranciaMin: 10 };
    vi.mocked(apiAcademia.hoy).mockResolvedValue({
      ...HOY,
      clases: [clase({ sesionId: 1, ...llegada, atrasoMin: 3, conAtraso: false }), clase({ sesionId: 2, ...llegada, atrasoMin: 14, conAtraso: true })],
    });
    await montar();
    const filas = within(screen.getByRole("region", { name: /Clases de hoy/ })).getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent(/Llegó .* · a horario/);
    expect(filas[0]).not.toHaveTextContent(/tarde/);
    expect(filas[0].innerHTML).toMatch(/emerald/);
    expect(filas[0].innerHTML).not.toMatch(/warning/);
    expect(filas[1]).toHaveTextContent(/14 min tarde/);
    expect(filas[1].innerHTML).toMatch(/warning/);
  });

  it("rediseño de noviembre: arriba la fecha y quién marca la llegada, con la tolerancia; el docente con sus iniciales", async () => {
    vi.mocked(apiAcademia.hoy).mockResolvedValue({ ...HOY, clases: HOY.clases.map((c) => ({ ...c, toleranciaMin: 10 })) });
    await montar();
    const tarjeta = screen.getByRole("region", { name: /Clases de hoy/ });
    expect(tarjeta).toHaveTextContent("Viernes 16 de octubre · La llegada del docente la marca la recepción. Tolerancia: 10 min");
    const filas = within(tarjeta).getAllByRole("listitem");
    expect(filas[1]).toHaveTextContent("MRMarco Rojas");
  });

  it("rediseño de noviembre: la llegada se marca también pasada la hora de fin", async () => {
    // 11:30: la de las 09:00–11:00 terminó y nadie marcó al docente.
    vi.setSystemTime(new Date(2026, 9, 16, 11, 30));
    await montar();
    const filas = within(screen.getByRole("region", { name: /Clases de hoy/ })).getAllByRole("listitem");
    expect(filas[1]).toHaveTextContent("terminó");
    await act(async () => {
      fireEvent.click(within(filas[1]).getByRole("button", { name: "Marcar llegada" }));
    });
    expect(apiAcademia.llegada).toHaveBeenCalledWith(2);
  });

  it("rediseño de noviembre: «Deshacer» pregunta, borra la llegada con el DELETE y recarga", async () => {
    vi.mocked(apiAcademia.borrarLlegada).mockResolvedValue({} as never);
    await montar();
    const filas = within(screen.getByRole("region", { name: /Clases de hoy/ })).getAllByRole("listitem");
    // Sin llegada no hay nada que deshacer.
    expect(within(filas[1]).queryByRole("button", { name: /Deshacer/ })).not.toBeInTheDocument();
    fireEvent.click(within(filas[0]).getByRole("button", { name: "Deshacer la llegada de las 07:00" }));
    const dialogo = screen.getByRole("dialog", { name: "Deshacer la llegada" });
    expect(dialogo).toHaveTextContent(/Se borra la llegada de las .* de Marco Rojas/);
    expect(apiAcademia.borrarLlegada).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Deshacer" }));
    });
    expect(apiAcademia.borrarLlegada).toHaveBeenCalledWith(1);
    expect(apiAcademia.hoy).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si el backend no deja deshacer, dice por qué", async () => {
    vi.mocked(apiAcademia.borrarLlegada).mockRejectedValue(new Error("Tu llegada la corrige la recepción: pedíselo."));
    await montar();
    const filas = within(screen.getByRole("region", { name: /Clases de hoy/ })).getAllByRole("listitem");
    fireEvent.click(within(filas[0]).getByRole("button", { name: /Deshacer/ }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Deshacer" }));
    });
    expect(screen.getByText("Tu llegada la corrige la recepción: pedíselo.")).toBeInTheDocument();
  });

  it("rediseño de noviembre: «Pasar lista» en cada fila, a la lista del grupo; sólo con el permiso", async () => {
    const { unmount } = await montar();
    const filas = within(screen.getByRole("region", { name: /Clases de hoy/ })).getAllByRole("listitem");
    expect(within(filas[2]).getByRole("link", { name: "Pasar lista de las 15:00" })).toHaveAttribute("href", "/academia/grupos/9/lista");
    unmount();
    // Sin pasar lista ni marcar llegadas: la fila es sólo para mirar.
    quien.permisos = ["academia.ver", "academia.cobranza"];
    await montar();
    const sinPermiso = screen.getByRole("region", { name: /Clases de hoy/ });
    expect(within(sinPermiso).queryByRole("link", { name: /Pasar lista/ })).not.toBeInTheDocument();
    expect(within(sinPermiso).queryByRole("button", { name: /Marcar llegada|Deshacer/ })).not.toBeInTheDocument();
  });

  it("quien marca sólo la suya (PROPIO) no ve «Deshacer»: el backend se lo niega", async () => {
    quien.propios = ["asistencia.llegadas"];
    await montar();
    expect(screen.queryByRole("button", { name: /Deshacer/ })).not.toBeInTheDocument();
  });

  it("sin clases hoy no se dibuja nada", async () => {
    vi.mocked(apiAcademia.hoy).mockResolvedValue({ ...HOY, clases: [] });
    const { container } = await montar();
    expect(container).toBeEmptyDOMElement();
  });
});

/** La administración: arma grupos (No vino) y justifica atrasos. */
const ADMIN = ["academia.ver", "academia.grupos", "asistencia.registrar", "asistencia.llegadas", "asistencia.justificar"];
const filasDeHoy = () => within(screen.getByRole("region", { name: /Clases de hoy/ })).getAllByRole("listitem");

describe("Clases de hoy · tanda 2 del 08-nov", () => {
  it("«No vino» es de quien arma grupos: la recepción no lo ve", async () => {
    await montar();
    expect(screen.queryByRole("button", { name: /No vino/ })).not.toBeInTheDocument();
  });

  it("«No vino → Suspender» pide el motivo, lo manda y recarga", async () => {
    quien.permisos = ADMIN;
    vi.mocked(apiAcademia.suspenderClase).mockResolvedValue({} as never);
    await montar();
    // La de las 07:00 ya tiene llegada y lista: se dio, no se ofrece.
    expect(within(filasDeHoy()[0]).queryByRole("button", { name: /No vino/ })).not.toBeInTheDocument();
    fireEvent.click(within(filasDeHoy()[1]).getByRole("button", { name: "No vino el docente de las 09:00" }));
    const dialogo = screen.getByRole("dialog", { name: "No vino Marco Rojas" });
    fireEvent.click(within(dialogo).getByRole("button", { name: /No hay clase ese día/ }));
    const confirmar = () => within(dialogo).getByRole("button", { name: "Suspender la clase" });
    // Sin motivo no se manda.
    fireEvent.click(confirmar());
    expect(apiAcademia.suspenderClase).not.toHaveBeenCalled();
    expect(dialogo).toHaveTextContent("Escribí el motivo");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Feriado" }));
    await act(async () => {
      fireEvent.click(confirmar());
    });
    expect(apiAcademia.suspenderClase).toHaveBeenCalledWith(2, "Feriado");
    expect(apiAcademia.hoy).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«No vino → Poner reemplazo» ofrece los docentes de la sede, menos el que no vino", async () => {
    quien.permisos = ADMIN;
    vi.mocked(apiAcademia.docentes).mockResolvedValue([
      { personalId: 9, nombre: "Marco Rojas", sedes: [{ id: 1, nombre: "Central" }], pctDocente: null, retencionPct: null, tieneLogin: true },
      { personalId: 10, nombre: "Ana Paz", sedes: [{ id: 1, nombre: "Central" }], pctDocente: null, retencionPct: null, tieneLogin: true },
      { personalId: 11, nombre: "Otra Sede", sedes: [{ id: 2, nombre: "Norte" }], pctDocente: null, retencionPct: null, tieneLogin: false },
    ]);
    vi.mocked(apiAcademia.ponerReemplazo).mockResolvedValue({} as never);
    vi.mocked(apiAcademia.hoy).mockResolvedValue({ ...HOY, sede: 1 });
    await montar();
    fireEvent.click(within(filasDeHoy()[1]).getByRole("button", { name: /No vino/ }));
    const dialogo = screen.getByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: /Otro docente da esta clase/ }));
    });
    expect(dialogo).toHaveTextContent("El pago no cambia");
    const select = within(dialogo).getByRole("combobox", { name: "Docente de reemplazo" });
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Elegí un docente…", "Ana Paz"]);
    fireEvent.change(select, { target: { value: "10" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Poner reemplazo" }));
    });
    expect(apiAcademia.ponerReemplazo).toHaveBeenCalledWith(2, 10);
  });

  it("una suspendida sigue en la lista, marcada, sin llegada ni lista; se deshace con confirmación", async () => {
    quien.permisos = ADMIN;
    vi.mocked(apiAcademia.hoy).mockResolvedValue({
      ...HOY,
      clases: [clase({ sesionId: 2, estado: "SUSPENDIDA", suspendida: true, motivoSuspension: "Feriado" })],
    });
    vi.mocked(apiAcademia.quitarSuspension).mockResolvedValue({} as never);
    await montar();
    const [fila] = filasDeHoy();
    expect(fila).toHaveTextContent("suspendida");
    expect(fila).toHaveTextContent("Suspendida · Feriado");
    expect(fila).not.toHaveTextContent("Todavía no llegó");
    expect(within(fila).queryByRole("button", { name: "Marcar llegada" })).not.toBeInTheDocument();
    expect(within(fila).queryByRole("link", { name: /Pasar lista/ })).not.toBeInTheDocument();
    fireEvent.click(within(fila).getByRole("button", { name: "Deshacer la suspensión de las 09:00" }));
    const dialogo = screen.getByRole("dialog", { name: "Deshacer la suspensión" });
    expect(dialogo).toHaveTextContent("Se le avisa al docente");
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Sí, la clase va" }));
    });
    expect(apiAcademia.quitarSuspension).toHaveBeenCalledWith(2);
  });

  it("el reemplazo se nombra y se quita", async () => {
    quien.permisos = ADMIN;
    vi.mocked(apiAcademia.hoy).mockResolvedValue({
      ...HOY,
      clases: [clase({ sesionId: 2, docente: { personalId: 10, nombre: "Ana Paz" }, titular: { personalId: 9, nombre: "Marco Rojas" }, reemplazo: true })],
    });
    await montar();
    const [fila] = filasDeHoy();
    expect(fila).toHaveTextContent("Ana Paz");
    expect(fila).toHaveTextContent("Reemplazo de Marco Rojas");
    expect(within(fila).getByRole("button", { name: "Quitar el reemplazo de las 09:00" })).toBeInTheDocument();
  });

  it("«Justificar» un atraso de verdad, con su motivo; el justificado se ve", async () => {
    quien.permisos = ADMIN;
    vi.mocked(apiAcademia.hoy).mockResolvedValue({
      ...HOY,
      clases: [
        clase({ sesionId: 1, llegadaEn: "2026-10-16T13:14:00.000Z", atrasoMin: 14, conAtraso: true, toleranciaMin: 10 }),
        clase({ sesionId: 2, horaInicio: "10:00", llegadaEn: "2026-10-16T14:03:00.000Z", atrasoMin: 3, conAtraso: false, toleranciaMin: 10 }),
        clase({ sesionId: 3, horaInicio: "11:00", llegadaEn: "2026-10-16T15:20:00.000Z", atrasoMin: 20, conAtraso: true, atrasoJustificado: true, justificacion: "Trancadera" }),
      ],
    });
    vi.mocked(apiAcademia.justificarAtraso).mockResolvedValue({} as never);
    await montar();
    const filas = filasDeHoy();
    // A horario no hay nada que justificar.
    expect(within(filas[1]).queryByRole("button", { name: /Justificar/ })).not.toBeInTheDocument();
    expect(filas[2]).toHaveTextContent("Atraso justificado · Trancadera");
    expect(within(filas[2]).getByRole("button", { name: /Quitar la justificación/ })).toBeInTheDocument();
    fireEvent.click(within(filas[0]).getByRole("button", { name: "Justificar el atraso de las 09:00" }));
    const dialogo = screen.getByRole("dialog", { name: "Justificar el atraso" });
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "Avisó por WhatsApp" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Justificar" }));
    });
    expect(apiAcademia.justificarAtraso).toHaveBeenCalledWith(1, "Avisó por WhatsApp");
  });

  it("la recepción confirma la llegada a más de una hora de la clase (decisión del dueño)", async () => {
    vi.mocked(apiAcademia.llegada)
      .mockRejectedValueOnce(new ApiError("Faltan 320 minutos", 409, { codigo: "LLEGADA_MUY_TEMPRANO", minutosAntes: 320 }))
      .mockResolvedValueOnce({} as never);
    await montar();
    await act(async () => {
      fireEvent.click(within(filasDeHoy()[2]).getByRole("button", { name: "Marcar llegada" }));
    });
    const dialogo = screen.getByRole("dialog", { name: "Todavía falta para la clase" });
    expect(dialogo).toHaveTextContent("Faltan 5 h 20 min para la clase de las 15:00. ¿Seguro que es esta clase?");
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Sí, marcar la llegada" }));
    });
    expect(apiAcademia.llegada).toHaveBeenLastCalledWith(3, true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
