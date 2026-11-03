import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { historialDePagos, reciboDelCobro } from "../lib/historialPagos";
import type { CreditoDetalle } from "../types";

/**
 * Los tres papeles de una cuenta a crédito: el que firma el cliente, el recibo
 * de cada pago y la constancia de cuenta saldada (paridad con
 * `ComprobanteCreditoDialog` de la app).
 */

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({ negocio: { nombre: "Pollos Omar" } }),
}));
vi.mock("../lib/compartirTicket", () => ({ compartirComoImagen: vi.fn() }));

import ComprobanteCredito from "./ComprobanteCredito";

/** Fechas en hora local: el papel se lee en el día del negocio, sea cual sea la zona del equipo. */
const local = (mes: number, dia: number, hora = 15) => new Date(2026, mes - 1, dia, hora).toISOString();

/** Bs 135: dos pollos y una gaseosa, Bs 35 de adelanto y un abono de Bs 50. */
const cuenta: CreditoDetalle = {
  id: 7,
  codigo: "CR00007",
  ventaId: 90,
  comprobante: "V-000123",
  fechaVenta: local(10, 20),
  clienteId: 5,
  clienteNombre: "Rosa Mamani",
  clienteTelefono: "71234567",
  montoTotal: 135,
  adelanto: 35,
  pagado: 85,
  saldo: 50,
  fechaCompromiso: local(10, 31, 23),
  estado: "ABONADO",
  vencido: false,
  registradoPor: "Omar",
  detalles: [
    { producto: "Pollo entero", cantidad: 2, precio: 60, subtotal: 120 },
    { producto: "Gaseosa 2L", cantidad: 1, precio: 15, subtotal: 15 },
  ],
  pagos: [{ id: 11, monto: 50, formaPago: "Efectivo", fecha: local(10, 22), usuario: "Caja 1" }],
};

/** La misma cuenta, saldada con un abono más por QR. */
const saldada: CreditoDetalle = {
  ...cuenta,
  pagado: 135,
  saldo: 0,
  estado: "PAGADO",
  pagos: [...cuenta.pagos!, { id: 12, monto: 50, formaPago: "QR", fecha: local(10, 27), usuario: "Omar" }],
};

/** El valor de la fila con esa etiqueta, tal como sale en el papel. */
function valorDe(etiqueta: string): string | null {
  return screen.getByText(etiqueta).closest("div")!.querySelector("dd")!.textContent;
}

/** Lo que dice el papel, como número: "-Bs 1.500,50" → -1500.5. */
function monto(texto: string | null): number {
  const limpio = (texto ?? "").replace(/[^\d,-]/g, "").replace(",", ".");
  return Number(limpio);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Hoy es el 28-oct: la venta fue el 20.
  vi.setSystemTime(new Date(2026, 9, 28, 16, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CRE-5 / C-02 / BUG-finanzas-3: el comprobante que firma el cliente", () => {
  it("lista lo que se llevó, con el unitario sólo si llevó más de uno", () => {
    render(<ComprobanteCredito credito={cuenta} tipo="COMPROMISO" onClose={() => {}} />);
    expect(screen.getByText("2 × Pollo entero")).toBeInTheDocument();
    expect(screen.getByText("Bs 120,00")).toBeInTheDocument();
    expect(screen.getByText("Bs 60,00 c/u")).toBeInTheDocument();
    expect(screen.getByText("1 × Gaseosa 2L")).toBeInTheDocument();
    expect(screen.queryByText("Bs 15,00 c/u")).not.toBeInTheDocument();
  });

  it("reimpreso después de un abono, cierra: total − adelanto − abonos = saldo", () => {
    // Antes decía Monto total, Adelanto y "Queda debiendo" con el saldo de
    // hoy: 135 − 35 no daba los 50 que decía deber y nada lo explicaba.
    render(<ComprobanteCredito credito={cuenta} tipo="COMPROMISO" onClose={() => {}} />);
    expect(valorDe("Total")).toBe("Bs 135,00");
    expect(valorDe("Adelanto recibido")).toBe("-Bs 35,00");
    expect(valorDe("Abonos recibidos (1)")).toBe("-Bs 50,00");
    expect(valorDe("Saldo a pagar")).toBe("Bs 50,00");
    expect(
      monto(valorDe("Total")) + monto(valorDe("Adelanto recibido")) + monto(valorDe("Abonos recibidos (1)")),
    ).toBe(monto(valorDe("Saldo a pagar")));
  });

  it("lleva la fecha de la venta (no la de impresión) y avisa que se reimprimió otro día", () => {
    render(<ComprobanteCredito credito={cuenta} tipo="COMPROMISO" onClose={() => {}} />);
    expect(valorDe("Fecha de la venta")).toBe("20/10/2026");
    expect(screen.getByText("Reimpreso el 28/10/2026 · saldo al día de hoy")).toBeInTheDocument();
    expect(valorDe("Se compromete a pagar el")).toBe("31/10/2026");
    expect(screen.getByText("Firma del cliente")).toBeInTheDocument();
    expect(screen.getByText("Atendió: Omar · ¡Gracias!")).toBeInTheDocument();
    expect(screen.getByText("CR00007 · V-000123")).toBeInTheDocument();
  });

  it("el mismo día de la venta y sin abonos, ni aviso de reimpresión ni fila de abonos", () => {
    const deHoy = { ...cuenta, fechaVenta: local(10, 28, 12), pagado: 35, saldo: 100, pagos: [] };
    render(<ComprobanteCredito credito={deHoy} tipo="COMPROMISO" onClose={() => {}} />);
    expect(screen.queryByText(/Reimpreso el/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Abonos recibidos/)).not.toBeInTheDocument();
    expect(valorDe("Saldo a pagar")).toBe("Bs 100,00");
  });
});

describe("C-01 / CRE-6: el recibo de un pago dice cómo quedó la cuenta ESE día", () => {
  it("un abono del medio: lo pagado hasta ahí, el saldo después y sin sello", () => {
    const [, abono] = historialDePagos(saldada);
    render(<ComprobanteCredito credito={saldada} tipo="RECIBO" pago={abono} onClose={() => {}} />);
    expect(valorDe("Abono recibido")).toBe("Bs 50,00");
    expect(valorDe("Pagado hasta acá")).toBe("Bs 85,00");
    // Hoy la cuenta está saldada, pero ese día quedaban Bs 50.
    expect(valorDe("Saldo pendiente")).toBe("Bs 50,00");
    expect(screen.queryByText("*** DEUDA CANCELADA ***")).not.toBeInTheDocument();
    expect(valorDe("Recibido el")).toMatch(/^22\/10\/2026/);
    // Quién cobró ese pago, no quién registró la venta. Y sin firma.
    expect(screen.getByText("Cobró: Caja 1 · ¡Gracias!")).toBeInTheDocument();
    expect(screen.queryByText("Firma del cliente")).not.toBeInTheDocument();
  });

  it("el pago que saldó la cuenta lleva el sello", () => {
    const pagos = historialDePagos(saldada);
    render(
      <ComprobanteCredito credito={saldada} tipo="RECIBO" pago={pagos[pagos.length - 1]} onClose={() => {}} />,
    );
    expect(valorDe("Saldo pendiente")).toBe("Bs 0,00");
    expect(screen.getByText("*** DEUDA CANCELADA ***")).toBeInTheDocument();
  });

  it("el adelanto tiene su recibo, sin inventarle la forma de pago", () => {
    const [adelanto] = historialDePagos(saldada);
    render(<ComprobanteCredito credito={saldada} tipo="RECIBO" pago={adelanto} onClose={() => {}} />);
    expect(valorDe("Adelanto al entregar")).toBe("Bs 35,00");
    expect(valorDe("Saldo pendiente")).toBe("Bs 100,00");
    expect(screen.queryByText("Forma de pago")).not.toBeInTheDocument();
    expect(valorDe("Recibido el")).toMatch(/^20\/10\/2026/);
  });
});

describe("BUG-finanzas-7: el recibo del abono dice la forma de pago", () => {
  it("un abono simple", () => {
    const [, abono] = historialDePagos(cuenta);
    render(<ComprobanteCredito credito={cuenta} tipo="RECIBO" pago={abono} onClose={() => {}} />);
    expect(valorDe("Forma de pago")).toBe("Efectivo");
  });

  it("un mixto dice qué parte entró por QR", () => {
    const pago = reciboDelCobro({
      antes: { saldo: 100, montoTotal: 135 },
      partes: [
        { formaPago: "Efectivo", monto: 30 },
        { formaPago: "QR", monto: 20 },
      ],
      despues: { saldo: 50 },
      fecha: local(10, 28),
      usuario: "Omar",
    });
    render(<ComprobanteCredito credito={cuenta} tipo="RECIBO" pago={pago} onClose={() => {}} />);
    expect(valorDe("Forma de pago")).toBe("Efectivo + QR");
    expect(valorDe("· Efectivo")).toBe("Bs 30,00");
    expect(valorDe("· QR")).toBe("Bs 20,00");
    expect(valorDe("Saldo pendiente")).toBe("Bs 50,00");
  });
});

describe("CRE-7: la constancia de cuenta saldada trae el detalle de los pagos", () => {
  it("fecha de emisión, fecha de la venta, último pago y cada pago con su fecha y su forma", () => {
    render(<ComprobanteCredito credito={saldada} tipo="CONSTANCIA" onClose={() => {}} />);
    expect(valorDe("Fecha de emisión")).toBe("28/10/2026");
    expect(valorDe("Fecha de la venta")).toBe("20/10/2026");
    expect(valorDe("Último pago")).toBe("27/10/2026");
    expect(valorDe("Deuda original")).toBe("Bs 135,00");
    expect(valorDe("20/10/2026 · Adelanto")).toBe("Bs 35,00");
    expect(valorDe("22/10/2026 · Efectivo")).toBe("Bs 50,00");
    expect(valorDe("27/10/2026 · QR")).toBe("Bs 50,00");
    expect(valorDe("Total pagado")).toBe("Bs 135,00");
    expect(valorDe("Saldo pendiente")).toBe("Ninguno");
    expect(screen.getByText("*** DEUDA CANCELADA ***")).toBeInTheDocument();
    // Firma el negocio: es quien da fe de que no le deben nada.
    expect(screen.getByText("Sello y firma del negocio")).toBeInTheDocument();
    expect(
      screen.getByText(/Se hace constar que Rosa Mamani pagó la totalidad de esta cuenta/),
    ).toBeInTheDocument();
  });
});
