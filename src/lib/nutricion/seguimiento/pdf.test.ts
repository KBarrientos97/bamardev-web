import { jsPDF } from "jspdf";
import { describe, expect, it, vi } from "vitest";
import { armarTratamiento, hojaDe, pacientesDePrueba, type SemanaCruda } from "../../../test/seguimientoFixtures";
import { compartirPdf } from "../pdfComun";
import {
  conUnidadesPegadas,
  dibujarSeguimiento,
  documentoSeguimiento,
  dosisParaPdf,
  mensajeDelSeguimiento,
  nombreDelPdf,
  paginarFilas,
  pdfDelSeguimiento,
  type FilaMedida,
} from "./pdf";

/**
 * El PDF del seguimiento (CONTRATO-nutricion-seguimiento-23nov §7.2, maqueta
 * `PDF.dc.html` sin los pagos): lo que dice el papel, cómo se reparten las
 * semanas en las hojas sin cortar nada al borde, y que con 34 semanas salgan
 * varias hojas con el encabezado de la tabla en cada una.
 */

const HOY = "2026-11-23";
const pacientes = pacientesDePrueba(HOY);
const lucia = pacientes.find((p) => p.paciente.id === 12)!;

describe("lo que dice el papel", () => {
  const h = hojaDe(lucia);
  const doc = documentoSeguimiento({ negocio: "Consultorio de prueba", paciente: h.paciente, tratamiento: h.tratamiento!, hoy: HOY });

  it("cabecera, datos del paciente y del tratamiento, y los cuatro cuadros", () => {
    expect(doc.negocio).toBe("Consultorio de prueba");
    expect(doc.emitido).toBe("Emitido el 23/11/2026");
    expect(Object.fromEntries(doc.datos.map((d) => [d.etiqueta, d.valor]))).toMatchObject({
      PACIENTE: "Lucía Paredes Soria",
      CARNET: "1234567 SC",
      EDAD: "36 años",
      TALLA: "1,58 m",
      PRODUCTO: "Tirzepatida · 15 mg en 0,5 ml",
      SEMANAS: "7 de tratamiento",
      "DOSIS ACTUAL": "17 UI · 5 mg",
    });
    expect(doc.resumen.map((k) => [k.etiqueta, k.valor, k.nota])).toEqual([
      ["PESO INICIAL", "129 kg", "IMC 51,7"],
      ["PESO ACTUAL", "124,7 kg", "IMC 50"],
      ["BAJÓ EN TOTAL", "4,3 kg", "en 7 semanas"],
      ["ÚLTIMA SEMANA", "0,8 kg", "subió"],
    ]);
  });

  it("una fila por semana: «Bajó/Subió» y el total, la dosis sin «≈», «No se aplicó» con su motivo, las observaciones enteras", () => {
    const s = (n: string) => doc.filas.find((f) => f.semana === n)!;
    expect(s("Semana 7")).toMatchObject({ peso: "124,7 kg", kg: { texto: "Subió 0,8", tono: "subio" }, kgTotal: "4,3 desde el inicio", dosis: "17 UI · 5 mg" });
    expect(s("Semana 6")).toMatchObject({ dosis: "No se aplicó", dosisDetalle: "Viaje", noSeAplico: true });
    expect(s("Semana 6").observaciones).toMatch(/Retoma la semana que viene con la misma dosis, sin subir\.$/);
    expect(s("Inicial")).toMatchObject({ kg: null, kgTotal: null });
  });

  it("sin pagos, sin «≈», sin flechas ni espacios duros (la fuente del PDF no los tiene)", () => {
    const todo = JSON.stringify(doc);
    expect(todo).not.toMatch(/Bs|Medicamento|Pagado|≈|↓|↑| /);
  });

  it("la marca del cambio de producto va en Observaciones", () => {
    const conMarca = structuredClone(lucia);
    conMarca.tratamientos[0].semanas = conMarca.tratamientos[0].semanas.map((x) => (x.semana === 5 ? { ...x, producto: { nombre: "Tirze", vialMg: 10, vialMl: 0.5 } } : x));
    const hm = hojaDe(conMarca);
    const d = documentoSeguimiento({ negocio: null, paciente: hm.paciente, tratamiento: hm.tratamiento!, hoy: HOY });
    expect(d.filas.find((f) => f.semana === "Semana 5")!.marca).toBe("Desde esta semana usa Tirze · 10 mg en 0,5 ml (antes Tirzepatida).");
    expect(d.datos.find((x) => x.etiqueta === "PRODUCTO")!.valor).toBe("Tirze · 10 mg en 0,5 ml");
    expect(d.negocio).toBeNull();
  });

  it("la dosis para el papel: lo anotado y su otro dato; la de un escalón, con los valores del escalón (§7.4)", () => {
    // 17 UI con el vial de 30 mg/ml es el escalón de 5 mg (16,7 redondeado): «5 mg», no «5,1 mg».
    const esc = { pasosMg: [2.5, 5, 7.5, 10, 12.5, 15], mgPorMl: 30 };
    expect(dosisParaPdf({ dosis: 17, unidadDosis: "UI", dosisMg: 5.1, dosisUi: 17, dosisMl: 0.17 }, esc)).toBe("17 UI · 5 mg");
    expect(dosisParaPdf({ dosis: 8, unidadDosis: "UI", dosisMg: 2.4, dosisUi: 8, dosisMl: 0.08 }, esc)).toBe("8 UI · 2,5 mg");
    expect(dosisParaPdf({ dosis: 20, unidadDosis: "UI", dosisMg: 6, dosisUi: 20, dosisMl: 0.2 }, esc)).toBe("20 UI · 6 mg");
    expect(dosisParaPdf({ dosis: 17, unidadDosis: "UI", dosisMg: 5.1, dosisUi: 17, dosisMl: 0.17 })).toBe("17 UI · 5,1 mg");
    expect(dosisParaPdf({ dosis: 2.5, unidadDosis: "mg", dosisMg: 2.5, dosisUi: 8.3 })).toBe("2,5 mg · 8 UI");
    expect(dosisParaPdf({ dosis: 10, unidadDosis: "UI", dosisMg: null, dosisUi: 10 })).toBe("10 UI");
    expect(dosisParaPdf({ dosis: null, unidadDosis: null, dosisMg: null, dosisUi: null })).toBe("—");
  });

  it("el archivo no lleva el nombre ni el carnet del paciente", () => {
    expect(nombreDelPdf(HOY)).toBe("seguimiento-tratamiento-2026-11-23.pdf");
  });
});

describe("las hojas: nada cortado al borde", () => {
  const fila = (n: number, lineas = 1): FilaMedida<number> => ({ fila: n, altoBase: 40, lineas: Array.from({ length: lineas }, (_, i) => `l${i}`) });
  const op = { primera: 200, resto: 400, altoLinea: 10, relleno: 20 };
  const altoDe = (h: ReturnType<typeof paginarFilas<number>>[number]) => h.reduce((a, e) => a + e.alto, 0);

  it("una semana que no entra al pie baja entera a la hoja siguiente", () => {
    const hojas = paginarFilas([fila(1), fila(2), fila(3), fila(4), fila(5), fila(6)], op);
    expect(hojas.map((h) => h.map((e) => e.fila))).toEqual([[1, 2, 3, 4, 5], [6]]);
    expect(hojas.every((h, i) => altoDe(h) <= (i === 0 ? op.primera : op.resto))).toBe(true);
  });

  it("una semana más alta que una hoja entera se parte por las observaciones y sigue («(sigue)»)", () => {
    const hojas = paginarFilas([fila(1), fila(2, 70)], op);
    const partes = hojas.flat().filter((e) => e.fila === 2);
    expect(partes.length).toBeGreaterThan(1);
    expect(partes[0].sigue).toBe(false);
    expect(partes.slice(1).every((e) => e.sigue)).toBe(true);
    expect(partes.reduce((a, e) => a + e.lineas.length, 0)).toBe(70);
    expect(hojas.every((h, i) => altoDe(h) <= (i === 0 ? op.primera : op.resto))).toBe(true);
  });

  it("si al pie de la primera no entra ni una, la primera queda sin tabla (sin el encabezado solo)", () => {
    const hojas = paginarFilas([fila(1, 3)], { ...op, primera: 30 });
    expect(hojas[0]).toEqual([]);
    expect(hojas[1].map((e) => e.fila)).toEqual([1]);
  });
});

describe("con 34 semanas", () => {
  const largas = (s: number) =>
    s % 9 === 4
      ? "Refiere náuseas leves los dos primeros días después de la aplicación; se le indicó comer porciones chicas, tomar agua durante el día y caminar media hora. Volver a ver la semana que viene cómo sigue."
      : s % 3 === 0
        ? "Sin molestias."
        : null;
  const semanas: SemanaCruda[] = Array.from({ length: 35 }, (_, s) => ({
    semana: s,
    fecha: `2026-${String(1 + Math.floor((s * 7) / 31)).padStart(2, "0")}-${String(1 + ((s * 7) % 28)).padStart(2, "0")}`,
    pesoKg: s === 13 ? null : +(118 - s * 0.38 + (s % 5 === 3 ? 0.6 : 0)).toFixed(2),
    ...(s === 12 || s === 23 ? { sinDosis: true, motivoSinDosis: "Viaje" } : { dosis: s < 4 ? 8 : s < 8 ? 17 : 25 }),
    observaciones: largas(s),
  }));
  const t = armarTratamiento({ ...lucia.tratamientos[0], semanas });
  const doc = documentoSeguimiento({ negocio: "Consultorio de prueba", paciente: lucia.paciente, tratamiento: t, hoy: HOY });

  it("varias hojas, con el encabezado de la tabla y el número de página en cada una", () => {
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    dibujarSeguimiento(pdf, doc);
    const paginas = pdf.getNumberOfPages();
    expect(paginas).toBeGreaterThanOrEqual(2);
    const crudo = pdf.output();
    expect(crudo).toContain("(Semana 34)");
    expect(crudo).toContain(`(Página ${paginas} de ${paginas})`);
    // El encabezado de la tabla, una vez por hoja.
    expect(crudo.split("(OBSERVACIONES)").length - 1).toBe(paginas);
  });
});

describe("la talla y el envío", () => {
  it("la talla en metros con dos decimales: «1,60 m», no «1,6 m»", () => {
    const h = hojaDe(lucia);
    const doc = documentoSeguimiento({ negocio: null, paciente: { ...h.paciente, tallaCm: 160 }, tratamiento: h.tratamiento!, hoy: HOY });
    expect(doc.datos.find((d) => d.etiqueta === "TALLA")!.valor).toBe("1,60 m");
  });

  // «Enviar por WhatsApp» (`DialogoWhatsapp`, 26-nov) manda este mensaje y este nombre, con el texto de siempre.
  it("el mensaje y el nombre del archivo de «Enviar por WhatsApp»", () => {
    expect(mensajeDelSeguimiento("2026-11-26")).toBe("Seguimiento del tratamiento al 26/11/2026.");
    expect(nombreDelPdf("2026-11-26")).toBe("seguimiento-tratamiento-2026-11-26.pdf");
  });

  it("«Compartir el PDF por otra app»: el diálogo de compartir con el PDF del seguimiento y el mensaje, sin abrir wa.me", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const abrir = vi.spyOn(window, "open").mockReturnValue(null);
    Object.assign(navigator, { share, canShare: () => true });
    try {
      const h = hojaDe(lucia);
      const doc = documentoSeguimiento({ negocio: null, paciente: h.paciente, tratamiento: h.tratamiento!, hoy: HOY });
      expect(await compartirPdf({ texto: mensajeDelSeguimiento(), nombreArchivo: nombreDelPdf(), armar: () => pdfDelSeguimiento(doc) })).toBe("compartido");
      expect(abrir).not.toHaveBeenCalled();
      const datos = share.mock.calls[0][0] as ShareData;
      expect(datos.files?.[0].name).toMatch(/^seguimiento-tratamiento-\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(datos.files?.[0].type).toBe("application/pdf");
      expect(datos.text).toMatch(/^Seguimiento del tratamiento al /);
    } finally {
      abrir.mockRestore();
      Object.assign(navigator, { share: undefined, canShare: undefined });
    }
  });
});

describe("los cortes de renglón", () => {
  it("el número no se separa de su unidad ni el vial se parte («10» / «mg en 0,5 ml»)", () => {
    expect(conUnidadesPegadas("usa TG · 10 mg en 0,5 ml (antes X). Sube a 7,5 mg y 25 UI, bajó 2 kg.")).toBe(
      "usa TG · 10 mg en 0,5 ml (antes X). Sube a 7,5 mg y 25 UI, bajó 2 kg.",
    );
    // Probado el 24-nov: la marca de la semana 12 salía «Desde esta semana usa TG · 10» y abajo «mg en 0,5 ml».
    const conMarca = structuredClone(lucia);
    conMarca.tratamientos[0].semanas = conMarca.tratamientos[0].semanas.map((x) => (x.semana === 5 ? { ...x, producto: { nombre: "TG", vialMg: 10, vialMl: 0.5 } } : x));
    const hm = hojaDe(conMarca);
    const d = documentoSeguimiento({ negocio: null, paciente: hm.paciente, tratamiento: hm.tratamiento!, hoy: HOY });
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    dibujarSeguimiento(pdf, d);
    const crudo = pdf.output();
    expect(crudo).toMatch(/\(10 mg en 0,5 ml/);
    expect(crudo).not.toMatch(/ 10\) Tj/);
    expect(crudo).not.toContain(" ");
  });
});
