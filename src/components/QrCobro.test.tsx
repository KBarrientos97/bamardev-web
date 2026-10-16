import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El QR de cobro en la apertura de caja: a quién más le llega. En un salón de
 * belleza no hay meseros (QA B-21); un restaurante lee lo de siempre.
 */

const sesion = vi.hoisted(() => ({
  rubro: "RESTAURANTE" as string,
  features: [] as string[],
  plantilla: "ADMIN" as "ADMIN" | "SUPERVISOR" | "CAJERO" | "MESERO",
}));

vi.mock("../store/AuthContext", async () => {
  // Los permisos de la plantilla de ese rol: la pantalla decide sólo con ellos.
  const { permisosDe } = await import("../test/sesiones");
  return {
    useAuth: () => ({
      rubro: sesion.rubro,
      negocio: { alias: "prueba", features: sesion.features },
      usuario: { rol: sesion.plantilla, ...permisosDe(sesion.plantilla) },
    }),
  };
});

vi.mock("../lib/qrPago", () => ({
  leerQr: vi.fn(() => null),
  borrarQr: vi.fn(),
  guardarQr: vi.fn(),
  quitarQrDelNegocio: vi.fn(),
  sincronizarQr: vi.fn(async () => null),
  subirQr: vi.fn(),
}));

import { leerQr, sincronizarQr } from "../lib/qrPago";
import { CargarQrCobro, QrParaCobrar } from "./QrCobro";

async function montar() {
  render(<CargarQrCobro />);
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rubro = "RESTAURANTE";
  sesion.features = [];
  sesion.plantilla = "ADMIN";
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

  it("sube el QR quien tiene `qr.configurar`; el mesero sólo lo recibe", async () => {
    await montar();
    expect(sincronizarQr).toHaveBeenLastCalledWith("prueba", true);
    sesion.plantilla = "MESERO";
    await montar();
    expect(sincronizarQr).toHaveBeenLastCalledWith("prueba", false);
  });
});

describe("qr.configurar es sólo del Administrador (16-oct)", () => {
  // El QR es la cuenta a la que entra la plata: el Encargado y el Cajero ya no
  // lo cambian. Lo ven (para saber que está), pero sin los botones.
  const QR = "data:image/png;base64,QR";
  function conQr() {
    vi.mocked(leerQr).mockReturnValue(QR);
    vi.mocked(sincronizarQr).mockResolvedValue(QR);
  }
  beforeEach(() => {
    vi.mocked(leerQr).mockReturnValue(null);
    vi.mocked(sincronizarQr).mockResolvedValue(null);
  });

  it("el Administrador lo sube, lo cambia y lo quita", async () => {
    conQr();
    await montar();
    expect(screen.getByRole("button", { name: "Cambiar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar" })).toBeInTheDocument();
  });

  it.each(["SUPERVISOR", "CAJERO"] as const)("el %s lo ve en la apertura, sin poder cambiarlo", async (rol) => {
    sesion.plantilla = rol;
    conQr();
    await montar();
    expect(screen.getByRole("img", { name: "QR de cobro del negocio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cambiar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
    // Tampoco sube la copia vieja del equipo: el backend se la rechazaría.
    expect(sincronizarQr).toHaveBeenLastCalledWith("prueba", false);
  });

  it("sin QR cargado, el cajero lee quién lo carga en vez de un botón", async () => {
    sesion.plantilla = "CAJERO";
    await montar();
    expect(screen.queryByRole("button", { name: "Subir QR" })).not.toBeInTheDocument();
    expect(screen.getByText("Todavía no hay QR del negocio. Lo carga el administrador.")).toBeInTheDocument();
  });

  it("al cobrar sin QR, el encargado no tiene «Cargar el QR»", async () => {
    sesion.plantilla = "SUPERVISOR";
    render(<QrParaCobrar confirmado={false} onConfirmar={() => {}} />);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Cargar el QR" })).not.toBeInTheDocument();
    expect(screen.getByText("Todavía no hay QR del negocio. Lo carga el administrador.")).toBeInTheDocument();
  });
});
