import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecetaPlato } from "../../lib/recetas/tipos";
import type { Producto } from "../../types";

/**
 * Artículos con las recetas del plato (CONTRATO-recetas-plato §3.4). Apagadas
 * —lo de fábrica—, la pantalla es la de siempre: tres tipos, el campo «Costo»
 * y nada de recetas, aunque un artículo traiga `conReceta`. Prendidas, aparece
 * «Con receta»: por debajo un SERVICIO, sin campo de costo, y su receta se arma
 * en el editor, que ocupa el lugar del formulario.
 */

// Artículos es una pantalla pesada (el formulario entero, la ficha de farmacia
// importada): con la máquina cargada, los 5 s de fábrica no alcanzan.
vi.setConfig({ testTimeout: 30_000 });

const sesion = vi.hoisted(() => ({
  recetas: undefined as { activas: boolean; elegirPresa: boolean; puroDoble: boolean } | undefined,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: "RESTAURANTE",
    vocabulario: undefined,
    incluye: (c: string) => c === "combos",
    puede: () => false,
    usuario: { id: 1, sucursalId: null, permisos: ["catalogo.editar", "costos.ver"], permisosPropios: [] },
    negocio: { id: 1, nombre: "Prueba", tipoNegocio: "RESTAURANTE", features: [], recetas: sesion.recetas },
  }),
}));

vi.mock("../../lib/useSucursales", () => ({
  useSucursales: () => ({
    sucursalId: null,
    elegir: false,
    elegirSucursal: false,
    valorChip: "",
    opciones: [],
    alElegir: () => {},
    modo: "una",
    miSede: null,
    sugerida: null,
    sucursales: [],
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getProductos: vi.fn(),
    getProducto: vi.fn(),
    getCategorias: vi.fn(async () => []),
    getUnidades: vi.fn(async () => [{ id: 1, nombre: "Unidad", abreviatura: null, activo: true }]),
    getAlmacenes: vi.fn(async () => []),
    getSucursales: vi.fn(async () => []),
    buscarProductos: vi.fn(),
    sugerenciasFicha: vi.fn(async () => null),
    existenciasProducto: vi.fn(async () => []),
    crearProducto: vi.fn(),
    actualizarProducto: vi.fn(async () => ({})),
  },
}));

vi.mock("../../lib/recetas/api", () => ({
  apiRecetas: { receta: vi.fn(), insumos: vi.fn(), guardar: vi.fn() },
}));

// El editor tiene su propio test: acá importa cuándo se abre, de qué plato, y qué pasa al cerrarlo.
const editor = vi.hoisted(() => ({ devuelve: null as RecetaPlato | null }));
vi.mock("./recetas/EditorReceta", () => ({
  default: ({
    platoId,
    onClose,
    onGuardada,
  }: {
    platoId: number;
    onClose: () => void;
    onGuardada: (r: RecetaPlato) => void;
  }) => (
    <div role="dialog" aria-label={`Receta del plato ${platoId}`}>
      <button onClick={onClose}>Cerrar la receta</button>
      <button onClick={() => onGuardada(editor.devuelve!)}>Guardar la receta</button>
    </div>
  ),
}));

import { api } from "../../lib/api";
import { apiRecetas } from "../../lib/recetas/api";
import Productos from "./Productos";

function producto(id: number, nombre: string, extra: Partial<Producto> = {}): Producto {
  return {
    id,
    nombre,
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio: 10,
    costo: 4,
    stockMinimo: 0,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: { id: 1, nombre: "Unidad" },
    stockTotal: 5,
    componentes: [],
    principioActivo: null,
    concentracion: null,
    formaFarmaceutica: null,
    laboratorio: null,
    registroSanitario: null,
    condicionVenta: "LIBRE",
    manejaLote: false,
    controlado: false,
    ...extra,
  };
}

const GASEOSA = producto(1, "Gaseosa");
const SOPA = producto(2, "Sopa del día", { tipoProducto: "SERVICIO", stockTotal: 0 });
const BROASTER = producto(12, "Broaster cuarto", {
  tipoProducto: "SERVICIO",
  conReceta: true,
  precio: 28,
  costo: 14.81,
  stockTotal: 0,
});

const RECETA: RecetaPlato = {
  platoId: 12,
  nombre: "Broaster cuarto",
  precio: 28,
  conReceta: true,
  lineas: [
    {
      insumoId: 2,
      nombre: "Arroz",
      grupo: "GUARNICION",
      porciones: 1,
      puro: true,
      porcionNombre: "porción",
      partes: null,
      seCuenta: false,
      costoPorcion: 0.525,
      costo: 0.53,
    },
    {
      insumoId: 5,
      nombre: "Pollo para broaster",
      grupo: "PRESA",
      porciones: 2,
      puro: false,
      porcionNombre: "presa",
      partes: "POLLO_8",
      seCuenta: true,
      costoPorcion: 4.6125,
      costo: 9.23,
    },
  ],
  costo: 14.81,
  costoMinimo: 14.28,
  costoMaximo: 15.34,
  alcanza: 120,
  limite: "Pollo para broaster",
  sinCosto: [],
};

const prendidas = () => {
  sesion.recetas = { activas: true, elegirPresa: false, puroDoble: true };
};

async function montar() {
  render(
    <MemoryRouter>
      <Productos />
    </MemoryRouter>,
  );
  await screen.findByText("Gaseosa", { selector: "h3" });
  await act(async () => {});
}

const tarjeta = (nombre: string) => screen.getByText(nombre, { selector: "h3" }).closest("li")!;
const tipos = () =>
  Array.from((screen.getByLabelText(/^Tipo/) as HTMLSelectElement).options).map((o) => o.textContent);

async function abrirEdicion(nombre: string) {
  fireEvent.click(within(tarjeta(nombre)).getByRole("button"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  });
}

/** «Nuevo»: el formulario pide sus ayudas al abrirse. */
async function nuevo() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.recetas = undefined;
  editor.devuelve = { ...RECETA, costo: 15.2 };
  vi.mocked(api.getProductos).mockResolvedValue([GASEOSA, SOPA, BROASTER]);
  vi.mocked(api.crearProducto).mockImplementation(async (input) => producto(99, input.nombre, input as Partial<Producto>));
  vi.mocked(apiRecetas.receta).mockResolvedValue(RECETA);
  vi.mocked(apiRecetas.insumos).mockResolvedValue([
    { id: 2, nombre: "Arroz", unidad: "Kilogramo", porcionNombre: "porción", configurado: true, seCuenta: false, partes: null, costoPorcion: 0.525 },
    { id: 5, nombre: "Pollo para broaster", unidad: "Unidad", porcionNombre: "presa", configurado: true, seCuenta: true, partes: "POLLO_8", costoPorcion: 4.6125 },
  ]);
  vi.mocked(apiRecetas.guardar).mockImplementation(async (_id, input) => ({ ...RECETA, conReceta: input.conReceta }));
});

describe("Artículos con las recetas apagadas: lo de siempre", () => {
  it("tres tipos, el campo «Costo» y nada de recetas, aunque el artículo traiga la bandera", async () => {
    await montar();

    // El que el backend marcara con receta se sigue viendo como un elaborado.
    expect(within(tarjeta("Broaster cuarto")).getByText("Elaborado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Con receta" })).not.toBeInTheDocument();

    await nuevo();
    expect(tipos()).toEqual(["Producto", "Elaborado", "Combo"]);
    expect(screen.getByLabelText("Costo")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Receta" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("el alta manda el costo como siempre y no abre ninguna receta", async () => {
    await montar();

    await nuevo();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Agua" } });
    fireEvent.change(screen.getByLabelText("Precio de venta *"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Costo"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Unidad de medida"), { target: { value: "1" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });

    expect(api.crearProducto).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Agua", tipoProducto: "ALMACENABLE", costo: 2, precio: 5 }),
    );
    expect(screen.queryByRole("dialog", { name: /Receta del plato/ })).not.toBeInTheDocument();
    expect(apiRecetas.receta).not.toHaveBeenCalled();
  });
});

describe("Artículos con las recetas prendidas", () => {
  it("«Con receta» va al lado de «Elaborado», en la lista y en el formulario", async () => {
    prendidas();
    await montar();

    expect(within(tarjeta("Broaster cuarto")).getByText("Con receta")).toBeInTheDocument();
    expect(within(tarjeta("Sopa del día")).getByText("Elaborado")).toBeInTheDocument();

    // El filtro: «Con receta» y «Elaborado» se separan.
    fireEvent.click(screen.getByRole("button", { name: "Con receta" }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Broaster cuarto"]);
    fireEvent.click(screen.getByRole("button", { name: "Elaborado" }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Sopa del día"]);

    await nuevo();
    expect(tipos()).toEqual(["Producto", "Elaborado", "Con receta", "Combo"]);
  });

  it("un alta «Con receta» no manda costo, se guarda como elaborado y enseguida abre la receta", async () => {
    prendidas();
    await montar();

    await nuevo();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Broaster medio" } });
    fireEvent.change(screen.getByLabelText("Precio de venta *"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("Unidad de medida"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/^Tipo/), { target: { value: "RECETA" } });

    expect(screen.getByText("Con receta: al venderlo descuenta sus insumos y el sistema le calcula el costo.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Costo")).not.toBeInTheDocument();
    expect(screen.getByText("Lo calcula la receta cuando la armes.")).toBeInTheDocument();
    expect(screen.getByText(/^Todavía no tiene receta: al guardar el artículo se abre/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar y armar la receta" }));
    });
    const enviado = vi.mocked(api.crearProducto).mock.calls[0][0];
    expect(enviado).toMatchObject({ nombre: "Broaster medio", tipoProducto: "SERVICIO", precio: 45 });
    expect(enviado).not.toHaveProperty("costo");

    // El editor ocupa el lugar del formulario.
    expect(screen.getByRole("dialog", { name: "Receta del plato 99" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Nuevo artículo" })).not.toBeInTheDocument();

    // Al cerrarlo (el artículo ya está guardado) se vuelve a la lista, que se pide de nuevo.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cerrar la receta" }));
    });
    expect(screen.queryByRole("dialog", { name: "Receta del plato 99" })).not.toBeInTheDocument();
    expect(api.getProductos).toHaveBeenCalledTimes(2);
  });

  it("editar un plato con receta: el costo lo calcula la receta y «Cambiar la receta» la abre en su lugar", async () => {
    prendidas();
    await montar();
    await abrirEdicion("Broaster cuarto");

    expect((screen.getByLabelText(/^Tipo/) as HTMLSelectElement).value).toBe("RECETA");
    expect(screen.getByText("Bs 14,81").parentElement).toHaveTextContent("Bs 14,81 · lo calcula la receta");
    expect(await screen.findByText("Guarnición: Arroz · 2 presas de Pollo para broaster")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar la receta" }));
    expect(screen.getByRole("dialog", { name: "Receta del plato 12" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Editar artículo" })).not.toBeInTheDocument();

    // Guardada la receta, el formulario vuelve con lo que calculó.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar la receta" }));
    });
    expect(screen.getByRole("dialog", { name: "Editar artículo" })).toBeInTheDocument();
    expect(screen.getByText("Bs 15,20").parentElement).toHaveTextContent("Bs 15,20 · lo calcula la receta");

    // El guardado del artículo no manda el costo.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(api.actualizarProducto).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.actualizarProducto).mock.calls[0][1]).not.toHaveProperty("costo");
    expect(vi.mocked(api.actualizarProducto).mock.calls[0][1]).toMatchObject({ tipoProducto: "SERVICIO" });
    expect(apiRecetas.guardar).not.toHaveBeenCalled();
  });

  it("un plato con receta que pasa a Elaborado: primero se apaga la receta, después el costo a mano", async () => {
    prendidas();
    await montar();
    await abrirEdicion("Broaster cuarto");

    fireEvent.change(screen.getByLabelText(/^Tipo/), { target: { value: "SERVICIO" } });
    const costo = screen.getByLabelText("Costo") as HTMLInputElement;
    expect(costo.value).toBe("14.81");
    fireEvent.change(costo, { target: { value: "15" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });

    expect(apiRecetas.guardar).toHaveBeenCalledWith(12, {
      conReceta: false,
      lineas: [
        { insumoId: 2, porciones: 1, grupo: "GUARNICION", puro: true },
        { insumoId: 5, porciones: 2, grupo: "PRESA", puro: false },
      ],
    });
    expect(api.actualizarProducto).toHaveBeenCalledWith(12, expect.objectContaining({ tipoProducto: "SERVICIO", costo: 15 }));
    // El orden importa: con la receta prendida el backend ignoraría el costo.
    expect(vi.mocked(apiRecetas.guardar).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.actualizarProducto).mock.invocationCallOrder[0],
    );
  });
});
