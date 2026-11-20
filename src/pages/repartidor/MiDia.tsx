import { Boton, Modal, Vacio } from "../../components/ui";
import { fmtPlata } from "../../lib/format";
import { horaSinCortes } from "../../lib/repartoRendicion";
import type { ReporteDelDia } from "./reporteDelDia";

/**
 * «Mi día»: el reporte corto del repartidor (20-nov). Se abre tocando la
 * tarjeta de los pedidos, así no le saca lugar a la lista de entregas.
 *
 * Es de HOY, desde las 6:00: es lo que trae «Mis entregas». La semana
 * necesita que el backend mande días anteriores (pendiente). Y dice «Envío
 * cobrado» a propósito: es la tarifa que pagó el cliente; lo que el negocio le
 * paga al repartidor por viaje el sistema no lo sabe.
 */
export default function MiDia({ reporte, onClose }: { reporte: ReporteDelDia; onClose: () => void }) {
  const { entregados, enCamino, envioCobrado, filas } = reporte;
  return (
    <Modal
      abierto
      titulo="Mi día"
      subtitulo="Hoy, desde las 6:00"
      onClose={onClose}
      acciones={
        <Boton className="min-h-11 w-full sm:w-auto" onClick={onClose}>
          Listo
        </Boton>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-primary-50 px-3.5 py-3 text-primary-700">
            <dt className="text-xs font-semibold">Pedidos llevados</dt>
            <dd className="text-2xl font-extrabold">{entregados}</dd>
            {enCamino > 0 && <dd className="text-xs">{enCamino === 1 ? "1 en camino" : `${enCamino} en camino`}</dd>}
          </div>
          <div className="rounded-xl bg-muted px-3.5 py-3">
            <dt className="text-xs font-semibold text-texto-3">Envío cobrado</dt>
            <dd className="text-2xl font-extrabold text-texto">{fmtPlata(envioCobrado)}</dd>
          </div>
        </dl>

        {filas.length === 0 ? (
          <Vacio
            icono="truck"
            titulo="Todavía no entregaste pedidos hoy"
            texto="Cada pedido que entregues aparece acá con su envío."
          />
        ) : (
          <section aria-label="Pedidos de hoy">
            <ul className="divide-y divide-borde-soft">
              {filas.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-texto">
                      {f.numero} · {f.cliente}
                    </p>
                    <p className="text-xs text-texto-3">
                      {horaSinCortes(f.entregadoEn)} · {f.pago}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-bold text-texto">{fmtPlata(f.envio)}</p>
                    <p className="text-[11px] text-texto-4">envío</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-1 flex items-center justify-between border-t border-borde pt-2.5 text-sm font-extrabold text-texto">
              <span>Total de envíos cobrados</span>
              <span>{fmtPlata(envioCobrado)}</span>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
