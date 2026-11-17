import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PedidoPlataformaEncolado } from "../../lib/offline/cola";
import type { PedidoPlataforma } from "../../lib/pedidosPlataforma/tipos";
import type { Caja, Venta } from "../../types";

/**
 * Los pedidos de Yango y PedidosYa en «Ventas del turno»
 * (PLAN-PEDIDOS-PLATAFORMA §10.2): mezclados por hora con las ventas, con su
 * marca, anulados tachados, SIN sumar a los totales del turno;
 * el detalle y «Anular» sólo con `plataformas.anular`; los de la cola con su
 * marca; y sin las features, ni se llama a la ruta.
 */

const sesion = vi.hoisted(() => ({
  features: ["pos", "caja", "pedidos_yango", "pedidos_pedidosya"] as string[] | undefined,
  permisos: ["plataformas.registrar", "plataformas.anular", "autorizar.pin"] as string[],
  cola: [] as unknown[],
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: "RESTAURANTE",
    negocio: { features: sesion.features },
    usuario: { rol: "CAJERO", permisos: sesion.permisos },
    puede: () => false,
    incluye: () => true,
    cupo: null,
    refrescarCupo: vi.fn(async () => {}),
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
    pedidosPlataformaDeLaCaja: vi.fn(),
    anularPedidoPlataforma: vi.fn(),
  },
}));

vi.mock("../../lib/offline/cola", async (original) => {
  const real = await original<typeof import("../../lib/offline/cola")>();
  return { ...real, usePedidosEncolados: () => sesion.cola as PedidoPlataformaEncolado[] };
});

vi.mock("../../components/QrCobro", () => ({ QrParaCobrar: () => null }));

import { api } from "../../lib/api";
import PantallaHistorial from "./PantallaHistorial";

const venta = (id: number, hora: string, total: number, extra: Record<string, unknown> = {}) =>
  ({
    id,
    comprobante: `T-000${id}`,
    estado: "APROBADO",
    fecha: `2026-11-16T${hora}:00.000Z`,
    total,
    items: 1,
    detalles: [],
    pagos: [{ formaPago: "Efectivo", monto: total }],
    formasPago: ["Efectivo"],
    tipoPedido: "LOCAL",
    estadoEntrega: null,
    prepagado: false,
    ...extra,
  }) as unknown as Venta;

const pedido = (id: number, hora: string, extra: Partial<PedidoPlataforma> = {}): PedidoPlataforma => ({
  id,
  clienteRequestId: `req-${id}`,
  plataforma: "YANGO",
  codigoExterno: `A-${id}`,
  fecha: `2026-11-16T${hora}:00.000Z`,
  almacen: { id: 3, nombre: "Las Brisas" },
  usuario: { id: 7, nombre: "Ana Rojas" },
  cajaId: 1,
  total: 70,
  sinStock: false,
  anuladoEn: null,
  motivoAnulacion: null,
  detalles: [{ productoId: 5, nombre: "Arroz con leche L", cantidad: 2, precio: 35, subtotal: 70 }],
  ...extra,
});

function montar() {
  render(
    <MemoryRouter>
      <PantallaHistorial caja={{ id: 1 } as Caja} onAtras={() => {}} onCierre={() => {}} onVerComprobante={() => {}} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.features = ["pos", "caja", "pedidos_yango", "pedidos_pedidosya"];
  sesion.permisos = ["plataformas.registrar", "plataformas.anular", "autorizar.pin"];
  sesion.cola = [];
  vi.mocked(api.getVentas).mockResolvedValue([venta(2, "15:00", 80), venta(1, "13:00", 20)]);
  vi.mocked(api.getVenta).mockResolvedValue(venta(2, "15:00", 80));
  vi.mocked(api.getPedidosPendientes).mockResolvedValue([]);
  vi.mocked(api.getCreditos).mockResolvedValue([]);
  vi.mocked(api.getResumenCreditos).mockResolvedValue({} as never);
  vi.mocked(api.getFormasPago).mockResolvedValue([]);
  vi.mocked(api.pedidosPlataformaDeLaCaja).mockResolvedValue({
    pedidos: [
      pedido(31, "16:00"),
      pedido(30, "14:00", { plataforma: "PEDIDOS_YA", codigoExterno: null, total: 40 }),
      pedido(29, "12:00", { total: 99, anuladoEn: "2026-11-16T12:30:00.000Z", motivoAnulacion: "Error al cargar" }),
    ],
  });
});

describe("pedidos mezclados con las ventas", () => {
  it("salen como filas propias, por hora, con marca de plataforma y sin leyenda de cobro", async () => {
    montar();
    await screen.findByRole("button", { name: /Ver el pedido de Yango N° A-31/ });
    expect(api.pedidosPlataformaDeLaCaja).toHaveBeenCalledWith(1);

    // El orden: pedido 16:00, venta 15:00, pedido 14:00, venta 13:00, pedido anulado 12:00.
    const nombres = screen
      .getAllByRole("button", { name: /T-000|Ver el pedido/ })
      .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
    expect(nombres[0]).toMatch(/pedido de Yango N° A-31/);
    expect(nombres[1]).toMatch(/T-0002/);
    expect(nombres[2]).toMatch(/pedido de PedidosYa Pedido #30/);
    expect(nombres[3]).toMatch(/T-0001/);
    expect(nombres[4]).toMatch(/pedido de Yango N° A-29/);

    const fila = screen.getByRole("button", { name: /Ver el pedido de Yango N° A-31/ });
    expect(within(fila).getByText("Yango")).toBeInTheDocument();
    expect(within(fila).queryByText(/No se cobra/)).toBeNull();
    // «Pedido #id» cuando no cargaron el N° de la app.
    const sinCodigo = screen.getByRole("button", { name: /Ver el pedido de PedidosYa Pedido #30/ });
    expect(within(sinCodigo).getByText("PedidosYa")).toBeInTheDocument();
  });

  it("un anulado se ve tachado y marcado", async () => {
    montar();
    const fila = await screen.findByRole("button", { name: /Ver el pedido de Yango N° A-29/ });
    expect(within(fila).getByText("Anulado")).toBeInTheDocument();
    expect(within(fila).getByText("N° A-29")).toHaveClass("line-through");
  });

  it("NO suman a «N ventas · Bs X»; el resumen de pedidos va en una línea aparte y sin anulados", async () => {
    montar();
    await screen.findByRole("button", { name: /Ver el pedido de Yango N° A-31/ });
    // Las dos ventas: 2 ventas · Bs 100 (los pedidos de 70 + 40 + 99 no entran).
    expect(screen.getByText(/2 ventas/)).toHaveTextContent(/2 ventas · Bs\s?100/);
    expect(screen.getByText(/Yango: 1 pedido · Bs\s?70/)).toHaveTextContent(
      /Yango: 1 pedido · Bs\s?70[.,]00 · PedidosYa: 1 pedido · Bs\s?40[.,]00/,
    );
    // El anulado (Bs 99) no está en ninguna suma.
    expect(screen.queryByText(/Bs\s?169/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bs\s?199/)).not.toBeInTheDocument();
  });
});

describe("el detalle de un pedido", () => {
  it("muestra las líneas, quién lo registró, la hora y la nota de la app de delivery", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Ver el pedido de Yango N° A-31/ }));
    const d = await screen.findByRole("dialog", { name: "Pedido de Yango" });
    expect(within(d).getByText("Arroz con leche L")).toBeInTheDocument();
    expect(within(d).getByText("2×")).toBeInTheDocument();
    expect(within(d).getByText("Ana Rojas")).toBeInTheDocument();
    expect(within(d).getByText(/le cobra al cliente y le paga al local después/)).toBeInTheDocument();
    expect(within(d).queryByText(/No se cobra/)).toBeNull();
  });

  it("con plataformas.anular ofrece «Anular», que abre el diálogo con motivo y PIN, y recarga la lista", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Ver el pedido de Yango N° A-31/ }));
    const d = await screen.findByRole("dialog", { name: "Pedido de Yango" });
    fireEvent.click(within(d).getByRole("button", { name: "Anular" }));
    const a = await screen.findByRole("dialog", { name: "Anular pedido de Yango" });
    fireEvent.click(within(a).getByRole("button", { name: "Error al cargar" }));
    fireEvent.change(within(a).getByLabelText("PIN de autorización"), { target: { value: "4826" } });
    await act(async () => {
      fireEvent.click(within(a).getByRole("button", { name: "Anular" }));
    });
    expect(api.anularPedidoPlataforma).toHaveBeenCalledWith(31, {
      motivo: "Error al cargar",
      autorizadorPin: "4826",
    });
    // Se vuelve a pedir la lista: el pedido tiene que verse anulado ya.
    expect(api.pedidosPlataformaDeLaCaja).toHaveBeenCalledTimes(2);
  });

  it("sin plataformas.anular el detalle no ofrece anular y manda con un encargado", async () => {
    sesion.permisos = ["plataformas.registrar"];
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Ver el pedido de Yango N° A-31/ }));
    const d = await screen.findByRole("dialog", { name: "Pedido de Yango" });
    expect(within(d).queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
    expect(within(d).getByText(/pedíselo a un encargado/)).toBeInTheDocument();
  });

  it("un pedido anulado muestra el motivo y no se puede anular otra vez", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Ver el pedido de Yango N° A-29/ }));
    const d = await screen.findByRole("dialog", { name: "Pedido de Yango" });
    expect(within(d).getByText(/Error al cargar/)).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });
});

describe("pedidos de la cola, sin subir", () => {
  const enCola = (id: string, extra: Record<string, unknown> = {}) =>
    ({
      tipo: "PEDIDO_PLATAFORMA",
      id,
      estado: "PENDIENTE",
      cuerpo: { clienteRequestId: id, plataforma: "PEDIDOS_YA", cajaId: 1, fechaCliente: "2026-11-16T17:00:00.000Z", detalles: [] },
      resumen: { plataforma: "PEDIDOS_YA", total: 55, lineas: 2 },
      ...extra,
    }) as unknown;

  it("se ven con su marca y «Sin subir», y cuentan en el resumen aparte", async () => {
    sesion.cola = [enCola("pend-1")];
    montar();
    const seccion = (await screen.findByText(/Pedidos de plataforma sin subir \(1\)/)).closest("section")!;
    expect(within(seccion).getByText("PedidosYa")).toBeInTheDocument();
    expect(within(seccion).getByText("Sin subir")).toBeInTheDocument();
    await screen.findByRole("button", { name: /Ver el pedido de Yango N° A-31/ });
    // PedidosYa: el del servidor (40) + el de la cola (55).
    expect(screen.getByText(/PedidosYa: 2 pedidos · Bs\s?95/)).toBeInTheDocument();
  });

  it("uno de otra caja no aparece", async () => {
    sesion.cola = [enCola("pend-2", { cuerpo: { cajaId: 9, plataforma: "YANGO", fechaCliente: "2026-11-16T17:00:00.000Z", detalles: [] } })];
    montar();
    await screen.findByRole("button", { name: /Ver el pedido de Yango N° A-31/ });
    expect(screen.queryByText(/sin subir/i)).not.toBeInTheDocument();
  });
});

describe("sin las features de plataforma el historial no cambia", () => {
  it("sin features en la sesión: no llama a la ruta y no hay línea de resumen", async () => {
    sesion.features = undefined;
    montar();
    await screen.findByRole("button", { name: /T-0002/ });
    expect(api.pedidosPlataformaDeLaCaja).not.toHaveBeenCalled();
    expect(screen.queryByText(/pedido/i)).not.toBeInTheDocument();
  });

  it("con la feature pero sin plataformas.registrar tampoco la llama (daría 403)", async () => {
    sesion.permisos = ["plataformas.ver"];
    montar();
    await screen.findByRole("button", { name: /T-0002/ });
    expect(api.pedidosPlataformaDeLaCaja).not.toHaveBeenCalled();
  });

  it("si la ruta falla (backend viejo) las ventas se ven igual", async () => {
    vi.mocked(api.pedidosPlataformaDeLaCaja).mockRejectedValue(new Error("Cannot GET"));
    montar();
    await screen.findByRole("button", { name: /T-0002/ });
    expect(screen.queryByText(/Ver el pedido/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 ventas/)).toBeInTheDocument();
  });
});
