/**
 * Cómo viaja un rango de fechas a los reportes del backend.
 *
 * La pantalla elige DÍAS (`yyyy-MM-dd`, "del 19 al 25"); el backend compara
 * INSTANTES: `new Date(desde) <= fecha < new Date(hasta)`, con `hasta`
 * exclusivo. Mandar el día pelado rompía dos cosas a la vez:
 *
 * - `new Date("2026-09-25")` es la medianoche UTC del 25, así que el último
 *   día quedaba AFUERA entero. "Hoy" era un rango vacío: en la web siempre
 *   daba Bs 0.
 * - La medianoche es la de UTC y no la del local: en Bolivia (UTC−4) una venta
 *   de las 22:14 se guarda como las 02:14 del día siguiente. La pollería vende
 *   de noche, y la semana del 19 al 25 daba Bs 0 cuando la app decía Bs 262.
 *
 * La app nunca lo sufrió porque manda `yyyy-MM-ddTHH:mm:ss-04:00`
 * (`RangoPeriodos.kt`). Esto hace lo mismo: el `desde` es la medianoche LOCAL
 * de ese día y el `hasta`, la medianoche local del día siguiente. Sirve igual
 * para los gastos, que el backend guarda en la medianoche del negocio.
 *
 * En un billar el día es la JORNADA (`lib/jornada.ts`): con `corteMin` en el
 * rango, cada día empieza a esa hora y no a la medianoche (el 13 va del 13 a
 * las 6:00 al 14 a las 6:00), porque el billar cierra a las 2 a. m. y su noche
 * es una sola. Sin `corteMin` (todos los demás rubros) es exactamente lo de
 * siempre.
 */

const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** El comienzo local de `dia` (+ `sumarDias`) —la medianoche, o la hora del corte—, en ISO con su offset. */
function medianocheLocal(dia: string, sumarDias = 0, corteMin = 0): string {
  const [a, m, d] = dia.split("-").map(Number);
  // Los minutos del corte por el constructor local: es la hora del reloj de
  // ese día, aunque ese día el país mueva las agujas.
  const f = new Date(a, m - 1, d + sumarDias, 0, corteMin > 0 ? corteMin : 0);
  // El offset de ESE día y no el de hoy: el día que un país mueve las agujas,
  // las dos puntas del rango pueden tener offsets distintos.
  const off = -f.getTimezoneOffset();
  const signo = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const mes = String(f.getMonth() + 1).padStart(2, "0");
  const dd = String(f.getDate()).padStart(2, "0");
  const hora = `${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;
  return `${f.getFullYear()}-${mes}-${dd}T${hora}:00${signo}${hh}:${mm}`;
}

/**
 * El rango listo para el backend. Sólo toca las fechas que vienen como día
 * pelado: una que ya trae hora (u offset) pasa tal cual.
 *
 * Con `corteMin` (un billar) los días son jornadas: del primero a la hora del
 * corte al día siguiente del último a la misma hora. El `corteMin` no viaja:
 * el backend tiene el suyo y es la fuente de verdad.
 */
export function rangoParaApi<T extends { desde?: string; hasta?: string; corteMin?: number }>(r: T): T {
  const { corteMin = 0, ...resto } = r;
  return {
    ...resto,
    ...(r.desde && SOLO_DIA.test(r.desde) ? { desde: medianocheLocal(r.desde, 0, corteMin) } : {}),
    ...(r.hasta && SOLO_DIA.test(r.hasta) ? { hasta: medianocheLocal(r.hasta, 1, corteMin) } : {}),
  } as T;
}

/**
 * El mismo rango por días del calendario, sin el corte de la jornada. Para lo
 * que el backend guarda con FECHA y sin hora —los gastos, en la medianoche del
 * negocio—: el gasto del 1 de octubre es de octubre aunque el billar arranque
 * el día a las 6, y con el corte se iría a septiembre.
 */
export function sinJornada<T extends { corteMin?: number }>(r: T): Omit<T, "corteMin"> {
  const { corteMin: _corte, ...resto } = r;
  return resto;
}

/**
 * Lo mismo para un período cuyo `hasta` YA es exclusivo (el mes de Gastos:
 * del 1 al 1 del mes siguiente, ver `finDeMes`): las dos puntas son la
 * medianoche local de ese día, sin correr el `hasta` un día más. Lo que ya
 * trae hora pasa tal cual.
 */
export function periodoParaApi<T extends { desde?: string; hasta?: string }>(r: T): T {
  return {
    ...r,
    ...(r.desde && SOLO_DIA.test(r.desde) ? { desde: medianocheLocal(r.desde) } : {}),
    ...(r.hasta && SOLO_DIA.test(r.hasta) ? { hasta: medianocheLocal(r.hasta) } : {}),
  };
}

/**
 * Minutos a sumarle a UTC para llegar a la hora local (Bolivia = −240). Lo
 * piden los reportes mensuales para cortar cada mes en el reloj del negocio.
 */
export function tzOffsetMin(): number {
  return -new Date().getTimezoneOffset();
}
