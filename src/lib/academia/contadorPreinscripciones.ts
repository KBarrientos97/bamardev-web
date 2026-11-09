import { useSyncExternalStore } from "react";
import { apiAcademia } from "./apiAcademia";

/**
 * El contador de preinscripciones del menú (E20 cuelga de Alumnos con su
 * número), igual que el de las solicitudes online de belleza: sin push, se
 * consulta cada minuto mientras la app está abierta, con un solo reloj aunque
 * el menú esté montado dos veces. La bandeja avisa con el evento al inscribir
 * o descartar, así el número baja en el acto.
 *
 * Desde el 08-nov suma los comprobantes de los pagos en línea que esperan
 * revisión, para quien tiene `academia.pagos_en_linea`: la bandeja vive en la
 * misma pantalla y la recepción tiene que ver que algo llegó sin entrar a
 * buscarlo. Es otro contador (otro permiso, otro endpoint) que se suma en el
 * menú.
 */

export const EVENTO_PREINSCRIPCIONES = "preinscripciones-cambiaron";
const CADA_MS = 60_000;

/** Un número del menú que se refresca solo, con un único reloj por pestaña. */
function contador(pedir: () => Promise<number>) {
  let valor = 0;
  let reloj: ReturnType<typeof setInterval> | null = null;
  const oyentes = new Set<() => void>();

  async function consultar() {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      valor = await pedir();
    } catch {
      // Sin red, sin la feature o sin el permiso: el menú sigue con lo último que supo.
      return;
    }
    for (const f of oyentes) f();
  }

  function suscribir(avisar: () => void) {
    oyentes.add(avisar);
    if (oyentes.size === 1) {
      void consultar();
      reloj = setInterval(() => void consultar(), CADA_MS);
      window.addEventListener(EVENTO_PREINSCRIPCIONES, consultar);
    }
    return () => {
      oyentes.delete(avisar);
      if (oyentes.size === 0) {
        if (reloj) clearInterval(reloj);
        reloj = null;
        window.removeEventListener(EVENTO_PREINSCRIPCIONES, consultar);
      }
    };
  }

  return { suscribir, leer: () => valor };
}

const preinscripciones = contador(async () => (await apiAcademia.preinscripciones({ pageSize: 1 })).total);
const pagosPorRevisar = contador(async () => (await apiAcademia.pagosPorRevisar()).total);

const sinSuscripcion = () => () => {};

/**
 * Lo que espera en «Inscripciones online»: las preinscripciones por atender y,
 * con `conPagos`, los comprobantes por revisar. 0 (y sin consultar) si la
 * sección no se ve.
 */
export function useContadorPreinscripciones(activo: boolean, conPagos = false): number {
  const n = useSyncExternalStore(activo ? preinscripciones.suscribir : sinSuscripcion, () =>
    activo ? preinscripciones.leer() : 0,
  );
  const pagos = useSyncExternalStore(activo && conPagos ? pagosPorRevisar.suscribir : sinSuscripcion, () =>
    activo && conPagos ? pagosPorRevisar.leer() : 0,
  );
  return n + pagos;
}
