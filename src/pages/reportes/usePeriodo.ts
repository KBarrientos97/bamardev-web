import { useCallback, useState } from "react";
import { excedeTope, NOMBRE_PRESET, periodoDe, rangoElegido, type Periodo, type Preset } from "./periodo";

const CLAVE_PERIODO = "bamardev_reportes_periodo";

/**
 * El período elegido, guardado en la pestaña: recargar la página o volver de
 * otra sección no lo pierde (como en la app, 242b57f). Un preset se recalcula
 * al día de hoy —"Semana" guardada ayer es la semana de hoy—; sólo el rango
 * elegido a mano queda con sus fechas. Arranca en el mes en curso: el dueño
 * piensa los números por mes (alquiler, sueldos y luz caen una vez al mes).
 *
 * Con `corteMin` (un billar) "hoy" es la jornada que corre (ver `periodoDe`).
 * `clave` separa lo guardado de cada pantalla (los reportes del instituto
 * recuerdan el suyo).
 */
export function usePeriodo(corteMin: number, clave = CLAVE_PERIODO): [Periodo, (p: Periodo) => void] {
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    try {
      const guardado = JSON.parse(sessionStorage.getItem(clave) ?? "null") as Periodo | null;
      // Un rango guardado antes del tope de 3 meses (o un "Año", que ya no
      // existe) no se reabre: arranca en el mes, como la primera vez.
      if (guardado?.preset === "rango" && guardado.desde && guardado.hasta && !excedeTope(guardado.desde, guardado.hasta)) {
        return rangoElegido(guardado.desde, guardado.hasta);
      }
      if (guardado?.preset && guardado.preset !== "rango" && guardado.preset in NOMBRE_PRESET) {
        return periodoDe(guardado.preset as Exclude<Preset, "rango">, new Date(), corteMin);
      }
    } catch {
      // Sin almacenamiento (ventana privada, bloqueado): arranca en el mes.
    }
    return periodoDe("mes", new Date(), corteMin);
  });
  const cambiar = useCallback((p: Periodo) => {
    setPeriodo(p);
    try {
      sessionStorage.setItem(clave, JSON.stringify(p));
    } catch {
      // Ídem: el período se usa igual, sólo no se recuerda.
    }
  }, [clave]);
  return [periodo, cambiar];
}
