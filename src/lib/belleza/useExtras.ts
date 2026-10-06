import { useAuthOpcional } from "../../store/AuthContext";
import type { ContextoExtras } from "./capacidades";

/**
 * El contexto de las capacidades de la fase 4, o null sin sesión (una
 * pantalla montada suelta, como en sus tests): sin sesión no se dibuja nada.
 */
export function useExtras(): ContextoExtras | null {
  const auth = useAuthOpcional();
  if (!auth) return null;
  return {
    features: auth.negocio?.features ?? null,
    rubro: auth.negocio?.tipoNegocio ?? null,
    usuario: auth.usuario,
  };
}
