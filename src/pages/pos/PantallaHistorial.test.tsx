import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja, CupoEstado, Venta } from "../../types";
import { cupoEmprendedor } from "../../test/cupoFixtures";

/**
 * El detalle de una venta en "Ventas del turno".
 *
 * En bamardev-restaurant cada renglón dice si fue para la mesa o para llevar,
 * como siempre. En una farmacia no hay mesas: la venta se guarda como de local
 * y cada medicamento salía marcado "Mesa".
 */

const sesion = vi.hoisted(() => ({
  rubro: "RESTAURANTE" as string | undefined,
  cupo: null as CupoEstado | null,
  refrescarCupo: vi.fn(async () => {}),
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    // Quien autoriza con PIN se autoriza a sí mismo (no le pide usuario).
    usuario: { rol: "ADMIN", permisos: ["ventas.anular", "autorizar.pin"] },
    puede: () => false,
    incluye: () => true,
    cupo: sesion.cupo,
    refrescarCupo: sesion.refrescarCupo,
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
  sesion.cupo = null;
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

describe("peluquería (QA ronda 1)", () => {
  it("M-09: los renglones no dicen Mesa ni Llevar", async () => {
    sesion.rubro = "PELUQUERIA";
    await abrirDetalle();
    expect(screen.queryByText("Mesa")).not.toBeInTheDocument();
    expect(screen.queryByText("Llevar")).not.toBeInTheDocument();
  });

  it("B-21: anular no promete devolver stock de servicios", async () => {
    sesion.rubro = "PELUQUERIA";
    await abrirDetalle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    });
    const dialogo = screen.getByRole("dialog", { name: "Anular venta" });
    expect(dialogo).toHaveTextContent("si tenía productos, vuelven al inventario");
    expect(dialogo).not.toHaveTextContent("el stock vuelve al inventario");
  });

  it("restaurante: el texto de siempre", async () => {
    sesion.rubro = "RESTAURANTE";
    await abrirDetalle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    });
    expect(screen.getByRole("dialog", { name: "Anular venta" })).toHaveTextContent(
      "La venta queda anulada y el stock vuelve al inventario.",
    );
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

describe("QA PER-08: el recibo de una venta de mostrador se vuelve a dar", () => {
  it("una venta cobrada en el local ofrece el comprobante y lo abre con la venta completa", async () => {
    const onVerComprobante = vi.fn();
    render(
      <MemoryRouter>
        <PantallaHistorial
          caja={{ id: 1 } as Caja}
          onAtras={() => {}}
          onCierre={() => {}}
          onVerComprobante={onVerComprobante}
        />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /T-0007/ }));
    await screen.findByText("Pollo entero");
    fireEvent.click(screen.getByRole("button", { name: "Ver comprobante" }));
    expect(onVerComprobante).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it("una anulada no", async () => {
    const anulada = { ...venta, estado: "ANULADO" } as Venta;
    vi.mocked(api.getVentas).mockResolvedValue([anulada]);
    vi.mocked(api.getVenta).mockResolvedValue(anulada);
    await abrirDetalle();
    expect(screen.queryByRole("button", { name: "Ver comprobante" })).not.toBeInTheDocument();
  });
});

describe("QA DIA-15: un fiado no figura como una venta pagada en efectivo", () => {
  const listar = async () => {
    render(
      <MemoryRouter>
        <PantallaHistorial caja={{ id: 1 } as Caja} onAtras={() => {}} onCierre={() => {}} onVerComprobante={() => {}} />
      </MemoryRouter>,
    );
    return (await screen.findByRole("button", { name: /T-0007/ })).textContent;
  };
  const credito = { montoTotal: 70, adelanto: 20, saldo: 50 } as Venta["credito"];

  it("con adelanto dice cuánto se pagó y cuánto quedó fiado", async () => {
    vi.mocked(api.getVentas).mockResolvedValue([{ ...venta, total: 70, credito }]);
    expect(await listar()).toMatch(/Efectivo Bs.20,00 · Fiado Bs.50,00/);
  });

  it("sin adelanto, «Fiado/Crédito»", async () => {
    vi.mocked(api.getVentas).mockResolvedValue([
      { ...venta, formasPago: [], pagos: [], credito: { ...credito!, adelanto: 0 } },
    ]);
    expect(await listar()).toMatch(/Fiado\/Crédito/);
  });

  it("una venta pagada, como siempre", async () => {
    const texto = await listar();
    expect(texto).toMatch(/· Efectivo/);
    expect(texto).not.toMatch(/Fiado/);
  });
});

describe("Plan Emprendedor: anular devuelve el lugar del día (D10)", () => {
  async function anularLaVenta() {
    vi.mocked(api.anularVenta).mockResolvedValue({ ...venta, estado: "ANULADO" } as Venta);
    await abrirDetalle();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    });
    const dialogo = screen.getByRole("dialog", { name: "Anular venta" });
    fireEvent.change(within(dialogo).getByLabelText("PIN de autorización"), { target: { value: "1234" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Devolución del cliente" }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    });
    expect(api.anularVenta).toHaveBeenCalled();
  }

  it("con cupo, después de anular se vuelve a pedir el contador (si no, el POS seguía bloqueado)", async () => {
    sesion.cupo = cupoEmprendedor({ ventas: 50, saldo: 0 });
    await anularLaVenta();
    expect(sesion.refrescarCupo).toHaveBeenCalledTimes(1);
  });

  it("sin cupo (Básico, Profesional) no pide nada de más", async () => {
    await anularLaVenta();
    expect(sesion.refrescarCupo).not.toHaveBeenCalled();
  });
});
