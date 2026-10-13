import { describe, expect, it } from "vitest";
import { completaGesto, ejeDelGesto } from "./gestos";

describe("ejeDelGesto", () => {
  it("no decide mientras el dedo casi no se movió", () => {
    expect(ejeDelGesto(3, -4)).toBeNull();
  });

  it("horizontal o vertical según hacia dónde se movió más", () => {
    expect(ejeDelGesto(30, 5)).toBe("x");
    expect(ejeDelGesto(-30, 5)).toBe("x");
    expect(ejeDelGesto(4, 20)).toBe("y");
  });
});

describe("completaGesto: como en iOS, lejos o rápido", () => {
  it("llevado más allá de la fracción, se completa aunque sea lento", () => {
    expect(completaGesto(120, 2000, 288)).toBe(true);
  });

  it("corto y lento vuelve a su lugar", () => {
    expect(completaGesto(60, 800, 288)).toBe(false);
  });

  it("corto pero tirado rápido se completa", () => {
    expect(completaGesto(60, 80, 288)).toBe(true);
  });

  it("un temblor rápido no cuenta, ni para el otro lado", () => {
    expect(completaGesto(10, 5, 288)).toBe(false);
    expect(completaGesto(-200, 100, 288)).toBe(false);
  });
});
