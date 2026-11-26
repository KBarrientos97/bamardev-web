import { useSyncExternalStore } from "react";
import { apiSeguimiento } from "./api";
import { EVENTO_PAGOS } from "./avisoPagos";

/**
 * El número de «Pagos pendientes» del menú: cuántos pacientes deben un pago.
 * Igual que el de las preinscripciones: sin push, se consulta cada minuto
 * mientras alguien lo mira (un solo reloj por pestaña, nada con la pestaña
 * oculta) y al cargar o corregir algo se refresca con el evento.
 */

export { EVENTO_PAGOS };
const CADA_MS = 60_000;

export type EstadoPagos = {
  deben: number;
  /** ¿El negocio tiene prendidos los avisos de pago? `null` hasta la primera respuesta. */
  avisar: boolean | null;
};

// El MISMO objeto mientras nada cambie: `useSyncExternalStore` lo compara por identidad.
let estado: EstadoPagos = { deben: 0, avisar: null };
let reloj: ReturnType<typeof setInterval> | null = null;
const oyentes = new Set<() => void>();
const SIN_PAGOS: EstadoPagos = { deben: 0, avisar: null };

async function consultar() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  let r;
  try {
    r = await apiSeguimiento.pagosPendientes();
  } catch {
    // Sin red o sin permiso: el menú sigue con lo último que supo.
    return;
  }
  const deben = r.avisarPagos ? r.deben.length : 0;
  if (deben === estado.deben && r.avisarPagos === estado.avisar) return;
  estado = { deben, avisar: r.avisarPagos };
  for (const f of oyentes) f();
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  if (oyentes.size === 1) {
    void consultar();
    reloj = setInterval(() => void consultar(), CADA_MS);
    window.addEventListener(EVENTO_PAGOS, consultar);
  }
  return () => {
    oyentes.delete(avisar);
    if (oyentes.size === 0) {
      if (reloj) clearInterval(reloj);
      reloj = null;
      window.removeEventListener(EVENTO_PAGOS, consultar);
    }
  };
}

const sinSuscripcion = () => () => {};

/** Los que deben un pago (0 y sin consultar si `activo` es falso). */
export function useContadorPagos(activo: boolean): EstadoPagos {
  return useSyncExternalStore(
    activo ? suscribir : sinSuscripcion,
    () => (activo ? estado : SIN_PAGOS),
  );
}

/** Sólo para las pruebas: vuelve al estado de recién abierta la pestaña. */
export function reiniciarContadorPagos() {
  estado = { deben: 0, avisar: null };
}
