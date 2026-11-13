import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Venta } from "../../types";

/**
 * Las entregas que vienen de un pedido web (13-nov): navegar al pin con Google
 * Maps o Waze, copiar la dirección, «Ya salí del local» y mandar la posición
 * con la pantalla abierta, como máximo cada 15 s.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 9, nombre: "Pedro", username: "pedro" },
    negocio: { nombre: "El Ganadero", features: [] },
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
import { CADA_POSICION_MS } from "../../lib/pedidosWeb/usePosicionRepartidor";
import Repartidor from "./Repartidor";

const ENTREGA_WEB = {
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
  pedidoWeb: { id: 12, numero: 7, latitud: -17.76, longitud: -63.18, referencia: "Portón negro", formaPago: "EFECTIVO", pagaCon: 200, salioEn: null },
} as Venta;

const SIN_WEB = { ...ENTREGA_WEB, id: 32, clienteNombre: "Juan", pedidoWeb: null } as Venta;

async function abrir(v: Venta, lista: Venta[] = [v]) {
  vi.mocked(api.getMisEntregas).mockResolvedValue(lista);
  vi.mocked(api.getVenta).mockResolvedValue(v);
  render(<Repartidor />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: new RegExp(v.clienteNombre ?? "") }));
  await act(async () => {});
  return screen.getByRole("dialog", { name: v.clienteNombre ?? "" });
}

type Posicion = (p: GeolocationPosition) => void;
let alPosicion: Posicion | null = null;
const watchPosition = vi.fn((ok: Posicion) => {
  alPosicion = ok;
  return 77;
});
const clearWatch = vi.fn();
const pos = (lat: number, lng: number): GeolocationPosition =>
  ({ coords: { latitude: lat, longitude: lng, accuracy: 8 }, timestamp: Date.now() }) as GeolocationPosition;

beforeEach(() => {
  vi.clearAllMocks();
  alPosicion = null;
  vi.mocked(api.getFormasPago).mockResolvedValue([{ id: 10, nombre: "Efectivo" }] as never);
  vi.mocked(apiPedidosWeb.sali).mockResolvedValue({});
  vi.mocked(apiPedidosWeb.posicion).mockResolvedValue({});
  Object.defineProperty(navigator, "geolocation", { value: { watchPosition, clearWatch }, configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("los botones del repartidor en un pedido de la página", () => {
  it("Google Maps y Waze van al pin; copiar guarda la dirección", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const detalle = await abrir(ENTREGA_WEB);
    const maps = within(detalle).getByRole("link", { name: /Ir con Google Maps/ });
    expect(maps).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=-17.76,-63.18");
    expect(within(detalle).getByRole("link", { name: /Abrir en Waze/ })).toHaveAttribute("href", "https://waze.com/ul?ll=-17.76,-63.18&navigate=yes");
    expect(detalle).toHaveTextContent("Portón negro");
    expect(detalle).toHaveTextContent(/paga con efectivo \(trae Bs.200,00\)/);
    await act(async () => {
      fireEvent.click(within(detalle).getByRole("button", { name: /Copiar dirección/ }));
    });
    expect(writeText).toHaveBeenCalledWith("Calle Los Tajibos 23");
    expect(within(detalle).getByRole("button", { name: /Dirección copiada/ })).toBeInTheDocument();
  });

  it("«Ya salí del local» avisa al servidor con la venta y recarga la lista", async () => {
    const detalle = await abrir(ENTREGA_WEB);
    const llamadasLista = vi.mocked(api.getMisEntregas).mock.calls.length;
    await act(async () => {
      fireEvent.click(within(detalle).getByRole("button", { name: "Ya salí del local" }));
    });
    expect(apiPedidosWeb.sali).toHaveBeenCalledWith(31);
    expect(within(detalle).queryByRole("button", { name: "Ya salí del local" })).not.toBeInTheDocument();
    expect(detalle).toHaveTextContent(/el cliente ve dónde vas/);
    expect(vi.mocked(api.getMisEntregas).mock.calls.length).toBeGreaterThan(llamadasLista);
  });

  it("si «Ya salí» falla, lo dice y deja reintentar", async () => {
    vi.mocked(apiPedidosWeb.sali).mockRejectedValue(new Error("Esta entrega no es tuya"));
    const detalle = await abrir(ENTREGA_WEB);
    await act(async () => {
      fireEvent.click(within(detalle).getByRole("button", { name: "Ya salí del local" }));
    });
    expect(within(detalle).getByText("Esta entrega no es tuya")).toBeInTheDocument();
    expect(within(detalle).getByRole("button", { name: "Ya salí del local" })).toBeEnabled();
  });

  it("una entrega que no vino de la página no suma nada de esto", async () => {
    const detalle = await abrir(SIN_WEB);
    expect(within(detalle).queryByRole("button", { name: "Ya salí del local" })).not.toBeInTheDocument();
    expect(within(detalle).queryByRole("link", { name: /Waze/ })).not.toBeInTheDocument();
  });
});

describe("compartir la posición con el cliente", () => {
  const SALIO = { ...ENTREGA_WEB, pedidoWeb: { ...ENTREGA_WEB.pedidoWeb!, salioEn: "2026-11-13T20:10:00.000Z" } } as Venta;

  it("sin ningún pedido en camino no pide la ubicación", async () => {
    await abrir(ENTREGA_WEB);
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("una entrega en camino de OTRO repartidor no activa la ubicación (quien también asigna ve todas) (PW-16)", async () => {
    const AJENA = { ...SALIO, repartidor: { id: 5, nombre: "Mario" } } as Venta;
    vi.mocked(api.getMisEntregas).mockResolvedValue([AJENA]);
    render(<Repartidor />);
    await act(async () => {});
    expect(watchPosition).not.toHaveBeenCalled();
    expect(screen.queryByText("Compartiendo tu ubicación con el cliente")).not.toBeInTheDocument();
  });

  it("con uno en camino avisa «Compartiendo tu ubicación» y manda la posición cada 15 s como máximo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T20:11:00.000Z"));
    vi.mocked(api.getMisEntregas).mockResolvedValue([SALIO]);
    render(<Repartidor />);
    await act(async () => {});
    expect(screen.getByText("Compartiendo tu ubicación con el cliente")).toBeInTheDocument();
    expect(watchPosition).toHaveBeenCalledTimes(1);

    act(() => alPosicion!(pos(-17.755, -63.178)));
    expect(apiPedidosWeb.posicion).toHaveBeenCalledTimes(1);
    expect(apiPedidosWeb.posicion).toHaveBeenCalledWith(31, -17.755, -63.178, 8);

    // Una posición a los 5 s no se manda: el tope es 15 s.
    vi.setSystemTime(new Date("2026-11-13T20:11:05.000Z"));
    act(() => alPosicion!(pos(-17.756, -63.178)));
    expect(apiPedidosWeb.posicion).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(new Date("2026-11-13T20:11:00.000Z").getTime() + CADA_POSICION_MS));
    act(() => alPosicion!(pos(-17.757, -63.179)));
    expect(apiPedidosWeb.posicion).toHaveBeenCalledTimes(2);
    expect(apiPedidosWeb.posicion).toHaveBeenLastCalledWith(31, -17.757, -63.179, 8);
  });

  it("al cerrar la pantalla deja de seguir al repartidor", async () => {
    vi.mocked(api.getMisEntregas).mockResolvedValue([SALIO]);
    const { unmount } = render(<Repartidor />);
    await act(async () => {});
    unmount();
    expect(clearWatch).toHaveBeenCalledWith(77);
  });

  it("si el navegador niega el permiso, lo dice", async () => {
    watchPosition.mockImplementationOnce(((_ok: Posicion, mal?: (e: GeolocationPositionError) => void) => {
      mal?.({ code: 1 } as GeolocationPositionError);
      return 1;
    }) as never);
    vi.mocked(api.getMisEntregas).mockResolvedValue([SALIO]);
    render(<Repartidor />);
    await act(async () => {});
    expect(screen.getByText(/Activá el permiso de ubicación/)).toBeInTheDocument();
  });
});

describe("la tarjeta de la lista en un celular chico (sesion 2)", () => {
  it("«Cobra al entregar» va en su propio renglón y no se mete debajo del monto", async () => {
    vi.mocked(api.getMisEntregas).mockResolvedValue([ENTREGA_WEB]);
    render(<Repartidor />);
    await act(async () => {});
    const tarjeta = screen.getByRole("button", { name: /Lucía/ });
    const insignia = within(tarjeta).getByText("Cobra al entregar");
    const monto = within(tarjeta).getByText("A cobrar");
    // En 360 px la insignia (que no se parte) no entra en la columna del medio: si compartiera
    // renglón con el monto, lo pisaba. Tienen que estar en renglones distintos de la tarjeta.
    const renglon = (el: HTMLElement) => Array.from(tarjeta.children).find((c) => c.contains(el));
    expect(renglon(insignia)).not.toBe(renglon(monto));
  });
});
