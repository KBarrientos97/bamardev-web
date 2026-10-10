import { useCallback } from "react";
import { aplicaCupo } from "../lib/cupo";
import type { CupoEstado, EstadoLicencia } from "../types";
import { useAuth } from "./AuthContext";

export interface CupoDelNegocio {
  /** El snapshot tal cual, o null. */
  cupo: CupoEstado | null;
  /** ¿Hay cupo que controlar? false = Básico, Profesional o backend viejo. */
  aplica: boolean;
  actualizarCupo: (cupo: CupoEstado | null | undefined) => void;
  /** Pide `GET /monedero`. Falla en silencio: es un refresco, no una acción. */
  refrescarCupo: () => void;
  licencia: EstadoLicencia | null;
}

const nada = () => undefined;

/**
 * El cupo del Plan Emprendedor, para las pantallas (§6.2 W4).
 *
 * Vive aparte de `AuthContext.tsx` y lee todo por `useAuth()` a propósito:
 * muchos tests reemplazan ese módulo entero con un `useAuth` de mentira que no
 * sabe nada de cupo. Así, en esos tests —y con cualquier sesión sin cupo— esto
 * responde "no aplica" y la pantalla se comporta exactamente como antes, sin
 * tener que tocar ni un mock.
 */
export function useCupo(): CupoDelNegocio {
  const auth = useAuth() as Partial<ReturnType<typeof useAuth>>;
  const cupo = auth.cupo ?? null;
  const actualizarCupo = auth.actualizarCupo ?? nada;
  const refrescar = auth.refrescarCupo;
  const refrescarCupo = useCallback(() => {
    void refrescar?.().catch(() => undefined);
  }, [refrescar]);
  return {
    cupo,
    aplica: aplicaCupo(cupo),
    actualizarCupo,
    refrescarCupo,
    licencia: auth.licencia ?? null,
  };
}
