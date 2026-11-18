import { esPositivo } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import { delRepartidor } from "../../lib/repartoRendicion";
import { useApi } from "../../lib/useApi";
import LoQueLlevo from "../reparto/LoQueLlevo";
import { pedirRendicionSiHay } from "../reparto/pedirRendicion";

/**
 * Lo que suma la rendición del repartidor con el cuadre de la caja (18-nov):
 * qué llevó por categoría y, con «Controlar la plata de los repartidores»
 * prendido, cuánto ya entregó a la caja y cuánto le falta. Sale de
 * `GET /reparto/rendicion`, que al repartidor le manda sólo lo suyo: es el
 * mismo número que la cajera ve en «Repartidores», así que no se recalcula.
 *
 * Es un agregado: un backend anterior, sin permiso o sin señal, no dibuja nada
 * y la rendición queda como siempre.
 */
export default function CuadreConLaCaja({ usuarioId }: { usuarioId: number | null | undefined }) {
  const rendicion = useApi(() => pedirRendicionSiHay(), []);
  const r = rendicion.datos;
  const mio = delRepartidor(r, usuarioId);
  if (!r || !mio) return null;
  const falta = mio.pendiente;
  return (
    <div className="space-y-3">
      {r.activa && (
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-muted px-3 py-2.5">
            <dt className="text-xs text-texto-3">Ya entregaste a la caja</dt>
            <dd className="text-[13px] font-bold text-texto">{fmtMoney(mio.recibido)}</dd>
          </div>
          <div className={`rounded-xl px-3 py-2.5 ${esPositivo(falta) ? "bg-warning-bg text-warning-text" : "bg-primary-50 text-primary-700"}`}>
            <dt className="text-xs font-semibold">Te falta entregar</dt>
            <dd className="text-base font-extrabold">{fmtMoney(falta)}</dd>
          </div>
        </dl>
      )}
      <LoQueLlevo productos={mio.productos} etiqueta="Lo que llevaste" />
    </div>
  );
}
