import { esPositivo } from "../../../lib/dinero";
import type { HorasApi } from "../api";
import { aDia, diasDe } from "../periodo";

/**
 * Las cuentas de Horas y días, aparte de la pantalla para poder probarlas.
 *
 * El backend manda 24 montos por hora y 7 por día de la semana (lunes
 * primero), en la hora del negocio y SUMADOS en el período: el "Sáb" de un
 * mes son todos sus sábados juntos, no un sábado promedio.
 */

export const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIA_UNO = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DIA_VARIOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

function h12(h: number): number {
  return h % 12 === 0 ? 12 : h % 12;
}

/** La etiqueta del eje: "4p", "12a" (medianoche), "12p" (mediodía). */
export function etiquetaHora(h: number): string {
  return `${h12(h)}${h < 12 ? "a" : "p"}`;
}

/** La hora escrita entera: "10 p. m.", "12 a. m.". */
export function horaLarga(h: number): string {
  return `${h12(h)} ${h < 12 ? "a. m." : "p. m."}`;
}

/**
 * Las horas a dibujar, en el orden de la jornada: sólo el tramo que va de la
 * primera hora con ventas a la última, con los huecos del medio incluidos (un
 * bajón a las 3 de la tarde es un dato).
 *
 * Un local que abre a las 4 p. m. y cierra a las 2 a. m. se lee "4p … 1a", no
 * "12a 1a … 4p 5p": la jornada arranca después del hueco más largo sin ventas,
 * como `ordenJornada` del billar. Las 24 barras de reloj dejaban el pico
 * apretado en una esquina y la madrugada partida en los dos extremos.
 */
export function tramoJornada(porHora: readonly number[]): number[] {
  const conVentas: number[] = [];
  for (let h = 0; h < 24; h++) if (esPositivo(porHora[h] ?? 0)) conVentas.push(h);
  if (conVentas.length <= 1) return conVentas;
  let inicio = conVentas[0];
  let hueco = 0;
  for (let i = 0; i < conVentas.length; i++) {
    const siguiente = conVentas[(i + 1) % conVentas.length];
    const distancia = (siguiente - conVentas[i] + 24) % 24 || 24;
    if (distancia > hueco) {
      hueco = distancia;
      inicio = siguiente;
    }
  }
  // Abierto las 24 horas: no hay hueco que marque el arranque, va el reloj.
  if (hueco <= 1) return Array.from({ length: 24 }, (_, h) => h);
  return Array.from({ length: 24 - (hueco - 1) }, (_, k) => (inicio + k) % 24);
}

/**
 * Cuántas veces cae cada día de la semana en el período (lunes primero). Del
 * 1 al 12 de octubre de 2026 hay dos sábados y un solo martes: sumados, el
 * sábado gana aunque se venda lo mismo, y eso se dice al lado de la barra.
 */
export function vecesPorDia(desde: string, hasta: string): number[] {
  const dias = diasDe(desde, hasta);
  const enteras = Math.floor(dias / 7);
  const resto = dias % 7;
  const primero = (aDia(desde).getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => enteras + ((i - primero + 7) % 7 < resto ? 1 : 0));
}

/** "2 sábados", "1 martes", "ningún domingo". */
export function vecesDelDia(i: number, veces: number): string {
  if (veces === 0) return `ningún ${DIA_UNO[i]}`;
  return `${veces} ${veces === 1 ? DIA_UNO[i] : DIA_VARIOS[i]}`;
}

/** La hora que más vendió (la primera, si empatan). Null sin ventas: el backend tampoco inventa un pico. */
export function horaPico(porHora: readonly number[]): { hora: number; monto: number } | null {
  let mejor: { hora: number; monto: number } | null = null;
  for (let h = 0; h < 24; h++) {
    const monto = porHora[h] ?? 0;
    if (esPositivo(monto) && (!mejor || monto > mejor.monto)) mejor = { hora: h, monto };
  }
  return mejor;
}

/** El día de la semana que más vendió, sumando el período. Null sin ventas. */
export function mejorDia(porDia: HorasApi["porDia"]): { indice: number; monto: number } | null {
  let mejor: { indice: number; monto: number } | null = null;
  for (let i = 0; i < porDia.length; i++) {
    const monto = porDia[i].monto;
    if (esPositivo(monto) && (!mejor || monto > mejor.monto)) mejor = { indice: i, monto };
  }
  return mejor;
}

/** ¿Hubo alguna venta? Sin ventas el reporte es un vacío, no veinticuatro barras en cero. */
export function hayVentas(d: HorasApi): boolean {
  return d.porHora.some((m) => esPositivo(m));
}
