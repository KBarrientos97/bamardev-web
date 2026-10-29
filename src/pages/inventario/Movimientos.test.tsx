import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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

const sesion = vi.hoisted(() => ({
  permisos: ["inventario.mover"] as string[],
  // Sin rubro: como una sesión vieja, ve el stock de todo como siempre.
  rubro: undefined as string | undefined,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    // Sin el doble control: guardar aprueba de una, como en los planes de hoy.
    incluye: (c: string) => c !== "aprobacion_inventario",
    usuario: { sucursalId: 1, permisos: sesion.permisos },
    rubro: sesion.rubro,
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
  sesion.permisos = ["inventario.mover"];
  sesion.rubro = undefined;
  vi.mocked(api.getMovimientos).mockResolvedValue([movimiento(1)]);
  vi.mocked(api.getAlmacenes).mockResolvedValue([PRINCIPAL]);
  vi.mocked(api.getArticulosMovimiento).mockResolvedValue(ARTICULOS);
});

/** Dónde quedó la URL: el `?nuevo=entrada` se saca al abrir el formulario. */
function Ubicacion() {
  const l = useLocation();
  return <p data-testid="ubicacion">{`${l.pathname}${l.search}`}</p>;
}

/** La pantalla dentro de un router: lee `?nuevo=` de la URL. */
function montar(ruta = "/inventario/movimientos") {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Movimientos />
      <Ubicacion />
    </MemoryRouter>,
  );
}

/** Abre "Nuevo" y espera a que lleguen los artículos del almacén. */
async function abrirNuevo() {
  montar();
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
    montar();
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
    montar();
    await screen.findByText("AJ-2");
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    expect(screen.queryByText("MOV-1")).not.toBeInTheDocument();
    expect(screen.getByText("AJ-2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transferencias" })).not.toBeInTheDocument();
  });
});

describe("La lista arranca en hoy", () => {
  it("si hoy no hubo nada, lo dice y ofrece ver todo en vez de «probá con otro texto»", async () => {
    vi.mocked(api.getMovimientos).mockResolvedValue([
      movimiento(1, { fecha: "2026-10-12T15:00:00.000Z" }),
    ]);
    montar();
    expect(await screen.findByText("Hoy no hay movimientos")).toBeInTheDocument();
    expect(screen.queryByText("Probá con otro texto o quitá los filtros.")).not.toBeInTheDocument();
    // La cabecera cuenta lo que se ve: hoy no hay nada, así que dice 0 (no «1 registrado»).
    expect(screen.getByText("0 registrados")).toBeInTheDocument();
    const verTodo = screen.getAllByRole("button", { name: "Ver todo" });
    fireEvent.click(verTodo[verTodo.length - 1]);
    expect(await screen.findByText("MOV-1")).toBeInTheDocument();
    expect(screen.getByText("1 registrado")).toBeInTheDocument();
  });

  it("con un solo movimiento la cabecera dice «1 registrado», no «1 registrados»", async () => {
    montar();
    await screen.findByText("MOV-1");
    expect(screen.getByText("1 registrado")).toBeInTheDocument();
    expect(screen.queryByText("1 registrados")).not.toBeInTheDocument();
  });

  it("la cabecera no suma los movimientos de otros días mientras la lista está en hoy", async () => {
    vi.mocked(api.getMovimientos).mockResolvedValue([
      movimiento(1),
      movimiento(2, { fecha: "2026-10-12T15:00:00.000Z", estado: "PENDIENTE" }),
    ]);
    montar();
    await screen.findByText("MOV-1");
    expect(screen.getByText("1 registrado")).toBeInTheDocument();
    expect(screen.queryByText(/sin aprobar/)).not.toBeInTheDocument();
    const verTodo = screen.getAllByRole("button", { name: "Ver todo" });
    fireEvent.click(verTodo[verTodo.length - 1]);
    expect(await screen.findByText("2 registrados · 1 sin aprobar")).toBeInTheDocument();
  });

  it("con un solo movimiento de hoy y pendiente, dice «1 registrado · 1 sin aprobar»", async () => {
    vi.mocked(api.getMovimientos).mockResolvedValue([
      movimiento(1, { estado: "PENDIENTE" }),
    ]);
    montar();
    await screen.findByText("MOV-1");
    expect(screen.getByText("1 registrado · 1 sin aprobar")).toBeInTheDocument();
    expect(screen.queryByText(/registrados/)).not.toBeInTheDocument();
  });

  it("con un texto escrito, sigue diciendo «Sin resultados»", async () => {
    montar();
    await screen.findByText("MOV-1");
    fireEvent.change(screen.getByPlaceholderText("Buscar por comprobante o descripción"), {
      target: { value: "no existe" },
    });
    expect(await screen.findByText("Sin resultados")).toBeInTheDocument();
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

    montar();
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
    // Sin ",00": las unidades son "48", no "48,00" (Kevin, 25-oct).
    expect(within(dialogo).getByText("48 Unidad en stock")).toBeInTheDocument();

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

    montar();
    fireEvent.click(await screen.findByText("PEN-7"));
    fireEvent.click(await screen.findByRole("button", { name: "Agregar artículo" }));

    const dialogo = screen.getByRole("dialog", { name: "Agregar artículo" });
    fireEvent.change(within(dialogo).getByRole("combobox", { name: "Buscar artículo" }), {
      target: { value: "simba" },
    });
    // El resultado llega tras la espera del buscador: con la suite en paralelo
    // a veces todavía no estaba y el `getByText` fallaba.
    fireEvent.mouseDown(await within(dialogo).findByText("Simba 2L"));
    fireEvent.click(await within(dialogo).findByRole("button", { name: "Cambiar Simba 2L" }));

    expect(await within(dialogo).findByRole("combobox", { name: "Buscar artículo" })).toBeInTheDocument();
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
    montar();
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

describe("Las cantidades del detalle van sin ,00 (Kevin, 25-oct)", () => {
  it("la unidad entera se ve entera y el insumo, con sus tres decimales", async () => {
    // Con dos decimales fijos salían "3,00" y "0,13": el 0,125 de un insumo
    // redondeado, como si hubieran entrado cinco mililitros de más.
    const entrada = movimiento(9, {
      comprobante: "ENT-9",
      detalles: [
        { id: 90, productoId: 2, producto: "Coca Cola 2L", cantidad: 3, costo: 9, descripcion: null },
        { id: 91, productoId: 1, producto: "Aceite Vegetal", cantidad: 0.125, costo: 16, descripcion: null },
      ],
    });
    vi.mocked(api.getMovimientos).mockResolvedValue([entrada]);
    vi.mocked(api.getMovimiento).mockResolvedValue(entrada);
    montar();
    fireEvent.click(await screen.findByText("ENT-9"));
    const detalle = await screen.findByRole("dialog", { name: "Detalle del movimiento" });

    const coca = await within(detalle).findByRole("row", { name: /Coca Cola 2L/ });
    expect(within(coca).getAllByRole("cell")[1]).toHaveTextContent(/^3$/);
    const aceite = within(detalle).getByRole("row", { name: /Aceite Vegetal/ });
    expect(within(aceite).getAllByRole("cell")[1]).toHaveTextContent(/^0,125$/);
  });
});

describe("Aprobar una transferencia pide su permiso (16-oct)", () => {
  // Una transferencia pendiente (de las de antes, o cargada en otra sucursal):
  // aprobarla exige `inventario.aprobar_transferencias`, aunque el usuario
  // apruebe entradas y salidas.
  const transferencia = movimiento(8, {
    tipo: "TRANSFERENCIA",
    estado: "PENDIENTE",
    comprobante: "TRF-8",
    almacenDestino: { id: 2, nombre: "Norte" },
    detalles: [],
  });

  async function abrirTransferencia() {
    vi.mocked(api.getMovimientos).mockResolvedValue([transferencia]);
    vi.mocked(api.getMovimiento).mockResolvedValue(transferencia);
    montar();
    fireEvent.click(await screen.findByText("TRF-8"));
    const detalle = await screen.findByRole("dialog", { name: "Detalle del movimiento" });
    await within(detalle).findByRole("button", { name: "Eliminar" });
    return detalle;
  }

  it("sin el permiso no se ofrece Aprobar, y se dice quién la aprueba", async () => {
    sesion.permisos = ["inventario.mover", "inventario.aprobar"];
    const detalle = await abrirTransferencia();
    expect(within(detalle).queryByRole("button", { name: "Aprobar" })).not.toBeInTheDocument();
    expect(within(detalle).getByText(/permiso «Aprobar transferencias»/)).toBeInTheDocument();
  });

  it("con el permiso, Aprobar está", async () => {
    sesion.permisos = ["inventario.mover", "inventario.aprobar_transferencias"];
    const detalle = await abrirTransferencia();
    expect(within(detalle).getByRole("button", { name: "Aprobar" })).toBeInTheDocument();
  });
});

describe("Registrar compra: ?nuevo=entrada abre el formulario (28-oct)", () => {
  it("llega con la entrada abierta en el primer almacén, y el parámetro se va de la URL", async () => {
    montar("/inventario/movimientos?nuevo=entrada");
    const formulario = await screen.findByRole("dialog", { name: "Nuevo movimiento" });
    expect(within(formulario).getByRole("combobox", { name: "Tipo" })).toHaveValue("ENTRADA");
    expect(within(formulario).getByRole("combobox", { name: "Almacén" })).toHaveValue(String(PRINCIPAL.id));
    // Sin esto, recargar después de guardar volvía a abrir el formulario vacío.
    await waitFor(() => expect(screen.getByTestId("ubicacion")).toHaveTextContent(/^\/inventario\/movimientos$/));
  });

  it("espera a los almacenes antes de abrir: abierto antes, quedaba sin almacén y con el buscador trabado", async () => {
    // El formulario elige el almacén al montarse: abierto con la lista vacía
    // arrancaba en "Elegí uno", y el buscador decía "Elegí primero un almacén…".
    let soltar!: (lista: Almacen[]) => void;
    vi.mocked(api.getAlmacenes).mockReturnValue(
      new Promise<Almacen[]>((r) => {
        soltar = r;
      }),
    );
    montar("/inventario/movimientos?nuevo=entrada");
    await screen.findByText("MOV-1");
    expect(screen.queryByRole("dialog", { name: "Nuevo movimiento" })).not.toBeInTheDocument();

    await act(async () => soltar([PRINCIPAL]));
    const formulario = await screen.findByRole("dialog", { name: "Nuevo movimiento" });
    expect(within(formulario).getByRole("combobox", { name: "Almacén" })).toHaveValue(String(PRINCIPAL.id));
  });

  it("sin el parámetro la pantalla arranca como siempre, con el formulario cerrado", async () => {
    montar();
    await screen.findByText("MOV-1");
    expect(screen.queryByRole("dialog", { name: "Nuevo movimiento" })).not.toBeInTheDocument();
  });
});

describe("Restaurante: el stock de un insumo no se muestra al agregarlo (28-oct)", () => {
  // En el restaurante vender un plato no descuenta insumos: su stock es la
  // suma de todas las compras y se leía como lo que había en la cocina.
  async function agregarA(tipo: Movimiento["tipo"]) {
    const pendiente = movimiento(7, { tipo, estado: "PENDIENTE", comprobante: "PEN-7", detalles: [] });
    vi.mocked(api.getMovimientos).mockResolvedValue([pendiente]);
    vi.mocked(api.getMovimiento).mockResolvedValue(pendiente);
    montar();
    fireEvent.click(await screen.findByText("PEN-7"));
    fireEvent.click(await screen.findByRole("button", { name: "Agregar artículo" }));
    return screen.getByRole("dialog", { name: "Agregar artículo" });
  }

  function elegir(dialogo: HTMLElement, texto: string, nombre: string) {
    fireEvent.change(within(dialogo).getByRole("combobox", { name: "Buscar artículo" }), {
      target: { value: texto },
    });
    fireEvent.mouseDown(within(dialogo).getByText(nombre));
  }

  it("el insumo elegido no dice cuánto hay en stock; una bebida sí", async () => {
    sesion.rubro = "RESTAURANTE";
    const dialogo = await agregarA("ENTRADA");

    elegir(dialogo, "aceite", "Aceite Vegetal");
    expect(within(dialogo).getByText("Aceite Vegetal")).toBeInTheDocument();
    expect(within(dialogo).queryByText(/en stock/)).not.toBeInTheDocument();

    fireEvent.click(within(dialogo).getByRole("button", { name: "Cambiar Aceite Vegetal" }));
    elegir(dialogo, "simba", "Simba 2L");
    expect(within(dialogo).getByText("48 Unidad en stock")).toBeInTheDocument();
  });

  it("en una salida no ofrece el «Disponible» del insumo, pero el tope se sigue validando", async () => {
    // El backend rechaza al aprobar una salida mayor al stock: avisarlo acá
    // sigue valiendo, aunque el número no se muestre de entrada.
    sesion.rubro = "RESTAURANTE";
    const dialogo = await agregarA("SALIDA");

    elegir(dialogo, "aceite", "Aceite Vegetal");
    expect(within(dialogo).queryByText(/Disponible/)).not.toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Cantidad"), { target: { value: "25" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByText("No hay stock suficiente: quedan 20.")).toBeInTheDocument();
    expect(api.agregarDetalleMovimiento).not.toHaveBeenCalled();
  });

  it("fuera del restaurante el insumo sigue mostrando su stock y su disponible", async () => {
    sesion.rubro = "BILLAR";
    const dialogo = await agregarA("SALIDA");

    elegir(dialogo, "aceite", "Aceite Vegetal");
    expect(within(dialogo).getByText("20 Litro en stock")).toBeInTheDocument();
    expect(within(dialogo).getByText("Disponible: 20")).toBeInTheDocument();
  });
});
