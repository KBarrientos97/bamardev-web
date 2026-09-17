import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * El catálogo es una pantalla COMPARTIDA: la usa bamardev-restaurant tal como
 * estaba y la farmacia le cuelga sus piezas detrás de `esFarmacia(rubro)`.
 *
 * Estos tests fijan lo que el sistema de restaurante tiene que seguir viendo
 * igual que antes de que existiera el rubro farmacia. Si uno se rompe mientras se
 * trabaja en farmacia, lo que se rompió es el restaurante, no el test.
 */

const sesion = vi.hoisted(() => ({ rubro: "RESTAURANTE" as string | undefined }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ rubro: sesion.rubro, incluye: () => true }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getProductos: vi.fn(),
    getCategorias: vi.fn(async () => []),
    getUnidades: vi.fn(async () => []),
    getAlmacenes: vi.fn(async () => []),
    buscarProductos: vi.fn(async () => ({ items: [], total: 0, limite: 30, offset: 0 })),
  },
}));

import { api } from "../../lib/api";
import Productos from "./Productos";

const getProductos = vi.mocked(api.getProductos);

function producto(datos: Partial<Producto> = {}): Producto {
  return {
    id: 1,
    nombre: "Pollo entero",
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio: 60,
    costo: 40,
    stockMinimo: 5,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 2,
    componentes: [],
    principioActivo: null,
    concentracion: null,
    formaFarmaceutica: null,
    laboratorio: null,
    registroSanitario: null,
    condicionVenta: "LIBRE",
    manejaLote: false,
    controlado: false,
    ...datos,
  };
}

/** Una respuesta que queda colgada hasta que el test la suelta. */
function pendiente<T>() {
  let soltar!: (valor: T) => void;
  const promesa = new Promise<T>((r) => {
    soltar = r;
  });
  return { promesa, soltar };
}

function buscar(texto: string) {
  fireEvent.change(screen.getByPlaceholderText(/^Buscar por/), { target: { value: texto } });
}

beforeEach(() => {
  getProductos.mockReset();
});

describe("bamardev-restaurant: el catálogo se ve como siempre", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("buscar algo que no está dice 'Sin resultados'", async () => {
    getProductos.mockResolvedValue([producto()]);
    render(<Productos />);
    await screen.findByText("Pollo entero");

    buscar("zzz");

    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    expect(screen.getByText("Probá con otro texto o quitá los filtros.")).toBeInTheDocument();
    expect(screen.queryByText(/No hay nada con/)).not.toBeInTheDocument();
  });

  it("con el catálogo vacío invita a cargar el primero, aunque haya texto en el buscador", async () => {
    getProductos.mockResolvedValue([]);
    render(<Productos />);
    await screen.findByText("Todavía no hay artículos");

    buscar("zzz");

    expect(screen.getByText("Todavía no hay artículos")).toBeInTheDocument();
    expect(screen.getByText("Cargá el primer producto de tu catálogo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nuevo artículo/ })).toBeInTheDocument();
  });

  it("al pasar a 'Dados de baja' muestra 'Cargando…' y no la lista de activos", async () => {
    const papelera = pendiente<Producto[]>();
    getProductos
      .mockResolvedValueOnce([producto()])
      .mockReturnValueOnce(papelera.promesa);
    render(<Productos />);
    await screen.findByText("Pollo entero");

    fireEvent.click(screen.getByRole("button", { name: "Dados de baja" }));

    // Mientras llega la papelera, un artículo activo bajo el chip "Dados de
    // baja" se abre con el botón de Restaurar: no puede verse ni un instante.
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(screen.queryByText("Pollo entero")).not.toBeInTheDocument();

    await act(async () => papelera.soltar([producto({ id: 2, nombre: "Gaseosa 2L" })]));
    expect(screen.getByText("Gaseosa 2L")).toBeInTheDocument();
  });
});

describe("farmacia: lo propio del rubro sigue en pie", () => {
  beforeEach(() => {
    sesion.rubro = "FARMACIA";
  });

  it("buscar algo que no está nombra lo que se buscó", async () => {
    getProductos.mockResolvedValue([producto({ nombre: "Amoxicilina", stockTotal: 2 })]);
    render(<Productos />);
    // "Bajo stock" lee el catálogo entero, sin pasar por el buscador del servidor.
    fireEvent.click(screen.getByRole("button", { name: "Bajo stock" }));
    await screen.findByText("Amoxicilina");

    buscar("zzz");

    expect(screen.getByText('No hay nada con "zzz"')).toBeInTheDocument();
  });

  it("entre dos filtros del catálogo tampoco deja la lista anterior mientras carga", async () => {
    const papelera = pendiente<Producto[]>();
    getProductos
      .mockResolvedValueOnce([producto({ nombre: "Amoxicilina", stockTotal: 2 })])
      .mockReturnValueOnce(papelera.promesa);
    render(<Productos />);
    fireEvent.click(screen.getByRole("button", { name: "Bajo stock" }));
    await screen.findByText("Amoxicilina");

    fireEvent.click(screen.getByRole("button", { name: "Dados de baja" }));

    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(screen.queryByText("Amoxicilina")).not.toBeInTheDocument();
  });
});
