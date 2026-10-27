import { fmtMoney } from "../format";
import type { CuotaPlan, Materia, MateriaDelGrupo, PlanPago, Ref, TipoDescuento } from "./tipos";

/**
 * Cómo se cuentan las cosas de un instituto en pantalla: el horario de un
 * grupo ("L-V 10:00–12:00"), las fechas cortas ("03-nov"), el nombre del
 * alumno como en el centralizador ("Apellidos, Nombres") y el calendario de
 * cuotas de un plan. Funciones puras, para probarlas sin pantalla.
 */

/** El contrato manda algunas referencias como texto y otras como objeto. */
export function nombreDe(x: string | Ref | null | undefined): string {
  if (!x) return "";
  return typeof x === "string" ? x : x.nombre;
}

/** "Bustillos Rek, Camila": como lo lee la secretaría en la hoja. */
export function nombreAlumno(a: { apellidos: string; nombres: string }): string {
  const ap = a.apellidos?.trim();
  const no = a.nombres?.trim();
  return ap && no ? `${ap}, ${no}` : ap || no || "Sin nombre";
}

/** 0 = domingo … 6 = sábado (como `Date.getDay()`). */
const CORTO = ["D", "L", "Ma", "Mi", "J", "V", "S"];
const LARGO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const LETRA_DIA = ["D", "L", "M", "M", "J", "V", "S"];
/** El orden de la semana para pintar los chips: de lunes a domingo. */
export const SEMANA = [1, 2, 3, 4, 5, 6, 0];

/**
 * "L-V" si son días seguidos (3 o más), "Sáb" si es uno solo y "Ma J" si son
 * sueltos. La semana empieza el lunes: sábado y domingo van al final.
 */
export function diasTexto(dias: number[]): string {
  const orden = [...new Set(dias)].sort((a, b) => SEMANA.indexOf(a) - SEMANA.indexOf(b));
  if (orden.length === 0) return "";
  if (orden.length === 1) return LARGO[orden[0]] ?? "";
  const pos = orden.map((d) => SEMANA.indexOf(d));
  const seguidos = pos.every((p, i) => i === 0 || p === pos[i - 1] + 1);
  if (seguidos && orden.length >= 3) return `${CORTO[orden[0]]}-${CORTO[orden[orden.length - 1]]}`;
  return orden.map((d) => CORTO[d]).join(" ");
}

/** "L-V 10:00–12:00". */
export function horarioGrupo(g: { dias: number[]; horaInicio: string; horaFin: string }): string {
  return `${diasTexto(g.dias)} ${g.horaInicio}–${g.horaFin}`.trim();
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-11-03" → "03-nov". Con hora (un ISO completo) usa el día local. */
export function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return fecha;
  if (fecha.length > 10) {
    const d = new Date(fecha);
    if (!Number.isNaN(d.getTime())) return `${String(d.getDate()).padStart(2, "0")}-${MESES[d.getMonth()]}`;
  }
  return `${m[3]}-${MESES[Number(m[2]) - 1] ?? m[2]}`;
}

/** Horas entre dos "HH:mm". */
export function horasEntre(desde: string, hasta: string): number {
  const min = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return Math.max(0, (min(hasta) - min(desde)) / 60);
}

/** El reglamento de CCTP permite hasta 4 h de clase por día (art. 27). */
export const MAX_HORAS_DIA = 4;

/**
 * La fecha de fin sugerida: tantas clases como hagan falta para cubrir las
 * horas del curso, contando sólo los días elegidos. Es una sugerencia para el
 * formulario (se puede corregir); el backend arma las clases de verdad.
 */
export function fechaFinSugerida(
  inicio: string,
  dias: number[],
  horasPorDia: number,
  horasTotales: number,
): { fin: string; clases: number } | null {
  if (!inicio || !dias.length || horasPorDia <= 0 || horasTotales <= 0) return null;
  const clases = Math.ceil(horasTotales / horasPorDia);
  const [a, m, d] = inicio.split("-").map(Number);
  const f = new Date(a, m - 1, d);
  if (Number.isNaN(f.getTime())) return null;
  let dadas = 0;
  // Tope de vueltas por si los datos vinieran raros: nunca un bucle eterno.
  for (let i = 0; i < 3660 && dadas < clases; i++) {
    if (dias.includes(f.getDay())) dadas++;
    if (dadas === clases) break;
    f.setDate(f.getDate() + 1);
  }
  const iso = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
  return { fin: iso, clases };
}

/** "M1–M3", "M2", "M1, M3": qué materias cubre una cuota. */
export function textoCubre(ordenes: number[]): string {
  const o = [...ordenes].sort((a, b) => a - b);
  if (!o.length) return "—";
  if (o.length === 1) return `M${o[0]}`;
  const seguidos = o.every((x, i) => i === 0 || x === o[i - 1] + 1);
  return seguidos ? `M${o[0]}–M${o[o.length - 1]}` : o.map((x) => `M${x}`).join(", ");
}

/** Hasta cuántos caracteres entra la lista con nombres antes de resumirla como «M2 a M4». */
const LARGO_MAX_MODULOS = 38;

/**
 * Qué módulos cubre una cuota, como habla el instituto (D6): «M2 Degradados»,
 * «M2 Degradados y M3 Cortes». Si con los nombres no entra en un renglón y
 * son consecutivos, «M2 a M4»; si no, los códigos «M2, M4». Sin los nombres
 * (el backend de la cuota trae sólo el orden) queda como `textoCubre`.
 */
export function textoModulos(ordenes: number[], nombres?: Record<number, string> | null): string {
  if (!nombres || !Object.keys(nombres).length) return textoCubre(ordenes);
  const o = [...ordenes].sort((a, b) => a - b);
  if (!o.length) return "—";
  // Un módulo sin nombre propio se llama «Módulo 1»: «M1 Módulo 1» repetía lo mismo (ronda 1, F7).
  // Sólo el genérico «Módulo 2»: un nombre propio que empieza igual («Módulo avanzado de corte») se conserva (ronda 2, B5).
  const conNombre = (x: number) => !!nombres[x] && !/^m[óo]dulo\s*\d+$/i.test(nombres[x].trim());
  const con = o.map((x) => (conNombre(x) ? `M${x} ${nombres[x]}` : `M${x}`));
  const lista = con.length === 1 ? con[0] : `${con.slice(0, -1).join(", ")} y ${con[con.length - 1]}`;
  if (lista.length <= LARGO_MAX_MODULOS || con.length === 1) return lista;
  const seguidos = o.every((x, i) => i === 0 || x === o[i - 1] + 1);
  return seguidos ? `M${o[0]} a M${o[o.length - 1]}` : o.map((x) => `M${x}`).join(", ");
}

/**
 * Qué cargar en «Nuevo estudiante» con lo que se buscó sin encontrar (ronda 2, R9).
 * Un CI plausible va al carnet: 6 a 8 dígitos, y si son 8 que no empiecen en 6 o
 * 7 (los celulares de Bolivia: la mamá, el tutor). Lo que tiene letras es un
 * nombre y va a Apellidos, para no perderlo. Un celular o cualquier otro número
 * no se vuelca en ningún lado.
 */
export function datosDeLaBusqueda(texto: string): { ci?: string; apellidos?: string } {
  const t = texto.trim();
  if (/^\d{6,8}$/.test(t) && !(t.length === 8 && /^[67]/.test(t))) return { ci: t };
  if (/\p{L}/u.test(t)) return { apellidos: t };
  return {};
}

/** Los nombres de los módulos por orden ({1: "Cortes", 2: "Degradados"}). */
export type NombresModulos = Record<number, string>;

/** Los nombres de los módulos de un grupo (`materiasGrupo` de su detalle), por orden. */
export function nombresDe(materias: Pick<MateriaDelGrupo, "materia">[] | undefined | null): NombresModulos {
  const r: NombresModulos = {};
  for (const m of materias ?? []) if (m.materia?.nombre) r[m.materia.orden] = m.materia.nombre;
  return r;
}

/**
 * Los módulos que cubre una cuota con su nombre («M2 Degradados»), de las
 * `materias` que manda el backend (D6): sin pedir el detalle del grupo. Una
 * respuesta sin ellas dice los códigos («M2–M3»).
 */
export function textoModulosDeCuota(c: { materiaOrdenes: number[]; materias?: { orden: number; nombre: string }[] | null }): string {
  const nombres = Object.fromEntries((c.materias ?? []).map((m) => [m.orden, m.nombre]));
  return textoModulos(c.materias?.length ? c.materias.map((m) => m.orden) : c.materiaOrdenes, nombres);
}

/** "al inscribirse", "día 1 de M2", "a los 30 días". */
export function textoVence(v: CuotaPlan["vence"]): string {
  if (v.tipo === "INSCRIPCION") return "al inscribirse";
  if (v.tipo === "INICIO_MATERIA") return `al empezar M${v.materiaOrden ?? "?"}`;
  return `a los ${v.dias ?? 0} días`;
}

/**
 * Cuándo vence una cuota del plan si se inscribe hoy, con la regla del
 * backend (`venceDe` en reglas.ts, QA 23-oct):
 *   - INICIO_MATERIA: el día que empieza ese módulo en el grupo, o hoy si ya
 *     empezó (max de los dos);
 *   - INSCRIPCION: hoy;
 *   - DIAS: hoy + días.
 * "Paga hoy" es un cobro y no mueve el vencimiento. Devuelve "hoy" o la fecha
 * `AAAA-MM-DD`; null si no se sabe cuándo empieza el módulo.
 */
export function venceCuota(
  v: CuotaPlan["vence"],
  desdeModulo: (orden: number) => string | null | undefined,
  hoy: string,
  ordenCubre?: number,
): string | null {
  if (v.tipo === "INSCRIPCION") return "hoy";
  if (v.tipo === "DIAS") {
    const [a, m, d] = hoy.split("-").map(Number);
    const f = new Date(Date.UTC(a, m - 1, d + (v.dias ?? 0)));
    return v.dias ? f.toISOString().slice(0, 10) : "hoy";
  }
  const orden = v.materiaOrden ?? ordenCubre;
  const desde = orden != null ? desdeModulo(orden)?.slice(0, 10) : null;
  if (!desde) return null;
  return desde > hoy ? desde : "hoy";
}

/** El total de un calendario, redondeado a centavos. */
export function totalCalendario(cuotas: CuotaPlan[]): number {
  return Math.round(cuotas.reduce((s, c) => s + (Number(c.monto) || 0), 0) * 100) / 100;
}

/**
 * Los mismos chequeos que el backend hace con 400 PLAN_INVALIDO, para avisar
 * antes de guardar: cada materia activa cubierta por exactamente una cuota,
 * montos mayores que cero y ninguna cuota que no cubra nada. El backend sigue
 * siendo quien decide; esto sólo ahorra el viaje.
 */
export function problemasDelPlan(
  cuotas: CuotaPlan[],
  materias: Pick<Materia, "orden" | "activa">[],
  /** Cómo dice el instituto (`usePalabras().materias`): "módulos", "materias"… */
  palabraMaterias = "módulos",
): string[] {
  const problemas: string[] = [];
  if (!cuotas.length) problemas.push("El plan necesita al menos una cuota.");
  cuotas.forEach((c, i) => {
    if (!(Number(c.monto) > 0)) problemas.push(`La cuota ${i + 1} necesita un monto mayor que cero.`);
    if (!c.cubre.length) problemas.push(`La cuota ${i + 1} no cubre nada: marcá qué ${palabraMaterias} paga.`);
  });
  for (const m of materias.filter((x) => x.activa)) {
    const n = cuotas.filter((c) => c.cubre.includes(m.orden)).length;
    // Sin género: sirve igual para "el módulo" que para "la materia".
    if (n === 0) problemas.push(`M${m.orden} no está en ninguna cuota.`);
    if (n > 1) problemas.push(`M${m.orden} está en ${n} cuotas: tiene que estar en una sola.`);
  }
  return problemas;
}

/** Edad cumplida a una fecha (hoy por defecto), o null si la fecha no sirve. */
export function edadDe(fechaNacimiento: string | null | undefined, hoy = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaNacimiento ?? "");
  if (!m) return null;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let edad = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < d)) edad--;
  return edad >= 0 && edad < 130 ? edad : null;
}

/** Menor de edad en Bolivia: menos de 18 años. */
export const MAYORIA_DE_EDAD = 18;

/** Los departamentos donde se expide el CI, como los pide el formulario. */
export const EXPEDIDOS = ["SC", "LP", "CB", "OR", "PT", "CH", "TJ", "BE", "PD"] as const;

/** Parentescos a mano para el tutor. */
export const PARENTESCOS = ["Madre", "Padre", "Tutor/a", "Abuelo/a", "Hermano/a", "Otro"] as const;

/**
 * El calendario del plan con el descuento repartido entre las cuotas, a la
 * vista (el backend arma el de verdad con `generarCuotas`). Lo que no cierra
 * por redondeo va a la última cuota, así la suma da el total.
 *
 * Como el backend: una cuota que queda en Bs 0 (beca completa) no existe, no
 * hay nada que cobrar; la numeración sigue sobre las que quedan. Con
 * `vencimiento` (ISO por cuota) la lista sale en orden de vencimiento, que es
 * el orden en que se cobra: «la primera» es la que vence antes, no la que
 * figura primero en el plan (auditoría 26-oct, bug 19). A igual fecha manda el
 * orden del plan.
 */
export function calendarioConDescuento(
  plan: PlanPago | null,
  tipo: "" | TipoDescuento,
  enPct: boolean,
  valor: number,
  vencimiento?: (c: CuotaPlan) => string,
): { cuotas: CuotaPlan[]; total: number; descuento: number; pct: number } {
  if (!plan) return { cuotas: [], total: 0, descuento: 0, pct: 0 };
  const bruto = plan.total;
  const descuento = !tipo || valor <= 0 ? 0 : Math.min(bruto, enPct ? (bruto * Math.min(valor, 100)) / 100 : valor);
  const neto = Math.round((bruto - descuento) * 100) / 100;
  const factor = bruto > 0 ? neto / bruto : 1;
  const repartidas = plan.calendario.map((c) => ({ ...c, monto: Math.round(c.monto * factor * 100) / 100 }));
  const suma = repartidas.reduce((s, c) => s + c.monto, 0);
  if (repartidas.length) repartidas[repartidas.length - 1].monto = Math.round((repartidas[repartidas.length - 1].monto + neto - suma) * 100) / 100;
  const vivas = repartidas.filter((c) => c.monto > 0).map((c, i) => ({ ...c, n: i + 1 }));
  const cuotas = vencimiento ? vivas.map((c) => ({ c, v: vencimiento(c) })).sort((a, b) => (a.v < b.v ? -1 : a.v > b.v ? 1 : a.c.n - b.c.n)).map((x) => x.c) : vivas;
  return { cuotas, total: neto, descuento: Math.round(descuento * 100) / 100, pct: bruto > 0 ? (descuento / bruto) * 100 : 0 };
}

/**
 * Lo que cuesta un curso de las dos formas del modo simple (D4), con la misma
 * cuenta que el servidor: el pago completo es `round(n × precio × (1 − desc))`.
 * `porModuloCompleto` es lo que vale cada módulo pagado así (1.350 ÷ 3 = 450),
 * la base del % del docente (D2).
 *
 * Con `precioFijo` (A4, el precio final que pidió Derick) el pago completo es
 * ese monto y el % no cuenta: es lo que hace `reglas.ts` en el backend.
 */
export function precioCurso(precioModulo: number, modulos: number, descuentoPct: number, precioFijo?: number | null) {
  const lista = precioModulo * modulos;
  const completo = precioFijo != null && precioFijo > 0 ? Math.round(precioFijo * 100) / 100 : Math.round(lista * (1 - descuentoPct / 100));
  return {
    lista,
    completo,
    ahorro: Math.round((lista - completo) * 100) / 100,
    porModuloCompleto: modulos ? completo / modulos : 0,
  };
}

/**
 * A4: a cuánto % de descuento equivale un precio final (Bs 1.300 sobre
 * 1.500 = 13,33 %), a dos decimales como lo devuelve el backend.
 */
export function descuentoEquivalente(lista: number, precioFinal: number): number {
  if (!(lista > 0) || !(precioFinal > 0)) return 0;
  return Math.round((1 - precioFinal / lista) * 10000) / 100;
}

/** "13,33" o "10": el % con coma y hasta dos decimales. */
export function textoPct(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString("es-BO", { maximumFractionDigits: 2 });
}

/**
 * A5: cómo se le paga al docente, en una frase para quien configura el curso
 * (el % se entendía mal, punto 6 de la reunión con Derick).
 */
export function textoPagoDocente(
  modo: "PORCENTAJE" | "MONTO" | undefined | null,
  pct: number,
  monto: number | null | undefined,
  palabras: { docente: string; alumno: string; materia: string },
): string {
  const { docente, alumno, materia } = palabras;
  if (modo === "MONTO") {
    return `El ${docente} cobra ${fmtMoney(monto ?? 0)} por cada ${alumno} que pagó el ${materia} completo.`;
  }
  return `El ${docente} cobra el ${textoPct(pct)} % de lo que paga cada ${alumno} por el ${materia}.`;
}

const UNIDADES = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
  "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte",
  "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const DECENAS: Record<number, string> = { 3: "treinta", 4: "cuarenta", 5: "cincuenta", 6: "sesenta", 7: "setenta", 8: "ochenta", 9: "noventa" };

/**
 * La nota en letras, como va en el centralizador y el boletín ("setenta y
 * seis"). De 0 a 100, que es la escala de los institutos; fuera de eso, "".
 */
export function numeroEnLetras(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 100) return "";
  if (n === 100) return "cien";
  if (n < 30) return UNIDADES[n];
  const d = Math.floor(n / 10);
  return n % 10 ? `${DECENAS[d]} y ${UNIDADES[n % 10]}` : DECENAS[d];
}
