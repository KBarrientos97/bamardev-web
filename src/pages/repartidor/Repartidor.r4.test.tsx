import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Venta } from "../../types";

/**
 * Lo que el backend final cambió (20-nov):
 * - R4: cobrar en efectivo sin ninguna caja abierta da 409 SIN_CAJA_ABIERTA.
 *   Se dice claro en la hoja de cobro y el pedido sigue pendiente.
 * - `cobroLaCaja`: un pedido que cerró la caja no es plata del repartidor.
 * - `ubicacionOrigen`: quién marcó el pin.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 129, nombre: "Pedro Rojas", username: "pedro" },
    negocio: { nombre: "Negocio de prueba", features: [] },
  }),
}));

vi.mock("../pagina/MapaSeguimiento", () => ({ default: () => <div data-testid="mapa-entrega" /> }));

vi.mock("../../lib/api", () => ({
  api: {
    getMisEntregas: vi.fn(),
    getFormasPago: vi.fn(),
    getVenta: vi.fn(),
    entregarPedido: vi.fn(),
    noEntregado: vi.fn(),
    rendicionReparto: vi.fn(),
  },
}));

vi.mock("../../lib/pedidosWeb/apiPrivada", () => ({
  apiPedidosWeb: { sali: vi.fn(), posicion: vi.fn() },
}));

import { api } from "../../lib/api";
import Repartidor from "./Repartidor";

const PEDIDO = {
  id: 31,
  comprobante: "V-000031",
  estado: "APROBADO",
  fecha: "2026-11-20T18:00:00.000Z",
  total: 50,
  totalACobrar: 57,
  tarifaEnvio: 7,
  montoRendicion: 50,
  prepagado: false,
  tipoPedido: "DELIVERY",
  estadoEntrega: "PENDIENTE",
  clienteNombre: "Carla Mamani",
  clienteDireccion: "Calle Sucre 450",
  clienteTelefono: "70000000",
  minutosEstimados: null,
  notaPedido: null,
  entregadoEn: null,
  formasPago: [],
  pagos: [],
  detalles: [],
  repartidor: { id: 129, nombre: "Pedro Rojas" },
  pedidoWeb: null,
} as unknown as Venta;

const SIN_CAJA = "No hay ninguna caja abierta en el local para recibir este efectivo: pedí que abran una y volvé a marcarlo entregado. El pedido sigue pendiente.";

async function abrirCobro(v: Venta = PEDIDO) {
  vi.mocked(api.getMisEntregas).mockResolvedValue([v]);
  vi.mocked(api.getVenta).mockResolvedValue(v);
  render(<Repartidor />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: /Carla Mamani/ }));
  await act(async () => {});
  const d = screen.getByRole("dialog", { name: "Carla Mamani" });
  fireEvent.click(within(d).getByRole("button", { name: /^Cobrar Bs/ }));
  return screen.getByRole("dialog", { name: "Cobrar la entrega" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getFormasPago).mockResolvedValue([
    { id: 10, nombre: "Efectivo" },
    { id: 11, nombre: "QR" },
  ] as never);
  vi.mocked(api.rendicionReparto).mockRejectedValue(new Error("Not Found"));
});

describe("R4: sin caja abierta para recibir el efectivo", () => {
  it("lo dice en la hoja de cobro, no como un error cualquiera, y el pedido sigue pendiente", async () => {
    vi.mocked(api.entregarPedido).mockRejectedValue(
      Object.assign(new Error(SIN_CAJA), { status: 409, codigo: "SIN_CAJA_ABIERTA" }),
    );
    const cobro = await abrirCobro();
    fireEvent.change(within(cobro).getByLabelText("Efectivo recibido"), { target: { value: "60" } });
    await act(async () => {
      fireEvent.click(within(cobro).getByRole("button", { name: "Cobrar y entregar" }));
    });
    const alerta = within(cobro).getByRole("alert");
    expect(alerta).toHaveTextContent("No hay ninguna caja abierta");
    expect(alerta).toHaveTextContent("El pedido sigue pendiente.");
    // No se recargó como entregado: la hoja sigue abierta para volver a intentarlo.
    expect(api.getMisEntregas).toHaveBeenCalledTimes(1);
    expect(within(cobro).getByRole("button", { name: "Cobrar y entregar" })).toBeEnabled();
  });

  it("otro rechazo al cobrar también se ve en la hoja (antes quedaba tapado, en el detalle)", async () => {
    vi.mocked(api.entregarPedido).mockRejectedValue(
      Object.assign(new Error("Este pedido está en espera: la caja tiene que decidir"), { status: 400 }),
    );
    const cobro = await abrirCobro();
    fireEvent.change(within(cobro).getByLabelText("Efectivo recibido"), { target: { value: "60" } });
    await act(async () => {
      fireEvent.click(within(cobro).getByRole("button", { name: "Cobrar y entregar" }));
    });
    expect(within(cobro).getByText("Este pedido está en espera: la caja tiene que decidir")).toBeInTheDocument();
    expect(within(cobro).queryByText("No hay ninguna caja abierta")).not.toBeInTheDocument();
  });
});

describe("cobroLaCaja y ubicacionOrigen", () => {
  it("un pedido que cerró la caja dice «la cobró la caja» en la rendición y en «Mi día»", async () => {
    const deLaCaja = { ...PEDIDO, estadoEntrega: "ENTREGADO", entregadoEn: "2026-11-20T19:00:00.000Z", montoRendicion: 0, cobroLaCaja: true } as unknown as Venta;
    vi.mocked(api.getMisEntregas).mockResolvedValue([deLaCaja]);
    render(<Repartidor />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Rendición" }));
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Rendición del turno" })).toHaveTextContent("la cobró la caja");
    fireEvent.click(within(screen.getByRole("dialog", { name: "Rendición del turno" })).getByRole("button", { name: "Entendido" }));
    fireEvent.click(screen.getByTitle("Ver mi día"));
    expect(screen.getByRole("dialog", { name: "Mi día" })).toHaveTextContent("La cobró la caja");
  });

  it("debajo del mapa dice quién marcó el pin", async () => {
    const conPin = { ...PEDIDO, latitud: -17.78, longitud: -63.18, ubicacionOrigen: "CAJA" } as unknown as Venta;
    vi.mocked(api.getMisEntregas).mockResolvedValue([conPin]);
    vi.mocked(api.getVenta).mockResolvedValue(conPin);
    render(<Repartidor />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Carla Mamani/ }));
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Carla Mamani" })).toHaveTextContent("Ubicación marcada por la caja.");
  });
});
