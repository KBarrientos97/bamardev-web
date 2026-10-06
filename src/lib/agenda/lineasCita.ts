import { correr, instante } from "./horaAgenda";
import type { Cita, LineaReservada, Propuesta, Servicio } from "./tiposAgenda";

/**
 * Las líneas que se mandan al mover una cita arrastrándola en la grilla.
 *
 * Se corre TODA la secuencia el mismo tiempo (corte → color → peinado siguen
 * pegados). Si además cambió de columna, se van al profesional nuevo las
 * líneas que estaban con el mismo profesional que la arrastrada: una cita de
 * dos servicios con Carla pasa entera a Marcos, y una con Carla y Daniela sólo
 * cambia la parte de Carla. El backend revalida todo (mismas reglas y 409).
 */
export function moverLineas(
  cita: Cita,
  lineaId: number,
  deltaMin: number,
  recursoDestinoId: number,
): LineaReservada[] {
  const arrastrada = cita.lineas.find((l) => l.id === lineaId);
  const origen = arrastrada?.recursoId;
  return cita.lineas.map((l) => ({
    servicioId: l.servicioId,
    recursoId: l.recursoId === origen ? recursoDestinoId : l.recursoId,
    inicio: correr(l.inicio, deltaMin),
  }));
}

/**
 * La cita como quedaría después de moverla, para pintarla en su lugar nuevo
 * mientras el backend contesta. Si contesta que no, se vuelve a la de antes.
 */
export function citaMovida(
  cita: Cita,
  lineas: LineaReservada[],
  nombreRecurso: (id: number) => string,
): Cita {
  const nuevas = cita.lineas.map((l, i) => {
    const dur = new Date(l.fin).getTime() - new Date(l.inicio).getTime();
    const inicio = lineas[i]?.inicio ?? l.inicio;
    const recursoId = lineas[i]?.recursoId ?? l.recursoId;
    return {
      ...l,
      inicio,
      fin: new Date(new Date(inicio).getTime() + dur).toISOString(),
      recursoId,
      recurso: recursoId === l.recursoId ? l.recurso : nombreRecurso(recursoId),
    };
  });
  const inicios = nuevas.map((l) => l.inicio).sort();
  const fines = nuevas.map((l) => l.fin).sort();
  return { ...cita, lineas: nuevas, inicio: inicios[0] ?? cita.inicio, fin: fines[fines.length - 1] ?? cita.fin };
}

/** Las líneas de una propuesta de huecos, en la forma que pide el POST. */
export function lineasDePropuesta(p: Propuesta): LineaReservada[] {
  return p.lineas.map((l) => ({ servicioId: l.servicioId, recursoId: l.recursoId, inicio: l.inicio }));
}

/**
 * Las líneas de un sobre-turno: no hay huecos que proponer (se superpone a
 * propósito), así que se encadenan desde la hora elegida con la duración de
 * cada servicio y su buffer. Sin duración cargada se toman 30 minutos.
 */
export function lineasManuales(
  fecha: string,
  hora: string,
  pedidas: { servicioId: number; recursoId: number }[],
  servicios: Servicio[],
): LineaReservada[] {
  let cursor = instante(fecha, hora);
  return pedidas.map((p) => {
    const s = servicios.find((x) => x.id === p.servicioId);
    const linea = { servicioId: p.servicioId, recursoId: p.recursoId, inicio: cursor };
    cursor = correr(cursor, (s?.duracionMin ?? 30) + (s?.bufferMin ?? 0));
    return linea;
  });
}

/**
 * El tramo de una cita que le toca a un profesional: sus líneas, con la hora
 * en que empieza la primera y termina la última. En una secuencia "Corte con
 * Carla 09:15-10:00 + Tinte con Sofía 10:00-11:30", Carla ve "09:15 · 45 min ·
 * Corte" y no las dos horas y cuarto de la cita entera (QA M-12).
 *
 * Si ninguna línea es suya (un walk-in que lo prefirió, sin líneas todavía) o
 * todas lo son, la cita queda como vino.
 */
export function tramoDe(cita: Cita, recursoIds: number[]): Cita {
  const suyas = cita.lineas.filter((l) => recursoIds.includes(l.recursoId));
  if (suyas.length === 0 || suyas.length === cita.lineas.length) return cita;
  const inicio = suyas.reduce((min, l) => (l.inicio < min ? l.inicio : min), suyas[0].inicio);
  const fin = suyas.reduce((max, l) => (l.fin > max ? l.fin : max), suyas[0].fin);
  return { ...cita, lineas: suyas, inicio, fin };
}
