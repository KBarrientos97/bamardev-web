import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtMoney, fmtNum } from "../../lib/format";
import type { Almacen, ArticuloMovimiento, Movimiento, SesionRecetas } from "../../types";

/**
 * Movimientos con las recetas del plato prendidas (27-nov).
 *
 * La entrada de un insumo que se compra por bulto se carga como el papel de la
 * compra: «2 quintales, Bs 580». Viaja en la unidad del insumo (92 kg) con lo
 * que se pagó, y el bulto queda escrito en el detalle («2 Quintal · Bs
 * 580,00»). Lo demás del formulario —productos, salidas, insumos sin bulto— no
 * cambia. Apagadas, nada de esto aparece.
 */

// El formulario entero y después el detalle: con otras suites en paralelo,
// los 5 s de fábrica se quedaban cortos.
vi.setConfig({ testTimeout: 30_000 });

const sesion = vi.hoisted(() => ({
  recetas: { activas: true, elegirPresa: false, puroDoble: true } as SesionRecetas | undefined,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    // Sin el doble control: guardar aprueba de una.
    incluye: (c: string) => c !== "aprobacion_inventario",
    usuario: { sucursalId: 1, sucursal: "Sede propia", permisos: ["inventario.mover"] },
    rubro: "RESTAURANTE",
    negocio: { id: 1, nombre: "Cocina de prueba", tipoNegocio: "RESTAURANTE", features: [], recetas: sesion.recetas },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getMovimientos: vi.fn(),
    getMovimiento: vi.fn(),
    getSucursales: vi.fn(async () => []),
    getArticulosMovimiento: vi.fn(),
    crearMovimiento: vi.fn(async () => ({ id: 900 })),
    aprobarMovimiento: vi.fn(async () => ({})),
    agregarDetalleMovimiento: vi.fn(async () => ({})),
    eliminarDetalleMovimiento: vi.fn(async () => ({})),
  },
}));

import { api } from "../../lib/api";
import Movimientos from "./Movimientos";

const PRINCIPAL: Almacen = {
  id: 1,
  nombre: "Principal",
  grupo: null,
  activo: true,
  tipo: "SUCURSAL",
  esPrincipal: true,
  direccion: null,
  telefono: null,
};

function articulo(id: number, nombre: string, extra: Partial<ArticuloMovimiento> = {}): ArticuloMovimiento {
  return { id, nombre, esInsumo: false, costo: 10, precio: 15, stock: 20, unidad: "Unidad", ...extra };
}

const RINDE_ARROZ = { rindeCantidad: 1, rindePorciones: 12, porcionNombre: "porción" };
const ARROZ = articulo(1, "Arroz", {
  esInsumo: true,
  unidad: "Kilogramo",
  costo: 6,
  stock: 10,
  compraUnidad: "Quintal",
  compraContenido: 46,
  ...RINDE_ARROZ,
});
/** Se compra por kilo: el bulto es la unidad misma. */
const SAL = articulo(2, "Sal", {
  esInsumo: true,
  unidad: "Kilogramo",
  costo: 3,
  compraUnidad: "Kilo",
  compraContenido: 1,
  rindeCantidad: 1,
  rindePorciones: 200,
  porcionNombre: "porción",
});
/** Un insumo de antes: no dice cómo se compra. */
const ACEITE = articulo(3, "Aceite", { esInsumo: true, unidad: "Litro", costo: 16 });
const COCA = articulo(4, "Coca Cola 2L", { costo: 9 });

function movimiento(id: number, extra: Partial<Movimiento> = {}): Movimiento {
  return {
    id,
    tipo: "ENTRADA",
    comprobante: `MOV-${id}`,
    descripcion: null,
    estado: "APROBADO",
    fecha: new Date().toISOString(),
    fechaAprobacion: null,
    origen: "INSUMO",
    almacen: { id: PRINCIPAL.id, nombre: PRINCIPAL.nombre },
    items: 1,
    monto: 100,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.recetas = { activas: true, elegirPresa: false, puroDoble: true };
  vi.mocked(api.getMovimientos).mockResolvedValue([movimiento(1)]);
  vi.mocked(api.getSucursales).mockResolvedValue([PRINCIPAL]);
  vi.mocked(api.getArticulosMovimiento).mockResolvedValue([ARROZ, SAL, ACEITE, COCA]);
});

function montar() {
  return render(
    <MemoryRouter initialEntries={["/inventario/movimientos"]}>
      <Movimientos />
    </MemoryRouter>,
  );
}

/** Abre «Nuevo» y espera a que lleguen los artículos del almacén. */
async function abrirNuevo() {
  montar();
  await screen.findByText("MOV-1");
  fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
  const form = screen.getByRole("dialog", { name: "Nuevo movimiento" });
  const buscador = within(form).getByRole("combobox", { name: "Buscar artículo" });
  await waitFor(() => expect(buscador).not.toBeDisabled());
  return { form, buscador };
}

function agregar(buscador: HTMLElement, texto: string, nombre: string) {
  fireEvent.change(buscador, { target: { value: texto } });
  fireEvent.mouseDown(within(screen.getByRole("listbox")).getByText(nombre));
}

/** El renglón de un artículo en el formulario. */
function linea(form: HTMLElement, nombre: string) {
  return within(form).getByText(nombre, { selector: "span" }).closest("li")!;
}

describe("la entrada de un insumo por bulto", () => {
  it("cantidad, en qué, total pagado y cada kilo; abajo, lo que entra y para cuántas porciones", async () => {
    const { form, buscador } = await abrirNuevo();
    agregar(buscador, "arroz", "Arroz");
    const l = linea(form, "Arroz");

    const unidad = within(l).getByRole("combobox", { name: "Unidad" });
    expect(unidad).toHaveValue("bulto");
    expect(within(unidad).getByRole("option", { name: "Quintal" })).toBeInTheDocument();
    expect(within(unidad).getByRole("option", { name: "Kilogramo" })).toBeInTheDocument();
    // Lo que se pagó esta vez lo dice el papel: arranca vacío.
    const total = within(l).getByRole("textbox", { name: "Total pagado" });
    expect(total).toHaveValue("");
    expect(within(l).queryByRole("textbox", { name: "Costo" })).not.toBeInTheDocument();
    expect(within(l).getByText("Cada kilo")).toBeInTheDocument();
    expect(within(l).getByText("Entran 46 kg, unas 552 porciones.")).toBeInTheDocument();

    fireEvent.change(within(l).getByRole("textbox", { name: "Cantidad" }), { target: { value: "2" } });
    fireEvent.change(total, { target: { value: "580" } });
    expect(within(l).getByText(fmtMoney(6.3))).toBeInTheDocument();
    expect(
      within(l).getByText(`Entran 92 kg, unas ${fmtNum(1104)} porciones. Cada porción te sale ${fmtMoney(0.525)}.`),
    ).toBeInTheDocument();
    // El total del movimiento es lo que se pagó, no 92 × 6,30.
    expect(within(form).getByText(fmtMoney(580))).toBeInTheDocument();

    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.aprobarMovimiento).toHaveBeenCalledWith(900));
    expect(vi.mocked(api.crearMovimiento).mock.calls[0][0].detalles).toEqual([
      { productoId: 1, cantidad: 92, costo: 6.3, totalPagado: 580, presentacion: "Quintal", cantidadPresentacion: 2 },
    ]);
  });

  it("en la unidad del insumo (kilos) no lleva el bulto", async () => {
    const { form, buscador } = await abrirNuevo();
    agregar(buscador, "arroz", "Arroz");
    const l = linea(form, "Arroz");
    fireEvent.change(within(l).getByRole("combobox", { name: "Unidad" }), { target: { value: "base" } });
    fireEvent.change(within(l).getByRole("textbox", { name: "Cantidad" }), { target: { value: "10" } });
    fireEvent.change(within(l).getByRole("textbox", { name: "Total pagado" }), { target: { value: "63" } });
    expect(within(l).getByText(/^Entran 10 kg, unas 120 porciones\./)).toBeInTheDocument();

    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.crearMovimiento).toHaveBeenCalled());
    expect(vi.mocked(api.crearMovimiento).mock.calls[0][0].detalles).toEqual([
      { productoId: 1, cantidad: 10, costo: 6.3, totalPagado: 63 },
    ]);
  });

  it("sin el total pagado no se guarda, y dice de cuál", async () => {
    const { form, buscador } = await abrirNuevo();
    agregar(buscador, "arroz", "Arroz");
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    expect(await within(form).findByText('Escribí cuánto pagaste por "Arroz".')).toBeInTheDocument();
    expect(api.crearMovimiento).not.toHaveBeenCalled();
  });

  it("lo que se compra por kilo no tiene nada que elegir", async () => {
    const { form, buscador } = await abrirNuevo();
    agregar(buscador, "sal", "Sal");
    const l = linea(form, "Sal");
    expect(within(l).queryByRole("combobox", { name: "Unidad" })).not.toBeInTheDocument();
    fireEvent.change(within(l).getByRole("textbox", { name: "Cantidad" }), { target: { value: "10" } });
    fireEvent.change(within(l).getByRole("textbox", { name: "Total pagado" }), { target: { value: "30" } });
    expect(within(l).getByText(fmtMoney(3))).toBeInTheDocument();

    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.crearMovimiento).toHaveBeenCalled());
    expect(vi.mocked(api.crearMovimiento).mock.calls[0][0].detalles).toEqual([
      { productoId: 2, cantidad: 10, costo: 3, totalPagado: 30 },
    ]);
  });

  it("un producto y un insumo que no dice cómo se compra siguen con cantidad y costo, como siempre", async () => {
    const { form, buscador } = await abrirNuevo();
    agregar(buscador, "coca", "Coca Cola 2L");
    agregar(buscador, "aceite", "Aceite");
    for (const nombre of ["Coca Cola 2L", "Aceite"]) {
      const l = linea(form, nombre);
      expect(within(l).getByRole("textbox", { name: "Costo" })).toBeInTheDocument();
      expect(within(l).getByText("Subtotal")).toBeInTheDocument();
      expect(within(l).queryByRole("textbox", { name: "Total pagado" })).not.toBeInTheDocument();
    }
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.crearMovimiento).toHaveBeenCalled());
    expect(vi.mocked(api.crearMovimiento).mock.calls[0][0].detalles).toEqual([
      { productoId: 4, cantidad: 1, costo: 9 },
      { productoId: 3, cantidad: 1, costo: 16 },
    ]);
  });

  it("en una salida, la línea del insumo es la de siempre", async () => {
    const { form, buscador } = await abrirNuevo();
    fireEvent.change(within(form).getByRole("combobox", { name: "Tipo" }), { target: { value: "SALIDA" } });
    agregar(buscador, "arroz", "Arroz");
    const l = linea(form, "Arroz");
    expect(within(l).getByRole("textbox", { name: "Costo" })).toBeInTheDocument();
    expect(within(l).queryByRole("textbox", { name: "Total pagado" })).not.toBeInTheDocument();
  });

  it("el buscador vuelve a mostrar el stock del insumo: la venta ahora lo descuenta", async () => {
    const { buscador } = await abrirNuevo();
    fireEvent.change(buscador, { target: { value: "arroz" } });
    expect(within(screen.getByRole("listbox")).getByText("10 Kilogramo")).toBeInTheDocument();
  });
});

describe("con las recetas apagadas", () => {
  beforeEach(() => {
    sesion.recetas = undefined;
  });

  it("el insumo con bulto se carga como siempre, y su stock no se muestra", async () => {
    const { form, buscador } = await abrirNuevo();
    fireEvent.change(buscador, { target: { value: "arroz" } });
    expect(within(screen.getByRole("listbox")).queryByText("10 Kilogramo")).not.toBeInTheDocument();
    fireEvent.mouseDown(within(screen.getByRole("listbox")).getByText("Arroz"));
    const l = linea(form, "Arroz");
    expect(within(l).getByRole("textbox", { name: "Costo" })).toBeInTheDocument();
    expect(within(l).queryByRole("textbox", { name: "Total pagado" })).not.toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.crearMovimiento).toHaveBeenCalled());
    expect(vi.mocked(api.crearMovimiento).mock.calls[0][0].detalles).toEqual([{ productoId: 1, cantidad: 1, costo: 6 }]);
  });
});

describe("el detalle de un movimiento con una compra por bulto", () => {
  const PENDIENTE = movimiento(7, {
    estado: "PENDIENTE",
    comprobante: "PEN-7",
    detalles: [
      {
        id: 71,
        productoId: 1,
        producto: "Arroz",
        cantidad: 92,
        costo: 6.3,
        // 92 × 6,30: lo que daría la cuenta, no lo que se pagó.
        subtotal: 579.6,
        descripcion: null,
        presentacion: "Quintal",
        cantidadPresentacion: 2,
        totalPagado: 580,
      },
      { id: 72, productoId: 4, producto: "Coca Cola 2L", cantidad: 3, costo: 9, descripcion: null },
    ],
  });

  async function abrirDetalle() {
    vi.mocked(api.getMovimientos).mockResolvedValue([PENDIENTE]);
    vi.mocked(api.getMovimiento).mockResolvedValue(PENDIENTE);
    montar();
    fireEvent.click(await screen.findByText("PEN-7"));
    const detalle = await screen.findByRole("dialog", { name: "Detalle del movimiento" });
    await within(detalle).findByText("Arroz");
    return detalle;
  }

  it("dice el bulto y lo pagado, y la plata es lo que se pagó", async () => {
    const detalle = await abrirDetalle();
    expect(within(detalle).getByText(`2 Quintal · ${fmtMoney(580)}`)).toBeInTheDocument();
    const filaArroz = within(detalle).getByText("Arroz").closest("tr")!;
    expect(within(filaArroz).getByText(fmtMoney(580), { selector: "td" })).toBeInTheDocument();
    expect(within(filaArroz).queryByText(fmtMoney(579.6))).not.toBeInTheDocument();
    // Total: 580 + 3 × 9.
    expect(within(detalle).getByText(fmtMoney(607))).toBeInTheDocument();
  });

  it("esa línea no se edita (el total y el bulto quedarían diciendo otra cosa): se quita y se carga de nuevo", async () => {
    const detalle = await abrirDetalle();
    expect(within(detalle).queryByRole("button", { name: "Editar Arroz" })).not.toBeInTheDocument();
    expect(within(detalle).getByRole("button", { name: "Quitar Arroz" })).toBeInTheDocument();
    expect(within(detalle).getByRole("button", { name: "Editar Coca Cola 2L" })).toBeInTheDocument();
  });

  it("«Agregar artículo» muestra el stock del insumo", async () => {
    const detalle = await abrirDetalle();
    fireEvent.click(within(detalle).getByRole("button", { name: "Agregar artículo" }));
    const dialogo = screen.getByRole("dialog", { name: "Agregar artículo" });
    fireEvent.change(within(dialogo).getByRole("combobox", { name: "Buscar artículo" }), { target: { value: "arroz" } });
    fireEvent.mouseDown(within(dialogo).getByText("Arroz", { selector: "span" }));
    expect(within(dialogo).getByText("10 Kilogramo en stock")).toBeInTheDocument();
  });
});
