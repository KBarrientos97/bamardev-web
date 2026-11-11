import { beforeEach, describe, expect, it } from "vitest";
import {
  articulosDelConteo,
  cantidadContada,
  claveBorrador,
  descripcionDelAjuste,
  detallesDelAjuste,
  diferenciasDe,
  estaContado,
  etiquetaDiferencia,
  guardarBorrador,
  leerBorrador,
  resumenDelConteo,
  tipoDiferencia,
  vencimientoValido,
  type Conteo,
  type ItemToma,
} from "./toma";

/**
 * Las reglas del AJUSTE que sale de una toma, tal como las exige el backend
 * (`ajustarPorLote`): por lote cuando el artículo maneja lote, por el total
 * cuando no, sólo lo que cambia y nunca las dos formas mezcladas.
 */

function articulo(over: Partial<ItemToma> = {}): ItemToma {
  return {
    productoId: 1,
    nombre: "Amoxicilina 500 mg",
    concentracion: "500 mg",
    laboratorio: "BAGÓ",
    codBarra: "7501",
    unidad: "Caja",
    ubicacion: "Estante 3",
    manejaLote: true,
    stock: 12,
    lotes: [
      { codigo: "AMX-1", vencimiento: "2027-03-31", cantidad: 8 },
      { codigo: "AMX-2", vencimiento: "2027-09-30", cantidad: 4 },
    ],
    ...over,
  };
}

const sinLote = (): ItemToma =>
  articulo({ productoId: 2, nombre: "Alcohol 70%", manejaLote: false, stock: 10, lotes: [] });

describe("renglones del ajuste", () => {
  it("un artículo con dos lotes contados 8 y 0 da dos renglones, cada uno con su lote", () => {
    // El 0 también viaja: es "conté 0, se terminó", y el backend fija ese
    // lote en 0. Sin el renglón, el sistema seguiría creyendo que hay 4.
    const a = articulo();
    const conteo: Conteo = { 1: { articulo: a, lotes: { "AMX-1": "8", "AMX-2": "0" } } };
    expect(detallesDelAjuste([a], conteo)).toEqual([
      { productoId: 1, cantidad: 0, loteCodigo: "AMX-2" },
    ]);
    // El AMX-1 cuadró (8 = 8), así que no viaja. Si no hubiera cuadrado:
    const otro: Conteo = { 1: { articulo: a, lotes: { "AMX-1": "7", "AMX-2": "0" } } };
    expect(detallesDelAjuste([a], otro)).toEqual([
      { productoId: 1, cantidad: 7, loteCodigo: "AMX-1" },
      { productoId: 1, cantidad: 0, loteCodigo: "AMX-2" },
    ]);
  });

  it("lo contado igual al sistema no genera ningún renglón", () => {
    const a = articulo();
    const conteo: Conteo = {
      1: { articulo: a, lotes: { "AMX-1": "8", "AMX-2": "4" } },
      2: { articulo: sinLote(), total: "10" },
    };
    expect(detallesDelAjuste([a, sinLote()], conteo)).toEqual([]);
    expect(diferenciasDe([a, sinLote()], conteo)).toEqual([]);
  });

  it("un artículo sin lote va en un solo renglón con el total, sin loteCodigo", () => {
    // Un `loteCodigo` en un artículo que no maneja lote es 400 en el backend.
    const a = sinLote();
    const conteo: Conteo = { 2: { articulo: a, total: "7" } };
    expect(detallesDelAjuste([a], conteo)).toEqual([{ productoId: 2, cantidad: 7 }]);
  });

  it("un lote que el sistema no conocía viaja con su vencimiento", () => {
    const a = articulo();
    const conteo: Conteo = {
      1: {
        articulo: a,
        nuevos: [{ codigo: " NUEVO-123 ", vencimiento: "2027-03-31", cantidad: "5" }],
      },
    };
    expect(detallesDelAjuste([a], conteo)).toEqual([
      { productoId: 1, cantidad: 5, loteCodigo: "NUEVO-123", loteVencimiento: "2027-03-31" },
    ]);
    const [d] = diferenciasDe([a], conteo);
    expect(d.nuevo).toBe(true);
    expect(d.sistema).toBe(0);
    expect(d.diferencia).toBe(5);
  });

  it("nunca sale un renglón sin lote para un artículo que tiene lotes", () => {
    // Un `total` tecleado por error en un artículo con partidas se ignora: el
    // backend fijaría el total del producto y pisaría los lotes.
    const a = articulo();
    const conteo: Conteo = { 1: { articulo: a, total: "3", lotes: { "AMX-1": "6" } } };
    const detalles = detallesDelAjuste([a], conteo);
    expect(detalles).toEqual([{ productoId: 1, cantidad: 6, loteCodigo: "AMX-1" }]);
    expect(detalles.every((d) => d.loteCodigo)).toBe(true);
  });

  it("un artículo que maneja lote pero no tiene partidas se cuenta por el total", () => {
    // Stock cargado antes de prender "Maneja lote": no hay lote que contar y
    // el backend acepta el total porque no hay con qué mezclarlo.
    const a = articulo({ lotes: [], stock: 5 });
    const conteo: Conteo = { 1: { articulo: a, total: "0" } };
    expect(detallesDelAjuste([a], conteo)).toEqual([{ productoId: 1, cantidad: 0 }]);
  });

  it("si a ese artículo se le agrega un lote nuevo, el total deja de viajar", () => {
    // Las dos formas juntas serían justo la mezcla que el backend no admite.
    const a = articulo({ lotes: [], stock: 5 });
    const conteo: Conteo = {
      1: {
        articulo: a,
        total: "3",
        nuevos: [{ codigo: "L-1", vencimiento: "2027-01-31", cantidad: "3" }],
      },
    };
    expect(detallesDelAjuste([a], conteo)).toEqual([
      { productoId: 1, cantidad: 3, loteCodigo: "L-1", loteVencimiento: "2027-01-31" },
    ]);
  });

  it("un lote nuevo que repite el código de uno registrado se descarta", () => {
    // Mandarlo aparte fijaría el mismo lote dos veces y ganaría el último.
    const a = articulo();
    const conteo: Conteo = {
      1: {
        articulo: a,
        lotes: { "AMX-1": "6" },
        nuevos: [{ codigo: "amx-1", vencimiento: "2027-03-31", cantidad: "9" }],
      },
    };
    expect(detallesDelAjuste([a], conteo)).toEqual([
      { productoId: 1, cantidad: 6, loteCodigo: "AMX-1" },
    ]);
  });

  it("un lote nuevo en 0 o sin código no cambia nada", () => {
    const a = articulo();
    const conteo: Conteo = {
      1: {
        articulo: a,
        nuevos: [
          { codigo: "L-0", vencimiento: "2027-03-31", cantidad: "0" },
          { codigo: "", vencimiento: "2027-03-31", cantidad: "4" },
        ],
      },
    };
    expect(detallesDelAjuste([a], conteo)).toEqual([]);
  });

  it("un vencimiento que no es un día real no viaja", () => {
    // Un 400 por la fecha frenaría el ajuste entero: mejor el lote sin fecha
    // (el backend lo admite) que ninguno de los treinta renglones.
    const a = articulo();
    const conteo: Conteo = {
      1: { articulo: a, nuevos: [{ codigo: "L-X", vencimiento: "2027-02-30", cantidad: "2" }] },
    };
    expect(detallesDelAjuste([a], conteo)).toEqual([{ productoId: 1, cantidad: 2, loteCodigo: "L-X" }]);
  });

  it("lo que no se contó no se manda: un artículo sin contar no es 0", () => {
    const a = articulo();
    const conteo: Conteo = { 1: { articulo: a, lotes: { "AMX-1": "" } } };
    expect(detallesDelAjuste([a], conteo)).toEqual([]);
    expect(detallesDelAjuste([a], {})).toEqual([]);
  });
});

describe("lo tecleado", () => {
  it("vacío, un negativo o letras no cuentan; la coma vale como punto", () => {
    expect(cantidadContada("")).toBeNull();
    expect(cantidadContada("  ")).toBeNull();
    expect(cantidadContada("-1")).toBeNull();
    expect(cantidadContada("abc")).toBeNull();
    expect(cantidadContada("0")).toBe(0);
    expect(cantidadContada("2,5")).toBe(2.5);
    expect(cantidadContada(" 12 ")).toBe(12);
  });

  it("la diferencia se pinta por signo y con el menos de verdad", () => {
    expect(tipoDiferencia(0)).toBe("cuadra");
    expect(tipoDiferencia(2)).toBe("sobra");
    expect(tipoDiferencia(-3)).toBe("falta");
    expect(etiquetaDiferencia(2)).toBe("+2");
    expect(etiquetaDiferencia(-3)).toBe("−3");
    expect(etiquetaDiferencia(0)).toBe("0");
    expect(etiquetaDiferencia(0.0001)).toBe("0");
  });

  it("un vencimiento tiene que ser AAAA-MM-DD y un día que exista", () => {
    expect(vencimientoValido("2027-03-31")).toBe(true);
    expect(vencimientoValido("2028-02-29")).toBe(true);
    expect(vencimientoValido("2027-02-29")).toBe(false);
    expect(vencimientoValido("2027-13-01")).toBe(false);
    expect(vencimientoValido("31/03/2027")).toBe(false);
    expect(vencimientoValido(null)).toBe(false);
  });
});

describe("resumen y revisión", () => {
  it("cuenta los artículos contados y las diferencias por renglón", () => {
    const a = articulo();
    const b = sinLote();
    const c = articulo({ productoId: 3, nombre: "Ibuprofeno", lotes: [{ codigo: "I-1", vencimiento: null, cantidad: 2 }], stock: 2 });
    const conteo: Conteo = {
      1: { articulo: a, lotes: { "AMX-1": "7", "AMX-2": "3" } },
      2: { articulo: b, total: "10" },
      3: { articulo: c, lotes: { "I-1": "" } },
    };
    // c no se contó: su único campo está vacío.
    expect(estaContado(c, conteo[3])).toBe(false);
    expect(resumenDelConteo([a, b, c], conteo)).toEqual({
      contados: 2,
      diferencias: 2,
      articulosConDiferencia: 1,
    });
  });

  it("la revisión usa la foto fresca del artículo si la pantalla la tiene", () => {
    // Entre contar y aplicar se vendió una caja: la diferencia se muestra
    // contra lo último que se sabe, no contra la foto de la mañana.
    const viejo = articulo();
    const fresco = articulo({ lotes: [{ codigo: "AMX-1", vencimiento: "2027-03-31", cantidad: 7 }, { codigo: "AMX-2", vencimiento: "2027-09-30", cantidad: 4 }], stock: 11 });
    const conteo: Conteo = { 1: { articulo: viejo, lotes: { "AMX-1": "7" } } };
    const sinFresco = diferenciasDe(articulosDelConteo(conteo, new Map()), conteo);
    expect(sinFresco).toHaveLength(1);
    const conFresco = diferenciasDe(articulosDelConteo(conteo, new Map([[1, fresco]])), conteo);
    expect(conFresco).toEqual([]);
  });

  it("la descripción lleva el motivo y la nota; con Otro, la nota es el motivo", () => {
    expect(descripcionDelAjuste("Conteo mensual", "")).toBe("Toma de inventario · Conteo mensual");
    expect(descripcionDelAjuste("Vencidos tirados", " caja mojada ")).toBe(
      "Toma de inventario · Vencidos tirados · caja mojada",
    );
    expect(descripcionDelAjuste("Otro", "se cayó el estante")).toBe("Toma de inventario · se cayó el estante");
    expect(descripcionDelAjuste("", "")).toBe("Toma de inventario");
  });
});

describe("borrador", () => {
  beforeEach(() => localStorage.clear());

  it("se guarda por sucursal y se vuelve a leer con la fecha", () => {
    const conteo: Conteo = { 1: { articulo: articulo(), lotes: { "AMX-1": "7" } } };
    guardarBorrador(917, conteo, new Date("2026-11-11T15:00:00.000Z"));
    expect(localStorage.getItem(claveBorrador(917))).not.toBeNull();
    expect(leerBorrador(917)).toEqual({ conteo, guardado: "2026-11-11T15:00:00.000Z" });
    // El depósito no ve el conteo del mostrador.
    expect(leerBorrador(918)).toEqual({ conteo: {}, guardado: null });
  });

  it("un conteo vacío borra la clave en vez de dejar un borrador en blanco", () => {
    guardarBorrador(917, { 1: { articulo: articulo(), total: "3" } });
    guardarBorrador(917, {});
    expect(localStorage.getItem(claveBorrador(917))).toBeNull();
  });

  it("un borrador roto o sin el artículo se descarta sin romper la pantalla", () => {
    localStorage.setItem(claveBorrador(917), "{no es json");
    expect(leerBorrador(917)).toEqual({ conteo: {}, guardado: null });
    localStorage.setItem(
      claveBorrador(917),
      JSON.stringify({ conteo: { 1: { total: "3" }, 2: { articulo: sinLote(), total: "4" } }, guardado: "x" }),
    );
    const leido = leerBorrador(917);
    expect(Object.keys(leido.conteo)).toEqual(["2"]);
    expect(leido.conteo[2].total).toBe("4");
  });
});
