import { describe, expect, it } from "vitest";
import { opcionesDeCorte, textoDeCorte } from "./cierreDelDia";

describe("El día de los reportes (Configuración › Caja)", () => {
  it("ofrece de medianoche al mediodía, de a media hora", () => {
    const o = opcionesDeCorte(0);
    expect(o[0]).toBe(0);
    expect(o).toContain(420); // las 7:00, la de Pollos Don Omar
    expect(o.at(-1)).toBe(720);
    expect(o).toHaveLength(25);
  });

  it("un valor fuera de los pasos se ofrece igual, para no cambiarlo sin tocarlo", () => {
    const o = opcionesDeCorte(405);
    expect(o).toContain(405);
    expect(o.indexOf(405)).toBe(o.indexOf(390) + 1);
  });

  it("medianoche se lee como el día del calendario", () => {
    expect(textoDeCorte(0)).toBe("Medianoche (el día del calendario)");
    expect(textoDeCorte(420)).toBe("7:00 a. m.");
  });
});
