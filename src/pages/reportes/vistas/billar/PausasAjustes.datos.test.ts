import { describe, expect, it } from "vitest";
import { porPersona, resumenAjustes, tipoDe, type Ajuste } from "./PausasAjustes.datos";

const ajuste = (id: number, codigo: string | undefined, quien = "Ana", accion = "x"): Ajuste => ({
  id,
  hora: Date.UTC(2026, 9, 6, 3, 12),
  mesaId: 3,
  accion,
  codigo,
  quien,
});

describe("pausas y ajustes del billar", () => {
  it("agrupa por el código y no por el texto", () => {
    // El texto lo arma el backend y se puede reescribir ("Anuló la mesa ·
    // devolver Bs 20"); agrupar leyéndolo se rompería en silencio.
    expect(tipoDe(ajuste(1, "ANULAR_MESA", "Ana", "Pausó 3 min"))).toBe("anulaciones");
    expect(tipoDe(ajuste(2, "ANULAR_CONSUMO"))).toBe("anulaciones");
    expect(tipoDe(ajuste(3, "EDITAR_INICIO"))).toBe("horas");
    expect(tipoDe(ajuste(4, "NUEVO_QUE_NO_CONOCEMOS"))).toBeNull();
  });

  it("cuenta cada grupo y separa las mesas anuladas de los consumos anulados", () => {
    const r = resumenAjustes([
      ajuste(1, "ANULAR_MESA"),
      ajuste(2, "ANULAR_CONSUMO"),
      ajuste(3, "ANULAR_CONSUMO"),
      ajuste(4, "REANUDAR"),
      ajuste(5, "CAMBIAR_MESA"),
    ]);
    expect(r.total).toBe(5);
    expect(r.mesasAnuladas).toBe(1);
    expect(r.consumosAnulados).toBe(2);
    expect(r.porTipo).toEqual({ anulaciones: 3, pausas: 1, cambios: 1, horas: 0, extensiones: 0 });
  });

  it("con un backend que no manda el código no inventa ceros", () => {
    // Un "0 mesas anuladas" con los códigos faltando se leería como que nadie
    // anuló; lo que pasa es que no se sabe.
    const r = resumenAjustes([ajuste(1, undefined), ajuste(2, "ANULAR_MESA")]);
    expect(r.total).toBe(2);
    expect(r.porTipo).toBeNull();
    expect(r.mesasAnuladas).toBeNull();
    expect(porPersona([ajuste(1, undefined)])[0].anulaciones).toBeNull();
  });

  it("ordena a las personas por cuántos ajustes hicieron y cuenta sus anulaciones", () => {
    const filas = porPersona([
      ajuste(1, "REANUDAR", "Beto"),
      ajuste(2, "ANULAR_MESA", "Ana"),
      ajuste(3, "ANULAR_CONSUMO", "Ana"),
      ajuste(4, "CAMBIAR_MESA", "Ana"),
    ]);
    expect(filas).toEqual([
      { quien: "Ana", ajustes: 3, anulaciones: 2 },
      { quien: "Beto", ajustes: 1, anulaciones: 0 },
    ]);
  });
});
