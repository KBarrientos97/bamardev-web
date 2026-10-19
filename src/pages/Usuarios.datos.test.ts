import { describe, expect, it } from "vitest";
import { paraQueSirveElPin, queDejaDeAutorizar } from "./Usuarios.datos";

describe("para qué sirve el PIN", () => {
  it("con fiado dice lo de siempre", () => {
    expect(paraQueSirveElPin(["pos", "fiado"])).toBe("anular ventas y fiar por encima del límite del cliente");
    expect(queDejaDeAutorizar(["pos", "fiado"])).toBe("anulaciones ni fiar por encima del límite");
  });

  it("un billar sin fiado no lee nada de fiar y sí lo de sus mesas", () => {
    // El dueño, 17-oct: el billar no fía, y el PIN le hablaba de fiar.
    expect(paraQueSirveElPin(["pos", "billar"])).toBe(
      "anular ventas y lo que pide PIN en las mesas de billar (pausar, anular una mesa, corregir la hora o un pago)",
    );
    expect(queDejaDeAutorizar(["pos", "billar"])).toBe("anulaciones ni lo que pide PIN en el billar");
  });

  it("con las dos cosas arma la lista entera", () => {
    expect(queDejaDeAutorizar(["fiado", "billar"])).toBe(
      "anulaciones, fiar por encima del límite ni lo que pide PIN en el billar",
    );
  });

  it("sin la lista de features no inventa el billar", () => {
    // `tieneFeature` falla abierto: el fiado se sigue nombrando, como antes;
    // el billar no, o un restaurante leería que su PIN es para las mesas.
    expect(paraQueSirveElPin(undefined)).toBe("anular ventas y fiar por encima del límite del cliente");
    expect(paraQueSirveElPin([])).toBe("anular ventas y fiar por encima del límite del cliente");
  });
});
