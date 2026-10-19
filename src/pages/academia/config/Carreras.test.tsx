import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Carrera } from "../../../lib/academia/tipos";
import { ajustesDePrueba } from "../../../test/academiaFixtures";

/**
 * N2 · Cursos en modo simple: la lista con lo que cuesta cada uno, el panel
 * que muestra "así se ofrece" antes de guardar, y el guardado que manda los
 * módulos con su id para que el servidor los renombre y no los duplique.
 */

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_ADMIN: s } = await import("../../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
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
    expect(screen.getByRole("tab", { name: /En la página/ })).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("tab", { name: /Sin publicar/ }));
    expect(screen.queryByRole("button", { name: "Editar Barbería" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar Maquillaje" })).toBeInTheDocument();
  });

  it("el panel muestra cómo se ofrece y guarda los módulos con su id", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Barbería" }));
    const panel = screen.getByRole("complementary", { name: "Barbería" });
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
