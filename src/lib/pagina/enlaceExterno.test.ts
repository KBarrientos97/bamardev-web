import { describe, expect, it } from "vitest";
import { abreEnOtraPestana } from "./enlaceExterno";

const ORIGEN = "https://link.bamardev.com";

describe("abreEnOtraPestana", () => {
  it("las redes y WhatsApp abren en otra pestaña", () => {
    expect(abreEnOtraPestana("https://www.instagram.com/pollosdonomar", ORIGEN)).toBe(true);
    expect(abreEnOtraPestana("https://www.facebook.com/pollosdonomar", ORIGEN)).toBe(true);
    expect(abreEnOtraPestana("https://www.tiktok.com/@pollosdonomar", ORIGEN)).toBe(true);
    expect(abreEnOtraPestana("https://wa.me/59162158596", ORIGEN)).toBe(true);
    expect(abreEnOtraPestana("https://go.bamardev.com/polloomar/promo", ORIGEN)).toBe(true);
  });

  it("lo que sigue dentro de BamarDev queda en la misma pestaña", () => {
    expect(abreEnOtraPestana("/polloomar/pedir", ORIGEN)).toBe(false);
    expect(abreEnOtraPestana("https://link.bamardev.com/polloomar/reservar", ORIGEN)).toBe(false);
    expect(abreEnOtraPestana("https://link-qa.bamardev.com/otro", "https://app-qa.bamardev.com")).toBe(false);
    expect(abreEnOtraPestana("https://app.bamardev.com/r/polloomar/reservar", ORIGEN)).toBe(false);
  });

  it("tel:, mailto: y lo que no es una dirección no se tocan", () => {
    expect(abreEnOtraPestana("tel:+59162158596", ORIGEN)).toBe(false);
    expect(abreEnOtraPestana("mailto:hola@ejemplo.com", ORIGEN)).toBe(false);
    expect(abreEnOtraPestana("http://[mal", ORIGEN)).toBe(false);
  });
});
