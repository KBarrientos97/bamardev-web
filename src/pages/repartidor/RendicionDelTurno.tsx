import { Boton, Modal, Vacio } from "../../components/ui";
import { aCentavos, esPositivo } from "../../lib/dinero";
import { fmtPlata } from "../../lib/format";
import { delRepartidor, estadoEnLaCaja, horaSinCortes, type RendicionReparto } from "../../lib/repartoRendicion";
import type { Venta } from "../../types";
import CuadreConLaCaja from "./CuadreConLaCaja";
import { cobradoPorQr } from "./rendicion";

/**
 * La rendición del turno del repartidor, en una hoja (en el celular sube desde
 * abajo y se baja con el dedo: es el `Modal` de siempre).
 *
 * Arriba, grande, lo único que tiene que hacer: cuánto efectivo entregar.
 * Abajo, de qué pedido sale cada peso (efectivo, QR, su envío) y, si la caja
 * controla la plata, quién la recibió y cuándo (20-nov, pedido del dueño). Los
 * números son los mismos de siempre: acá sólo cambia cómo se leen.
 */
export default function RendicionDelTurno({
  entregadas,
  aRendir,
  porQr,
  tarifas,
  cuadre,
  usuarioId,
  onClose,
}: {
  entregadas: Venta[];
  /** El efectivo que falta entregar: el del cuadre con la caja si cargó. */
  aRendir: number;
  porQr: number;
  tarifas: number;
  cuadre: RendicionReparto | null | undefined;
  usuarioId: number | null | undefined;
  onClose: () => void;
}) {
  // Lo que la caja sabe de cada pedido, para decir en su renglón dónde está la plata.
  const enLaCaja = new Map((delRepartidor(cuadre, usuarioId)?.entregas ?? []).map((e) => [e.ventaId, e]));

  return (
    <Modal
      abierto
      titulo="Rendición del turno"
      subtitulo={`${entregadas.length} ${entregadas.length === 1 ? "entrega" : "entregas"}`}
      onClose={onClose}
      acciones={
        <Boton className="min-h-11 w-full sm:w-auto" onClick={onClose}>
          Entendido
        </Boton>
      }
    >
      <div className="space-y-4">
        {/* Sólo el efectivo: lo cobrado por QR ya entró a la cuenta del
            negocio y el repartidor no lo tiene en la mano (BUG-pedidos-3).
            `primary-boton` y no `bg-marca`: es el tono del negocio que da
            contraste con texto blanco (el verde de marca son 2.54:1). */}
        <div className="rounded-2xl bg-primary-boton p-5 text-center text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/90">A entregar al negocio</p>
          {/* Con el cuadre de la caja, lo que todavía no le entregó: el
              mismo número que «Te falta entregar» (QA 18-nov). */}
          <p className="mt-1 text-4xl font-extrabold tracking-tight">{fmtPlata(aRendir)}</p>
          <p className="mt-0.5 text-xs text-white/90">en efectivo</p>
        </div>

        {/* 18-nov: cuánto ya recibió la caja, cuánto falta y qué llevó. */}
        <CuadreConLaCaja rendicion={cuadre} usuarioId={usuarioId} />

        {/* Con QR, a dónde fue cada parte: sin esto lo cobrado no cierra
            con lo que se entrega y parece que falta plata. */}
        {esPositivo(porQr) && (
          <>
            <dl className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-muted px-3 py-2.5">
                <dt className="text-xs text-texto-3">Efectivo en mano</dt>
                <dd className="text-[15px] font-bold text-texto">{fmtPlata(aRendir)}</dd>
              </div>
              <div className="rounded-xl bg-muted px-3 py-2.5">
                <dt className="text-xs text-texto-3">Ya cobrado por QR</dt>
                <dd className="text-[15px] font-bold text-texto">{fmtPlata(porQr)}</dd>
              </div>
            </dl>
            <p className="text-[13px] text-texto-3">
              Lo cobrado por QR ({fmtPlata(porQr)}) ya está en la cuenta del negocio: no lo entregás.
            </p>
          </>
        )}

        <p className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] text-primary-700">
          Las tarifas de envío ({fmtPlata(tarifas)}) son tuyas: no entran en la rendición. Los pedidos que ya
          venían pagados tampoco.
        </p>

        {entregadas.length === 0 ? (
          <Vacio
            icono="truck"
            titulo="Todavía no entregaste ningún pedido"
            texto="Cuando entregues uno, acá vas a ver cuánto rendís de cada pedido."
          />
        ) : (
          <section aria-label="De dónde sale la plata">
            <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-texto-4">De dónde sale</h3>
            <ul className="divide-y divide-borde-soft">
              {entregadas.map((p) => {
                const caja = enLaCaja.get(p.id);
                const estado = caja ? estadoEnLaCaja(caja) : null;
                return (
                  <li key={p.id} className="py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-texto">{p.clienteNombre ?? "Sin nombre"}</p>
                        <p className="text-xs text-texto-3">
                          {[p.comprobante ?? `#${p.id}`, horaSinCortes(p.entregadoEn ?? p.fecha)].join(" · ")}
                          {p.prepagado ? " · ya estaba pagado" : p.cobroLaCaja ? " · la cobró la caja" : comoSeCobro(p)}
                        </p>
                        {esPositivo(p.tarifaEnvio ?? 0) && (
                          <p className="text-xs text-texto-3">+ {fmtPlata(p.tarifaEnvio)} de envío (tuyo)</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[15px] font-bold text-texto">{fmtPlata(p.montoRendicion ?? 0)}</span>
                    </div>
                    {estado && (
                      <p
                        className={`mt-1.5 inline-flex rounded-lg px-2 py-0.5 text-[12px] font-semibold ${
                          estado.tono === "pendiente" ? "bg-warning-bg text-warning-text" : "bg-primary-50 text-primary-700"
                        }`}
                      >
                        {estado.texto}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}

/**
 * Con qué se cobró lo que rinde un pedido, para el renglón de la rendición:
 * " · Efectivo", " · QR" o, en un mixto, con los montos reales de cada forma
 * (DEL-2). Así el repartidor ve qué pedido explica cada parte del desglose.
 */
function comoSeCobro(p: Venta): string {
  const rinde = p.montoRendicion ?? 0;
  if (!esPositivo(rinde)) return "";
  // Sin los montos (un backend anterior) quedan los nombres, que no mienten.
  if (!p.pagos) return p.formasPago?.length ? ` · ${p.formasPago.join(" + ")}` : "";
  const qr = cobradoPorQr(p);
  if (!esPositivo(qr)) return " · Efectivo";
  const efectivo = aCentavos(rinde - qr);
  if (!esPositivo(efectivo)) return " · QR";
  return ` · QR ${fmtPlata(qr)} + efectivo ${fmtPlata(efectivo)}`;
}
