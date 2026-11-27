import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogoAgregados } from "../../lib/agregados/tipos";
import type { Producto } from "../../types";

/**
 * El POS con platos con receta (CONTRATO-recetas-plato §4.2): el cuarto de
 * pollo dice «Elegí la presa» y tocarlo abre su hoja; el plato sin presa que
 * elegir entra directo y se cambia con «Cambiar»; lo demás, como siempre. Con
 * el ajuste apagado el POS no cambia en nada: ni un rótulo, ni una clave de
 * línea, ni un campo del pedido.
 */

const sesion = vi.hoisted(() => ({
  negocio: {} as Record<string, unknown>,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: sesion.negocio,
    usuario: { username: "caja", permisos: [] },
    rubro: "RESTAURANTE",
    incluye: () => false,
    puede: () => true,
  }),
}));

vi.mock("../../lib/api", () => ({
  api: { productosPausados: vi.fn(async () => ({ sucursal: { id: 3, nombre: "Local" }, pausados: [] })) },
}));

import PantallaVenta from "./PantallaVenta";
import { claveDeLinea, useCarrito, type Carrito } from "./useCarrito";

const guarnicion = [
  { insumoId: 7, nombre: "Arroz", puro: true },
  { insumoId: 8, nombre: "Papa", puro: true },
  { insumoId: 9, nombre: "Fideo", puro: true },
];
const base = { tipoProducto: "SERVICIO", stockTotal: 0, stockMinimo: 0, habilitado: true, componentes: [], icono: null, categoria: null };
const cuarto = {
  ...base,
  id: 12,
  nombre: "Broaster cuarto",
  precio: 28,
  conReceta: true,
  receta: { presas: 2, partes: "POLLO_8", guarnicion, alcanza: 120 },
} as unknown as Producto;
const milanesa = {
  ...base,
  id: 13,
  nombre: "Milanesa",
  precio: 30,
  conReceta: true,
  receta: { presas: 0, partes: null, guarnicion: guarnicion.slice(0, 2), alcanza: 15 },
} as unknown as Producto;
const gaseosa = { ...base, id: 2, nombre: "Gaseosa", precio: 8, tipoProducto: "ALMACENABLE", stockTotal: 10 } as unknown as Producto;
const catalogo = [cuarto, milanesa, gaseosa];

function conRecetas(recetas: { activas: boolean; elegirPresa: boolean; puroDoble?: boolean } | null) {
  sesion.negocio = {
    alias: "demo",
    tipoNegocio: "RESTAURANTE",
    ...(recetas ? { recetas: { puroDoble: true, ...recetas } } : {}),
  };
}

let carrito: Carrito;

/** El carrito de verdad (no un mock): lo que se ve es lo que se vendería. */
function Pantalla({ toppings, modificando }: { toppings?: CatalogoAgregados; modificando?: boolean }) {
  const c = useCarrito("LOCAL", catalogo, true, undefined, toppings ?? null);
  carrito = c;
  return (
    <PantallaVenta
      productos={catalogo}
      categorias={[]}
      carrito={c}
      onCobrar={() => {}}
      sucursalId={3}
      catalogoAgregados={toppings ?? null}
      modificacion={
        modificando ? { titulo: "Cambio de V-000001", resumen: null, etiqueta: "Continuar", vacio: "Sin nada" } : undefined
      }
    />
  );
}

async function montar(props: { toppings?: CatalogoAgregados; modificando?: boolean } = {}) {
  render(
    <MemoryRouter>
      <Pantalla {...props} />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  conRecetas({ activas: true, elegirPresa: true });
});

const tarjeta = (nombre: string) => screen.getByRole("heading", { name: nombre }).closest("li")!;
const tocar = (nombre: string) => fireEvent.click(within(tarjeta(nombre)).getAllByRole("button")[0]);
const filaDelCarrito = (nombre: string) =>
  screen.getAllByRole("listitem").find((li) => within(li).queryByText(/c\/u/) && within(li).queryByText(nombre))!;

describe("la grilla con platos con receta", () => {
  it("el cuarto dice «Elegí la presa»; el plato sin presa que elegir, no; y el que queda poco, «N disp.»", async () => {
    await montar();
    expect(within(tarjeta("Broaster cuarto")).getByText("Elegí la presa")).toBeInTheDocument();
    expect(within(tarjeta("Broaster cuarto")).queryByText(/disp\./)).not.toBeInTheDocument();
    expect(within(tarjeta("Milanesa")).queryByText("Elegí la presa")).not.toBeInTheDocument();
    expect(within(tarjeta("Milanesa")).getByText("15 disp.")).toBeInTheDocument();
    expect(within(tarjeta("Gaseosa")).queryByText("Elegí la presa")).not.toBeInTheDocument();
    expect(screen.queryByText(/Agotado/)).not.toBeInTheDocument();
  });

  it("tocar el cuarto abre la hoja; tocar la presa lo agrega con su armado y la cierra", async () => {
    await montar();
    tocar("Broaster cuarto");
    const hoja = screen.getByRole("dialog", { name: "Broaster cuarto" });
    fireEvent.click(within(hoja).getByRole("button", { name: "Pierna (pierna y contra)" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(carrito.lineas).toHaveLength(1);
    expect(carrito.lineas[0].armado).toEqual({ piezas: { pierna: 1, contra: 1 } });
    expect(within(filaDelCarrito("Broaster cuarto")).getByText("+ Pierna y contra")).toBeInTheDocument();
    expect(carrito.aDetalles()).toEqual([
      { productoId: 12, cantidad: 1, precio: 28, consumo: "MESA", armado: { piezas: { pierna: 1, contra: 1 } } },
    ]);
  });

  it("dos presas distintas son dos líneas; la misma otra vez suma a la suya", async () => {
    await montar();
    for (const presa of ["Ala (pecho y ala)", "Pierna (pierna y contra)", "Ala (pecho y ala)"]) {
      tocar("Broaster cuarto");
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: presa }));
    }
    expect(carrito.lineas.map((l) => [l.armado?.piezas, l.cantidad])).toEqual([
      [{ ala: 1, pecho: 1 }, 2],
      [{ pierna: 1, contra: 1 }, 1],
    ]);
    expect(carrito.total).toBe(84);
    // La tarjeta suma las dos líneas.
    expect(within(tarjeta("Broaster cuarto")).getByText("3")).toBeInTheDocument();
  });

  it("el plato sin presa que elegir entra directo; «Cambiar» abre su hoja y «+ Sin papa» queda en la línea", async () => {
    await montar();
    tocar("Milanesa");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(carrito.lineas[0].armado).toBeUndefined();
    fireEvent.click(within(filaDelCarrito("Milanesa")).getByRole("button", { name: "Cambiar Milanesa" }));
    const hoja = screen.getByRole("dialog", { name: "Milanesa" });
    expect(within(hoja).getByText(/marcá lo que cambió/)).toBeInTheDocument();
    expect(within(hoja).queryByText("Presa")).not.toBeInTheDocument();
    fireEvent.click(within(hoja).getByRole("button", { name: "Papa" }));
    fireEvent.click(within(hoja).getByRole("button", { name: "Guardar cambios" }));
    expect(carrito.lineas).toHaveLength(1);
    expect(carrito.lineas[0].armado).toEqual({ sin: [8] });
    expect(within(filaDelCarrito("Milanesa")).getByText("+ Sin papa")).toBeInTheDocument();
  });

  it("tocar lo elegido en la línea reabre la hoja para cambiar la presa", async () => {
    await montar();
    tocar("Broaster cuarto");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Pierna (pierna y contra)" }));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar la presa o la guarnición de Broaster cuarto" }));
    const hoja = screen.getByRole("dialog", { name: "Broaster cuarto" });
    fireEvent.click(within(hoja).getByRole("button", { name: "Ala (pecho y ala)" }));
    // Al editar, la presa sólo se marca.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(within(hoja).getByRole("button", { name: "Guardar cambios" }));
    expect(carrito.lineas).toHaveLength(1);
    expect(carrito.lineas[0].armado).toEqual({ piezas: { ala: 1, pecho: 1 } });
  });

  it("sin preguntar la presa (ajuste) el cuarto entra directo, pero se puede cambiar la guarnición", async () => {
    conRecetas({ activas: true, elegirPresa: false });
    await montar();
    expect(screen.queryByText("Elegí la presa")).not.toBeInTheDocument();
    tocar("Broaster cuarto");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(carrito.lineas).toHaveLength(1);
    expect(within(filaDelCarrito("Broaster cuarto")).getByRole("button", { name: "Cambiar Broaster cuarto" })).toBeInTheDocument();
  });

  it("un plato con toppings abre la hoja de toppings de siempre, no la de la presa", async () => {
    const toppings: CatalogoAgregados = {
      activo: true,
      grupos: [
        {
          id: 70,
          nombre: "Salsas",
          incluidos: 1,
          precioExtra: null,
          maximo: null,
          opciones: [{ productoId: 2, nombre: "Gaseosa", precio: 8, icono: null }],
        },
      ],
      productos: [{ productoId: 12, grupos: [{ grupoId: 70, incluidos: 1 }] }],
    };
    await montar({ toppings });
    expect(within(tarjeta("Broaster cuarto")).getByText("Incluye 1 salsa")).toBeInTheDocument();
    tocar("Broaster cuarto");
    expect(screen.getByRole("dialog", { name: /Toppings de Broaster cuarto/ })).toBeInTheDocument();
  });

  it("modificando una venta ya cobrada, el plato entra directo, como siempre", async () => {
    await montar({ modificando: true });
    expect(screen.queryByText("Elegí la presa")).not.toBeInTheDocument();
    tocar("Broaster cuarto");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(carrito.lineas[0].armado).toBeUndefined();
    expect(screen.queryByRole("button", { name: /^Cambiar/ })).not.toBeInTheDocument();
  });
});

describe("con el ajuste apagado el POS es el de siempre", () => {
  for (const [caso, recetas] of [
    ["apagado", { activas: false, elegirPresa: true }],
    ["un backend que no manda el ajuste", null],
  ] as const) {
    it(`${caso}: sin rótulos, tocar suma directo, la clave es el id y el pedido no lleva armado`, async () => {
      conRecetas(recetas);
      await montar();
      expect(screen.queryByText("Elegí la presa")).not.toBeInTheDocument();
      // La gaseosa dice su stock como siempre; los platos, nada.
      expect(within(tarjeta("Milanesa")).queryByText(/disp\./)).not.toBeInTheDocument();
      expect(within(tarjeta("Gaseosa")).getByText("10 disp.")).toBeInTheDocument();
      tocar("Broaster cuarto");
      tocar("Milanesa");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(carrito.lineas.map((l) => claveDeLinea(l))).toEqual([12, 13]);
      expect(screen.queryByRole("button", { name: /^Cambiar/ })).not.toBeInTheDocument();
      // Ni siquiera un `armado: undefined`: el pedido es byte por byte el de antes.
      expect(carrito.aDetalles()).toStrictEqual([
        { productoId: 12, cantidad: 1, precio: 28, consumo: "MESA" },
        { productoId: 13, cantidad: 1, precio: 30, consumo: "MESA" },
      ]);
      expect(sessionStorage.getItem("bamar.carrito.LOCAL")).not.toContain("armado");
    });
  }
});
