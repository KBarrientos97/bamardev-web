import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Venta } from "../../types";

/**
 * El mapa del día (todas las por entregar con pin, numeradas; las sin pin
 * aparte) y «Mi día › Semana» con `GET /reparto/historial` (20-nov).
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 129, nombre: "Pedro Rojas", username: "pedro" },
    negocio: { nombre: "Negocio de prueba", features: [] },
  }),
}));

vi.mock("../pagina/MapaSeguimiento", () => ({ default: () => <div data-testid="mapa-entrega" /> }));

// El mapa del día, sin MapLibre: un botón por pin con su número, como los de verdad.
vi.mock("./MapaEntregas", () => ({
  default: ({ puntos, onElegir }: { puntos: { id: number; numero: number; etiqueta: string; lat: number; lng: number }[]; onElegir: (id: number) => void }) => (
    <div data-testid="mapa-del-dia">
      {puntos.map((p) => (
        <button key={p.id} type="button" onClick={() => onElegir(p.id)}>
          Pin {p.numero} {p.etiqueta} {p.lat},{p.lng}
        </button>
      ))}
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
    historialReparto: vi.fn(),
  },
}));

vi.mock("../../lib/pedidosWeb/apiPrivada", () => ({
  apiPedidosWeb: { sali: vi.fn(), posicion: vi.fn() },
}));

import { api } from "../../lib/api";
import { rangoSemana } from "../../lib/historialReparto";
import Repartidor from "./Repartidor";
import { puntosDelDia } from "./puntosDelDia";

const BASE = {
  estado: "APROBADO",
  fecha: "2026-11-20T18:00:00.000Z",
  total: 50,
  totalACobrar: 57,
  tarifaEnvio: 7,
  montoRendicion: 50,
  prepagado: false,
  tipoPedido: "DELIVERY",
  estadoEntrega: "PENDIENTE",
  clienteTelefono: "70000000",
  minutosEstimados: null,
  notaPedido: null,
  entregadoEn: null,
  formasPago: [],
  pagos: [],
  detalles: [],
  repartidor: { id: 129, nombre: "Pedro Rojas" },
  pedidoWeb: null,
};

const ANA = { ...BASE, id: 1, comprobante: "V-1", clienteNombre: "Ana Rojas", clienteDireccion: "Calle 1", latitud: -17.78, longitud: -63.18 } as unknown as Venta;
const LUIS = { ...BASE, id: 2, comprobante: "V-2", clienteNombre: "Luis Vaca", clienteDireccion: "Av. Banzer km 5", latitud: null, longitud: null } as unknown as Venta;
const RITA = { ...BASE, id: 3, comprobante: "V-3", clienteNombre: "Rita Gil", clienteDireccion: "Calle 3", latitud: -17.79, longitud: -63.19 } as unknown as Venta;

async function montar(lista: Venta[]) {
  vi.mocked(api.getMisEntregas).mockResolvedValue(lista);
  render(<Repartidor />);
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getFormasPago).mockResolvedValue([]);
  vi.mocked(api.rendicionReparto).mockRejectedValue(new Error("Not Found"));
  vi.mocked(api.getVenta).mockImplementation(async (id: number) => [ANA, LUIS, RITA].find((v) => v.id === id) as Venta);
});

describe("el mapa del día", () => {
  it("separa las que tienen pin (numeradas en el orden de la lista) de las que no", () => {
    const { conPin, sinPin } = puntosDelDia([ANA, LUIS, RITA]);
    expect(conPin.map((p) => [p.numero, p.etiqueta])).toEqual([
      [1, "Ana Rojas"],
      [3, "Rita Gil"],
    ]);
    expect(sinPin.map((v) => v.id)).toEqual([2]);
  });

  it("«Ver en el mapa» sólo aparece si alguna por entregar tiene pin", async () => {
    await montar([LUIS]);
    expect(screen.queryByRole("button", { name: /Ver en el mapa/ })).not.toBeInTheDocument();
  });

  it("muestra los pines, lista aparte las sin pin, y tocar uno abre su detalle", async () => {
    await montar([ANA, LUIS, RITA]);
    fireEvent.click(screen.getByRole("button", { name: /Ver en el mapa/ }));
    const hoja = screen.getByRole("dialog", { name: "Mapa del día" });
    const mapa = await within(hoja).findByTestId("mapa-del-dia");
    expect(within(mapa).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Pin 1 Ana Rojas -17.78,-63.18",
      "Pin 3 Rita Gil -17.79,-63.19",
    ]);
    const sinPin = within(hoja).getByRole("region", { name: "Sin ubicación en el mapa" });
    expect(sinPin).toHaveTextContent("1 sin ubicación en el mapa");
    expect(sinPin).toHaveTextContent("Av. Banzer km 5");
    fireEvent.click(within(mapa).getByRole("button", { name: /Rita Gil/ }));
    await act(async () => {});
    expect(screen.queryByRole("dialog", { name: "Mapa del día" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Rita Gil" })).toBeInTheDocument();
  });

  it("la sin pin también abre su detalle desde la lista de abajo", async () => {
    await montar([ANA, LUIS]);
    fireEvent.click(screen.getByRole("button", { name: /Ver en el mapa/ }));
    fireEvent.click(within(screen.getByRole("region", { name: "Sin ubicación en el mapa" })).getByRole("button", { name: /Luis Vaca/ }));
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Luis Vaca" })).toBeInTheDocument();
  });
});

describe("«Mi día › Semana»", () => {
  const HISTORIAL = {
    cantidad: 3,
    totalEnvios: 22,
    dias: [
      { dia: "2026-11-19", cantidad: 1, totalEnvios: 7, entregas: [{ ventaId: 7, numero: "V-7", cliente: "Ana Rojas", entregadoEn: "2026-11-19T20:00:00.000Z", envio: 7, formaPago: "Efectivo", total: 50 }] },
      {
        dia: "2026-11-20",
        cantidad: 2,
        totalEnvios: 15,
        entregas: [
          { ventaId: 8, numero: "V-8", cliente: "Luis Vaca", entregadoEn: "2026-11-20T19:00:00.000Z", envio: 8, formaPago: "QR", total: 40 },
          { ventaId: 9, numero: "V-9", cliente: "Rita Gil", entregadoEn: "2026-11-20T20:00:00.000Z", envio: 7, formaPago: "Efectivo", total: 30 },
        ],
      },
    ],
  };

  async function abrirSemana() {
    await montar([LUIS]);
    fireEvent.click(screen.getByTitle("Ver mi día"));
    const hoja = screen.getByRole("dialog", { name: "Mi día" });
    // «Hoy» no pide nada: sale de «Mis entregas».
    expect(api.historialReparto).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(hoja).getByRole("button", { name: "Semana" }));
    });
    return hoja;
  }

  it("pide los últimos 7 días de jornada y muestra totales y cada día con sus envíos", async () => {
    vi.mocked(api.historialReparto).mockResolvedValue(HISTORIAL);
    const hoja = await abrirSemana();
    expect(api.historialReparto).toHaveBeenCalledWith(rangoSemana());
    expect(within(hoja).getByText("Pedidos llevados").parentElement).toHaveTextContent(/Pedidos llevados\s*3/);
    expect(within(hoja).getByText("Envío cobrado").nextElementSibling).toHaveTextContent("Bs 22");
    const dias = within(hoja).getAllByRole("region");
    // El más reciente arriba.
    expect(dias[0]).toHaveAccessibleName("vie 20/11");
    expect(dias[0]).toHaveTextContent("2 pedidos · Bs 15 de envío");
    expect(dias[0]).toHaveTextContent("V-8 · Luis Vaca");
    expect(dias[0]).toHaveTextContent("QR");
    expect(dias[1]).toHaveAccessibleName("jue 19/11");
    // Nunca «ganancia»: lo que se cobró de envío.
    expect(hoja).not.toHaveTextContent(/ganancia|ganaste/i);
  });

  it("un backend que todavía no tiene el historial no rompe nada", async () => {
    vi.mocked(api.historialReparto).mockResolvedValue({ message: "Not Found" });
    const hoja = await abrirSemana();
    expect(hoja).toHaveTextContent("El resumen de la semana todavía no está disponible.");
  });

  it("un 404 (la ruta todavía no está en el servidor) también es «no disponible», no un error", async () => {
    vi.mocked(api.historialReparto).mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));
    const hoja = await abrirSemana();
    expect(hoja).toHaveTextContent("El resumen de la semana todavía no está disponible.");
    expect(within(hoja).queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("sin señal, el error con «Reintentar»", async () => {
    vi.mocked(api.historialReparto).mockRejectedValue(new Error("Sin conexión"));
    const hoja = await abrirSemana();
    expect(hoja).toHaveTextContent("Sin conexión");
    expect(within(hoja).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
