import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Configuración › Punto de venta, lo del 18-nov (CONTRATO-DELIVERY-FULL-18NOV
 * §9): «Pedidos de Yango y PedidosYa» sólo con alguna de esas features y
 * «Delivery propio» sólo con `delivery`. Los dos apagados de fábrica.
 *
 * Y la misma pantalla como «Mi punto de venta» del cajero
 * (CONTRATO-pos-por-cajero §3.2): sin `negocio.configurar` cambia sólo lo suyo.
 */

const sesion = vi.hoisted(() => ({
  features: [] as string[],
  // El dueño, de fábrica: lo de siempre. Los casos del cajero se lo sacan.
  permisos: ["negocio.configurar"] as string[],
  fijarConfigPos: vi.fn(),
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: "RESTAURANTE",
    negocio: { id: 1, nombre: "Nombre del negocio", tipoNegocio: "RESTAURANTE", features: sesion.features },
    usuario: { id: 7, username: "quien", permisos: sesion.permisos },
    fijarConfigPos: sesion.fijarConfigPos,
  }),
}));
vi.mock("../../lib/api", () => ({
  api: {
    configPos: vi.fn(),
    guardarConfigPos: vi.fn(),
    miConfigPos: vi.fn(),
    guardarMiConfigPos: vi.fn(),
    borrarMiConfigPos: vi.fn(),
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
  sesion.permisos = ["negocio.configurar"];
  // Un backend de antes de estos ajustes: no los trae.
  vi.mocked(api.configPos).mockResolvedValue({ vista: "TARJETAS", cobro: "APARTE" });
  vi.mocked(api.guardarConfigPos).mockImplementation(async (c) => ({ vista: "TARJETAS", cobro: "APARTE", ...c }));
});

describe("las secciones del 18-nov", () => {
  it("sin Yango, PedidosYa ni delivery: la pantalla de siempre", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: "Punto de venta" })).toBeInTheDocument();
    // El dueño sabe que lo que cambia es de todos, y que cada cajero tiene lo suyo.
    expect(
      screen.getByText("Vale para todo el negocio. Cada cajero puede ajustar lo suyo en «Mi punto de venta»."),
    ).toBeInTheDocument();
    expect(screen.getByText("Orden de las categorías")).toBeInTheDocument();
    expect(screen.queryByText("Pedidos de Yango y PedidosYa")).not.toBeInTheDocument();
    expect(screen.queryByText("Delivery propio")).not.toBeInTheDocument();
    expect(api.miConfigPos).not.toHaveBeenCalled();
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

describe("«Mi punto de venta»: el cajero cambia sólo lo suyo (18-nov)", () => {
  /** Lo que eligió el negocio. */
  const DEL_NEGOCIO = { vista: "TARJETAS", cobro: "APARTE", iconos: true, filtros: true, ordenCategorias: [] };
  /** Lo propio del cajero que tiene el servidor: un valor queda suyo, `null` lo vuelve al negocio. */
  let suyo: Record<string, unknown> = {};
  const mia = () => ({ config: { ...DEL_NEGOCIO, ...suyo }, propios: Object.keys(suyo), esDelNegocio: false });

  beforeEach(() => {
    sesion.permisos = ["ventas.vender", "caja.operar"];
    suyo = {};
    vi.mocked(api.miConfigPos).mockImplementation(async () => mia());
    vi.mocked(api.guardarMiConfigPos).mockImplementation(async (cambios) => {
      for (const [campo, valor] of Object.entries(cambios)) {
        if (valor === null) delete suyo[campo];
        else suyo[campo] = valor;
      }
      return mia();
    });
    vi.mocked(api.borrarMiConfigPos).mockImplementation(async () => {
      suyo = {};
      return mia();
    });
    vi.mocked(api.getCategorias).mockResolvedValue([
      { id: 1, nombre: "C", activo: true },
      { id: 2, nombre: "M", activo: true },
    ]);
  });

  it("lee y guarda en lo suyo, sin «Delivery propio»; la sesión se entera", async () => {
    sesion.features = ["pos", "caja", "delivery", "pedidos_yango"];
    await montar();
    expect(screen.getByRole("heading", { name: "Mi punto de venta" })).toBeInTheDocument();
    expect(screen.getByText("Cómo ves los productos y cómo cobrás vos.")).toBeInTheDocument();
    expect(
      screen.getByText("Estos ajustes son sólo tuyos. Lo que no cambies sigue como lo eligió el negocio."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Vale para todo el negocio/)).not.toBeInTheDocument();
    // La plata de los repartidores es un control sobre la caja: no es del cajero (R3).
    expect(screen.queryByText("Delivery propio")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Imprimir el pedido al registrarlo" })).toBeInTheDocument();
    expect(api.configPos).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: /Columnas por categoría/ }));
    });
    expect(api.guardarMiConfigPos).toHaveBeenLastCalledWith({ vista: "COLUMNAS" });
    expect(api.guardarConfigPos).not.toHaveBeenCalled();
    expect(sesion.fijarConfigPos).toHaveBeenLastCalledWith(expect.objectContaining({ vista: "COLUMNAS" }));
    // Ya cambió algo: al pie se ofrece volver a lo del negocio.
    expect(screen.getByRole("button", { name: "Volver a lo que eligió el negocio" })).toBeInTheDocument();
  });

  it("el orden: vuelve al del negocio con `null`, y «Volver a lo que eligió el negocio» pregunta antes de borrar todo", async () => {
    suyo = { vista: "COLUMNAS", ordenCategorias: [2, 1] };
    await montar();
    expect(screen.getByText(/mantené apretada una categoría y arrastrala/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Orden de las categorías" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("M"),
      expect.stringContaining("C"),
    ]);
    // No es «el de siempre»: lo de él vuelve a lo del negocio.
    expect(screen.queryByRole("button", { name: "Volver al orden de siempre" })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Volver al orden del negocio" }));
    });
    expect(api.guardarMiConfigPos).toHaveBeenLastCalledWith({ ordenCategorias: null });
    expect(screen.queryByRole("button", { name: "Volver al orden del negocio" })).not.toBeInTheDocument();

    // La vista sigue siendo suya: al pie se ofrece volver a todo lo del negocio.
    fireEvent.click(screen.getByRole("button", { name: "Volver a lo que eligió el negocio" }));
    const dialogo = screen.getByRole("dialog", { name: "¿Volver a lo del negocio?" });
    expect(
      within(dialogo).getByText("Se borran tus ajustes del punto de venta y lo ves como lo eligió el negocio."),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Sí, volver" }));
    });
    expect(api.borrarMiConfigPos).toHaveBeenCalledTimes(1);
    expect(sesion.fijarConfigPos).toHaveBeenLastCalledWith(expect.objectContaining({ vista: "TARJETAS", ordenCategorias: [] }));
    // Sin nada suyo, ya no hay a qué volver.
    expect(screen.queryByRole("button", { name: "Volver a lo que eligió el negocio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
