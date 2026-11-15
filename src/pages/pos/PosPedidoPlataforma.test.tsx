import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { id: 1, nombre: "El Ganadero", features: sesion.features },
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
  }) => (
    <div>
      {props.cabecera}
      <p>{props.carrito.unidades} en el carrito</p>
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

  it("abre el diálogo con el carrito y el aviso de que no se cobra", async () => {
    await abrir();
    expect(screen.getByRole("dialog", { name: "Pedido de Yango" })).toBeInTheDocument();
    expect(screen.getByText("Arroz con leche L")).toBeInTheDocument();
    expect(screen.getByText("No se cobra ni entra a la caja. Queda en el reporte de Yango.")).toBeInTheDocument();
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
  });
});
