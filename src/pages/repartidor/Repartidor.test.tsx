import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Venta } from "../../types";

/**
 * Mis entregas del repartidor, con la regla de plata del reparto: la tarifa
 * de envío la cobra y se la queda él (no entra a la caja ni a su rendición), y
 * lo cobrado por QR va a la cuenta del negocio, así que no es plata que tenga
 * que entregar. Lo del vuelto grabado (REP-02) está en `Repartidor.cambio.test`.
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

// El QR del negocio se baja del servidor: acá basta con el botón de "llegó",
// que dice el monto que se le pide al cliente.
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

/** Bs 50 de productos y Bs 8 de envío: el repartidor le pide Bs 58 al cliente. */
const PEDIDO = {
  id: 31,
  comprobante: "V-000031",
  estado: "APROBADO",
  fecha: "2026-10-29T20:00:00.000Z",
  total: 50,
  totalACobrar: 58,
  tarifaEnvio: 8,
  montoRendicion: 50,
  prepagado: false,
  tipoPedido: "DELIVERY",
  estadoEntrega: "PENDIENTE",
  clienteNombre: "Juan Pérez",
  clienteDireccion: "Av. Blanco Galindo km 4",
  clienteTelefono: "70490686",
  minutosEstimados: null,
  notaPedido: null,
  entregadoEn: null,
  formasPago: [],
  pagos: [],
  detalles: [
    { productoId: 1, producto: "Brasa cuarto", cantidad: 1, precio: 50, subtotal: 50, nota: null, consumo: "LLEVAR" },
  ],
} as Venta;

/** Ya entregado: Bs 100 de productos cobrados con 60 por QR y 40 en efectivo, más Bs 8 de envío. */
const ENTREGADO_MIXTO = {
  ...PEDIDO,
  id: 40,
  comprobante: "V-000040",
  clienteNombre: "Ana Rojas",
  total: 100,
  totalACobrar: 108,
  montoRendicion: 100,
  estadoEntrega: "ENTREGADO",
  entregadoEn: "2026-10-29T20:30:00.000Z",
  formasPago: ["QR", "Efectivo"],
  pagos: [
    { formaPagoId: 11, formaPago: "QR", monto: 60 },
    { formaPagoId: 10, formaPago: "Efectivo", monto: 40 },
  ],
} as Venta;

async function montar(lista: Venta[]) {
  vi.mocked(api.getMisEntregas).mockResolvedValue(lista);
  render(<Repartidor />);
  await act(async () => {});
}

async function abrirDetalle(pedido: Venta = PEDIDO) {
  vi.mocked(api.getVenta).mockResolvedValue(pedido);
  await montar([pedido]);
  if (pedido.estadoEntrega === "ENTREGADO") fireEvent.click(screen.getByRole("button", { name: "Entregadas" }));
  fireEvent.click(screen.getByRole("button", { name: new RegExp(pedido.clienteNombre ?? "") }));
  // El detalle completo llega del servidor.
  await act(async () => {});
  return screen.getByRole("dialog", { name: pedido.clienteNombre ?? "" });
}

async function abrirCobro(pedido: Venta = PEDIDO) {
  const detalle = await abrirDetalle(pedido);
  fireEvent.click(within(detalle).getByRole("button", { name: /^Cobrar Bs/ }));
  return screen.getByRole("dialog", { name: "Cobrar la entrega" });
}

async function cobrarYEntregar(dialogo: HTMLElement) {
  await act(async () => {
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cobrar y entregar" }));
  });
}

function pagarMixto(dialogo: HTMLElement, qr: string, efectivo: string) {
  fireEvent.click(within(dialogo).getByRole("button", { name: "Mixto" }));
  fireEvent.change(within(dialogo).getByLabelText("Pagado por QR"), { target: { value: qr } });
  fireEvent.click(within(dialogo).getByRole("button", { name: /^Llegó el QR de/ }));
  fireEvent.change(within(dialogo).getByLabelText("Efectivo recibido"), { target: { value: efectivo } });
}

beforeEach(() => {
  vi.mocked(api.getMisEntregas).mockReset();
  vi.mocked(api.getVenta).mockReset();
  vi.mocked(api.getFormasPago).mockReset().mockResolvedValue(FORMAS);
  vi.mocked(api.entregarPedido).mockReset().mockResolvedValue({ ...PEDIDO, estadoEntrega: "ENTREGADO" });
});

describe("DEL-2 y BUG-pedidos-3: la rendición pide sólo el efectivo, repartido con los montos reales", () => {
  it("un mixto de 60 por QR y 40 en efectivo: se entregan Bs 40 y los 60 ya están en el banco", async () => {
    // Antes: "A entregar al negocio Bs 100" (con el QR) y, por mirar el
    // nombre, "Efectivo en mano Bs 0 · Ya cobrado por QR Bs 100" a un
    // repartidor con Bs 40 en el bolsillo.
    await montar([ENTREGADO_MIXTO]);
    // El KPI de la lista sumaba lo mismo que el número grande.
    expect(screen.getByText("A rendir").closest(".card")).toHaveTextContent(/A rendir\s*Bs.40,00\s*en efectivo/);

    fireEvent.click(screen.getByRole("button", { name: "Rendición" }));
    const rendicion = screen.getByRole("dialog", { name: "Rendición del turno" });
    expect(within(rendicion).getByText("A entregar al negocio").parentElement).toHaveTextContent(
      /A entregar al negocio\s*Bs.40,00\s*en efectivo/,
    );
    expect(rendicion).toHaveTextContent(/Efectivo en mano\s*Bs.40,00/);
    expect(rendicion).toHaveTextContent(/Ya cobrado por QR\s*Bs.60,00/);
    expect(rendicion).toHaveTextContent(/ya está en la cuenta del negocio: no lo entregás/);
    // El renglón del pedido dice cómo se cobró, con los montos de cada parte.
    expect(rendicion).toHaveTextContent(/QR Bs.60,00 \+ efectivo Bs.40,00/);
    // Las tarifas siguen siendo del repartidor.
    expect(rendicion).toHaveTextContent(/Las tarifas de envío \(Bs.8,00\) son tuyas/);
  });

  it("sin los montos (un backend anterior) el renglón dice las formas y el mixto cuenta como efectivo, como la app", async () => {
    await montar([{ ...ENTREGADO_MIXTO, pagos: undefined }]);
    fireEvent.click(screen.getByRole("button", { name: "Rendición" }));
    const rendicion = screen.getByRole("dialog", { name: "Rendición del turno" });
    expect(rendicion).toHaveTextContent(/A entregar al negocio\s*Bs.100,00/);
    expect(rendicion).toHaveTextContent(/· QR \+ Efectivo/);
  });

  it("todo en efectivo: se entrega todo y no hay desglose de QR", async () => {
    await montar([
      { ...ENTREGADO_MIXTO, formasPago: ["Efectivo"], pagos: [{ formaPagoId: 10, formaPago: "Efectivo", monto: 100 }] },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Rendición" }));
    const rendicion = screen.getByRole("dialog", { name: "Rendición del turno" });
    expect(rendicion).toHaveTextContent(/A entregar al negocio\s*Bs.100,00/);
    expect(rendicion).not.toHaveTextContent(/Ya cobrado por QR/);
  });
});

describe("BUG-pedidos-10: la tarjeta dice qué es cada número", () => {
  it("el monto a cobrar ya trae el envío: no se lo vuelve a sumar abajo", async () => {
    // Decía "Bs 58,00" y debajo "+Bs 8,00 envío": se leía 58 + 8.
    const prepagado = { ...PEDIDO, id: 32, clienteNombre: "Ana Rojas", prepagado: true, totalACobrar: 8, montoRendicion: 0 };
    await montar([PEDIDO, prepagado as Venta]);
    const tarjeta = screen.getByRole("button", { name: /Juan Pérez/ });
    expect(tarjeta).toHaveTextContent(/A cobrar\s*Bs.58,00\s*incluye Bs.8,00 de envío/);
    expect(tarjeta).not.toHaveTextContent(/\+\s*Bs/);
    // Pagado en caja, lo que se cobra en la puerta es sólo el envío (se leía 8 + 8).
    expect(screen.getByRole("button", { name: /Ana Rojas/ })).toHaveTextContent(/A cobrar\s*Bs.8,00\s*es tu envío/);
  });

  it("una entregada dice lo que se cobró", async () => {
    await montar([ENTREGADO_MIXTO]);
    fireEvent.click(screen.getByRole("button", { name: "Entregadas" }));
    expect(screen.getByRole("button", { name: /Ana Rojas/ })).toHaveTextContent(/Cobrado\s*Bs.108,00/);
  });
});

describe("DEL-3: por QR va sólo lo del negocio", () => {
  it("el QR pide lo de los productos, y el desglose dice de quién es cada parte", async () => {
    // Pedía por QR los Bs 58 con envío y registraba 50: la tarifa del
    // repartidor terminaba en el banco del negocio sin que nada lo dijera.
    const dialogo = await abrirCobro();
    expect(dialogo).toHaveTextContent(/Cobrale al cliente\s*Bs.58,00/);
    expect(dialogo).toHaveTextContent(/Bs.50,00 van al negocio · Bs.8,00 es tu tarifa/);
    fireEvent.click(within(dialogo).getByRole("button", { name: "QR" }));
    expect(dialogo).toHaveTextContent(/Tu tarifa \(Bs.8,00\) cobrala aparte, en efectivo/);
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Llegó el QR de Bs.50,00$/ }));
    await cobrarYEntregar(dialogo);
    expect(api.entregarPedido).toHaveBeenCalledWith(31, [{ formaPagoId: 11, monto: 50 }]);
  });

  it("sin envío no hay desglose ni aviso de tarifa", async () => {
    const dialogo = await abrirCobro({ ...PEDIDO, totalACobrar: 50, tarifaEnvio: 0 });
    expect(dialogo).not.toHaveTextContent(/es tu tarifa/);
    fireEvent.click(within(dialogo).getByRole("button", { name: "QR" }));
    expect(dialogo).not.toHaveTextContent(/Tu tarifa/);
    expect(within(dialogo).getByRole("button", { name: /^Llegó el QR de Bs.50,00$/ })).toBeInTheDocument();
  });
});

describe("BUG-pedidos-2: el mixto del repartidor no rebota en el servidor", () => {
  it("los Bs 50 por QR y el envío en efectivo: se manda sólo el QR", async () => {
    // El caso más común del reparto. Se mandaba también un pago en efectivo
    // de Bs 0 y el backend lo rechazaba: "El monto del pago debe ser mayor a 0".
    const dialogo = await abrirCobro();
    pagarMixto(dialogo, "50", "10");
    expect(dialogo).toHaveTextContent(/En efectivo: Bs.8,00, con tu tarifa/);
    expect(dialogo).toHaveTextContent(/Cambio: Bs.2,00/);
    await cobrarYEntregar(dialogo);
    expect(api.entregarPedido).toHaveBeenCalledWith(31, [{ formaPagoId: 11, monto: 50 }]);
  });

  it("un QR que se lleva parte del envío no se manda: avisa hasta cuánto va por QR", async () => {
    // Con 55 por QR la suma pasaba el total del pedido (50) y el backend
    // respondía "El cobro (X) debe sumar el total del pedido".
    const dialogo = await abrirCobro();
    pagarMixto(dialogo, "55", "3");
    await cobrarYEntregar(dialogo);
    expect(api.entregarPedido).not.toHaveBeenCalled();
    expect(dialogo).toHaveTextContent(
      /Por QR va sólo lo del negocio: hasta Bs.50,00. Tu tarifa \(Bs.8,00\) cobrala en efectivo./,
    );
  });

  it("un QR por parte de lo del negocio sigue partiendo en QR y efectivo", async () => {
    const dialogo = await abrirCobro();
    pagarMixto(dialogo, "30", "28");
    expect(dialogo).toHaveTextContent(/En efectivo: Bs.28,00, con tu tarifa/);
    await cobrarYEntregar(dialogo);
    expect(api.entregarPedido).toHaveBeenCalledWith(31, [
      { formaPagoId: 11, monto: 30 },
      { formaPagoId: 10, monto: 20, recibido: 20 },
    ]);
  });

  it("sin envío, un QR por todo en mixto pide el método QR, como siempre", async () => {
    const dialogo = await abrirCobro({ ...PEDIDO, totalACobrar: 50, tarifaEnvio: 0 });
    pagarMixto(dialogo, "50", "0");
    await cobrarYEntregar(dialogo);
    expect(api.entregarPedido).not.toHaveBeenCalled();
    expect(dialogo).toHaveTextContent("Si el QR cubre todo, cobrá con el método QR.");
  });
});

describe("BUG-pedidos-12: Llamar y WhatsApp con el teléfono armado como en el resto de la web", () => {
  it("un número guardado con el 591 llama con el +", async () => {
    // Quedaba `tel:59170490686`, sin el "+": no es un número que se pueda marcar.
    const detalle = await abrirDetalle({ ...PEDIDO, clienteTelefono: "+591 70490686" });
    expect(within(detalle).getByRole("link", { name: /Llamar/ })).toHaveAttribute("href", "tel:+59170490686");
    expect(within(detalle).getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toMatch(
      /^https:\/\/wa\.me\/59170490686\?text=/,
    );
  });

  it("un celular de 8 dígitos lleva el código del país", async () => {
    const detalle = await abrirDetalle({ ...PEDIDO, clienteTelefono: "704 90686" });
    expect(within(detalle).getByRole("link", { name: /Llamar/ })).toHaveAttribute("href", "tel:+59170490686");
  });

  it("una entrega ya hecha abre el chat sin el aviso de llegada", async () => {
    const detalle = await abrirDetalle({ ...ENTREGADO_MIXTO, clienteTelefono: "70490686" });
    expect(within(detalle).getByRole("link", { name: /WhatsApp/ })).toHaveAttribute(
      "href",
      "https://wa.me/59170490686",
    );
  });

  it("sin teléfono no hay a quién llamar", async () => {
    const detalle = await abrirDetalle({ ...PEDIDO, clienteTelefono: null });
    expect(within(detalle).queryByRole("link", { name: /Llamar/ })).not.toBeInTheDocument();
    expect(within(detalle).queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
  });
});
