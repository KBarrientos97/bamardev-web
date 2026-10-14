import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mesas de billar → "Pantalla del salón (TV)": generar el enlace, copiarlo,
 * abrirlo, y generar uno nuevo sólo después de avisar que el anterior deja de
 * andar.
 */

vi.mock("../api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../api")>();
  return { ...real, apiBillar: { ...real.apiBillar, llaveSalon: vi.fn(), nuevaLlaveSalon: vi.fn() } };
});

import { apiBillar } from "../api";
import { TarjetaPantallaSalon } from "./TarjetaPantallaSalon";
import { urlTv } from "./TarjetaPantallaSalon.datos";

const VIEJA = "bGxhdmUtdmllamEtZGUtbGEtdHYtMDAwMDAw";
const NUEVA = "bGxhdmUtbnVldmEtZGUtbGEtdHYtMTExMTEx";
const llaveSalon = vi.mocked(apiBillar.llaveSalon);
const nuevaLlave = vi.mocked(apiBillar.nuevaLlaveSalon);
const copiar = vi.fn<(texto: string) => Promise<void>>();

async function montar(props: Parameters<typeof TarjetaPantallaSalon>[0] = {}) {
  render(<TarjetaPantallaSalon {...props} />);
  await act(async () => {});
}

const campoEnlace = () => screen.getByRole("textbox") as HTMLInputElement;

beforeEach(() => {
  llaveSalon.mockReset();
  nuevaLlave.mockReset();
  copiar.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: copiar }, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Pantalla del salón (TV) en Mesas de billar", () => {
  it("arma el enlace absoluto, con el local sólo si hay que elegirlo", () => {
    expect(urlTv("https://app.bamardev.com", "abc")).toBe("https://app.bamardev.com/tv/billar/abc");
    expect(urlTv("https://app.bamardev.com", "abc", 7)).toBe("https://app.bamardev.com/tv/billar/abc?sucursal=7");
    expect(urlTv("https://app.bamardev.com", "abc", null)).toBe("https://app.bamardev.com/tv/billar/abc");
  });

  it("sin pantalla habilitada ofrece generar el enlace, y lo muestra para copiar y abrir", async () => {
    llaveSalon.mockResolvedValue({ token: null });
    nuevaLlave.mockResolvedValue({ token: NUEVA });
    await montar();
    expect(screen.getByText(/No muestra cuentas, montos ni nombres/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generar el enlace" }));
    await act(async () => {});
    // La primera vez no hay nada que anular: no pregunta.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(nuevaLlave).toHaveBeenCalledTimes(1);
    const url = `${window.location.origin}/tv/billar/${NUEVA}`;
    expect(campoEnlace().value).toBe(url);
    const abrir = screen.getByRole("link", { name: /Abrir/ });
    expect(abrir).toHaveAttribute("href", url);
    expect(abrir).toHaveAttribute("target", "_blank");
    expect(abrir).toHaveAttribute("rel", expect.stringContaining("noopener"));

    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
    await act(async () => {});
    expect(copiar).toHaveBeenCalledWith(url);
    expect(screen.getByText("Enlace copiado.")).toBeInTheDocument();
  });

  it("con una pantalla andando muestra su enlace sin generar otro, con el local elegido", async () => {
    llaveSalon.mockResolvedValue({ token: VIEJA });
    await montar({ sucursalId: 7, sucursal: "Norte" });
    expect(nuevaLlave).not.toHaveBeenCalled();
    expect(campoEnlace().value).toBe(`${window.location.origin}/tv/billar/${VIEJA}?sucursal=7`);
    expect(screen.getByText("Norte")).toBeInTheDocument();
    // El QR se arma aparte (qrcode se baja recién acá).
    expect(await screen.findByRole("img", { name: /Código QR/ })).toBeInTheDocument();
  });

  it("generar uno nuevo avisa que el anterior deja de andar, y sólo confirmando lo cambia", async () => {
    llaveSalon.mockResolvedValue({ token: VIEJA });
    nuevaLlave.mockResolvedValue({ token: NUEVA });
    await montar();

    fireEvent.click(screen.getByRole("button", { name: "Generar uno nuevo" }));
    const dialogo = screen.getByRole("dialog", { name: "¿Generar un enlace nuevo?" });
    expect(dialogo).toHaveTextContent("deja de andar en el momento");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(nuevaLlave).not.toHaveBeenCalled();
    expect(campoEnlace().value).toContain(VIEJA);

    fireEvent.click(screen.getByRole("button", { name: "Generar uno nuevo" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "¿Generar un enlace nuevo?" })).getByRole("button", {
        name: "Generar uno nuevo",
      }),
    );
    await act(async () => {});
    expect(nuevaLlave).toHaveBeenCalledTimes(1);
    expect(campoEnlace().value).toContain(NUEVA);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/el enlace anterior ya no anda/)).toBeInTheDocument();
  });

  it("si no puede copiar solo, lo dice y deja el enlace a mano", async () => {
    llaveSalon.mockResolvedValue({ token: VIEJA });
    copiar.mockRejectedValue(new Error("sin permiso"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent("copialo a mano");
  });

  it("si no puede traer la llave, lo dice con Reintentar", async () => {
    llaveSalon.mockRejectedValueOnce(new Error("Sin conexión con el servidor"));
    await montar();
    expect(screen.getByText("Sin conexión con el servidor")).toBeInTheDocument();
    llaveSalon.mockResolvedValue({ token: VIEJA });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await act(async () => {});
    expect(campoEnlace().value).toContain(VIEJA);
  });
});
