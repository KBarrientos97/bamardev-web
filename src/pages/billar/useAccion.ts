import { useCallback, useRef, useState } from "react";
import { ApiError } from "../../lib/api";
import { recargar } from "./store";

/**
 * Lo que el servidor contesta cuando la mesa ya no está como la ve la pantalla.
 * MONTO_DISTINTO también ("se cobra Bs X, no Bs Y"): sin el tablero nuevo, el
 * rojo quedaba debajo de una cuenta que seguía siendo la vieja (revisión del
 * 18-oct).
 */
const MESA_DESACTUALIZADA = new Set(["MESA_CAMBIO", "MESA_OCUPADA", "MESA_CERRADA", "MESA_INACTIVA", "MONTO_DISTINTO"]);

/**
 * Un botón que llama al backend. Mientras espera no se puede volver a tocar
 * (el doble toque en el celular cobraba dos veces en la maqueta), y si el
 * servidor dice que no, el mensaje queda a la vista y el diálogo sigue
 * abierto con lo que se cargó.
 *
 * Si el "no" es porque la mesa cambió (otra caja cargó un consumo, la cobró o
 * la movió), se trae el tablero enseguida: la pantalla tiene que mostrar lo de
 * verdad antes de que el cajero reintente.
 */
export function useAccion() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  /** El `codigo` del último "no" del servidor (MESA_CAMBIO, CAJA_CERRADA…). */
  const [codigo, setCodigo] = useState<string | null>(null);
  const enCurso = useRef(false);

  /**
   * true si salió bien. `alFallar` ve el error antes que nadie: si devuelve
   * true ya lo resolvió de otra forma (el 403 `CUPO_AGOTADO` abre la hoja de
   * comprar créditos) y no queda ningún cartel rojo, porque no es una falla.
   */
  const ejecutar = useCallback(async (fn: () => Promise<unknown>, alFallar?: (err: unknown) => boolean): Promise<boolean> => {
    if (enCurso.current) return false;
    enCurso.current = true;
    setEnviando(true);
    setError("");
    setCodigo(null);
    try {
      await fn();
      return true;
    } catch (err) {
      if (alFallar?.(err)) return false;
      setError(err instanceof Error && err.message ? err.message : "No se pudo completar. Probá de nuevo.");
      setCodigo(err instanceof ApiError ? (err.codigo ?? null) : null);
      if (err instanceof ApiError && (MESA_DESACTUALIZADA.has(err.codigo ?? "") || err.status === 404)) {
        void recargar(true);
      }
      return false;
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  }, []);

  return { ejecutar, enviando, error, setError, codigo };
}
