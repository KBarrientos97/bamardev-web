import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CobroQr, OpcionesPagoLicencia } from "../types";

/**
 * El pago de la licencia por QR.
 *
 * - Pase de octubre: "Cubre hasta el …" no aparecía nunca junto al QR:
 *   `generar` leía las opciones de un cierre viejo, cuando todavía eran null.
 * - 13-oct, a pedido del dueño: el alias se escribe SIEMPRE, como en Android.
 *   Antes se salteaba el paso con el del login o el recordado del navegador,
 *   y se veía el precio de un negocio que nadie había escrito.
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

/** Escribe el alias y pide los plazos, como lo haría el dueño. */
async function escribirAlias(texto: string) {
  fireEvent.change(screen.getByPlaceholderText("pollosdonomar"), {
    target: { value: texto },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ver el precio" }));
  });
}

describe("pagar la licencia por QR", () => {
  beforeEach(() => {
    vi.mocked(api.opcionesPagoLicencia).mockClear();
    vi.mocked(api.generarQrLicencia).mockClear();
  });

  it("arranca pidiendo el alias, vacío y sin consultar ningún precio", async () => {
    render(<PagarLicencia onSalir={() => {}} />);
    await act(async () => {});
    expect(screen.getByPlaceholderText("pollosdonomar")).toHaveValue("");
    expect(api.opcionesPagoLicencia).not.toHaveBeenCalled();
    expect(screen.queryByText("Elegí tu plazo")).not.toBeInTheDocument();
  });

  it("con el alias escrito muestra el negocio y sus plazos, y le cobra a ese", async () => {
    render(<PagarLicencia onSalir={() => {}} />);
    // Como lo tipea cualquiera en el celular: mayúscula inicial y un espacio.
    await escribirAlias("  PollosQA ");
    expect(api.opcionesPagoLicencia).toHaveBeenCalledWith("pollosqa");
    expect(screen.getByText("Elegí tu plazo")).toBeInTheDocument();
    expect(screen.getByText("pollosqa")).toBeInTheDocument();

    fireEvent.click(screen.getByText("1 mes", { exact: false }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generar QR" }));
    });
    expect(api.generarQrLicencia).toHaveBeenCalledWith("pollosqa", "MENSUAL");
    // Junto al QR, hasta cuándo cubre el plazo elegido.
    expect(screen.getByText("Cubre hasta el 07/11/2026")).toBeInTheDocument();
  });

  it("un alias con formato imposible se avisa sin llamar al backend", async () => {
    render(<PagarLicencia onSalir={() => {}} />);
    await escribirAlias("pollos don omar");
    expect(api.opcionesPagoLicencia).not.toHaveBeenCalled();
    expect(screen.getByText(/Alias no válido/)).toBeInTheDocument();
  });

  it("si el negocio no existe se queda en el alias con el error del backend", async () => {
    vi.mocked(api.opcionesPagoLicencia).mockRejectedValueOnce(
      new Error("No encontramos ese negocio. Revisá el alias con el que entrás al sistema."),
    );
    render(<PagarLicencia onSalir={() => {}} />);
    await escribirAlias("noexiste");
    expect(screen.getByText(/No encontramos ese negocio/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("pollosdonomar")).toBeInTheDocument();
  });

  it("«Cambiar» vuelve al alias para escribir otro negocio", async () => {
    render(<PagarLicencia onSalir={() => {}} />);
    await escribirAlias("pollosqa");
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    expect(screen.queryByText("Elegí tu plazo")).not.toBeInTheDocument();
    await escribirAlias("otronegocio");
    expect(api.opcionesPagoLicencia).toHaveBeenLastCalledWith("otronegocio");
  });
});
