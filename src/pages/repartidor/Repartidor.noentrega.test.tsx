import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Venta } from "../../types";
import { cuerpoNoEntregado, enEspera, textoMotivo } from "../../lib/entregaFallida";

/**
 * «No se pudo entregar» (20-nov, regla del dueño): el repartidor ya no cancela
 * pedidos. Avisa con un motivo (y una nota, obligatoria con «Otro»), el pedido
 * queda «en espera de la caja» y él no lo puede entregar ni cobrar.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 129, nombre: "Pedro Rojas", username: "pedro" },
    negocio: { nombre: "Negocio de prueba", features: [] },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getMisEntregas: vi.fn(),
    getFormasPago: vi.fn(),
    getVenta: vi.fn(),
    entregarPedido: vi.fn(),
    cancelarPedido: vi.fn(),
    noEntregado: vi.fn(),
    rendicionReparto: vi.fn(),
  },
}));

vi.mock("../../lib/pedidosWeb/apiPrivada", () => ({
  apiPedidosWeb: { sali: vi.fn(), posicion: vi.fn() },
}));

import { api } from "../../lib/api";
import Repartidor from "./Repartidor";

const PEDIDO = {
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
} as unknown as Venta;

const EN_ESPERA = {
  ...PEDIDO,
  entregaFallidaEn: "2026-11-20T18:40:00.000Z",
  entregaFallidaMotivo: "DIRECCION",
  entregaFallidaNota: "No existe el número 450",
} as unknown as Venta;

async function abrirDetalle(v: Venta) {
  vi.mocked(api.getMisEntregas).mockResolvedValue([v]);
  vi.mocked(api.getVenta).mockResolvedValue(v);
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
  vi.mocked(api.noEntregado).mockResolvedValue(EN_ESPERA);
});

describe("el repartidor ya no cancela", () => {
  it("no ve «Cancelar pedido»; ve «No se pudo entregar» junto a cobrar", async () => {
    const d = await abrirDetalle(PEDIDO);
    expect(within(d).queryByRole("button", { name: "Cancelar pedido" })).not.toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "No se pudo entregar" })).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: /^Cobrar Bs/ })).toBeInTheDocument();
  });

  it("elige el motivo en la hoja y manda el body del contrato; la lista se recarga", async () => {
    const d = await abrirDetalle(PEDIDO);
    fireEvent.click(within(d).getByRole("button", { name: "No se pudo entregar" }));
    const hoja = screen.getByRole("dialog", { name: "No se pudo entregar" });
    // Sin motivo no se puede avisar.
    expect(within(hoja).getByRole("button", { name: "Avisar a la caja" })).toBeDisabled();
    const motivos = within(hoja).getAllByRole("radio").map((r) => r.textContent);
    expect(motivos).toEqual(["No contesta", "Dirección equivocada o no la encuentro", "El cliente lo rechazó", "Otro"]);
    fireEvent.click(within(hoja).getByRole("radio", { name: "No contesta" }));
    expect(within(hoja).getByRole("radio", { name: "No contesta" })).toHaveAttribute("aria-checked", "true");
    fireEvent.change(within(hoja).getByRole("textbox"), { target: { value: "  Toqué   el timbre  " } });
    await act(async () => {
      fireEvent.click(within(hoja).getByRole("button", { name: "Avisar a la caja" }));
    });
    expect(api.noEntregado).toHaveBeenCalledWith(31, { motivo: "NO_CONTESTA", nota: "Toqué el timbre" });
    expect(api.cancelarPedido).not.toHaveBeenCalled();
    expect(api.getMisEntregas).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog", { name: "No se pudo entregar" })).not.toBeInTheDocument();
  });

  it("sin nota, la nota no viaja; con «Otro» es obligatoria", async () => {
    const d = await abrirDetalle(PEDIDO);
    fireEvent.click(within(d).getByRole("button", { name: "No se pudo entregar" }));
    const hoja = screen.getByRole("dialog", { name: "No se pudo entregar" });
    fireEvent.click(within(hoja).getByRole("radio", { name: "Otro" }));
    await act(async () => {
      fireEvent.click(within(hoja).getByRole("button", { name: "Avisar a la caja" }));
    });
    expect(api.noEntregado).not.toHaveBeenCalled();
    expect(hoja).toHaveTextContent("Contá qué pasó");
    fireEvent.click(within(hoja).getByRole("radio", { name: "El cliente lo rechazó" }));
    await act(async () => {
      fireEvent.click(within(hoja).getByRole("button", { name: "Avisar a la caja" }));
    });
    expect(api.noEntregado).toHaveBeenCalledWith(31, { motivo: "RECHAZADO" });
  });

  it("si el servidor rechaza, lo dice en la hoja y no la cierra", async () => {
    vi.mocked(api.noEntregado).mockRejectedValue(new Error("Este pedido ya se entregó"));
    const d = await abrirDetalle(PEDIDO);
    fireEvent.click(within(d).getByRole("button", { name: "No se pudo entregar" }));
    const hoja = screen.getByRole("dialog", { name: "No se pudo entregar" });
    fireEvent.click(within(hoja).getByRole("radio", { name: "No contesta" }));
    await act(async () => {
      fireEvent.click(within(hoja).getByRole("button", { name: "Avisar a la caja" }));
    });
    expect(within(hoja).getByText("Este pedido ya se entregó")).toBeInTheDocument();
  });
});

describe("en espera de la caja", () => {
  it("la tarjeta lo dice con el motivo", async () => {
    vi.mocked(api.getMisEntregas).mockResolvedValue([EN_ESPERA]);
    render(<Repartidor />);
    await act(async () => {});
    const tarjeta = screen.getByRole("button", { name: /Carla Mamani/ });
    expect(tarjeta).toHaveTextContent("En espera de la caja");
    expect(tarjeta).toHaveTextContent("Dirección equivocada o no la encuentro");
    expect(tarjeta).not.toHaveTextContent("Cobra al entregar");
  });

  it("el detalle no deja entregar ni cobrar, y dice que vuelva al local", async () => {
    const d = await abrirDetalle(EN_ESPERA);
    expect(within(d).queryByRole("button", { name: /^Cobrar Bs/ })).not.toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: "Marcar entregado" })).not.toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: "No se pudo entregar" })).not.toBeInTheDocument();
    expect(d).toHaveTextContent("En espera de la caja · Dirección equivocada o no la encuentro");
    expect(d).toHaveTextContent("«No existe el número 450»");
    expect(d).toHaveTextContent("Volvé al local con el pedido; la caja decide");
  });

  it("aunque el detalle completo no traiga la espera, vale la de la lista", async () => {
    vi.mocked(api.getMisEntregas).mockResolvedValue([EN_ESPERA]);
    vi.mocked(api.getVenta).mockResolvedValue(PEDIDO);
    render(<Repartidor />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Carla Mamani/ }));
    await act(async () => {});
    const d = screen.getByRole("dialog", { name: "Carla Mamani" });
    expect(within(d).queryByRole("button", { name: /^Cobrar Bs/ })).not.toBeInTheDocument();
  });
});

describe("las reglas de la espera", () => {
  it("en espera sólo si sigue pendiente y tiene la marca", () => {
    expect(enEspera({ estadoEntrega: "PENDIENTE", entregaFallidaEn: "2026-11-20T18:40:00.000Z" })).toBe(true);
    expect(enEspera({ estadoEntrega: "PENDIENTE", entregaFallidaEn: null })).toBe(false);
    expect(enEspera({ estadoEntrega: "PENDIENTE" })).toBe(false);
    expect(enEspera({ estadoEntrega: "ENTREGADO", entregaFallidaEn: "2026-11-20T18:40:00.000Z" })).toBe(false);
  });

  it("el body: nota limpia o ausente, «Otro» con nota, y el tope de 200", () => {
    expect(cuerpoNoEntregado("NO_CONTESTA", "")).toEqual({ ok: true, body: { motivo: "NO_CONTESTA" } });
    expect(cuerpoNoEntregado("OTRO", "  ")).toMatchObject({ ok: false });
    expect(cuerpoNoEntregado("OTRO", "Se cayó la moto")).toEqual({ ok: true, body: { motivo: "OTRO", nota: "Se cayó la moto" } });
    expect(cuerpoNoEntregado("DIRECCION", "x".repeat(201))).toMatchObject({ ok: false });
  });

  it("un motivo que esta versión no conoce se muestra tal cual", () => {
    expect(textoMotivo("NO_CONTESTA")).toBe("No contesta");
    expect(textoMotivo("CERRADO")).toBe("CERRADO");
    expect(textoMotivo(null)).toBe("Sin motivo");
  });
});
