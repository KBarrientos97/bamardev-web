import { describe, expect, it } from "vitest";
import { enlaceWhatsapp, primerNombre, rellenar, resumenVentana } from "./textos";

describe("textos de promociones y campañas", () => {
  it("rellena la plantilla y deja lo que no conoce", () => {
    expect(rellenar("Hola {nombre}, {enlace} {otro}", { nombre: "Ana", enlace: "x.bo/1" })).toBe(
      "Hola Ana, x.bo/1 {otro}",
    );
  });

  it("el saludo usa el primer nombre", () => {
    expect(primerNombre("  Ana María Rojas ")).toBe("Ana");
  });

  it("arma el enlace wa.me con el texto codificado", () => {
    expect(enlaceWhatsapp("+591 7012-3456", "¡Hola! 2x1 & más")).toBe(
      "https://wa.me/59170123456?text=%C2%A1Hola!%202x1%20%26%20m%C3%A1s",
    );
  });

  it("resume días y franja", () => {
    expect(resumenVentana({ diasSemana: [4, 2], horaDesde: "15:00", horaHasta: "18:00" })).toBe(
      "Ma, Ju · 15:00-18:00",
    );
    expect(resumenVentana({ diasSemana: [], horaDesde: null, horaHasta: null })).toBe("Todos los días");
  });
});
