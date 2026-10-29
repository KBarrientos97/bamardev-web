import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Venta } from "../../types";

/**
 * El cobro de la entrega del repartidor: qué se graba como "recibido" (REP-02,
 * 28-oct).
 *
 * El backend guarda de cambio `recibido − monto`, y el recibo de la venta
 * (Reportes › Ventas) lo muestra. El monto es sólo lo de los productos; el
 * envío lo cobra y se lo queda el repartidor. Mandar como recibido lo que el
 * cliente dio en mano, con el envío adentro, dejaba el envío grabado como
 * vuelto. La app ya restaba la tarifa antes de mandar (`CobroEntregaFragment`).
 */

const sesion = vi.hoisted(() => ({ features: ["pago_qr_mixto"] as string[] }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 9, nombre: "Rodrigo", username: "rodrigo" },
    negocio: { nombre: "Pollos Omar", features: sesion.features },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getMisEntregas: vi.fn(),
    getFormasPago: vi.fn(),
    getVenta: vi.fn(),
    entregarPedido: vi.fn(),
    cancelarPedido: vi.fn(),
  },
}));

// El QR del negocio se baja del servidor: acá basta con el botón de "llegó".
vi.mock("../../components/QrCobro", () => ({
  QrParaCobrar: ({ onConfirmar, monto }: { onConfirmar: () => void; monto?: string }) => (
    <button onClick={onConfirmar}>Llegó el QR de {monto}</button>
  ),
}));

import { api } from "../../lib/api";
import Repartidor from "./Repartidor";

const FORMAS = [
  { id: 10, nombre: "Efectivo" },
  { id: 11, nombre: "QR" },
];

/** Bs 42 de productos y Bs 8 de envío: el repartidor le pide Bs 50 al cliente. */
const PEDIDO = {
  id: 31,
  comprobante: "V-000031",
  estado: "APROBADO",
  fecha: "2026-10-28T20:00:00.000Z",
  total: 42,
  totalACobrar: 50,
  tarifaEnvio: 8,
  montoRendicion: 42,
  prepagado: false,
  tipoPedido: "DELIVERY",
  estadoEntrega: "PENDIENTE",
  clienteNombre: "Juan Pérez",
  clienteDireccion: "Av. Blanco Galindo km 4",
  clienteTelefono: "70490686",
  minutosEstimados: null,
  notaPedido: null,
  entregadoEn: null,
  detalles: [{ productoId: 1, producto: "Brasa cuarto", cantidad: 1, precio: 42, subtotal: 42, nota: null, consumo: "LLEVAR" }],
} as Venta;

async function abrirCobro(pedido: Venta = PEDIDO) {
  vi.mocked(api.getMisEntregas).mockResolvedValue([pedido]);
  vi.mocked(api.getVenta).mockResolvedValue(pedido);
  render(<Repartidor />);
  fireEvent.click(await screen.findByRole("button", { name: /Juan Pérez/ }));
  const detalle = screen.getByRole("dialog", { name: "Juan Pérez" });
  // El detalle completo llega del servidor.
  await act(async () => {});
  fireEvent.click(within(detalle).getByRole("button", { name: /^Cobrar Bs/ }));
  return screen.getByRole("dialog", { name: "Cobrar la entrega" });
}

async function cobrarYEntregar(dialogo: HTMLElement) {
  await act(async () => {
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cobrar y entregar" }));
  });
}

beforeEach(() => {
  vi.mocked(api.getMisEntregas).mockReset();
  vi.mocked(api.getVenta).mockReset();
  vi.mocked(api.getFormasPago).mockReset().mockResolvedValue(FORMAS);
  vi.mocked(api.entregarPedido).mockReset().mockResolvedValue({ ...PEDIDO, estadoEntrega: "ENTREGADO" });
});

describe("REP-02: lo que se graba como recibido no lleva el envío del repartidor", () => {
  it("un pedido con envío pagado justo no deja cambio", async () => {
    // El bug: se mandaba recibido 50 con monto 42, y el recibo decía
    // "Cambio Bs 8,00" cuando el cliente pagó justo (los 8 son el envío).
    const dialogo = await abrirCobro();
    fireEvent.change(within(dialogo).getByLabelText("Efectivo recibido"), { target: { value: "50" } });
    expect(dialogo).toHaveTextContent(/Cambio: Bs.0,00/);
    await cobrarYEntregar(dialogo);
    expect(api.entregarPedido).toHaveBeenCalledWith(31, [{ formaPagoId: 10, monto: 42, recibido: 42 }]);
  });

  it("con un billete grande, lo grabado como cambio es el vuelto que se le dio", async () => {
    const dialogo = await abrirCobro();
    fireEvent.change(within(dialogo).getByLabelText("Efectivo recibido"), { target: { value: "100" } });
    expect(dialogo).toHaveTextContent(/Cambio: Bs.50,00/);
    await cobrarYEntregar(dialogo);
    // 92 − 42 = 50: lo mismo que vio el repartidor. Como la app: 100 − 8 de envío.
    expect(api.entregarPedido).toHaveBeenCalledWith(31, [{ formaPagoId: 10, monto: 42, recibido: 92 }]);
  });

  it("en un mixto, el efectivo tampoco graba el envío como cambio", async () => {
    // QR 20: quedan 22 de productos y 8 de envío en efectivo (30). Paga con 50.
    const dialogo = await abrirCobro();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Mixto" }));
    fireEvent.change(within(dialogo).getByLabelText("Pagado por QR"), { target: { value: "20" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Llegó el QR de Bs.20,00$/ }));
    fireEvent.change(within(dialogo).getByLabelText("Efectivo recibido"), { target: { value: "50" } });
    expect(dialogo).toHaveTextContent(/Cambio: Bs.20,00/);
    await cobrarYEntregar(dialogo);
    // Se grababa recibido 50: 28 de cambio, con los 8 del envío adentro.
    expect(api.entregarPedido).toHaveBeenCalledWith(31, [
      { formaPagoId: 11, monto: 20 },
      { formaPagoId: 10, monto: 22, recibido: 42 },
    ]);
  });

  it("sin envío, lo recibido es lo que dio el cliente, como siempre", async () => {
    const dialogo = await abrirCobro({ ...PEDIDO, totalACobrar: 42, tarifaEnvio: 0 });
    fireEvent.change(within(dialogo).getByLabelText("Efectivo recibido"), { target: { value: "50" } });
    await cobrarYEntregar(dialogo);
    expect(api.entregarPedido).toHaveBeenCalledWith(31, [{ formaPagoId: 10, monto: 42, recibido: 50 }]);
  });
});
