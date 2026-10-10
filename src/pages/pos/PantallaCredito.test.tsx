import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClienteCredito, FormaPago } from "../../types";

/**
 * El fiado que pasa el techo del cliente pide la firma (PIN) de un encargado.
 * Pase de octubre: la firma se guardaba y se reusaba en silencio. Con un PIN
 * mal tipeado, cada "Registrar fiado" volvía a mandar el mismo PIN malo sin
 * mostrar el diálogo, hasta que el backend bloqueaba los PIN de ese cajero
 * por 15 minutos (429 PIN_BLOQUEADO), anular incluido.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, username: "omar", rol: "ADMIN", permisos: ["autorizar.pin"], permisosPropios: [] },
    incluye: () => true,
  }),
}));

vi.mock("../../components/QrCobro", () => ({ QrParaCobrar: () => null }));

const ROSA: ClienteCredito = {
  id: 5,
  nombre: "Rosa",
  telefono: null,
  nota: null,
  saldoTotal: 40,
  montoVencido: 0,
  creditosAbiertos: 1,
  vecesFiado: 3,
  limiteCredito: 50,
  disponible: 10,
};

vi.mock("../../lib/api", () => ({
  api: { getClientesCredito: vi.fn(async () => [ROSA]) },
}));

import PantallaCredito from "./PantallaCredito";

const FORMAS = [
  { id: 1, nombre: "Efectivo" },
  { id: 2, nombre: "QR" },
] as FormaPago[];

const onConfirmar = vi.fn();

function pantalla(error = "") {
  return (
    <PantallaCredito
      total={100}
      formasPago={FORMAS}
      onAtras={() => {}}
      onConfirmar={onConfirmar}
      enviando={false}
      error={error}
    />
  );
}

beforeEach(() => {
  onConfirmar.mockClear();
});

describe("fiado sobre el techo del cliente", () => {
  it("un PIN rechazado por el backend no se vuelve a mandar solo: se pide otra vez", async () => {
    const { rerender } = render(pantalla());
    await act(async () => {});
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar fiado/ }));

    // Firma el encargado (con un PIN equivocado).
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "1111" } });
    fireEvent.click(screen.getByRole("button", { name: "Autorizar" }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onConfirmar.mock.calls[0][0]).toMatchObject({ autorizadorUsername: "omar", autorizadorPin: "1111" });

    // El backend lo rechaza; la cajera vuelve a tocar "Registrar fiado".
    rerender(pantalla("Usuario o PIN incorrecto"));
    fireEvent.click(screen.getByRole("button", { name: /Registrar fiado/ }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Autorización del encargado")).toBeInTheDocument();
  });

  it("en mixto, arriba dice el adelanto entero (efectivo + QR)", async () => {
    render(pantalla());
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Mixto/i }));
    fireEvent.change(screen.getByLabelText(/^Adelanto/), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText(/^Parte pagada por QR/), { target: { value: "30" } });
    expect(screen.getByText(/adelanta Bs\s?50/)).toBeInTheDocument();
  });
});
