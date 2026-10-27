import type { Franja } from "./tipos";

/**
 * Las cuentas del calendario de módulos (ronda 2, D5): los meses de las
 * columnas, las franjas horarias de las filas y el día del mes en que
 * empiezan todos los módulos. Funciones puras, para probarlas sin pantalla.
 * Todo en hora local: "el 10 de cada mes" es el 10 en Bolivia.
 */

const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** El mes de una fecha, como lo manda el contrato: `AAAA-MM`. */
export function mesDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** `2026-10` + 3 → `2027-01`. */
export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** "octubre" (o "enero 2027" si cambia de año respecto de `respectoDe`). */
export function nombreMes(mes: string, respectoDe?: string): string {
  const [a, m] = mes.split("-").map(Number);
  const nombre = MESES_LARGOS[m - 1] ?? mes;
  if (respectoDe && respectoDe.slice(0, 4) !== String(a)) return `${nombre} ${a}`;
  return nombre;
}

/** "Octubre 2026": el título de una pantalla por mes. */
export function tituloMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const nombre = MESES_LARGOS[m - 1] ?? mes;
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${a}`;
}

/** "oct", para las columnas angostas del celular. */
export function mesCorto(mes: string): string {
  return nombreMes(mes).slice(0, 3);
}

/**
 * La fecha en que empieza el módulo de un mes: el `dia` de ese mes. El
 * contrato lo limita a 1..28, así que existe en todos los meses.
 */
export function inicioDelMes(mes: string, dia: number): string {
  return `${mes}-${String(dia).padStart(2, "0")}`;
}

/** El día anterior a una fecha `AAAA-MM-DD` (el fin de un módulo es el día antes del inicio del siguiente). */
export function diaAnterior(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d - 1));
  return f.toISOString().slice(0, 10);
}

/** El próximo día de inicio de módulos desde hoy (hoy incluido). */
export function proximoInicio(dia: number, hoy = new Date()): string {
  const mes = mesDe(hoy);
  return hoy.getDate() <= dia ? inicioDelMes(mes, dia) : inicioDelMes(sumarMeses(mes, 1), dia);
}

// ── Franjas ─────────────────────────────────────────────────────────────────

export function aMinutos(hora: string): number {
  const [h, m] = (hora || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function aHora(min: number): string {
  const acotado = Math.max(0, Math.min(23 * 60 + 30, min));
  return `${String(Math.floor(acotado / 60)).padStart(2, "0")}:${String(acotado % 60).padStart(2, "0")}`;
}

/** "2 h", "1,5 h" o "—" si está al revés. */
export function duracionFranja(f: Pick<Franja, "inicio" | "fin">): string {
  const min = aMinutos(f.fin) - aMinutos(f.inicio);
  if (min <= 0) return "—";
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace(".", ",")} h`;
}

/** Las franjas de una sede (`null` = las que valen para todas), en orden. */
export function franjasDe(franjas: Franja[] | null | undefined, almacenId: number | null): Franja[] {
  return (franjas ?? [])
    .filter((f) => f.almacenId === almacenId)
    .sort((a, b) => aMinutos(a.inicio) - aMinutos(b.inicio));
}

/**
 * Lo que el backend rechazaría (inicio < fin, sin solaparse dentro de la
 * misma sede), dicho antes de mandar: así el guardado automático no queda
 * fallando en cada tecla.
 */
export function problemasFranjas(franjas: Franja[]): string[] {
  const problemas: string[] = [];
  const porSede = new Map<number | null, Franja[]>();
  for (const f of franjas) {
    if (aMinutos(f.fin) <= aMinutos(f.inicio)) problemas.push(`La franja ${f.inicio}–${f.fin} termina antes de empezar.`);
    porSede.set(f.almacenId, [...(porSede.get(f.almacenId) ?? []), f]);
  }
  for (const lista of porSede.values()) {
    const orden = [...lista].sort((a, b) => aMinutos(a.inicio) - aMinutos(b.inicio));
    for (let i = 1; i < orden.length; i++) {
      if (aMinutos(orden[i].inicio) < aMinutos(orden[i - 1].fin)) {
        problemas.push(`Las franjas ${orden[i - 1].inicio}–${orden[i - 1].fin} y ${orden[i].inicio}–${orden[i].fin} se pisan.`);
      }
    }
  }
  return problemas;
}

/** La franja que sigue a la última, de 2 horas: "Agregar franja". */
export function franjaSiguiente(lista: Franja[], almacenId: number | null): Franja {
  const ultima = lista[lista.length - 1];
  const inicio = ultima ? ultima.fin : "07:00";
  return { almacenId, inicio, fin: aHora(aMinutos(inicio) + 120) };
}

/** "en 12 min", "en curso", "terminó": cuándo es la clase, con la hora del equipo. */
export function cuandoEs(c: { horaInicio: string; horaFin: string }, ahora = new Date()): string {
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  const ini = aMinutos(c.horaInicio);
  if (min >= aMinutos(c.horaFin)) return "terminó";
  if (min >= ini) return "en curso";
  const falta = ini - min;
  return falta < 60 ? `en ${falta} min` : `a las ${c.horaInicio}`;
}
