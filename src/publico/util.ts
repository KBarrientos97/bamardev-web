import { createContext, useContext } from "react";
import { horaNegocio } from "../lib/agenda/horaAgenda";
import type { NegocioPublico } from "./apiReserva";

/**
 * Lo que no es componente de la página pública (aparte de `piezas.tsx` para
 * que el refresco en caliente de Vite siga funcionando).
 */

/** Dónde vive cada página. Un solo lugar para mudarla a `link.bamardev.com`. */
export function rutaPublica(subdominio: string, resto = ""): string {
  return `/r/${subdominio}${resto}`;
}

/** El negocio que cargó la ruta `/r/:subdominio`, para todas sus páginas. */
export interface ContextoNegocio {
  sub: string;
  datos: NegocioPublico | null;
  cargando: boolean;
  error: string;
  /** El 404 genérico (P8): sin la feature, suspendido o sin nada publicado. */
  noDisponible: boolean;
}

export const NegocioCtx = createContext<ContextoNegocio>({
  sub: "",
  datos: null,
  cargando: true,
  error: "",
  noDisponible: false,
});

export const useNegocioPublico = () => useContext(NegocioCtx);

/** "Bs 50" o "Bs 52,50". */
export function precioTexto(n: number): string {
  return `Bs ${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")}`;
}

/** Enlace a Google Maps buscando el lugar por nombre y dirección. */
export function enlaceMapa(nombre: string, direccion: string | null | undefined): string | null {
  if (!direccion) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${nombre}, ${direccion}`)}`;
}

/** Guarda el último enlace de gestión en este teléfono (para "Ver mi reserva"). */
export const ultimaReserva = {
  clave: (sub: string) => `bamardev_reserva_${sub}`,
  leer(sub: string): string | null {
    try {
      return localStorage.getItem(this.clave(sub));
    } catch {
      return null;
    }
  },
  guardar(sub: string, token: string) {
    try {
      localStorage.setItem(this.clave(sub), token);
    } catch {
      /* modo privado: se pierde el atajo, la reserva igual quedó */
    }
  },
};

/** "09:30" → "9:30", como en el lienzo. */
export function horaCorta(iso: string): string {
  return horaNegocio(iso).replace(/^0/, "");
}
