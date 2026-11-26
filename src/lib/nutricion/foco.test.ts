import { afterEach, describe, expect, it, vi } from "vitest";
import { conDedo, enfocaSolo, enfocarOMostrar } from "./foco";

/**
 * La regla del foco de nutrición (26-nov): con teclado de verdad (la PC) el
 * foco va solo, como siempre; con el dedo (el teléfono, la tablet), el campo
 * sólo queda a la vista y el teclado sube cuando la persona toca el campo.
 */

const TACTIL = "(hover: none) and (pointer: coarse)";
/** Una pantalla que contesta `matches` a lo que diga `coincide`. */
const pantalla = (coincide: (q: string) => boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: coincide(q), media: q, addEventListener() {}, removeEventListener() {} }));
const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };

afterEach(() => {
  vi.unstubAllGlobals();
  delete nav.userAgentData;
  document.body.innerHTML = "";
});

function campo(valor = "") {
  const el = document.createElement("input");
  el.value = valor;
  el.scrollIntoView = vi.fn();
  document.body.append(el);
  return el;
}

describe("conDedo y enfocaSolo", () => {
  it("sin `matchMedia` (la PC de las pruebas): teclado de verdad, el foco va solo", () => {
    expect(conDedo()).toBe(false);
    expect(enfocaSolo()).toBe(true);
  });

  it("una pantalla sólo táctil, sin mouse (la tablet Android, que no se dice «mobile»): con el dedo", () => {
    pantalla((q) => q === TACTIL);
    expect(conDedo()).toBe(true);
    expect(enfocaSolo()).toBe(false);
  });

  it("una notebook con pantalla táctil (tiene mouse): teclado de verdad", () => {
    pantalla(() => false);
    expect(conDedo()).toBe(false);
    expect(enfocaSolo()).toBe(true);
  });

  it("un teléfono que se dice «mobile»: con el dedo, aunque no haya `matchMedia`", () => {
    nav.userAgentData = { mobile: true };
    expect(conDedo()).toBe(true);
    expect(enfocaSolo()).toBe(false);
  });
});

describe("enfocarOMostrar", () => {
  it("en la PC, el foco (y, si se pide, lo escrito elegido); no corre la pantalla por su cuenta", () => {
    const el = campo("82,4");
    enfocarOMostrar(el, { seleccionar: true });
    expect(el).toHaveFocus();
    expect([el.selectionStart, el.selectionEnd]).toEqual([0, 4]);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it("con el dedo, el campo queda a la vista, sin el foco (el teclado no sube)", () => {
    pantalla((q) => q === TACTIL);
    const el = campo();
    enfocarOMostrar(el, { seleccionar: true });
    expect(el).not.toHaveFocus();
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("sin el campo (todavía no se dibujó), no hace nada", () => {
    expect(() => enfocarOMostrar(null)).not.toThrow();
    expect(() => enfocarOMostrar(undefined)).not.toThrow();
  });
});
