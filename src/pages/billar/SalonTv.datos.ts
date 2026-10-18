import { fmtMoney } from "../../lib/format";
import {
  cuentaDe,
  estadoVisual,
  fmtCrono,
  fmtHace,
  horaDe,
  PAUSA_LARGA_SEG,
  promoPara,
  segundosEnPausa,
  tarifaDe,
} from "./calculo";
import type { EstadoVisual, Mesa, TipoMesa } from "./tipos";
import type { VistaMesa } from "./vista";

/**
 * Lo que dibuja la pantalla del salón (§7.11), sin nada de la sesión: lo usan
 * la TV con el cajero logueado (PantallaSalon.tsx) y la TV pública, que entra
 * con la llave y no tiene ni sesión ni store (publico/tv). Por eso acá no se
 * importa `store.ts` ni `lib/api.ts`: la página pública no puede arrastrar la
 * app (ver separacion.test.ts).
 */

/** Los colores de la TV por estado: el paño oscuro del billar, con letra clara. */
export const ESTILO_TV: Record<EstadoVisual, { caja: string; pill: string; etiqueta: string }> = {
  libre: { caja: "border-emerald-400 bg-[#0B4A33]", pill: "bg-emerald-300 text-emerald-950", etiqueta: "Libre" },
  juego: { caja: "border-emerald-800 bg-[#0A3627]", pill: "bg-emerald-400 text-emerald-950", etiqueta: "En juego" },
  vence: { caja: "border-amber-400 bg-[#4A3306]", pill: "bg-amber-400 text-amber-950", etiqueta: "Por vencer" },
  cumplido: {
    caja: "border-rose-400 bg-[#4C1020] animate-pulse",
    pill: "bg-rose-400 text-rose-950",
    etiqueta: "Tiempo cumplido",
  },
  pausada: { caja: "border-white/10 bg-[#0A3627]/70", pill: "bg-white/15 text-white/80", etiqueta: "Pausada" },
  reservada: { caja: "border-blue-300 bg-[#122A55]", pill: "bg-blue-300 text-blue-950", etiqueta: "Reservada" },
  fuera: { caja: "border-white/5 bg-[#0A3627]/40", pill: "bg-white/10 text-white/50", etiqueta: "Fuera de servicio" },
};

/** "09:40 p. m." → ["09:40", "p. m."]: el sufijo va más chico. */
export function partirHora(texto: string): [string, string] {
  const i = texto.indexOf(" ");
  return i < 0 ? [texto, ""] : [texto.slice(0, i), texto.slice(i + 1)];
}

/** Lo que dice cada tarjeta: el número grande, la línea de abajo y la barra del tiempo fijo. */
export interface ContenidoTarjeta {
  grande: string;
  chico: string;
  /** De 0 a 1, lo que queda del tiempo fijo; null si no hay barra. */
  progreso: number | null;
  color: string;
}

export function contenidoTarjeta(v: VistaMesa): ContenidoTarjeta {
  const s = v.mesa.sesion;
  const c = v.cuenta;
  if (c && s) {
    let grande: string;
    let chico: string;
    let progreso: number | null = null;
    let color = "text-white";
    if (s.prepago && c.restante !== null) {
      const horas = s.prepago.min / 60;
      if (c.restante > 0) {
        grande = fmtCrono(c.restante);
        chico = `Le quedan · tiempo fijo ${horas} h`;
        progreso = Math.max(0, Math.min(1, c.restante / (s.prepago.min * 60)));
      } else {
        grande = `+${fmtCrono(-c.restante)}`;
        chico = "Tiempo cumplido · pasá por caja";
      }
    } else {
      grande = fmtCrono(c.secs);
      chico = "Tiempo jugado · libre";
    }
    if (v.estado === "vence") color = "text-amber-300";
    if (v.estado === "cumplido") color = "text-rose-300";
    if (v.estado === "pausada") {
      // Cuánto lleva, a la vista del salón: una pausa larga se ve (17-oct).
      const larga = (v.pausaSeg ?? 0) >= PAUSA_LARGA_SEG;
      color = larga ? "text-amber-300" : "text-white/50";
      chico = v.pausaSeg != null ? `Pausada · hace ${fmtHace(v.pausaSeg * 1000)}` : "Pausada";
    }
    return { grande, chico, progreso, color };
  }
  if (v.estado === "libre") {
    return { grande: "LIBRE", chico: `${v.tipo.nombre} · ${fmtMoney(v.tipo.tarifa)}/h`, progreso: null, color: "text-white" };
  }
  if (v.estado === "reservada" && v.mesa.reserva) {
    // Sin el nombre de quién reservó, a propósito: la TV está a la vista de
    // todo el salón y la pública la abre cualquiera que tenga el enlace. La
    // hora es lo que necesita el que quiere jugar.
    const hora = horaDe(v.mesa.reserva.hora);
    return { grande: partirHora(hora)[0], chico: `Reservada para las ${hora}`, progreso: null, color: "text-white" };
  }
  return { grande: "—", chico: "Fuera de servicio", progreso: null, color: "text-white/40" };
}

/**
 * La línea de arriba: cuántas mesas libres. Sin mesas todavía (cargando, o
 * falló) va vacía: "Todas las mesas ocupadas" se leía en la tele mientras
 * cargaba.
 */
export function textoLibres(cargado: boolean, vistas: VistaMesa[]): string {
  if (!cargado || vistas.length === 0) return " ";
  const libres = vistas.filter((v) => v.estado === "libre").length;
  if (libres === 0) return "Todas las mesas ocupadas";
  return `${libres} ${libres === 1 ? "mesa libre" : "mesas libres"} · pedila en caja`;
}

/** Una tarifa del pie: "Pool Bs 20,00/h · 1 h Bs 20,00 · 2 h Bs 40,00" y la promo que corre. */
export function lineaTarifa(t: TipoMesa): { precios: string; promo: string | null } {
  const promo = promoPara(t, Number.POSITIVE_INFINITY);
  return {
    precios: `${fmtMoney(t.tarifa)}/h${t.paquetes.map((p) => ` · ${p.h} h ${fmtMoney(p.precio)}`).join("")}`,
    promo: promo ? `${promo.nombre} −${promo.pct} %` : null,
  };
}

/** Mientras no llegan los tipos (o si el tipo se borró): nada se cobra con esto. */
const TIPO_VACIO: TipoMesa = {
  id: "",
  nombre: "Mesa",
  tarifa: 0,
  fraccion: 15,
  tolerancia: 0,
  minimo: 0,
  paquetes: [],
  promos: [],
};

/**
 * Una mesa como la dibuja la TV, sin el store: lo mismo que `vistaDe`
 * (vista.ts) con los tipos y los avisos que llegaron en la respuesta pública.
 * La tarifa es la de la sesión si la trae, si no la propia de la mesa o la de
 * su tipo: la que se lee en la tarjeta "Libre".
 */
export function vistaSalon(mesa: Mesa, tipos: Record<string, TipoMesa>, avisos: number[], ahora: number): VistaMesa {
  const tipo = mesa.sesion?.tarifa ?? tarifaDe(mesa, tipos[mesa.tipo] ?? Object.values(tipos)[0] ?? TIPO_VACIO);
  return {
    mesa,
    tipo,
    estado: estadoVisual(mesa, ahora, avisos),
    cuenta: mesa.estado === "abierta" && mesa.sesion ? cuentaDe(mesa.sesion, tipo, ahora) : null,
    // La TV no anula nada.
    anulable: false,
    pausaSeg: segundosEnPausa(mesa, ahora),
  };
}
