import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Venta } from "../../types";

/**
 * «Cómo llegar» en el detalle de cada entrega (20-nov, AUDITORIA-REPARTIDOR
 * §2.2 A): con pin, el mapa con el destino y Google Maps / Waze a ese punto;
 * sin pin, buscar la dirección escrita y decir que no hay ubicación marcada.
 * Ver su propia posición no salta con el permiso: se pide al tocar.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 129, nombre: "Pedro Rojas", username: "pedro" },
    negocio: { nombre: "Negocio de prueba", features: [] },
  }),
}));

// MapLibre no corre en jsdom: el mapa es un marcador con lo que recibe.
vi.mock("../pagina/MapaSeguimiento", () => ({
  default: ({ destino, moto }: { destino: { latitud: number; longitud: number } | null; moto: { latitud: number; longitud: number } | null }) => (
    <div data-testid="mapa-entrega">
      {destino ? `${destino.latitud},${destino.longitud}` : "sin destino"}
      {moto ? ` · yo ${moto.latitud},${moto.longitud}` : ""}
    </div>
  ),
}));

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

/** Un delivery de la caja con el pin que marcó la cajera. */
const CON_PIN = {
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
  latitud: -17.7834,
  longitud: -63.1821,
  precisionM: null,
} as unknown as Venta;

const SIN_PIN = { ...CON_PIN, latitud: null, longitud: null } as unknown as Venta;

const watchPosition = vi.fn((ok: (p: { coords: { latitude: number; longitude: number } }) => void) => {
  ok({ coords: { latitude: -17.79, longitude: -63.19 } });
  return 1;
});

async function abrir(v: Venta, delDetalle: Partial<Venta> = {}) {
  vi.mocked(api.getMisEntregas).mockResolvedValue([v]);
  // El detalle completo (`GET /ventas/:id`) puede no traer el pin: vale el de la lista.
  vi.mocked(api.getVenta).mockResolvedValue({ ...v, latitud: undefined, longitud: undefined, ...delDetalle } as Venta);
  render(<Repartidor />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: /Carla Mamani/ }));
  await act(async () => {});
  return screen.getByRole("dialog", { name: "Carla Mamani" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getFormasPago).mockResolvedValue([]);
  vi.mocked(api.rendicionReparto).mockRejectedValue(new Error("Not Found"));
  Object.defineProperty(navigator, "geolocation", { value: { watchPosition, clearWatch: vi.fn() }, configurable: true });
});

afterEach(() => {
  Object.defineProperty(navigator, "permissions", { value: undefined, configurable: true });
});

describe("con pin", () => {
  it("el mapa con el destino y los botones a ese punto", async () => {
    const d = await abrir(CON_PIN);
    const llegar = within(d).getByRole("region", { name: "Cómo llegar" });
    expect(await within(llegar).findByTestId("mapa-entrega")).toHaveTextContent("-17.7834,-63.1821");
    expect(within(llegar).getByRole("link", { name: /Ir con Google Maps/ })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=-17.7834,-63.1821",
    );
    expect(within(llegar).getByRole("link", { name: /Abrir en Waze/ })).toHaveAttribute(
      "href",
      "https://waze.com/ul?ll=-17.7834,-63.1821&navigate=yes",
    );
    expect(llegar).not.toHaveTextContent("Sin ubicación marcada");
  });

  it("no pide la ubicación al abrir: «Verme en el mapa» la pide al tocarlo y se dibuja", async () => {
    const d = await abrir(CON_PIN);
    expect(watchPosition).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByRole("button", { name: "Verme en el mapa" }));
    await act(async () => {});
    expect(watchPosition).toHaveBeenCalledTimes(1);
    expect(await within(d).findByTestId("mapa-entrega")).toHaveTextContent("yo -17.79,-63.19");
  });

  it("si ya dio el permiso, se ve sin tocar nada", async () => {
    Object.defineProperty(navigator, "permissions", {
      value: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
      configurable: true,
    });
    const d = await abrir(CON_PIN);
    await act(async () => {});
    expect(watchPosition).toHaveBeenCalledTimes(1);
    expect(within(d).queryByRole("button", { name: "Verme en el mapa" })).not.toBeInTheDocument();
  });

  it("un pin con poca precisión avisa que lo confirme por WhatsApp", async () => {
    const d = await abrir({ ...CON_PIN, precisionM: 250 } as Venta);
    expect(within(d).getByRole("region", { name: "Cómo llegar" })).toHaveTextContent(
      "El cliente marcó con poca precisión (unos 250 m): confirmá por WhatsApp.",
    );
  });

  it("con un backend anterior, el pin del pedido de la página", async () => {
    const web = {
      ...SIN_PIN,
      pedidoWeb: { id: 1, numero: 4, latitud: -17.7, longitud: -63.1, referencia: null, formaPago: "EFECTIVO", pagaCon: null, salioEn: null },
    } as unknown as Venta;
    const d = await abrir(web);
    expect(await within(d).findByTestId("mapa-entrega")).toHaveTextContent("-17.7,-63.1");
  });
});

describe("sin pin", () => {
  it("busca la dirección escrita en Maps y Waze, y dice que no hay ubicación", async () => {
    const d = await abrir(SIN_PIN);
    const llegar = within(d).getByRole("region", { name: "Cómo llegar" });
    expect(within(llegar).queryByTestId("mapa-entrega")).not.toBeInTheDocument();
    expect(llegar).toHaveTextContent("Sin ubicación marcada: buscá la dirección.");
    expect(within(llegar).getByRole("link", { name: /Buscar en Maps/ })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Calle%20Sucre%20450",
    );
    expect(within(llegar).getByRole("link", { name: /Buscar en Waze/ })).toHaveAttribute(
      "href",
      "https://waze.com/ul?q=Calle%20Sucre%20450&navigate=yes",
    );
  });

  it("sin dirección tampoco, que la pida por WhatsApp", async () => {
    const d = await abrir({ ...SIN_PIN, clienteDireccion: null } as Venta, { clienteDireccion: null });
    const llegar = within(d).getByRole("region", { name: "Cómo llegar" });
    expect(llegar).toHaveTextContent("pedile la ubicación por WhatsApp");
    expect(within(llegar).queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("cuándo no se muestra", () => {
  it("en espera de la caja no se navega: vuelve al local", async () => {
    const d = await abrir({ ...CON_PIN, entregaFallidaEn: "2026-11-20T18:40:00.000Z", entregaFallidaMotivo: "NO_CONTESTA" } as Venta);
    expect(within(d).queryByRole("region", { name: "Cómo llegar" })).not.toBeInTheDocument();
  });
});
