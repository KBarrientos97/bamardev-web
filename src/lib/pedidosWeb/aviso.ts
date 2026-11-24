import { aMinutos, estadoHorario, horaCorta, NOMBRE_DIA, type Tramo } from "../pagina/horario";
import type { InfoPedidos, MotivoSinPedidos } from "./tipos";

const MOTIVOS: Record<MotivoSinPedidos, string> = {
  SIN_DELIVERY: "Este negocio todavía no recibe pedidos desde la página.",
  CATALOGO_MANUAL: "Este negocio todavía no recibe pedidos desde la página.",
  APAGADO: "Por ahora no estamos recibiendo pedidos por acá.",
};

/** Lo que se suma en la franja de la página, donde el cliente igual puede mirar la carta. */
const COLA_CARTA = " Mirá la carta mientras tanto.";

/** Con la caja abierta y a menos de esto del cierre, el local ya no va a abrir la caja hoy. */
const MIN_ANTES_DEL_CIERRE = 60;

export interface OpcionesAviso {
  /** El horario de cada sucursal publicada en la página (null = sin cargar). */
  horarios?: readonly (readonly Tramo[] | null | undefined)[];
  /** En la franja de la página suma «Mirá la carta mientras tanto». */
  enLaCarta?: boolean;
  ahora?: Date;
}

/**
 * Por qué no se puede pedir ahora, o null si se puede. Se dice ANTES de que el
 * cliente arme todo.
 *
 * Sin ninguna caja abierta, el texto sale del horario de la página (pedido del
 * dueño, 24-nov): fuera de horario, cuándo abre («Cerrado ahora · Abrimos hoy
 * a las 12:00»); en horario, que en un rato empieza a tomar pedidos (todavía
 * no abrió la caja), o que por hoy ya no, si falta menos de una hora para
 * cerrar. «Cerrado» a secas contradecía al «Abierto ahora» del horario
 * cuando sólo faltaba la caja (QA R1, N2): por eso en horario nunca lo dice.
 */
export function avisoSinPedidos(info: InfoPedidos | null, opciones: OpcionesAviso = {}): string | null {
  if (!info) return null;
  if (!info.recibe) return MOTIVOS[info.motivo ?? "APAGADO"] ?? MOTIVOS.APAGADO;
  if (info.sucursales.length === 0 || info.sucursales.some((s) => s.abierta)) return null;

  const cola = opciones.enLaCarta ? COLA_CARTA : "";
  const ahora = opciones.ahora ?? new Date();
  const conHorario = (opciones.horarios ?? []).filter((h): h is readonly Tramo[] => !!h?.length);
  if (!conHorario.length) return "Por ahora no estamos tomando pedidos. Volvé en un rato.";

  const estados = conHorario.map((h) => estadoHorario(h, ahora));
  const abiertos = estados.filter((e) => e.abierto === true);
  if (abiertos.length) {
    const yaCierra = abiertos.every((e) => e.abierto === true && e.cierra !== null && minutosHasta(e.cierra, ahora) <= MIN_ANTES_DEL_CIERRE);
    return yaCierra ? "Por hoy ya no estamos tomando pedidos." : `En un ratito empezamos a tomar pedidos.${cola}`;
  }

  // Todos cerrados por horario: la apertura más próxima de todas.
  const proximas = estados.flatMap((e) => (e.abierto === false && e.abre ? [e.abre] : []));
  if (!proximas.length) return "Por ahora no estamos tomando pedidos. Volvé en un rato.";
  const abre = proximas.reduce((a, b) => (b.enDias * 1440 + aMinutos(b.hora)! < a.enDias * 1440 + aMinutos(a.hora)! ? b : a));
  const cuando =
    abre.enDias === 0 ? "hoy" : abre.enDias === 1 ? "mañana" : abre.enDias >= 7 ? `el próximo ${NOMBRE_DIA[abre.dia]}` : `el ${NOMBRE_DIA[abre.dia]}`;
  const hora = horaCorta(abre.hora);
  return `Cerrado ahora · Abrimos ${cuando} ${hora.startsWith("1:") ? "a la" : "a las"} ${hora}.${cola}`;
}

/** Minutos de reloj de Bolivia que faltan hasta `hhmm` ("24:00" = medianoche), dando la vuelta al día. */
function minutosHasta(hhmm: string, ahora: Date): number {
  const local = new Date(ahora.getTime() - 4 * 60 * 60_000);
  const ya = local.getUTCHours() * 60 + local.getUTCMinutes();
  const falta = (aMinutos(hhmm)! - ya + 1440) % 1440;
  return falta === 0 ? 1440 : falta;
}
