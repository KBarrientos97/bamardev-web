import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { entregarPdf, limpio, repartirEnHojas, type Renglon } from "./tablaPdf";

const grupo = (t: string): Renglon => ({ tipo: "grupo", alto: 20, grupo: { titulo: t, celdas: [], filas: [] } });
const fila = (n: string): Renglon => ({ tipo: "fila", alto: 20, fila: { nombre: n, celdas: [] }, lineas: [n] });
const total: Renglon = { tipo: "total", alto: 20, total: { etiqueta: "TOTAL", celdas: [] } };
const nombres = (h: Renglon[]) =>
  h.map((r) => (r.tipo === "grupo" ? `#${r.grupo.titulo}` : r.tipo === "fila" ? r.fila.nombre : "TOTAL"));

describe("dónde se corta la hoja del PDF", () => {
  it("todo entra: una sola hoja", () => {
    const hojas = repartirEnHojas([grupo("POLLOS"), fila("a"), fila("b"), total], () => 1000);
    expect(hojas.map(nombres)).toEqual([["#POLLOS", "a", "b", "TOTAL"]]);
  });

  it("una categoría no queda sola al pie: baja con su primer producto", () => {
    // Entran 4 renglones por hoja: POLLOS, a, b y el título de BEBIDAS
    // quedaría solo abajo.
    const hojas = repartirEnHojas(
      [grupo("POLLOS"), fila("a"), fila("b"), grupo("BEBIDAS"), fila("c"), total],
      () => 80,
    );
    expect(hojas.map(nombres)).toEqual([
      ["#POLLOS", "a", "b"],
      ["#BEBIDAS", "c", "TOTAL"],
    ]);
  });

  it("el TOTAL no arranca una hoja solo: se lleva el último producto", () => {
    const hojas = repartirEnHojas([grupo("POLLOS"), fila("a"), fila("b"), fila("c"), total], () => 80);
    expect(hojas.map(nombres)).toEqual([
      ["#POLLOS", "a", "b"],
      ["c", "TOTAL"],
    ]);
  });

  it("los espacios finos de la hora no llegan al PDF", () => {
    expect(limpio("09:59 p. m.")).toBe("09:59 p. m.");
  });
});

/**
 * Cómo se entrega el PDF (Kevin, 11-nov): en el celular se comparte (WhatsApp),
 * en la compu se elige dónde guardarlo, y si no hay ninguna de las dos, baja.
 */
describe("la entrega del PDF", () => {
  const nav = navigator as Navigator & { share?: unknown; canShare?: unknown; userAgentData?: unknown };
  const win = window as Window & { showSaveFilePicker?: unknown };
  const blob = new Blob(["%PDF"], { type: "application/pdf" });
  let descargas: string[];

  beforeEach(() => {
    descargas = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      descargas.push(this.download);
    });
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete nav.share;
    delete nav.canShare;
    delete nav.userAgentData;
    delete win.showSaveFilePicker;
  });

  function celular() {
    nav.userAgentData = { mobile: true };
  }

  it("en el celular abre el diálogo de compartir con el archivo", async () => {
    celular();
    const share = vi.fn().mockResolvedValue(undefined);
    nav.share = share;
    nav.canShare = (d: ShareData) => !!d.files?.length;
    await expect(entregarPdf(blob, "productos.pdf")).resolves.toBe("compartido");
    const enviado = share.mock.calls[0][0] as { files: File[]; title: string };
    expect(enviado.files[0].name).toBe("productos.pdf");
    expect(enviado.files[0].type).toBe("application/pdf");
    expect(descargas).toEqual([]);
  });

  it("cerrar el diálogo de compartir no es un error ni baja nada", async () => {
    celular();
    nav.share = vi.fn().mockRejectedValue(new DOMException("x", "AbortError"));
    nav.canShare = () => true;
    await expect(entregarPdf(blob, "productos.pdf")).resolves.toBe("cancelado");
    expect(descargas).toEqual([]);
  });

  it("en la compu, aunque Chrome sepa compartir, elige dónde guardarlo", async () => {
    nav.userAgentData = { mobile: false };
    nav.share = vi.fn();
    nav.canShare = () => true;
    const write = vi.fn();
    const close = vi.fn();
    const elegir = vi.fn().mockResolvedValue({ createWritable: async () => ({ write, close }) });
    win.showSaveFilePicker = elegir;
    await expect(entregarPdf(blob, "productos.pdf")).resolves.toBe("guardado");
    expect(elegir.mock.calls[0][0]).toMatchObject({ suggestedName: "productos.pdf" });
    expect(write).toHaveBeenCalledWith(blob);
    expect(close).toHaveBeenCalled();
    expect(nav.share).not.toHaveBeenCalled();
  });

  it("cancelar el «Guardar como» no baja nada", async () => {
    nav.userAgentData = { mobile: false };
    win.showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException("x", "AbortError"));
    await expect(entregarPdf(blob, "productos.pdf")).resolves.toBe("cancelado");
    expect(descargas).toEqual([]);
  });

  it("sin compartir ni «Guardar como» (Firefox, Safari): la descarga de siempre", async () => {
    nav.userAgentData = { mobile: false };
    await expect(entregarPdf(blob, "productos.pdf")).resolves.toBe("descargado");
    expect(descargas).toEqual(["productos.pdf"]);
  });

  it("si el «Guardar como» falla por otra cosa (un iframe, http), baja igual", async () => {
    nav.userAgentData = { mobile: false };
    win.showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException("x", "SecurityError"));
    await expect(entregarPdf(blob, "productos.pdf")).resolves.toBe("descargado");
    expect(descargas).toEqual(["productos.pdf"]);
  });
});
