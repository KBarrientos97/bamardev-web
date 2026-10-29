import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Calendario as TCalendario, GrupoEnCalendario } from "../../lib/academia/tipos";
import { ajustesDePrueba, grupoDetalle } from "../../test/academiaFixtures";

/**
 * N1 · Calendario: los meses con su nombre, la tarjeta con su módulo, el
 * hueco que abre "Abrir grupo" con la franja y el mes, el resumen del grupo
 * en el panel, y en el celular (N1m) una pestaña por mes.
 */

/** Quién mira el calendario: el administrador (por defecto), la recepción o el docente. */
const quien = vi.hoisted(() => ({ sesion: "admin" as "admin" | "secretaria" | "docente" }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_ADMIN, SESION_SECRETARIA, SESION_DOCENTE } = await import("../../test/academiaFixtures");
  return {
    useAuth: () => ({
      ...(quien.sesion === "secretaria" ? SESION_SECRETARIA : quien.sesion === "docente" ? SESION_DOCENTE : SESION_ADMIN),
      puede: () => true,
    }),
  };
});

vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return { ...real, api: { ...real.api, getSucursales: vi.fn().mockResolvedValue([]), getAlmacenes: vi.fn().mockResolvedValue([]) } };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: {
      calendario: vi.fn(),
      aulas: vi.fn(async () => []),
      choques: vi.fn(async () => ({ hayChoques: false, aula: [], docentes: [] })),
      ajustes: vi.fn(),
      carreras: vi.fn(),
      grupo: vi.fn(),
      docentes: vi.fn(),
      crearGrupo: vi.fn(),
      // Inscribir, que se abre desde la cabecera (D1): el buscador y la lista de grupos.
      alumnos: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 6 }),
      grupos: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
      // Las clases de hoy, arriba (26-oct): sin clases no se dibujan.
      hoy: vi.fn().mockResolvedValue({ fecha: "2026-10-18", sede: null, cobrar: { venceHoy: 0, venceHoyCuotas: 0, vencido: 0, vencidoCuotas: 0, items: [] }, preinscripcionesNuevas: 0, avisos: [], clases: [] }),
    },
  };
});

// Inscribir de verdad, pero con las propiedades a mano: así un test puede disparar
// `onInscrito` sin recorrer los cuatro pasos del alta.
const inscribirProps = vi.hoisted(() => ({ ultimas: null as null | { onInscrito: (r: unknown) => void } }));
vi.mock("./Inscribir", async (importOriginal) => {
  const real = await importOriginal<typeof import("./Inscribir")>();
  const Real = real.default;
  return {
    ...real,
    default: (props: React.ComponentProps<typeof Real>) => {
      inscribirProps.ultimas = props as never;
      return <Real {...props} />;
    },
  };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { api } from "../../lib/api";
import Calendario from "./Calendario";

const tarjeta = (extra: Partial<GrupoEnCalendario> = {}): GrupoEnCalendario => ({
  grupoId: 7,
  nombre: "Barbería · L-M-V 09:00",
  carrera: { id: 3, nombre: "Barbería" },
  modulo: { orden: 2, nombre: "Degradados", total: 3 },
  ultimo: false,
  dias: [1, 3, 5],
  aula: "Aula 2",
  docente: { personalId: 9, nombre: "Marco Rojas" },
  inscritos: 22,
  cupo: 25,
  inscripcionAbierta: true,
  pagaronModulo: 19,
  ...extra,
});

const CAL: TCalendario = {
  sede: { id: 1, nombre: "Central" },
  meses: ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"],
  filas: [
    {
      inicio: "09:00",
      fin: "11:00",
      esFranja: true,
      celdas: [
        { mes: "2026-10", grupos: [tarjeta()] },
        { mes: "2026-11", grupos: [tarjeta({ modulo: { orden: 3, nombre: "Barba y color", total: 3 }, ultimo: true })] },
      ],
    },
    {
      inicio: "11:00",
      fin: "13:00",
      esFranja: true,
      celdas: [{ mes: "2026-11", grupos: [tarjeta({ grupoId: 8, carrera: { id: 4, nombre: "Tatuaje" }, modulo: { orden: 1, nombre: "Fundamentos", total: 3 } })] }],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  quien.sesion = "admin";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T14:00:00.000Z"));
  vi.mocked(apiAcademia.calendario).mockResolvedValue(CAL);
  vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ franjas: [{ almacenId: null, inicio: "09:00", fin: "11:00" }, { almacenId: null, inicio: "11:00", fin: "13:00" }] }));
  vi.mocked(apiAcademia.carreras).mockResolvedValue([]);
  vi.mocked(apiAcademia.docentes).mockResolvedValue([]);
  vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function montar() {
  render(
    <MemoryRouter>
      <Calendario />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("N1 · Calendario", () => {
  it("pide 6 meses desde el actual y nombra cada columna con su mes", async () => {
    await montar();
    expect(apiAcademia.calendario).toHaveBeenCalledWith({ sede: null, desde: "2026-10", meses: 6 });
    expect(screen.getByRole("columnheader", { name: /octubre.*mes actual/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /enero/ })).toBeInTheDocument();
    expect(screen.getByText(/empiezan el 10 de cada mes/)).toBeInTheDocument();
  });

  it("la tarjeta dice el módulo y el último se marca", async () => {
    await montar();
    expect(screen.getByText("M2 de 3 · Degradados")).toBeInTheDocument();
    expect(screen.getByText("último")).toBeInTheDocument();
  });

  it("filtrar por curso deja sólo sus tarjetas", async () => {
    await montar();
    fireEvent.click(within(screen.getByRole("group", { name: "Filtrar por curso" })).getByRole("button", { name: /^Tatuaje/ }));
    expect(screen.queryByText("M2 de 3 · Degradados")).not.toBeInTheDocument();
    expect(screen.getByText("M1 de 3 · Fundamentos")).toBeInTheDocument();
  });

  it("tocar una tarjeta abre el resumen: pagaron el módulo, los módulos y ver el grupo", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Barbería L Mi V, módulo 2 de 3/ }));
    await act(async () => {});
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText(/Pagaron el M2 \(actual\)/)).toBeInTheDocument();
    expect(within(panel).getByText("3 sin pagar")).toBeInTheDocument();
    expect(within(panel).getByText("Degradados")).toBeInTheDocument();
    // Ya va por el módulo 2: la acción principal es ver el grupo.
    expect(within(panel).getByRole("link", { name: "Ver grupo" })).toHaveAttribute("href", "/academia/grupos/7");
  });

  it("26-oct: nunca dos paneles a la vez; el resumen no abre otra hoja encima", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Barbería L Mi V, módulo 2 de 3/ }));
    await act(async () => {});
    const panel = screen.getByRole("complementary");
    // Sin "⋯": en el celular abría una segunda hoja. Pasar lista va a la vista.
    expect(within(panel).queryByRole("button", { name: "Más acciones del grupo" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Pasar lista" })).toBeInTheDocument();
    // Abrir un hueco con el resumen abierto lo cierra: queda sólo "Abrir grupo".
    fireEvent.click(screen.getByRole("button", { name: "Abrir grupo aquí: 11:00 a 13:00, diciembre" }));
    await act(async () => {});
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
    expect(screen.getByRole("complementary", { name: "Abrir grupo" })).toBeInTheDocument();
  });

  it("un hueco libre abre Abrir grupo con esa franja y ese mes", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir grupo aquí: 11:00 a 13:00, diciembre" }));
    await act(async () => {});
    const panel = screen.getByRole("complementary", { name: "Abrir grupo" });
    expect(within(panel).getByText("Hueco libre de 11:00–13:00 desde diciembre")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Empieza el")).toHaveValue("2026-12");
    expect(within(panel).getByLabelText("Franja horaria")).toHaveValue("11:00-13:00");
  });

  it("el mes que ya pasó no ofrece abrir un grupo", async () => {
    vi.mocked(apiAcademia.calendario).mockResolvedValue({ ...CAL, meses: ["2026-09", ...CAL.meses.slice(0, 5)] });
    await montar();
    expect(screen.queryByRole("button", { name: /Abrir grupo aquí: .*septiembre/ })).not.toBeInTheDocument();
  });

  it("en el celular, una pestaña por mes y las franjas una debajo de la otra", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("767"), addEventListener: () => {}, removeEventListener: () => {} }));
    await montar();
    expect(screen.getByRole("tab", { name: /oct/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "09:00 a 11:00" })).toHaveTextContent("M2 de 3 · Degradados");
    fireEvent.click(screen.getByRole("tab", { name: /nov/ }));
    expect(screen.getByRole("region", { name: "11:00 a 13:00" })).toHaveTextContent("Fundamentos");
  });

  it("el hueco del mes en curso, con su día de inicio ya pasado, propone el del mes siguiente (QA ronda 2, B-03)", async () => {
    // Hoy es 18-oct y los módulos empiezan el 10: el 10 de octubre ya pasó.
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir grupo aquí: 11:00 a 13:00, octubre" }));
    await act(async () => {});
    const panel = screen.getByRole("complementary", { name: "Abrir grupo" });
    const empieza = within(panel).getByLabelText("Empieza el");
    expect(empieza).toHaveValue("2026-11");
    // El admin (configura) lo tiene sólo aparte, para un grupo que ya venía en clases (N-5).
    expect(within(within(empieza).getByRole("group", { name: /Ya empezó/ })).getByRole("option", { name: /10 de octubre/ })).toBeInTheDocument();
    expect(within(panel).getByText(/El 10 de octubre ya pasó: el primer inicio posible es el 10 de noviembre/)).toBeInTheDocument();
  });
});

describe("N1 · Calendario con todas las sedes (QA ronda 2, B-07)", () => {
  const SEDES = [
    { id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL", esPrincipal: true },
    { id: 2, nombre: "Norte", activo: true, tipo: "SUCURSAL", esPrincipal: false },
  ];
  const VACIO: TCalendario = {
    sede: null,
    meses: CAL.meses,
    filas: [
      { inicio: "09:00", fin: "11:00", esFranja: true, celdas: [] },
      { inicio: "10:00", fin: "12:00", esFranja: true, celdas: [] },
      { inicio: "19:00", fin: "21:00", esFranja: true, celdas: [] },
    ],
  };

  beforeEach(() => {
    vi.mocked(api.getSucursales).mockResolvedValue(SEDES as never);
    vi.mocked(apiAcademia.calendario).mockResolvedValue(VACIO);
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(
      ajustesDePrueba({
        franjas: [
          { almacenId: 1, inicio: "09:00", fin: "11:00" },
          { almacenId: 2, inicio: "10:00", fin: "12:00" },
          { almacenId: null, inicio: "19:00", fin: "21:00" },
        ],
      }),
    );
  });

  it("la franja de una sola sede abre el grupo en esa sede, con sus franjas", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir grupo aquí: 10:00 a 12:00, diciembre" }));
    await act(async () => {});
    const panel = screen.getByRole("complementary", { name: "Abrir grupo" });
    expect(within(panel).getByLabelText("Sede")).toHaveValue("2");
    const franja = within(panel).getByLabelText("Franja horaria");
    expect(franja).toHaveValue("10:00-12:00");
    // Las de Central no se ofrecen en Norte.
    expect(within(franja).queryByRole("option", { name: "09:00–11:00" })).not.toBeInTheDocument();
  });

  it("la franja de todas las sedes pide elegir la sede; al elegirla quedan sus franjas", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir grupo aquí: 19:00 a 21:00, diciembre" }));
    await act(async () => {});
    const panel = screen.getByRole("complementary", { name: "Abrir grupo" });
    const sedeSel = within(panel).getByLabelText("Sede");
    expect(sedeSel).toHaveValue("");
    fireEvent.click(within(panel).getByRole("button", { name: "Abrir grupo" }));
    expect(apiAcademia.crearGrupo).not.toHaveBeenCalled();
    fireEvent.change(sedeSel, { target: { value: "1" } });
    await act(async () => {});
    const franja = within(panel).getByLabelText("Franja horaria");
    // La de todas las sedes sigue valiendo en Central.
    expect(franja).toHaveValue("19:00-21:00");
    expect(within(franja).getByRole("option", { name: "09:00–11:00" })).toBeInTheDocument();
    expect(within(franja).queryByRole("option", { name: "10:00–12:00" })).not.toBeInTheDocument();
  });

  it("U3: con todas las sedes, cada tarjeta dice de qué sede es; con una sola, no", async () => {
    const fila = (grupos: GrupoEnCalendario[]): TCalendario["filas"] => [
      { inicio: "09:00", fin: "11:00", esFranja: true, celdas: [{ mes: "2026-10", grupos }] },
    ];
    // Cada tarjeta trae su sede: un solo pedido alcanza (ya no uno por sede).
    const deCentral = tarjeta({ grupoId: 7, sede: { id: 1, nombre: "Central" } });
    const deNorte = tarjeta({ grupoId: 8, carrera: { id: 4, nombre: "Tatuaje" }, sede: { id: 2, nombre: "Norte" } });
    vi.mocked(apiAcademia.calendario).mockImplementation(async (f) => {
      const grupos = f?.sede === 1 ? [deCentral] : f?.sede === 2 ? [deNorte] : [deCentral, deNorte];
      return { sede: null, meses: CAL.meses, filas: fila(grupos) };
    });
    await montar();
    expect(screen.getByRole("button", { name: /^Barbería .+ 2 de 3$/ })).toHaveTextContent("Sede Central");
    expect(screen.getByRole("button", { name: /^Tatuaje .+ 2 de 3$/ })).toHaveTextContent("Sede Norte");
    expect(vi.mocked(apiAcademia.calendario).mock.calls.filter(([f]) => f?.sede != null)).toHaveLength(0);

    // Elegida una sede, el calendario ya es de esa sede y las tarjetas no la repiten.
    fireEvent.click(screen.getByRole("button", { name: "Norte" }));
    await act(async () => {});
    expect(screen.getByRole("button", { name: /^Tatuaje .+ 2 de 3$/ })).not.toHaveTextContent("Sede Norte");
    expect(screen.queryByRole("button", { name: /^Barbería .+ 2 de 3$/ })).not.toBeInTheDocument();
  });

  it("si la lista de docentes no se pudo traer, lo dice y deja reintentar", async () => {
    vi.mocked(apiAcademia.carreras).mockResolvedValue([
      { id: 3, nombre: "Barbería", activa: true, materias: [{ id: 31, orden: 1, nombre: "Corte", activa: true }], planes: [], cupoDefecto: null, pctDocente: null, publicarEnPagina: false },
    ] as never);
    // Falla toda la lista (también la que mira «Primeros pasos»); sólo el panel la muestra como error.
    vi.mocked(apiAcademia.docentes).mockRejectedValue(new Error("Sin conexión"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir grupo aquí: 10:00 a 12:00, diciembre" }));
    await act(async () => {});
    const panel = screen.getByRole("complementary", { name: "Abrir grupo" });
    fireEvent.change(within(panel).getByLabelText("Curso"), { target: { value: "3" } });
    expect(within(panel).getByText(/No se pudo traer la lista de docentes/)).toBeInTheDocument();
    vi.mocked(apiAcademia.docentes).mockResolvedValue([]);
    const pedidas = vi.mocked(apiAcademia.docentes).mock.calls.length;
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Reintentar" }));
    });
    expect(apiAcademia.docentes).toHaveBeenCalledTimes(pedidas + 1);
    expect(within(panel).queryByText(/No se pudo traer/)).not.toBeInTheDocument();
  });
  describe("L1 · «Configuración rápida» en el encabezado del calendario", () => {
    it("el administrador de un instituto sin terminar de armar ve el botón junto al «⋯» y abre la lista; la recepción no", async () => {
      await montar();
      const boton = within(screen.getByRole("banner")).getByRole("button", { name: /^Configuración rápida/ });
      expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
      if (boton.getAttribute("aria-expanded") !== "true") fireEvent.click(boton);
      const lista = screen.getByRole("complementary", { name: "Configuración rápida" });
      expect(within(lista).getByRole("link", { name: /Crear un curso/ })).toHaveAttribute("href", "/configuracion/carreras");
      cleanup();
      quien.sesion = "secretaria";
      await montar();
      expect(screen.queryByRole("button", { name: /^Configuración rápida/ })).not.toBeInTheDocument();
    });
  });

  describe("D1 · las acciones de la cabecera según el rol", () => {
    function Destino() {
      const l = useLocation();
      return <p data-testid="destino">{l.pathname}</p>;
    }
    async function montarConRutas() {
      render(
        <MemoryRouter initialEntries={["/academia/calendario"]}>
          <Routes>
            <Route path="/academia/calendario" element={<Calendario />} />
            <Route path="*" element={<Destino />} />
          </Routes>
        </MemoryRouter>,
      );
      await act(async () => {});
    }

    it("la dirección tiene Nuevo grupo, Inscribir y Cobrar a un estudiante", async () => {
      await montar();
      expect(screen.getByRole("button", { name: "Nuevo grupo" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Inscribir" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cobrar a un estudiante" })).toBeInTheDocument();
    });

    it("la recepción (sin academia.grupos) ve Inscribir y Cobrar, y no Nuevo grupo", async () => {
      quien.sesion = "secretaria";
      await montar();
      expect(screen.getByRole("button", { name: "Inscribir" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cobrar a un estudiante" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Nuevo grupo" })).not.toBeInTheDocument();
    });

    it("el docente no tiene ninguna de las tres", async () => {
      quien.sesion = "docente";
      await montar();
      for (const nombre of ["Nuevo grupo", "Inscribir", "Cobrar a un estudiante"])
        expect(screen.queryByRole("button", { name: nombre })).not.toBeInTheDocument();
    });

    it("Cobrar a un estudiante lleva a la pantalla de cobro", async () => {
      quien.sesion = "secretaria";
      await montarConRutas();
      fireEvent.click(screen.getByRole("button", { name: "Cobrar a un estudiante" }));
      expect(screen.getByTestId("destino")).toHaveTextContent("/academia/cobranza/cobrar");
    });

    it("Inscribir abre el formulario sin grupo elegido, con el buscador de estudiante", async () => {
      quien.sesion = "secretaria";
      await montar();
      fireEvent.click(screen.getByRole("button", { name: "Inscribir" }));
      await act(async () => {});
      const dialogo = screen.getByRole("dialog", { name: "Inscribir estudiante" });
      expect(within(dialogo).getByLabelText("Buscar estudiante")).toBeInTheDocument();
    });
  });
  describe("C2 · «Abrir el primer grupo» llega con el curso ya elegido", () => {
    const BARBERIA = { id: 3, nombre: "Barbería", activa: true, materias: [{ id: 31, orden: 1, nombre: "Corte", activa: true }], planes: [], cupoDefecto: 20, pctDocente: null, publicarEnPagina: false };

    async function montarEn(ruta: string) {
      vi.mocked(apiAcademia.carreras).mockResolvedValue([BARBERIA] as never);
      render(
        <MemoryRouter initialEntries={[ruta]}>
          <Calendario />
        </MemoryRouter>,
      );
      await act(async () => {});
    }

    it("?nuevoGrupo=3 abre «Abrir grupo» con el curso 3 elegido", async () => {
      await montarEn("/academia/calendario?nuevoGrupo=3");
      const panel = screen.getByRole("complementary", { name: "Abrir grupo" });
      expect(within(panel).getByLabelText("Curso")).toHaveValue("3");
    });

    it("sin academia.grupos no abre nada (y el parámetro no queda dando vueltas)", async () => {
      quien.sesion = "secretaria";
      await montarEn("/academia/calendario?nuevoGrupo=3");
      expect(screen.queryByRole("complementary", { name: "Abrir grupo" })).not.toBeInTheDocument();
    });

    it("un valor que no es un curso se ignora", async () => {
      await montarEn("/academia/calendario?nuevoGrupo=abc");
      expect(screen.queryByRole("complementary", { name: "Abrir grupo" })).not.toBeInTheDocument();
    });

    it("sin el parámetro, el calendario abre como siempre", async () => {
      await montarEn("/academia/calendario");
      expect(screen.queryByRole("complementary", { name: "Abrir grupo" })).not.toBeInTheDocument();
    });
  });
});

describe("ronda 1 · D13 · el cobro desde el resumen del grupo lleva la sede del grupo", () => {
  function Destino() {
    const l = useLocation();
    return <p data-testid="destino">{l.pathname + l.search}</p>;
  }

  it("«Inscribir» del resumen pasa la sede del grupo, como la cabecera", async () => {
    render(
      <MemoryRouter initialEntries={["/academia/calendario"]}>
        <Routes>
          <Route path="/academia/calendario" element={<Calendario />} />
          <Route path="*" element={<Destino />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Barbería L Mi V, módulo 2 de 3/ }));
    await act(async () => {});
    fireEvent.click(within(screen.getByRole("complementary")).getByRole("button", { name: "Inscribir" }));
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Inscribir estudiante" })).toBeInTheDocument();
    await act(async () => {
      inscribirProps.ultimas?.onInscrito({
        inscripcion: { id: 55, grupo: { sede: { id: 2, nombre: "Norte" } } },
        cobrar: true,
        montoHoy: 100,
      });
    });
    const destino = screen.getByTestId("destino").textContent ?? "";
    expect(destino).toContain("inscripcion=55");
    expect(destino).toContain("sede=2");
    expect(destino).toContain("sedeNombre=Norte");
  });
});

describe("ronda 2 · R8 · «Inscribir sin cobrar» avisa que quedó inscrito", () => {
  it("sin cobrar y sin fotos pendientes, el panel se cierra con un mensaje de éxito", async () => {
    render(
      <MemoryRouter initialEntries={["/academia/calendario"]}>
        <Routes>
          <Route path="/academia/calendario" element={<Calendario />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Inscribir" }));
    await act(async () => {});
    await act(async () => {
      inscribirProps.ultimas?.onInscrito({ inscripcion: { id: 55 }, nombre: "Suárez Peña, Daniela", cobrar: false });
    });
    expect(screen.queryByRole("dialog", { name: "Inscribir estudiante" })).not.toBeInTheDocument();
    expect(screen.getByText("Suárez Peña, Daniela quedó inscrito.")).toBeInTheDocument();
  });
});

