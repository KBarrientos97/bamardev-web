import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La copia del QR por sucursal (13-nov-2026, "Un QR para cada sucursal"): la
 * organización que cobra en la sede de su caja guarda una copia por sede, y la
 * copia de siempre (sin sede) ni se toca ni se mezcla.
 */

const api = vi.hoisted(() => ({
  qrCobro: vi.fn(),
  subirQrCobro: vi.fn(async () => ({ imagen: "x" })),
  borrarQrCobro: vi.fn(async () => ({ imagen: null })),
}));
vi.mock("./api", () => ({ api }));

import { leerQr, quitarQrDelNegocio, sincronizarQr, subirQr } from "./qrPago";

const GENERAL = "data:image/jpeg;base64,GENERAL";
const NORTE = "data:image/jpeg;base64,NORTE";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("qrPago por sucursal", () => {
  it("sin sede pide y guarda como siempre: sin argumentos y en la clave de siempre", async () => {
    api.qrCobro.mockResolvedValue({ imagen: GENERAL });
    expect(await sincronizarQr("pollos", true)).toBe(GENERAL);
    expect(api.qrCobro).toHaveBeenCalledWith();
    expect(localStorage.getItem("bamardev.qr.cobro_pollos")).toBe(GENERAL);
  });

  it("con sede pide el de esa sede y lo guarda aparte, sin pisar el general", async () => {
    localStorage.setItem("bamardev.qr.cobro_pollos", GENERAL);
    api.qrCobro.mockResolvedValue({ imagen: NORTE });
    expect(await sincronizarQr("pollos", false, 2)).toBe(NORTE);
    expect(api.qrCobro).toHaveBeenCalledWith(2);
    expect(localStorage.getItem("bamardev.qr.cobro_pollos_s2")).toBe(NORTE);
    expect(leerQr("pollos")).toBe(GENERAL);
    expect(leerQr("pollos", 2)).toBe(NORTE);
    expect(leerQr("pollos", 3)).toBeNull();
  });

  it("sin internet sigue con la copia de esa sede", async () => {
    localStorage.setItem("bamardev.qr.cobro_pollos_s2", NORTE);
    api.qrCobro.mockRejectedValue(new Error("sin red"));
    expect(await sincronizarQr("pollos", true, 2)).toBe(NORTE);
  });

  it("si la sede ya lo había recibido y ahora no hay, borra sólo la copia de la sede", async () => {
    localStorage.setItem("bamardev.qr.cobro_pollos", GENERAL);
    localStorage.setItem("bamardev.qr.cobro_pollos_s2", NORTE);
    localStorage.setItem("bamardev.qr.cobro.sincronizado_pollos_s2", "1");
    api.qrCobro.mockResolvedValue({ imagen: null });
    expect(await sincronizarQr("pollos", true, 2)).toBeNull();
    expect(leerQr("pollos", 2)).toBeNull();
    expect(leerQr("pollos")).toBe(GENERAL);
  });

  it("la copia de una sede nunca se sube sola como si fuera la de antes", async () => {
    localStorage.setItem("bamardev.qr.cobro_pollos_s2", NORTE);
    api.qrCobro.mockResolvedValue({ imagen: null });
    await sincronizarQr("pollos", true, 2);
    expect(api.subirQrCobro).not.toHaveBeenCalled();
  });

  it("subir y quitar mandan la sede sólo cuando hay sede", async () => {
    localStorage.setItem("bamardev.qr.cobro_pollos", GENERAL);
    localStorage.setItem("bamardev.qr.cobro_pollos_s2", NORTE);
    await subirQr("pollos");
    expect(api.subirQrCobro).toHaveBeenLastCalledWith(GENERAL);
    await subirQr("pollos", 2);
    expect(api.subirQrCobro).toHaveBeenLastCalledWith(NORTE, 2);
    await quitarQrDelNegocio();
    expect(api.borrarQrCobro).toHaveBeenLastCalledWith();
    await quitarQrDelNegocio(2);
    expect(api.borrarQrCobro).toHaveBeenLastCalledWith(2);
  });
});
