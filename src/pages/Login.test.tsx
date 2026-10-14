import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Del login al pago de la licencia (13-oct, pedido del dueño): el pago pide
 * el alias aunque el login lo tenga escrito o recordado. Antes lo heredaba y
 * mostraba el precio de ese negocio sin preguntar.
 */

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({ login: vi.fn(), aliasRecordado: "pollosdonomar" }),
}));

vi.mock("../lib/api", () => ({
  BLOQUEO_KEY: "bamardev_web_bloqueo",
  api: {
    opcionesPagoLicencia: vi.fn(),
    generarQrLicencia: vi.fn(),
    estadoQrLicencia: vi.fn(),
  },
}));

import { api } from "../lib/api";
import Login from "./Login";

describe("login → pagar la licencia", () => {
  it("el pago arranca con el alias vacío aunque el login lo recuerde", async () => {
    render(<Login />);
    // El login sí lo recuerda: es para entrar, no para pagar.
    expect(screen.getByPlaceholderText("cafeteriakevin")).toHaveValue("pollosdonomar");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pagar la licencia con QR" }));
    });

    expect(screen.getByPlaceholderText("pollosdonomar")).toHaveValue("");
    expect(api.opcionesPagoLicencia).not.toHaveBeenCalled();
  });
});
