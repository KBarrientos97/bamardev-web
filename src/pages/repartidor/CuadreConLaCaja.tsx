import { esPositivo } from "../../lib/dinero";
import { fmtPlata } from "../../lib/format";
import { aEntregarDelRepartidor, delRepartidor, type RendicionReparto } from "../../lib/repartoRendicion";
import LoQueLlevo from "../reparto/LoQueLlevo";

/**
 * Lo que suma la rendición del repartidor con el cuadre de la caja (18-nov):
 * qué llevó por categoría y, con «Controlar la plata de los repartidores»
 * prendido, cuánto ya entregó a la caja y cuánto le falta. Sale de
 * `GET /reparto/rendicion` (lo pide `Repartidor`, que con el mismo número
 * arma «A rendir» y «A entregar al negocio»), que al repartidor le manda sólo
 * lo suyo: es el mismo número que la cajera ve en «Repartidores».
 *
 * Es un agregado: sin la rendición (backend anterior, sin permiso o sin señal)
 * no dibuja nada y la rendición queda como siempre.
 */
export default function CuadreConLaCaja({
  rendicion: r,
  usuarioId,
}: {
  rendicion: RendicionReparto | null | undefined;
  usuarioId: number | null | undefined;
}) {
  const mio = delRepartidor(r, usuarioId);
  if (!r || !mio) return null;
  // El mismo número que el cartel de arriba y «A rendir»: nunca se contradicen.
  const falta = aEntregarDelRepartidor(r, usuarioId) ?? mio.pendiente;
  return (
    <div className="space-y-3">
      {r.activa && (
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-muted px-3 py-2.5">
            <dt className="text-xs text-texto-3">Ya entregaste a la caja</dt>
            <dd className="text-[13px] font-bold text-texto">{fmtPlata(mio.recibido)}</dd>
          </div>
          <div className={`rounded-xl px-3 py-2.5 ${esPositivo(falta) ? "bg-warning-bg text-warning-text" : "bg-primary-50 text-primary-700"}`}>
            <dt className="text-xs font-semibold">Te falta entregar</dt>
            <dd className="text-base font-extrabold">{fmtPlata(falta)}</dd>
          </div>
        </dl>
      )}
      <LoQueLlevo productos={mio.productos} etiqueta="Lo que llevaste" />
    </div>
  );
}
