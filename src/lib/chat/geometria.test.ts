import { describe, expect, it } from "vitest";
import { geometriaChat } from "./geometria";

describe("geometriaChat: el panel del asistente con el teclado abierto", () => {
  it("sin viewport visual (navegador viejo) queda como estaba", () => {
    expect(geometriaChat(null)).toEqual({ altoMax: 580, abajo: 16 });
  });

  it("sin teclado: 580 si entra, y pegado al borde con su margen", () => {
    expect(geometriaChat({ alturaLayout: 844, alturaVisible: 844, desplazamiento: 0 })).toEqual({
      altoMax: 580,
      abajo: 16,
    });
  });

  it("pantalla chica sin teclado: el panel se achica a lo que hay", () => {
    expect(geometriaChat({ alturaLayout: 500, alturaVisible: 500, desplazamiento: 0 }).altoMax).toBe(468);
  });

  it("con teclado de iPhone: el panel entra en lo visible y queda sobre el teclado", () => {
    // 844 de layout, el teclado deja 520 visibles y tapa los 324 de abajo.
    const g = geometriaChat({ alturaLayout: 844, alturaVisible: 520, desplazamiento: 0 });
    expect(g.altoMax).toBe(488);
    expect(g.abajo).toBe(324 + 16);
  });

  it("si Safari corrió la parte visible hacia abajo, cuenta ese corrimiento", () => {
    // Visible de 100 a 620: tapa 844 - 620 = 224 por abajo.
    const g = geometriaChat({ alturaLayout: 844, alturaVisible: 520, desplazamiento: 100 });
    expect(g.abajo).toBe(224 + 16);
  });

  it("con muy poco espacio no baja de un alto usable", () => {
    expect(geometriaChat({ alturaLayout: 600, alturaVisible: 150, desplazamiento: 0 }).altoMax).toBe(200);
  });
});
