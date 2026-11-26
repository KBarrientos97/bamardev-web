import { jsPDF } from "jspdf";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOGO, control, paciente } from "../../test/nutricionFixtures";
import { abrirChatConPdf, ALTO, anchoComoSeDibuja, compartirPdf, entraEnLaFuente, FIN, MARGEN, UTIL } from "./pdfComun";
import {
  cambioConPalabras,
  dibujarEvaluacion,
  documentoEvaluacion,
  mensajeDeLaEvaluacion,
  nombreDelPdfEvaluacion,
  pdfDeLaEvaluacion,
  ubicarPiezas,
  type DocumentoEvaluacion,
} from "./pdfEvaluacion";
import { MEDIDAS, tarjetasDeHoy } from "./planilla";
import type { Control, Paciente, PesoDelPaciente } from "./tipos";

/**
 * El PDF de la evaluación (CONTRATO-nutricion-evaluacion-22nov §6): lo que
 * dice el papel es lo que muestran las tarjetas de la planilla, los cambios
 * van con palabras y sin nada que la fuente no tenga, la planilla va en
 * bloques de cinco que no se parten, los textos largos siguen en la hoja
 * siguiente sin perder nada y lo vacío no ocupa lugar.
 */

const HOY = "2026-11-24";

/** Tres controles de una paciente inventada (36 años, 158 cm). */
const tres: Control[] = [
  control({
    id: 1,
    fecha: "2026-10-01",
    inicial: true,
    pesoKg: 72,
    imc: 28.8,
    imcGrado: "SOBREPESO",
    grasaPct: 35.2,
    grasaGrado: "SOBRE_PROMEDIO",
    musculoPct: 24.1,
    musculoGrado: "BAJO",
    grasaVisceral: 8,
    visceralGrado: "NORMAL",
    edadCorporal: 42,
    cinturaCm: 92,
    caderaCm: 104,
    pechoCm: 95,
    nota: "Llega derivada por su médico. Camina poco.",
  }),
  control({ id: 2, fecha: "2026-10-15", pesoKg: 71.5, imc: 28.6, imcGrado: "SOBREPESO", grasaPct: 34, grasaGrado: "SOBRE_PROMEDIO", cinturaCm: 90 }),
  control({
    id: 3,
    fecha: "2026-11-01",
    pesoKg: 70.95,
    imc: 28.4,
    imcGrado: "SOBREPESO",
    grasaPct: 33.1,
    grasaGrado: "SOBRE_PROMEDIO",
    musculoPct: 25,
    musculoGrado: "NORMAL",
    grasaVisceral: 7.5,
    visceralGrado: "NORMAL",
    cinturaCm: 89.5,
  }),
];

const sinSerie = paciente({ controles: tres });

/** La misma paciente con la serie de pesos al día: los de los controles y los de tres semanas del seguimiento. */
const peso = (fecha: string, pesoKg: number, imc: number, origen: PesoDelPaciente["origen"], controlId: number | null = null): PesoDelPaciente => ({
  fecha,
  pesoKg,
  imc,
  imcGrado: "SOBREPESO",
  origen,
  controlId,
  registroId: origen === "SEGUIMIENTO" ? 100 + Math.round(pesoKg) : null,
  semana: null,
});
const conSerie = paciente({
  controles: tres,
  pesos: [
    peso("2026-10-01", 72, 28.8, "CONTROL", 1),
    peso("2026-10-08", 71.8, 28.8, "SEGUIMIENTO"),
    peso("2026-10-15", 71.5, 28.6, "CONTROL", 2),
    peso("2026-10-22", 71.2, 28.5, "SEGUIMIENTO"),
    peso("2026-11-01", 70.95, 28.4, "CONTROL", 3),
    peso("2026-11-08", 70.5, 28.2, "SEGUIMIENTO"),
  ],
});

const documento = (p: Paciente, negocio: string | null = "Consultorio de prueba") => documentoEvaluacion({ negocio, paciente: p, catalogo: CATALOGO, hoy: HOY });

/** Dibuja el documento y anota cada texto: dónde, en qué hoja y cuánto mide dibujado (sin el kerning que jsPDF resta al medir). */
function dibujar(doc: DocumentoEvaluacion) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const textos: { t: string; x: number; y: number; hoja: number; w: number; align?: string; charSpace?: number }[] = [];
  const original = pdf.text.bind(pdf);
  vi.spyOn(pdf, "text").mockImplementation(((t: string | string[], x: number, y: number, o?: { align?: string; charSpace?: number }) => {
    const s = Array.isArray(t) ? t.join(" ") : t;
    textos.push({ t: s, x, y, hoja: pdf.getCurrentPageInfo().pageNumber, w: anchoComoSeDibuja(pdf, s) + (o?.charSpace ?? 0) * s.length, align: o?.align, charSpace: o?.charSpace });
    return original(t, x, y, o);
  }) as typeof pdf.text);
  dibujarEvaluacion(pdf, doc);
  return { pdf, textos, crudo: pdf.output() };
}

/** Ningún texto se sale de los márgenes ni baja hasta el pie (salvo el pie). */
function nadaAlBorde(textos: ReturnType<typeof dibujar>["textos"]) {
  const malos = textos.filter((e) => {
    const izq = e.align === "center" ? e.x - e.w / 2 : e.align === "right" ? e.x - e.w : e.x;
    const der = izq + e.w;
    const esPie = Math.abs(e.y - (ALTO - MARGEN)) < 0.01;
    return izq < MARGEN - 0.5 || der > MARGEN + UTIL + 0.5 || e.y < MARGEN || (!esPie && e.y > FIN);
  });
  return malos.map((e) => `${e.t} (${Math.round(e.x)}, ${Math.round(e.y)})`);
}

const TITULOS = ["CÓMO ESTÁ HOY", "IMC", "EVOLUCIÓN DEL PESO (KG)", "CONTROLES", "NOTAS DE LOS CONTROLES", "FICHA DEL PACIENTE"];
const titulosDibujados = (textos: ReturnType<typeof dibujar>["textos"]) => textos.filter((e) => TITULOS.includes(e.t) && e.x === MARGEN && e.charSpace);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lo que dice el papel", () => {
  it("cabecera y datos del paciente, en 4 columnas", () => {
    const doc = documento(sinSerie);
    expect(doc.negocio).toBe("Consultorio de prueba");
    expect(doc.emitido).toBe("Emitido el 24/11/2026");
    expect(Object.fromEntries(doc.datos.map((d) => [d.etiqueta, d.valor]))).toEqual({
      PACIENTE: "Lucía Paredes Soria",
      CARNET: "1234567 SC",
      EDAD: "36 años",
      SEXO: "Mujer",
      TALLA: "1,58 m",
      TELÉFONO: "70000000",
      "PRIMER CONTROL": "01/10/2026",
      "ÚLTIMO CONTROL": "01/11/2026",
    });
    expect(documento(sinSerie, null).negocio).toBeNull();
    expect(documento(sinSerie, "   ").negocio).toBeNull();
  });

  it("«Cómo está hoy», sin la serie del seguimiento: las seis tarjetas de la pantalla, con los cambios en palabras", () => {
    const doc = documento(sinSerie);
    expect(doc.hoy.map((k) => [k.etiqueta, k.valor, k.grado?.nombre ?? null, k.cambios, k.delSeguimiento])).toEqual([
      ["PESO", "70,95 kg", null, ["Bajó 1,05 kg desde el inicio", "Bajó 0,55 kg desde el anterior"], null],
      ["IMC", "28,4", "Sobrepeso", ["Bajó 0,4 desde el inicio"], null],
      ["% DE GRASA", "33,1 %", "Sobre el promedio", ["Bajó 2,1 % desde el inicio"], null],
      ["% DE MÚSCULO", "25 %", "Normal", ["Subió 0,9 % desde el inicio"], null],
      ["GRASA VISCERAL", "7,5", "Normal", ["Bajó 0,5 desde el inicio"], null],
      ["CINTURA", "89,5 cm", null, ["Bajó 2,5 cm desde el inicio"], null],
    ]);
    // Los mismos números que la tarjeta (salen de la misma función).
    tarjetasDeHoy(sinSerie, CATALOGO).forEach((k, i) => {
      expect(doc.hoy[i].etiqueta).toBe(k.medida.nombre.toUpperCase());
      expect(doc.hoy[i].grado?.nombre ?? null).toBe(k.grado?.nombre ?? null);
    });
  });

  it("con la serie del seguimiento: el Peso y el IMC son los de la última semana, «del seguimiento (fecha)»", () => {
    const doc = documento(conSerie);
    expect(doc.hoy[0]).toEqual({
      etiqueta: "PESO",
      valor: "70,5 kg",
      grado: null,
      cambios: ["Bajó 1,5 kg desde el inicio", "Bajó 0,45 kg desde el anterior"],
      delSeguimiento: "del seguimiento (08/11/2026)",
    });
    expect(doc.hoy[1]).toMatchObject({ valor: "28,2", grado: { nombre: "Sobrepeso", tono: "alerta" }, cambios: ["Bajó 0,6 desde el inicio"], delSeguimiento: "del seguimiento (08/11/2026)" });
    // El resto, de los controles.
    expect(doc.hoy[2]).toMatchObject({ valor: "33,1 %", delSeguimiento: null });
    // El gráfico: los seis pesos, los del seguimiento marcados, con su leyenda.
    expect(doc.pesos.map((x) => [x.etiqueta, x.texto, x.delSeguimiento])).toEqual([
      ["1 oct", "72", false],
      ["8 oct", "71,8", true],
      ["15 oct", "71,5", false],
      ["22 oct", "71,2", true],
      ["1 nov", "70,95", false],
      ["8 nov", "70,5", true],
    ]);
    expect(doc.leyenda).toBe(true);
    // La barra del IMC: el de la última semana.
    expect(doc.imc).toMatchObject({ valor: "28,2", fecha: "08/11/2026", grado: { nombre: "Sobrepeso" } });
    // Sin la serie, los pesos de los controles y sin leyenda.
    const sin = documento(sinSerie);
    expect(sin.pesos.map((x) => x.texto)).toEqual(["72", "71,5", "70,95"]);
    expect(sin.leyenda).toBe(false);
  });

  it("los cambios con palabras: «Bajó», «Subió», «Igual que al inicio»; con dos, sin «desde el anterior»", () => {
    expect(cambioConPalabras(-1.05, MEDIDAS.pesoKg, "inicio")).toBe("Bajó 1,05 kg desde el inicio");
    expect(cambioConPalabras(9, MEDIDAS.grasaPct, "inicio")).toBe("Subió 9 % desde el inicio");
    expect(cambioConPalabras(0, MEDIDAS.pesoKg, "inicio")).toBe("Igual que al inicio");
    expect(cambioConPalabras(0.001, MEDIDAS.imc, "anterior")).toBe("Igual que el anterior");
    expect(cambioConPalabras(-2.05, MEDIDAS.pesoKg, "anterior")).toBe("Bajó 2,05 kg desde el anterior");
    expect(cambioConPalabras(null, MEDIDAS.pesoKg, "inicio")).toBeNull();
    const dos = documento(paciente({ controles: tres.slice(0, 2) }));
    expect(dos.hoy[0].cambios).toEqual(["Bajó 0,5 kg desde el inicio"]);
    const igual = documento(paciente({ controles: [tres[0], { ...tres[1], pesoKg: 72 }] }));
    expect(igual.hoy[0].cambios).toEqual(["Igual que al inicio"]);
  });

  it("la barra del IMC: un tramo por grado con los colores del medidor, los cortes, y la marca en el IMC de hoy", () => {
    const doc = documento(sinSerie);
    expect(doc.imc!.tramos.map((t) => [t.nombre, t.color, t.activo])).toEqual([
      ["Bajo peso", "#7DD3FC", false],
      ["Peso normal", "#2563EB", false],
      ["Sobrepeso", "#FDBA74", true],
      ["Obesidad grado 1", "#FB923C", false],
      ["Obesidad grado 2", "#C2410C", false],
      ["Obesidad grado 3", "#DC2626", false],
    ]);
    expect(doc.imc!.cortes.map((c) => c.texto)).toEqual(["18,5", "25", "30", "35", "40"]);
    // 28,4 cae en el tercer tramo (25 a 30): 2/6 + 3,4/5 de un sexto.
    expect(doc.imc!.posicion).toBeCloseTo((2 + 3.4 / 5) / 6, 5);
  });

  it("un IMC fuera de escala queda en la punta, como la aguja del medidor", () => {
    const alto = documento(paciente({ controles: [control({ id: 1, fecha: "2026-11-01", inicial: true, pesoKg: 212, imc: 84.9, imcGrado: "OBESIDAD_3" })] }));
    expect(alto.imc).toMatchObject({ valor: "84,9", posicion: 1, grado: { nombre: "Obesidad grado 3" } });
    const bajo = documento(paciente({ controles: [control({ id: 1, fecha: "2026-11-01", inicial: true, pesoKg: 22, imc: 8.8, imcGrado: "BAJO_PESO" })] }));
    expect(bajo.imc!.posicion).toBe(0);
    const { textos } = dibujar(alto);
    expect(nadaAlBorde(textos)).toEqual([]);
    expect(textos.some((e) => e.t === "IMC 84,9 · Obesidad grado 3")).toBe(true);
  });

  it("la planilla: las celdas con su grado, «—» sin dato y «sin medir» con el grado elegido sin el valor", () => {
    const c = [...tres.slice(0, 2), { ...tres[2], grasaPct: null, grasaGrado: "PROMEDIO" }];
    const doc = documento(paciente({ controles: c }));
    expect(doc.controles).toHaveLength(1);
    const [b] = doc.controles;
    expect(b.titulo).toBeNull();
    expect(b.columnas).toEqual([
      { fecha: "01/10/2026", tipo: "INICIAL" },
      { fecha: "15/10/2026", tipo: "CONTROL" },
      { fecha: "01/11/2026", tipo: "CONTROL" },
    ]);
    expect(b.filas.map((f) => [f.nombre, f.unidad])).toEqual([
      ["Peso", "(kg)"],
      ["IMC", null],
      ["% de grasa", null],
      ["% de músculo", null],
      ["Edad corporal", "(años)"],
      ["Grasa visceral", null],
      ["Pecho", "(cm)"],
      ["Cintura", "(cm)"],
      ["Cadera", "(cm)"],
    ]);
    const fila = (n: string) => b.filas.find((f) => f.nombre === n)!.celdas;
    expect(fila("Peso").map((x) => x.texto)).toEqual(["72", "71,5", "70,95"]);
    expect(fila("% de grasa")[2]).toEqual({ texto: "sin medir", tipo: "sinMedir", grado: { nombre: "Promedio", tono: "alerta" } });
    expect(fila("% de grasa")[0]).toEqual({ texto: "35,2", tipo: "valor", grado: { nombre: "Sobre el promedio", tono: "alto" } });
    expect(fila("Pecho")[1]).toEqual({ texto: "—", tipo: "vacio", grado: null });
  });

  it("el segundo control del mismo día lleva «(2)», en la planilla y en las notas", () => {
    const c = [tres[0], { ...tres[1], fecha: "2026-10-01", nota: "Repite la medición." }];
    const doc = documento(paciente({ controles: c }));
    expect(doc.controles[0].columnas.map((x) => x.fecha)).toEqual(["01/10/2026", "01/10/2026 (2)"]);
    expect(doc.notas.map((n) => n.titulo)).toEqual(["01/10/2026 · Inicial", "01/10/2026 (2) · Control"]);
  });

  it("sin caracteres fuera de la fuente: lo que escribió el usuario se limpia sin dejar basura", () => {
    const p = paciente({
      nombre: "Lucía Paredes  Soria 🙂",
      telefono: "70000000​",
      observaciones: "Bajó −2 kg ≈ en un mes → bien 👍\tsigue igual.\r\n\r\n\r\nOtro párrafo ő.",
      enfermedades: { DIABETES: { tiene: true, nota: "Tipo 2 ↑ glucosa" }, GASTRITIS: { tiene: false, nota: null } },
      controles: [{ ...tres[0], nota: "Nota con ‘comillas’ — y “dobles”… ✅" }],
    });
    const doc = documento(p, "Consultorio  🌿 de prueba");
    const raros: string[] = [];
    const revisar = (v: unknown): void => {
      if (typeof v === "string") for (const ch of v) if (!entraEnLaFuente(ch)) raros.push(`${JSON.stringify(ch)} en ${JSON.stringify(v)}`);
      if (v && typeof v === "object") Object.values(v).forEach(revisar);
    };
    revisar(doc);
    expect(raros).toEqual([]);
    expect(doc.negocio).toBe("Consultorio de prueba");
    expect(doc.paciente).toBe("Lucía Paredes Soria");
    expect(doc.ficha!.textos[0]).toEqual({ etiqueta: "Observaciones", texto: "Bajó -2 kg aprox. en un mes -> bien sigue igual.\n\nOtro párrafo o." });
    expect(doc.ficha!.enfermedades).toEqual([{ nombre: "Diabetes", nota: "Tipo 2 glucosa" }]);
    expect(doc.notas[0].texto).toBe("Nota con ‘comillas’ — y “dobles”…");
    // Ni el signo menos de verdad, ni «≈», ni flechas, ni espacios duros en todo el papel.
    expect(JSON.stringify(doc)).not.toMatch(/[−≈↓↑→   ​]/);
  });

  it("el archivo no lleva el nombre ni el carnet", () => {
    expect(nombreDelPdfEvaluacion(HOY)).toBe("evaluacion-nutricional-2026-11-24.pdf");
  });
});

describe("lo vacío no ocupa lugar", () => {
  it("ficha vacía: sin la sección; sin notas: sin la sección", () => {
    const p = paciente({ fechaNacimiento: null, hijos: null, controles: tres.map((c) => ({ ...c, nota: null })), observaciones: "  " });
    const doc = documento(p);
    expect(doc.ficha).toBeNull();
    expect(doc.notas).toEqual([]);
    const { textos } = dibujar(doc);
    expect(titulosDibujados(textos).map((e) => e.t)).toEqual(["CÓMO ESTÁ HOY", "IMC", "EVOLUCIÓN DEL PESO (KG)", "CONTROLES"]);
  });

  it("un solo control: un bloque de una columna, un punto en el gráfico, sin cambios", () => {
    const doc = documento(paciente({ controles: [tres[0]] }));
    expect(doc.controles).toHaveLength(1);
    expect(doc.controles[0]).toMatchObject({ titulo: null, columnas: [{ fecha: "01/10/2026", tipo: "INICIAL" }] });
    expect(doc.pesos).toHaveLength(1);
    expect(doc.hoy.every((k) => k.cambios.length === 0)).toBe(true);
    const { textos, pdf } = dibujar(doc);
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(nadaAlBorde(textos)).toEqual([]);
    expect(textos.filter((e) => e.t === "72")).toHaveLength(2); // el punto del gráfico y la celda
  });

  it("sin talla: sin la sección del IMC (el IMC no se calcula)", () => {
    const sinTalla = paciente({ tallaCm: null, controles: tres.map((c) => ({ ...c, imc: null, imcGrado: null })) });
    const doc = documento(sinTalla);
    expect(doc.imc).toBeNull();
    expect(doc.datos.find((d) => d.etiqueta === "TALLA")!.valor).toBe("—");
    expect(doc.hoy[1]).toMatchObject({ valor: "—", grado: null, cambios: [] });
    const { textos } = dibujar(doc);
    expect(titulosDibujados(textos).map((e) => e.t)).not.toContain("IMC");
  });

  it("sin nombre de negocio: la cabecera sin él", () => {
    const { textos } = dibujar(documento(sinSerie, null));
    expect(textos.some((e) => e.t === "Consultorio de prueba")).toBe(false);
    expect(textos.find((e) => e.t === "Evaluación nutricional")).toMatchObject({ align: "right" });
  });
});

describe("las hojas", () => {
  /** 12 controles con notas largas y la ficha entera llena (textos de 2000 letras). */
  const LARGO = Array.from({ length: 60 }, (_, i) => `palabra${i} con algo de texto para llenar el renglón`).join(" ").slice(0, 2000).trim();
  const doce: Control[] = Array.from({ length: 12 }, (_, i) =>
    control({
      id: i + 1,
      fecha: `2026-${String(1 + Math.floor(i / 2)).padStart(2, "0")}-${i % 2 ? "20" : "05"}`,
      inicial: i === 0,
      pesoKg: +(96 - i * 0.85).toFixed(2),
      imc: +((96 - i * 0.85) / 1.58 ** 2).toFixed(1),
      imcGrado: (96 - i * 0.85) / 1.58 ** 2 >= 35 ? "OBESIDAD_2" : "OBESIDAD_1",
      grasaPct: 40 - i * 0.4,
      grasaGrado: "SOBRE_PROMEDIO",
      musculoPct: 22 + i * 0.2,
      musculoGrado: "BAJO",
      grasaVisceral: 12 - i * 0.5,
      visceralGrado: 12 - i * 0.5 >= 10 ? "ALTO" : "NORMAL",
      edadCorporal: 48 - i,
      cinturaCm: 110 - i,
      caderaCm: 120 - i,
      pechoCm: 108 - i,
      nota: i === 4 ? LARGO : i % 3 === 0 ? `Control ${i + 1}: va bien, sigue con el plan.` : null,
    }),
  );
  const lleno = paciente({
    controles: doce,
    hijos: 3,
    enfermedades: Object.fromEntries(CATALOGO.enfermedades.map((e, i) => [e.codigo, { tiene: true, nota: i === 0 ? LARGO.slice(0, 300) : "desde hace años" }])),
    observaciones: LARGO,
    ultimosAnalisis: LARGO,
    otrasEnfermedades: LARGO,
    cirugias: LARGO,
    conductaAlimentaria: LARGO,
    conductaSueno: LARGO,
    actividadFisica: LARGO,
    consumoAgua: LARGO,
  });
  const doc = documento(lleno);
  const { textos, pdf } = dibujar(doc);

  it("12 controles: 3 bloques con su encabezado («Controles 6 a 10 de 12»), cada uno entero en una hoja", () => {
    expect(doc.controles.map((b) => [b.titulo, b.columnas.length])).toEqual([
      ["Controles 1 a 5 de 12", 5],
      ["Controles 6 a 10 de 12", 5],
      ["Controles 11 a 12 de 12", 2],
    ]);
    const encabezados = textos.filter((e) => e.t === "MEDIDA");
    expect(encabezados).toHaveLength(3);
    // El bloque no se parte: su encabezado, su título y su último renglón («Cadera») en la misma hoja.
    const titulos = textos.filter((e) => /^Controles \d+ a \d+ de 12$/.test(e.t));
    const caderas = textos.filter((e) => e.t === "Cadera " || e.t === "Cadera");
    expect(titulos).toHaveLength(3);
    expect(caderas).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(titulos[i].hoja).toBe(encabezados[i].hoja);
      expect(caderas[i].hoja).toBe(encabezados[i].hoja);
    }
  });

  it("una nota y la ficha de 2000 letras siguen en las hojas siguientes sin perder texto", () => {
    expect(LARGO.length).toBe(2000);
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(4);
    const todo = textos.map((e) => e.t).join(" ").replace(/\s+/g, " ");
    // La nota larga y cada texto de la ficha, enteros y en orden.
    expect(todo).toContain(`05/03/2026 · Control ${LARGO}`);
    for (const t of ["Observaciones", "Últimos análisis clínicos", "Otras enfermedades", "Cirugías", "Conducta alimentaria", "Conducta del sueño", "Actividad física", "Consumo de agua"]) {
      expect(todo).toContain(`${t} ${LARGO}`);
    }
    // Las enfermedades de base: las diez, con su nota.
    expect(doc.ficha!.enfermedades).toHaveLength(10);
    expect(todo).toContain("Hígado graso desde hace años");
  });

  it("nada cortado al borde, y ningún título solo al pie de una hoja", () => {
    expect(nadaAlBorde(textos)).toEqual([]);
    const i = (e: (typeof textos)[number]) => textos.indexOf(e);
    for (const t of titulosDibujados(textos)) {
      const siguiente = textos[i(t) + 1];
      expect(siguiente.hoja, `después de «${t.t}»`).toBe(t.hoja);
    }
    // Los subtítulos de la ficha y de las notas, tampoco solos.
    for (const t of textos.filter((e) => /^\d{2}\/\d{2}\/\d{4}.* · (Inicial|Control)$/.test(e.t) || ["Observaciones", "Cirugías", "Enfermedades de base"].includes(e.t))) {
      expect(textos[i(t) + 1].hoja, `después de «${t.t}»`).toBe(t.hoja);
    }
  });

  it("el pie en cada hoja: «Evaluación nutricional · nombre» y «Página X de N»", () => {
    const n = pdf.getNumberOfPages();
    const pies = textos.filter((e) => e.t.startsWith("Página "));
    expect(pies.map((e) => e.t)).toEqual(Array.from({ length: n }, (_, k) => `Página ${k + 1} de ${n}`));
    expect(textos.filter((e) => e.t === "Evaluación nutricional · Lucía Paredes Soria")).toHaveLength(n);
  });

  it("un nombre muy largo no pisa el número de página", () => {
    // Inventado, con muchos apellidos.
    const largo = "Paciente de Prueba Larga Apellidouno Apellidodos Apellidotres Apellidocuatro Apellidocinco Apellidoseis Apellidosiete Apellidoocho Apellidonueve Apellidodiez";
    const { textos: t2 } = dibujar(documento(paciente({ nombre: largo, controles: [tres[0]] })));
    const pie = t2.find((e) => e.t.startsWith("Evaluación nutricional · "))!;
    const pagina = t2.find((e) => e.t.startsWith("Página "))!;
    expect(pie.t.endsWith("…")).toBe(true);
    expect(pie.x + pie.w).toBeLessThan(pagina.x - pagina.w - 8);
  });
});

describe("cómo se reparten las piezas", () => {
  const op = { inicio: 100, arriba: 34, fin: 300 };
  it("un título baja con lo primero de lo suyo; el aire de arriba no va al principio de una hoja", () => {
    const lugares = ubicarPiezas(
      [
        { alto: 150 },
        { alto: 16, antes: 20, conLaSiguiente: true },
        { alto: 60 },
      ],
      op,
    );
    // 100 + 150 = 250; el título (20 + 16) y su bloque (60) no entran: bajan juntos, sin el aire.
    expect(lugares).toEqual([
      { hoja: 0, y: 100 },
      { hoja: 1, y: 34 },
      { hoja: 1, y: 50 },
    ]);
  });

  it("los renglones de un texto largo siguen en la hoja siguiente", () => {
    const lugares = ubicarPiezas(Array.from({ length: 30 }, () => ({ alto: 12.5 })), op);
    expect(lugares.filter((l) => l.hoja === 0)).toHaveLength(16);
    expect(lugares[16]).toEqual({ hoja: 1, y: 34 });
    expect(lugares.every((l) => l.y + 12.5 <= op.fin)).toBe(true);
  });
});

// «Enviar por WhatsApp» (`DialogoWhatsapp`, 26-nov): el chat del número con el mensaje y el PDF bajado,
// o el diálogo de compartir con el PDF. Las dos entregas viven en `pdfComun`.
describe("el envío", () => {
  it("el mensaje y el nombre del archivo, con el texto de siempre", () => {
    expect(mensajeDeLaEvaluacion("2026-11-26")).toBe("Evaluación nutricional al 26/11/2026.");
    expect(nombreDelPdfEvaluacion("2026-11-26")).toBe("evaluacion-nutricional-2026-11-26.pdf");
  });

  it("«Compartir el PDF por otra app»: el diálogo de compartir con el PDF y el mensaje, sin abrir wa.me", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const abrir = vi.spyOn(window, "open").mockReturnValue(null);
    Object.assign(navigator, { share, canShare: () => true });
    try {
      const r = await compartirPdf({ texto: mensajeDeLaEvaluacion(), nombreArchivo: nombreDelPdfEvaluacion(), armar: () => pdfDeLaEvaluacion(documento(sinSerie)) });
      expect(r).toBe("compartido");
      expect(abrir).not.toHaveBeenCalled();
      const datos = share.mock.calls[0][0] as ShareData;
      expect(datos.files?.[0].name).toMatch(/^evaluacion-nutricional-\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(datos.files?.[0].type).toBe("application/pdf");
      expect(datos.text).toMatch(/^Evaluación nutricional al \d{2}\/\d{2}\/\d{4}\.$/);
    } finally {
      Object.assign(navigator, { share: undefined, canShare: undefined });
    }
  });

  it("compartir cancelado no es un error; sin poder compartir, baja el PDF", async () => {
    const bajados: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      bajados.push(this.download);
    });
    const antes = { crear: URL.createObjectURL, soltar: URL.revokeObjectURL };
    Object.assign(URL, { createObjectURL: () => "blob:prueba", revokeObjectURL: () => {} });
    const armar = () => Promise.resolve(new Blob(["%PDF"], { type: "application/pdf" }));
    try {
      Object.assign(navigator, { share: vi.fn().mockRejectedValue(new DOMException("cancelado", "AbortError")), canShare: () => true });
      expect(await compartirPdf({ texto: "Hola.", nombreArchivo: "a.pdf", armar })).toBe("cancelado");
      expect(bajados).toEqual([]);
      Object.assign(navigator, { share: undefined, canShare: undefined });
      expect(await compartirPdf({ texto: "Hola.", nombreArchivo: "a.pdf", armar })).toBe("descargado");
      expect(bajados).toEqual(["a.pdf"]);
    } finally {
      Object.assign(URL, { createObjectURL: antes.crear, revokeObjectURL: antes.soltar });
      Object.assign(navigator, { share: undefined, canShare: undefined });
    }
  });

  it("el chat del número: lo abre ANTES de armar el PDF (en el mismo clic) y después baja el archivo", async () => {
    const abrir = vi.spyOn(window, "open").mockReturnValue(null);
    const bajados: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      bajados.push(this.download);
    });
    // jsdom no tiene `URL.createObjectURL`: uno de mentira mientras dura la prueba.
    const antes = { crear: URL.createObjectURL, soltar: URL.revokeObjectURL };
    Object.assign(URL, { createObjectURL: () => "blob:prueba", revokeObjectURL: () => {} });
    try {
      const envio = abrirChatConPdf({
        numero: "59170000000",
        texto: mensajeDeLaEvaluacion(),
        nombreArchivo: nombreDelPdfEvaluacion(),
        armar: () => pdfDeLaEvaluacion(documento(sinSerie)),
      });
      // Todavía sin esperar nada: el chat ya se abrió.
      expect(abrir).toHaveBeenCalledTimes(1);
      expect(String(abrir.mock.calls[0][0])).toMatch(/^https:\/\/wa\.me\/59170000000\?text=Evaluaci%C3%B3n%20nutricional%20al%20/);
      expect(bajados).toEqual([]);
      await envio;
      expect(bajados).toEqual([expect.stringMatching(/^evaluacion-nutricional-\d{4}-\d{2}-\d{2}\.pdf$/)]);
    } finally {
      Object.assign(URL, { createObjectURL: antes.crear, revokeObjectURL: antes.soltar });
    }
  });

  it("el chat del número, con el PDF ya armado: primero baja el archivo y después abre el chat, sin esperar nada", () => {
    const pasos: string[] = [];
    vi.spyOn(window, "open").mockImplementation((url) => {
      pasos.push(`chat ${String(url)}`);
      return null;
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      pasos.push(`baja ${this.download}`);
    });
    const antes = { crear: URL.createObjectURL, soltar: URL.revokeObjectURL };
    Object.assign(URL, { createObjectURL: () => "blob:prueba", revokeObjectURL: () => {} });
    const armar = vi.fn();
    try {
      void abrirChatConPdf({ numero: "59170000000", texto: "Hola.", nombreArchivo: "a.pdf", armar, listo: new Blob(["%PDF"], { type: "application/pdf" }) });
      // En el mismo toque, las dos cosas y en ese orden; no se vuelve a armar.
      expect(pasos).toEqual(["baja a.pdf", "chat https://wa.me/59170000000?text=Hola."]);
      expect(armar).not.toHaveBeenCalled();
    } finally {
      Object.assign(URL, { createObjectURL: antes.crear, revokeObjectURL: antes.soltar });
    }
  });
});
