import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";
import type { Carrito } from "./useCarrito";

/**
 * El POS con un pedido para delivery: el formulario de entrega es el de
 * verdad; la venta, el cobro y el recibo, de mentira. Lo que se prueba es lo
 * que decide el propio POS al ir y volver entre el formulario y el cobro
 * (BUG-pedidos-9), qué pasa cuando el servidor rechaza el pedido contra
 * entrega (BUG-pedidos-1) y cuánto dice que se cobra al entregar un pedido
 * cargado sin señal (BUG-cobro-5).
 */

const sesion = vi.hoisted(() => ({
  features: ["pos", "caja", "delivery", "fiado"] as string[],
}));

vi.mock("../../store/AuthContext", async () => {
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      negocio: { id: 1, nombre: "Pollos Omar", features: sesion.features },
      usuario: { id: 1, username: "caja", rol: "CAJERO", ...permisosDe("CAJERO") },
      rubro: "RESTAURANTE",
      incluye: () => true,
      puede: () => false,
      cupo: undefined,
      licencia: null,
      actualizarCupo: vi.fn(),
      refrescarCupo: vi.fn(async () => {}),
    }),
  };
});

vi.mock("../../lib/api", () => ({
  // Con `status`: la cola sin señal reconoce el corte de red por el 0.
  ApiError: class ApiError extends Error {
    status: number;
    constructor(mensaje: string, status = 500) {
      super(mensaje);
      this.status = status;
    }
  },
  // De dónde la cola y las copias sin señal leen la sesión.
  USER_KEY: "usuario",
  NEGOCIO_KEY: "negocio",
  api: {
    cajaActual: vi.fn(async () => ({
      caja: {
        id: 1,
        almacenId: 1,
        almacen: null,
        fechaApertura: "2026-10-29T12:00:00.000Z",
        montoApertura: 0,
      },
    })),
    getProductos: vi.fn(),
    getCategorias: vi.fn(async () => []),
    getFormasPago: vi.fn(async () => []),
    getRepartidores: vi.fn(async () => [{ id: 3, nombre: "Rodrigo", zona: null }]),
    mesasPorCobrar: vi.fn(async () => []),
    entregasMesero: vi.fn(async () => null),
    crearVenta: vi.fn(),
  },
}));

vi.mock("../../lib/apiMonedero", () => ({
  apiMonedero: { paquetesCreditos: vi.fn(), comprarCreditos: vi.fn(), compraCreditos: vi.fn() },
}));

vi.mock("../../lib/agenda/apiConfigAgenda", () => ({
  apiConfigAgenda: { recursos: vi.fn(async () => []) },
}));

vi.mock("../../lib/agenda/apiAgenda", () => ({
  apiAgenda: { hoy: vi.fn(async () => ({ citas: [] })), carrito: vi.fn() },
  mensajeDe: (_e: unknown, d: string) => d,
}));

vi.mock("./PantallaHistorial", () => ({ default: () => <p>ventas del turno</p> }));
vi.mock("./PantallaCierre", () => ({ default: () => <p>cierre de caja</p>, CierreOk: () => null }));

// La venta: el encabezado (con Delivery) y el botón de cobrar.
vi.mock("./PantallaVenta", () => ({
  default: (props: { carrito: Carrito; onCobrar: () => void; cabecera?: ReactNode }) => (
    <div>
      {props.cabecera}
      <p>{props.carrito.unidades} en el carrito</p>
      <button onClick={props.onCobrar}>ir a cobrar</button>
    </div>
  ),
}));

// El cobro: dice lo que le llega del pedido (el aviso del envío y si ofrece
// fiar) y deja volver.
vi.mock("./PantallaCobro", () => ({
  default: (props: { total: number; avisoEnvio?: string; onCredito?: unknown; onAtras: () => void }) => (
    <div>
      <p>cobro de {props.total}</p>
      <p>aviso: {props.avisoEnvio ?? "ninguno"}</p>
      <p>{props.onCredito ? "se puede fiar" : "no se puede fiar"}</p>
      <button onClick={props.onAtras}>volver del cobro</button>
    </div>
  ),
}));

vi.mock("./PantallaRecibo", () => ({ default: () => <p>recibo</p> }));

import { ApiError, api } from "../../lib/api";
import { almacenEnMemoria } from "../../lib/offline/almacen";
import { hayRespuesta, usarAlmacenCola } from "../../lib/offline/cola";
import { usarAlmacenCopias } from "../../lib/offline/copias";
import { fijarVentaSinInternet } from "../../lib/offline/modo";
import Pos from "./Pos";

/** Un elaborado (no lleva stock): dos en el carrito, Bs 50. */
const BRASA = {
  id: 1,
  nombre: "Brasa cuarto",
  precio: 25,
  tipoProducto: "SERVICIO",
  stockTotal: 0,
  habilitado: true,
  componentes: [],
} as unknown as Producto;

async function montar() {
  render(
    <MemoryRouter initialEntries={["/pos"]}>
      <Pos />
    </MemoryRouter>,
  );
  await act(async () => {});
  await act(async () => {});
}

function cargarDelivery() {
  fireEvent.click(screen.getByRole("button", { name: "Delivery" }));
  fireEvent.change(screen.getByLabelText("Nombre del cliente"), { target: { value: "Lucía Fernández" } });
  fireEvent.change(screen.getByLabelText("Dirección de entrega"), { target: { value: "Calle Jordán 123" } });
  fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "70490686" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  // El carrito sobrevive en la sesión del navegador: así arranca con dos.
  sessionStorage.setItem("bamar.carrito.LOCAL", JSON.stringify([{ id: 1, cantidad: 2, enMesa: 0, nota: "" }]));
  vi.mocked(api.getProductos).mockResolvedValue([BRASA]);
});

describe("BUG-pedidos-1: si el servidor rechaza el pedido contra entrega, se ve por qué", () => {
  it("el mensaje del servidor aparece en el formulario, y se puede volver a intentar", async () => {
    // El error se guardaba en el POS, pero el formulario no lo dibujaba: el
    // botón volvía a estar activo sin ningún mensaje y el pedido no existía.
    vi.mocked(api.crearVenta).mockRejectedValue(
      new Error('Stock insuficiente de "Brasa cuarto" (disponible 1, requiere 2)'),
    );
    await montar();
    cargarDelivery();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cobra el repartidor al entregar" }));
    });
    expect(api.crearVenta).toHaveBeenCalledWith(expect.objectContaining({ tipoPedido: "DELIVERY", prepagado: false }));
    expect(screen.getByText('Stock insuficiente de "Brasa cuarto" (disponible 1, requiere 2)')).toBeInTheDocument();
    // Sigue en el formulario, con lo cargado, listo para corregir.
    expect(screen.getByLabelText("Nombre del cliente")).toHaveValue("Lucía Fernández");
    expect(screen.getByRole("button", { name: "Cobra el repartidor al entregar" })).toBeEnabled();
  });

  it("el rechazo no se arrastra al cobro en caja, que es otro intento", async () => {
    vi.mocked(api.crearVenta).mockRejectedValue(new Error("El repartidor no existe o está inactivo"));
    await montar();
    cargarDelivery();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cobra el repartidor al entregar" }));
    });
    expect(screen.getByText("El repartidor no existe o está inactivo")).toBeInTheDocument();
    // Otro intento, cobrando en caja: el mensaje de antes no corresponde.
    fireEvent.click(screen.getByRole("button", { name: /Cobrar ahora en caja/ }));
    expect(screen.getByText("cobro de 50")).toBeInTheDocument();
    expect(screen.queryByText("El repartidor no existe o está inactivo")).not.toBeInTheDocument();
  });
});

describe("BUG-pedidos-9: ir y volver entre el formulario de entrega y el cobro", () => {
  it("volver del cobro trae el formulario con lo que se había cargado", async () => {
    await montar();
    cargarDelivery();
    fireEvent.click(screen.getByRole("button", { name: /Cobrar ahora en caja/ }));
    expect(screen.getByText(/aviso: El envío \(Bs.8,00\) lo cobra el repartidor aparte/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "volver del cobro" }));
    // Volvía vacío: había que tipear todo de nuevo con el cliente esperando.
    expect(screen.getByLabelText("Nombre del cliente")).toHaveValue("Lucía Fernández");
    expect(screen.getByLabelText("Dirección de entrega")).toHaveValue("Calle Jordán 123");
    expect(screen.getByLabelText("Teléfono")).toHaveValue("70490686");
  });

  it("salir del formulario no deja el pedido colgado en la venta de mostrador que sigue", async () => {
    await montar();
    cargarDelivery();
    fireEvent.click(screen.getByRole("button", { name: /Cobrar ahora en caja/ }));
    fireEvent.click(screen.getByRole("button", { name: "volver del cobro" }));
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));

    // La venta de mostrador: el cobro decía "El envío (Bs 8) lo cobra el
    // repartidor aparte" y no ofrecía fiar, con datos de un pedido que ya no era.
    fireEvent.click(screen.getByRole("button", { name: "ir a cobrar" }));
    expect(screen.getByText("aviso: ninguno")).toBeInTheDocument();
    expect(screen.getByText("se puede fiar")).toBeInTheDocument();

    // Y su "atrás" vuelve a la venta, no al formulario de recoger.
    fireEvent.click(screen.getByRole("button", { name: "volver del cobro" }));
    expect(screen.getByRole("button", { name: "ir a cobrar" })).toBeInTheDocument();
    expect(screen.queryByText("Datos del pedido")).not.toBeInTheDocument();
  });

  it("abrir otra vez Delivery después de salir arranca vacío", async () => {
    await montar();
    cargarDelivery();
    fireEvent.click(screen.getByRole("button", { name: /Cobrar ahora en caja/ }));
    fireEvent.click(screen.getByRole("button", { name: "volver del cobro" }));
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    fireEvent.click(screen.getByRole("button", { name: "Delivery" }));
    expect(screen.getByLabelText("Nombre del cliente")).toHaveValue("");
  });
});

describe("BUG-cobro-5: el pedido contra entrega cargado sin señal (app del iPhone)", () => {
  beforeEach(() => {
    usarAlmacenCola(almacenEnMemoria());
    usarAlmacenCopias(almacenEnMemoria());
    localStorage.setItem("usuario", JSON.stringify({ id: 1, username: "caja" }));
    localStorage.setItem("negocio", JSON.stringify({ id: 1, nombre: "Pollos Omar" }));
    fijarVentaSinInternet(true);
  });

  afterEach(() => {
    fijarVentaSinInternet(null);
    hayRespuesta();
    localStorage.clear();
  });

  it("«A cobrar al entregar» suma el envío, igual que con señal", async () => {
    // El ticket local dejó de sumar la tarifa a `total` (como el servidor) y no
    // traía `totalACobrar`: la pantalla decía "A cobrar al entregar Bs 50"
    // justo debajo de "Envío Bs 8", y la cajera leía un cobro sin la tarifa.
    vi.mocked(api.crearVenta).mockRejectedValue(new ApiError("Sin internet. Revisá la conexión del local.", 0));
    await montar();
    cargarDelivery();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cobra el repartidor al entregar" }));
    });
    expect(await screen.findByText("Pedido registrado")).toBeInTheDocument();
    // Es el ticket local, el de la cola: todavía sin número.
    expect(screen.getByText("PENDIENTE")).toBeInTheDocument();
    const fila = (etiqueta: string) => screen.getByText(etiqueta, { selector: "dt" }).parentElement!;
    expect(fila("Envío")).toHaveTextContent(/Bs.8,00/);
    expect(fila("A cobrar al entregar")).toHaveTextContent(/Bs.58,00/);
  });
});
