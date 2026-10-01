import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja, Venta } from "../../types";

/**
 * El detalle de una venta en "Ventas del turno".
 *
 * En bamardev-restaurant cada renglón dice si fue para la mesa o para llevar,
 * como siempre. En una farmacia no hay mesas: la venta se guarda como de local
 * y cada medicamento salía marcado "Mesa".
 */

const sesion = vi.hoisted(() => ({ rubro: "RESTAURANTE" as string | undefined }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    usuario: { rol: "ADMIN" },
    puede: () => false,
    incluye: () => true,
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getVentas: vi.fn(),
    getVenta: vi.fn(),
    getPedidosPendientes: vi.fn(),
    getCreditos: vi.fn(),
    anularVenta: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import PantallaHistorial from "./PantallaHistorial";

const venta = {
  id: 7,
  comprobante: "T-0007",
  estado: "APROBADO",
  fecha: "2026-09-30T19:00:00",
  total: 80,
  items: 2,
  detalles: [
    {
      productoId: 1,
      producto: "Pollo entero",
      cantidad: 1,
      precio: 60,
      subtotal: 60,
      nota: "sin cebolla",
      consumo: "MESA",
    },
    {
      productoId: 2,
      producto: "Gaseosa 2L",
      cantidad: 1,
      precio: 20,
      subtotal: 20,
      nota: null,
      consumo: "LLEVAR",
    },
  ],
  pagos: [{ formaPago: "Efectivo", monto: 80 }],
  formasPago: ["Efectivo"],
  tipoPedido: "LOCAL",
  estadoEntrega: null,
  prepagado: false,
  clienteNombre: null,
  clienteDireccion: null,
  clienteTelefono: null,
  tarifaEnvio: 0,
  minutosEstimados: null,
  notaPedido: null,
  entregadoEn: null,
} as unknown as Venta;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getVentas).mockResolvedValue([venta]);
  vi.mocked(api.getVenta).mockResolvedValue(venta);
  vi.mocked(api.getPedidosPendientes).mockResolvedValue([]);
  vi.mocked(api.getCreditos).mockResolvedValue([]);
});

async function abrirDetalle() {
  render(
    <MemoryRouter>
      <PantallaHistorial
        caja={{ id: 1 } as Caja}
        onAtras={() => {}}
        onCierre={() => {}}
        onVerComprobante={() => {}}
      />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /T-0007/ }));
  await screen.findByText("Pollo entero");
}

describe("bamardev-restaurant: cada renglón dice mesa o llevar", () => {
  it("como siempre", async () => {
    sesion.rubro = "RESTAURANTE";
    await abrirDetalle();
    expect(screen.getByText("Mesa")).toBeInTheDocument();
    expect(screen.getByText("Llevar")).toBeInTheDocument();
    expect(screen.getByText("sin cebolla")).toBeInTheDocument();
  });
});

describe("farmacia: no hay mesas", () => {
  it("los renglones no dicen Mesa ni Llevar, y la nota sigue", async () => {
    sesion.rubro = "FARMACIA";
    await abrirDetalle();
    expect(screen.queryByText("Mesa")).not.toBeInTheDocument();
    expect(screen.queryByText("Llevar")).not.toBeInTheDocument();
    expect(screen.getByText("sin cebolla")).toBeInTheDocument();
  });
});

describe("anular una venta cobrada por QR (los dos rubros)", () => {
  // El bug: lo cobrado por QR no se podía anular. Anular no es devolver la
  // plata, es el asiento: bloquearlo dejaba el stock (y en farmacia el libro de
  // controlados) mintiendo, mientras el cliente igual se iba con su plata.
  const mixta = {
    ...venta,
    pagos: [
      { formaPago: "Efectivo", monto: 30 },
      { formaPago: "QR", monto: 50 },
    ],
    formasPago: ["Efectivo", "QR"],
  } as unknown as Venta;

  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
    vi.mocked(api.getVentas).mockResolvedValue([mixta]);
    vi.mocked(api.getVenta).mockResolvedValue(mixta);
    vi.mocked(api.anularVenta).mockResolvedValue({ ...mixta, estado: "ANULADO" } as Venta);
  });

  it("se ofrece anular, y el diálogo dice por dónde vuelve cada parte de la plata", async () => {
    await abrirDetalle();
    expect(screen.queryByText("Esta venta no se puede anular")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    });
    const dialogo = screen.getByRole("dialog", { name: "Anular venta" });
    expect(dialogo).toHaveTextContent(/Bs 50,00 por QR: devolvelos por QR o transferencia/);
    expect(dialogo).toHaveTextContent("No salen de la caja");
    expect(dialogo).toHaveTextContent(/Bs 30,00 en efectivo: salen de la caja/);
  });

  it("pide el motivo antes de anular, y lo manda con el PIN", async () => {
    await abrirDetalle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    });
    const dialogo = screen.getByRole("dialog", { name: "Anular venta" });
    fireEvent.change(within(dialogo).getByLabelText("PIN de autorización"), {
      target: { value: "1234" },
    });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    });
    expect(dialogo).toHaveTextContent("Elegí el motivo");
    expect(api.anularVenta).not.toHaveBeenCalled();

    fireEvent.click(within(dialogo).getByRole("button", { name: "Devolución del cliente" }));
    fireEvent.change(within(dialogo).getByLabelText("Detalle del motivo"), {
      target: { value: "no era el que quería" },
    });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    });
    expect(api.anularVenta).toHaveBeenCalledWith(7, {
      autorizadorPin: "1234",
      motivo: "Devolución del cliente · no era el que quería",
    });
  });

  it("una venta anulada dice el motivo", async () => {
    const anulada = {
      ...mixta,
      estado: "ANULADO",
      motivoAnulacion: "Error al cobrar",
      anulacionAutorizadaPor: "Regente",
    } as unknown as Venta;
    vi.mocked(api.getVentas).mockResolvedValue([anulada]);
    vi.mocked(api.getVenta).mockResolvedValue(anulada);
    await abrirDetalle();
    expect(screen.getByText("Motivo: Error al cobrar")).toBeInTheDocument();
    expect(screen.getByText("Autorizó: Regente")).toBeInTheDocument();
  });
});
