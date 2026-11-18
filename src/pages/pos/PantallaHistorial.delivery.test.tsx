import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja, Venta } from "../../types";

/**
 * La cajera cobra un delivery propio pendiente (18-nov, CONTRATO-delivery-full
 * §9): el repartidor volvió con la plata. Sólo quien maneja el reparto
 * (`delivery.asignar`), por lo del pedido sin el envío, con el mismo diálogo y
 * el mismo `POST /ventas/:id/entregar` que «Recoger». Y la dirección que puede
 * venir vacía (un pedido de la página que sólo marcó el pin) no deja un
 * renglón roto.
 */

const sesion = vi.hoisted(() => ({
  permisos: ["ventas.vender", "ventas.historial", "caja.operar", "delivery.asignar"] as string[],
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: "RESTAURANTE",
    negocio: { features: ["pos", "caja", "delivery", "recoger", "pago_qr_mixto"] },
    usuario: { rol: "CAJERO", permisos: sesion.permisos },
    puede: () => false,
    incluye: () => true,
    cupo: null,
    refrescarCupo: async () => {},
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getVentas: vi.fn(),
    getVenta: vi.fn(),
    getPedidosPendientes: vi.fn(),
    getCreditos: vi.fn(),
    getResumenCreditos: vi.fn(),
    getFormasPago: vi.fn(),
    entregarPedido: vi.fn(),
    anularVenta: vi.fn(),
  },
}));

vi.mock("../../components/QrCobro", () => ({
  QrParaCobrar: ({ onConfirmar, monto }: { onConfirmar: () => void; monto?: string }) => (
    <button onClick={onConfirmar}>Llegó el QR de {monto}</button>
  ),
}));

import { api } from "../../lib/api";
import PantallaHistorial from "./PantallaHistorial";

/** Bs 242 del pedido y Bs 7 de envío: el cliente pagó 249 al repartidor, que trae 242. */
const DELIVERY = {
  id: 900,
  comprobante: "V-000900",
  estado: "APROBADO",
  fecha: "2026-11-18T00:41:00.000Z",
  total: 242,
  totalACobrar: 249,
  tarifaEnvio: 7,
  items: 3,
  detalles: [],
  pagos: [],
  formasPago: [],
  tipoPedido: "DELIVERY",
  estadoEntrega: "PENDIENTE",
  prepagado: false,
  clienteNombre: "Carla Mamani",
  clienteDireccion: "Calle Sucre 450",
  clienteTelefono: null,
  minutosEstimados: null,
  notaPedido: null,
  entregadoEn: null,
  repartidor: { id: 129, nombre: "Pedro Rojas" },
  entregaExterna: null,
  pedidoWeb: null,
} as unknown as Venta;

function montar() {
  render(
    <MemoryRouter>
      <PantallaHistorial caja={{ id: 1 } as Caja} onAtras={() => {}} onCierre={() => {}} onVerComprobante={() => {}} />
    </MemoryRouter>,
  );
}

const fila = async (nombre: string) => (await screen.findByText(nombre)).closest("li") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  sesion.permisos = ["ventas.vender", "ventas.historial", "caja.operar", "delivery.asignar"];
  vi.mocked(api.getVentas).mockResolvedValue([]);
  vi.mocked(api.getCreditos).mockResolvedValue([]);
  vi.mocked(api.getResumenCreditos).mockResolvedValue(null as never);
  vi.mocked(api.getFormasPago).mockResolvedValue([
    { id: 10, nombre: "Efectivo" },
    { id: 11, nombre: "QR" },
  ]);
  vi.mocked(api.getVenta).mockImplementation(async (id: number) => ({ ...DELIVERY, id }) as Venta);
  vi.mocked(api.entregarPedido).mockResolvedValue({ ...DELIVERY, estadoEntrega: "ENTREGADO" } as Venta);
});

describe("«Cobrar y entregar» un delivery propio desde la caja", () => {
  it("cobra lo del pedido, sin el envío, y dice de quién es el envío", async () => {
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([DELIVERY]);
    montar();
    fireEvent.click(within(await fila("Carla Mamani")).getByRole("button", { name: "Cobrar y entregar" }));
    const dialogo = screen.getByRole("dialog", { name: "Cobrar y entregar" });
    await act(async () => {});
    expect(dialogo).toHaveTextContent(/Total del pedido\s*Bs 242,00/);
    expect(dialogo).toHaveTextContent("El envío (Bs 7,00) es del repartidor: no entra a la caja.");
    // El atajo del monto justo es lo del pedido, no los 249 que pagó el cliente.
    expect(within(dialogo).queryByRole("button", { name: "Bs 249,00" })).not.toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Bs 242,00" }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Cobrar y entregar" }));
    });
    expect(api.entregarPedido).toHaveBeenCalledWith(900, [{ formaPagoId: 10, monto: 242, recibido: 242 }]);
    // Entregado: la lista de pendientes y la del turno se vuelven a pedir.
    expect(api.getPedidosPendientes).toHaveBeenCalledTimes(2);
  });

  it("el «paga con» del cliente de la página no se precarga: eso se lo pagó al repartidor", async () => {
    const web = {
      ...DELIVERY,
      pedidoWeb: { id: 3, numero: 7, latitud: -17.7, longitud: -63.1, referencia: null, formaPago: "EFECTIVO", pagaCon: 300, salioEn: null },
    } as Venta;
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([web]);
    montar();
    fireEvent.click(within(await fila("Carla Mamani")).getByRole("button", { name: "Cobrar y entregar" }));
    await act(async () => {});
    expect(within(screen.getByRole("dialog", { name: "Cobrar y entregar" })).getByLabelText("Efectivo recibido")).toHaveValue("");
  });

  it("prepagado: «Marcar entregado», sin pagos ni la nota del envío", async () => {
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([{ ...DELIVERY, prepagado: true } as Venta]);
    montar();
    fireEvent.click(within(await fila("Carla Mamani")).getByRole("button", { name: "Marcar entregado" }));
    const dialogo = screen.getByRole("dialog", { name: "Marcar entregado" });
    expect(dialogo).toHaveTextContent("Este pedido ya se cobró al tomarlo. Confirmá que llegó al cliente.");
    expect(dialogo).not.toHaveTextContent(/es del repartidor/);
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar entregado" }));
    });
    expect(api.entregarPedido).toHaveBeenCalledWith(900, undefined);
  });

  it("también desde el detalle del pedido", async () => {
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([DELIVERY]);
    montar();
    fireEvent.click(await fila("Carla Mamani"));
    await act(async () => {});
    const detalle = screen.getByRole("dialog", { name: "V-000900" });
    fireEvent.click(within(detalle).getByRole("button", { name: "Cobrar y entregar" }));
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Cobrar y entregar" })).toHaveTextContent("El envío (Bs 7,00) es del repartidor");
  });

  it("sin `delivery.asignar` (quien sólo vende) no se ofrece: lo cierra el repartidor", async () => {
    sesion.permisos = ["ventas.vender", "ventas.historial", "caja.operar"];
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([DELIVERY]);
    montar();
    const f = await fila("Carla Mamani");
    expect(within(f).queryByRole("button", { name: "Cobrar y entregar" })).not.toBeInTheDocument();
    fireEvent.click(f);
    await act(async () => {});
    expect(within(screen.getByRole("dialog", { name: "V-000900" })).queryByRole("button", { name: "Cobrar y entregar" })).not.toBeInTheDocument();
  });

  it("el de un servicio externo no se cobra acá (avanza desde Pedidos web)", async () => {
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([{ ...DELIVERY, repartidor: null, entregaExterna: "Yango" } as Venta]);
    montar();
    const f = await fila("Carla Mamani");
    expect(within(f).queryByRole("button", { name: "Cobrar y entregar" })).not.toBeInTheDocument();
  });

  it("un recojo sigue igual: «Entregar» si ya se pagó, sin la nota del envío", async () => {
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([
      { ...DELIVERY, id: 901, tipoPedido: "RECOGER", prepagado: true, clienteNombre: "Ana Vargas", tarifaEnvio: 0 } as Venta,
    ]);
    montar();
    fireEvent.click(within(await fila("Ana Vargas")).getByRole("button", { name: "Entregar" }));
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Entregar pedido" })).toHaveTextContent("Confirmá que el cliente lo retiró.");
  });
});

describe("QA 18-nov: el renglón del pendiente no se corta con «…»", () => {
  it("la dirección y el repartidor bajan de renglón y el botón va abajo, a lo ancho", async () => {
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([
      { ...DELIVERY, clienteDireccion: "Calle Jordán 120 entre Antezana y Baptista, edificio azul" } as Venta,
    ]);
    montar();
    const f = await fila("Carla Mamani");
    expect(within(f).getByText("Calle Jordán 120 entre Antezana y Baptista, edificio azul · Pedro Rojas")).not.toHaveClass("truncate");
    expect(f.querySelectorAll(".truncate")).toHaveLength(0);
    // El botón ya no comparte la columna del monto: va debajo de todo el renglón.
    expect(within(f).getByRole("button", { name: "Cobrar y entregar" }).parentElement).toBe(f);
  });
});

describe("la dirección que puede venir vacía", () => {
  it("un pedido de la página sin dirección dice «Ubicación marcada en el mapa», sin « · » colgando", async () => {
    const sinDir = {
      ...DELIVERY,
      clienteDireccion: null,
      pedidoWeb: { id: 3, numero: 7, latitud: -17.7, longitud: -63.1, referencia: null, formaPago: "QR", pagaCon: null, salioEn: null },
    } as Venta;
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([sinDir]);
    montar();
    const f = await fila("Carla Mamani");
    expect(within(f).getByText("Ubicación marcada en el mapa · Pedro Rojas")).toBeInTheDocument();
  });

  it("un delivery sin dirección ni repartidor no deja el renglón en blanco", async () => {
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([{ ...DELIVERY, clienteDireccion: "  ", repartidor: null } as Venta]);
    montar();
    const f = await fila("Carla Mamani");
    expect(within(f).getByText("Sin dirección")).toBeInTheDocument();
  });
});
