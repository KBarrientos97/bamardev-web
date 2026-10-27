import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Carrera } from "../../../lib/academia/tipos";
import { ajustesDePrueba } from "../../../test/academiaFixtures";

/**
 * N2 · Cursos en modo simple: la lista con lo que cuesta cada uno, el panel
 * que muestra "así se ofrece" antes de guardar, y el guardado que manda los
 * módulos con su id para que el servidor los renombre y no los duplique.
 */

/** `sinGrupos`: un rol que configura cursos pero no tiene `academia.grupos`. */
const quien = vi.hoisted(() => ({ sinGrupos: false }));

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_ADMIN: s } = await import("../../../test/academiaFixtures");
  return {
    useAuth: () => ({
      ...s,
      usuario: quien.sinGrupos ? { ...s.usuario, permisos: s.usuario.permisos.filter((x: string) => x !== "academia.grupos") } : s.usuario,
      puede: () => true,
    }),
  };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: {
      carreras: vi.fn(),
      carrera: vi.fn(),
      ajustes: vi.fn(),
      crearCarreraSimple: vi.fn(),
      editarCarreraSimple: vi.fn(),
      grupos: vi.fn(),
    },
  };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import Carreras from "./Carreras";

const materia = (id: number, orden: number, nombre: string) => ({ id, nombre, orden, horas: 40, descripcion: null, periodo: null, activa: true });

const BARBERIA: Carrera = {
  id: 3,
  nombre: "Barbería",
  descripcion: null,
  horasTotales: 120,
  categoriaCctp: null,
  publicarEnPagina: true,
  activa: true,
  orden: 1,
  fotoUrl: null,
  materias: [materia(31, 1, "Corte clásico"), materia(32, 2, "Degradados"), materia(33, 3, "Barba y color")],
  planes: [
    { id: 1, nombre: "Mes a mes", orden: 1, activo: true, total: 1500, calendario: [], baseDocente: {}, generado: "MES_A_MES" },
    { id: 2, nombre: "Pago completo", orden: 2, activo: true, total: 1350, calendario: [], baseDocente: {}, generado: "COMPLETO" },
  ],
  gruposActivos: 2,
  precioModulo: 500,
  descuentoCompletoPct: 10,
  cupoDefecto: 25,
  pctDocente: null,
  modoSimple: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  quien.sinGrupos = false;
  vi.mocked(apiAcademia.carreras).mockResolvedValue([BARBERIA, { ...BARBERIA, id: 4, nombre: "Maquillaje", publicarEnPagina: false, gruposActivos: 0 }]);
  vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba());
  vi.mocked(apiAcademia.editarCarreraSimple).mockImplementation(async (id, input) => ({ ...BARBERIA, id, nombre: input.nombre }));
  vi.mocked(apiAcademia.crearCarreraSimple).mockImplementation(async (input) => ({ ...BARBERIA, id: 9, nombre: input.nombre }));
});

async function montar() {
  render(
    <MemoryRouter>
      <Carreras />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("N2 · Cursos", () => {
  it("lista los cursos con el precio por módulo, el pago completo y el % del instituto; los filtros cuentan", async () => {
    await montar();
    expect(screen.getByText(/empiezan el 10 de cada mes/)).toBeInTheDocument();
    const fila = screen.getByRole("button", { name: "Editar Barbería" });
    expect(within(fila).getByText(/1\.350/)).toBeInTheDocument();
    expect(within(fila).getByText("del instituto")).toBeInTheDocument();
    // U4: sin filtros de publicación; el estado va como marca en la fila.
    expect(screen.queryByRole("tab", { name: /Sin publicar|En la página/ })).not.toBeInTheDocument();
    expect(within(fila).getByText("En la página")).toBeInTheDocument();
    expect(within(fila).queryByText(/Sin publicar/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Editar Maquillaje" })).getByText("Sin publicar en la página")).toBeInTheDocument();
  });

  it("U4: los chips son Todos y Retirados, y sólo si hay algún retirado", async () => {
    await montar();
    // Sin retirados no hay nada que filtrar: la barra no aparece.
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    vi.mocked(apiAcademia.carreras).mockResolvedValue([BARBERIA, { ...BARBERIA, id: 5, nombre: "Tatuaje", activa: false }]);
    cleanup();
    await montar();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Todos 1", "Retirados 1"]);
    expect(screen.queryByRole("button", { name: "Editar Tatuaje" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Retirados/ }));
    expect(screen.getByRole("button", { name: "Editar Tatuaje" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar Barbería" })).not.toBeInTheDocument();
  });

  it("el panel muestra cómo se ofrece y guarda los módulos con su id", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Barbería" }));
    const panel = screen.getByRole("complementary", { name: "Barbería" });
    // C3: el % del curso manda sobre el de Ajustes y se dice en el formulario.
    expect(within(panel).getByText(/Este porcentaje manda sobre el de Ajustes/)).toBeInTheDocument();
    const oferta = within(panel).getByRole("region", { name: "Así se ofrece" });
    expect(oferta).toHaveTextContent(/3 cuotas/);
    expect(oferta).toHaveTextContent(/ahorra Bs 150/);
    // 20 % de 500 = 100; con pago completo, 20 % de 450 = 90.
    expect(oferta).toHaveTextContent(/Bs 100,00 por estudiante/);
    expect(oferta).toHaveTextContent(/Bs 90,00/);

    fireEvent.change(within(panel).getByLabelText("Nombre del módulo 2"), { target: { value: "Fade" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Agregar módulo" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiAcademia.editarCarreraSimple).toHaveBeenCalledWith(3, {
      nombre: "Barbería",
      modulos: [
        { id: 31, nombre: "Corte clásico" },
        { id: 32, nombre: "Fade" },
        { id: 33, nombre: "Barba y color" },
        { nombre: "Módulo 4" },
      ],
      precioModulo: 500,
      descuentoCompletoPct: 10,
      cupoDefecto: 25,
      pctDocente: null,
      publicarEnPagina: true,
    });
  });

  it("un curso nuevo sin precio no se crea", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo curso" }));
    const panel = screen.getByRole("complementary", { name: "Nuevo curso" });
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Tatuaje" } });
    expect(within(panel).getByText(/Poné el precio/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Crear curso" }));
    expect(apiAcademia.crearCarreraSimple).not.toHaveBeenCalled();
    fireEvent.change(within(panel).getByLabelText(/Precio por módulo/), { target: { value: "600" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Crear curso" }));
    await act(async () => {});
    expect(apiAcademia.crearCarreraSimple).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Tatuaje", precioModulo: 600, modulos: [{ nombre: "Módulo 1" }], descuentoCompletoPct: 10, cupoDefecto: 20 }),
    );
  });
});

describe("C2 · «Abrir el primer grupo» al crear un curso", () => {
  function Destino() {
    const l = useLocation();
    return <p data-testid="destino">{`${l.pathname}${l.search}`}</p>;
  }
  async function crearCurso() {
    render(
      <MemoryRouter initialEntries={["/configuracion/carreras"]}>
        <Routes>
          <Route path="/configuracion/carreras" element={<Carreras />} />
          <Route path="*" element={<Destino />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Nuevo curso" }));
    const panel = screen.getByRole("complementary", { name: "Nuevo curso" });
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Tatuaje" } });
    fireEvent.change(within(panel).getByLabelText(/Precio por módulo/), { target: { value: "600" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Crear curso" }));
    await act(async () => {});
  }

  it("quien abre grupos ve el botón y llega al calendario con el curso nuevo", async () => {
    await crearCurso();
    expect(screen.getByText(/Curso creado/)).toHaveTextContent("Tatuaje");
    fireEvent.click(screen.getByRole("button", { name: "Abrir el primer grupo" }));
    expect(screen.getByTestId("destino")).toHaveTextContent("/academia/calendario?nuevoGrupo=9");
  });

  it("sin academia.grupos sólo sale «Curso creado.», sin el botón", async () => {
    quien.sinGrupos = true;
    await crearCurso();
    expect(screen.getByText("Curso creado.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir el primer grupo" })).not.toBeInTheDocument();
  });

  it("editar un curso no ofrece abrir grupo: sólo el curso nuevo", async () => {
    render(
      <MemoryRouter>
        <Carreras />
      </MemoryRouter>,
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Editar Barbería" }));
    const panel = screen.getByRole("complementary", { name: "Barbería" });
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Barbería pro" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(screen.getByText("Cambios guardados.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir el primer grupo" })).not.toBeInTheDocument();
  });
});

describe("A4 · pago completo por porcentaje o precio final", () => {
  it("con precio final dice a cuánto equivale y lo manda (el % va con el equivalente)", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Barbería" }));
    const panel = screen.getByRole("complementary", { name: "Barbería" });
    const selector = within(panel).getByRole("radiogroup", { name: "Descuento por pago completo" });
    expect(within(selector).getByRole("radio", { name: "Porcentaje" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(selector).getByRole("radio", { name: "Precio final" }));
    fireEvent.change(within(panel).getByLabelText("Precio final del pago completo (Bs)"), { target: { value: "1300" } });
    expect(panel).toHaveTextContent("Equivale a 13,33 % de descuento (regular Bs 1.500");
    const oferta = within(panel).getByRole("region", { name: "Así se ofrece" });
    expect(oferta).toHaveTextContent(/ahorra Bs 200/);

    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiAcademia.editarCarreraSimple).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ precioCompletoFijo: 1300, descuentoCompletoPct: 13.33 }),
    );
  });

  it("no deja un precio final por encima de lo que cuesta mes a mes", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Barbería" }));
    const panel = screen.getByRole("complementary", { name: "Barbería" });
    fireEvent.click(within(panel).getByRole("radio", { name: "Precio final" }));
    fireEvent.change(within(panel).getByLabelText("Precio final del pago completo (Bs)"), { target: { value: "1600" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiAcademia.editarCarreraSimple).not.toHaveBeenCalled();
    expect(within(panel).getAllByText(/hasta Bs 1\.500/).length).toBeGreaterThan(0);
  });

  it("un curso con precio final abre en ese modo, la lista lo dice, y volver al % lo limpia", async () => {
    vi.mocked(apiAcademia.carreras).mockResolvedValue([
      { ...BARBERIA, precioCompletoFijo: 1300, precioCompletoEfectivo: 1300, descuentoCompletoEquivalentePct: 13.33, descuentoCompletoPct: null },
    ]);
    await montar();
    const fila = screen.getByRole("button", { name: "Editar Barbería" });
    expect(fila).toHaveTextContent("13,33 % menos · precio final");
    fireEvent.click(fila);
    const panel = screen.getByRole("complementary", { name: "Barbería" });
    expect(within(panel).getByRole("radio", { name: "Precio final" })).toHaveAttribute("aria-checked", "true");
    expect(within(panel).getByLabelText("Precio final del pago completo (Bs)")).toHaveValue("1300");
    fireEvent.click(within(panel).getByRole("radio", { name: "Porcentaje" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiAcademia.editarCarreraSimple).toHaveBeenCalledWith(3, expect.objectContaining({ precioCompletoFijo: null }));
  });
});

describe("A5 · pago al docente por % o por monto fijo", () => {
  it("la frase explica el %; con monto fijo pide el monto y lo manda", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Barbería" }));
    const panel = screen.getByRole("complementary", { name: "Barbería" });
    expect(within(panel).getByTestId("frase-docente")).toHaveTextContent(
      "El docente cobra el 20 % de lo que paga cada estudiante por el módulo.",
    );
    fireEvent.click(within(panel).getByRole("radio", { name: /Monto fijo por estudiante y módulo/ }));
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    expect(apiAcademia.editarCarreraSimple).not.toHaveBeenCalled();
    expect(within(panel).getByText(/Poné cuánto cobra el docente/)).toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText("Bs por estudiante y módulo pagado"), { target: { value: "90" } });
    expect(within(panel).getByTestId("frase-docente")).toHaveTextContent(
      "El docente cobra Bs 90,00 por cada estudiante que pagó el módulo completo.",
    );
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiAcademia.editarCarreraSimple).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ pagoDocenteModo: "MONTO", montoDocente: 90 }),
    );
  });

  it("un curso con monto fijo lo muestra en la lista y volver al % lo limpia", async () => {
    vi.mocked(apiAcademia.carreras).mockResolvedValue([{ ...BARBERIA, pagoDocenteModo: "MONTO", montoDocente: 90 }]);
    await montar();
    const fila = screen.getByRole("button", { name: "Editar Barbería" });
    expect(fila).toHaveTextContent("Bs 90,00 fijo");
    fireEvent.click(fila);
    const panel = screen.getByRole("complementary", { name: "Barbería" });
    fireEvent.click(within(panel).getByRole("radio", { name: /% de lo que paga/ }));
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiAcademia.editarCarreraSimple).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ pagoDocenteModo: "PORCENTAJE", montoDocente: null }),
    );
  });
});

describe("QA 23-oct · Cursos", () => {
  it("la columna Docente dice el monto fijo aunque el backend no mande el modo", async () => {
    vi.mocked(apiAcademia.carreras).mockResolvedValue([{ ...BARBERIA, pagoDocenteModo: undefined, montoDocente: 90 }]);
    await montar();
    const fila = screen.getByRole("button", { name: "Editar Barbería" });
    expect(fila).toHaveTextContent("Bs 90,00 fijo");
    expect(fila).not.toHaveTextContent("20 %");
  });

  it("con «Precio final» vacío, «Así se ofrece» espera el valor en vez de mostrar el del %", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Barbería" }));
    const panel = screen.getByRole("complementary", { name: "Barbería" });
    const oferta = within(panel).getByRole("region", { name: "Así se ofrece" });
    expect(oferta).toHaveTextContent(/Bs 1\.350/);
    fireEvent.click(within(panel).getByRole("radio", { name: "Precio final" }));
    expect(oferta).not.toHaveTextContent(/Bs 1\.350/);
    expect(oferta).toHaveTextContent("—");
  });

  it("el error de guardar un precio final inválido se va al corregirlo", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Barbería" }));
    const panel = screen.getByRole("complementary", { name: "Barbería" });
    fireEvent.click(within(panel).getByRole("radio", { name: "Precio final" }));
    const campo = within(panel).getByLabelText("Precio final del pago completo (Bs)");
    fireEvent.change(campo, { target: { value: "1600" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    expect(within(panel).getByText(/que es lo que cuesta mes a mes/)).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "1300" } });
    expect(within(panel).queryByText(/que es lo que cuesta mes a mes/)).not.toBeInTheDocument();
  });
});

describe("Sin popups encimados · el panel del curso", () => {
  it("«Editar planes a medida» cierra el panel y abre las opciones avanzadas; al cerrarlas se vuelve al curso", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Barbería" }));
    const panel = screen.getByRole("complementary", { name: "Barbería" });
    fireEvent.click(within(panel).getByRole("button", { name: "Opciones avanzadas" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Editar planes a medida" }));
    // Nunca los dos a la vez: el panel se va y queda sólo el editor.
    expect(screen.queryByRole("complementary", { name: "Barbería" })).not.toBeInTheDocument();
    const avanzadas = screen.getByRole("dialog", { name: "Opciones avanzadas · Barbería" });
    fireEvent.click(within(avanzadas).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Barbería" })).toBeInTheDocument();
  });

  it("con cambios sin guardar no deja ir a los planes a medida (se perderían)", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Barbería" }));
    const panel = screen.getByRole("complementary", { name: "Barbería" });
    fireEvent.change(within(panel).getByLabelText("Nombre del módulo 2"), { target: { value: "Fade" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Opciones avanzadas" }));
    expect(within(panel).getByRole("button", { name: "Editar planes a medida" })).toBeDisabled();
    expect(within(panel).getByText(/Guardá los cambios de arriba antes/)).toBeInTheDocument();
    // Guardados, ya se puede.
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(within(screen.getByRole("complementary", { name: "Barbería" })).getByRole("button", { name: "Editar planes a medida" })).toBeEnabled();
  });

  it("compartir el enlace de inscripción se despliega dentro del panel, sin un diálogo encima", async () => {
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ subdominio: "horizonte" }));
    vi.mocked(apiAcademia.grupos).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Barbería" }));
    const panel = screen.getByRole("complementary", { name: "Barbería" });
    const boton = within(panel).getByRole("button", { name: "Compartir enlace de inscripción" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    await act(async () => {
      fireEvent.click(boton);
    });
    expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const compartir = within(panel).getByRole("region", { name: "Compartir enlace de inscripción" });
    expect(apiAcademia.grupos).toHaveBeenCalledWith({ pageSize: 100, carreraId: 3 });
    expect(compartir).toHaveTextContent("No hay grupos con la inscripción abierta.");
  });
});
