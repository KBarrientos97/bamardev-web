import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Categoria, Producto } from "../../types";

/**
 * El punto de venta según Configuración › Punto de venta (16-nov): el orden de
 * las categorías, los filtros, los íconos y la vista en columnas. Con lo de
 * fábrica (o sin el dato) el POS es el de siempre; la farmacia y la
 * modificación de una venta no lo toman, y en el celular las columnas vuelven
 * a ser las tarjetas de siempre.
 */

const sesion = vi.hoisted(() => ({
  rubro: "RESTAURANTE",
  pos: undefined as Record<string, unknown> | undefined,
  permisos: [] as string[],
  /** El ancho de la pantalla, para las media queries. */
  ancho: 1366,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { alias: "prueba", tipoNegocio: sesion.rubro, pos: sesion.pos },
    usuario: { username: "cajero", permisos: sesion.permisos },
    rubro: sesion.rubro,
    incluye: () => false,
    puede: () => true,
  }),
}));

vi.mock("../../lib/api", () => ({
  api: { productosPausados: vi.fn(), pausarProducto: vi.fn(), reactivarProducto: vi.fn() },
}));

// La farmacia arma su catálogo aparte: basta saber que es el suyo.
vi.mock("../farmacia/CatalogoVenta", () => ({ default: () => <p>catálogo de la farmacia</p> }));

import { api } from "../../lib/api";
import PantallaVenta, { type ModoModificacion } from "./PantallaVenta";
import type { Carrito, LineaCarrito } from "./useCarrito";

const POLLOS = { id: 1, nombre: "Pollos", activo: true };
const BEBIDAS = { id: 2, nombre: "Bebidas", activo: true };
const EXTRAS = { id: 3, nombre: "Extras", activo: true };
const CATEGORIAS: Categoria[] = [POLLOS, BEBIDAS, EXTRAS];

const producto = (id: number, nombre: string, categoria: Categoria | null, over: Partial<Producto> = {}): Producto =>
  ({
    id,
    nombre,
    precio: 20 + id,
    tipoProducto: "ALMACENABLE",
    stockTotal: 50,
    stockMinimo: 5,
    habilitado: true,
    icono: null,
    componentes: [],
    categoria: categoria && { id: categoria.id, nombre: categoria.nombre },
    ...over,
  }) as unknown as Producto;

const ENTERO = producto(1, "Pollo entero", POLLOS);
const CUARTO = producto(2, "Cuarto de pollo", POLLOS);
const COCA = producto(3, "Coca 2 L", BEBIDAS, { stockTotal: 2 });
const FANTA = producto(4, "Fanta 2 L", BEBIDAS, { stockTotal: 0 });
const PAPAS = producto(5, "Papas extra", EXTRAS, { tipoProducto: "SERVICIO" } as Partial<Producto>);
const SERVILLETAS = producto(6, "Servilletas", null);
const TODOS = [ENTERO, CUARTO, COCA, FANTA, PAPAS, SERVILLETAS];

function carritoCon(lineas: LineaCarrito[] = []): Carrito {
  return {
    lineas,
    unidades: lineas.reduce((n, l) => n + l.cantidad, 0),
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
}

let carrito: Carrito;

async function montar(opc: { lineas?: LineaCarrito[]; modificacion?: ModoModificacion } = {}) {
  carrito = carritoCon(opc.lineas);
  const r = render(
    <MemoryRouter>
      <PantallaVenta
        productos={TODOS}
        categorias={CATEGORIAS}
        carrito={carrito}
        onCobrar={() => {}}
        sucursalId={3}
        modificacion={opc.modificacion}
      />
    </MemoryRouter>,
  );
  await act(async () => {});
  return r;
}

/** Los bloques de la vista en columnas, con sus filas, en el orden de la pantalla. */
function columnas() {
  return screen.queryAllByRole("region").map((s) => [
    s.getAttribute("aria-label"),
    within(s)
      .getAllByRole("listitem")
      // El primer botón de cada fila es la fila entera (la que suma).
      .map((li) => li.querySelector("button")?.getAttribute("aria-label")),
  ]);
}
/** El botón que es toda la fila: tocarlo suma. */
const botonFila = (nombre: string) => screen.getByRole("button", { name: nombre });
const fila = (nombre: string) => botonFila(nombre).closest("li")!;
const chips = () =>
  screen
    .queryAllByRole("button")
    .filter((b) => b.className.includes("rounded-full px-3.5"))
    .map((b) => b.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  sesion.rubro = "RESTAURANTE";
  sesion.pos = undefined;
  sesion.permisos = [];
  sesion.ancho = 1366;
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: sesion.ancho >= Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? Infinity),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.mocked(api.productosPausados).mockResolvedValue({ sucursal: { id: 3, nombre: "Centro" }, pausados: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("con lo de fábrica (o sin el dato), el POS de siempre", () => {
  it("tarjetas, chips en el orden en que llegan e íconos", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: "Pollo entero" })).toBeInTheDocument();
    expect(screen.queryAllByRole("region")).toEqual([]);
    expect(chips()).toEqual(["Todos", "Pollos", "Bebidas", "Extras"]);
    // El monograma del producto (sin ícono elegido): las iniciales.
    const tarjeta = screen.getByRole("heading", { name: "Pollo entero" }).closest("li")!;
    expect(within(tarjeta).getByText("PE")).toBeInTheDocument();
    // Y se arrastra, como siempre.
    expect(tarjeta).toHaveAttribute("data-arrastre-id", "1");
  });
});

describe("el orden de las categorías", () => {
  it("vale para los chips; las que no están en la lista, después", async () => {
    sesion.pos = { ordenCategorias: [3, 1] };
    await montar();
    expect(chips()).toEqual(["Todos", "Extras", "Pollos", "Bebidas"]);
  });

  it("y para las columnas", async () => {
    sesion.pos = { vista: "COLUMNAS", ordenCategorias: [2, 3] };
    await montar();
    expect(columnas().map(([n]) => n)).toEqual(["Bebidas", "Extras", "Pollos", "Otros"]);
  });
});

describe("sin filtros de categoría", () => {
  it("no hay fila de chips; el buscador queda", async () => {
    sesion.pos = { filtros: false };
    await montar();
    expect(chips()).toEqual([]);
    expect(screen.getByPlaceholderText("Buscar producto o código")).toBeInTheDocument();
    // Se ven todos.
    expect(screen.getByRole("heading", { name: "Servilletas" })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Buscar producto o código"), { target: { value: "coca" } });
    expect(screen.getByRole("heading", { name: "Coca 2 L" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pollo entero" })).not.toBeInTheDocument();
  });
});

describe("sin íconos", () => {
  it("las tarjetas son nombre y precio, y lo del stock sigue a la vista", async () => {
    sesion.pos = { iconos: false };
    await montar();
    const tarjeta = screen.getByRole("heading", { name: "Pollo entero" }).closest("li")!;
    expect(within(tarjeta).queryByText("PE")).not.toBeInTheDocument();
    expect(within(tarjeta).getByText("50 disp.")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Bs 21,00", { exact: false })).toBeInTheDocument();
    // Un elaborado sin nada que decir no deja un renglón vacío arriba del nombre.
    const papas = screen.getByRole("heading", { name: "Papas extra" });
    expect(papas.className).not.toContain("mt-2");
  });

  it("las filas de las columnas, tampoco", async () => {
    sesion.pos = { vista: "COLUMNAS", iconos: false };
    await montar();
    expect(within(fila("Pollo entero")).queryByText("PE")).not.toBeInTheDocument();
  });
});

describe("la vista en columnas", () => {
  beforeEach(() => {
    sesion.pos = { vista: "COLUMNAS" };
  });

  it("un bloque por categoría con su cantidad, los sin categoría en «Otros», al final", async () => {
    await montar();
    expect(columnas()).toEqual([
      ["Pollos", ["Pollo entero", "Cuarto de pollo"]],
      ["Bebidas", ["Coca 2 L", "Fanta 2 L"]],
      ["Extras", ["Papas extra"]],
      ["Otros", ["Servilletas"]],
    ]);
    const pollos = screen.getByRole("region", { name: "Pollos" });
    expect(within(pollos).getByRole("heading", { name: "Pollos" })).toBeInTheDocument();
    expect(within(pollos).getByText("2")).toBeInTheDocument();
    // Ni tarjetas ni arrastre.
    expect(screen.queryByRole("heading", { name: "Pollo entero" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-arrastre-id]")).toBeNull();
  });

  it("cada fila: ícono chico, nombre y precio", async () => {
    await montar();
    const entero = fila("Pollo entero");
    expect(within(entero).getByText("PE")).toBeInTheDocument();
    expect(within(entero).getByText("Pollo entero")).toBeInTheDocument();
    expect(within(entero).getByText("Bs 21,00", { exact: false })).toBeInTheDocument();
  });

  it("dentro de cada categoría, el orden que armó el cajero en las tarjetas", async () => {
    localStorage.setItem("bamardev.pos.orden_prueba_cajero", "2,1");
    await montar();
    expect(columnas()[0]).toEqual(["Pollos", ["Cuarto de pollo", "Pollo entero"]]);
  });

  it("tocar una fila agrega el producto, con el nombre entero en el `title`", async () => {
    await montar();
    expect(botonFila("Pollo entero")).toHaveAttribute("title", "Pollo entero");
    fireEvent.click(botonFila("Pollo entero"));
    expect(carrito.agregar).toHaveBeenCalledWith(ENTERO);
  });

  it("el nombre, hasta tres renglones (como la tarjeta)", async () => {
    await montar();
    expect(within(fila("Pollo entero")).getByText("Pollo entero").className).toContain("line-clamp-3");
  });

  it("en el carrito: resaltada, con la cantidad y el «−» en la misma fila; sumar es tocar la fila", async () => {
    await montar({
      lineas: [
        { producto: ENTERO, cantidad: 2, enMesa: 2, nota: "" },
        { producto: CUARTO, cantidad: 1, enMesa: 1, nota: "" },
      ],
    });
    const entero = fila("Pollo entero");
    expect(entero.className).toContain("bg-primary-50");
    expect(within(entero).getByText("2")).toBeInTheDocument();
    // Sin «+» ni renglón de más: la fila no crece al entrar al carrito.
    expect(within(entero).queryByRole("button", { name: /Uno más/ })).not.toBeInTheDocument();
    expect(entero.children).toHaveLength(1);
    fireEvent.click(botonFila("Pollo entero"));
    expect(carrito.agregar).toHaveBeenCalledWith(ENTERO);
    fireEvent.click(within(entero).getByRole("button", { name: "Uno menos de Pollo entero" }));
    expect(carrito.setCantidad).toHaveBeenCalledWith(1, 1);
    // En la última unidad el «−» es tacho y la saca.
    fireEvent.click(screen.getByRole("button", { name: "Quitar Cuarto de pollo del pedido" }));
    expect(carrito.setCantidad).toHaveBeenCalledWith(2, 0);
    // Lo que no está en el carrito no tiene «−».
    expect(within(fila("Coca 2 L")).queryByRole("button", { name: /Uno menos|Quitar/ })).not.toBeInTheDocument();
    expect(fila("Coca 2 L").children).toHaveLength(1);
  });

  it("al tope del stock la fila no suma, dice por qué y cuánto hay, sin apagarse entera", async () => {
    // Coca 2 L tiene 2 y están las 2 en el carrito. El mínimo (5) no importa acá.
    await montar({
      lineas: [
        { producto: COCA, cantidad: 2, enMesa: 2, nota: "" },
        { producto: ENTERO, cantidad: 50, enMesa: 50, nota: "" },
      ],
    });
    expect(botonFila("Coca 2 L")).toBeDisabled();
    expect(botonFila("Coca 2 L")).toHaveAttribute("title", "No hay más disponibles");
    expect(fila("Coca 2 L").className).not.toContain("opacity-50");
    // Con stock de sobra (50, mínimo 5), el número sale sólo porque llegó al tope.
    expect(within(fila("Pollo entero")).getByText("50 disp.")).toBeInTheDocument();
    expect(botonFila("Pollo entero")).toBeDisabled();
    // El «−» sigue andando.
    fireEvent.click(within(fila("Coca 2 L")).getByRole("button", { name: "Uno menos de Coca 2 L" }));
    expect(carrito.setCantidad).toHaveBeenCalledWith(3, 1);
  });

  it("agotado: apagada y lo dice; con poco stock dice cuánto queda", async () => {
    await montar();
    expect(botonFila("Fanta 2 L")).toBeDisabled();
    expect(within(fila("Fanta 2 L")).getByText("Agotado")).toBeInTheDocument();
    expect(within(fila("Coca 2 L")).getByText("2 disp.")).toBeInTheDocument();
    // Con stock de sobra no se dice nada (en la lista sería ruido).
    expect(within(fila("Pollo entero")).queryByText(/disp\./)).not.toBeInTheDocument();
    fireEvent.click(botonFila("Fanta 2 L"));
    expect(carrito.agregar).not.toHaveBeenCalled();
  });

  it("pausado: en gris, lo dice, y pregunta antes de agregarlo", async () => {
    vi.mocked(api.productosPausados).mockResolvedValue({
      sucursal: { id: 3, nombre: "Centro" },
      pausados: [{ productoId: 2, nombre: "Cuarto de pollo", desde: "2026-11-16T12:00:00Z", por: "ana" }],
    });
    await montar();
    const cuarto = fila("Cuarto de pollo");
    expect(cuarto.className).toContain("grayscale");
    expect(within(cuarto).getByText("Pausado")).toBeInTheDocument();
    fireEvent.click(botonFila("Cuarto de pollo"));
    expect(carrito.agregar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, venderlo" }));
    expect(carrito.agregar).toHaveBeenCalledWith(CUARTO);
  });

  it("con el permiso de pausar, cada fila tiene su «⋯»", async () => {
    sesion.permisos = ["productos.pausar"];
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Pausar Pollo entero" }));
    expect(await screen.findByRole("dialog", { name: "Pausar producto" })).toBeInTheDocument();
  });

  it("sin el permiso, no", async () => {
    await montar();
    expect(screen.queryByRole("button", { name: /^Pausar / })).not.toBeInTheDocument();
  });

  it("una categoría elegida: sólo su bloque, con las filas repartidas en el ancho", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Bebidas" }));
    expect(columnas()).toEqual([["Bebidas", ["Coca 2 L", "Fanta 2 L"]]]);
    const lista = within(screen.getByRole("region", { name: "Bebidas" })).getByRole("list");
    expect(lista.className).toContain("columns-");
  });

  it("buscando: sólo lo que coincide, en su categoría", async () => {
    await montar();
    fireEvent.change(screen.getByPlaceholderText("Buscar producto o código"), { target: { value: "pollo" } });
    expect(columnas()).toEqual([["Pollos", ["Pollo entero", "Cuarto de pollo"]]]);
    // Una sola categoría: usa el ancho.
    expect(within(screen.getByRole("region", { name: "Pollos" })).getByRole("list").className).toContain("columns-");
    fireEvent.change(screen.getByPlaceholderText("Buscar producto o código"), { target: { value: "nada así" } });
    expect(screen.getByText("Sin productos")).toBeInTheDocument();
  });

  it("una búsqueda que cae en varias categorías: una columna por categoría, sin repartir filas (QA 16-nov)", async () => {
    await montar();
    fireEvent.change(screen.getByPlaceholderText("Buscar producto o código"), { target: { value: "2 l" } });
    expect(columnas().map(([n]) => n)).toEqual(["Bebidas"]);
    fireEvent.change(screen.getByPlaceholderText("Buscar producto o código"), { target: { value: "e" } });
    expect(columnas().length).toBeGreaterThan(1);
    for (const lista of screen.getAllByRole("list")) expect(lista.className).not.toContain("columns-");
  });

  it("con todo a la vista, las filas no se reparten: una categoría no se parte entre columnas", async () => {
    await montar();
    const lista = within(screen.getByRole("region", { name: "Pollos" })).getByRole("list");
    expect(lista.className).not.toContain("columns-");
  });

  it("sin filtros, en columnas: todas las categorías, sin chips", async () => {
    sesion.pos = { vista: "COLUMNAS", filtros: false };
    await montar();
    expect(chips()).toEqual([]);
    expect(columnas().map(([n]) => n)).toEqual(["Pollos", "Bebidas", "Extras", "Otros"]);
  });
});

describe("dónde las columnas no se usan", () => {
  it("en el celular (menos de 768 px): las tarjetas de siempre, con su arrastre", async () => {
    sesion.pos = { vista: "COLUMNAS" };
    sesion.ancho = 390;
    await montar();
    expect(screen.queryAllByRole("region")).toEqual([]);
    const tarjeta = screen.getByRole("heading", { name: "Pollo entero" }).closest("li")!;
    expect(tarjeta).toHaveAttribute("data-arrastre-id", "1");
  });

  it("de 768 px para arriba, sí", async () => {
    sesion.pos = { vista: "COLUMNAS" };
    sesion.ancho = 768;
    await montar();
    expect(columnas().length).toBeGreaterThan(0);
  });

  it("modificando una venta ya cobrada: el POS de siempre, con sus íconos y sus chips", async () => {
    sesion.pos = { vista: "COLUMNAS", iconos: false, filtros: false, ordenCategorias: [3] };
    await montar({
      modificacion: { titulo: "Cambio de V-000012", resumen: null, etiqueta: "Continuar", vacio: "Sin nada" },
    });
    expect(screen.queryAllByRole("region")).toEqual([]);
    expect(chips()).toEqual(["Todos", "Pollos", "Bebidas", "Extras"]);
    const tarjeta = screen.getByRole("heading", { name: "Pollo entero" }).closest("li")!;
    expect(within(tarjeta).getByText("PE")).toBeInTheDocument();
  });

  it("la farmacia: su catálogo de siempre, diga lo que diga", async () => {
    sesion.rubro = "FARMACIA";
    sesion.pos = { vista: "COLUMNAS", filtros: false };
    await montar();
    expect(screen.getByText("catálogo de la farmacia")).toBeInTheDocument();
    expect(screen.queryAllByRole("region")).toEqual([]);
  });
});
