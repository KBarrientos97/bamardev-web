import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";
import type { Carrito } from "./useCarrito";

/**
 * El POS con un pedido de Yango o PedidosYa (PLAN-PEDIDOS-PLATAFORMA §5): los
 * botones sólo con la feature de esa plataforma y el permiso, sólo en un
 * pedido de mostrador; el diálogo de confirmación; y el registro, en vivo, sin
 * señal (a la cola) y con un 4xx del servidor. La venta, el cobro y el recibo
 * son de mentira: acá se prueba lo que decide el propio POS.
 */

const sesion = vi.hoisted(() => ({
  features: ["pos", "caja", "pedidos_yango", "pedidos_pedidosya"] as string[],
  permisos: ["ventas.vender", "plataformas.registrar"] as string[],
  /** Configuración › Punto de venta (delivery full, 18-nov); null = la de fábrica. */
  pos: null as Record<string, unknown> | null,
  /** El conteo por categoría (18-nov); null = apagado, lo de fábrica. */
  conteo: null as Record<string, unknown> | null,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: {
      id: 1,
      nombre: "El Ganadero",
      features: sesion.features,
      ...(sesion.pos ? { tipoNegocio: "RESTAURANTE", pos: sesion.pos } : {}),
      ...(sesion.conteo ? { conteo: sesion.conteo } : {}),
    },
    usuario: { id: 1, username: "caja", rol: "CAJERO", permisos: sesion.permisos },
    rubro: "RESTAURANTE",
    incluye: () => true,
    puede: () => false,
    cupo: undefined,
    licencia: null,
    actualizarCupo: vi.fn(),
    refrescarCupo: vi.fn(async () => {}),
  }),
}));

vi.mock("../../lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(mensaje: string, status = 500) {
      super(mensaje);
      this.status = status;
    }
  },
  USER_KEY: "usuario",
  NEGOCIO_KEY: "negocio",
  api: {
    cajaActual: vi.fn(async () => ({
      caja: { id: 1, almacenId: 3, almacen: null, fechaApertura: "2026-11-15T12:00:00.000Z", montoApertura: 0 },
    })),
    getProductos: vi.fn(),
    getCategorias: vi.fn(async () => []),
    getFormasPago: vi.fn(async () => []),
    getRepartidores: vi.fn(async () => []),
    mesasPorCobrar: vi.fn(async () => []),
    entregasMesero: vi.fn(async () => null),
    crearVenta: vi.fn(),
    crearPedidoPlataforma: vi.fn(),
    estadoConteo: vi.fn(),
  },
}));

vi.mock("../../lib/apiMonedero", () => ({
  apiMonedero: { paquetesCreditos: vi.fn(), comprarCreditos: vi.fn(), compraCreditos: vi.fn() },
}));
vi.mock("../../lib/agenda/apiConfigAgenda", () => ({ apiConfigAgenda: { recursos: vi.fn(async () => []) } }));
vi.mock("../../lib/agenda/apiAgenda", () => ({
  apiAgenda: { hoy: vi.fn(async () => ({ citas: [] })), carrito: vi.fn() },
  mensajeDe: (_e: unknown, d: string) => d,
}));
vi.mock("./PantallaHistorial", () => ({ default: () => <p>ventas del turno</p> }));
vi.mock("./PantallaCierre", () => ({ default: () => <p>cierre de caja</p>, CierreOk: () => null }));
vi.mock("./PantallaCobro", () => ({ default: () => <p>cobro</p> }));
vi.mock("./PantallaRecibo", () => ({ default: () => <p>recibo</p> }));

// La venta: la cabecera (con los avisos y el diálogo) y los botones que el POS
// le pasa junto a «Cobrar».
vi.mock("./PantallaVenta", () => ({
  default: (props: {
    carrito: Carrito;
    cabecera?: ReactNode;
    plataformas?: { disponibles: string[]; onElegir: (p: string) => void };
    conteo?: { saldos: ReadonlyMap<number, number | null> };
  }) => (
    <div>
      {props.cabecera}
      <p>{props.carrito.unidades} en el carrito</p>
      {/* Los vasos L que le llegan a la venta con el conteo prendido (18-nov). */}
      {props.conteo && <p>quedan {props.conteo.saldos.get(30)} L</p>}
      {props.plataformas?.disponibles.map((p) => (
        <button key={p} onClick={() => props.plataformas!.onElegir(p)}>
          pedido {p}
        </button>
      ))}
    </div>
  ),
}));

import { ApiError, api } from "../../lib/api";
import { almacenEnMemoria } from "../../lib/offline/almacen";
import { cargarCola, hayPorSubir, hayRespuesta, usarAlmacenCola } from "../../lib/offline/cola";
import { usarAlmacenCopias } from "../../lib/offline/copias";
import { fijarVentaSinInternet } from "../../lib/offline/modo";
import Pos from "./Pos";

const ARROZ = {
  id: 5,
  nombre: "Arroz con leche L",
  precio: 35,
  tipoProducto: "ALMACENABLE",
  stockTotal: 10,
  habilitado: true,
  componentes: [],
} as unknown as Producto;

const PEDIDO = {
  id: 12,
  clienteRequestId: "uuid",
  plataforma: "YANGO",
  codigoExterno: "A-123",
  total: 70,
  detalles: [],
};

async function montar() {
  render(
    <MemoryRouter initialEntries={["/pos"]}>
      <Pos />
    </MemoryRouter>,
  );
  await act(async () => {});
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.features = ["pos", "caja", "pedidos_yango", "pedidos_pedidosya"];
  sesion.permisos = ["ventas.vender", "plataformas.registrar"];
  sesion.pos = null;
  sesion.conteo = null;
  sessionStorage.clear();
  sessionStorage.setItem("bamar.carrito.LOCAL", JSON.stringify([{ id: 5, cantidad: 2, enMesa: 0, nota: "" }]));
  vi.mocked(api.getProductos).mockResolvedValue([ARROZ]);
  vi.mocked(api.crearPedidoPlataforma).mockResolvedValue(PEDIDO as never);
});

describe("los botones de Yango y PedidosYa en el POS", () => {
  it("con las dos features y el permiso: un botón por plataforma", async () => {
    await montar();
    expect(screen.getByRole("button", { name: "pedido YANGO" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "pedido PEDIDOS_YA" })).toBeInTheDocument();
  });

  it("sólo los de las plataformas prendidas", async () => {
    sesion.features = ["pos", "caja", "pedidos_pedidosya"];
    await montar();
    expect(screen.queryByRole("button", { name: "pedido YANGO" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "pedido PEDIDOS_YA" })).toBeInTheDocument();
  });

  it("sin features en la sesión (lista vacía) NO falla abierto: no hay botones", async () => {
    sesion.features = [];
    await montar();
    expect(screen.queryByRole("button", { name: /pedido / })).not.toBeInTheDocument();
  });

  it("sin plataformas.registrar no hay botones, aunque la feature esté", async () => {
    sesion.permisos = ["ventas.vender"];
    await montar();
    expect(screen.queryByRole("button", { name: /pedido / })).not.toBeInTheDocument();
  });
});

describe("registrar el pedido", () => {
  async function abrir(plataforma = "YANGO") {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: `pedido ${plataforma}` }));
  }

  it("abre el diálogo con el carrito y dónde queda registrado", async () => {
    await abrir();
    expect(screen.getByRole("dialog", { name: "Pedido de Yango" })).toBeInTheDocument();
    expect(screen.getByText("Arroz con leche L")).toBeInTheDocument();
    expect(screen.getByText("Queda en el reporte de Yango.")).toBeInTheDocument();
  });

  it("en vivo: manda el pedido sin precio (lo pone el servidor), vacía el carrito y avisa", async () => {
    await abrir();
    fireEvent.change(screen.getByLabelText("N° de pedido de Yango (opcional)"), { target: { value: "A-123" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    });
    expect(api.crearPedidoPlataforma).toHaveBeenCalledTimes(1);
    const cuerpo = vi.mocked(api.crearPedidoPlataforma).mock.calls[0][0];
    expect(cuerpo).toMatchObject({
      plataforma: "YANGO",
      codigoExterno: "A-123",
      // La caja abierta del POS (§10.1): de ahí sale «Ventas del turno».
      cajaId: 1,
      detalles: [{ productoId: 5, cantidad: 2 }],
    });
    expect(cuerpo.clienteRequestId).toBeTruthy();
    expect(cuerpo.detalles[0]).not.toHaveProperty("precio");
    // No es una venta: no se cobra ni se crea nada en /ventas.
    expect(api.crearVenta).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Pedido de Yango registrado")).toBeInTheDocument();
    expect(screen.getByText("0 en el carrito")).toBeInTheDocument();
  });

  it("PedidosYa dice PedidosYa en el aviso y manda PEDIDOS_YA", async () => {
    await abrir("PEDIDOS_YA");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    });
    expect(vi.mocked(api.crearPedidoPlataforma).mock.calls[0][0]).toMatchObject({ plataforma: "PEDIDOS_YA" });
    expect(screen.getByText("Pedido de PedidosYa registrado")).toBeInTheDocument();
  });

  it("un 4xx del servidor se ve en el diálogo, el carrito sigue y el reintento usa la MISMA identidad", async () => {
    vi.mocked(api.crearPedidoPlataforma).mockRejectedValueOnce(
      new ApiError("Los pedidos de Yango no están activados para este negocio", 403),
    );
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    });
    expect(screen.getByText("Los pedidos de Yango no están activados para este negocio")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Pedido de Yango" })).toBeInTheDocument();
    expect(screen.getByText("2 en el carrito")).toBeInTheDocument();
    expect(hayPorSubir()).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    });
    const [primero, segundo] = vi.mocked(api.crearPedidoPlataforma).mock.calls;
    // Un 504 que sí grabó no se duplica: el reintento lleva el mismo clienteRequestId.
    expect(segundo[0].clienteRequestId).toBe(primero[0].clienteRequestId);
  });

  it("Volver no registra nada y deja el carrito como estaba", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.crearPedidoPlataforma).not.toHaveBeenCalled();
    expect(screen.getByText("2 en el carrito")).toBeInTheDocument();
  });
});

describe("el precio de la app (escrito a mano, 20-nov), el descuento y las observaciones", () => {
  const precioDelArroz = () => screen.getByLabelText("Precio de «Arroz con leche L» en Yango");
  const registrar = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    });
  };
  const GASEOSA = { ...ARROZ, id: 6, nombre: "Gaseosa", precio: 10 } as unknown as Producto;

  it("el diálogo abre con el precio vacío y, sin escribirlo, el cuerpo va sin precioApp (lo pone el servidor), con descuento y nota", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "pedido YANGO" }));
    expect(precioDelArroz()).toHaveValue("");
    expect(screen.getByText(/En el local: Bs.35,00/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Descuento (Bs)"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Observaciones (opcional)"), { target: { value: "sin canela" } });
    await registrar();
    const cuerpo = vi.mocked(api.crearPedidoPlataforma).mock.calls[0][0];
    expect(cuerpo).toMatchObject({
      plataforma: "YANGO",
      descuento: 5,
      observaciones: "sin canela",
      detalles: [{ productoId: 5, cantidad: 2 }],
    });
    expect(cuerpo.detalles[0]).not.toHaveProperty("precio");
    expect(cuerpo.detalles[0]).not.toHaveProperty("precioApp");
  });

  it("el cuerpo lleva precioApp sólo en los renglones donde el cajero lo escribió", async () => {
    vi.mocked(api.getProductos).mockResolvedValue([ARROZ, GASEOSA]);
    sessionStorage.setItem(
      "bamar.carrito.LOCAL",
      JSON.stringify([
        { id: 5, cantidad: 2, enMesa: 0, nota: "" },
        { id: 6, cantidad: 1, enMesa: 0, nota: "" },
      ]),
    );
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "pedido YANGO" }));
    fireEvent.change(precioDelArroz(), { target: { value: "40" } });
    // 2 × 40 en la app + la gaseosa al precio del local.
    expect(screen.getByText("Total").nextElementSibling!.textContent).toMatch(/Bs.90,00/);
    await registrar();
    const cuerpo = vi.mocked(api.crearPedidoPlataforma).mock.calls[0][0];
    expect(cuerpo.detalles).toEqual([
      { productoId: 5, cantidad: 2, precioApp: 40 },
      { productoId: 6, cantidad: 1 },
    ]);
  });

  it("nada se guarda para el próximo pedido: vuelve a abrir vacío, al precio del local", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "pedido YANGO" }));
    fireEvent.change(precioDelArroz(), { target: { value: "42" } });
    await registrar();
    expect(vi.mocked(api.crearPedidoPlataforma).mock.calls[0][0]).toMatchObject({
      detalles: [{ productoId: 5, precioApp: 42 }],
    });
    // Otro pedido del mismo producto, con el POS vuelto a abrir.
    cleanup();
    sessionStorage.setItem("bamar.carrito.LOCAL", JSON.stringify([{ id: 5, cantidad: 1, enMesa: 0, nota: "" }]));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "pedido YANGO" }));
    expect(precioDelArroz()).toHaveValue("");
    expect(screen.getByText("Total").nextElementSibling!.textContent).toMatch(/Bs.35,00/);
  });

  it("la huella del intento no cambia con el precio: el reintento tras un 4xx con otro precio es el mismo pedido", async () => {
    vi.mocked(api.crearPedidoPlataforma).mockRejectedValueOnce(new ApiError("Error del servidor", 400));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "pedido YANGO" }));
    await registrar();
    fireEvent.change(precioDelArroz(), { target: { value: "41" } });
    fireEvent.change(screen.getByLabelText("Descuento (Bs)"), { target: { value: "2" } });
    await registrar();
    const [primero, segundo] = vi.mocked(api.crearPedidoPlataforma).mock.calls;
    expect(segundo[0].clienteRequestId).toBe(primero[0].clienteRequestId);
    expect(segundo[0]).toMatchObject({ descuento: 2, detalles: [{ precioApp: 41 }] });
  });
});

describe("sin señal (la app instalada de la compu o del iPhone)", () => {
  beforeEach(() => {
    usarAlmacenCola(almacenEnMemoria());
    usarAlmacenCopias(almacenEnMemoria());
    localStorage.setItem("usuario", JSON.stringify({ id: 1, username: "caja" }));
    localStorage.setItem("negocio", JSON.stringify({ id: 1, nombre: "El Ganadero" }));
    fijarVentaSinInternet(true);
  });
  afterEach(() => {
    fijarVentaSinInternet(null);
    hayRespuesta();
    localStorage.clear();
  });

  it("se encola con los precios del equipo y se avisa que quedó guardado", async () => {
    vi.mocked(api.crearPedidoPlataforma).mockRejectedValue(new ApiError("Sin internet. Revisá la conexión del local.", 0));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "pedido YANGO" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    });
    expect(screen.getByText(/Pedido de Yango guardado sin internet/)).toBeInTheDocument();
    expect(screen.getByText("0 en el carrito")).toBeInTheDocument();
    expect(await cargarCola()).toHaveLength(0); // no es una venta
    expect(hayPorSubir()).toBe(true);
    // Y el aviso de arriba lo cuenta como algo que falta subir.
    expect(screen.getByText(/1 pedido de plataforma.*sin internet/)).toBeInTheDocument();
    // Sin precio escrito para la app, viaja el del local como siempre y nada más.
    const { usePedidosEncolados } = await import("../../lib/offline/cola");
    const { renderHook } = await import("@testing-library/react");
    const [p] = renderHook(() => usePedidosEncolados()).result.current;
    expect(p.resumen.total).toBe(70);
    expect(p.cuerpo.detalles).toEqual([{ productoId: 5, cantidad: 2, precio: 35 }]);
  });

  it("la cola guarda el precio de la app, el descuento y la nota, y lo pendiente dice el total del diálogo (19-nov)", async () => {
    sesion.pos = { imprimirPlataformas: true };
    window.print = vi.fn();
    vi.mocked(api.crearPedidoPlataforma).mockRejectedValue(new ApiError("Sin internet. Revisá la conexión del local.", 0));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "pedido YANGO" }));
    // 2 × Bs 40 en la app (en el local, 35) − Bs 3 de descuento = Bs 77.
    fireEvent.change(screen.getByLabelText("Precio de «Arroz con leche L» en Yango"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Descuento (Bs)"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Observaciones (opcional)"), { target: { value: "sin canela" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    });
    // El papel de la cola: con el precio de la app, el descuento y la nota.
    const ventana = screen.getByRole("dialog", { name: "Pedido de Yango guardado: sube solo cuando vuelva la señal" });
    const vista = within(ventana).getByLabelText("Vista del ticket").textContent!;
    const fila = (izq: string, monto: string) => izq + " ".repeat(32 - izq.length - monto.length) + monto;
    expect(vista).toContain(fila("2 x Arroz con leche L", "80.00"));
    expect(vista).toContain(fila("Descuento", "-3.00"));
    expect(vista).toContain(fila("TOTAL", "Bs 77.00"));
    expect(vista).toContain("Obs: sin canela");
    // Lo que falta subir: el total del diálogo, no el de los precios del local (70).
    expect(screen.getByText(/1 pedido de plataforma.*sin internet/).parentElement!.textContent).toMatch(/Bs.77,00/);
    const { usePedidosEncolados } = await import("../../lib/offline/cola");
    const { renderHook } = await import("@testing-library/react");
    const [p] = renderHook(() => usePedidosEncolados()).result.current;
    expect(p.resumen.total).toBe(77);
    expect(p.cuerpo).toMatchObject({
      descuento: 3,
      observaciones: "sin canela",
      encolado: true,
      detalles: [{ productoId: 5, cantidad: 2, precio: 35, precioApp: 40 }],
    });
  });

  it("con «Imprimir el pedido al registrarlo» prendido, el ticket sale igual, con lo que se cargó", async () => {
    sesion.pos = { imprimirPlataformas: true };
    window.print = vi.fn();
    vi.mocked(api.crearPedidoPlataforma).mockRejectedValue(new ApiError("Sin internet. Revisá la conexión del local.", 0));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "pedido YANGO" }));
    fireEvent.change(screen.getByLabelText("N° de pedido de Yango (opcional)"), { target: { value: "A-123" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    });
    const ventana = screen.getByRole("dialog", { name: "Pedido de Yango guardado: sube solo cuando vuelva la señal" });
    const vista = within(ventana).getByLabelText("Vista del ticket").textContent!;
    expect(vista).toContain("N° de la app: A-123");
    const fila = (izq: string, monto: string) => izq + " ".repeat(32 - izq.length - monto.length) + monto;
    expect(vista).toContain(fila("2 x Arroz con leche L", "70.00"));
    expect(vista).toContain("Atendió: caja");
    expect(vista).toContain(fila("TOTAL", "Bs 70.00"));
    expect(hayPorSubir()).toBe(true);
    // Sin el aviso de siempre: la ventana ya lo dice.
    expect(screen.queryByText(/guardado sin internet/)).not.toBeInTheDocument();
  });
});

describe("«Imprimir el pedido al registrarlo» (delivery full, 18-nov)", () => {
  beforeEach(() => {
    window.print = vi.fn();
  });

  async function registrar() {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "pedido YANGO" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    });
  }

  it("apagado (lo de fábrica): el aviso de siempre, sin ventana ni papel", async () => {
    await registrar();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Pedido de Yango registrado")).toBeInTheDocument();
    expect(window.print).not.toHaveBeenCalled();
  });

  it("prendido: abre la vista del ticket con «Imprimir» y «Listo»", async () => {
    sesion.pos = { imprimirPlataformas: true };
    await registrar();
    const ventana = screen.getByRole("dialog", { name: "Pedido de Yango registrado" });
    const vista = within(ventana).getByLabelText("Vista del ticket").textContent!;
    expect(vista).toContain("PEDIDO YANGO");
    expect(vista).toContain("N° de la app: A-123");
    expect(vista).toContain("2 unidades");
    expect(screen.getByText("0 en el carrito")).toBeInTheDocument();
    // «Imprimir» abre el diálogo de impresión con el mismo texto, en negrita.
    fireEvent.click(within(ventana).getByRole("button", { name: "Imprimir" }));
    expect(window.print).toHaveBeenCalledTimes(1);
    const papel = document.getElementById("area-impresion")!;
    expect(papel).toHaveClass("papel-negrita");
    expect(papel.textContent).toBe(vista);
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    // «Listo» cierra y el POS queda como siempre.
    fireEvent.click(within(ventana).getByRole("button", { name: "Listo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.getElementById("area-impresion")).toBeNull();
  });
});

describe("conteo por categoría (vasos por tamaño, 18-nov): el pedido de plataforma también gasta vasos", () => {
  // El arroz con leche se prepara al vender: no lleva stock, sólo gasta su vaso L.
  const ARROZ_L = { ...ARROZ, tipoProducto: "SERVICIO", stockTotal: 0, categoria: { id: 30, nombre: "L" } } as unknown as Producto;
  const estado = (quedan: number) => ({
    activo: true,
    nombre: "Vasos",
    sucursalId: 3,
    items: [{ categoriaId: 30, nombre: "L", contado: 100, contadoEn: 0, repuesto: 0, vendido: 100 - quedan, quedan }],
  });

  beforeEach(() => {
    sesion.conteo = { activo: true, nombre: "Vasos", categorias: [{ id: 30, nombre: "L" }] };
    vi.mocked(api.getProductos).mockResolvedValue([ARROZ_L]);
    vi.mocked(api.estadoConteo).mockResolvedValue(estado(40) as never);
  });

  async function registrar() {
    fireEvent.click(screen.getByRole("button", { name: "pedido YANGO" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    });
    await act(async () => {});
  }

  it("registrado en vivo, se vuelve a pedir el saldo del local", async () => {
    await montar();
    expect(screen.getByText("quedan 40 L")).toBeInTheDocument();
    vi.mocked(api.estadoConteo).mockClear();
    await registrar();
    expect(screen.getByText("Pedido de Yango registrado")).toBeInTheDocument();
    expect(api.estadoConteo).toHaveBeenCalledTimes(1);
  });

  it("si el servidor lo rechaza, el diálogo muestra el texto y el saldo se vuelve a pedir igual", async () => {
    vi.mocked(api.crearPedidoPlataforma).mockRejectedValueOnce(
      new ApiError("Vasos L: no quedan. Avisale al encargado para que reponga.", 400),
    );
    await montar();
    vi.mocked(api.estadoConteo).mockClear();
    await registrar();
    expect(screen.getByText("Vasos L: no quedan. Avisale al encargado para que reponga.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Pedido de Yango" })).toBeInTheDocument();
    expect(api.estadoConteo).toHaveBeenCalledTimes(1);
  });

  describe("sin señal (la app instalada)", () => {
    beforeEach(() => {
      usarAlmacenCola(almacenEnMemoria());
      usarAlmacenCopias(almacenEnMemoria());
      localStorage.setItem("usuario", JSON.stringify({ id: 1, username: "caja" }));
      localStorage.setItem("negocio", JSON.stringify({ id: 1, nombre: "Prueba" }));
      fijarVentaSinInternet(true);
    });
    afterEach(() => {
      fijarVentaSinInternet(null);
      hayRespuesta();
      localStorage.clear();
    });

    it("el pedido que queda en la cola baja los vasos acá, sin preguntarle al servidor (todavía no lo conoce)", async () => {
      vi.mocked(api.crearPedidoPlataforma).mockRejectedValue(
        new ApiError("Sin internet. Revisá la conexión del local.", 0),
      );
      await montar();
      expect(screen.getByText("quedan 40 L")).toBeInTheDocument();
      vi.mocked(api.estadoConteo).mockClear();
      await registrar();
      expect(screen.getByText(/Pedido de Yango guardado sin internet/)).toBeInTheDocument();
      expect(hayPorSubir()).toBe(true);
      expect(screen.getByText("quedan 38 L")).toBeInTheDocument();
      expect(api.estadoConteo).not.toHaveBeenCalled();
    });
  });
});
