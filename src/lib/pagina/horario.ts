/**
 * El horario de atención de una sucursal: "Abierto ahora · cierra 21:00" en
 * la página y el resumen "Lun a vie 9:00–20:00 · Sáb 9:00–13:00" en el editor.
 *
 * Es la regla de `src/pagina/horario.ts` del backend, portada: el backend
 * guarda, valida y devuelve; el "¿está abierto?" se calcula acá, en el
 * navegador del cliente, para que la página no tenga que volver a pedirse
 * cada minuto. Si se toca una regla allá hay que tocarla acá (y al revés):
 * los tests de los dos lados son los mismos casos.
 *
 * Formato (el del backend): `{ dia, desde, hasta }` con `dia` ISO (1 = lunes
 * … 7 = domingo), horas "HH:MM", hasta 2 tramos por día, `desde` < `hasta`,
 * "24:00" sólo como cierre, y un tramo no cruza la medianoche (18:00 a 1:00
 * se guarda 18:00–24:00 y el día siguiente 00:00–01:00; acá se leen unidos).
 * Por eso un día puede quedar con 3 guardados: la madrugada que sigue de la
 * noche anterior más sus 2 propios.
 *
 * El popup, en cambio, trabaja con los tramos como los dice el dueño: "de
 * 10:00 a 1:00" es UN tramo que cierra al día siguiente. `tramosDesdeSemana`
 * lo parte al guardar y `semanaDesdeTramos` lo vuelve a juntar al abrir; el
 * formato guardado no cambió (17-nov).
 */

export interface Tramo {
  /** 1 = lunes … 7 = domingo (ISO). */
  dia: number;
  /** "HH:MM", de 00:00 a 23:59. */
  desde: string;
  /** "HH:MM", de 00:01 a 24:00, siempre después de `desde`. */
  hasta: string;
}

/** Los del dueño: alcanza para el corte del mediodía (12:00–15:00 y 19:00–1:00). */
export const MAX_TRAMOS_POR_DIA = 2;
/**
 * Guardado, uno más: la madrugada que sigue de la noche anterior (el que
 * cierra el martes a la 1:00 deja el miércoles 00:00–01:00) y los 2 suyos.
 */
const MAX_TRAMOS_GUARDADOS_POR_DIA = MAX_TRAMOS_POR_DIA + 1;

const MIN_DIA = 24 * 60;
const MIN_SEMANA = 7 * MIN_DIA;
/** Bolivia es UTC−4 todo el año (sin horario de verano). */
const OFFSET_BOLIVIA_MIN = -4 * 60;

/** Para los mensajes: "El lunes: …". Índice = día ISO. */
export const NOMBRE_DIA = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
/** Para el editor: "Lunes". */
export const NOMBRE_DIA_MAYUSCULA = NOMBRE_DIA.map((n) => (n ? n[0].toUpperCase() + n.slice(1) : n));
const ABREVIATURA = ["", "lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const DIAS = [1, 2, 3, 4, 5, 6, 7];
/** El domingo sigue en el lunes, y el lunes viene después del domingo. */
const diaSiguiente = (dia: number) => (dia % 7) + 1;
const diaAnterior = (dia: number) => ((dia + 5) % 7) + 1;

/**
 * Lo que el dueño ve cuando el horario no se puede guardar. `dia` dice en qué
 * día del popup va el mensaje (null: es de la lista entera).
 */
export class HorarioInvalido extends Error {
  readonly dia: number | null;
  constructor(mensaje: string, dia: number | null = null) {
    super(mensaje);
    this.dia = dia;
  }
}

/** "9:00" o "09:00" → minutos desde la medianoche; null si no es una hora. */
export function aMinutos(valor: unknown): number | null {
  if (typeof valor !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(valor.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return null;
  if (h === 24 && min === 0) return MIN_DIA;
  if (h > 23) return null;
  return h * 60 + min;
}

export function aTexto(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "09:00" → "9:00": como se dice y como se lee en la página. */
export function horaCorta(hhmm: string): string {
  return hhmm.replace(/^0(\d):/, "$1:");
}

/**
 * Valida y normaliza el horario, con los mismos mensajes que el backend
 * (`normalizarHorario`). Devuelve los tramos ordenados por día y hora, o null
 * si no hay ninguno. Lanza `HorarioInvalido` con el día del problema.
 */
export function normalizarHorario(valor: unknown): Tramo[] | null {
  if (valor == null) return null;
  if (!Array.isArray(valor)) throw new HorarioInvalido("El horario tiene que ser una lista de tramos");
  if (valor.length === 0) return null;
  // Un techo antes de recorrer: más de 3 por día (2 + la madrugada) de 7 días no puede ser válido.
  if (valor.length > MAX_TRAMOS_GUARDADOS_POR_DIA * 7) {
    throw new HorarioInvalido(`Hasta ${MAX_TRAMOS_POR_DIA} tramos por día (por ejemplo, mañana y tarde)`);
  }

  const tramos = valor.map((t: unknown) => {
    const o = (t ?? {}) as Record<string, unknown>;
    const dia = o.dia;
    if (typeof t !== "object" || typeof dia !== "number" || !Number.isInteger(dia) || dia < 1 || dia > 7) {
      throw new HorarioInvalido("Cada tramo tiene que tener un día del 1 (lunes) al 7 (domingo)");
    }
    const nombre = NOMBRE_DIA[dia];
    const desde = aMinutos(o.desde);
    const hasta = aMinutos(o.hasta);
    if (desde === null || desde === MIN_DIA) {
      throw new HorarioInvalido(`El ${nombre}: la hora de apertura tiene que ser HH:MM, entre 00:00 y 23:59`, dia);
    }
    if (hasta === null) {
      throw new HorarioInvalido(`El ${nombre}: la hora de cierre tiene que ser HH:MM, entre 00:00 y 24:00`, dia);
    }
    if (desde >= hasta) {
      // El caso típico es el que cierra pasada la medianoche: se le dice cómo cargarlo.
      const siguiente = NOMBRE_DIA[(dia % 7) + 1];
      throw new HorarioInvalido(
        `El ${nombre}: la hora de cierre tiene que ser después de la de apertura (si cerrás pasada la medianoche, cargá hasta las 24:00 y seguí el ${siguiente} desde las 00:00)`,
        dia,
      );
    }
    return { dia, desde, hasta };
  });

  tramos.sort((a, b) => a.dia - b.dia || a.desde - b.desde);

  for (let i = 0; i < tramos.length; i++) {
    const t = tramos[i];
    const nombre = NOMBRE_DIA[t.dia];
    const delDia = tramos.filter((x) => x.dia === t.dia);
    // El tercero sólo si el primero es la madrugada de la noche anterior: arranca
    // a las 00:00 y el día de antes tiene uno que cierra a las 24:00.
    const conMadrugada =
      delDia.length === MAX_TRAMOS_GUARDADOS_POR_DIA &&
      delDia[0].desde === 0 &&
      tramos.some((x) => x.dia === diaAnterior(t.dia) && x.hasta === MIN_DIA);
    if (delDia.length > MAX_TRAMOS_POR_DIA && !conMadrugada) {
      throw new HorarioInvalido(`El ${nombre}: hasta ${MAX_TRAMOS_POR_DIA} tramos por día (por ejemplo, mañana y tarde)`, t.dia);
    }
    const previo = tramos[i - 1];
    // Que uno termine justo cuando empieza el otro (13:00 y 13:00) no se pisa.
    if (previo && previo.dia === t.dia && t.desde < previo.hasta) {
      throw new HorarioInvalido(
        `El ${nombre}: los tramos ${aTexto(previo.desde)}-${aTexto(previo.hasta)} y ${aTexto(t.desde)}-${aTexto(t.hasta)} se pisan`,
        t.dia,
      );
    }
  }

  return tramos.map((t) => ({ dia: t.dia, desde: aTexto(t.desde), hasta: aTexto(t.hasta) }));
}

/** Dos horarios iguales (null y [] lo son: los dos = sin horario). */
export function mismoHorario(a: readonly Tramo[] | null | undefined, b: readonly Tramo[] | null | undefined): boolean {
  const clave = (x: readonly Tramo[] | null | undefined) =>
    [...(x ?? [])]
      .sort((p, q) => p.dia - q.dia || p.desde.localeCompare(q.desde))
      .map((t) => `${t.dia} ${t.desde}-${t.hasta}`)
      .join(",");
  return clave(a) === clave(b);
}

// ── ¿Está abierto? ─────────────────────────────────────────────────────────

export type EstadoHorario =
  | {
      abierto: true;
      /** "HH:MM" en que cierra ("24:00" = medianoche; puede ser del día siguiente); null = no cierra nunca. */
      cierra: string | null;
    }
  | {
      abierto: false;
      /** La próxima apertura; null si no hay ningún tramo cargado. */
      abre: { dia: number; hora: string; enDias: number } | null;
    };

/**
 * ¿Está abierto en `ahora`? Con la hora de Bolivia y no la del dispositivo:
 * el que mira la página desde otro país tiene que ver lo mismo que el que
 * está en la puerta. Los tramos que se tocan (viernes 18:00–24:00 y sábado
 * 00:00–01:00, o domingo 24:00 con lunes 00:00) se leen como uno.
 */
export function estadoHorario(tramos: readonly Tramo[] | null | undefined, ahora: Date = new Date()): EstadoHorario {
  if (!tramos?.length) return { abierto: false, abre: null };
  // El reloj de pared de Bolivia, leído con los getters UTC.
  const local = new Date(ahora.getTime() + OFFSET_BOLIVIA_MIN * 60_000);
  const diaHoy = ((local.getUTCDay() + 6) % 7) + 1;
  const ya = (diaHoy - 1) * MIN_DIA + local.getUTCHours() * 60 + local.getUTCMinutes();

  // Minutos desde el lunes 00:00, repetidos una semana más adelante para que
  // el domingo a la noche vea el lunes, y unidos donde se tocan.
  const semana = tramos
    .map((t) => ({ desde: (t.dia - 1) * MIN_DIA + aMinutos(t.desde)!, hasta: (t.dia - 1) * MIN_DIA + aMinutos(t.hasta)! }))
    .sort((a, b) => a.desde - b.desde);
  const dos = [...semana, ...semana.map((t) => ({ desde: t.desde + MIN_SEMANA, hasta: t.hasta + MIN_SEMANA }))];
  const unidos: { desde: number; hasta: number }[] = [];
  for (const t of dos) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && t.desde <= ultimo.hasta) ultimo.hasta = Math.max(ultimo.hasta, t.hasta);
    else unidos.push({ ...t });
  }

  const abierto = unidos.find((t) => t.desde <= ya && ya < t.hasta);
  if (abierto) {
    if (abierto.hasta - abierto.desde >= MIN_SEMANA) return { abierto: true, cierra: null };
    return { abierto: true, cierra: aTexto(abierto.hasta % MIN_DIA || MIN_DIA) };
  }
  const proximo = unidos.find((t) => t.desde > ya)!;
  const diaAbs = Math.floor(proximo.desde / MIN_DIA);
  return {
    abierto: false,
    abre: { dia: (diaAbs % 7) + 1, hora: aTexto(proximo.desde % MIN_DIA), enDias: diaAbs - (diaHoy - 1) },
  };
}

/**
 * El texto del cartel: "Abierto ahora · cierra 21:00", "Cerrado · abre
 * mañana 9:00"… null si no hay nada que decir (sin horario cargado).
 */
export function textoEstado(e: EstadoHorario): string | null {
  // Con `===`: sin strictNullChecks, la veracidad sola no distingue las dos formas.
  if (e.abierto === true) {
    if (e.cierra === null) return "Abierto las 24 horas";
    if (e.cierra === "24:00") return "Abierto ahora · cierra a medianoche";
    return `Abierto ahora · cierra ${horaCorta(e.cierra)}`;
  }
  if (e.abierto !== false || !e.abre) return null;
  const { dia, hora, enDias } = e.abre;
  const cuando =
    enDias === 0 ? "hoy" : enDias === 1 ? "mañana" : enDias >= 7 ? `el próximo ${NOMBRE_DIA[dia]}` : `el ${NOMBRE_DIA[dia]}`;
  return `Cerrado · abre ${cuando} ${horaCorta(hora)}`;
}

// ── La semana, agrupada ────────────────────────────────────────────────────

export interface GrupoDias {
  /** "Lun a vie", "Sáb y dom", "Dom", "Todos los días". */
  dias: string;
  /** "9:00–20:00", "9:00–13:00 y 15:00–20:00", "24 horas"; null = cerrado. */
  horas: string | null;
}

const mayuscula = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Un tramo como lo dice el dueño: con `hasta` antes que `desde` cierra al día siguiente (10:00 a 1:00). */
export interface TramoDelDia {
  desde: string;
  hasta: string;
}

/**
 * Los tramos de cada día (índice 0 = lunes) como los dice el dueño: la
 * noche que sigue en la madrugada del día siguiente se junta en un tramo
 * del día que abre. Se junta si el último del día cierra a las 24:00 y el
 * siguiente arranca con uno de 00:00 a una hora ANTES de esa apertura
 * (18:00–24:00 + 00:00–01:00 = 18:00 a 1:00); con una hora igual o
 * posterior no (dos días de 00:00 a 24:00 son "24 horas", no un tramo que
 * da la vuelta). Así un tramo nunca puede juntarse dos veces: la madrugada
 * que se junta termina antes de las 24:00.
 */
function tramosPorDia(tramos: readonly Tramo[] | null | undefined): TramoDelDia[][] {
  const guardados = DIAS.map((dia) =>
    (tramos ?? [])
      .filter((t) => t.dia === dia)
      .sort((a, b) => (aMinutos(a.desde) ?? 0) - (aMinutos(b.desde) ?? 0))
      .map((t) => ({ desde: t.desde, hasta: t.hasta })),
  );
  const madrugada = (i: number) => guardados[(i + 1) % 7][0];
  const sigue = guardados.map((delDia, i) => {
    const ultimo = delDia[delDia.length - 1];
    const otra = madrugada(i);
    return (
      !!ultimo &&
      !!otra &&
      aMinutos(ultimo.hasta) === MIN_DIA &&
      aMinutos(otra.desde) === 0 &&
      (aMinutos(otra.hasta) ?? MIN_DIA) < (aMinutos(ultimo.desde) ?? 0)
    );
  });
  return guardados.map((delDia, i) => {
    // La madrugada que ya va con la noche de ayer no se repite hoy.
    const propios = sigue[(i + 6) % 7] ? delDia.slice(1) : [...delDia];
    if (sigue[i]) propios[propios.length - 1] = { desde: propios[propios.length - 1].desde, hasta: madrugada(i).hasta };
    return propios;
  });
}

/**
 * Los días consecutivos con el mismo horario, juntos y de lunes a domingo:
 * "Lun a vie 9:00–20:00", "Sáb 9:00–13:00", "Dom cerrado". Vacío si no hay
 * ningún tramo. El que cierra pasada la medianoche se lee como en el popup:
 * "10:00–1:00" y no "0:00–1:00 y 10:00–24:00".
 */
export function agruparSemana(tramos: readonly Tramo[] | null | undefined): GrupoDias[] {
  if (!tramos?.length) return [];
  const porDia = tramosPorDia(tramos);
  const horasDe = (dia: number): string | null => {
    const delDia = porDia[dia - 1];
    if (delDia.length === 0) return null;
    return delDia
      .map((t) => (t.desde === "00:00" && t.hasta === "24:00" ? "24 horas" : `${horaCorta(t.desde)}–${horaCorta(t.hasta)}`))
      .join(" y ");
  };
  const grupos: { desde: number; hasta: number; horas: string | null }[] = [];
  for (const dia of DIAS) {
    const horas = horasDe(dia);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.horas === horas) ultimo.hasta = dia;
    else grupos.push({ desde: dia, hasta: dia, horas });
  }
  return grupos.map((g) => ({
    dias:
      g.desde === 1 && g.hasta === 7
        ? "Todos los días"
        : g.desde === g.hasta
          ? mayuscula(ABREVIATURA[g.desde])
          : `${mayuscula(ABREVIATURA[g.desde])} ${g.hasta - g.desde === 1 ? "y" : "a"} ${ABREVIATURA[g.hasta]}`,
    horas: g.horas,
  }));
}

/** El resumen en una línea: "Lun a vie 9:00–20:00 · Sáb 9:00–13:00 · Dom cerrado"; null = sin horario. */
export function resumenHorario(tramos: readonly Tramo[] | null | undefined): string | null {
  const grupos = agruparSemana(tramos);
  if (grupos.length === 0) return null;
  return grupos.map((g) => `${g.dias} ${g.horas ?? "cerrado"}`).join(" · ");
}

// ── El popup del editor ────────────────────────────────────────────────────

/**
 * Un día en el popup: si abre y sus tramos (los guarda aunque esté cerrado,
 * para volver a abrirlo). Un tramo con `hasta` antes que `desde` cierra al
 * día siguiente (10:00 a 1:00); sólo el último del día puede hacerlo.
 */
export interface DiaEditor {
  dia: number;
  abierto: boolean;
  tramos: TramoDelDia[];
}

export const TRAMO_POR_DEFECTO = { desde: "09:00", hasta: "18:00" };

/** ¿Cierra al día siguiente? "24:00" es la medianoche de ese día: no cruza. */
function cruza(t: TramoDelDia): boolean {
  const desde = aMinutos(t.desde);
  const hasta = aMinutos(t.hasta);
  return desde !== null && hasta !== null && hasta < desde;
}

/**
 * El horario guardado, como lo muestra el popup: los 7 días, cerrados los que
 * no tienen tramos, y la noche que sigue en la madrugada del día siguiente
 * como un solo tramo ("10:00 a 1:00"). Un día que sólo tenía esa madrugada
 * se ve cerrado: su madrugada ya está en la noche de ayer.
 */
export function semanaDesdeTramos(tramos: readonly Tramo[] | null | undefined): DiaEditor[] {
  const porDia = tramosPorDia(tramos);
  return DIAS.map((dia) => ({ dia, abierto: porDia[dia - 1].length > 0, tramos: porDia[dia - 1] }));
}

/**
 * Lo que el popup manda: los tramos de los días abiertos (sin normalizar).
 * El que cierra al día siguiente se parte como se guarda: hasta las 24:00
 * ese día y desde las 00:00 el siguiente (el domingo sigue en el lunes),
 * aunque ese día esté cerrado en el popup.
 */
export function tramosDesdeSemana(semana: readonly DiaEditor[]): Tramo[] {
  return semana
    .filter((d) => d.abierto)
    .flatMap((d) =>
      d.tramos.flatMap((t): Tramo[] => {
        if (!cruza(t)) return [{ dia: d.dia, desde: t.desde, hasta: t.hasta }];
        const partes: Tramo[] = [{ dia: d.dia, desde: t.desde, hasta: "24:00" }];
        // "Hasta las 0:00 del otro día" es la medianoche: no deja madrugada.
        if (aMinutos(t.hasta) !== 0) partes.push({ dia: diaSiguiente(d.dia), desde: "00:00", hasta: t.hasta });
        return partes;
      }),
    );
}

/**
 * "a las 3:00", pero "a la 1:00". Con espacios duros (\u00A0), como "se\u00A0pisan":
 * que la hora no quede sola en el renglón de abajo.
 */
const aLas = (hhmm: string) => `${/^0?1:/.test(hhmm) ? "a\u00A0la" : "a\u00A0las"}\u00A0${horaCorta(hhmm)}`;

/**
 * La ayuda gris debajo de un tramo que cierra al día siguiente, para que el
 * que eligió mal una hora se dé cuenta: "Cierre: 1:00 del miércoles
 * (madrugada)". null si el tramo cierra el mismo día.
 */
export function cierreDelDiaSiguiente(dia: number, t: TramoDelDia): string | null {
  if (!cruza(t)) return null;
  const madrugada = aMinutos(t.hasta)! <= 6 * 60 ? " (madrugada)" : "";
  return `Cierre: ${horaCorta(t.hasta)} del ${NOMBRE_DIA[diaSiguiente(dia)]}${madrugada}`;
}

/**
 * El mensaje de ese día, o null si está bien (o cerrado). Mira la semana
 * porque el que cierra al día siguiente no puede pisar la apertura de ese
 * día (si ese día está cerrado en el popup, no pisa nada).
 */
export function errorDelDia(d: DiaEditor, semana: readonly DiaEditor[]): string | null {
  if (!d.abierto) return null;
  const nombre = NOMBRE_DIA[d.dia];
  if (d.tramos.length > MAX_TRAMOS_POR_DIA) {
    return `El ${nombre}: hasta ${MAX_TRAMOS_POR_DIA} tramos por día (por ejemplo, mañana y tarde)`;
  }
  const tramos: { desde: number; hasta: number; cruza: boolean }[] = [];
  for (const t of d.tramos) {
    const desde = aMinutos(t.desde);
    const hasta = aMinutos(t.hasta);
    if (desde === null || desde === MIN_DIA) return `El ${nombre}: la hora de apertura tiene que ser HH:MM, entre 00:00 y 23:59`;
    if (hasta === null) return `El ${nombre}: la hora de cierre tiene que ser HH:MM, entre 00:00 y 24:00`;
    if (desde === hasta) {
      return `El ${nombre}: la hora de cierre no puede ser igual a la de apertura (si atendés las 24 horas, cargá de 0:00 a 24:00)`;
    }
    tramos.push({ desde, hasta, cruza: hasta < desde });
  }
  tramos.sort((a, b) => a.desde - b.desde);
  for (let i = 1; i < tramos.length; i++) {
    const previo = tramos[i - 1];
    const t = tramos[i];
    // El que cruza la medianoche sigue hasta las 24:00: pisa al que abra después ese día.
    if (t.desde < (previo.cruza ? MIN_DIA : previo.hasta)) {
      return `El ${nombre}: los tramos ${aTexto(previo.desde)}-${aTexto(previo.hasta)} y ${aTexto(t.desde)}-${aTexto(t.hasta)} se pisan`;
    }
  }
  const ultimo = tramos[tramos.length - 1];
  const otro = semana.find((x) => x.dia === diaSiguiente(d.dia));
  if (ultimo?.cruza && otro?.abierto) {
    const aperturas = otro.tramos.map((t) => aMinutos(t.desde)).filter((m): m is number => m !== null);
    const abre = aperturas.length ? Math.min(...aperturas) : null;
    // Que cierre justo cuando abre el otro (3:00 y 3:00) no se pisa.
    if (abre !== null && abre < ultimo.hasta) {
      const siguiente = NOMBRE_DIA[otro.dia];
      return `El ${nombre} cierra ${aLas(aTexto(ultimo.hasta))} del ${siguiente}, pero el ${siguiente} ya abre ${aLas(aTexto(abre))}: se\u00A0pisan`;
    }
  }
  return null;
}

/**
 * El segundo tramo ("+ Agregar corte"): el caso de siempre es el corte del
 * mediodía, así que un 9:00–20:00 se parte en 9:00–13:00 y 15:00–20:00 (y un
 * 10:00 a 1:00, en 10:00–13:00 y 15:00 a 1:00). Si el primero no cruza el
 * mediodía, el segundo arranca una hora después; si es uno de la tarde que
 * cierra al día siguiente (19:00 a 1:00), el almuerzo va antes.
 */
export function agregarCorte(tramos: readonly TramoDelDia[]): TramoDelDia[] {
  if (tramos.length === 0) return [{ ...TRAMO_POR_DEFECTO }];
  if (tramos.length >= MAX_TRAMOS_POR_DIA) return [...tramos];
  const [t] = tramos;
  const desde = aMinutos(t.desde) ?? 0;
  // El que cierra al día siguiente sigue pasada la medianoche.
  const hasta = (aMinutos(t.hasta) ?? MIN_DIA) + (cruza(t) ? MIN_DIA : 0);
  if (desde < 13 * 60 && hasta > 15 * 60) {
    return [
      { desde: t.desde, hasta: "13:00" },
      { desde: "15:00", hasta: t.hasta },
    ];
  }
  if (cruza(t)) {
    // Sólo el último puede cruzar: el nuevo va antes. Con lugar, el almuerzo
    // (12:00–15:00 y 19:00 a 1:00); si abre a media tarde, dos horas de corte.
    if (desde >= 16 * 60) return [{ desde: "12:00", hasta: "15:00" }, { ...t }];
    return [
      { desde: t.desde, hasta: aTexto(desde + 3 * 60) },
      { desde: aTexto(desde + 5 * 60), hasta: t.hasta },
    ];
  }
  const inicio = Math.min(hasta + 60, MIN_DIA - 60);
  return [{ ...t }, { desde: aTexto(inicio), hasta: aTexto(Math.min(inicio + 4 * 60, MIN_DIA)) }];
}

/**
 * Las horas que ofrecen los selectores, cada media hora (en el celular un
 * select abre la rueda del sistema, más cómoda que teclear; y "24:00" no
 * existe en un `type="time"`). `cierre`: de 00:30 a 24:00; si no, de 00:00 a
 * 23:30. Una hora guardada fuera de la grilla (9:15) se agrega para no perderla.
 */
export function opcionesHora(cierre: boolean, actual?: string): string[] {
  const lista: string[] = [];
  for (let m = cierre ? 30 : 0; m <= (cierre ? MIN_DIA : MIN_DIA - 30); m += 30) lista.push(aTexto(m));
  if (actual && aMinutos(actual) !== null && !lista.includes(actual)) {
    lista.push(actual);
    lista.sort((a, b) => aMinutos(a)! - aMinutos(b)!);
  }
  return lista;
}
