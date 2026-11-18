import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Categoria, Producto } from "../../types";

/**
 * El conteo por categoría en la pantalla de venta (vasos por tamaño, 18-nov).
 * El dueño contó 100 vasos L y el POS le dejó vender 101: ahora cada producto
 * de un tamaño contado dice cuántos vasos quedan, el número baja al cargar
 * CUALQUIER producto de ese tamaño, sin vasos sale «Agotado» y con el carrito
 * lleno el «+» se apaga. Sin conteo, sin contar o en una categoría que no se
 * cuenta, la pantalla es la de siempre.
 */

const sesion = vi.hoisted(() => ({
  pos: undefined as Record<string, unknown> | undefined,
  /** El ancho de la pantalla, para las media queries (las columnas son para pantalla grande). */
  ancho: 1366,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { alias: "prueba", tipoNegocio: "RESTAURANTE", pos: sesion.pos },
    usuario: { username: "cajero", permisos: [] },
    rubro: "RESTAURANTE",
    incluye: () => false,
    puede: () => true,
  }),
}));

vi.mock("../../lib/api", () => ({
  api: { productosPausados: vi.fn(), pausarProducto: vi.fn(), reactivarProducto: vi.fn() },
}));

import { api } from "../../lib/api";
import PantallaVenta, { type ConteoEnLaVenta, type ModoModificacion } from "./PantallaVenta";
import type { Carrito, LineaCarrito } from "./useCarrito";

const C: Categoria = { id: 1, nombre: "C", activo: true };
const L: Categoria = { id: 3, nombre: "L", activo: true };
const BEBIDAS: Categoria = { id: 5, nombre: "Bebidas", activo: true };

const producto = (id: number, nombre: string, categoria: Categoria, over: Partial<Producto> = {}): Producto =>
  ({
    id,
    nombre,
    precio: 30 + id,
    // El arroz con leche se prepara al vender: no lleva stock, sólo gasta vaso.
    tipoProducto: "SERVICIO",
    stockTotal: 0,
    stockMinimo: 0,
    habilitado: true,
    icono: null,
    componentes: [],
    categoria: { id: categoria.id, nombre: categoria.nombre },
    ...over,
  }) as unknown as Producto;

const DULCE_C = producto(1, "Dulce de leche C", C);
const NUTELLA_C = producto(2, "Nutella C", C);
const DULCE_L = producto(3, "Dulce de leche L", L);
const NUTELLA_L = producto(4, "Nutella L", L);
const COCA = producto(5, "Coca 2 L", BEBIDAS, { tipoProducto: "ALMACENABLE", stockTotal: 50, stockMinimo: 5 });
const TODOS = [DULCE_C, NUTELLA_C, DULCE_L, NUTELLA_L, COCA];

/** Cuántos vasos C y L quedan en el local (null = nunca se contó ahí). */
function conteo(c: number | null, l: number | null): ConteoEnLaVenta {
  return {
    nombre: "Vasos",
    saldos: new Map([
      [C.id, c],
      [L.id, l],
    ]),
  };
}

const linea = (p: Producto, cantidad: number): LineaCarrito => ({ producto: p, cantidad, enMesa: cantidad, nota: "" });

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

async function montar(opc: { conteo?: ConteoEnLaVenta; lineas?: LineaCarrito[]; modificacion?: ModoModificacion } = {}) {
  carrito = carritoCon(opc.lineas);
  render(
    <MemoryRouter>
      <PantallaVenta
        productos={TODOS}
        categorias={[C, L, BEBIDAS]}
        carrito={carrito}
        onCobrar={() => {}}
        sucursalId={3}
        conteo={opc.conteo}
        modificacion={opc.modificacion}
      />
    </MemoryRouter>,
  );
  await act(async () => {});
}

/** La tarjeta de un producto en la grilla. */
const tarjeta = (nombre: string) => screen.getByRole("heading", { name: nombre }).closest("li")!;
/** El cuerpo de la tarjeta: tocarlo suma. */
const cuerpo = (nombre: string) => screen.getByRole("heading", { name: nombre }).closest("button")!;
/** Los rótulos del conteo («Quedan 45 vasos C») dentro de algo. */
const rotulos = (dentro: HTMLElement = document.body) => within(dentro).queryAllByLabelText(/^Quedan /);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  sesion.pos = undefined;
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

describe("las tarjetas con el conteo por categoría", () => {
  it("cada producto de un tamaño contado dice cuántos vasos quedan, en el renglón del precio; lo no contado, nada", async () => {
    await montar({ conteo: conteo(45, 30) });
    expect(within(tarjeta("Dulce de leche C")).getByLabelText("Quedan 45 vasos C")).toHaveTextContent("45 u.");
    expect(within(tarjeta("Nutella C")).getByLabelText("Quedan 45 vasos C")).toHaveTextContent("45 u.");
    expect(within(tarjeta("Nutella L")).getByLabelText("Quedan 30 vasos L")).toHaveTextContent("30 u.");
    expect(rotulos(tarjeta("Coca 2 L"))).toHaveLength(0);
    // Al lado del precio, no arriba (la fila del ícono, el stock y el «⋯» no se toca).
    const rotulo = within(tarjeta("Nutella C")).getByLabelText("Quedan 45 vasos C");
    expect(rotulo.parentElement).toContainElement(within(tarjeta("Nutella C")).getByText(/32,00/));
    expect(rotulo).toHaveAttribute("title", "Quedan 45 vasos C");
  });

  it("el número baja al cargar CUALQUIER producto de ese tamaño, en todas sus tarjetas", async () => {
    await montar({ conteo: conteo(45, 30), lineas: [linea(NUTELLA_C, 3)] });
    expect(within(tarjeta("Dulce de leche C")).getByLabelText("Quedan 42 vasos C")).toHaveTextContent("42 u.");
    expect(within(tarjeta("Nutella C")).getByLabelText("Quedan 42 vasos C")).toBeInTheDocument();
    // Los L no se mueven: es otro vaso.
    expect(within(tarjeta("Nutella L")).getByLabelText("Quedan 30 vasos L")).toBeInTheDocument();
  });

  it("con 10 o menos sale en tono de aviso, para pedir que repongan a tiempo", async () => {
    await montar({ conteo: conteo(45, 10) });
    expect(within(tarjeta("Nutella L")).getByLabelText("Quedan 10 vasos L").className).toContain("bg-warning-bg");
    expect(within(tarjeta("Nutella C")).getByLabelText("Quedan 45 vasos C").className).toContain("bg-primary-50");
  });

  it("sin vasos en el local (0 o negativo): «Agotado» como el stock, apagada, sin rótulo y con el aviso de reponer", async () => {
    await montar({ conteo: conteo(-2, 0) });
    for (const nombre of ["Nutella L", "Dulce de leche C"]) {
      const t = tarjeta(nombre);
      expect(within(t).getByText("Agotado")).toBeInTheDocument();
      expect(cuerpo(nombre)).toBeDisabled();
      expect(t.querySelector(".opacity-50")).not.toBeNull();
      expect(rotulos(t)).toHaveLength(0);
    }
    expect(cuerpo("Nutella L")).toHaveAttribute("title", "Vasos L: no quedan. Avisale al encargado para que reponga.");
    // Lo que no se cuenta sigue vendiéndose.
    expect(cuerpo("Coca 2 L")).toBeEnabled();
  });

  it("el carrito ya lleva todo lo que queda: «0 u.», el «+» apagado y ninguna tarjeta de ese tamaño suma", async () => {
    await montar({ conteo: conteo(45, 3), lineas: [linea(NUTELLA_L, 3)] });
    expect(within(tarjeta("Nutella L")).getByLabelText("Quedan 0 vasos L")).toHaveTextContent("0 u.");
    expect(within(tarjeta("Dulce de leche L")).getByLabelText("Quedan 0 vasos L").className).toContain("bg-warning-bg");
    const mas = within(tarjeta("Nutella L")).getByRole("button", { name: "Uno más" });
    expect(mas).toBeDisabled();
    expect(mas).toHaveAttribute("title", "No hay más disponibles");
    // No es un agotado: sigue a la vista, pero tocarla no suma y dice por qué.
    expect(within(tarjeta("Dulce de leche L")).queryByText("Agotado")).not.toBeInTheDocument();
    expect(cuerpo("Dulce de leche L")).toHaveAttribute("title", "Vasos L: sólo quedan 3.");
    fireEvent.click(cuerpo("Nutella L"));
    fireEvent.click(cuerpo("Dulce de leche L"));
    expect(carrito.agregar).not.toHaveBeenCalled();
    // El «+» de la línea del carrito, igual.
    expect(screen.getByRole("button", { name: "Agregar una unidad" })).toBeDisabled();
    // Un C sí suma: es otro vaso.
    fireEvent.click(cuerpo("Nutella C"));
    expect(carrito.agregar).toHaveBeenCalledWith(NUTELLA_C);
  });

  it("con lugar, el «+» de la línea del carrito sigue prendido", async () => {
    await montar({ conteo: conteo(45, 4), lineas: [linea(NUTELLA_L, 3)] });
    expect(screen.getByRole("button", { name: "Agregar una unidad" })).toBeEnabled();
    expect(within(tarjeta("Nutella L")).getByRole("button", { name: "Uno más" })).toBeEnabled();
  });

  it("sin conteo (lo de fábrica): la tarjeta de siempre y todo suma", async () => {
    await montar({ lineas: [linea(NUTELLA_L, 3)] });
    expect(rotulos()).toHaveLength(0);
    expect(screen.queryByText("Agotado")).not.toBeInTheDocument();
    fireEvent.click(cuerpo("Nutella L"));
    expect(carrito.agregar).toHaveBeenCalledWith(NUTELLA_L);
    expect(screen.getByRole("button", { name: "Agregar una unidad" })).toBeEnabled();
  });

  it("nunca contado en este local (null): nada nuevo en pantalla", async () => {
    await montar({ conteo: conteo(null, null) });
    expect(rotulos()).toHaveLength(0);
    fireEvent.click(cuerpo("Nutella C"));
    expect(carrito.agregar).toHaveBeenCalledWith(NUTELLA_C);
  });

  it("modificando una venta ya cobrada no hay tope ni rótulo, aunque llegue el conteo", async () => {
    const modificacion: ModoModificacion = {
      titulo: "Cambio de V-000012",
      resumen: null,
      etiqueta: "Guardar el cambio",
      vacio: "Sin productos",
    };
    await montar({ conteo: conteo(0, 0), modificacion });
    expect(rotulos()).toHaveLength(0);
    expect(cuerpo("Nutella L")).toBeEnabled();
  });
});

describe("la vista en columnas con el conteo", () => {
  beforeEach(() => {
    sesion.pos = { vista: "COLUMNAS" };
  });

  const bloque = (nombre: string) => screen.getByRole("region", { name: nombre });
  const cabecera = (nombre: string) => bloque(nombre).querySelector("header")!;
  /** El botón que es toda la fila: tocarlo suma. */
  const botonFila = (nombre: string) => screen.getByRole("button", { name: nombre });
  const fila = (nombre: string) => botonFila(nombre).closest("li")!;

  it("el número va UNA vez, en la cabecera del tamaño contado, junto a cuántos productos tiene", async () => {
    await montar({ conteo: conteo(45, 30) });
    expect(within(cabecera("C")).getByLabelText("Quedan 45 vasos C")).toHaveTextContent("45 u.");
    expect(within(cabecera("C")).getByText("2")).toBeInTheDocument();
    // Ni en las filas (quedan muchos) ni en lo que no se cuenta.
    expect(rotulos(bloque("C"))).toHaveLength(1);
    expect(rotulos(bloque("Bebidas"))).toHaveLength(0);
  });

  it("la cabecera baja con el carrito y avisa cuando quedan pocos, sin sumarle renglones a las filas", async () => {
    await montar({ conteo: conteo(45, 30), lineas: [linea(NUTELLA_C, 40)] });
    const enCabecera = within(cabecera("C")).getByLabelText("Quedan 5 vasos C");
    expect(enCabecera.className).toContain("bg-warning-bg");
    // El aviso de la fila mira lo que queda en el LOCAL (45): cargar no le
    // agrega un renglón a las filas en medio del pedido (son de alto fijo).
    expect(rotulos(fila("Dulce de leche C"))).toHaveLength(0);
  });

  it("con pocos en el local la fila avisa, como el stock; sin vasos, «Agotado» y deshabilitada", async () => {
    await montar({ conteo: conteo(0, 4), lineas: [linea(NUTELLA_L, 1)] });
    expect(within(fila("Dulce de leche L")).getByLabelText("Quedan 3 vasos L")).toHaveTextContent("3 u.");
    expect(within(fila("Nutella C")).getByText("Agotado")).toBeInTheDocument();
    expect(botonFila("Nutella C")).toBeDisabled();
    expect(botonFila("Nutella C")).toHaveAttribute("title", "Vasos C: no quedan. Avisale al encargado para que reponga.");
  });

  it("con el carrito lleno la fila no suma y dice por qué", async () => {
    await montar({ conteo: conteo(45, 3), lineas: [linea(NUTELLA_L, 3)] });
    expect(botonFila("Dulce de leche L")).toBeDisabled();
    expect(botonFila("Dulce de leche L")).toHaveAttribute("title", "Vasos L: sólo quedan 3.");
    expect(within(fila("Dulce de leche L")).getByLabelText("Quedan 0 vasos L")).toBeInTheDocument();
    expect(botonFila("Nutella C")).toBeEnabled();
  });

  it("sin conteo, la lista de siempre", async () => {
    await montar();
    expect(rotulos()).toHaveLength(0);
    expect(cabecera("C").textContent).toBe("C2");
  });
});
