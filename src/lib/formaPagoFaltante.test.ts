import { describe, expect, it } from "vitest";
import { formaPagoFaltante } from "./formaPagoFaltante";

describe("formaPagoFaltante", () => {
  it("con la lista vacía no culpa al negocio: no se pudieron cargar", () => {
    expect(formaPagoFaltante([], "Efectivo")).toMatch(/No se pudieron cargar las formas de pago/);
  });

  it("con formas cargadas pero sin esa, el negocio no la tiene", () => {
    expect(formaPagoFaltante([{ id: 1, nombre: "Efectivo" }], "QR")).toBe(
      "El negocio no tiene cargada la forma de pago QR.",
    );
  });
});
