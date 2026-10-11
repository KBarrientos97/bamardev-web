import { isoDia } from "../../../lib/format";
import { round2 } from "../calculo";
import type { ProductoBillar, RegistroAuditoria } from "../tipos";

/**
 * Los números de Reportes → Billar (§7.15).
 *
 * MAQUETA (oct-2026): no hay ventas viejas todavía, así que se INVENTAN, pero
 * siempre iguales para la misma fecha (azar con semilla): Hoy, Semana y Mes
 * cambian y cuadran entre sí (las horas por mesa suman las horas jugadas, la
 * ocupación sale de esas horas, etc.). La auditoría sí suma lo que se hizo de
 * verdad en el tablero. Con el backend esto es `GET /billar/reportes?desde&hasta`
 * y este archivo se va.
 *
 * Se cuenta por JORNADA y no por día de calendario: el billar abre a las 4 p. m.
 * y cierra a las 2 a. m., y lo jugado a la 1 de la madrugada del sábado es del
 * viernes. (El backend va a necesitar la misma "hora de corte".)
 */

/** El horario del local: de 4 p. m. a 2 a. m. MAQUETA: con el backend es el de la sucursal. */
export const HORARIO = { abre: 16, horas: 10 };

/** Las mesas que tienen historia. Las que se crean hoy no tienen ventas viejas. */
const MESAS_HISTORIA = [
  { id: 1, tipo: "pool", peso: 0.98 },
  { id: 2, tipo: "pool", peso: 1 },
  { id: 3, tipo: "pool", peso: 1.1 },
  { id: 4, tipo: "pool", peso: 0.9 },
  { id: 5, tipo: "pool", peso: 0.95 },
  { id: 6, tipo: "carambola", peso: 0.8 },
  { id: 7, tipo: "carambola", peso: 0.72 },
  { id: 8, tipo: "pool", peso: 0.35 },
];
const TARIFA: Record<string, number> = { pool: 20, carambola: 25 };

/** Qué tan llena está cada hora, de 4 p. m. a 1 a. m. */
const PERFIL_HORA = [0.1, 0.15, 0.25, 0.4, 0.6, 0.85, 0.85, 0.8, 0.5, 0.35];
/** Domingo a sábado: el viernes y el sábado se llena más. */
const PERFIL_DIA = [1, 0.8, 0.8, 0.9, 1, 1.25, 1.3];
/** Cuánto pesa cada producto en lo vendido en billar. */
const PESO_PRODUCTO: Record<number, number> = { 1: 38, 2: 3, 3: 8, 4: 5, 5: 6, 6: 12, 7: 14, 8: 12, 9: 1, 10: 1 };

const PAUSAS_Y_AJUSTES: Omit<RegistroAuditoria, "id" | "hora" | "mesaId">[] = [
  { accion: "Pausó 6 min", motivo: "Problema con la mesa", quien: "María F." },
  { accion: "Anuló 1× Cerveza Paceña 620 ml", motivo: "Cargada por error", quien: "Luis Mamani", autorizo: "Administrador" },
  { accion: "Pausó 18 min", motivo: "Corte de luz", quien: "Administrador" },
  { accion: "Pasó la cuenta a la Mesa 7", quien: "María F." },
  { accion: "Extendió 1 h · Bs 20,00", quien: "Luis Mamani" },
  { accion: "Anuló 2× Coca Cola 500 ml", motivo: "Cliente devolvió", quien: "María F.", autorizo: "Administrador" },
  { accion: "Pausó 4 min", motivo: "Cliente salió", quien: "Luis Mamani" },
];

// ── Azar con semilla ────────────────────────────────────────────────────────

function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Un número entre 0 y 1, siempre el mismo para la misma semilla (mulberry32). */
export function azar(semilla: string): number {
  let t = (hash(semilla) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ── El reporte ──────────────────────────────────────────────────────────────

export interface ReporteBillar {
  /** Jornadas con algo jugado. */
  jornadas: number;
  tiempoBs: number;
  consumosBs: number;
  horas: number;
  /** 0 a 1: horas jugadas sobre las horas que el local tuvo abiertas sus mesas. */
  ocupacion: number;
  /** De la más usada a la menos. `pct`: su parte de las horas jugadas. */
  porMesa: { mesaId: number; horas: number; pct: number }[];
  /** Una por hora del horario (4 p. m., 5 p. m.… 1 a. m.). */
  porHora: { hora: number; ocupacion: number }[];
  fijos: { vendidos: number; monto: number; conExcedente: number; excedenteBs: number };
  rapidas: { cantidad: number; bs: number };
  /** Los cinco que más plata dejaron. */
  productos: { nombre: string; cant: number; bs: number }[];
  /** La más nueva primero. */
  auditoria: RegistroAuditoria[];
}

/** "2026-10-07" → la fecha local a las 0:00 (no UTC: en Bolivia daría el día anterior). */
function fechaLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function reporteBillar(
  desde: string,
  hasta: string,
  productos: ProductoBillar[],
  auditoriaReal: RegistroAuditoria[],
  ahora: Date,
): ReporteBillar {
  const horasMesa = new Map<number, number>(MESAS_HISTORIA.map((m) => [m.id, 0]));
  const horasHora = PERFIL_HORA.map(() => 0);
  const capacidadHora = PERFIL_HORA.map(() => 0);
  let tiempoBs = 0;
  let consumosBs = 0;
  let jornadas = 0;
  const fijos = { vendidos: 0, monto: 0, conExcedente: 0, excedenteBs: 0 };
  const rapidas = { cantidad: 0, bs: 0 };
  const auditoria: RegistroAuditoria[] = [];

  const fin = fechaLocal(hasta);
  for (let d = fechaLocal(desde); d <= fin; d.setDate(d.getDate() + 1)) {
    const iso = isoDia(d);
    let horasDia = 0;
    for (let i = 0; i < PERFIL_HORA.length; i++) {
      const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate(), HORARIO.abre + i).getTime();
      // La hora que está corriendo cuenta lo que va; las que no llegaron, nada.
      const transcurrido = Math.min(1, Math.max(0, (ahora.getTime() - inicio) / 3_600_000));
      if (transcurrido === 0) continue;
      for (const m of MESAS_HISTORIA) {
        const lleno = PERFIL_HORA[i] * m.peso * PERFIL_DIA[d.getDay()] * (0.75 + 0.5 * azar(`${iso}|${m.id}|${i}`));
        const h = Math.min(0.97, lleno) * transcurrido;
        horasMesa.set(m.id, horasMesa.get(m.id)! + h);
        horasHora[i] += h;
        capacidadHora[i] += transcurrido;
        tiempoBs += h * TARIFA[m.tipo];
        horasDia += h;
      }
    }
    if (horasDia === 0) continue;
    jornadas++;
    consumosBs += horasDia * (24 + 4 * azar(`${iso}|consumo`));
    const vendidos = Math.round(horasDia * 0.27 * (0.85 + 0.3 * azar(`${iso}|fijos`)));
    const conExcedente = Math.round(vendidos * (0.35 + 0.14 * azar(`${iso}|excedente`)));
    fijos.vendidos += vendidos;
    fijos.monto += vendidos * 37.5;
    fijos.conExcedente += conExcedente;
    fijos.excedenteBs += conExcedente * (20 + 5 * azar(`${iso}|excedenteBs`));
    const nRapidas = Math.round((horasDia / 5) * (0.8 + 0.4 * azar(`${iso}|rapidas`)));
    rapidas.cantidad += nRapidas;
    rapidas.bs += nRapidas * (10 + 4 * azar(`${iso}|ticket`));

    // Lo que se pausó, anuló o movió esa jornada: de cero a dos cosas, en horas ya pasadas.
    const cuantas = Math.floor(azar(`${iso}|auditoria`) * 3);
    for (let k = 0; k < cuantas; k++) {
      const r = azar(`${iso}|auditoria|${k}`);
      const hora = new Date(d.getFullYear(), d.getMonth(), d.getDate(), HORARIO.abre + Math.floor(r * 9), Math.floor(r * 997) % 60);
      if (hora.getTime() > ahora.getTime()) continue;
      const base = PAUSAS_Y_AJUSTES[Math.floor(azar(`${iso}|accion|${k}`) * PAUSAS_Y_AJUSTES.length)];
      auditoria.push({ ...base, id: `${iso}-${k}`, hora: hora.getTime(), mesaId: 1 + Math.floor(r * 8) });
    }
  }

  // La auditoría de verdad (lo hecho en el tablero), por día de calendario.
  const desdeMs = fechaLocal(desde).getTime();
  const hastaMs = fechaLocal(hasta).getTime() + 86_400_000;
  auditoria.push(...auditoriaReal.filter((a) => a.hora >= desdeMs && a.hora < hastaMs));
  auditoria.sort((a, b) => b.hora - a.hora);

  const horas = [...horasMesa.values()].reduce((t, h) => t + h, 0);
  const capacidad = capacidadHora.reduce((t, c) => t + c, 0);
  const porMesa = [...horasMesa.entries()]
    .map(([mesaId, h]) => ({ mesaId, horas: h, pct: horas ? h / horas : 0 }))
    .sort((a, b) => b.horas - a.horas);

  // Los consumos se reparten entre los productos según lo que más se vende.
  const totalPeso = Object.values(PESO_PRODUCTO).reduce((t, p) => t + p, 0);
  const vendidos = productos
    .map((p) => {
      const cant = Math.round(((consumosBs + rapidas.bs) * (PESO_PRODUCTO[p.id] ?? 0)) / totalPeso / p.precio);
      return { nombre: p.nombre, cant, bs: round2(cant * p.precio) };
    })
    .filter((p) => p.cant > 0)
    .sort((a, b) => b.bs - a.bs)
    .slice(0, 5);

  return {
    jornadas,
    tiempoBs: round2(tiempoBs),
    consumosBs: round2(consumosBs),
    horas,
    ocupacion: capacidad ? horas / capacidad : 0,
    porMesa,
    porHora: horasHora.map((h, i) => ({ hora: (HORARIO.abre + i) % 24, ocupacion: capacidadHora[i] ? h / capacidadHora[i] : 0 })),
    fijos: { ...fijos, monto: round2(fijos.monto), excedenteBs: round2(fijos.excedenteBs) },
    rapidas: { cantidad: rapidas.cantidad, bs: round2(rapidas.bs) },
    productos: vendidos,
    auditoria,
  };
}

/** "9 p. m.", "12 a. m.", "1 a. m.": la hora de las barras y del pico. */
export function horaCorta(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? "a. m." : "p. m."}`;
}

/** "Pico de 9 a 11 p. m. (más del 80 %)", o la hora más llena si ninguna pasa del 80 %. */
export function textoPico(porHora: ReporteBillar["porHora"]): string | null {
  if (!porHora.some((x) => x.ocupacion > 0)) return null;
  const llenas = porHora.filter((x) => x.ocupacion >= 0.8);
  if (llenas.length) {
    const desde = llenas[0].hora;
    const hasta = (llenas[llenas.length - 1].hora + 1) % 24;
    return `Pico de ${horaCorta(desde)} a ${horaCorta(hasta)} (más del 80 %).`;
  }
  const max = porHora.reduce((a, b) => (b.ocupacion > a.ocupacion ? b : a));
  return `La hora más llena: ${horaCorta(max.hora)} (${Math.round(max.ocupacion * 100)} %).`;
}
