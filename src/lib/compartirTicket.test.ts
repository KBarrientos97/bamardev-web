import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compartirComoImagen, enviarPorWhatsapp } from "./compartirTicket";

/**
 * Compartir el recibo con la imagen Y el mensaje (Drick, 08-nov: "la imagen y
 * el link, no sólo uno"). El render de la imagen se simula: jsdom no dibuja.
 */

vi.mock("html-to-image", () => ({
  toBlob: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
}));

const TEXTO = "Hola Ana, gracias por tu pago.\nTu estado de cuenta: https://link.bamardev.com/x";
const WA = "https://wa.me/59171234567?text=hola";
const nav = navigator as unknown as Record<string, unknown>;

function conCompartir(aceptaTexto = true) {
  const share = vi.fn(async (_datos: ShareData) => {});
  nav.share = share;
  nav.canShare = vi.fn((d: ShareData) => aceptaTexto || !d.text);
  return share;
}

let descargas: string[];
beforeEach(() => {
  descargas = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    descargas.push(this.download);
  });
  URL.createObjectURL = vi.fn(() => "blob:recibo");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  delete nav.share;
  delete nav.canShare;
  vi.restoreAllMocks();
});

describe("compartirComoImagen", () => {
  it("en el celular manda la imagen con el mensaje en el mismo envío", async () => {
    const share = conCompartir();
    const res = await compartirComoImagen(document.createElement("div"), "V-000012", TEXTO);
    expect(res).toEqual({ ok: true });
    const datos = share.mock.calls[0][0];
    expect(datos.files?.[0].name).toBe("V-000012.png");
    expect(datos.text).toBe(TEXTO);
  });

  it("si el equipo no acepta las dos cosas juntas, va la imagen sola", async () => {
    const share = conCompartir(false);
    await compartirComoImagen(document.createElement("div"), "V-000012", TEXTO);
    const datos = share.mock.calls[0][0];
    expect(datos.files).toHaveLength(1);
    expect(datos.text).toBeUndefined();
  });

  it("sin compartir archivos (la compu) baja la imagen y copia el mensaje", async () => {
    const copiar = vi.fn(async (_t: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: copiar }, configurable: true });
    const res = await compartirComoImagen(document.createElement("div"), "V-000012", TEXTO);
    expect(res).toEqual({ ok: false, motivo: "no_soportado" });
    expect(descargas).toEqual(["V-000012.png"]);
    expect(copiar).toHaveBeenCalledWith(TEXTO);
  });
});

describe("enviarPorWhatsapp", () => {
  it("en la compu abre el chat con el mensaje y baja la imagen para adjuntarla", async () => {
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    const res = await enviarPorWhatsapp(document.createElement("div"), "V-000012", TEXTO, WA);
    expect(abrir).toHaveBeenCalledWith(WA, "_blank", "noopener,noreferrer");
    expect(descargas).toEqual(["V-000012.png"]);
    expect(res).toEqual({ ok: false, motivo: "no_soportado" });
  });

  it("en el celular usa el diálogo de compartir con la imagen y el mensaje", async () => {
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    const share = conCompartir();
    await enviarPorWhatsapp(document.createElement("div"), "V-000012", TEXTO, WA);
    expect(abrir).not.toHaveBeenCalled();
    expect(share.mock.calls[0][0].text).toBe(TEXTO);
  });
});
