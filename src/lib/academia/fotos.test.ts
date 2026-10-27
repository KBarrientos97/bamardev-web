import { describe, expect, it } from "vitest";
import { avisoFotosPendientes } from "./fotos";

describe("D3 · el aviso de haber inscrito sin las fotos", () => {
  it("dice cuáles faltan y adónde mirar", () => {
    expect(avisoFotosPendientes({ fotosPendientes: true, fotosFaltan: ["FOTO", "CI_REVERSO"] })).toBe(
      "Quedó con las fotos pendientes (foto y carnet de atrás): queda marcado «Faltan fotos» en su ficha.",
    );
  });

  it("sin la lista de cuáles (un backend que sólo manda el flag), igual avisa", () => {
    expect(avisoFotosPendientes({ fotosPendientes: true })).toBe("Quedó con las fotos pendientes: queda marcado «Faltan fotos» en su ficha.");
  });

  it("si no quedó nada pendiente, no hay aviso", () => {
    expect(avisoFotosPendientes({ fotosPendientes: false, fotosFaltan: [] })).toBeNull();
    expect(avisoFotosPendientes({})).toBeNull();
    expect(avisoFotosPendientes(undefined)).toBeNull();
  });
});
