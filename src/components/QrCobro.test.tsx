import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El QR de cobro en la apertura de caja: a quién más le llega. En un salón de
 * belleza no hay meseros (QA B-21); un restaurante lee lo de siempre.
 */

const sesion = vi.hoisted(() => ({
  rubro: "RESTAURANTE" as string,
  features: [] as string[],
}));

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    negocio: { alias: "prueba", features: sesion.features },
    usuario: { rol: "ADMIN" },
  }),
}));

vi.mock("../lib/qrPago", () => ({
  leerQr: vi.fn(() => null),
  borrarQr: vi.fn(),
  guardarQr: vi.fn(),
  quitarQrDelNegocio: vi.fn(),
  sincronizarQr: vi.fn(async () => null),
  subirQr: vi.fn(),
}));

import { CargarQrCobro } from "./QrCobro";

async function montar() {
  render(<CargarQrCobro />);
  await act(async () => {});
}

beforeEach(() => {
  sesion.rubro = "RESTAURANTE";
  sesion.features = [];
});

describe("QR de cobro: a quién más le llega", () => {
  it("restaurante: los meseros y el reparto, como siempre", async () => {
    sesion.features = ["pos", "salon", "delivery"];
    await montar();
    expect(screen.getByText("Lo reciben también los meseros y el reparto.")).toBeInTheDocument();
  });

  it("farmacia: el texto de siempre", async () => {
    sesion.rubro = "FARMACIA";
    sesion.features = ["pos", "lotes"];
    await montar();
    expect(screen.getByText("Lo reciben también los meseros y el reparto.")).toBeInTheDocument();
  });

  it("peluquería sin salón ni reparto: no nombra a nadie", async () => {
    sesion.rubro = "PELUQUERIA";
    sesion.features = ["pos", "agenda"];
    await montar();
    expect(screen.queryByText(/Lo reciben también/)).not.toBeInTheDocument();
  });

  it("peluquería con reparto: sólo el reparto", async () => {
    sesion.rubro = "PELUQUERIA";
    sesion.features = ["pos", "agenda", "delivery"];
    await montar();
    expect(screen.getByText("Lo reciben también el reparto.")).toBeInTheDocument();
  });
});
