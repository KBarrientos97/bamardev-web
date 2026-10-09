import { useCallback, useEffect } from "react";
import { useCupo } from "../store/useCupo";
import type { ConsumoVista, UnidadCupo } from "../types";
import { cupoDelError, esCupoAgotado, proyectar } from "./cupo";
import { abrirHojaCupo } from "./hojaCupo";

export interface BloqueoCupo {
  /** ¿Hay cupo que controlar en este negocio? */
  aplica: boolean;
  /**
   * Antes de mandar una venta o una cita: true = adelante. false = no queda
   * lugar ni créditos; ya se abrió la hoja de compra (o se avisó, ver
   * `abrirHoja`) y NO hay que llamar al servidor.
   */
  verificar: () => boolean;
  /**
   * En el `catch`: true si el error era el 403 `CUPO_AGOTADO` (otro equipo
   * vendió antes). El snapshot queda con el cupo que mandó el servidor y la
   * hoja se abre; la pantalla no tiene que mostrar el error como una falla.
   */
  manejarError: (e: unknown) => boolean;
  /** Después de crear: guarda `consumo.cupo` o, si no vino, lo pide de nuevo. */
  registrar: (respuesta: { consumo?: ConsumoVista } | null | undefined) => void;
}

/**
 * El chequeo de cupo de una pantalla que vende o agenda (§5.1).
 *
 * Con un negocio sin cupo (Básico, Profesional) todo esto es transparente:
 * `verificar` siempre deja pasar, `registrar` no pide nada y no hay ningún
 * request de más. Es lo que garantiza que Omar no vea ningún cambio.
 *
 * `abrirHoja: false` es para Solicitudes: ahí el plan pide un aviso con el
 * botón de comprar en vez de abrir la hoja sola.
 */
export function useBloqueoCupo(
  unidad: UnidadCupo,
  opts: { refrescarAlMontar?: boolean; abrirHoja?: boolean } = {},
): BloqueoCupo {
  const { cupo, aplica, actualizarCupo, refrescarCupo } = useCupo();
  const { refrescarAlMontar = false, abrirHoja = true } = opts;

  // El POS pide el contador al montarse (§5.2): el del login puede ser de
  // hace horas, y otro equipo pudo haber vendido mientras tanto. Sólo con
  // cupo: un negocio sin él no hace ni este pedido.
  useEffect(() => {
    if (refrescarAlMontar && aplica) refrescarCupo();
    // Una vez por pantalla: si `aplica` cambia en el medio, el chequeo de
    // licencia ya trae el contador fresco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verificar = useCallback(() => {
    if (!aplica) return true;
    if (proyectar(cupo, unidad).puede) return true;
    if (abrirHoja) abrirHojaCupo({ unidad, agotado: true });
    return false;
  }, [aplica, cupo, unidad, abrirHoja]);

  const manejarError = useCallback(
    (e: unknown) => {
      if (!esCupoAgotado(e)) return false;
      const delServidor = cupoDelError(e);
      if (delServidor) actualizarCupo(delServidor);
      if (abrirHoja) abrirHojaCupo({ unidad, agotado: true });
      return true;
    },
    [actualizarCupo, unidad, abrirHoja],
  );

  const registrar = useCallback(
    (respuesta: { consumo?: ConsumoVista } | null | undefined) => {
      if (respuesta?.consumo?.cupo) actualizarCupo(respuesta.consumo.cupo);
      // Sin `consumo` en un negocio con cupo es un reintento idempotente (el
      // backend no lo repite): el contador se pide aparte para no quedar atrás.
      else if (aplica) refrescarCupo();
    },
    [actualizarCupo, refrescarCupo, aplica],
  );

  return { aplica, verificar, manejarError, registrar };
}
