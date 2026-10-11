import type { NombreIcono } from "../../components/Icon";
import type { EstadoVisual } from "./tipos";

/**
 * Los colores por estado de la maqueta (BILLAR_MODULO_SPEC §3). El verde es el
 * del tema del negocio (`primary`): una paleta distinta también pinta el billar.
 */
export interface EstiloEstado {
  etiqueta: string;
  icono: NombreIcono | null;
  /** La tarjeta del tablero. */
  tarjeta: string;
  /** La píldora con el nombre del estado. */
  badge: string;
  /** El cronómetro grande. */
  crono: string;
  /** La rayita de color de la fila en la vista Lista. */
  barra: string;
}

export const ESTADOS: Record<EstadoVisual, EstiloEstado> = {
  libre: {
    etiqueta: "Libre",
    icono: "checkCirculo",
    tarjeta: "border-dashed border-slate-300 bg-white",
    badge: "bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-200",
    crono: "text-texto",
    barra: "bg-primary",
  },
  juego: {
    etiqueta: "En juego",
    icono: null,
    tarjeta: "border-primary/60 bg-primary-50/70",
    badge: "bg-primary-boton text-white",
    crono: "text-texto",
    barra: "bg-primary-boton",
  },
  vence: {
    etiqueta: "Por vencer",
    icono: "relojArena",
    tarjeta: "border-amber-400 bg-amber-50",
    badge: "bg-amber-100 text-amber-800",
    crono: "text-amber-800",
    barra: "bg-amber-500",
  },
  cumplido: {
    etiqueta: "Tiempo cumplido",
    icono: "alert",
    tarjeta: "border-rose-400 bg-rose-50",
    badge: "bg-rose-100 text-rose-700",
    crono: "text-rose-700",
    barra: "bg-rose-500",
  },
  pausada: {
    etiqueta: "Pausada",
    icono: "pausa",
    tarjeta: "border-amber-300 bg-amber-50/60",
    badge: "bg-amber-100 text-amber-800",
    crono: "text-slate-400",
    barra: "bg-amber-300",
  },
  reservada: {
    etiqueta: "Reservada",
    icono: "calendar",
    tarjeta: "border-blue-300 bg-blue-50",
    badge: "bg-blue-100 text-blue-800",
    crono: "text-blue-800",
    barra: "bg-blue-400",
  },
  fuera: {
    etiqueta: "Fuera de servicio",
    icono: "llave",
    tarjeta: "border-slate-200 bg-slate-50",
    badge: "bg-slate-100 text-slate-500",
    crono: "text-slate-400",
    barra: "bg-slate-300",
  },
};
