import {
  editaFichaTecnica,
  veFichaTecnica,
  veInsumosCita,
  type ContextoExtras,
} from "../../lib/belleza/capacidades";
import { useExtras } from "../../lib/belleza/useExtras";
import { Rotulo } from "../agenda/piezas";
import FichaTecnicaSeccion from "./FichaTecnica";
import InsumosCita from "./InsumosCita";

/**
 * Lo de la fase 4 que se enchufa en el detalle de la cita: los insumos que
 * gastó y la ficha técnica del cliente. Cada bloque sale sólo con su feature
 * y su permiso; fuera de belleza (o sin la feature) no se dibuja nada, así el
 * detalle de la cita queda exactamente como estaba.
 *
 * El contexto lo pasa el detalle (que ya lee la sesión con `useAuth`).
 */
export function ExtrasCita({ citaId, ctx }: { citaId: number; ctx: ContextoExtras }) {
  const insumos = veInsumosCita(ctx);
  const ficha = veFichaTecnica(ctx);
  if (!insumos && !ficha) return null;
  return (
    <>
      {insumos && (
        <InsumosCita citaId={citaId} titulo={(accion) => <Rotulo accion={accion}>Insumos usados</Rotulo>} />
      )}
      {ficha && (
        <FichaTecnicaSeccion
          citaId={citaId}
          puedeEditar={editaFichaTecnica(ctx)}
          titulo={(accion) => <Rotulo accion={accion}>Ficha técnica</Rotulo>}
        />
      )}
    </>
  );
}

/** La ficha técnica dentro de la ficha del cliente (A7). */
export function FichaTecnicaCliente({ clienteId }: { clienteId: number }) {
  const ctx = useExtras();
  if (!ctx || !veFichaTecnica(ctx)) return null;
  return (
    <FichaTecnicaSeccion
      clienteId={clienteId}
      puedeEditar={editaFichaTecnica(ctx)}
      titulo={(accion) => <Rotulo accion={accion}>Ficha técnica</Rotulo>}
    />
  );
}
