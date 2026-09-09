import { beforeEach, describe, expect, it } from "vitest";
import { borrarQr, hayQr, leerQr } from "./qrPago";

/**
 * El QR vive por dispositivo y por negocio: un equipo que atiende a dos
 * clientes no puede mostrarle a uno el QR del otro — le estaría mandando la
 * plata al negocio equivocado.
 */
describe("qrPago", () => {
  beforeEach(() => localStorage.clear());

  it("sin nada guardado no hay QR", () => {
    expect(leerQr("polloomar")).toBeNull();
    expect(hayQr("polloomar")).toBe(false);
  });

  it("el QR de un negocio no se le muestra a otro", () => {
    localStorage.setItem("bamardev.qr.cobro_polloomar", "data:image/jpeg;base64,AAA");
    expect(hayQr("polloomar")).toBe(true);
    expect(hayQr("otronegocio")).toBe(false);
  });

  it("sin alias usa una clave propia y no se mezcla", () => {
    localStorage.setItem("bamardev.qr.cobro_sin_negocio", "data:image/jpeg;base64,AAA");
    expect(hayQr(null)).toBe(true);
    expect(hayQr(undefined)).toBe(true);
    expect(hayQr("polloomar")).toBe(false);
  });

  it("borrar sólo toca el negocio indicado", () => {
    localStorage.setItem("bamardev.qr.cobro_uno", "data:image/jpeg;base64,AAA");
    localStorage.setItem("bamardev.qr.cobro_dos", "data:image/jpeg;base64,BBB");

    borrarQr("uno");

    expect(hayQr("uno")).toBe(false);
    expect(hayQr("dos")).toBe(true);
  });

  it("devuelve la imagen guardada tal cual", () => {
    const img = "data:image/jpeg;base64,ZZZ";
    localStorage.setItem("bamardev.qr.cobro_polloomar", img);
    expect(leerQr("polloomar")).toBe(img);
  });
});
