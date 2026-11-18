import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Configuración › Punto de venta, lo del 18-nov (CONTRATO-DELIVERY-FULL-18NOV
 * §9): «Pedidos de Yango y PedidosYa» sólo con alguna de esas features y
 * «Delivery propio» sólo con `delivery`. Los dos apagados de fábrica.
 */

const sesion = vi.hoisted(() => ({ features: [] as string[], fijarConfigPos: vi.fn() }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: "RESTAURANTE",
    negocio: { id: 1, nombre: "Nombre del negocio", tipoNegocio: "RESTAURANTE", features: sesion.features },
    fijarConfigPos: sesion.fijarConfigPos,
  }),
}));
vi.mock("../../lib/api", () => ({
  api: {
    configPos: vi.fn(),
    guardarConfigPos: vi.fn(),
    getCategorias: vi.fn(async () => []),
  },
}));

import { api } from "../../lib/api";
import ConfigPuntoDeVenta from "./ConfigPuntoDeVenta";

async function montar() {
  render(
    <MemoryRouter>
      <ConfigPuntoDeVenta />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.features = ["pos", "caja"];
  // Un backend de antes de estos ajustes: no los trae.
  vi.mocked(api.configPos).mockResolvedValue({ vista: "TARJETAS", cobro: "APARTE" });
  vi.mocked(api.guardarConfigPos).mockImplementation(async (c) => ({ vista: "TARJETAS", cobro: "APARTE", ...c }));
});

describe("las secciones del 18-nov", () => {
  it("sin Yango, PedidosYa ni delivery: la pantalla de siempre", async () => {
    await montar();
    expect(screen.getByText("Orden de las categorías")).toBeInTheDocument();
    expect(screen.queryByText("Pedidos de Yango y PedidosYa")).not.toBeInTheDocument();
    expect(screen.queryByText("Delivery propio")).not.toBeInTheDocument();
  });

  it.each([["pedidos_yango"], ["pedidos_pedidosya"]])("con %s sale «Imprimir el pedido al registrarlo», apagado", async (f) => {
    sesion.features = ["pos", "caja", f];
    await montar();
    expect(screen.getByText("Pedidos de Yango y PedidosYa")).toBeInTheDocument();
    expect(
      screen.getByText("Al registrar un pedido de Yango o PedidosYa se abre su ticket para imprimirlo. Apagado, se registra y listo, como siempre."),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Imprimir el pedido al registrarlo" })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText("Delivery propio")).not.toBeInTheDocument();
  });

  it("con delivery sale «Controlar la plata de los repartidores», apagado", async () => {
    sesion.features = ["pos", "caja", "delivery"];
    await montar();
    expect(screen.getByText("Delivery propio")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Lo que el repartidor cobra en efectivo figura como plata en su poder hasta que la caja la recibe. La caja no se cierra con plata sin recibir.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Controlar la plata de los repartidores" })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText("Pedidos de Yango y PedidosYa")).not.toBeInTheDocument();
  });

  it("prender cada uno guarda sólo ése y la sesión se entera", async () => {
    sesion.features = ["pos", "caja", "pedidos_yango", "delivery"];
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Imprimir el pedido al registrarlo" }));
    });
    expect(api.guardarConfigPos).toHaveBeenLastCalledWith({ imprimirPlataformas: true });
    expect(screen.getByRole("switch", { name: "Imprimir el pedido al registrarlo" })).toHaveAttribute("aria-checked", "true");
    expect(sesion.fijarConfigPos).toHaveBeenLastCalledWith(expect.objectContaining({ imprimirPlataformas: true, rendirRepartidores: false }));
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Controlar la plata de los repartidores" }));
    });
    expect(api.guardarConfigPos).toHaveBeenLastCalledWith({ rendirRepartidores: true });
  });
});
