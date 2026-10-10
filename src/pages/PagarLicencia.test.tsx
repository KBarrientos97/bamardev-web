import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CobroQr, OpcionesPagoLicencia } from "../types";

/**
 * El pago de la licencia por QR (el de Omar, en gracia, desde la barra de
 * aviso). Pase de octubre: "Cubre hasta el …" no aparecía nunca junto al QR:
 * `generar` leía las opciones de un cierre viejo, cuando todavía eran null.
 */

const OPCIONES: OpcionesPagoLicencia = {
  plan: "BASICO",
  moneda: "BOB",
  vencimientoActual: "2026-10-07",
  vencida: true,
  opciones: [
    { periodo: "MENSUAL", meses: 1, total: 200, mensualEquivalente: 200, ahorro: 0, descuento: 0, cubreHasta: "2026-11-07" },
    { periodo: "ANUAL", meses: 12, total: 2040, mensualEquivalente: 170, ahorro: 360, descuento: 0.15, cubreHasta: "2027-10-07" },
  ],
};

const COBRO = {
  alias: "pollosqa",
  monto: 200,
  moneda: "BOB",
  periodo: "MENSUAL",
  meses: 1,
  estado: "PENDIENTE",
  venceEn: "2099-01-01T00:00:00.000Z",
  imagenQr: null,
} as unknown as CobroQr;

vi.mock("../lib/api", () => ({
  api: {
    opcionesPagoLicencia: vi.fn(async () => OPCIONES),
    generarQrLicencia: vi.fn(async () => COBRO),
    estadoQrLicencia: vi.fn(async () => ({ ...COBRO, pagadoEn: null })),
  },
}));

import { api } from "../lib/api";
import PagarLicencia from "./PagarLicencia";

describe("pagar la licencia por QR", () => {
  it("junto al QR dice hasta cuándo cubre el plazo elegido", async () => {
    const { unmount } = render(<PagarLicencia aliasInicial="pollosqa" onSalir={() => {}} />);
    await act(async () => {});
    fireEvent.click(screen.getByText("1 mes", { exact: false }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generar QR" }));
    });
    expect(api.generarQrLicencia).toHaveBeenCalledWith("pollosqa", "MENSUAL");
    expect(screen.getByText("Cubre hasta el 07/11/2026")).toBeInTheDocument();
    unmount();
  });
});
