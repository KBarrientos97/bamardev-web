import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelControl } from "../../../lib/academia/tipos";

/**
 * N9 · Panel de control y E18 · Reportes: las fotos se revisan una tras otra
 * ("Está bien" o "Algo no cuadra" con motivo); "Para mirar" cambia de lista;
 * el resultado por sede suma lo que entra y resta lo que sale.
 */

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_ADMIN: s } = await import("../../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
});

vi.mock("../../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/api")>();
  return { ...real, api: { ...real.api, getSucursales: vi.fn().mockResolvedValue([]) } };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { control: vi.fn(), reportes: vi.fn(), fotoComoUrl: vi.fn(), revisarFotos: vi.fn(), sedes: vi.fn(), ajustes: vi.fn(), carreras: vi.fn(), docentes: vi.fn(), grupos: vi.fn() } };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import Control from "./Control";
import Reportes from "./Reportes";

const PANEL: PanelControl = {
  fotosPorRevisar: [
    { alumnoId: 60, nombre: "Ortiz Rocha, Thiago", ci: "14550221", fechaNacimiento: "2010-03-12", grupo: "Tatuaje · M-J", inscritoPor: "Online", inscritaEn: "2026-10-15T12:00:00.000Z" },
    { alumnoId: 61, nombre: "Suárez Peña, Daniela", ci: "7654321", fechaNacimiento: null, grupo: "Uñas · L-V", inscritoPor: "Lucía Vargas", inscritaEn: "2026-10-16T12:00:00.000Z" },
  ],
  asistenSinPagar: [{ alumno: { id: 52, nombre: "Bustillos Rek, Camila" }, grupo: "Barbería", asistencias: 6, estadoPago: "SIN_PAGAR", inscritoPor: "Lucía Vargas" }],
  pagaronNoVienen: [],
  descuentosConPin: [{ inscripcionId: 9, alumno: "Rivero Gil, Matías", descuento: "Beca 50 %", autorizadoPor: "Hugo Salinas", en: "2026-10-12T12:00:00.000Z" }],
  ventasAnuladas: [],
  inscripcionesPorUsuario: [{ usuario: "Lucía Vargas", sede: "Central", cantidad: 12, cobrado: 6000 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAcademia.control).mockResolvedValue(PANEL);
  vi.mocked(apiAcademia.fotoComoUrl).mockResolvedValue("blob:x");
  vi.mocked(apiAcademia.revisarFotos).mockResolvedValue({});
  // Un instituto recién dado de alta: nada cargado todavía.
  vi.mocked(apiAcademia.sedes).mockResolvedValue([]);
  vi.mocked(apiAcademia.ajustes).mockResolvedValue({ paginaPublicada: false } as never);
  vi.mocked(apiAcademia.carreras).mockResolvedValue([]);
  vi.mocked(apiAcademia.docentes).mockResolvedValue([]);
  vi.mocked(apiAcademia.grupos).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
});

describe("N9 · Panel de control", () => {
  it("M2: las listas cortadas por el backend dicen cuántas hay de verdad y «y N más»", async () => {
    vi.mocked(apiAcademia.control).mockResolvedValue({
      ...PANEL,
      fotosPorRevisarTotal: 80,
      fotosObservadasTotal: 0,
      fotosFaltan: [{ alumnoId: 70, nombre: "Gómez Paz, Rita", ci: null, fechaNacimiento: null, grupo: "Uñas · L-V", inscritoPor: "Online", inscritaEn: "2026-10-16T12:00:00.000Z", faltan: ["FOTO"] }],
      fotosFaltanTotal: 80,
      gruposSinDocente: [
        { grupoId: 5, nombre: "Barbería · L-V", carrera: { id: 1, nombre: "Barbería" }, sede: { id: 1, nombre: "Central" }, horario: { dias: [1], horaInicio: "09:00", horaFin: "11:00" }, modulos: [{ orden: 1, nombre: "Corte", desde: "2026-11-10" }], inicio: "2026-11-10" },
      ],
      gruposSinDocenteTotal: 130,
    } as never);
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    // 2 cargadas de 80: el botón y el contador hablan del total; faltan 78.
    expect(screen.getByRole("button", { name: "Revisar 2 de 80 fotos" })).toBeInTheDocument();
    expect(screen.getByText(/Se muestran las primeras 2, y 78 más/)).toBeInTheDocument();
    expect(screen.getByText("y 79 más")).toBeInTheDocument();
    expect(screen.getByText("y 129 más")).toBeInTheDocument();
    // Los contadores de los títulos cuentan el total, no el corte.
    expect(document.getElementById("t-faltan-fotos")!.parentElement).toHaveTextContent("80");
    expect(document.getElementById("t-sin-docente")!.parentElement).toHaveTextContent("130");
  });

  it("R2: el administrador aterriza acá y ve «Primeros pasos» mientras falte armar el instituto", async () => {
    localStorage.clear();
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByRole("region", { name: "Primeros pasos" })).toBeInTheDocument();
  });

  it("revisa las fotos una tras otra: está bien, y la siguiente con lo que no cuadra", async () => {
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Revisar 2 fotos" }));
    await act(async () => {});
    let panel = screen.getByRole("complementary", { name: "Ortiz Rocha, Thiago" });
    expect(within(panel).getByText("14550221")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Está bien" }));
    });
    expect(apiAcademia.revisarFotos).toHaveBeenCalledWith(60, { ok: true });
    panel = screen.getByRole("complementary", { name: "Suárez Peña, Daniela" });
    fireEvent.click(within(panel).getByRole("button", { name: "Algo no cuadra" }));
    fireEvent.change(within(panel).getByLabelText("¿Qué no cuadra?"), { target: { value: "La foto no coincide con el carnet" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Guardar motivo" }));
    });
    expect(apiAcademia.revisarFotos).toHaveBeenLastCalledWith(61, { ok: false, observacion: "La foto no coincide con el carnet" });
    expect(screen.getByRole("button", { name: "Fotos al día" })).toBeDisabled();
  });

  it("Para mirar: quien viene sin pagar, y los descuentos con PIN", async () => {
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByText("Bustillos Rek, Camila")).toBeInTheDocument();
    expect(screen.getByText("Sin pagar")).toBeInTheDocument();
    // Los indicadores son las pestañas de "Para mirar": tarjetas-botón con aria-pressed.
    const queMirar = screen.getByRole("group", { name: "Qué mirar" });
    expect(within(queMirar).getByRole("button", { name: /Vienen a clase pero no pagaron/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(queMirar).getByRole("button", { name: /Descuentos con PIN/ }));
    expect(within(queMirar).getByRole("button", { name: /Descuentos con PIN/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Beca 50 %")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Inscripciones por persona" })).toHaveTextContent("Lucía Vargas");
  });
});

describe("N9 · Observadas y sobrecupos (QA ronda 2, B-06 y B-31)", () => {
  it("la observada queda a la vista con el motivo y la ficha; el grupo pasado de cupo, con inscritos/cupo", async () => {
    vi.mocked(apiAcademia.control).mockResolvedValue({
      ...PANEL,
      fotosObservadas: [
        {
          alumnoId: 208,
          nombre: "Gutiérrez Paz, Iván",
          ci: "9988776 SC",
          fechaNacimiento: null,
          grupo: { id: 77, nombre: "Barbería · L-Mi-V" },
          inscritoPor: "Rosa",
          inscritaEn: "2026-10-15T12:00:00.000Z",
          observadas: ["FOTO", "CI_REVERSO"],
          observacion: "La foto no se ve bien",
          observadaEn: "2026-10-18T12:00:00.000Z",
          observadaPor: "Dirección",
        },
      ],
      sobrecupos: [{ grupoId: 83, nombre: "Tatuaje · M-J", carrera: { id: 2, nombre: "Tatuaje" }, sede: { id: 1, nombre: "Central" }, inscritos: 22, cupo: 20 }],
    });
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    const observadas = screen.getByRole("region", { name: /Fotos observadas/ });
    expect(observadas).toHaveTextContent("Gutiérrez Paz, Iván");
    expect(observadas).toHaveTextContent("La foto no se ve bien");
    expect(observadas).toHaveTextContent("foto y carnet de atrás");
    expect(observadas).toHaveTextContent("observó Dirección");
    expect(within(observadas).getByRole("link", { name: "Ver la ficha de Gutiérrez Paz, Iván" })).toHaveAttribute("href", "/academia/alumnos/208");
    const sobrecupos = screen.getByRole("region", { name: /Grupos con sobrecupo/ });
    expect(sobrecupos).toHaveTextContent("22/20 inscritos");
    expect(within(sobrecupos).getByRole("link", { name: "Ver el grupo Tatuaje · M-J" })).toHaveAttribute("href", "/academia/grupos/83");
  });

  it("sin observadas ni sobrecupos (o un backend que no los manda), no hay secciones vacías", async () => {
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.queryByRole("region", { name: /Fotos observadas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Grupos con sobrecupo/ })).not.toBeInTheDocument();
  });
});

describe("D9 · Grupos sin docente", () => {
  const SIN_DOCENTE: NonNullable<PanelControl["gruposSinDocente"]> = [
    {
      grupoId: 91,
      nombre: "Barbería · L-Mi 18:00",
      carrera: { id: 3, nombre: "Barbería" },
      sede: { id: 1, nombre: "Central" },
      horario: { dias: [1, 3], horaInicio: "18:00", horaFin: "20:00" },
      modulos: [
        { orden: 2, nombre: "Degradados", desde: "2026-11-17" },
        { orden: 3, nombre: "Barba y color", desde: "2026-12-15" },
      ],
      inicio: "2026-10-20",
    },
  ];

  it("lista el grupo con curso, sede, horario, módulos sin docente e inicio, y abre el grupo", async () => {
    vi.mocked(apiAcademia.control).mockResolvedValue({ ...PANEL, gruposSinDocente: SIN_DOCENTE });
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    const bloque = screen.getByRole("region", { name: /Grupos sin docente/ });
    expect(bloque).toHaveTextContent("Barbería · L-Mi 18:00");
    expect(bloque).toHaveTextContent("Barbería · Central · L Mi 18:00–20:00");
    expect(bloque).toHaveTextContent("Sin docente: M2 Degradados, M3 Barba y color");
    // Ronda 1, D11: la fecha es la del primer módulo sin docente (M2), no la del grupo (20-oct).
    expect(bloque).toHaveTextContent("Empieza el M2 el 17-nov");
    expect(bloque).not.toHaveTextContent("Inicio 20-oct");
    expect(within(bloque).getByRole("link", { name: "Abrir el grupo Barbería · L-Mi 18:00 para asignar docente" })).toHaveAttribute(
      "href",
      "/academia/grupos/91",
    );
  });

  it("sin grupos sin docente (o un backend que no lo manda) el bloque no se dibuja", async () => {
    vi.mocked(apiAcademia.control).mockResolvedValue({ ...PANEL, gruposSinDocente: [] });
    const { unmount } = render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.queryByRole("region", { name: /Grupos sin docente/ })).not.toBeInTheDocument();
    unmount();
    vi.mocked(apiAcademia.control).mockResolvedValue(PANEL);
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.queryByRole("region", { name: /Grupos sin docente/ })).not.toBeInTheDocument();
  });
});

describe("D3 · Faltan fotos", () => {
  const FALTAN: NonNullable<PanelControl["fotosFaltan"]> = [
    {
      alumnoId: 301,
      nombre: "Quiroga Lema, Bruno",
      ci: null,
      fechaNacimiento: null,
      grupo: { id: 12, nombre: "Barbería · Sáb" },
      inscritoPor: "Lucía Vargas",
      inscritaEn: "2026-10-26T12:00:00.000Z",
      faltan: ["CI_ANVERSO", "CI_REVERSO"],
    },
  ];

  it("dice quién y qué fotos faltan, con un botón a la ficha; no se mezcla con «por revisar»", async () => {
    vi.mocked(apiAcademia.control).mockResolvedValue({ ...PANEL, fotosFaltan: FALTAN });
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    const bloque = screen.getByRole("region", { name: /Faltan fotos/ });
    expect(bloque).toHaveTextContent("Quiroga Lema, Bruno");
    expect(bloque).toHaveTextContent("Falta: carnet de adelante y carnet de atrás");
    expect(bloque).toHaveTextContent("Barbería · Sáb");
    expect(within(bloque).getByRole("link", { name: "Ver la ficha de Quiroga Lema, Bruno" })).toHaveAttribute("href", "/academia/alumnos/301");
    // El botón de arriba sigue contando sólo las que esperan revisión.
    expect(screen.getByRole("button", { name: "Revisar 2 fotos" })).toBeInTheDocument();
  });

  it("con las fotos apagadas (lista vacía) o sin el campo, el bloque no aparece", async () => {
    vi.mocked(apiAcademia.control).mockResolvedValue({ ...PANEL, fotosFaltan: [] });
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.queryByRole("region", { name: /Faltan fotos/ })).not.toBeInTheDocument();
  });
});

describe("E18 · Reportes", () => {
  it("el resultado por sede, los activos por curso y la morosidad", async () => {
    vi.mocked(apiAcademia.reportes).mockResolvedValue({
      mes: "2026-10",
      porSede: [
        { sede: "Central", cobradoModulos: 31480, ventasProductos: 3940, sueldosDocentes: 7754, otrosGastos: 6200, resultado: 21466 },
        { sede: "Norte", cobradoModulos: 4300, ventasProductos: 620, sueldosDocentes: 0, otrosGastos: 2100, resultado: 2820 },
      ],
      activosPorCurso: [{ curso: "Tatuaje", activos: 18, cupo: 20 }],
      morosidad: { vencido: 5400, estudiantes: 12, pctEstudiantes: 14 },
      asistenciaPromedioPct: 88,
    });
    render(
      <MemoryRouter>
        <Reportes />
      </MemoryRouter>,
    );
    await act(async () => {});
    const resultado = screen.getByRole("region", { name: "Resultado por sede" });
    expect(within(resultado).getByRole("columnheader", { name: "Total" })).toBeInTheDocument();
    expect(resultado).toHaveTextContent(/24\.286/);
    expect(resultado).toHaveTextContent(/− Bs\s?7\.754/);
    expect(screen.getByText("18 de 20 activos")).toBeInTheDocument();
    expect(screen.getByText("88 %")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Morosidad" })).toHaveTextContent(/5\.400/);
  });
});

describe("A3 · fotos por revisar con un toque y de a 10 (UX 13)", () => {
  const muchas = (n: number): PanelControl["fotosPorRevisar"] =>
    Array.from({ length: n }, (_, i) => ({
      alumnoId: 100 + i,
      nombre: `Alumno ${i + 1}`,
      ci: null,
      fechaNacimiento: null,
      grupo: "Barbería",
      inscritoPor: "Lucía Vargas",
      inscritaEn: "2026-10-16T12:00:00.000Z",
    }));

  it("«Está bien» aprueba sin abrir el panel", async () => {
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aprobar las fotos de Suárez Peña, Daniela" }));
    });
    expect(apiAcademia.revisarFotos).toHaveBeenCalledWith(61, { ok: true });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revisar 1 foto" })).toBeInTheDocument();
  });

  it("con 23 pendientes muestra 10 y pasa de página", async () => {
    vi.mocked(apiAcademia.control).mockResolvedValue({ ...PANEL, fotosPorRevisar: muchas(23) });
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    const fotos = screen.getByRole("region", { name: /Fotos por revisar/ });
    expect(within(fotos).getAllByRole("button", { name: /^Aprobar las fotos/ })).toHaveLength(10);
    const nav = within(fotos).getByRole("navigation", { name: "Páginas de fotos por revisar" });
    expect(nav).toHaveTextContent("1–10 de 23");
    fireEvent.click(within(nav).getByRole("button", { name: "Siguientes" }));
    fireEvent.click(within(nav).getByRole("button", { name: "Siguientes" }));
    expect(nav).toHaveTextContent("21–23 de 23");
    expect(within(fotos).getAllByRole("button", { name: /^Aprobar las fotos/ })).toHaveLength(3);
    expect(within(nav).getByRole("button", { name: "Siguientes" })).toBeDisabled();
  });
});
