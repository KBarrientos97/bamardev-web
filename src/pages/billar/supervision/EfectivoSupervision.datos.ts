import type { CajaDestino } from "../../pos/DialogoMovimiento";
import { motivoDeCodigo } from "../../pos/motivosMovimiento";
import type { CajaSupervisionApi, MovimientoSupervisionApi } from "../api";
import { estadoDeCaja } from "./Supervision.datos";

/** Lo que el cuadro de movimiento necesita saber de a qué caja va. */
export interface DestinoDelMovimiento {
  cajaId: number;
  deQuien: { nombre: string; desde: number };
  /** El esperado de esa caja si se sabe (el de la caja del turno); si no, el cuadro lo pide. */
  esperado: number | null;
  /** Con dos o más cajas abiertas, las que se pueden elegir. */
  cajas?: CajaDestino[];
}

/**
 * A qué caja va el movimiento (25-oct), calculado UNA vez al abrir el cuadro.
 *
 * Por defecto, la del turno que se mira. Pero con dos cajas abiertas el turno
 * por defecto es la más vieja de la jornada, que puede ser la del propio
 * administrador: tocaba "Cena" pensando en la cajera y se descontaba de su
 * propia caja (ella cerraba con faltante y él con sobrante). Entonces, si la
 * del turno es suya y hay otra abierta, se propone la otra; y con más de una
 * abierta se puede elegir en el cuadro.
 *
 * Sólo se propone sola una caja de HOY (`desdeJornada`): una que quedó abierta
 * desde el jueves no es la de la cajera que trabaja, y el sábado el gasto
 * terminaba en la caja del jueves (la de hoy cerraba con faltante).
 */
export function destinoDelMovimiento(
  turno: { cajaId: number; cajero: string; desde: number; esperado: number | null },
  cajas: CajaSupervisionApi[],
  usuarioId: number | undefined,
  desdeJornada?: number,
): DestinoDelMovimiento {
  const delTurno = { cajaId: turno.cajaId, deQuien: { nombre: turno.cajero, desde: turno.desde }, esperado: turno.esperado };
  const abiertas = cajas.filter((c) => c.abierta);
  if (abiertas.length < 2) return delTurno;
  const esMia = (c: CajaSupervisionApi | undefined) => usuarioId != null && c?.cajeroId === usuarioId;
  const deHoy = (c: CajaSupervisionApi) => desdeJornada == null || estadoDeCaja(c, desdeJornada) !== "vieja";
  const laDelTurno = abiertas.find((c) => c.id === turno.cajaId);
  const otra = esMia(laDelTurno) ? abiertas.find((c) => !esMia(c) && deHoy(c)) : undefined;
  const inicial = otra ?? laDelTurno ?? abiertas[0];
  return {
    cajaId: inicial.id,
    deQuien: { nombre: inicial.cajero, desde: inicial.desde },
    esperado: inicial.id === turno.cajaId ? turno.esperado : null,
    cajas: abiertas.map((c) => ({ id: c.id, cajero: c.cajero, desde: c.desde })),
  };
}

/** "Gasto · Hielo", "Cena", "Retiro"; sin motivo, lo que se escribió. */
export function tituloDeMovimiento(m: Pick<MovimientoSupervisionApi, "codigo" | "cena" | "texto" | "tipo">): string {
  const motivo = motivoDeCodigo(m.codigo ?? (m.cena ? "CENA" : null));
  if (motivo) {
    const detalle = m.texto?.trim();
    return detalle && detalle !== motivo.etiqueta ? `${motivo.etiqueta} · ${detalle}` : motivo.etiqueta;
  }
  return m.texto ?? (m.tipo === "INGRESO" ? "Entrada de efectivo" : "Salida de efectivo");
}
