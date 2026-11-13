import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mesa } from "../../types/salon";

/**
 * El mesero que cobra una mesa y las cajas abiertas del local: con varias (de
 * distintos usuarios) tiene que elegir a cuál va la cuenta; con una sola va a
 * ella sin preguntar. Con la pantalla de cobro de verdad: lo que se prueba es
 * lo que viaja.
 */

vi.mock("../../store/AuthContext", async () => {
  const { permisosDe } = await import("../../test/sesiones");
  const features = ["pos", "salon", "mesero_cobra", "multi_almacen"];
  return {
    useAuth: () => ({
      negocio: { id: 1, tipoNegocio: "RESTAURANTE", features, sucursalesActivas: 2 },
      usuario: { id: 7, username: "carla", rol: "MESERO", sucursalId: 38, ...permisosDe("MESERO") },
      incluye: (f: string) => features.includes(f),
    }),
  };
});

vi.mock("../../lib/api", () => ({
  api: {
    getFormasPago: vi.fn(),
    cobrarMesa: vi.fn(),
    mesa: vi.fn(),
    cajasDelLocal: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import CobrarMesa from "./CobrarMesa";

function mesa(p: Partial<Mesa> = {}): Mesa {
  return {
    id: 1,
    codigo: "M1",
    nombre: "Mesa M1",
    zonaCodigo: "salon",
    zonaNombre: "Salón",
    capacidad: 4,
    capacidadTotal: 4,
    unidas: [],
    activa: true,
    estado: "CUENTA",
    meseroId: 7,
    comensales: 2,
    consumo: 52,
    propina: 0,
    comandas: [],
    sucursalId: 38,
    ...p,
  };
}

const caja = (id: number, nombre: string, usuarioId = id) => ({
  id,
  fechaApertura: "2026-11-13T12:30:00.000Z",
  usuario: { id: usuarioId, nombre },
});

async function montar(props: Partial<Parameters<typeof CobrarMesa>[0]> = {}) {
  const onCobrada = vi.fn();
  render(
    <CobrarMesa
      mesa={mesa()}
      onAtras={() => {}}
      onCobrada={onCobrada}
      onCuentaCambiada={() => {}}
      {...props}
    />,
  );
  await act(async () => {});
  return { onCobrada };
}

const escribir = (etiqueta: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

const botonConfirmar = () => screen.getByRole("button", { name: /Confirmar cobro/ });

async function confirmar() {
  await act(async () => {
    fireEvent.click(botonConfirmar());
  });
}

const elegir = (nombre: RegExp) =>
  act(async () => {
    fireEvent.click(screen.getByRole("radio", { name: nombre }));
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getFormasPago).mockResolvedValue([
    { id: 10, nombre: "Efectivo" },
    { id: 11, nombre: "QR" },
  ] as never);
  vi.mocked(api.cobrarMesa).mockResolvedValue({ id: 99 } as never);
  vi.mocked(api.mesa).mockResolvedValue(mesa({ estado: "PAGADA" }));
});

describe("el mesero y las cajas abiertas del local", () => {
  it("con varias cajas pregunta a cuál va la cuenta y sin elegir no deja cobrar", async () => {
    vi.mocked(api.cajasDelLocal).mockResolvedValue({
      cajas: [caja(31, "Ana"), caja(32, "Luis")],
    });
    await montar();

    expect(api.cajasDelLocal).toHaveBeenCalledWith(38);
    expect(screen.getByText("¿A qué caja va esta cuenta?")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Caja de Ana/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: /Caja de Luis/ })).toHaveAttribute("aria-checked", "false");

    escribir(/Efectivo recibido/, "60");
    expect(botonConfirmar()).toBeDisabled();
    expect(api.cobrarMesa).not.toHaveBeenCalled();
  });

  it("al elegir una caja cobra y manda su id como cajaId", async () => {
    vi.mocked(api.cajasDelLocal).mockResolvedValue({
      cajas: [caja(31, "Ana"), caja(32, "Luis")],
    });
    await montar();

    await elegir(/Caja de Luis/);
    expect(screen.getByRole("radio", { name: /Caja de Luis/ })).toHaveAttribute("aria-checked", "true");
    escribir(/Efectivo recibido/, "60");
    await confirmar();

    expect(api.cobrarMesa).toHaveBeenCalledWith(1, {
      pagos: [{ formaPagoId: 10, monto: 52, recibido: 60 }],
      totalEsperado: 52,
      clienteRequestId: expect.any(String),
      cajaId: 32,
    });
  });

  it("con una sola caja abierta no pregunta nada y no manda cajaId", async () => {
    vi.mocked(api.cajasDelLocal).mockResolvedValue({ cajas: [caja(31, "Ana")] });
    await montar();

    expect(screen.queryByText("¿A qué caja va esta cuenta?")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    escribir(/Efectivo recibido/, "60");
    await confirmar();

    expect(vi.mocked(api.cobrarMesa).mock.calls[0][1]).not.toHaveProperty("cajaId");
  });

  it("sin cajas legibles (sin señal) no pregunta y cobra como siempre", async () => {
    vi.mocked(api.cajasDelLocal).mockRejectedValue(new Error("Sin internet."));
    await montar();

    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    escribir(/Efectivo recibido/, "60");
    await confirmar();
    expect(vi.mocked(api.cobrarMesa).mock.calls[0][1]).not.toHaveProperty("cajaId");
  });

  it("si la mesa no dice su local usa el del mesero para buscar las cajas", async () => {
    vi.mocked(api.cajasDelLocal).mockResolvedValue({ cajas: [] });
    await montar({ mesa: mesa({ sucursalId: undefined }) });
    expect(api.cajasDelLocal).toHaveBeenCalledWith(38);
  });

  it("el panel puede pasar el local de la mesa y ése manda", async () => {
    vi.mocked(api.cajasDelLocal).mockResolvedValue({ cajas: [] });
    await montar({ mesa: mesa({ sucursalId: undefined }), sucursalId: 40 });
    expect(api.cajasDelLocal).toHaveBeenCalledWith(40);
  });

  it("si la caja elegida se cerró, avisa, vuelve a leer las cajas y pide elegir de nuevo", async () => {
    vi.mocked(api.cajasDelLocal)
      .mockResolvedValueOnce({ cajas: [caja(31, "Ana"), caja(32, "Luis")] })
      .mockResolvedValue({ cajas: [caja(31, "Ana"), caja(33, "Marta")] });
    vi.mocked(api.cobrarMesa).mockRejectedValueOnce(
      new Error("La caja que elegiste ya se cerró: elegí otra."),
    );
    const { onCobrada } = await montar();

    await elegir(/Caja de Luis/);
    escribir(/Efectivo recibido/, "60");
    await confirmar();

    // Avisó, no cobró, y volvió a preguntar con la lista nueva (sin Luis).
    expect(onCobrada).not.toHaveBeenCalled();
    expect(screen.getByText(/La caja que elegiste ya se cerró/)).toBeInTheDocument();
    expect(api.cajasDelLocal).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("radio", { name: /Caja de Luis/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Caja de Marta/ })).toHaveAttribute("aria-checked", "false");
    expect(botonConfirmar()).toBeDisabled();

    // Lo recibido quedó en pantalla: sólo falta elegir otra caja y cobrar.
    expect((screen.getByLabelText(/Efectivo recibido/) as HTMLInputElement).value).toBe("60");
    await elegir(/Caja de Marta/);
    await confirmar();
    expect(vi.mocked(api.cobrarMesa).mock.calls[1][1]).toMatchObject({ cajaId: 33 });
    expect(onCobrada).toHaveBeenCalled();
  });
});
