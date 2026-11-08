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
  return { ...real, apiAcademia: { hoy: vi.fn(), llegada: vi.fn(), borrarLlegada: vi.fn() } };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
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
