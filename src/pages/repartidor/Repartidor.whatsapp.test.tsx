import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Venta } from "../../types";

/**
 * El WhatsApp del repartidor en un pedido de la página (QA R2, M1).
 *
 * `GET /ventas/:id` (el detalle) NO trae `pedidoWeb`; la lista de entregas sí.
 * El mensaje se armaba con el detalle, perdía la marca «viene de la página» y
 * un pedido que ni había salido decía «ya llegó a tu ubicación».
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 9, nombre: "Pedro", username: "pedro" },
    negocio: { nombre: "El Ganadero", features: [], tipoNegocio: "RESTAURANTE", variante: "POSTRES" },
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

vi.mock("../../lib/pedidosWeb/apiPrivada", () => ({
  apiPedidosWeb: { sali: vi.fn(), posicion: vi.fn() },
}));

import { api } from "../../lib/api";
import { apiPedidosWeb } from "../../lib/pedidosWeb/apiPrivada";
import Repartidor from "./Repartidor";

const WEB = { id: 12, numero: 7, latitud: -17.76, longitud: -63.18, referencia: null, formaPago: "EFECTIVO", pagaCon: 200, salioEn: null };

const DE_LA_LISTA = {
  id: 31,
  comprobante: "V-000031",
  estado: "APROBADO",
  fecha: "2026-11-13T20:00:00.000Z",
  total: 100,
  totalACobrar: 109,
  tarifaEnvio: 9,
  montoRendicion: 100,
  prepagado: false,
  tipoPedido: "DELIVERY",
  estadoEntrega: "PENDIENTE",
  clienteNombre: "Lucía",
  clienteDireccion: "Calle Los Tajibos 23",
  clienteTelefono: "71234567",
  minutosEstimados: null,
  notaPedido: null,
  entregadoEn: null,
  formasPago: [],
  pagos: [],
  detalles: [{ productoId: 1, producto: "Arroz con leche grande", cantidad: 2, precio: 50, subtotal: 100, nota: null, consumo: "LLEVAR" }],
  repartidor: { id: 9, nombre: "Pedro" },
  pedidoWeb: WEB,
} as Venta;

// Lo que devuelve `GET /ventas/:id`: lo mismo, sin `pedidoWeb`.
const DEL_DETALLE = { ...DE_LA_LISTA, pedidoWeb: undefined } as unknown as Venta;

async function abrir(lista: Venta) {
  vi.mocked(api.getMisEntregas).mockResolvedValue([lista]);
  vi.mocked(api.getVenta).mockResolvedValue(DEL_DETALLE);
  render(<Repartidor />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: /Lucía/ }));
  await act(async () => {});
  return screen.getByRole("dialog", { name: "Lucía" });
}

/** El texto que llevaría el chat de WhatsApp del botón. */
function mensajeDelBoton(detalle: HTMLElement): string {
  const href = within(detalle).getByRole("link", { name: /WhatsApp/ }).getAttribute("href") ?? "";
  return decodeURIComponent(href.split("?text=")[1] ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getFormasPago).mockResolvedValue([{ id: 10, nombre: "Efectivo" }] as never);
  vi.mocked(apiPedidosWeb.sali).mockResolvedValue({});
  vi.mocked(apiPedidosWeb.posicion).mockResolvedValue({});
  Object.defineProperty(navigator, "geolocation", { value: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() }, configurable: true });
});

describe("el WhatsApp del repartidor en un pedido de la página (QA R2, M1)", () => {
  it("antes de «Ya salí»: «está por salir», nunca «ya llegó»", async () => {
    const detalle = await abrir(DE_LA_LISTA);
    const t = mensajeDelBoton(detalle);
    expect(t).toContain("🍮 El Ganadero 👋");
    expect(t).toContain("¡Tu pedido ya está por salir hacia tu ubicación!");
    expect(t).not.toMatch(/ya llegó/);
  });

  it("si la lista ya trae que salió: «va en camino»", async () => {
    const detalle = await abrir({ ...DE_LA_LISTA, pedidoWeb: { ...WEB, salioEn: "2026-11-13T20:10:00.000Z" } } as Venta);
    const t = mensajeDelBoton(detalle);
    expect(t).toContain("¡Tu pedido ya va en camino hacia tu ubicación!");
    expect(t).not.toMatch(/ya llegó/);
  });

  it("al tocar «Ya salí» el mensaje pasa de «por salir» a «en camino» sin esperar a la lista", async () => {
    const detalle = await abrir(DE_LA_LISTA);
    expect(mensajeDelBoton(detalle)).toContain("por salir");
    await act(async () => {
      fireEvent.click(within(detalle).getByRole("button", { name: "Ya salí del local" }));
    });
    expect(mensajeDelBoton(detalle)).toContain("va en camino");
  });

  it("un delivery cargado a mano (sin pedido de la página) conserva «ya llegó»: lo escribe el repartidor en la puerta", async () => {
    const detalle = await abrir({ ...DE_LA_LISTA, pedidoWeb: null } as Venta);
    expect(mensajeDelBoton(detalle)).toContain("ya llegó a tu ubicación");
  });
});
