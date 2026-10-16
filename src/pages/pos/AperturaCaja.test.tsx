import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La apertura de caja con la sucursal que propone la pantalla de atrás (el
 * tablero del billar, 13-oct). El POS no la pasa y sigue igual: la principal.
 */

const suc = vi.hoisted(() => ({ elegir: true, rubro: "BILLAR" }));
const abrirCaja = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", async (original) => ({
  ...(await original<typeof import("../../lib/api")>()),
  api: { abrirCaja },
}));

vi.mock("../../lib/useSucursales", () => ({
  useSucursales: () => ({
    elegir: suc.elegir,
    sucursales: [
      { id: 1, nombre: "Centro", esPrincipal: true },
      { id: 2, nombre: "Norte", esPrincipal: false },
    ],
    sugerida: { id: 1, nombre: "Centro", esPrincipal: true },
  }),
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: suc.rubro,
    // El instituto con sus features (sin salón ni reparto); la lista vacía falla abierta.
    negocio: { alias: "prueba", features: suc.rubro === "ACADEMIA" ? ["pos", "caja", "academia"] : [] },
    usuario: { nombre: "Dueña", sucursalId: null, permisos: [] },
  }),
}));

vi.mock("../../lib/qrPago", () => ({
  leerQr: vi.fn(() => null),
  borrarQr: vi.fn(),
  guardarQr: vi.fn(),
  quitarQrDelNegocio: vi.fn(),
  sincronizarQr: vi.fn(async () => null),
  subirQr: vi.fn(),
}));

import AperturaCaja from "./AperturaCaja";

async function abrirCon(props: Partial<Parameters<typeof AperturaCaja>[0]> = {}) {
  const onAbierta = vi.fn();
  render(<AperturaCaja onAbierta={onAbierta} {...props} />);
  await act(async () => {});
  fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "100" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Abrir caja/ }));
  });
  return onAbierta;
}

beforeEach(() => {
  suc.elegir = true;
  suc.rubro = "BILLAR";
  abrirCaja.mockReset();
  abrirCaja.mockImplementation(async (input: { almacenId?: number }) => ({ id: 5, almacenId: input.almacenId ?? 1 }));
});

describe("AperturaCaja: la sucursal", () => {
  it("sin propuesta, la principal, como siempre", async () => {
    await abrirCon();
    expect(abrirCaja).toHaveBeenCalledWith(expect.objectContaining({ almacenId: 1 }));
  });

  it("propone la del tablero que se estaba mirando, y avisa en cuál quedó la caja", async () => {
    const onAbierta = await abrirCon({ sucursalInicial: 2 });
    expect(screen.getByRole("combobox")).toHaveValue("2");
    expect(abrirCaja).toHaveBeenCalledWith(expect.objectContaining({ almacenId: 2 }));
    expect(onAbierta).toHaveBeenCalledWith({ id: 5, almacenId: 2 });
  });

  it("una propuesta que ya no está en la lista (se desactivó) cae en la principal", async () => {
    await abrirCon({ sucursalInicial: 99 });
    expect(abrirCaja).toHaveBeenCalledWith(expect.objectContaining({ almacenId: 1 }));
  });

  it("con un solo local no se elige ni se manda nada", async () => {
    suc.elegir = false;
    await abrirCon({ sucursalInicial: 1 });
    expect(abrirCaja.mock.calls[0][0]).not.toHaveProperty("almacenId");
  });
});

describe("el vocabulario del rubro", () => {
  it("en un instituto la sucursal es la sede, y el QR no nombra meseros ni reparto", async () => {
    suc.rubro = "ACADEMIA";
    render(<AperturaCaja onAbierta={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByText("Sede")).toBeInTheDocument();
    expect(screen.queryByText("Sucursal")).not.toBeInTheDocument();
    expect(screen.queryByText(/Lo reciben también/)).not.toBeInTheDocument();
  });

  it("en los demás rubros, la sucursal de siempre", async () => {
    render(<AperturaCaja onAbierta={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByText("Sucursal")).toBeInTheDocument();
  });
});
