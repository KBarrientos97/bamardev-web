import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La ventana del QR del banco en la caja (dueño, 24-nov): apenas hay QR se abre
 * una ventana grande que sólo muestra el QR y el estado del pago; «Verificar
 * manualmente» aparece a los 30 s, no antes; y al entrar el pago la ventana
 * muestra «Pago recibido» y se cierra sola.
 */

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({ negocio: { id: 1, alias: "drickqa" }, usuario: { id: 1, username: "recepcion" } }),
}));
vi.mock("../lib/useSedeDeCobro", () => ({ useSedeDeCobro: () => ({ sedeId: null, listo: true }) }));
vi.mock("../lib/qrPago", () => ({
  borrarQr: vi.fn(),
  guardarQr: vi.fn(),
  leerQr: () => null,
  quitarQrDelNegocio: vi.fn(),
  sincronizarQr: vi.fn().mockResolvedValue(null),
  subirQr: vi.fn(),
}));

import { QrParaCobrar } from "./QrCobro";
import type { CobroBanco } from "../lib/cobroQrBanco";

function cobro(parcial: Partial<CobroBanco> = {}): CobroBanco {
  return {
    estado: "esperando",
    manda: true,
    id: 7,
    imagen: "data:image/png;base64,AAAA",
    venceEn: new Date(Date.now() + 10 * 60_000).toISOString(),
    error: "",
    verificar: vi.fn().mockResolvedValue(undefined),
    reintentar: vi.fn(),
    ...parcial,
  };
}

const montar = (banco: CobroBanco) =>
  render(<QrParaCobrar confirmado={false} onConfirmar={() => {}} monto="Bs 200,00" sinBoton banco={banco} />);
const avanzar = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("La ventana del QR del banco en la caja", () => {
  it("al haber QR abre una ventana grande con el monto y el QR", async () => {
    montar(cobro());
    await avanzar(0);
    const ventana = screen.getByRole("dialog");
    expect(ventana).toHaveTextContent("Bs 200,00");
    expect(ventana.querySelector("img")).not.toBeNull();
    expect(ventana).toHaveTextContent(/Esperando el pago/);
  });

  it("«Verificar manualmente» no está al principio: aparece a los 30 segundos", async () => {
    const banco = cobro();
    montar(banco);
    await avanzar(0);
    expect(screen.queryByRole("button", { name: /Verificar manualmente/ })).not.toBeInTheDocument();
    await avanzar(29_000);
    expect(screen.queryByRole("button", { name: /Verificar manualmente/ })).not.toBeInTheDocument();
    await avanzar(1_100);
    const boton = screen.getByRole("button", { name: /Verificar manualmente/ });
    await act(async () => {
      fireEvent.click(boton);
    });
    expect(banco.verificar).toHaveBeenCalledTimes(1);
  });

  it("cerrar la ventana deja el QR y el estado en la pantalla de cobro, y se puede volver a abrir", async () => {
    montar(cobro());
    await avanzar(0);
    fireEvent.click(screen.getByRole("button", { name: /Cerrar/i }));
    await avanzar(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/Esperando el pago/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Ver el QR en grande"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("al entrar el pago muestra «Pago recibido» y la ventana se cierra sola", async () => {
    const { rerender } = montar(cobro());
    await avanzar(0);
    rerender(<QrParaCobrar confirmado={false} onConfirmar={() => {}} monto="Bs 200,00" sinBoton banco={cobro({ estado: "pagado" })} />);
    await avanzar(0);
    expect(screen.getByRole("dialog")).toHaveTextContent(/Pago recibido/);
    await avanzar(2_600);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/Pago recibido/)).toBeInTheDocument();
  });
});
