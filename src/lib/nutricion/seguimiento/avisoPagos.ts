/**
 * El aviso de que los pagos pendientes del seguimiento pueden haber cambiado
 * (se inició un tratamiento, se cargó o corrigió una semana, se cambiaron los
 * ajustes…). Vive aparte para que `api.ts` y el contador no se importen entre sí.
 */
export const EVENTO_PAGOS = "pagos-nutricion-cambiaron";

export function avisarPagosCambiaron() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_PAGOS));
}
