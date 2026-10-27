import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ajustesDePrueba } from "../../../test/academiaFixtures";

/**
 * N4 · Ajustes: cada cambio se guarda solo, las franjas se cargan en cada sede
 * (acá sólo hay un enlace y nunca se mandan), la retención y los atrasos
 * quedan "por confirmar" sin tocarse.
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
  return {
    ...real,
    apiAcademia: { ajustes: vi.fn(), guardarAjustes: vi.fn(), carreras: vi.fn(), calendario: vi.fn(), grupos: vi.fn() },
  };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import AjustesAcademia from "./AjustesAcademia";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ topePromoSinPinPct: 0 }));
  vi.mocked(apiAcademia.guardarAjustes).mockImplementation(async (c) => ajustesDePrueba({ topePromoSinPinPct: 0, ...c }));
  vi.mocked(apiAcademia.carreras).mockResolvedValue([]);
  vi.mocked(apiAcademia.grupos).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
  vi.mocked(apiAcademia.calendario).mockResolvedValue({
    sede: null,
    meses: ["2026-10"],
    filas: [
      {
        inicio: "07:00",
        fin: "09:00",
        esFranja: true,
        celdas: [
          {
            mes: "2026-10",
            grupos: [
              {
                grupoId: 7,
                nombre: "Barbería",
                carrera: { id: 3, nombre: "Barbería" },
                modulo: { orden: 1, nombre: "Corte", total: 3 },
                ultimo: false,
                dias: [1, 3, 5],
                aula: null,
                docente: null,
                inscritos: 10,
                cupo: 25,
                inscripcionAbierta: true,
                pagaronModulo: 8,
              },
            ],
          },
        ],
      },
    ],
  });
});

async function montar() {
  render(
    <MemoryRouter>
      <AjustesAcademia />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("N4 · Ajustes del instituto", () => {
  it("el día de inicio se guarda al soltar el campo, y dice que quedó guardado", async () => {
    await montar();
    const dia = screen.getByLabelText(/empiezan el día/);
    fireEvent.change(dia, { target: { value: "5" } });
    fireEvent.blur(dia);
    await act(async () => {});
    expect(apiAcademia.guardarAjustes).toHaveBeenCalledWith({ diaInicioModulo: 5 });
    expect(screen.getByRole("status")).toHaveTextContent("Cambios guardados");
  });

  it("un día fuera de 1..28 no se manda", async () => {
    await montar();
    const dia = screen.getByLabelText(/empiezan el día/);
    fireEvent.change(dia, { target: { value: "31" } });
    fireEvent.blur(dia);
    expect(apiAcademia.guardarAjustes).not.toHaveBeenCalled();
    expect(screen.getByText(/entre 1 y 28/)).toBeInTheDocument();
  });

  it("ronda 1 · W11: con #s-insc en la dirección baja a la sección Inscripción al terminar de cargar", async () => {
    const bajar = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = bajar;
    try {
      render(
        <MemoryRouter initialEntries={["/configuracion/academia#s-insc"]}>
          <AjustesAcademia />
        </MemoryRouter>,
      );
      await act(async () => {});
      expect(bajar).toHaveBeenCalledTimes(1);
      expect(bajar.mock.instances[0]).toBe(document.getElementById("s-insc"));
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("ronda 1 · W9: si fallan los cursos, Ajustes lo dice con «Reintentar» y no queda en «Cargando…»", async () => {
    vi.mocked(apiAcademia.carreras).mockRejectedValueOnce(new Error("Sin conexión"));
    await montar();
    expect(screen.getAllByText("Sin conexión").length).toBeGreaterThan(0);
    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
    expect(screen.queryByText("Comprobando…", { exact: false })).not.toBeInTheDocument();
    vi.mocked(apiAcademia.carreras).mockResolvedValue([]);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Reintentar" })[0]);
    });
    expect(screen.queryByText("Sin conexión")).not.toBeInTheDocument();
  });

  it("ronda 1 · W6: si el guardado falla, el campo y la pantalla vuelven a lo anterior", async () => {
    vi.mocked(apiAcademia.guardarAjustes).mockRejectedValueOnce(new Error("No se pudo guardar"));
    await montar();
    const dia = screen.getByLabelText(/empiezan el día/) as HTMLInputElement;
    const antes = dia.value;
    fireEvent.change(dia, { target: { value: "5" } });
    fireEvent.blur(dia);
    await act(async () => {});
    expect(screen.getAllByText("No se pudo guardar").length).toBeGreaterThan(0);
    expect(dia.value).toBe(antes);
    expect(screen.getByRole("status")).not.toHaveTextContent("Cambios guardados");
  });

  it("ronda 1 · W6: el reproche de un valor fuera de rango se va al corregirlo", async () => {
    await montar();
    const dia = screen.getByLabelText(/empiezan el día/) as HTMLInputElement;
    const original = dia.value;
    fireEvent.change(dia, { target: { value: "31" } });
    fireEvent.blur(dia);
    expect(screen.getByText(/entre 1 y 28/)).toBeInTheDocument();
    // Vuelve al valor de siempre: no hay nada que guardar, pero el reproche sobra.
    fireEvent.change(dia, { target: { value: original } });
    fireEvent.blur(dia);
    await act(async () => {});
    expect(apiAcademia.guardarAjustes).not.toHaveBeenCalled();
    expect(screen.queryByText(/entre 1 y 28/)).not.toBeInTheDocument();
  });

  it("ronda 1 · W6: la nota mínima no puede ser 0 (el backend exige 1 o más)", async () => {
    await montar();
    const nota = screen.getByLabelText("Nota mínima para aprobar");
    fireEvent.change(nota, { target: { value: "0" } });
    fireEvent.blur(nota);
    expect(apiAcademia.guardarAjustes).not.toHaveBeenCalled();
    expect(screen.getByText(/entre 1 y 1000/)).toBeInTheDocument();
  });

  it("las franjas ya no se editan acá: un texto lleva a Sedes, y guardar un ajuste NO manda ni borra las franjas (WEB-8, C5)", async () => {
    await montar();
    const cal = within(screen.getByRole("region", { name: "Calendario" }));
    expect(cal.getByText("Franjas horarias")).toBeInTheDocument();
    expect(cal.getByText(/ahora se cargan en cada/)).toBeInTheDocument();
    expect(cal.getByRole("link", { name: "sede" })).toHaveAttribute("href", "/configuracion/sedes");
    expect(cal.queryByRole("button", { name: /Agregar franja/ })).toBeNull();
    expect(screen.queryByLabelText(/^Desde, franja/)).toBeNull();
    // No pide el calendario para contar grupos por franja: eso era del editor.
    expect(apiAcademia.calendario).not.toHaveBeenCalled();

    const dia = screen.getByLabelText(/empiezan el día/);
    fireEvent.change(dia, { target: { value: "7" } });
    fireEvent.blur(dia);
    await act(async () => {});
    fireEvent.click(screen.getByRole("switch", { name: /piden PIN/ }));
    await act(async () => {});
    for (const [cambios] of vi.mocked(apiAcademia.guardarAjustes).mock.calls) {
      expect(cambios).not.toHaveProperty("franjas");
    }
    expect(apiAcademia.guardarAjustes).toHaveBeenCalledTimes(2);
  });

  it("retención, atrasos y el QR del banco no se muestran mientras no existan; el PIN de los descuentos sí se cambia", async () => {
    await montar();
    expect(screen.queryByRole("switch", { name: /Retención por facturación/ })).toBeNull();
    expect(screen.queryByRole("switch", { name: /Descuento por atrasos/ })).toBeNull();
    expect(screen.queryByText(/Configurar QR/)).toBeNull();
    expect(screen.queryByText("Pronto")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: /piden PIN/ }));
    await act(async () => {});
    expect(apiAcademia.guardarAjustes).toHaveBeenCalledWith({ topePromoSinPinPct: 100 });
  });
});

describe("C6 · los ajustes agrupados por tema", () => {
  const seccion = (nombre: string) => screen.getByRole("region", { name: nombre });

  it("las secciones salen en este orden, cada una con lo suyo", async () => {
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ diasEspera: 7 }));
    await montar();
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-labelledby"))).toEqual([
      "s-cursos",
      "s-cal",
      "s-insc",
      "s-cobro",
      "s-docentes",
      "s-notas",
    ]);

    // Calendario: el día de inicio, la duración y las franjas.
    const cal = within(seccion("Calendario"));
    expect(cal.getByLabelText(/empiezan el día/)).toBeInTheDocument();
    expect(cal.getByText("Franjas horarias")).toBeInTheDocument();
    expect(cal.getByRole("link", { name: "sede" })).toBeInTheDocument();

    // Cobro: el PIN de los descuentos y los días de espera del semáforo de pago.
    const cobro = within(seccion("Cobro"));
    expect(cobro.getByRole("switch", { name: /piden PIN/ })).toBeInTheDocument();
    expect(cobro.getByLabelText(/Días de espera antes de marcar en rojo/)).toBeInTheDocument();

    // Docentes: el pago por defecto y el atraso.
    const docentes = within(seccion("Docentes"));
    expect(docentes.getByLabelText(/Porcentaje de pago por defecto/)).toBeInTheDocument();
    expect(docentes.getByLabelText(/El atraso del docente cuenta desde/)).toBeInTheDocument();

    // Notas y asistencia: sólo lo de notas y asistencia (los días de espera ya no están acá).
    const notas = within(seccion("Notas y asistencia"));
    expect(notas.getByLabelText("Nota mínima para aprobar")).toBeInTheDocument();
    expect(notas.getByLabelText("Nota máxima de la escala")).toBeInTheDocument();
    expect(notas.getByLabelText(/Asistencia mínima/)).toBeInTheDocument();
    expect(notas.queryByLabelText(/Días de espera/)).toBeNull();
    expect(notas.queryByLabelText(/El atraso del docente/)).toBeNull();

    // Inscripción: las fotos (bloqueadas) y la página; el PIN se fue a Cobro.
    const insc = within(seccion("Inscripción"));
    expect(insc.getByRole("switch", { name: /Recibir inscripciones desde la página/ })).toBeInTheDocument();
    expect(insc.queryByRole("switch", { name: /piden PIN/ })).toBeNull();
  });

  it("mover un campo no cambia lo que se guarda: el atraso del docente sigue yendo como toleranciaAtrasoMin", async () => {
    await montar();
    const atraso = within(seccion("Docentes")).getByLabelText(/El atraso del docente cuenta desde/);
    fireEvent.change(atraso, { target: { value: "15" } });
    fireEvent.blur(atraso);
    await act(async () => {});
    expect(apiAcademia.guardarAjustes).toHaveBeenCalledWith({ toleranciaAtrasoMin: 15 });
  });

  it("sin los días de espera en el backend, Cobro queda con el PIN solo", async () => {
    await montar();
    expect(within(seccion("Cobro")).queryByLabelText(/Días de espera/)).toBeNull();
  });
});

describe("B7 · días de espera del semáforo", () => {
  it("se edita y se guarda al soltar el campo", async () => {
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ diasEspera: 7 }));
    await montar();
    const dias = screen.getByLabelText(/Días de espera antes de marcar en rojo/);
    expect(dias).toHaveValue("7");
    fireEvent.change(dias, { target: { value: "10" } });
    fireEvent.blur(dias);
    await act(async () => {});
    expect(apiAcademia.guardarAjustes).toHaveBeenCalledWith({ diasEspera: 10 });
  });

  it("con un backend que no lo conoce no aparece", async () => {
    await montar();
    expect(screen.queryByLabelText(/Días de espera antes de marcar en rojo/)).not.toBeInTheDocument();
  });
});

describe("A5 · la tabla de cursos con el pago al docente (QA 23-oct)", () => {
  const curso = (id: number, nombre: string, extra: Record<string, unknown>) =>
    ({
      id, nombre, descripcion: null, horasTotales: 120, categoriaCctp: null, publicarEnPagina: false, activa: true, orden: id,
      fotoUrl: null, materias: [], planes: [], gruposActivos: 0, precioModulo: 500, descuentoCompletoPct: null, cupoDefecto: 25,
      pctDocente: null, modoSimple: true, ...extra,
    }) as never;

  it("un curso con monto fijo dice «Bs 90 fijo», no el % por defecto", async () => {
    vi.mocked(apiAcademia.carreras).mockResolvedValue([
      curso(1, "Barbería", { pagoDocenteModo: "MONTO", montoDocente: 90 }),
      curso(2, "Tatuaje", { pagoDocenteModo: "PORCENTAJE", pctDocente: 10 }),
    ]);
    await montar();
    const fila = (n: string) => screen.getByText(n).closest("tr")!;
    expect(fila("Barbería").textContent).toMatch(/90,00 fijo/);
    expect(fila("Barbería").textContent).not.toMatch(/%/);
    expect(fila("Tatuaje").textContent).toMatch(/10 %/);
  });
});

describe("C7 · la tarjeta «Inscripción en línea» en Ajustes", () => {
  it("está en la sección Inscripción, debajo de «Recibir inscripciones», y dice qué falta", async () => {
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ preinscripcionActiva: true, paginaPublicada: false }));
    await montar();
    const insc = within(screen.getByRole("region", { name: "Inscripción" }));
    const tarjeta = within(insc.getByRole("group", { name: "Inscripción en línea" }));
    // Sin cursos publicados, sin página publicada y sin grupos abiertos.
    expect(tarjeta.getByRole("link", { name: /Ir a Mi página/ })).toHaveAttribute("href", "/mi-pagina");
    expect(tarjeta.getByRole("link", { name: /Ir al Calendario/ })).toBeInTheDocument();
  });

  it("«Activar» enciende «Recibir inscripciones desde la página» con el mismo guardado de siempre", async () => {
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ preinscripcionActiva: false, paginaPublicada: true }));
    await montar();
    expect(screen.getByRole("switch", { name: "Recibir inscripciones desde la página" })).toHaveAttribute("aria-checked", "false");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Activar" }));
    });
    expect(apiAcademia.guardarAjustes).toHaveBeenCalledWith({ preinscripcionActiva: true });
    expect(screen.getByRole("switch", { name: "Recibir inscripciones desde la página" })).toHaveAttribute("aria-checked", "true");
  });
});
