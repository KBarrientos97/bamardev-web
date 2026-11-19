import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Categoria, Producto } from "../../types";

/**
 * Las categorías se acomodan arrastrando en el punto de venta (18-nov,
 * CONTRATO-pos-por-cajero §3.3): los chips y, en la lista en columnas, cada
 * bloque agarrado de su cabecera. Se pinta al instante y se guarda donde le
 * toca a quien lo movió (R2): el dueño, en el negocio; el cajero, en lo suyo.
 */

const sesion = vi.hoisted(() => {
  const s = {
    rubro: "RESTAURANTE",
    pos: undefined as Record<string, unknown> | undefined,
    permisos: [] as string[],
    oyentes: new Set<() => void>(),
    fijarConfigPos: vi.fn(),
  };
  // Como la sesión de verdad: lo que se fija se ve en el próximo dibujo.
  s.fijarConfigPos.mockImplementation((pos: Record<string, unknown>) => {
    s.pos = pos;
    for (const o of s.oyentes) o();
  });
  return s;
});

vi.mock("../../store/AuthContext", async () => {
  const { useSyncExternalStore } = await import("react");
  const suscribir = (o: () => void) => {
    sesion.oyentes.add(o);
    return () => {
      sesion.oyentes.delete(o);
    };
  };
  return {
    useAuth: () => {
      const pos = useSyncExternalStore(suscribir, () => sesion.pos);
      return {
        negocio: { alias: "prueba", tipoNegocio: sesion.rubro, pos },
        usuario: { username: "cajero", permisos: sesion.permisos },
        rubro: sesion.rubro,
        incluye: () => false,
        puede: () => true,
        fijarConfigPos: sesion.fijarConfigPos,
      };
    },
  };
});

vi.mock("../../lib/api", () => ({
  api: {
    productosPausados: vi.fn(),
    pausarProducto: vi.fn(),
    reactivarProducto: vi.fn(),
    guardarConfigPos: vi.fn(),
    guardarMiConfigPos: vi.fn(),
  },
}));

vi.mock("../farmacia/CatalogoVenta", () => ({ default: () => <p>catálogo de la farmacia</p> }));

import { api } from "../../lib/api";
import PantallaVenta from "./PantallaVenta";
import type { Carrito } from "./useCarrito";

// Los tamaños de un local de arroz con leche. Los ids de las categorías son
// también ids de productos: el arrastre de unas no tiene que tomar a los otros.
const C = { id: 1, nombre: "C", activo: true };
const M = { id: 2, nombre: "M", activo: true };
const L = { id: 3, nombre: "L", activo: true };
const XL = { id: 4, nombre: "XL", activo: true };
const D = { id: 5, nombre: "D", activo: true };
const CATEGORIAS: Categoria[] = [C, M, L, XL, D];

const producto = (id: number, nombre: string, categoria: Categoria): Producto =>
  ({
    id,
    nombre,
    precio: 10 + id,
    // Sin stock que contar: se ofrecen siempre.
    tipoProducto: "SERVICIO",
    stockTotal: 0,
    stockMinimo: 0,
    habilitado: true,
    icono: null,
    componentes: [],
    categoria: { id: categoria.id, nombre: categoria.nombre },
  }) as unknown as Producto;

const PRODUCTOS = [
  producto(1, "Vaso C con canela", C),
  producto(2, "Vaso M solo", M),
  producto(3, "Vaso L con canela", L),
  producto(4, "Vaso XL solo", XL),
  producto(5, "Vaso D con canela", D),
];

const carrito: Carrito = {
  lineas: [],
  unidades: 0,
  subtotal: 0,
  total: 0,
  agregar: vi.fn(),
  setCantidad: vi.fn(),
  setAgregados: vi.fn(),
  setNota: vi.fn(),
  setEnMesa: vi.fn(),
  setConsumo: vi.fn(),
  setConsumoTodo: vi.fn(),
  quitar: vi.fn(),
  vaciar: vi.fn(),
  aDetalles: vi.fn(() => []),
};

async function montar() {
  render(
    <MemoryRouter>
      <PantallaVenta productos={PRODUCTOS} categorias={CATEGORIAS} carrito={carrito} onCobrar={() => {}} sucursalId={3} />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const chips = () =>
  screen
    .queryAllByRole("button")
    .filter((b) => b.className.includes("rounded-full px-3.5"))
    .map((b) => b.textContent);
/** Lo que se agarra de un chip: su envoltorio (el botón sólo elige la categoría). */
const chip = (nombre: string) => screen.getByRole("button", { name: nombre }).closest("[data-arrastre-chip]")!;
/** Los bloques de la lista en columnas, en el orden de la pantalla. */
const bloques = () => screen.queryAllByRole("region").map((s) => s.getAttribute("aria-label"));
const cabecera = (nombre: string) => screen.getByRole("region", { name: nombre }).querySelector("header")!;

/** Lo que el puntero tiene debajo. */
function debajo(el: Element | null) {
  document.elementFromPoint = vi.fn(() => el);
}
function apretar(el: Element, x = 10, y = 10) {
  fireEvent.pointerDown(el, { pointerType: "mouse", button: 0, clientX: x, clientY: y });
}
function mover(x: number, y: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y }));
  });
}
function soltar() {
  act(() => {
    window.dispatchEvent(new MouseEvent("pointerup"));
  });
}
/** Que conteste el servidor (lo que se guardó, o que falló). */
async function esperar() {
  await act(async () => {});
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  sesion.rubro = "RESTAURANTE";
  sesion.pos = undefined;
  sesion.permisos = ["ventas.vender"];
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: 1366 >= Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? Infinity),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.mocked(api.productosPausados).mockResolvedValue({ sucursal: { id: 3, nombre: "Centro" }, pausados: [] });
  vi.mocked(api.guardarConfigPos).mockImplementation(async (c) => ({ ...sesion.pos, ...c }));
  vi.mocked(api.guardarMiConfigPos).mockImplementation(async (c) => ({
    config: { ...sesion.pos, ...c },
    propios: Object.keys(c),
    esDelNegocio: false,
  }));
  debajo(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("los chips de categoría se acomodan arrastrando", () => {
  it("el dueño lleva D al lado de C: los bloques de las columnas lo siguen y se guarda en el negocio", async () => {
    sesion.permisos = ["ventas.vender", "negocio.configurar"];
    sesion.pos = { vista: "COLUMNAS" };
    await montar();
    expect(chips()).toEqual(["Todos", "C", "M", "L", "XL", "D"]);

    apretar(chip("D"));
    mover(30, 10);
    debajo(chip("M"));
    mover(60, 10);
    // En el momento: el chip y el bloque D, debajo del C.
    expect(chips()).toEqual(["Todos", "C", "D", "M", "L", "XL"]);
    expect(bloques()).toEqual(["C", "D", "M", "L", "XL"]);

    // El click que llega al soltar no elige la categoría. (El botón se busca antes.)
    const botonD = screen.getByRole("button", { name: "D" });
    soltar();
    fireEvent.click(botonD);
    await esperar();
    expect(screen.getByRole("button", { name: "Todos" }).className).toContain("bg-primary-boton");

    expect(api.guardarConfigPos).toHaveBeenCalledTimes(1);
    expect(api.guardarConfigPos).toHaveBeenCalledWith({ ordenCategorias: [1, 5, 2, 3, 4] });
    expect(api.guardarMiConfigPos).not.toHaveBeenCalled();
    // Se pintó al instante y quedó lo que contestó el servidor.
    expect(sesion.fijarConfigPos).toHaveBeenCalledWith(expect.objectContaining({ ordenCategorias: [1, 5, 2, 3, 4] }));
    expect(chips()).toEqual(["Todos", "C", "D", "M", "L", "XL"]);
    expect(bloques()).toEqual(["C", "D", "M", "L", "XL"]);
  });

  it("el cajero lo guarda en lo suyo, no en el del negocio", async () => {
    await montar();
    apretar(chip("XL"));
    mover(30, 10);
    debajo(chip("C"));
    mover(5, 10);
    soltar();
    await esperar();
    expect(api.guardarMiConfigPos).toHaveBeenCalledWith({ ordenCategorias: [4, 1, 2, 3, 5] });
    expect(api.guardarConfigPos).not.toHaveBeenCalled();
    expect(chips()).toEqual(["Todos", "XL", "C", "M", "L", "D"]);
  });

  it("si no se guarda, vuelve al orden que había y lo avisa", async () => {
    sesion.pos = { ordenCategorias: [2, 1] };
    vi.mocked(api.guardarMiConfigPos).mockRejectedValue(new Error("Sin conexión"));
    await montar();
    expect(chips()).toEqual(["Todos", "M", "C", "L", "XL", "D"]);
    apretar(chip("D"));
    mover(30, 10);
    debajo(chip("M"));
    mover(5, 10);
    soltar();
    // Mientras viaja ya se ve donde se soltó…
    expect(chips()).toEqual(["Todos", "D", "M", "C", "L", "XL"]);
    await esperar();
    // …y como no se guardó, vuelve.
    expect(chips()).toEqual(["Todos", "M", "C", "L", "XL", "D"]);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo guardar el orden de las categorías. Probá de nuevo.");
  });

  it("«Todos» y «Pausados» no se agarran ni son destino; soltar donde estaba no guarda nada", async () => {
    vi.mocked(api.productosPausados).mockResolvedValue({
      sucursal: { id: 3, nombre: "Centro" },
      pausados: [{ productoId: 2, nombre: "Vaso M solo", desde: "2026-11-18T12:00:00Z", por: "ana" }],
    });
    await montar();
    const todos = screen.getByRole("button", { name: "Todos" });
    const pausados = screen.getByRole("button", { name: "Pausados (1)" });
    expect(todos.closest("[data-arrastre-chip]")).toBeNull();
    expect(pausados.closest("[data-arrastre-chip]")).toBeNull();

    apretar(chip("M"));
    mover(30, 10);
    for (const otro of [todos, pausados, chip("M")]) {
      debajo(otro);
      mover(50, 10);
    }
    soltar();
    await esperar();
    expect(chips()).toEqual(["Todos", "C", "M", "L", "XL", "D", "Pausados (1)"]);
    expect(api.guardarMiConfigPos).not.toHaveBeenCalled();
    expect(api.guardarConfigPos).not.toHaveBeenCalled();
  });
});

describe("los bloques de la lista en columnas se acomodan desde su cabecera", () => {
  beforeEach(() => {
    sesion.pos = { vista: "COLUMNAS" };
  });

  it("con una búsqueda, sólo se reasignan los lugares de los bloques que se ven", async () => {
    await montar();
    fireEvent.change(screen.getByPlaceholderText("Buscar producto o código"), { target: { value: "canela" } });
    expect(bloques()).toEqual(["C", "L", "D"]);
    // El destino es el bloque entero; lo que se agarra, la cabecera.
    expect(screen.getByRole("region", { name: "C" })).toHaveAttribute("data-arrastre-bloque", "1");

    apretar(cabecera("D"));
    mover(30, 300);
    // Debajo, una fila del bloque C (el producto 1): cuenta el bloque, no el producto.
    debajo(within(screen.getByRole("region", { name: "C" })).getByRole("button", { name: "Vaso C con canela" }));
    mover(30, 20);
    expect(bloques()).toEqual(["D", "C", "L"]);
    soltar();
    await esperar();
    // M y XL, que no se veían, siguen en sus lugares (el segundo y el cuarto).
    expect(api.guardarMiConfigPos).toHaveBeenCalledWith({ ordenCategorias: [5, 2, 1, 4, 3] });
    expect(bloques()).toEqual(["D", "C", "L"]);
  });

  it("apretar una fila mueve el producto, no el bloque", async () => {
    await montar();
    const fila = within(screen.getByRole("region", { name: "D" })).getByRole("button", { name: "Vaso D con canela" });
    apretar(fila);
    mover(30, 300);
    debajo(screen.getByRole("region", { name: "C" }));
    mover(30, 20);
    soltar();
    await esperar();
    expect(bloques()).toEqual(["C", "M", "L", "XL", "D"]);
    expect(api.guardarMiConfigPos).not.toHaveBeenCalled();
  });
});
