import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "../store/AuthContext";
import { alCambiarLaSedeDeCaja, fijarSedeDeCaja, sedeDeCajaGuardada, usaSedeDeCaja } from "./sedeDeCaja";

/**
 * La sede activa de la caja para las pantallas (ver `sedeDeCaja.ts`).
 *
 * - `usa`: ¿rige para este usuario? Sólo la organización con 2+ sucursales; el
 *   cajero atado a una sede, un negocio de un local o una sesión vieja dan
 *   `false` y no ven nada nuevo.
 * - `sede`: la sede elegida en este equipo (o `null` si no eligió: el backend
 *   usa la caja abierta más reciente). Siempre `null` si `usa` es `false`.
 * - `fijar(id)`: la cambia; todas las pantallas que la leen se enteran.
 */
export function useSedeDeCaja() {
  const { usuario, negocio } = useAuth();
  const sesion = { usuario, negocio };
  const usa = usaSedeDeCaja(sesion);
  const sede = useSyncExternalStore(
    alCambiarLaSedeDeCaja,
    () => (usa ? sedeDeCajaGuardada(sesion) : null),
    () => null,
  );
  const id = usuario?.id;
  const negocioId = negocio?.id;
  // La sesión se arma de nuevo en cada render; `fijar` sólo depende de quién es.
  const fijar = useCallback(
    (nueva: number | null) => {
      if (id == null || negocioId == null) return;
      fijarSedeDeCaja({ usuario: { id, sucursalId: null }, negocio: { id: negocioId } }, nueva);
    },
    [id, negocioId],
  );
  return { usa, sede, fijar };
}
