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
    // La mesa guardada como inactiva va con las que no se pueden abrir: sin
    // grupo se veía sólo en "Todo" (prueba profunda, 18-oct).
    expect(tipoDe(ajuste(5, "INACTIVAR_MESA"))).toBe("mesas");
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
    expect(r.porTipo).toEqual({ anulaciones: 3, pausas: 1, cambios: 1, horas: 0, extensiones: 0, pagos: 0, mesas: 0, pin: 0 });
  });

  it("la venta anulada de una mesa jugada y la mesa cobrada en pausa también cuentan", () => {
    // Revisión del 16-oct: pasados 5 minutos la mesa sólo se anula anulando su
    // venta, y cobrarla sin reanudar deja el tiempo en pausa sin cobrar. Ninguna
    // de las dos aparecía: "Mesas anuladas: 0" con una mesa jugada y anulada.
    const r = resumenAjustes([ajuste(1, "ANULAR_VENTA"), ajuste(2, "COBRADA_EN_PAUSA"), ajuste(3, "ANULAR_MESA")]);
    expect(r.mesasAnuladas).toBe(2);
    expect(r.porTipo).toEqual({ anulaciones: 2, pausas: 1, cambios: 0, horas: 0, extensiones: 0, pagos: 0, mesas: 0, pin: 0 });
  });

  it("la venta rápida anulada cuenta entre las anulaciones pero no como mesa", () => {
    // Revisión del 18-oct: el backend la manda con ANULAR_VENTA y sin mesa;
    // sumada a "Mesas anuladas", anular un maní decía que se anuló una mesa.
    const rapida = { ...ajuste(1, "ANULAR_VENTA"), mesaId: undefined };
    const r = resumenAjustes([rapida, ajuste(2, "ANULAR_VENTA")]);
    expect(r.mesasAnuladas).toBe(1);
    expect(r.porTipo.anulaciones).toBe(2);
  });

  it("el medio de pago corregido va en su propio grupo, no entre las anulaciones", () => {
    // 17-oct: corregir el medio no anula nada (el total no cambia), pero es
    // plata que cambió de cajón y el dueño la tiene que poder filtrar.
    const r = resumenAjustes([ajuste(1, "CORREGIR_PAGO"), ajuste(2, "ANULAR_VENTA")]);
    expect(tipoDe(ajuste(3, "CORREGIR_PAGO"))).toBe("pagos");
    expect(r.porTipo).toEqual({ anulaciones: 1, pausas: 0, cambios: 0, horas: 0, extensiones: 0, pagos: 1, mesas: 0, pin: 0 });
    expect(r.mesasAnuladas).toBe(1);
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
