import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Almacen, ArticuloMovimiento, Movimiento } from "../../types";

/**
 * Movimientos del restaurante (y de todo rubro que no sea farmacia).
 *
 * Dos reglas de octubre de 2026:
 *   · "Nuevo" carga sólo Entrada o Salida, como la app. El ajuste confundía y no
 *     se puede anular; la transferencia no tenía destino y el servidor la
 *     rechazaba siempre.
 *   · El artículo se busca escribiendo, no recorriendo un desplegable.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    // Sin el doble control: guardar aprueba de una, como en los planes de hoy.
    incluye: (c: string) => c !== "aprobacion_inventario",
    usuario: { sucursalId: 1 },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getMovimientos: vi.fn(),
    getMovimiento: vi.fn(),
    getAlmacenes: vi.fn(),
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

function articulo(
  id: number,
  nombre: string,
  extra: Partial<ArticuloMovimiento> = {},
): ArticuloMovimiento {
  return {
    id,
    nombre,
    esInsumo: false,
    costo: 10,
    precio: 15,
    stock: 20,
    unidad: "Unidad",
    ...extra,
  };
}

const ARTICULOS = [
  articulo(1, "Aceite Vegetal", { esInsumo: true, unidad: "Litro", costo: 16 }),
  articulo(2, "Coca Cola 2L", { costo: 9 }),
  articulo(3, "Coca Cola 3L", { costo: 12 }),
  articulo(4, "Café molido", { esInsumo: true }),
  articulo(5, "Simba 2L", { costo: 7, stock: 48 }),
];

function movimiento(id: number, extra: Partial<Movimiento> = {}): Movimiento {
  return {
    id,
    tipo: "ENTRADA",
    comprobante: `MOV-${id}`,
    descripcion: null,
    estado: "APROBADO",
    // Hoy: la pantalla arranca filtrando por el día.
    fecha: new Date().toISOString(),
    fechaAprobacion: null,
    origen: "PRODUCTO",
    almacen: { id: PRINCIPAL.id, nombre: PRINCIPAL.nombre },
    items: 1,
    monto: 100,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMovimientos).mockResolvedValue([movimiento(1)]);
  vi.mocked(api.getAlmacenes).mockResolvedValue([PRINCIPAL]);
  vi.mocked(api.getArticulosMovimiento).mockResolvedValue(ARTICULOS);
});

/** Abre "Nuevo" y espera a que lleguen los artículos del almacén. */
async function abrirNuevo() {
  render(<Movimientos />);
  await screen.findByText("MOV-1");
  fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
  const buscador = screen.getByRole("combobox", { name: "Buscar artículo" });
  await waitFor(() => expect(buscador).not.toBeDisabled());
  return buscador;
}

function sugeridos(): string[] {
  return within(screen.getByRole("listbox", { name: "Artículos" }))
    .getAllByRole("option")
    .map((o) => o.textContent ?? "");
}

describe("Nuevo movimiento: sólo entrada y salida", () => {
  it("el tipo ofrece Entrada y Salida, nada más", async () => {
    await abrirNuevo();
    const tipo = screen.getByRole("combobox", { name: "Tipo" });
    const opciones = within(tipo)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(opciones).toEqual(["Entrada", "Salida"]);
  });

  it("sin ajustes ni transferencias viejas, sus chips no aparecen", async () => {
    render(<Movimientos />);
    await screen.findByText("MOV-1");
    expect(screen.getByRole("button", { name: "Entradas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salidas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajustes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transferencias" })).not.toBeInTheDocument();
  });

  it("un ajuste viejo se sigue viendo y se puede filtrar", async () => {
    vi.mocked(api.getMovimientos).mockResolvedValue([
      movimiento(1),
      movimiento(2, { tipo: "AJUSTE", comprobante: "AJ-2" }),
    ]);
    render(<Movimientos />);
    await screen.findByText("AJ-2");
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    expect(screen.queryByText("MOV-1")).not.toBeInTheDocument();
    expect(screen.getByText("AJ-2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transferencias" })).not.toBeInTheDocument();
  });
});

describe("Agregar artículo buscando", () => {
  it("cada palabra filtra por separado y sin tildes", async () => {
    const buscador = await abrirNuevo();

    fireEvent.change(buscador, { target: { value: "coca 2" } });
    expect(sugeridos()).toHaveLength(1);
    expect(sugeridos()[0]).toContain("Coca Cola 2L");

    fireEvent.change(buscador, { target: { value: "CAFE" } });
    expect(sugeridos()).toHaveLength(1);
    expect(sugeridos()[0]).toContain("Café molido");
    expect(sugeridos()[0]).toContain("insumo");

    fireEvent.change(buscador, { target: { value: "pepsi" } });
    expect(screen.getByText("Ningún artículo coincide con «pepsi».")).toBeInTheDocument();
  });

  it("tocar el campo vacío muestra todo, como el desplegable", async () => {
    const buscador = await abrirNuevo();
    fireEvent.click(buscador);
    expect(sugeridos()).toHaveLength(ARTICULOS.length);
  });

  it("la flecha abajo también abre la lista", async () => {
    const buscador = await abrirNuevo();
    fireEvent.keyDown(buscador, { key: "ArrowDown" });
    expect(sugeridos()).toHaveLength(ARTICULOS.length);
  });

  it("recibir el foco solo no abre la lista", async () => {
    // El foco también llega sin tocar: al volver a la ventana con un clic
    // encima del campo. Si la lista se abría ahí, el modal crecía, el campo se
    // corría y el clic caía sobre un artículo que quedaba elegido sin querer.
    const buscador = await abrirNuevo();
    fireEvent.focus(buscador);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Enter agrega el primero, limpia el campo y no lo vuelve a ofrecer", async () => {
    const buscador = await abrirNuevo();

    fireEvent.change(buscador, { target: { value: "simba" } });
    fireEvent.keyDown(buscador, { key: "Enter" });

    expect(screen.getByText("1 línea")).toBeInTheDocument();
    expect(buscador).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(buscador);
    expect(sugeridos().some((s) => s.includes("Simba"))).toBe(false);
    expect(sugeridos()).toHaveLength(ARTICULOS.length - 1);
  });

  it("las flechas eligen cuál agrega Enter", async () => {
    const buscador = await abrirNuevo();

    fireEvent.change(buscador, { target: { value: "coca" } });
    fireEvent.keyDown(buscador, { key: "ArrowDown" });
    fireEvent.keyDown(buscador, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.crearMovimiento).toHaveBeenCalled());
    expect(vi.mocked(api.crearMovimiento).mock.calls[0][0].detalles).toEqual([
      { productoId: 3, cantidad: 1, costo: 12 },
    ]);
  });

  it("tocar una opción la agrega y se guarda con su costo", async () => {
    const buscador = await abrirNuevo();

    fireEvent.change(buscador, { target: { value: "aceite" } });
    fireEvent.mouseDown(within(screen.getByRole("listbox")).getByText("Aceite Vegetal"));

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.aprobarMovimiento).toHaveBeenCalledWith(900));
    expect(vi.mocked(api.crearMovimiento).mock.calls[0][0]).toMatchObject({
      tipo: "ENTRADA",
      almacenId: PRINCIPAL.id,
      detalles: [{ productoId: 1, cantidad: 1, costo: 16 }],
    });
  });

  it("Escape con la lista abierta cierra la lista, no el formulario", async () => {
    const buscador = await abrirNuevo();

    fireEvent.change(buscador, { target: { value: "coca" } });
    fireEvent.keyDown(buscador, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Nuevo movimiento" })).toBeInTheDocument();
    expect(buscador).toHaveValue("coca");
  });
});

describe("Agregar artículo a un movimiento pendiente", () => {
  it("se busca, se elige y viaja con el costo del artículo", async () => {
    const pendiente = movimiento(7, {
      estado: "PENDIENTE",
      comprobante: "PEN-7",
      detalles: [
        {
          id: 70,
          productoId: 2,
          producto: "Coca Cola 2L",
          cantidad: 3,
          costo: 9,
          descripcion: null,
        },
      ],
    });
    vi.mocked(api.getMovimientos).mockResolvedValue([pendiente]);
    vi.mocked(api.getMovimiento).mockResolvedValue(pendiente);

    render(<Movimientos />);
    fireEvent.click(await screen.findByText("PEN-7"));
    fireEvent.click(await screen.findByRole("button", { name: "Agregar artículo" }));

    const dialogo = screen.getByRole("dialog", { name: "Agregar artículo" });
    const buscador = within(dialogo).getByRole("combobox", { name: "Buscar artículo" });
    await waitFor(() => expect(buscador).toHaveFocus());
    // Con el foco puesto, pero la lista cerrada hasta que se escriba o se toque.
    expect(within(dialogo).queryByRole("listbox")).toBeNull();

    fireEvent.change(buscador, { target: { value: "simba" } });
    fireEvent.mouseDown(within(dialogo).getByText("Simba 2L"));

    // Elegido: el buscador se va y queda el artículo, con su stock.
    expect(within(dialogo).queryByRole("combobox", { name: "Buscar artículo" })).toBeNull();
    expect(within(dialogo).getByText(/^48[.,]00 Unidad en stock$/)).toBeInTheDocument();

    fireEvent.change(within(dialogo).getByLabelText("Cantidad"), { target: { value: "4" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(api.agregarDetalleMovimiento).toHaveBeenCalled());
    expect(api.agregarDetalleMovimiento).toHaveBeenCalledWith(7, {
      productoId: 5,
      cantidad: 4,
      costo: 7,
      descripcion: "",
    });
  });

  it("la cruz vuelve al buscador para elegir otro", async () => {
    const pendiente = movimiento(7, { estado: "PENDIENTE", comprobante: "PEN-7", detalles: [] });
    vi.mocked(api.getMovimientos).mockResolvedValue([pendiente]);
    vi.mocked(api.getMovimiento).mockResolvedValue(pendiente);

    render(<Movimientos />);
    fireEvent.click(await screen.findByText("PEN-7"));
    fireEvent.click(await screen.findByRole("button", { name: "Agregar artículo" }));

    const dialogo = screen.getByRole("dialog", { name: "Agregar artículo" });
    fireEvent.change(within(dialogo).getByRole("combobox", { name: "Buscar artículo" }), {
      target: { value: "simba" },
    });
    fireEvent.mouseDown(within(dialogo).getByText("Simba 2L"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cambiar Simba 2L" }));

    expect(within(dialogo).getByRole("combobox", { name: "Buscar artículo" })).toBeInTheDocument();
  });
});

describe("El detalle no se cierra mientras se cargan renglones", () => {
  const pendiente = movimiento(7, {
    estado: "PENDIENTE",
    comprobante: "PEN-7",
    detalles: [
      { id: 70, productoId: 2, producto: "Coca Cola 2L", cantidad: 3, costo: 9, descripcion: null },
    ],
  });

  async function abrirDetalle() {
    vi.mocked(api.getMovimientos).mockResolvedValue([pendiente]);
    vi.mocked(api.getMovimiento).mockResolvedValue(pendiente);
    render(<Movimientos />);
    fireEvent.click(await screen.findByText("PEN-7"));
    return screen.findByRole("dialog", { name: "Detalle del movimiento" });
  }

  it("guardar un renglón deja el detalle abierto para agregar el siguiente", async () => {
    // Antes se cerraba entero y había que volver a abrirlo por cada artículo.
    await abrirDetalle();
    fireEvent.click(await screen.findByRole("button", { name: "Agregar artículo" }));
    const agregar = screen.getByRole("dialog", { name: "Agregar artículo" });
    fireEvent.change(within(agregar).getByRole("combobox", { name: "Buscar artículo" }), {
      target: { value: "simba" },
    });
    fireEvent.mouseDown(within(agregar).getByText("Simba 2L"));
    fireEvent.change(within(agregar).getByLabelText("Cantidad"), { target: { value: "2" } });
    fireEvent.click(within(agregar).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(api.agregarDetalleMovimiento).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Agregar artículo" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "Detalle del movimiento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar artículo" })).toBeInTheDocument();
    // Y la lista de atrás se refrescó (el total del movimiento cambió).
    expect(vi.mocked(api.getMovimientos).mock.calls.length).toBeGreaterThan(1);
  });

  it("quitar un renglón tampoco lo cierra", async () => {
    await abrirDetalle();
    fireEvent.click(await screen.findByRole("button", { name: "Quitar Coca Cola 2L" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Quitar artículo" })).getByRole("button", {
        name: "Quitar",
      }),
    );

    await waitFor(() => expect(api.eliminarDetalleMovimiento).toHaveBeenCalledWith(70));
    expect(screen.getByRole("dialog", { name: "Detalle del movimiento" })).toBeInTheDocument();
  });

  it("aprobar sí lo cierra: ya no queda nada por hacer ahí", async () => {
    await abrirDetalle();
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Aprobar movimiento" })).getByRole("button", {
        name: "Aprobar",
      }),
    );

    await waitFor(() => expect(api.aprobarMovimiento).toHaveBeenCalledWith(7));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Detalle del movimiento" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("dos clics en «Aprobar» en el mismo tick lo aprueban una sola vez", async () => {
    // Mientras el servidor no frene la segunda aprobación, cada una mueve el
    // stock: el único freno está acá.
    await abrirDetalle();
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    const confirmar = within(screen.getByRole("dialog", { name: "Aprobar movimiento" })).getByRole(
      "button",
      { name: "Aprobar" },
    );
    await act(async () => {
      fireEvent.click(confirmar);
      fireEvent.click(confirmar);
    });
    expect(api.aprobarMovimiento).toHaveBeenCalledTimes(1);
  });
});
