import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja, Venta } from "../../types";

/**
 * Un delivery «en espera» desde la caja (20-nov, regla del dueño): el
 * repartidor avisó «No se pudo entregar» y decide quien maneja el reparto. La
 * fila lo marca; el detalle dice qué pasó (motivo, nota, quién y hace cuánto)
 * y ofrece Reintentar, Reasignar y Cancelar pedido, que ahora es sólo de la caja.
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
    getRepartidores: vi.fn(),
    reintentarEntrega: vi.fn(),
    reasignarPedido: vi.fn(),
    cancelarPedido: vi.fn(),
    ubicacionDeVenta: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import PantallaHistorial from "./PantallaHistorial";

const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const EN_ESPERA = {
  id: 900,
  comprobante: "V-000900",
  estado: "APROBADO",
  fecha: hace(60),
  total: 50,
  totalACobrar: 57,
  tarifaEnvio: 7,
  items: 1,
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
  entregaFallidaEn: hace(12),
  entregaFallidaMotivo: "NO_CONTESTA",
  entregaFallidaNota: "Toqué tres veces",
} as unknown as Venta;

function montar() {
  render(
    <MemoryRouter>
      <PantallaHistorial caja={{ id: 1 } as Caja} onAtras={() => {}} onCierre={() => {}} onVerComprobante={() => {}} />
    </MemoryRouter>,
  );
}

async function abrirDetalle() {
  montar();
  fireEvent.click(await screen.findByText("Carla Mamani"));
  await act(async () => {});
  return screen.getByRole("dialog", { name: "V-000900" });
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.permisos = ["ventas.vender", "ventas.historial", "caja.operar", "delivery.asignar"];
  vi.mocked(api.getVentas).mockResolvedValue([]);
  vi.mocked(api.getCreditos).mockResolvedValue([]);
  vi.mocked(api.getResumenCreditos).mockResolvedValue(null as never);
  vi.mocked(api.getFormasPago).mockResolvedValue([]);
  vi.mocked(api.getPedidosPendientes).mockResolvedValue([EN_ESPERA]);
  // El detalle completo no trae la espera: se usa la de la fila.
  vi.mocked(api.getVenta).mockResolvedValue({ ...EN_ESPERA, entregaFallidaEn: undefined, entregaFallidaMotivo: undefined, entregaFallidaNota: undefined } as Venta);
  vi.mocked(api.getRepartidores).mockResolvedValue([
    { id: 129, nombre: "Pedro Rojas", zona: null, vehiculo: null },
    { id: 130, nombre: "Luis Vaca", zona: null, vehiculo: null },
  ]);
  vi.mocked(api.reintentarEntrega).mockResolvedValue(EN_ESPERA);
  vi.mocked(api.reasignarPedido).mockResolvedValue(EN_ESPERA);
  vi.mocked(api.cancelarPedido).mockResolvedValue(EN_ESPERA);
});

describe("la caja ve el pedido en espera", () => {
  it("la fila de pendientes lo marca con el motivo", async () => {
    montar();
    const fila = (await screen.findByText("Carla Mamani")).closest("li") as HTMLElement;
    expect(fila).toHaveTextContent("En espera de la caja · No contesta");
  });

  it("el detalle dice motivo, nota, quién avisó y hace cuánto", async () => {
    const d = await abrirDetalle();
    const espera = within(d).getByLabelText("En espera de la caja");
    expect(espera).toHaveTextContent("En espera de la caja · No contesta");
    expect(espera).toHaveTextContent("«Toqué tres veces»");
    expect(espera).toHaveTextContent(/Avisó Pedro Rojas · hace 12 min/);
  });
});

describe("las tres salidas de la caja", () => {
  it("Reintentar llama a reintentar-entrega y recarga los pendientes", async () => {
    const d = await abrirDetalle();
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Reintentar" }));
    });
    expect(api.reintentarEntrega).toHaveBeenCalledWith(900);
    expect(api.getPedidosPendientes).toHaveBeenCalledTimes(2);
  });

  it("Reasignar ofrece a los otros repartidores y manda el elegido", async () => {
    const d = await abrirDetalle();
    fireEvent.click(within(d).getByRole("button", { name: "Reasignar" }));
    await act(async () => {});
    const select = within(d).getByLabelText("Nuevo repartidor");
    // El que avisó no aparece: pasárselo a él no cambia nada.
    expect(within(select).queryByRole("option", { name: "Pedro Rojas" })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: "130" } });
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Pasárselo" }));
    });
    expect(api.reasignarPedido).toHaveBeenCalledWith(900, 130);
  });

  it("Cancelar pedido pide confirmación y recién ahí cancela", async () => {
    const d = await abrirDetalle();
    fireEvent.click(within(d).getByRole("button", { name: "Cancelar pedido" }));
    const confirmar = screen.getByRole("dialog", { name: "¿Cancelar el pedido?" });
    expect(api.cancelarPedido).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(confirmar).getByRole("button", { name: "Sí, cancelar" }));
    });
    expect(api.cancelarPedido).toHaveBeenCalledWith(900);
  });

  it("si el servidor rechaza, lo dice y el pedido sigue en espera", async () => {
    vi.mocked(api.reintentarEntrega).mockRejectedValue(new Error("El pedido ya no está en espera"));
    const d = await abrirDetalle();
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Reintentar" }));
    });
    expect(within(d).getByText("El pedido ya no está en espera")).toBeInTheDocument();
  });

  it("sin `delivery.asignar` se ve el aviso, sin los botones", async () => {
    sesion.permisos = ["ventas.vender", "ventas.historial", "caja.operar"];
    const d = await abrirDetalle();
    expect(within(d).getByLabelText("En espera de la caja")).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: "Cancelar pedido" })).not.toBeInTheDocument();
  });
});

describe("el pin de un delivery pendiente, desde la caja (20-nov)", () => {
  const PENDIENTE = { ...EN_ESPERA, entregaFallidaEn: null, entregaFallidaMotivo: null, entregaFallidaNota: null } as unknown as Venta;

  it("«Agregar ubicación» pega el enlace y guarda con el PATCH; la lista se recarga", async () => {
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([PENDIENTE]);
    vi.mocked(api.getVenta).mockResolvedValue(PENDIENTE);
    vi.mocked(api.ubicacionDeVenta).mockResolvedValue(PENDIENTE);
    const d = await abrirDetalle();
    expect(d).toHaveTextContent("Sin ubicación en el mapa");
    fireEvent.click(within(d).getByRole("button", { name: "Agregar ubicación" }));
    const hoja = screen.getByRole("dialog", { name: "Agregar ubicación" });
    expect(within(hoja).getByRole("button", { name: "Guardar ubicación" })).toBeDisabled();
    fireEvent.change(within(hoja).getByLabelText("Enlace de Google Maps"), { target: { value: "-17.7834, -63.1821" } });
    await act(async () => {
      fireEvent.click(within(hoja).getByRole("button", { name: "Guardar ubicación" }));
    });
    expect(api.ubicacionDeVenta).toHaveBeenCalledWith(900, { latitud: -17.7834, longitud: -63.1821 });
    expect(api.getPedidosPendientes).toHaveBeenCalledTimes(2);
  });

  it("con pin ya marcado dice «Cambiar ubicación»", async () => {
    const conPin = { ...PENDIENTE, latitud: -17.7, longitud: -63.1 } as unknown as Venta;
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([conPin]);
    vi.mocked(api.getVenta).mockResolvedValue(conPin);
    const d = await abrirDetalle();
    expect(within(d).getByRole("button", { name: "Cambiar ubicación" })).toBeInTheDocument();
  });

  it("sin `delivery.asignar` no se ofrece", async () => {
    sesion.permisos = ["ventas.vender", "ventas.historial", "caja.operar"];
    vi.mocked(api.getPedidosPendientes).mockResolvedValue([PENDIENTE]);
    vi.mocked(api.getVenta).mockResolvedValue(PENDIENTE);
    const d = await abrirDetalle();
    expect(within(d).queryByRole("button", { name: /ubicación/ })).not.toBeInTheDocument();
  });
});
