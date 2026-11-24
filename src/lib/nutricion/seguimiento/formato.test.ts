import { describe, expect, it } from "vitest";
import {
  casilleroAmarillo,
  conMgDelEscalon,
  delCatalogo,
  diasEntre,
  enUnidad,
  equivalenciasDe,
  escalonesDeLaSemana,
  esSemanaDePago,
  flechaKg,
  fmtDosis,
  fmtDosisCalculada,
  haceDias,
  leerDosis,
  mesDeLaSemana,
  mismaDosisEn,
  paraEscribir,
  pasoSiguiente,
  pasosDe,
  pasosMgDe,
  textoCambioPeso,
  textoDosis,
  textoEquivalencias,
  textoFaltaPago,
  textoPaso,
  textoPendiente,
  textoSubir,
  textoUltimoPago,
  tituloMes,
  dosisConMg,
  dosisYSusMg,
  igualQueLaAnterior,
  partesPaso,
  pesoDeLaEvaluacion,
  rachaAntes,
  resultadoDelPeso,
  textoKg,
  textoKgTotal,
  textoPagoAnterior,
  ultimoPagoAntes,
  marcaVigente,
  productoInicialDe,
  productoVigente,
  textoMarca,
  textoProducto,
} from "./formato";
import type { MesTratamiento, Paso } from "./tipos";
import { armarTratamiento, CATALOGO_SEGUIMIENTO, pacientesDePrueba } from "../../../test/seguimientoFixtures";

/**
 * Cómo se leen los números del seguimiento (CONTRATO-nutricion-seguimiento-23nov
 * §4.2 «Cómo se muestra una dosis», §4.1 y §4.1 bis). La tabla del vial de
 * 15 mg en 0,5 ml es la del §2: 30 mg/ml, 1 UI = 0,3 mg.
 */

const NB = " ";
const sinNb = (s: string) => s.replace(/ /g, " ");

/** Los escalones de la tirzepatida con el vial de 15 mg en 0,5 ml, como los manda el servidor. */
const PASOS_15: Paso[] = [
  { mg: 2.5, ui: 8.3, ml: 0.083 },
  { mg: 5, ui: 16.7, ml: 0.167 },
  { mg: 7.5, ui: 25, ml: 0.25 },
  { mg: 10, ui: 33.3, ml: 0.333 },
  { mg: 12.5, ui: 41.7, ml: 0.417 },
  { mg: 15, ui: 50, ml: 0.5 },
];

describe("una dosis, en toda la sección (§4.2)", () => {
  // Kevin (23-nov): lo anotado va como se anotó. Antes «7,5» en UI se leía «≈ 8 UI» y «0,5 ml», «0,50 ml».
  it("lo anotado, en su propia unidad y exacto: hasta 3 decimales, sin ceros de más", () => {
    expect(sinNb(fmtDosis(17, "UI"))).toBe("17 UI");
    expect(sinNb(fmtDosis(7.5, "UI"))).toBe("7,5 UI");
    expect(sinNb(fmtDosis(8.25, "UI"))).toBe("8,25 UI");
    expect(sinNb(fmtDosis(5.1, "mg"))).toBe("5,1 mg");
    expect(sinNb(fmtDosis(2.5, "mg"))).toBe("2,5 mg");
    expect(sinNb(fmtDosis(10, "mg"))).toBe("10 mg");
    expect(sinNb(fmtDosis(0.17, "ml"))).toBe("0,17 ml");
    expect(sinNb(fmtDosis(0.15, "ml"))).toBe("0,15 ml");
    expect(sinNb(fmtDosis(0.5, "ml"))).toBe("0,5 ml");
    expect(sinNb(fmtDosis(0.083, "ml"))).toBe("0,083 ml");
    expect(sinNb(textoDosis({ dosis: 7.5, unidadDosis: "UI", dosisMg: 2.25, dosisUi: 7.5, dosisMl: 0.075 }).anotado)).toBe("7,5 UI");
  });

  it("lo calculado (pasado a otro vial o a otra unidad): las UI en entero con «≈» si se redondeó, mg y ml con 2", () => {
    expect(sinNb(fmtDosisCalculada(8.3, "UI"))).toBe("≈ 8 UI");
    expect(sinNb(fmtDosisCalculada(37.5, "UI"))).toBe("≈ 38 UI");
    expect(sinNb(fmtDosisCalculada(25, "UI"))).toBe("25 UI");
    expect(sinNb(fmtDosisCalculada(2.25, "mg"))).toBe("2,25 mg");
    expect(sinNb(fmtDosisCalculada(0.5, "ml"))).toBe("0,50 ml");
  });

  it("al lado, en gris, las equivalencias que haya, sin la unidad anotada", () => {
    const d = { dosis: 17, unidadDosis: "UI" as const, dosisMg: 5.1, dosisUi: 17, dosisMl: 0.17 };
    expect(sinNb(textoDosis(d).anotado)).toBe("17 UI");
    expect(sinNb(textoDosis(d).equivalencias)).toBe("≈ 5,1 mg · 0,17 ml");
    expect(sinNb(textoEquivalencias({ dosisMg: 2.5, dosisUi: 8.3, dosisMl: 0.083 }, "mg"))).toBe("≈ 8 UI · 0,08 ml");
    // UI sin presentación: sólo los ml; los mg no se pueden saber.
    expect(sinNb(textoEquivalencias({ dosisMg: null, dosisUi: 17, dosisMl: 0.17 }, "UI"))).toBe("≈ 0,17 ml");
    expect(textoEquivalencias({ dosisMg: null, dosisUi: null, dosisMl: null }, "mg")).toBe("");
  });

  it("el número no se separa de su unidad (espacio duro)", () => {
    expect(fmtDosis(17, "UI")).toBe(`17${NB}UI`);
  });
});

describe("las equivalencias mientras se escribe (la cuenta del §2, sólo para mostrar)", () => {
  it("la tabla del vial de 15 mg en 0,5 ml (30 mg/ml)", () => {
    const tabla: [number, number, number][] = [
      [2.5, 8.3, 0.083],
      [5, 16.7, 0.167],
      [7.5, 25, 0.25],
      [10, 33.3, 0.333],
      [12.5, 41.7, 0.417],
      [15, 50, 0.5],
    ];
    for (const [mg, ui, ml] of tabla) expect(equivalenciasDe(mg, "mg", 30, 100), String(mg)).toEqual({ dosisMg: mg, dosisUi: ui, dosisMl: ml });
    expect(equivalenciasDe(17, "UI", 30, 100)).toEqual({ dosisMg: 5.1, dosisUi: 17, dosisMl: 0.17 });
    expect(equivalenciasDe(0.25, "ml", 30, 100)).toEqual({ dosisMg: 7.5, dosisUi: 25, dosisMl: 0.25 });
  });

  it("sin presentación: de UI a ml sí; los mg quedan sin saber", () => {
    expect(equivalenciasDe(17, "UI", null, 100)).toEqual({ dosisMg: null, dosisUi: 17, dosisMl: 0.17 });
    expect(equivalenciasDe(2.5, "mg", null, 100)).toEqual({ dosisMg: 2.5, dosisUi: null, dosisMl: null });
  });

  it("los escalones del catálogo, para iniciar (todavía sin tratamiento)", () => {
    expect(pasosDe([2.5, 5], 30, 100)).toEqual(PASOS_15.slice(0, 2));
    expect(pasosDe([2.5], null, 100)).toEqual([{ mg: 2.5, ui: null, ml: null }]);
  });
});

describe("los botones de un toque de la dosis (§4.2)", () => {
  it("escriben en la unidad del tratamiento: UI en entero, ml con 2 decimales, mg tal cual", () => {
    expect(paraEscribir(8.3, "UI")).toBe("8");
    expect(paraEscribir(16.7, "UI")).toBe("17");
    expect(paraEscribir(0.083, "ml")).toBe("0,08");
    expect(paraEscribir(0.5, "ml")).toBe("0,5");
    expect(paraEscribir(2.5, "mg")).toBe("2,5");
    expect(paraEscribir(12.5, "mg")).toBe("12,5");
  });

  it("cada escalón con sus dos datos, sin «≈» (§7.4): «8 UI · 2,5 mg»; con la unidad en mg, «2,5 mg · 8 UI»", () => {
    expect(PASOS_15.slice(0, 3).map((p) => sinNb(textoPaso(p, "UI")))).toEqual(["8 UI · 2,5 mg", "17 UI · 5 mg", "25 UI · 7,5 mg"]);
    expect(sinNb(textoPaso(PASOS_15[0], "mg"))).toBe("2,5 mg · 8 UI");
    expect(sinNb(textoPaso({ mg: 2.5, ui: null, ml: null }, "mg"))).toBe("2,5 mg");
    expect(sinNb(textoPaso(PASOS_15[2], "ml"))).toBe("0,25 ml · 7,5 mg");
  });

  it("«Subir»: el escalón que sigue al de la dosis de antes, comparando por mg", () => {
    // 17 UI = 5,1 mg está en el escalón de 5 mg (17 UI): sube a 7,5 mg = 25 UI.
    const antes = { dosis: 17, unidadDosis: "UI" as const, dosisMg: 5.1, dosisUi: 17, dosisMl: 0.17 };
    const s = pasoSiguiente(PASOS_15, antes, "UI");
    expect(s?.mg).toBe(7.5);
    expect(sinNb(textoSubir(s!, "UI"))).toBe("Subir: 25 UI (7,5 mg)");
    // 8 UI (2,4 mg) es el primer escalón (8,3 UI redondeado), no uno «entre» escalones: sube a 5 mg.
    expect(pasoSiguiente(PASOS_15, { dosis: 8, unidadDosis: "UI", dosisMg: 2.4, dosisUi: 8, dosisMl: 0.08 }, "UI")?.mg).toBe(5);
    // Una dosis entre dos escalones (6 mg): el primero con más mg.
    expect(pasoSiguiente(PASOS_15, { dosis: 6, unidadDosis: "mg", dosisMg: 6, dosisUi: 20, dosisMl: 0.2 }, "mg")?.mg).toBe(7.5);
    expect(sinNb(textoSubir(PASOS_15[2], "mg"))).toBe("Subir: 7,5 mg (25 UI)");
  });

  it("sin dosis de antes, en el último escalón o sin poder pasar a mg: no hay «Subir»", () => {
    expect(pasoSiguiente(PASOS_15, null, "UI")).toBeNull();
    expect(pasoSiguiente(PASOS_15, { dosis: 50, unidadDosis: "UI", dosisMg: 15, dosisUi: 50, dosisMl: 0.5 }, "UI")).toBeNull();
    expect(pasoSiguiente([], { dosis: 17, unidadDosis: "UI", dosisMg: 5.1, dosisUi: 17, dosisMl: 0.17 }, "UI")).toBeNull();
    expect(pasoSiguiente(PASOS_15, { dosis: 17, unidadDosis: "UI", dosisMg: null, dosisUi: 17, dosisMl: 0.17 }, "mg")).toBeNull();
  });

  it("«Igual que la anterior» usa la dosis de antes en la unidad de hoy (si la unidad cambió)", () => {
    const antes = { dosis: 5, unidadDosis: "mg" as const, dosisMg: 5, dosisUi: 16.7, dosisMl: 0.167 };
    expect(enUnidad(antes, "mg")).toBe(5);
    expect(enUnidad(antes, "UI")).toBe(16.7);
    expect(enUnidad({ dosis: 17, unidadDosis: "UI", dosisMg: null, dosisUi: 17, dosisMl: 0.17 }, "mg")).toBeNull();
  });

  // Probado contra el backend (23-nov): con el vial de 15 mg (30 mg/ml) iba en 25 UI = 7,5 mg; al pasar al
  // de 10 mg (20 mg/ml) «Subir» ofrecía «38 UI (7,5 mg)» (los mismos mg) e «Igual» escribía 25 UI (5 mg).
  const PASOS_10: Paso[] = [
    { mg: 2.5, ui: 12.5, ml: 0.125 },
    { mg: 5, ui: 25, ml: 0.25 },
    { mg: 7.5, ui: 37.5, ml: 0.375 },
    { mg: 10, ui: 50, ml: 0.5 },
    { mg: 12.5, ui: 62.5, ml: 0.625 },
    { mg: 15, ui: 75, ml: 0.75 },
  ];
  const UI_25_DE_30 = { dosis: 25, unidadDosis: "UI" as const, dosisMg: 7.5, dosisUi: 25, dosisMl: 0.25 };
  const UI_25_DE_20 = { dosis: 25, unidadDosis: "UI" as const, dosisMg: 5, dosisUi: 25, dosisMl: 0.25 };

  it("con otro vial, «Subir» compara por los mg de esa semana: ni repite la dosis ni saltea un escalón", () => {
    // 7,5 mg con el vial viejo → sube a 10 mg (50 UI del vial nuevo), no a 7,5 mg (38 UI).
    expect(pasoSiguiente(PASOS_10, UI_25_DE_30, "UI")?.mg).toBe(10);
    expect(sinNb(textoSubir(pasoSiguiente(PASOS_10, UI_25_DE_30, "UI")!, "UI"))).toBe("Subir: 50 UI (10 mg)");
    // 5 mg con el de 20 mg/ml → al volver al de 30 mg/ml sube a 7,5 mg (25 UI), no a 10 mg.
    expect(pasoSiguiente(PASOS_15, UI_25_DE_20, "UI")?.mg).toBe(7.5);
    // En ml y con la unidad cambiada a mg, igual.
    expect(pasoSiguiente(PASOS_15, { dosis: 0.17, unidadDosis: "ml", dosisMg: 5.1, dosisUi: 17, dosisMl: 0.17 }, "ml")?.mg).toBe(7.5);
    expect(pasoSiguiente(PASOS_10, UI_25_DE_30, "mg")?.mg).toBe(10);
    // Anotada sin vial (sin mg): como antes, lo anotado contra los escalones de hoy.
    expect(pasoSiguiente(PASOS_15, { dosis: 17, unidadDosis: "UI", dosisMg: null, dosisUi: 17, dosisMl: 0.17 }, "UI")?.mg).toBe(7.5);
  });

  it("con otro vial, «Igual que la anterior» escribe los mismos mg en el vial de hoy", () => {
    expect(mismaDosisEn(UI_25_DE_30, "UI", 20, 100)).toBe(37.5);
    expect(paraEscribir(mismaDosisEn(UI_25_DE_30, "UI", 20, 100)!, "UI")).toBe("38");
    expect(mismaDosisEn(UI_25_DE_20, "UI", 30, 100)).toBe(16.7);
    expect(mismaDosisEn(UI_25_DE_30, "ml", 20, 100)).toBe(0.375);
    expect(mismaDosisEn(UI_25_DE_30, "mg", null, 100)).toBe(7.5);
    // Mismo vial: lo anotado tal cual (8 UI no se vuelve 8,0 por la cuenta).
    expect(mismaDosisEn({ dosis: 8, unidadDosis: "UI", dosisMg: 2.4, dosisUi: 8, dosisMl: 0.08 }, "UI", 30, 100)).toBe(8);
    expect(mismaDosisEn(UI_25_DE_30, "UI", 30, 100)).toBe(25);
    // Sin vial hoy o sin mg de antes: lo anotado (o su equivalencia), como antes.
    expect(mismaDosisEn(UI_25_DE_30, "UI", null, 100)).toBe(25);
    expect(mismaDosisEn({ dosis: 17, unidadDosis: "UI", dosisMg: null, dosisUi: 17, dosisMl: 0.17 }, "ml", 30, 100)).toBe(0.17);
    expect(mismaDosisEn(null, "UI", 30, 100)).toBeNull();
  });
});

describe("los kilos", () => {
  it("bajó con «↓», subió con «↑», igual con «=»", () => {
    expect(sinNb(flechaKg(7.2)!.texto)).toBe("↓ 7,2");
    expect(flechaKg(-0.8)).toEqual({ texto: `↑${NB}0,8`, subio: true, igual: false });
    expect(flechaKg(0)!.igual).toBe(true);
    expect(flechaKg(null)).toBeNull();
  });

  it("lo que cambia con el peso que se escribe: «↓ 1,2 esta semana · ↓ 7,2 en total»", () => {
    expect(sinNb(textoCambioPeso(121.8, 123, 129))).toBe("↓ 1,2 esta semana · ↓ 7,2 en total");
    expect(sinNb(textoCambioPeso(124.7, 123.9, 129))).toBe("↑ 0,8 esta semana · ↓ 4,3 en total");
    expect(textoCambioPeso(123, null, null)).toBe("");
    expect(textoCambioPeso(null, 123, 129)).toBe("");
  });

  // §7 (Kevin, 23-nov): lo de la semana es lo principal, con palabras; el total, de dato secundario.
  it("con palabras: «Bajó 0,7», «Subió 0,3», «Igual»; y el total «2,1 desde el inicio»", () => {
    expect(sinNb(textoKg(0.7)!.texto)).toBe("Bajó 0,7");
    expect(textoKg(0.7)!.tono).toBe("bajo");
    expect(sinNb(textoKg(-0.3)!.texto)).toBe("Subió 0,3");
    expect(textoKg(-0.3)!.tono).toBe("subio");
    expect(textoKg(0.001)).toEqual({ texto: "Igual", tono: "igual", cifra: "0" });
    expect(textoKg(null)).toBeNull();
    expect(textoKgTotal(2.1)).toBe("2,1 desde el inicio");
    expect(textoKgTotal(-0.8)).toBe("Subió 0,8 desde el inicio");
    expect(textoKgTotal(0)).toBe("Igual que al inicio");
    expect(textoKgTotal(undefined)).toBeNull();
  });

  it("el resultado en vivo del peso: contra el último peso cargado antes de esa semana, y el total", () => {
    const r = resultadoDelPeso(123.2, { pesoKg: 123.9, semana: 4 }, { pesoKg: 126, semana: 0 }, 5)!;
    expect(sinNb(r.semana!.texto)).toBe("Bajó 0,7 kg");
    expect(r.semana!.desde).toBe("desde la semana pasada");
    expect(sinNb(r.total!)).toBe("Bajó 2,8 kg desde el inicio (126 kg)");
    // El último peso es de otra semana (la pasada no tuvo peso), o es el inicial.
    expect(resultadoDelPeso(124, { pesoKg: 123.9, semana: 3 }, null, 5)!.semana!.desde).toBe("desde la semana 3");
    const desdeInicial = resultadoDelPeso(125, { pesoKg: 126, semana: 0 }, { pesoKg: 126, semana: 0 }, 1)!;
    expect(desdeInicial.semana!.desde).toBe("desde el inicial");
    expect(desdeInicial.total).toBeNull();
    // Igual: «Igual que la semana pasada».
    const igual = resultadoDelPeso(123.9, { pesoKg: 123.9, semana: 4 }, { pesoKg: 126, semana: 0 }, 5)!;
    expect([igual.semana!.texto, igual.semana!.desde, igual.semana!.tono]).toEqual(["Igual", "que la semana pasada", "igual"]);
    expect(resultadoDelPeso(null, { pesoKg: 123.9, semana: 4 }, null, 5)).toBeNull();
  });
});

describe("la semana pasada, la dosis marcada y el pago anterior (§7.2)", () => {
  const lucia = armarTratamiento(pacientesDePrueba("2026-11-23").find((p) => p.paciente.id === 12)!.tratamientos[0]);

  it("la última dosis aplicada antes de la semana y cuántas aplicaciones lleva (la «No se aplicó» no corta ni suma)", () => {
    const r = rachaAntes(lucia.registros, 8)!;
    expect([r.dosis.dosis, r.dosis.unidadDosis, r.semana, r.aplicaciones]).toEqual([17, "UI", 7, 4]);
    // Antes de la semana 7: la última aplicada es la 5 (la 6 no se aplicó).
    expect(rachaAntes(lucia.registros, 7)).toMatchObject({ semana: 5, aplicaciones: 3 });
    expect(rachaAntes(lucia.registros, 3)).toMatchObject({ semana: 2, aplicaciones: 3 });
    expect(rachaAntes(lucia.registros, 0)).toBeNull();
  });

  // Probado el 24-nov: tras cambiar de vial, la tabla mostraba «5 mg» todas las semanas y la franja decía «lleva 1 aplicación con esa dosis».
  it("la racha por escalón: tras un cambio de vial, 25 UI del de 20 mg/ml siguen la de 17 UI del de 30 (las dos son los 5 mg)", () => {
    const crudo = pacientesDePrueba("2026-11-23").find((p) => p.paciente.id === 32)!.tratamientos[0];
    const conCambio = (dosisDesdeLa8: number) =>
      armarTratamiento({
        ...crudo,
        semanas: crudo.semanas.map((s) =>
          s.semana < 6
            ? s
            : { ...s, dosis: s.semana >= 8 ? dosisDesdeLa8 : 25, mgPorMl: 20, ...(s.semana === 6 ? { producto: { nombre: "TG", vialMg: 10, vialMl: 0.5 } } : {}) },
        ),
      });
    const t = conCambio(25);
    const aplicadas = t.registros.filter((r) => r.dosis != null && !r.sinDosis).length;
    const escalones = (s: number) => escalonesDeLaSemana(t, s, CATALOGO_SEGUIMIENTO);
    // Con la cuenta exacta (5,1 mg contra 5 mg) la racha se cortaba en el cambio.
    expect(rachaAntes(t.registros, Infinity)).toMatchObject({ semana: 9, aplicaciones: 4 });
    expect(rachaAntes(t.registros, Infinity, escalones)).toMatchObject({ semana: 9, aplicaciones: aplicadas });
    expect(aplicadas).toBeGreaterThan(4);
    // La dosis que devuelve es la anotada, sin tocar.
    expect(rachaAntes(t.registros, Infinity, escalones)!.dosis).toMatchObject({ dosis: 25, unidadDosis: "UI", dosisMg: 5 });
    expect(rachaAntes(t.registros, 7, escalones)!.dosis).toMatchObject({ dosis: 25, unidadDosis: "UI" });
    expect(rachaAntes(t.registros, 6, escalones)!.dosis).toMatchObject({ dosis: 17, dosisMg: 5.1 });
    // Subir de escalón sí la corta: 38 UI del vial nuevo son los 7,5 mg.
    const subio = conCambio(38);
    expect(rachaAntes(subio.registros, Infinity, (s) => escalonesDeLaSemana(subio, s, CATALOGO_SEGUIMIENTO))).toMatchObject({ semana: 9, aplicaciones: 2 });
  });

  it("«Igual que la anterior»: lo anotado tal cual; con otro vial, los mismos mg (con «≈»)", () => {
    const antes = { dosis: 17, unidadDosis: "UI" as const, dosisMg: 5.1, dosisUi: 17, dosisMl: 0.17 };
    expect(igualQueLaAnterior(antes, "UI", 30, 100)).toEqual({ escribe: "17", valor: 17, calculada: false });
    expect(igualQueLaAnterior(antes, "UI", 20, 100)).toEqual({ escribe: "26", valor: 25.5, calculada: true });
    expect(igualQueLaAnterior({ ...antes, dosis: 7.5, dosisMg: 2.25 }, "UI", 30, 100)!.escribe).toBe("7,5");
    expect(igualQueLaAnterior(null, "UI", 30, 100)).toBeNull();
  });

  it("una dosis con su otro dato: «17 UI · 5,1 mg», «2,5 mg · ≈ 8 UI», «17 UI (5,1 mg)»", () => {
    expect(sinNb(dosisConMg({ dosis: 17, unidadDosis: "UI", dosisMg: 5.1 }))).toBe("17 UI · 5,1 mg");
    expect(sinNb(dosisConMg({ dosis: 2.5, unidadDosis: "mg", dosisUi: 8.3 }))).toBe("2,5 mg · ≈ 8 UI");
    expect(sinNb(dosisConMg({ dosis: 10, unidadDosis: "UI", dosisMg: null }))).toBe("10 UI");
    expect(sinNb(dosisYSusMg({ dosis: 17, unidadDosis: "UI", dosisMg: 5.1 }))).toBe("17 UI (5,1 mg)");
    expect(sinNb(dosisYSusMg({ dosis: 2.5, unidadDosis: "mg", dosisUi: 8.3 }))).toBe("2,5 mg");
  });

  it("un escalón en su botón: arriba la unidad del tratamiento, abajo el otro dato", () => {
    const p = PASOS_15[0];
    expect(Object.values(partesPaso(p, "UI")).map((t) => sinNb(t ?? ""))).toEqual(["8 UI", "2,5 mg"]);
    expect(Object.values(partesPaso(p, "mg")).map((t) => sinNb(t ?? ""))).toEqual(["2,5 mg", "8 UI"]);
    expect(Object.values(partesPaso(p, "ml")).map((t) => sinNb(t ?? ""))).toEqual(["0,08 ml", "2,5 mg"]);
    expect(partesPaso({ mg: 2.5, ui: null, ml: null }, "mg").secundario).toBeNull();
  });

  it("el pago anterior: «El anterior: Bs 630 el 02/11 (480 + 150)»", () => {
    const p = ultimoPagoAntes(lucia.registros, 8)!;
    // La semana 4 sólo tiene «Otro» (jeringas): también es un pago anotado.
    expect(p).toMatchObject({ total: 50, partes: [50] });
    expect(sinNb(textoPagoAnterior(p))).toMatch(/^El anterior: Bs 50 el \d\d\/\d\d$/);
    const inicial = ultimoPagoAntes(lucia.registros, 4)!;
    expect(sinNb(textoPagoAnterior(inicial))).toMatch(/^El anterior: Bs 630 el \d\d\/\d\d \(480 \+ 150\)$/);
    expect(ultimoPagoAntes(lucia.registros, 0)).toBeNull();
  });

  it("el peso de la evaluación en una semana: «La evaluación de hoy anotó…» o con su fecha", () => {
    const control = { fecha: "2026-11-23", pesoKg: 123.4 };
    expect(sinNb(pesoDeLaEvaluacion(control, "2026-11-16", "semana", "2026-11-23")!.texto)).toBe("La evaluación de hoy anotó 123,4 kg");
    expect(sinNb(pesoDeLaEvaluacion(control, "2026-11-16", "semana", "2026-11-25")!.texto)).toBe("La evaluación del 23/11/2026 anotó 123,4 kg");
    expect(pesoDeLaEvaluacion(control, "2026-11-24", "semana", "2026-11-25")).toBeNull();
  });
});

describe("las fechas", () => {
  it("los días desde la última visita: «hoy», «ayer», «hace 7 días»", () => {
    expect(haceDias("2026-11-23", "2026-11-23")).toBe("hoy");
    expect(haceDias("2026-11-22", "2026-11-23")).toBe("ayer");
    expect(haceDias("2026-11-16", "2026-11-23")).toBe(`hace${NB}7${NB}días`);
    // Cruza el fin de mes y el cambio de año.
    expect(diasEntre("2026-12-28", "2027-01-04")).toBe(7);
    expect(haceDias(null, "2026-11-23")).toBe("");
  });
});

describe("los meses y los pagos (sin la cuenta: la hace el servidor)", () => {
  const meses: MesTratamiento[] = [
    { mes: 1, desdeSemana: 0, hastaSemana: 4, semanaDePago: 0, debe: false, pagado: { medicamento: 480, control: 150, otro: 0, total: 630 } },
    { mes: 2, desdeSemana: 5, hastaSemana: 9, semanaDePago: 5, debe: true, pagado: { medicamento: 0, control: 0, otro: 0, total: 0 } },
  ];

  it("«Mes 1 · Inicial a semana 4», «Mes 2 · Semanas 5 a 9»", () => {
    expect(tituloMes(meses[0])).toBe("Mes 1 · Inicial a semana 4");
    expect(tituloMes(meses[1])).toBe("Mes 2 · Semanas 5 a 9");
  });

  it("el casillero amarillo es la semana de pago de su mes, sin el inicial; el mes sale de lo que mandó el servidor", () => {
    expect(mesDeLaSemana(meses, 7)?.mes).toBe(2);
    expect(mesDeLaSemana(meses, 12)).toBeNull();
    expect(esSemanaDePago(meses, 0)).toBe(true);
    expect(casilleroAmarillo(meses, 0)).toBe(false);
    expect(casilleroAmarillo(meses, 5)).toBe(true);
    expect(casilleroAmarillo(meses, 6)).toBe(false);
    // Con los avisos apagados el servidor no manda semana de pago: nada amarillo.
    expect(casilleroAmarillo([{ ...meses[1], semanaDePago: null }], 5)).toBe(false);
  });

  it("lo que falta pagar y el último pago, para leer", () => {
    const pp = { mes: 2, semana: 5, desde: "2026-12-07" };
    expect(textoFaltaPago(pp)).toBe("Falta el pago de la semana 5 (desde el 07/12/2026)");
    expect(textoFaltaPago({ mes: 1, semana: 0, desde: "2026-11-02" })).toBe("Falta el pago inicial");
    expect(sinNb(textoPendiente(pp, "2026-12-16"))).toBe("Pago de la semana 5 · desde el 07/12/2026 (hace 9 días)");
    expect(textoPendiente({ mes: 1, semana: 0, desde: "2026-11-02" }, "2026-11-02")).toBe("Pago inicial · desde el 02/11/2026 (hoy)");
    expect(sinNb(textoUltimoPago({ fecha: "2026-11-02", total: 630 }))).toBe("Último pago: Bs 630 el 02/11/2026");
    expect(sinNb(textoUltimoPago({ fecha: "2026-11-02", total: 1260 }))).toBe("Último pago: Bs 1.260 el 02/11/2026");
    expect(textoUltimoPago(null)).toBe("Todavía no pagó nada");
    // «el» y la fecha no se separan (en la tablet, la fecha quedaba sola en otro renglón).
    expect(textoUltimoPago({ fecha: "2026-11-02", total: 630 })).toContain(`el${NB}02/11/2026`);
  });
});

describe("el producto de cada semana (§7.1)", () => {
  const crudo = pacientesDePrueba("2026-11-23").find((p) => p.paciente.id === 12)!.tratamientos[0];
  const marcas = (cambios: Record<number, { nombre: string; vialMg?: number; vialMl?: number }>) =>
    armarTratamiento({ ...crudo, semanas: crudo.semanas.map((s) => (cambios[s.semana] ? { ...s, producto: cambios[s.semana] } : s)) });

  it("vigente en la semana W: la marca más alta ≤ W; si no hay, el del inicio", () => {
    const t = marcas({ 3: { nombre: "TG", vialMg: 10, vialMl: 0.5 }, 6: { nombre: "Tirze" } });
    expect(productoVigente(t, 2)).toEqual({ nombre: "Tirzepatida", vialMg: 15, vialMl: 0.5 });
    expect(productoVigente(t, 3)).toEqual({ nombre: "TG", vialMg: 10, vialMl: 0.5 });
    expect(productoVigente(t, 5)).toEqual({ nombre: "TG", vialMg: 10, vialMl: 0.5 });
    expect(productoVigente(t, 8)).toEqual({ nombre: "Tirze", vialMg: null, vialMl: null });
    // Sin contar la marca del registro que se corrige (va en el formulario).
    expect(productoVigente(t, 6, t.registros.find((r) => r.semana === 6)!.id).nombre).toBe("TG");
    expect(marcaVigente(t.registros, 8)?.semana).toBe(6);
    expect(productoInicialDe(t)).toEqual({ nombre: "Tirzepatida", vialMg: 15, vialMl: 0.5 });
  });

  it("un backend sin marcas: el producto es el del tratamiento", () => {
    const t = armarTratamiento(crudo);
    expect(t.productoInicial).toBeUndefined();
    expect(productoVigente(t, 9)).toEqual({ nombre: "Tirzepatida", vialMg: 15, vialMl: 0.5 });
  });

  it("el renglón de la marca: «Desde la semana 6 usa Tirze · 10 mg en 0,5 ml · antes TG»", () => {
    const t = marcas({ 3: { nombre: "TG" }, 6: { nombre: "Tirze", vialMg: 10, vialMl: 0.5 } });
    expect(sinNb(textoMarca(t.registros.find((r) => r.semana === 6)!))).toBe("Desde la semana 6 usa Tirze · 10 mg en 0,5 ml · antes TG");
    expect(textoMarca(t.registros.find((r) => r.semana === 3)!)).toBe("Desde la semana 3 usa TG · antes Tirzepatida");
    expect(sinNb(textoProducto({ nombre: "Tirze", vialMg: 15, vialMl: 0.5 }))).toBe("Tirze · 15 mg en 0,5 ml");
  });
});

describe("el catálogo", () => {
  it("el tratamiento se busca sin distinguir mayúsculas ni tildes", () => {
    expect(delCatalogo(CATALOGO_SEGUIMIENTO, "tirzepatída")?.nombre).toBe("Tirzepatida");
    expect(delCatalogo(CATALOGO_SEGUIMIENTO, " RETATRUTIDA ")?.nombre).toBe("Retatrutida");
    expect(delCatalogo(CATALOGO_SEGUIMIENTO, "Otro")).toBeNull();
    expect(delCatalogo(CATALOGO_SEGUIMIENTO, "")).toBeNull();
  });
});

describe("cómo se lee una dosis anotada (§7.4): la de un escalón, con sus valores y sin «≈»", () => {
  const ESC_30 = { pasosMg: [2.5, 5, 7.5, 10, 12.5, 15], mgPorMl: 30, uiPorMl: 100 };
  const ESC_20 = { pasosMg: [2.5, 5, 7.5, 10, 12.5, 15], mgPorMl: 20, uiPorMl: 100 };
  const leer = (d: Parameters<typeof leerDosis>[0], e?: Parameters<typeof leerDosis>[1]) => {
    const l = leerDosis(d, e);
    return { ...l, anotado: sinNb(l.anotado), equivalencias: l.equivalencias.map(sinNb), otra: l.otra && sinNb(l.otra) };
  };

  it("8 UI con el vial de 30 mg/ml es el escalón de 2,5 mg: «8 UI · 2,5 mg», no «≈ 2,4 mg»", () => {
    const l = leer({ dosis: 8, unidadDosis: "UI", dosisMg: 2.4, dosisUi: 8, dosisMl: 0.08 }, ESC_30);
    expect(l).toMatchObject({ anotado: "8 UI", equivalencias: ["2,5 mg", "0,08 ml"], aprox: false, otra: "2,5 mg" });
    // 42 UI es el de 12,5 mg (41,7 redondeado), no «12,6 mg».
    expect(leer({ dosis: 42, unidadDosis: "UI", dosisMg: 12.6, dosisUi: 42, dosisMl: 0.42 }, ESC_30)).toMatchObject({ equivalencias: ["12,5 mg", "0,42 ml"], aprox: false });
    expect(sinNb(dosisConMg({ dosis: 42, unidadDosis: "UI", dosisMg: 12.6, dosisUi: 42, dosisMl: 0.42 }, ESC_30))).toBe("42 UI · 12,5 mg");
    expect(sinNb(dosisYSusMg({ dosis: 8, unidadDosis: "UI", dosisMg: 2.4, dosisUi: 8, dosisMl: 0.08 }, ESC_30))).toBe("8 UI (2,5 mg)");
  });

  it("fuera de los escalones (o sin ellos), lo calculado con «≈», como antes", () => {
    expect(leer({ dosis: 20, unidadDosis: "UI", dosisMg: 6, dosisUi: 20, dosisMl: 0.2 }, ESC_30)).toMatchObject({ equivalencias: ["6 mg", "0,20 ml"], aprox: true, otra: "6 mg" });
    // 8,3 anotado no es lo que escribe el botón (8): es una dosis «Otra».
    expect(leer({ dosis: 8.3, unidadDosis: "UI", dosisMg: 2.49, dosisUi: 8.3, dosisMl: 0.083 }, ESC_30).aprox).toBe(true);
    expect(leer({ dosis: 8, unidadDosis: "UI", dosisMg: 2.4, dosisUi: 8, dosisMl: 0.08 }).aprox).toBe(true);
    expect(leer({ dosis: 8, unidadDosis: "UI", dosisMg: 2.4, dosisUi: 8, dosisMl: 0.08 }, { pasosMg: [] }).equivalencias).toEqual(["2,4 mg", "0,08 ml"]);
  });

  it("con otro vial, el escalón es el de ESA semana: 38 UI de 20 mg/ml son 7,5 mg (37,5 redondeado)", () => {
    expect(leer({ dosis: 38, unidadDosis: "UI", dosisMg: 7.6, dosisUi: 38, dosisMl: 0.38 }, ESC_20)).toMatchObject({ equivalencias: ["7,5 mg", "0,38 ml"], aprox: false });
    // Sin la pista del vial, la concentración sale de lo guardado (7,6 / 0,38 = 20).
    expect(leer({ dosis: 38, unidadDosis: "UI", dosisMg: 7.6, dosisUi: 38, dosisMl: 0.38 }, { pasosMg: ESC_20.pasosMg }).aprox).toBe(false);
    // 8 UI con 20 mg/ml son 1,6 mg: no es ningún escalón.
    expect(leer({ dosis: 8, unidadDosis: "UI", dosisMg: 1.6, dosisUi: 8, dosisMl: 0.08 }, ESC_20).aprox).toBe(true);
    // La pista que no coincide con lo guardado (el vial se corrigió después) no manda: va lo guardado.
    expect(leer({ dosis: 8, unidadDosis: "UI", dosisMg: 2.4, dosisUi: 8, dosisMl: 0.08 }, ESC_20)).toMatchObject({ equivalencias: ["2,5 mg", "0,08 ml"], aprox: false });
  });

  it("en mg, el espejo: «2,5 mg · 8 UI» sin «≈»; y en ml, «0,08 ml · 2,5 mg»", () => {
    expect(leer({ dosis: 2.5, unidadDosis: "mg", dosisMg: 2.5, dosisUi: 8.3, dosisMl: 0.083 }, ESC_30)).toMatchObject({ equivalencias: ["8 UI", "0,08 ml"], aprox: false, otra: "8 UI" });
    expect(sinNb(dosisConMg({ dosis: 2.5, unidadDosis: "mg", dosisMg: 2.5, dosisUi: 8.3, dosisMl: 0.083 }, ESC_30))).toBe("2,5 mg · 8 UI");
    expect(leer({ dosis: 3, unidadDosis: "mg", dosisMg: 3, dosisUi: 10, dosisMl: 0.1 }, ESC_30).aprox).toBe(true);
    expect(leer({ dosis: 0.08, unidadDosis: "ml", dosisMg: 2.4, dosisUi: 8, dosisMl: 0.08 }, ESC_30)).toMatchObject({ equivalencias: ["2,5 mg", "8 UI"], aprox: false, otra: "2,5 mg" });
    // En mg sin vial: es el escalón, pero no hay UI ni ml que mostrar.
    expect(leer({ dosis: 5, unidadDosis: "mg", dosisMg: 5, dosisUi: null, dosisMl: null }, { pasosMg: ESC_30.pasosMg })).toMatchObject({ equivalencias: [], otra: null });
  });

  it("«Igual que la anterior» con otro vial: los mg del escalón (17 UI de 30 mg/ml son 5 mg → 25 UI de 20 mg/ml, no 26)", () => {
    const antes = { dosis: 17, unidadDosis: "UI" as const, dosisMg: 5.1, dosisUi: 17, dosisMl: 0.17 };
    expect(conMgDelEscalon(antes, ESC_30).dosisMg).toBe(5);
    expect(igualQueLaAnterior(conMgDelEscalon(antes, ESC_30), "UI", 20, 100)).toEqual({ escribe: "25", valor: 25, calculada: true });
    // Con el mismo vial no cambia nada: escribe lo anotado.
    expect(igualQueLaAnterior(conMgDelEscalon(antes, ESC_30), "UI", 30, 100)).toEqual({ escribe: "17", valor: 17, calculada: false });
    // Fuera de los escalones, los mg de la cuenta.
    expect(conMgDelEscalon({ dosis: 20, unidadDosis: "UI" as const, dosisMg: 6, dosisUi: 20, dosisMl: 0.2 }, ESC_30).dosisMg).toBe(6);
  });

  it("los escalones de cada semana: los del tratamiento y el vial del producto vigente (§7.1)", () => {
    const crudo = pacientesDePrueba("2026-11-23").find((p) => p.paciente.id === 12)!.tratamientos[0];
    const t = armarTratamiento({ ...crudo, semanas: crudo.semanas.map((s) => (s.semana === 3 ? { ...s, producto: { nombre: "TG", vialMg: 10, vialMl: 0.5 } } : s)) });
    expect(escalonesDeLaSemana(t, 2, CATALOGO_SEGUIMIENTO)).toEqual({ pasosMg: [2.5, 5, 7.5, 10, 12.5, 15], mgPorMl: 30, uiPorMl: 100 });
    expect(escalonesDeLaSemana(t, 4, CATALOGO_SEGUIMIENTO).mgPorMl).toBe(20);
    // El producto de hoy no es del catálogo (sin pasos del servidor): los de la droga del inicio.
    expect(pasosMgDe({ ...t, pasos: [] }, CATALOGO_SEGUIMIENTO, "Tirze")).toEqual([2.5, 5, 7.5, 10, 12.5, 15]);
    expect(pasosMgDe({ ...t, pasos: [], nombre: "Otra", productoInicial: { nombre: "Otra", vialMg: null, vialMl: null }, registros: [] }, CATALOGO_SEGUIMIENTO)).toEqual([]);
  });
});
