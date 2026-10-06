import { createContext, useContext } from "react";
import { horaNegocio } from "../lib/agenda/horaAgenda";
import { enHostLink } from "../lib/pagina/rutas";
import type { NegocioPublico, ProfesionalPublico, ServicioPublico } from "./apiReserva";

/**
 * Lo que no es componente de la página pública (aparte de `piezas.tsx` para
 * que el refresco en caliente de Vite siga funcionando).
 */

/**
 * Dónde vive cada página: `/r/<sub>…` en la app y `/<sub>…` en
 * `link.bamardev.com` (ver `lib/pagina/link.ts`). Sin `resto`, en el host link
 * es la página del negocio: la portada mínima de la reserva no existe ahí.
 */
export function rutaPublica(subdominio: string, resto = ""): string {
  return enHostLink() ? `/${subdominio}${resto}` : `/r/${subdominio}${resto}`;
}

/** El negocio que cargó la ruta `/r/:subdominio` (o `link…/:subdominio`), para todas sus páginas. */
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

/**
 * Lo que dura y cuesta lo elegido (QA N2-06). Con un profesional, lo SUYO
 * (precio y duración propios, como se crea la cita y se cobra); con
 * "cualquiera", lo más barato y lo más corto, y `desde` si alguno cobra o
 * tarda distinto.
 */
export function cuentaReserva(
  servicios: ServicioPublico[],
  profesional: ProfesionalPublico | null | undefined,
): { duracion: number; precio: number; desde: boolean } {
  let duracion = 0;
  let precio = 0;
  let desde = false;
  for (const s of servicios) {
    const propio = profesional?.servicios?.find((x) => x.servicioId === s.id);
    if (propio) {
      duracion += propio.duracionMin;
      precio += propio.precio ?? s.precio ?? 0;
      continue;
    }
    duracion += profesional ? s.duracionMin : (s.duracionDesde ?? s.duracionMin);
    precio += profesional ? (s.precio ?? 0) : (s.precioDesde ?? s.precio ?? 0);
    if (
      !profesional &&
      ((s.precioHasta ?? s.precioDesde) !== s.precioDesde || (s.duracionHasta ?? s.duracionDesde) !== s.duracionDesde)
    ) {
      desde = true;
    }
  }
  return { duracion, precio, desde };
}

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

/** Versión de la plantilla de privacidad (legal/PRIVACIDAD-CLIENTE-FINAL.md). La reserva usa la que manda el backend. */
export const VERSION_POLITICA = "v0.1";

/** Cómo escribirle al negocio desde su política de privacidad. */
export interface ContactoNegocio {
  texto: string;
  url: string;
}

/** "70123456" → "al 70123456" con su `tel:`. */
export function contactoPorTelefono(telefono: string | null | undefined): ContactoNegocio | null {
  if (!telefono?.trim()) return null;
  const limpio = telefono.trim();
  return { texto: `al ${limpio}`, url: `tel:${limpio.replace(/[^\d+]/g, "")}` };
}
