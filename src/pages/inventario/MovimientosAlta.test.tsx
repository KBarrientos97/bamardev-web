import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Almacen, ArticuloMovimiento, Movimiento } from "../../types";

/**
 * Guardar un movimiento nuevo (MOV-03, la misma regla que la app).
 *
 * El formulario sigue siendo de un paso y con al menos un artículo: sin el
 * extra «Aprobar movimientos» aprueba al guardar, con el extra queda
 * pendiente. Lo que se fija acá:
 *   · si se creó pero no se pudo aprobar, se sigue sobre ESE movimiento. Antes
 *     el error quedaba en el formulario con los renglones, y tocar «Guardar»
 *     otra vez creaba otro;
 *   · si el alta quedó sin respuesta, pudo haberse creado: no se invita a
 *     repetirla, se manda a mirar la lista;
 *   · un doble clic crea uno solo, y mientras guarda no se cierra;
 *   · con el extra se abre el recién creado, y «Aprobar» (y «Anular» lo
 *     aprobado) se ofrece con la regla del servidor.
 */

// La pantalla entera, el formulario y después el detalle: corridos solos
// tardan 1 a 2 s, pero con otras suites en paralelo el primero pasaba los 5 s
// y fallaba por tiempo, no por lo que prueba.
vi.setConfig({ testTimeout: 60_000 });

const sesion = vi.hoisted(() => ({
  permisos: ["inventario.mover"] as string[],
  /** `negocio.features` del login: las features del plan. */
  features: [] as string[],
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    // Como el `incluye` de verdad: con la lista vacía falla abierto.
    incluye: (c: string) => sesion.features.length === 0 || sesion.features.includes(c),
    usuario: { sucursalId: 1, permisos: sesion.permisos },
    negocio: { id: 1, nombre: "Pollería", tipoNegocio: "RESTAURANTE", features: sesion.features },
    rubro: "RESTAURANTE",
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getMovimientos: vi.fn(),
    getMovimiento: vi.fn(),
    getAlmacenes: vi.fn(),
    getSucursales: vi.fn(async () => []),
    getArticulosMovimiento: vi.fn(),
    crearMovimiento: vi.fn(),
    aprobarMovimiento: vi.fn(),
    anularMovimiento: vi.fn(),
    eliminarMovimiento: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import Movimientos from "./Movimientos";

/** Un plan de restaurante sin el doble control: guardar aprueba. */
const SIN_EXTRA = ["pos", "caja", "inventario", "insumos"];
/** El mismo plan con el extra «Aprobar movimientos»: uno carga y otro aprueba. */
const CON_EXTRA = [...SIN_EXTRA, "aprobacion_inventario"];

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
  // Las 3 que vio el formulario: al aprobar, el servidor puede ver otra cosa.
  articulo(2, "Coca Cola 2L", { costo: 9, stock: 3 }),
];

function movimiento(id: number, extra: Partial<Movimiento> = {}): Movimiento {
  return {
    id,
    tipo: "ENTRADA",
    comprobante: `MOV-${id}`,
    descripcion: null,
    estado: "APROBADO",
    fecha: new Date().toISOString(),
    fechaAprobacion: null,
    origen: "PRODUCTO",
    almacen: { id: PRINCIPAL.id, nombre: PRINCIPAL.nombre },
    items: 1,
    monto: 100,
    ...extra,
  };
}

/** Lo que devuelve el servidor al crear: SIEMPRE pendiente, aprobar es otro paso. */
const RECIEN_CREADO = movimiento(900, {
  estado: "PENDIENTE",
  detalles: [
    { id: 9001, productoId: 2, producto: "Coca Cola 2L", cantidad: 3, costo: 9, descripcion: null },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  sesion.permisos = ["inventario.mover"];
  sesion.features = SIN_EXTRA;
  vi.mocked(api.getMovimientos).mockResolvedValue([movimiento(1)]);
  vi.mocked(api.getMovimiento).mockResolvedValue(RECIEN_CREADO);
  vi.mocked(api.getAlmacenes).mockResolvedValue([PRINCIPAL]);
  vi.mocked(api.getArticulosMovimiento).mockResolvedValue(ARTICULOS);
  vi.mocked(api.crearMovimiento).mockResolvedValue(RECIEN_CREADO);
  vi.mocked(api.aprobarMovimiento).mockResolvedValue({ ...RECIEN_CREADO, estado: "APROBADO" });
  vi.mocked(api.anularMovimiento).mockResolvedValue({ ...RECIEN_CREADO, estado: "ANULADO" });
});

/** La pantalla dentro de un router: lee `?nuevo=` de la URL. */
function montar() {
  return render(
    <MemoryRouter initialEntries={["/inventario/movimientos"]}>
      <Movimientos />
    </MemoryRouter>,
  );
}

/** Abre "Nuevo" y espera a que lleguen los artículos del almacén. */
async function abrirNuevo() {
  montar();
  await screen.findByText("MOV-1");
  fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
  const formulario = screen.getByRole("dialog", { name: "Nuevo movimiento" });
  const buscador = within(formulario).getByRole("combobox", { name: "Buscar artículo" });
  await waitFor(() => expect(buscador).not.toBeDisabled());
  return formulario;
}

function agregar(formulario: HTMLElement, texto: string, nombre: string) {
  fireEvent.change(within(formulario).getByRole("combobox", { name: "Buscar artículo" }), {
    target: { value: texto },
  });
  fireEvent.mouseDown(within(within(formulario).getByRole("listbox")).getByText(nombre));
}

function guardar(formulario: HTMLElement) {
  fireEvent.click(within(formulario).getByRole("button", { name: "Guardar" }));
}

describe("Sin el extra: guardar aprueba", () => {
  it("sin el extra, guardar crea con los renglones y aprueba ese mismo id", async () => {
    vi.mocked(api.crearMovimiento).mockResolvedValue({ ...RECIEN_CREADO, id: 901 });
    const formulario = await abrirNuevo();
    agregar(formulario, "coca", "Coca Cola 2L");
    agregar(formulario, "aceite", "Aceite Vegetal");
    fireEvent.change(within(formulario).getAllByLabelText("Cantidad")[0], { target: { value: "3" } });
    guardar(formulario);

    await waitFor(() => expect(api.aprobarMovimiento).toHaveBeenCalledWith(901));
    expect(api.crearMovimiento).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.crearMovimiento).mock.calls[0][0]).toMatchObject({
      tipo: "ENTRADA",
      almacenId: PRINCIPAL.id,
      detalles: [
        { productoId: 2, cantidad: 3, costo: 9 },
        { productoId: 1, cantidad: 1, costo: 16 },
      ],
    });
    // Primero se crea y después se aprueba lo creado, nunca al revés.
    expect(vi.mocked(api.crearMovimiento).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.aprobarMovimiento).mock.invocationCallOrder[0],
    );
    // Aprobado: el formulario se cierra y no queda nada que abrir.
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Nuevo movimiento" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog", { name: "Detalle del movimiento" })).not.toBeInTheDocument();
    expect(api.getMovimiento).not.toHaveBeenCalled();
  });

  it("si aprobar falla, no se crea otro: se abre ese movimiento pendiente con el motivo", async () => {
    // El formulario vio 3 cocas y, mientras se cargaba la salida, la caja
    // vendió una: el servidor la rechaza recién al aprobar. Antes el error
    // quedaba en el formulario con los renglones, y «Guardar» otra vez creaba
    // OTRA salida.
    const pendiente = { ...RECIEN_CREADO, tipo: "SALIDA" as const };
    vi.mocked(api.crearMovimiento).mockResolvedValue(pendiente);
    vi.mocked(api.getMovimiento).mockResolvedValue(pendiente);
    vi.mocked(api.aprobarMovimiento).mockRejectedValue(
      new Error('Stock insuficiente de "Coca Cola 2L" (disponible 2, requiere 3)'),
    );

    const formulario = await abrirNuevo();
    fireEvent.change(within(formulario).getByRole("combobox", { name: "Tipo" }), {
      target: { value: "SALIDA" },
    });
    agregar(formulario, "coca", "Coca Cola 2L");
    fireEvent.change(within(formulario).getByLabelText("Cantidad"), { target: { value: "3" } });
    guardar(formulario);

    const detalle = await screen.findByRole("dialog", { name: "Detalle del movimiento" });
    expect(
      await within(detalle).findByText(
        'Se guardó como pendiente, pero no se pudo aprobar: Stock insuficiente de "Coca Cola 2L" (disponible 2, requiere 3). Corregilo acá y aprobalo; no lo cargues de nuevo.',
      ),
    ).toBeInTheDocument();
    expect(api.crearMovimiento).toHaveBeenCalledTimes(1);
    expect(api.aprobarMovimiento).toHaveBeenCalledWith(900);
    expect(api.getMovimiento).toHaveBeenCalledWith(900);
    expect(screen.queryByRole("dialog", { name: "Nuevo movimiento" })).not.toBeInTheDocument();
    // Se corrige y se aprueba ESE, desde ahí mismo.
    expect(within(detalle).getByRole("button", { name: "Aprobar" })).toBeInTheDocument();
  });

  it("si además el detalle no se puede abrir, el aviso sigue y «Reintentar» lo trae", async () => {
    // Sin internet fallan aprobar y abrir el detalle. Con sólo «No se pudo
    // cargar» a la vista, lo natural era volver a cargarlo: el duplicado.
    const sinRed = new Error("Sin internet. Revisá la conexión del local.");
    vi.mocked(api.aprobarMovimiento).mockRejectedValue(sinRed);
    vi.mocked(api.getMovimiento).mockRejectedValue(sinRed);

    const formulario = await abrirNuevo();
    agregar(formulario, "coca", "Coca Cola 2L");
    guardar(formulario);

    const detalle = await screen.findByRole("dialog", { name: "Detalle del movimiento" });
    // Sin el punto doble: el motivo ya trae el suyo.
    expect(
      await within(detalle).findByText(
        "Se guardó como pendiente, pero no se pudo aprobar: Sin internet. Revisá la conexión del local. Corregilo acá y aprobalo; no lo cargues de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(api.crearMovimiento).toHaveBeenCalledTimes(1);

    // Vuelve la señal: «Reintentar» lo trae ahí mismo, con el aviso y su
    // «Aprobar». Antes no había cómo pedirlo de nuevo: sólo cerrar y buscarlo
    // en una lista que también había fallado.
    vi.mocked(api.getMovimiento).mockResolvedValue(RECIEN_CREADO);
    fireEvent.click(within(detalle).getByRole("button", { name: "Reintentar" }));
    expect(await within(detalle).findByText("Entrada · MOV-900")).toBeInTheDocument();
    expect(within(detalle).getByText(/no lo cargues de nuevo/)).toBeInTheDocument();
    expect(within(detalle).getByRole("button", { name: "Aprobar" })).toBeInTheDocument();
  });

  it("al cerrar el detalle del aviso, el próximo que se abre no lo arrastra", async () => {
    // Si el aviso quedaba en la pantalla, el siguiente movimiento que se abría
    // de la lista (aunque estuviera APROBADO) decía «no se pudo aprobar… no
    // lo cargues de nuevo».
    vi.mocked(api.aprobarMovimiento).mockRejectedValue(new Error("Sin internet. Revisá la conexión del local."));
    vi.mocked(api.getMovimiento).mockImplementation(async (id) => (id === 1 ? movimiento(1) : RECIEN_CREADO));

    const formulario = await abrirNuevo();
    agregar(formulario, "coca", "Coca Cola 2L");
    guardar(formulario);
    const conAviso = await screen.findByRole("dialog", { name: "Detalle del movimiento" });
    await within(conAviso).findByText(/no se pudo aprobar/);
    fireEvent.click(within(conAviso).getByRole("button", { name: "Cerrar" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Detalle del movimiento" })).not.toBeInTheDocument(),
    );

    fireEvent.click(await screen.findByText("MOV-1"));
    const otro = await screen.findByRole("dialog", { name: "Detalle del movimiento" });
    expect(await within(otro).findByText("Entrada · MOV-1")).toBeInTheDocument();
    expect(within(otro).queryByText(/no se pudo aprobar/)).not.toBeInTheDocument();
  });

  it("si al guardar había otro detalle abierto debajo, se abre el recién creado con su aviso", async () => {
    // El detalle no atrapa el foco: con el teclado se llega a «Nuevo» y el
    // formulario se abre encima. Sin una clave por movimiento, al guardar se
    // reusaba el detalle de abajo con su estado, y el aviso no aparecía.
    vi.mocked(api.aprobarMovimiento).mockRejectedValue(new Error("Sin internet. Revisá la conexión del local."));
    vi.mocked(api.getMovimiento).mockImplementation(async (id) => (id === 1 ? movimiento(1) : RECIEN_CREADO));
    montar();
    fireEvent.click(await screen.findByText("MOV-1"));
    await screen.findByText("Entrada · MOV-1");

    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    const formulario = screen.getByRole("dialog", { name: "Nuevo movimiento" });
    await waitFor(() =>
      expect(within(formulario).getByRole("combobox", { name: "Buscar artículo" })).not.toBeDisabled(),
    );
    agregar(formulario, "coca", "Coca Cola 2L");
    guardar(formulario);

    expect(await screen.findByText("Entrada · MOV-900")).toBeInTheDocument();
    const detalle = screen.getByRole("dialog", { name: "Detalle del movimiento" });
    expect(within(detalle).getByText(/no se pudo aprobar/)).toBeInTheDocument();
  });

  it("dos clics en «Guardar» en el mismo tick crean un solo movimiento", async () => {
    // `guardando` apaga el botón recién en el render siguiente: los dos clics
    // entraban y la compra se cargaba dos veces.
    const formulario = await abrirNuevo();
    agregar(formulario, "coca", "Coca Cola 2L");
    const boton = within(formulario).getByRole("button", { name: "Guardar" });
    await act(async () => {
      fireEvent.click(boton);
      fireEvent.click(boton);
    });

    await waitFor(() => expect(api.aprobarMovimiento).toHaveBeenCalled());
    expect(api.crearMovimiento).toHaveBeenCalledTimes(1);
    expect(api.aprobarMovimiento).toHaveBeenCalledTimes(1);
  });

  it("si el servidor rechaza el alta, el error queda en el formulario y se puede volver a guardar", async () => {
    // Un «no» del servidor sí dice que no se creó (el alta es todo o nada):
    // volver a guardar no duplica, y el candado del doble clic no puede
    // quedar trabado.
    vi.mocked(api.crearMovimiento).mockRejectedValueOnce(
      Object.assign(
        new Error('El producto "Coca Cola 2L" no controla stock; no puede ir en un movimiento de inventario'),
        { status: 400 },
      ),
    );
    const formulario = await abrirNuevo();
    agregar(formulario, "coca", "Coca Cola 2L");
    guardar(formulario);

    expect(
      await within(formulario).findByText(
        'El producto "Coca Cola 2L" no controla stock; no puede ir en un movimiento de inventario',
      ),
    ).toBeInTheDocument();
    expect(api.aprobarMovimiento).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(within(formulario).getByRole("button", { name: "Guardar" })).not.toBeDisabled(),
    );

    // Se saca el que sobra y se guarda en el mismo formulario.
    fireEvent.click(within(formulario).getByRole("button", { name: "Quitar Coca Cola 2L" }));
    agregar(formulario, "aceite", "Aceite Vegetal");
    guardar(formulario);
    await waitFor(() => expect(api.aprobarMovimiento).toHaveBeenCalledWith(900));
    expect(api.crearMovimiento).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.crearMovimiento).mock.calls[1][0].detalles).toEqual([
      { productoId: 1, cantidad: 1, costo: 16 },
    ]);
  });

  it("si el alta queda sin respuesta, no invita a repetirla: manda a la lista, que se vuelve a pedir al cerrar", async () => {
    // El corte de 20 s de `request` (o la red que se cae con el pedido ya
    // enviado) llega con status 0, y el servidor pudo haberlo guardado igual:
    // el alta no lleva clave de idempotencia. Antes decía «Probá de nuevo»,
    // y «Guardar» otra vez creaba OTRO movimiento.
    vi.mocked(api.crearMovimiento).mockRejectedValueOnce(
      Object.assign(new Error("El servidor está tardando demasiado. Probá de nuevo en un momento."), {
        status: 0,
      }),
    );
    const formulario = await abrirNuevo();
    agregar(formulario, "coca", "Coca Cola 2L");
    guardar(formulario);

    expect(
      await within(formulario).findByText(
        "La respuesta no llegó y puede que se haya guardado igual. Antes de volver a guardar, fijate en Movimientos si ya está.",
      ),
    ).toBeInTheDocument();
    expect(within(formulario).queryByText(/Probá de nuevo/)).not.toBeInTheDocument();
    expect(api.aprobarMovimiento).not.toHaveBeenCalled();

    // Sí se había guardado: al cerrar, la lista se vuelve a pedir y ahí está.
    // Con la de antes no aparecía, y lo natural era cargarlo otra vez.
    vi.mocked(api.getMovimientos).mockResolvedValue([movimiento(1), RECIEN_CREADO]);
    fireEvent.click(within(formulario).getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("MOV-900")).toBeInTheDocument();
    expect(api.crearMovimiento).toHaveBeenCalledTimes(1);
  });

  it("mientras guarda, ni «Cancelar» ni la X ni Escape cierran el formulario", async () => {
    // Cerrarlo no frena el pedido: con la red lenta se volvía a abrir «Nuevo»
    // y se guardaba otro mientras el primero seguía en camino (dos
    // movimientos), o el error del primero se perdía con el formulario.
    let responder!: (m: Movimiento) => void;
    vi.mocked(api.crearMovimiento).mockReturnValue(
      new Promise<Movimiento>((r) => {
        responder = r;
      }),
    );
    const formulario = await abrirNuevo();
    agregar(formulario, "coca", "Coca Cola 2L");
    guardar(formulario);

    expect(await within(formulario).findByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(within(formulario).getByRole("button", { name: "Cancelar" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(within(formulario).getByRole("button", { name: "Cerrar" }));
    expect(screen.getByRole("dialog", { name: "Nuevo movimiento" })).toBeInTheDocument();

    // Cuando el alta responde sigue como siempre: aprueba ese y cierra.
    await act(async () => responder(RECIEN_CREADO));
    await waitFor(() => expect(api.aprobarMovimiento).toHaveBeenCalledWith(900));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Nuevo movimiento" })).not.toBeInTheDocument(),
    );
    expect(api.crearMovimiento).toHaveBeenCalledTimes(1);
  });

  it("sin el extra, quien mueve inventario sigue anulando lo aprobado", async () => {
    // Guarda: el servidor lo deja (sin doble control aprueba quien mueve
    // inventario), y es lo que tiene casi todo negocio.
    const aprobado = movimiento(5, { comprobante: "ENT-5", detalles: [] });
    vi.mocked(api.getMovimientos).mockResolvedValue([aprobado]);
    vi.mocked(api.getMovimiento).mockResolvedValue(aprobado);
    montar();
    fireEvent.click(await screen.findByText("ENT-5"));
    const detalle = await screen.findByRole("dialog", { name: "Detalle del movimiento" });
    expect(await within(detalle).findByRole("button", { name: "Anular" })).toBeInTheDocument();
  });
});

describe("Con el extra «Aprobar movimientos»: queda pendiente", () => {
  it("con el extra, guardar no aprueba y abre el detalle del recién creado", async () => {
    sesion.features = CON_EXTRA;
    sesion.permisos = ["inventario.mover", "inventario.aprobar"];
    const formulario = await abrirNuevo();
    agregar(formulario, "coca", "Coca Cola 2L");
    guardar(formulario);

    const detalle = await screen.findByRole("dialog", { name: "Detalle del movimiento" });
    expect(await within(detalle).findByText("Entrada · MOV-900")).toBeInTheDocument();
    expect(api.crearMovimiento).toHaveBeenCalledTimes(1);
    expect(api.aprobarMovimiento).not.toHaveBeenCalled();
    expect(api.getMovimiento).toHaveBeenCalledWith(900);
    expect(screen.queryByRole("dialog", { name: "Nuevo movimiento" })).not.toBeInTheDocument();
    // Quien puede aprobar lo tiene ahí mismo, sin buscarlo en la lista; y
    // quedar pendiente es lo pedido, no un error.
    expect(within(detalle).getByRole("button", { name: "Aprobar" })).toBeInTheDocument();
    expect(within(detalle).queryByText(/no se pudo aprobar/)).not.toBeInTheDocument();
  });

  it("con el extra y sólo «Mover inventario», el detalle no ofrece Aprobar y dice quién lo aprueba", async () => {
    // A ese rol el servidor le contesta 403 al aprobar (backend,
    // test/aprobar-movimientos.e2e-spec.ts): el botón le ofrecía un error.
    sesion.features = CON_EXTRA;
    sesion.permisos = ["inventario.mover"];
    const formulario = await abrirNuevo();
    agregar(formulario, "coca", "Coca Cola 2L");
    guardar(formulario);

    const detalle = await screen.findByRole("dialog", { name: "Detalle del movimiento" });
    expect(
      await within(detalle).findByText(
        /Lo aprueba quien tiene el permiso «Aprobar movimientos» \(de fábrica, el Administrador y el Encargado\)\./,
      ),
    ).toBeInTheDocument();
    expect(within(detalle).queryByRole("button", { name: "Aprobar" })).not.toBeInTheDocument();
    expect(api.aprobarMovimiento).not.toHaveBeenCalled();
  });

  it("con el extra, «Anular» un aprobado lo ve sólo quien puede aprobar", async () => {
    // Anular lo aprobado revierte el stock: el servidor pide lo mismo que para
    // aprobar, y a quien sólo mueve inventario le contestaba 403.
    sesion.features = CON_EXTRA;
    const aprobado = movimiento(5, { comprobante: "ENT-5", detalles: [] });
    vi.mocked(api.getMovimientos).mockResolvedValue([aprobado]);
    vi.mocked(api.getMovimiento).mockResolvedValue(aprobado);

    async function abrirAprobado() {
      const vista = montar();
      fireEvent.click(await screen.findByText("ENT-5"));
      const detalle = await screen.findByRole("dialog", { name: "Detalle del movimiento" });
      await within(detalle).findByText("Entrada · ENT-5");
      return { vista, detalle };
    }

    sesion.permisos = ["inventario.mover"];
    const quienCarga = await abrirAprobado();
    expect(within(quienCarga.detalle).queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
    quienCarga.vista.unmount();

    sesion.permisos = ["inventario.mover", "inventario.aprobar"];
    const quienAprueba = await abrirAprobado();
    expect(within(quienAprueba.detalle).getByRole("button", { name: "Anular" })).toBeInTheDocument();
  });
});

describe("Sin features en la sesión: el formulario falla abierto, el detalle no", () => {
  it("el alta queda pendiente y el detalle igual le ofrece Aprobar a quien mueve inventario", async () => {
    // La asimetría es a propósito. El formulario pregunta con `incluye`, que
    // sin la lista falla abierto: no aprueba solo. El detalle mira el extra
    // CONFIRMADO en la lista, porque el backend, sin la fila del extra
    // (`features.tiene` da false), deja aprobar a quien mueve inventario. Con
    // `incluye` también en el detalle, ese movimiento quedaba pendiente y
    // quien sólo mueve inventario no veía cómo aprobarlo, aunque podía.
    sesion.features = [];
    sesion.permisos = ["inventario.mover"];
    const formulario = await abrirNuevo();
    agregar(formulario, "coca", "Coca Cola 2L");
    guardar(formulario);

    const detalle = await screen.findByRole("dialog", { name: "Detalle del movimiento" });
    expect(await within(detalle).findByText("Entrada · MOV-900")).toBeInTheDocument();
    expect(api.aprobarMovimiento).not.toHaveBeenCalled();
    expect(within(detalle).getByRole("button", { name: "Aprobar" })).toBeInTheDocument();
  });
});
