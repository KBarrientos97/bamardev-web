import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PedidoWeb } from "../../lib/pedidosWeb/tipos";

/**
 * El detalle de un pedido web (delivery full, 18-nov): «Imprimir pedido» para
 * la cocina y la bolsa (CONTRATO-DELIVERY-FULL-18NOV §9) y la dirección
 * opcional, que sin texto dice «Ubicación marcada en el mapa».
 */

const sesion = vi.hoisted(() => ({ locales: 1 }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: {
      id: 1,
      nombre: "Nombre del negocio",
      // Con 2+ locales rige el multisucursal (`multi_almacen`), como en un negocio de verdad.
      features: sesion.locales > 1 ? ["pos", "delivery", "multi_almacen"] : ["pos", "delivery"],
      sucursalesActivas: sesion.locales,
    },
    usuario: { id: 1, rol: "ADMIN", permisos: ["delivery.asignar"] },
  }),
}));
vi.mock("../../lib/pedidosWeb/apiPrivada", () => ({ apiPedidosWeb: { detalle: vi.fn() } }));
vi.mock("../../lib/api", () => ({
  ApiError: class extends Error {},
  api: { getRepartidores: vi.fn(async () => []) },
}));
vi.mock("../pagina/MapaSeguimiento", () => ({ default: () => <div>mapa</div> }));

import { apiPedidosWeb } from "../../lib/pedidosWeb/apiPrivada";
import DetallePedidoWeb from "./DetallePedidoWeb";

const PEDIDO: PedidoWeb = {
  id: 40,
  numero: 7,
  estado: "ACEPTADO",
  tipo: "DELIVERY",
  almacenId: 3,
  sucursal: "Principal",
  nombre: "Carla Mamani",
  telefono: "70000000",
  direccion: null,
  referencia: "Portón negro",
  nota: null,
  latitud: -17.78,
  longitud: -63.18,
  precisionM: 10,
  distanciaKm: 1.4,
  formaPago: "EFECTIVO",
  pagaCon: 300,
  subtotal: 242,
  envioSugerido: 7,
  envio: 7,
  total: 249,
  lineas: [
    { id: 1, titulo: "Brasa entero", cantidad: 2, precio: 112, subtotal: 224 },
    { id: 2, titulo: "Coca Cola 2L", cantidad: 1, precio: 18, subtotal: 18 },
  ],
  motivoRechazo: null,
  ventaId: 900,
  repartidor: { id: 129, nombre: "Pedro Rojas" },
  creadoEn: "2026-11-18T04:41:00.000Z",
  aceptadoEn: "2026-11-18T04:43:00.000Z",
  salioEn: null,
};

async function montar(p: PedidoWeb) {
  vi.mocked(apiPedidosWeb.detalle).mockResolvedValue(p);
  render(<DetallePedidoWeb fila={p} onVolver={() => {}} onHecho={() => {}} onConflicto={() => {}} />);
  await act(async () => {});
}

beforeEach(() => {
  sesion.locales = 1;
  window.print = vi.fn();
});

describe("«Imprimir pedido»", () => {
  it("imprime el ticket del pedido, en negrita, con el envío, el repartidor y cómo paga", async () => {
    await montar(PEDIDO);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir pedido" }));
    expect(window.print).toHaveBeenCalledTimes(1);
    const papel = document.getElementById("area-impresion")!;
    expect(papel).toHaveClass("papel-negrita");
    const texto = papel.textContent!;
    expect(texto).toContain("PEDIDO WEB N° 07 - DELIVERY");
    expect(texto).toContain("Dir: Ubicación en el mapa");
    expect(texto).toContain("Repartidor: Pedro Rojas");
    expect(texto).toContain("TOTAL A COBRAR         Bs 249.00");
    expect(texto).toContain("Paga con Bs 300 - cambio Bs 51");
    // Un solo local: el papel no lleva la sucursal, como el ticket de cierre.
    expect(texto).not.toContain("Principal");
  });

  it("con 2+ sucursales, la sucursal va centrada bajo el nombre", async () => {
    sesion.locales = 2;
    await montar(PEDIDO);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir pedido" }));
    expect(document.getElementById("area-impresion")!.textContent).toContain(`NOMBRE DEL NEGOCIO\n${" ".repeat(11)}Principal\n`);
  });

  it.each(["NUEVO", "ACEPTADO", "CANCELADO"] as const)("en %s se ofrece", async (estado) => {
    await montar({ ...PEDIDO, estado, venceEn: estado === "NUEVO" ? new Date(Date.now() + 300_000).toISOString() : null });
    expect(screen.getByRole("button", { name: "Imprimir pedido" })).toBeInTheDocument();
  });

  it.each(["RECHAZADO", "VENCIDO"] as const)("%s no se imprime: no se prepara", async (estado) => {
    await montar({ ...PEDIDO, estado });
    expect(screen.queryByRole("button", { name: "Imprimir pedido" })).not.toBeInTheDocument();
  });

  it("un NUEVO que ya venció en el reloj (sin respuesta del servidor todavía) tampoco", async () => {
    await montar({ ...PEDIDO, estado: "NUEVO", venceEn: new Date(Date.now() - 1000).toISOString() });
    expect(screen.queryByRole("button", { name: "Imprimir pedido" })).not.toBeInTheDocument();
  });

  it("mientras no llegaron las líneas del pedido, no se ofrece", async () => {
    vi.mocked(apiPedidosWeb.detalle).mockReturnValue(new Promise(() => {}));
    render(<DetallePedidoWeb fila={{ ...PEDIDO, lineas: [] }} onVolver={() => {}} onHecho={() => {}} onConflicto={() => {}} />);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Imprimir pedido" })).not.toBeInTheDocument();
  });
});

describe("la dirección opcional", () => {
  it("sin dirección, dice «Ubicación marcada en el mapa»", async () => {
    await montar(PEDIDO);
    expect(screen.getByText("Ubicación marcada en el mapa")).toBeInTheDocument();
  });

  it("con dirección, la de siempre", async () => {
    await montar({ ...PEDIDO, direccion: "Calle Sucre 450" });
    expect(screen.getByText("Calle Sucre 450")).toBeInTheDocument();
    expect(screen.queryByText("Ubicación marcada en el mapa")).not.toBeInTheDocument();
  });
});
