import { describe, expect, it } from "vitest";
import { CATALOGO, control } from "../../test/nutricionFixtures";
import {
  anchosDeTabla,
  armadoPorAncho,
  cambioDesdeElInicial,
  cambioEntre,
  duracionEntre,
  fechasIniciales,
  filasDeComparar,
  lineaDeComparacion,
  opcionesDeFecha,
  parDe,
  resumenDeVista,
  textoSinMedir,
  vistaDe,
} from "./controles";
import { MEDIDAS } from "./planilla";

const NBSP = " ";
/** `n` controles, uno por mes desde enero de 2026, el primero inicial. */
const doce = (n = 12) =>
  Array.from({ length: n }, (_, i) =>
    control({ id: i + 1, fecha: `2026-${String(i + 1).padStart(2, "0")}-10`, inicial: i === 0, pesoKg: 100 - i }),
  );

describe("el armado según el ancho", () => {
  it("PC desde 940, tablet de 680 a 939, teléfono debajo; sin medir, PC", () => {
    expect(armadoPorAncho(1046)).toBe("pc");
    expect(armadoPorAncho(940)).toBe("pc");
    expect(armadoPorAncho(939)).toBe("tablet");
    expect(armadoPorAncho(680)).toBe("tablet");
    expect(armadoPorAncho(679)).toBe("telefono");
    expect(armadoPorAncho(358)).toBe("telefono");
    expect(armadoPorAncho(0)).toBe("pc");
  });

  it("las columnas de control se reparten lo que queda y nunca bajan del mínimo", () => {
    const a = anchosDeTabla("pc", 1046, { anteriores: true, cambio: true, controles: 3 });
    // 1046 − (168 + 156 + 80 + 164) = 478 → 159 cada una.
    expect(a.control).toBe(159);
    expect(a.total).toBe(568 + 159 * 3);
    // No entran: 1046 − (168 + 156 + 164) = 558 entre las pegadas → 4 columnas enteras de 139.
    const b = anchosDeTabla("pc", 1046, { anteriores: false, cambio: true, controles: 11 });
    expect(b.control).toBe(139);
    expect(b.total).toBe(488 + 139 * 11);
    // Con «anteriores» (se va de costado) el reparto es el mismo: 720 − (132 + 124 + 124) = 340 → 2 de 170.
    expect(anchosDeTabla("tablet", 720, { anteriores: true, cambio: true, controles: 6 }).control).toBe(170);
    // La tabla del teléfono: 358 − 112 = 246 → 2 columnas de 123.
    expect(anchosDeTabla("telefono", 358, { anteriores: false, cambio: false, controles: 14 })).toMatchObject({ medida: 112, inicial: 0, control: 123 });
    expect(anchosDeTabla("tablet", 720, { anteriores: false, cambio: false, controles: 1 }).anteriores).toBe(0);
  });
});

describe("qué controles se ven", () => {
  it("con un solo control no hay filtro ni controles para mostrar al lado del inicial", () => {
    const v = vistaDe(doce(1), { tipo: "ultimos" }, 3);
    expect(v.hayFiltro).toBe(false);
    expect(v.visibles).toEqual([]);
  });

  it("con el inicial y 3 más no hay filtro: se ve todo", () => {
    const v = vistaDe(doce(4), { tipo: "ultimos" }, 3);
    expect(v.hayFiltro).toBe(false);
    expect(v.visibles).toEqual([1, 2, 3]);
    expect(v.anteriores).toBe(0);
    expect(resumenDeVista(doce(4), v, false)).toBe("Se ven los 4 controles");
  });

  it("12 controles: Últimos 3, Últimos 6 y Todos", () => {
    const c = doce();
    const tres = vistaDe(c, { tipo: "ultimos" }, 3);
    expect(tres.visibles).toEqual([9, 10, 11]);
    expect(tres.anteriores).toBe(8);
    expect(tres.conSeis).toBe(true);
    expect(resumenDeVista(c, tres, false)).toBe("Se ven 4 de 12: el inicial y los 3 últimos");
    const seis = vistaDe(c, { tipo: "seis" }, 3);
    expect(seis.visibles).toEqual([6, 7, 8, 9, 10, 11]);
    expect(seis.anteriores).toBe(5);
    const todos = vistaDe(c, { tipo: "todos" }, 3);
    expect(todos.visibles).toHaveLength(11);
    expect(todos.anteriores).toBe(0);
    expect(resumenDeVista(c, todos, false)).toBe("Se ven los 12 controles");
    expect(resumenDeVista(c, todos, true)).toBe("Se ven los 12 controles: deslizá de costado para ver los anteriores");
  });

  it("«Últimos 6» no existe con 6 o menos controles además del inicial", () => {
    const v = vistaDe(doce(7), { tipo: "seis" }, 3);
    expect(v.conSeis).toBe(false);
    expect(v.filtro.tipo).toBe("ultimos");
    expect(v.visibles).toEqual([4, 5, 6]);
  });

  it("en la tablet, Últimos 2", () => {
    const v = vistaDe(doce(), { tipo: "ultimos" }, 2);
    expect(v.visibles).toEqual([10, 11]);
    expect(resumenDeVista(doce(), v, false)).toBe("Se ven 3 de 12: el inicial y los 2 últimos");
  });

  it("Elegir fechas: entre las dos, inclusive y sin contar el inicial", () => {
    const c = doce();
    const v = vistaDe(c, { tipo: "fechas", desde: "2026-02-10", hasta: "2026-04-10" }, 3);
    expect(v.visibles).toEqual([1, 2, 3]);
    expect(v.anteriores).toBe(0);
    expect(resumenDeVista(c, v, false)).toBe("Se ven 4 de 12: el inicial y los 3 del 10/02/2026 al 10/04/2026");
    // La fecha del inicial no entra aunque esté dentro del rango.
    expect(vistaDe(c, { tipo: "fechas", desde: "2026-01-01", hasta: "2026-01-31" }, 3).visibles).toEqual([]);
  });

  it("un rango sin controles deja sólo el inicial", () => {
    const c = doce();
    const v = vistaDe(c, { tipo: "fechas", desde: "2027-01-01", hasta: "2027-02-01" }, 3);
    expect(v.visibles).toEqual([]);
    expect(resumenDeVista(c, v, false)).toBe("No hay controles en esas fechas: se ve sólo el inicial");
  });

  it("Elegir fechas arranca con la fecha del primero que se veía y la del último control", () => {
    const c = doce();
    expect(fechasIniciales(c, vistaDe(c, { tipo: "ultimos" }, 3))).toEqual({ desde: "2026-10-10", hasta: "2026-12-10" });
  });

  it("dos controles el mismo día cuentan los dos", () => {
    const c = [control({ id: 1, fecha: "2026-01-10", inicial: true }), control({ id: 2, fecha: "2026-02-10" }), control({ id: 3, fecha: "2026-02-10" }), control({ id: 4, fecha: "2026-03-10" }), control({ id: 5, fecha: "2026-04-10" })];
    expect(vistaDe(c, { tipo: "fechas", desde: "2026-02-10", hasta: "2026-02-10" }, 3).visibles).toEqual([1, 2]);
    expect(opcionesDeFecha(c).map((o) => o.texto)).toEqual(["10/01/2026 · Inicial", "10/02/2026", "10/02/2026 (2)", "10/03/2026", "10/04/2026 · Último"]);
  });
});

describe("la duración", () => {
  it("años, meses y días", () => {
    expect(duracionEntre("2025-11-20", "2026-11-23")).toBe("1 año y 3 días");
    expect(duracionEntre("2026-01-10", "2026-03-10")).toBe("2 meses");
    expect(duracionEntre("2026-01-10", "2026-02-10")).toBe("1 mes");
    expect(duracionEntre("2025-01-10", "2026-03-15")).toBe("1 año, 2 meses y 5 días");
    expect(duracionEntre("2026-01-31", "2026-03-01")).toBe("1 mes y 1 día");
    expect(duracionEntre("2025-12-20", "2026-01-05")).toBe("16 días");
  });
  it("el mismo día, y al revés se cuenta igual", () => {
    expect(duracionEntre("2026-05-05", "2026-05-05")).toBe("el mismo día");
    expect(duracionEntre("2026-03-10", "2026-01-10")).toBe("2 meses");
  });
});

describe("el cambio de una medida", () => {
  const a = control({ id: 1, fecha: "2025-11-20", pesoKg: 100.5, imc: 38, imcGrado: "OBESIDAD_2", musculoPct: 25, edadCorporal: 50, grasaPct: 40 });
  const b = control({ id: 2, fecha: "2026-11-23", pesoKg: 86, imc: 32.5, imcGrado: "OBESIDAD_1", musculoPct: 29.2, edadCorporal: 49, grasaPct: 44.2 });

  it("baja en kg, con el color bueno", () => {
    const c = cambioEntre(a, b, MEDIDAS.pesoKg, CATALOGO);
    expect(c.texto).toBe(`↓ 14,5${NBSP}kg`);
    expect(c.tono).toBe("bueno");
  });
  it("sube el % de grasa: malo; sube el músculo: bueno", () => {
    expect(cambioEntre(a, b, MEDIDAS.grasaPct, CATALOGO)).toMatchObject({ texto: `↑ 4,2${NBSP}%`, tono: "malo" });
    expect(cambioEntre(a, b, MEDIDAS.musculoPct, CATALOGO)).toMatchObject({ texto: `↑ 4,2${NBSP}%`, tono: "bueno" });
  });
  it("el peso lleva 2 decimales", () => {
    const x = control({ id: 3, fecha: "2026-01-01", pesoKg: 71.5 });
    const y = control({ id: 4, fecha: "2026-02-01", pesoKg: 70.45 });
    expect(cambioEntre(x, y, MEDIDAS.pesoKg, CATALOGO).texto).toBe(`↓ 1,05${NBSP}kg`);
  });
  it("la edad: «1 año» y «7 años»", () => {
    expect(cambioEntre(a, b, MEDIDAS.edadCorporal, CATALOGO).texto).toBe(`↓ 1${NBSP}año`);
    const c = control({ id: 5, fecha: "2026-11-23", edadCorporal: 43 });
    expect(cambioEntre(a, c, MEDIDAS.edadCorporal, CATALOGO).texto).toBe(`↓ 7${NBSP}años`);
  });
  it("el IMC no lleva unidad y avisa el cambio de grado", () => {
    const c = cambioEntre(a, b, MEDIDAS.imc, CATALOGO);
    expect(c.texto).toBe("↓ 5,5");
    expect(c.grado).toBe("Obesidad grado 2 → Obesidad grado 1");
  });
  it("sin cambio es «=» en gris; sin dos mediciones, «—»", () => {
    const x = control({ id: 6, fecha: "2026-01-01", cinturaCm: 90 });
    const y = control({ id: 7, fecha: "2026-02-01", cinturaCm: 90 });
    expect(cambioEntre(x, y, MEDIDAS.cinturaCm, CATALOGO)).toMatchObject({ texto: "=", tono: "neutro" });
    expect(cambioEntre(x, y, MEDIDAS.caderaCm, CATALOGO)).toMatchObject({ texto: "—", tono: "neutro" });
  });

  it("desde el inicial: las puntas son la primera y la última medición que hay", () => {
    const c = [
      control({ id: 1, fecha: "2025-11-20", inicial: true, pesoKg: 90 }),
      control({ id: 2, fecha: "2025-12-18", pesoKg: 88, cinturaCm: 100 }),
      control({ id: 3, fecha: "2026-10-22", pesoKg: 80, cinturaCm: 92 }),
      control({ id: 4, fecha: "2026-11-23", pesoKg: 78 }),
    ];
    const peso = cambioDesdeElInicial(c, MEDIDAS.pesoKg, CATALOGO, 3);
    expect(peso).toMatchObject({ texto: `↓ 12${NBSP}kg`, del: null });
    // La cintura falta en el inicial y en el último: «del … al …».
    const cintura = cambioDesdeElInicial(c, MEDIDAS.cinturaCm, CATALOGO, 3);
    expect(cintura).toMatchObject({ texto: `↓ 8${NBSP}cm`, del: "del 18/12/2025 al 22/10/2026" });
    // Con una sola medición no hay cambio.
    expect(cambioDesdeElInicial(c, MEDIDAS.cinturaCm, CATALOGO, 1).texto).toBe("—");
  });
});

describe("comparar dos fechas", () => {
  const c = [
    control({ id: 1, fecha: "2025-11-20", inicial: true, pesoKg: 100, grasaPct: 40, grasaGrado: "SOBRE_PROMEDIO", imcGrado: "OBESIDAD_1" }),
    control({ id: 2, fecha: "2026-05-01", pesoKg: 90, grasaPct: null, grasaGrado: "PROMEDIO" }),
    control({ id: 3, fecha: "2026-11-23", pesoKg: 80, imc: 31 }),
  ];

  it("la línea con la duración, el aviso de la misma fecha y el orden al revés", () => {
    expect(lineaDeComparacion(c, parDe(0, 2))).toBe("Del 20/11/2025 al 23/11/2026: 1 año y 3 días");
    expect(lineaDeComparacion(c, parDe(1, 1))).toBe("Elegiste la misma fecha dos veces: no hay cambios que mostrar.");
    const al = parDe(2, 0);
    expect(al).toMatchObject({ desde: 0, hasta: 2, alReves: true });
    expect(lineaDeComparacion(c, al)).toBe("Del 20/11/2025 al 23/11/2026: 1 año y 3 días");
  });

  it("las filas sin dato en ninguna de las dos fechas se esconden y se nombran", () => {
    const { filas, sinMedir } = filasDeComparar(c, parDe(0, 2), CATALOGO);
    expect(filas.map((f) => f.medida.campo)).toEqual(["pesoKg", "imc", "grasaPct"]);
    expect(sinMedir).toEqual(["% de músculo", "Edad corporal", "Grasa visceral", "Cintura", "Cadera", "Pecho"]);
    expect(textoSinMedir(["Cadera", "Pecho"])).toBe("Sin medir en esas fechas: Cadera y Pecho.");
    expect(textoSinMedir([])).toBeNull();
  });

  it("un grado elegido sin valor sale como fila y el cambio de grado se avisa", () => {
    const { filas } = filasDeComparar(c, parDe(0, 1), CATALOGO);
    const grasa = filas.find((f) => f.medida.campo === "grasaPct")!;
    expect(grasa.hasta).toMatchObject({ valor: null });
    expect(grasa.hasta.grado?.nombre).toBe("Promedio");
    expect(grasa.cambio.texto).toBe("—");
    expect(grasa.cambio.grado).toBe("Sobre el promedio → Promedio");
  });

  it("la misma fecha en las dos puntas no cuenta cambios", () => {
    const { filas } = filasDeComparar(c, parDe(0, 0), CATALOGO);
    expect(filas.every((f) => f.cambio.texto === "—" && !f.cambio.grado)).toBe(true);
  });
});
