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
 */

const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** La medianoche local de `dia` (+ `sumarDias`), en ISO con su offset. */
function medianocheLocal(dia: string, sumarDias = 0): string {
  const [a, m, d] = dia.split("-").map(Number);
  const f = new Date(a, m - 1, d + sumarDias);
  // El offset de ESE día y no el de hoy: el día que un país mueve las agujas,
  // las dos puntas del rango pueden tener offsets distintos.
  const off = -f.getTimezoneOffset();
  const signo = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const mes = String(f.getMonth() + 1).padStart(2, "0");
  const dd = String(f.getDate()).padStart(2, "0");
  return `${f.getFullYear()}-${mes}-${dd}T00:00:00${signo}${hh}:${mm}`;
}

/**
 * El rango listo para el backend. Sólo toca las fechas que vienen como día
 * pelado: una que ya trae hora (u offset) pasa tal cual.
 */
export function rangoParaApi<T extends { desde?: string; hasta?: string }>(r: T): T {
  return {
    ...r,
    ...(r.desde && SOLO_DIA.test(r.desde) ? { desde: medianocheLocal(r.desde) } : {}),
    ...(r.hasta && SOLO_DIA.test(r.hasta) ? { hasta: medianocheLocal(r.hasta, 1) } : {}),
  };
}

/**
 * Minutos a sumarle a UTC para llegar a la hora local (Bolivia = −240). Lo
 * piden los reportes mensuales para cortar cada mes en el reloj del negocio.
 */
export function tzOffsetMin(): number {
  return -new Date().getTimezoneOffset();
}
