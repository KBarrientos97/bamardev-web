import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
  SESION_VENCIDA_KEY: "bamardev_web_sesion_vencida",
  api: {
    opcionesPagoLicencia: vi.fn(),
    generarQrLicencia: vi.fn(),
    estadoQrLicencia: vi.fn(),
  },
}));

import { api } from "../lib/api";
import Login from "./Login";

// El login lee la dirección (el alias de `?negocio=`): necesita un router.
const conRouter = () => (
  <MemoryRouter>
    <Login />
  </MemoryRouter>
);

describe("login → pagar la licencia", () => {
  it("el pago arranca con el alias vacío aunque el login lo recuerde", async () => {
    render(conRouter());
    // El login sí lo recuerda: es para entrar, no para pagar.
    expect(screen.getByPlaceholderText("cafeteriakevin")).toHaveValue("pollosdonomar");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pagar la licencia con QR" }));
    });

    expect(screen.getByPlaceholderText("pollosdonomar")).toHaveValue("");
    expect(api.opcionesPagoLicencia).not.toHaveBeenCalled();
  });
});

describe("login después de que se cortó la sesión", () => {
  it("dice que la sesión se cerró, una sola vez", () => {
    // Prueba profunda del 18-oct: el token dura 7 días y vence en pleno
    // turno; el login aparecía limpio, sin decir por qué.
    localStorage.setItem("bamardev_web_sesion_vencida", "1");
    const { unmount } = render(conRouter());
    expect(screen.getByRole("status")).toHaveTextContent("Tu sesión se cerró. Volvé a entrar para seguir.");
    expect(localStorage.getItem("bamardev_web_sesion_vencida")).toBeNull();
    unmount();
    render(conRouter());
    expect(screen.queryByText(/Tu sesión se cerró/)).not.toBeInTheDocument();
  });
});
