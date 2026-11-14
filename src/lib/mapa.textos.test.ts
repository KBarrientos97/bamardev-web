import { describe, expect, it } from "vitest";
import { TEXTOS_MAPA } from "./mapa";

/** Los textos de MapLibre en español (QA R2, M7). */
describe("TEXTOS_MAPA", () => {
  it("el aviso de gestos cooperativos en el celular está en español", () => {
    expect(TEXTOS_MAPA["CooperativeGesturesHandler.MobileHelpText"]).toBe("Usá dos dedos para mover el mapa");
  });

  it("cubre los tres avisos de gestos y los botones de zoom, sin dejar inglés", () => {
    for (const clave of [
      "CooperativeGesturesHandler.WindowsHelpText",
      "CooperativeGesturesHandler.MacHelpText",
      "CooperativeGesturesHandler.MobileHelpText",
      "NavigationControl.ZoomIn",
      "NavigationControl.ZoomOut",
    ]) {
      expect(TEXTOS_MAPA[clave], clave).toBeTruthy();
      expect(TEXTOS_MAPA[clave]).not.toMatch(/\b(Use|Zoom|fingers|scroll)\b/);
    }
  });
});
