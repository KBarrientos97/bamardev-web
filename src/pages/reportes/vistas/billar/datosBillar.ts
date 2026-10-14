import { horaCorta, ordenJornada } from "../../../billar/reportes/datosReporte";
import type { BillarReporteApi } from "../../api";
import { variacion } from "../../formato";
import type { PuntoLinea } from "../../graficos";

/**
 * Las cuentas de los tres reportes del billar (Rendimiento por mesa,
 * Ocupación, Tiempo fijo y promos). Los números los hace el backend con lo
 * que quedó guardado al cobrar cada mesa; acá sólo se ordenan, se agrupan y
 * se decide qué NO se puede mostrar.
 *
 * Casi todo lo del rediseño llega en campos opcionales (`porTipo`, `calor`,
 * `paquetes`, `promos`, `anterior`…): contra un backend anterior no vienen, y
 * entonces estas funciones devuelven `null` y la pantalla esconde la sección.
 * Nunca un cero inventado: un "0 %" de ocupación o un "Bs 0 por hora" se leen
 * como un dato, y lo que pasa es que el servidor todavía no lo manda.
 */

type PorHora = BillarReporteApi["porHora"];
type Mesa = BillarReporteApi["porMesa"][number];

type CeldaCalor = NonNullable<BillarReporteApi["calor"]>[number];
type Paquete = NonNullable<BillarReporteApi["paquetes"]>[number];
type Promo = NonNullable<BillarReporteApi["promos"]>[number];

/** El orden de las filas del mapa: el backend manda `dia` 0 = lunes. */
export const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

/** "4p", "12a", "1a": las columnas del mapa y el eje del gráfico. Más largo no entran diez en un celular. */
export function horaEje(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? "a" : "p"}`;
}

/** "11 pm": la hora en el globo de una celda ("Vie 11 pm · 88 % ocupado"), que tiene que entrar arriba de una celda chica. */
export function horaGlobo(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? "am" : "pm"}`;
}

/** Horas sueltas en el orden de la jornada (`ordenJornada`): un billar que cierra a la 1 se lee 4p … 1a, no 0 1 … 23. */
export function horasEnJornada(horas: number[]): number[] {
  const unicas = [...new Set(horas)];
  return ordenJornada(unicas.map((hora) => ({ hora, ocupacion: 0 }))).map((h) => h.hora);
}

// ── Ocupación ───────────────────────────────────────────────────────────────

export interface MapaDeCalor {
  /** "Lun", "Mar"…: sólo los días que se dibujan. */
  filas: string[];
  /** Las horas de las columnas, en el orden de la jornada. */
  horas: number[];
  /** "4p", "5p"…, una por hora. */
  columnas: string[];
  /** valores[fila][columna] de 0 a 1; null = no hay dato de esa celda (cerrado o sin juego). */
  valores: (number | null)[][];
}

/**
 * El mapa día × hora. Las columnas son sólo las horas en que hubo juego: con
 * las 24 del reloj, la mitad del mapa serían las 9 de la mañana de un billar
 * que abre a las 4 de la tarde.
 *
 * Con un período de una semana o más van los siete días, aunque alguno quede
 * en blanco (un lunes cerrado se tiene que ver como tal). Con menos, sólo los
 * días que hubo: "Hoy" dibujaba seis filas vacías y una con datos.
 */
export function armarCalor(calor: CeldaCalor[], porHora: PorHora, todosLosDias: boolean): MapaDeCalor | null {
  const validas = calor.filter(
    (c) => Number.isInteger(c.dia) && c.dia >= 0 && c.dia <= 6 && Number.isInteger(c.hora) && c.hora >= 0 && c.hora <= 23 && Number.isFinite(c.ocupacion),
  );
  if (validas.length === 0) return null;
  // Las horas con juego: las de la curva por hora y las de alguna celda con algo.
  // Si el backend manda la grilla entera con ceros, las horas en cero no entran.
  const horas = horasEnJornada([...porHora.map((h) => h.hora), ...validas.filter((c) => c.ocupacion > 0).map((c) => c.hora)]);
  if (horas.length === 0) return null;
  const celda = new Map(validas.map((c) => [`${c.dia}-${c.hora}`, c.ocupacion]));
  const dias = [0, 1, 2, 3, 4, 5, 6].filter((d) => todosLosDias || horas.some((h) => celda.has(`${d}-${h}`)));
  if (dias.length === 0) return null;
  return {
    filas: dias.map((d) => DIAS_SEMANA[d]),
    horas,
    columnas: horas.map(horaEje),
    valores: dias.map((d) => horas.map((h) => celda.get(`${d}-${h}`) ?? null)),
  };
}

/**
 * El día de la semana más lleno: el promedio de su fila en el mapa, con las
 * horas sin dato como cero. Promediando sólo las celdas con dato, un lunes con
 * un torneo de dos horas al 90 % le ganaba a un sábado lleno toda la noche.
 *
 * Con menos de dos días con datos no hay "mejor día" que elegir (en "Hoy"
 * sería el único): null, y la tarjeta no se dibuja.
 */
export function mejorDia(m: MapaDeCalor): { dia: string; promedio: number } | null {
  let mejor: { dia: string; promedio: number } | null = null;
  let conDatos = 0;
  for (let i = 0; i < m.valores.length; i++) {
    const fila = m.valores[i];
    if (!fila.some((v) => v != null)) continue;
    conDatos++;
    const promedio = fila.reduce<number>((a, v) => a + (v ?? 0), 0) / fila.length;
    if (!mejor || promedio > mejor.promedio) mejor = { dia: m.filas[i], promedio };
  }
  return conDatos >= 2 && mejor && mejor.promedio > 0 ? mejor : null;
}

/** La hora más llena del período. Null si no hubo juego. En empate, la primera de la jornada. */
export function horaPico(porHora: PorHora): PorHora[number] | null {
  let pico: PorHora[number] | null = null;
  for (const h of ordenJornada(porHora)) if (!pico || h.ocupacion > pico.ocupacion) pico = h;
  return pico && pico.ocupacion > 0 ? pico : null;
}

/**
 * La hora más floja (la buena para una promo). Null con una sola hora o si
 * todas están igual: sería la misma que la pico, y decir lo mismo dos veces
 * con colores opuestos confunde.
 */
export function horaFloja(porHora: PorHora): PorHora[number] | null {
  if (porHora.length < 2) return null;
  const horas = ordenJornada(porHora);
  let floja = horas[0];
  let max = horas[0].ocupacion;
  for (const h of horas) {
    if (h.ocupacion < floja.ocupacion) floja = h;
    if (h.ocupacion > max) max = h.ocupacion;
  }
  return floja.ocupacion < max ? floja : null;
}

/** Los puntos del gráfico de ocupación por hora, con el mismo punto del período anterior si lo hubo. */
export function puntosOcupacion(porHora: PorHora, anterior: PorHora | null | undefined): PuntoLinea[] {
  // Una hora sin juego en el anterior queda sin punto (null) y no en cero: no
  // se sabe si ese día el local abrió a esa hora.
  const previo = anterior ? new Map(anterior.map((h) => [h.hora, h.ocupacion])) : null;
  return ordenJornada(porHora).map((h) => ({
    etiqueta: horaEje(h.hora),
    detalle: horaCorta(h.hora),
    valor: h.ocupacion,
    anterior: previo?.get(h.hora) ?? null,
  }));
}

/**
 * La ocupación del período anterior, o null si no se puede comparar: sin el
 * dato (backend anterior) o sin una sola hora jugada entonces. El backend
 * manda 0 cuando no hubo juego, y ese 0 no es una ocupación medida: contra él
 * todo período salía "+41 pts".
 */
export function ocupacionAnterior(r: BillarReporteApi): number | null {
  const a = r.anterior;
  if (!a || !(a.horas > 0) || !Number.isFinite(a.ocupacion)) return null;
  return a.ocupacion;
}

/** La diferencia en puntos (0,41 contra 0,37 → +4). Null sin con qué comparar. */
export function deltaPuntos(actual: number, anterior: number | null): number | null {
  return anterior == null ? null : (actual - anterior) * 100;
}

/** La mesa con más horas. Null si ninguna se jugó. */
export function mesaMasUsada(porMesa: Mesa[]): Mesa | null {
  let mas: Mesa | null = null;
  for (const m of porMesa) if (!mas || m.horas > mas.horas) mas = m;
  return mas && mas.horas > 0 ? mas : null;
}

// ── Rendimiento por mesa ────────────────────────────────────────────────────

export interface FilaMesa {
  mesaId: number;
  /** Activa pero sin juego en el período: sus ceros son reales (nadie la usó). */
  parada: boolean;
  tipo: string | null;
  horas: number;
  /** 0..1, o null si el backend no la manda. */
  ocupacion: number | null;
  sesiones: number | null;
  tiempoBs: number | null;
  consumosBs: number | null;
  total: number | null;
  bsPorHoraAbierta: number | null;
  /** Lo del período anterior, si se pudo comparar. */
  totalAnterior: number | null;
  /** Variación del total contra el anterior (0,28 = +28 %). Null sin con qué comparar. */
  delta: number | null;
}

const numero = (v: number | undefined | null): number | null => (v == null || !Number.isFinite(v) ? null : v);

/**
 * Las mesas, de la que más dejó a la que menos. Sin el total (backend
 * anterior) se ordenan por horas, que es lo único que hay.
 *
 * La flecha compara el total de la mesa con el suyo del período anterior. Una
 * mesa que entonces no se jugó no tiene flecha: contra cero cualquier cobro es
 * un "+∞ %", y eso no es un dato.
 *
 * Las mesas paradas van al final (dejaron cero): se ven, con su flecha si el
 * período anterior sí se jugaron.
 */
export function filasMesas(r: BillarReporteApi): FilaMesa[] {
  const antes = r.anterior ? new Map(r.anterior.porMesa.map((m) => [m.mesaId, m.total])) : null;
  const jugadas = new Set(r.porMesa.map((m) => m.mesaId));
  const paradas = (r.mesasParadas ?? []).filter((m) => !jugadas.has(m.mesaId));
  return [...r.porMesa.map((m) => ({ m, parada: false })), ...paradas.map((m) => ({ m, parada: true }))]
    .map(({ m, parada }): FilaMesa => {
      const total = numero(m.total);
      const totalAnterior = antes ? (antes.get(m.mesaId) ?? null) : null;
      return {
        mesaId: m.mesaId,
        parada,
        tipo: m.tipo?.trim() || null,
        horas: m.horas,
        ocupacion: numero(m.ocupacion),
        sesiones: numero(m.sesiones),
        tiempoBs: numero(m.tiempoBs),
        consumosBs: numero(m.consumosBs),
        total,
        bsPorHoraAbierta: numero(m.bsPorHoraAbierta),
        totalAnterior,
        delta: total != null ? variacion(total, totalAnterior) : null,
      };
    })
    .sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || b.horas - a.horas || a.mesaId - b.mesaId);
}

/** ¿Llegó el detalle por mesa (lo cobrado)? Sin él, la tabla no tiene nada que no diga ya "Horas por mesa". */
export function hayDetallePorMesa(filas: FilaMesa[]): boolean {
  return filas.some((f) => f.total != null);
}

/** Los tipos de mesa ("Pool · 6 mesas"), del que más dejó al que menos. Vacío si el backend no los manda. */
export function tarjetasTipo(r: BillarReporteApi): NonNullable<BillarReporteApi["porTipo"]> {
  return [...(r.porTipo ?? [])].filter((t) => t.tipo).sort((a, b) => b.total - a.total || a.tipo.localeCompare(b.tipo, "es"));
}

// ── Tiempo fijo y promos ────────────────────────────────────────────────────

/** Qué parte de las sesiones fue con tiempo fijo (0..1). Null si no se sabe cuántas sesiones hubo. */
export function parteFijo(vendidos: number, sesiones: number | undefined): number | null {
  return sesiones == null || !(sesiones > 0) ? null : Math.min(1, vendidos / sesiones);
}

/** Las sesiones de tiempo libre: las que manda el backend, o todas menos las de tiempo fijo. Null si no hay cómo saberlo. */
export function sesionesLibres(r: BillarReporteApi): number | null {
  if (r.libres != null && Number.isFinite(r.libres)) return r.libres;
  if (r.sesiones != null && Number.isFinite(r.sesiones)) return Math.max(0, r.sesiones - r.fijos.vendidos);
  return null;
}

/** "1 hora", "2 horas", "1 h 30 min", "45 min". */
export function nombrePaquete(minutos: number): string {
  if (minutos > 0 && minutos % 60 === 0) {
    const h = minutos / 60;
    return h === 1 ? "1 hora" : `${h} horas`;
  }
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

export interface FilaPaquete {
  etiqueta: string;
  /** Null en "Otra cantidad", que junta varias. */
  minutos: number | null;
  cantidad: number;
  monto: number;
}

/**
 * Los paquetes más vendidos, del más corto al más largo. Con muchas
 * duraciones distintas (el "Otra cantidad" del cajero deja pasar de 1 a 24 h)
 * se quedan las más vendidas y el resto va junto al final: diez barras de una
 * venta cada una no dicen nada.
 */
export function filasPaquetes(paquetes: Paquete[], maximo = 4): FilaPaquete[] {
  // Si el backend partiera la misma duración en dos (por tipo de mesa, por
  // ejemplo), acá se juntan: la barra es "cuántas veces se vendió 1 hora".
  const porMinutos = new Map<number, { cantidad: number; monto: number }>();
  for (const p of paquetes) {
    if (!(p.cantidad > 0) || !(p.minutos > 0)) continue;
    const ya = porMinutos.get(p.minutos) ?? { cantidad: 0, monto: 0 };
    porMinutos.set(p.minutos, { cantidad: ya.cantidad + p.cantidad, monto: ya.monto + (p.monto || 0) });
  }
  const filas = [...porMinutos].map(([minutos, v]): FilaPaquete => ({ etiqueta: nombrePaquete(minutos), minutos, ...v }));
  const porDuracion = (a: FilaPaquete, b: FilaPaquete) => (a.minutos ?? 0) - (b.minutos ?? 0);
  if (filas.length <= maximo) return filas.sort(porDuracion);
  const masVendidas = [...filas].sort((a, b) => b.cantidad - a.cantidad || porDuracion(a, b));
  const quedan = masVendidas.slice(0, maximo - 1).sort(porDuracion);
  const resto = masVendidas.slice(maximo - 1);
  return [
    ...quedan,
    {
      etiqueta: "Otra cantidad",
      minutos: null,
      cantidad: resto.reduce((a, f) => a + f.cantidad, 0),
      monto: resto.reduce((a, f) => a + f.monto, 0),
    },
  ];
}

export interface FilaPromo {
  nombre: string;
  /** El descuento, 0..100 (como lo guarda la tarifa: 10 = 10 %). */
  pct: number;
  tipo: string;
  usos: number;
  descuentoBs: number;
  /** Duración promedio de una sesión con la promo, en minutos. Null si no se usó. */
  conPromo: number | null;
  /** La de las sesiones sin promo, para comparar. Null si no hubo o no llegó. */
  sinPromo: number | null;
}

/** Las promos, de la más usada a la menos. Una que no se usó no tiene duración que mostrar. */
export function filasPromos(promos: Promo[], minutosSinPromo: number | undefined): FilaPromo[] {
  const sinPromo = minutosSinPromo != null && minutosSinPromo > 0 ? minutosSinPromo : null;
  return promos
    .map((p) => ({
      nombre: p.nombre,
      pct: p.pct,
      tipo: p.tipo,
      usos: p.usos,
      descuentoBs: p.descuentoBs,
      conPromo: p.usos > 0 && p.minutosPromedio > 0 ? p.minutosPromedio : null,
      sinPromo,
    }))
    .sort((a, b) => b.usos - a.usos || b.descuentoBs - a.descuentoBs || a.nombre.localeCompare(b.nombre, "es"));
}

/** "−10 %", "−12,5 %": el chip de la promo. */
export function textoDescuento(pct: number): string {
  const redondo = Math.round(pct * 10) / 10;
  return `−${String(redondo).replace(".", ",")} %`;
}
