import { useRef, useState } from "react";
import { Boton, Cargando, ErrorMsg, Modal } from "../../../components/ui";
import { api } from "../../../lib/api";
import { compartirComoImagen } from "../../../lib/compartirTicket";
import { esPositivo } from "../../../lib/dinero";
import { fmtCantidad, fmtFecha, fmtFechaHora, fmtMoney } from "../../../lib/format";
import { marcaConsumo } from "../../../lib/rubro";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import type { Venta } from "../../../types";
import { Chip } from "../ui";
import { datosPedido, efectivoDelRecibo, textoFormaPago } from "./ReciboVenta.datos";
import { chipEstado, type VentaFila } from "./Ventas.datos";

/**
 * El recibo de una venta, abierto desde Reportes › Ventas en el restaurante
 * (REP-02, 28-oct): el mismo papel que el cliente recibió en el mostrador, para
 * el que vuelve por su ticket o para ver cómo se cobró una venta de otro día.
 *
 * Trae el detalle real del backend (`GET /ventas/:id`, el mismo que reimprime
 * el historial del POS) y lo dibuja como el ticket del POS (`PantallaRecibo`):
 * cabecera etiquetada, artículos en dos renglones con su M/LL, TOTAL y cómo se
 * pagó. Agrega lo que el reporte necesita y el papel de la caja no: en un
 * mixto cada medio con su monto, y los datos del pedido si fue a domicilio o
 * para recoger. Es de SÓLO lectura: anular sigue siendo del POS, donde está la
 * autorización con PIN.
 *
 * Al imprimir sale sólo el ticket: `id="area-impresion"` es lo único que
 * `index.css` deja visible, el mismo mecanismo que el recibo del POS.
 */
export function ModalReciboVenta({
  fila,
  onClose,
}: {
  /** La fila del reporte: con ella se titula el diálogo mientras llega el detalle. */
  fila: Pick<VentaFila, "id" | "comprobante" | "estado">;
  onClose: () => void;
}) {
  const { negocio, incluye, rubro } = useAuth();
  const detalle = useApi(() => api.getVenta(fila.id), [fila.id]);
  const v = detalle.datos;
  const ticket = useRef<HTMLElement>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [aviso, setAviso] = useState("");

  async function compartir() {
    if (!ticket.current || compartiendo) return;
    setAviso("");
    setCompartiendo(true);
    const nombre = (v?.comprobante ?? `recibo-${fila.id}`).replace(/[^A-Za-z0-9_-]/g, "_");
    const res = await compartirComoImagen(ticket.current, nombre);
    setCompartiendo(false);
    // Cancelar el diálogo del sistema no es un error que mostrar.
    if (!res.ok && res.motivo === "no_soportado") setAviso("Se descargó la imagen del recibo para que la adjuntes.");
    else if (!res.ok && res.motivo === "error") setAviso("No se pudo generar la imagen del recibo.");
  }

  // El estado del detalle manda; el de la fila, mientras llega.
  const estado = chipEstado(v?.estado ?? fila.estado);
  // Imprimir y compartir el comprobante es del plan, como en el recibo del POS.
  const conPapel = !!v && incluye("recibo_pdf");

  return (
    <Modal
      abierto
      titulo="Recibo de venta"
      // El número interno va siempre: el comprobante vuelve a V-000001 en cada
      // apertura de caja, y en un período de varios días hay varios iguales.
      // Una venta sin comprobante ya viene como "#12" y no se repite.
      subtitulo={fila.comprobante.startsWith("#") ? fila.comprobante : `${fila.comprobante} · venta #${fila.id}`}
      onClose={onClose}
      ancho="max-w-md"
      acciones={
        conPapel ? (
          <>
            <Boton variante="ghost" icono="printer" onClick={() => window.print()}>
              Imprimir
            </Boton>
            {/* Siempre visible: si el equipo no sabe compartir archivos, la
                imagen se descarga, que en un escritorio es lo más parecido. */}
            <Boton icono="arrowUpRight" onClick={compartir} disabled={compartiendo}>
              {compartiendo ? "Generando…" : "Compartir"}
            </Boton>
          </>
        ) : undefined
      }
    >
      {detalle.error ? (
        <ErrorMsg onReintentar={detalle.recargar}>{detalle.error}</ErrorMsg>
      ) : !v ? (
        <Cargando texto="Trayendo el recibo…" />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-texto-3">
            <Chip tono={estado.tono}>{estado.texto}</Chip>
            <span>
              {fmtFechaHora(v.fecha)}
              {v.cajero ? ` · ${v.cajero}` : ""}
            </span>
          </div>
          {v.estado === "ANULADO" && (
            <div className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-text">
              <p className="font-bold">Venta anulada</p>
              <p className="mt-0.5">No suma a los ingresos del período y su stock volvió al inventario.</p>
              {v.motivoAnulacion && <p className="mt-0.5">Motivo: {v.motivoAnulacion}</p>}
              {v.anulacionAutorizadaPor && <p className="mt-0.5">Autorizó: {v.anulacionAutorizadaPor}</p>}
            </div>
          )}
          <article id="area-impresion" ref={ticket} className="mx-auto max-w-[320px] bg-white p-1 text-texto">
            <TicketVenta venta={v} negocio={negocio?.nombre ?? "BamarDev"} rubro={rubro} />
          </article>
          {aviso && <p className="text-center text-[13px] text-texto-2">{aviso}</p>}
        </div>
      )}
    </Modal>
  );
}

/** El papel. Sólo lo que va impreso: lo de la pantalla queda afuera del `area-impresion`. */
function TicketVenta({ venta: v, negocio, rubro }: { venta: Venta; negocio: string; rubro: string | undefined }) {
  const detalles = v.detalles ?? [];
  // El M/LL sólo en una venta de local: en un pedido todo va para llevar.
  // Misma regla que el ticket del POS.
  const mostrarConsumo = v.tipoPedido === "LOCAL" && marcaConsumo(rubro);
  const descuentos = v.descuentos ?? [];
  const subtotal = v.subtotal ?? detalles.reduce((s, d) => s + d.subtotal, 0);
  const efectivo = efectivoDelRecibo(v.pagos);
  const pedido = datosPedido(v);

  return (
    <>
      <header className="pb-2 text-center">
        <h3 className="text-base font-bold">{negocio}</h3>
        {/* En el papel también: una copia de una venta anulada no puede pasar
            por un recibo válido. */}
        {v.estado === "ANULADO" && <p className="mt-1 text-[13px] font-extrabold tracking-wide">*** ANULADA ***</p>}
      </header>

      <dl className="border-t border-dashed border-borde pt-2 text-xs">
        <FilaDato etiqueta="Ticket:" valor={v.comprobante ?? `#${v.id}`} />
        <FilaDato etiqueta="Fecha:" valor={fmtFechaHora(v.fecha)} />
        {v.mesa && <FilaDato etiqueta="Mesa:" valor={v.mesa} />}
        {v.mesero && <FilaDato etiqueta="Atendió:" valor={v.mesero} />}
        {v.cajero && <FilaDato etiqueta="Cajero:" valor={v.cajero} />}
      </dl>

      <div className="mt-2 border-t border-dashed border-borde pt-1">
        {detalles.map((d, i) => (
          <div key={i} className="py-1 text-[13px]">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 font-semibold">{d.producto}</p>
              {mostrarConsumo && (
                <span className={`shrink-0 font-bold ${d.consumo === "MESA" ? "text-primary-700" : "text-texto-3"}`}>
                  {d.consumo === "MESA" ? "M" : "LL"}
                </span>
              )}
            </div>
            <div className="flex items-start justify-between gap-2 text-texto-3">
              {/* La cantidad sin ",00" y con sus decimales si se vendió por peso. */}
              <span>
                {fmtCantidad(d.cantidad)} × {fmtMoney(d.precio)}
              </span>
              <span className="shrink-0 font-bold text-texto">{fmtMoney(d.subtotal)}</span>
            </div>
            {!!d.descuento && esPositivo(d.descuento) && (
              <div className="flex items-start justify-between gap-2 text-xs text-texto-3">
                <span>{d.descuentoNombre ?? "Descuento"}</span>
                <span className="shrink-0">− {fmtMoney(d.descuento)}</span>
              </div>
            )}
            {d.nota && <p className="text-xs italic text-texto-3">{d.nota}</p>}
          </div>
        ))}
      </div>

      <dl className="mt-2 space-y-1 border-t border-dashed border-borde pt-2 text-sm">
        {/* El subtotal sólo cuando hay algo que restarle: sin promos sería el
            mismo número que el TOTAL, dos veces. */}
        {descuentos.length > 0 && (
          <>
            <div className="flex justify-between text-texto-2">
              <dt>Subtotal</dt>
              <dd>{fmtMoney(subtotal)}</dd>
            </div>
            {descuentos.map((x, i) => (
              <div key={i} className="flex justify-between gap-2 text-texto-2">
                <dt>
                  {x.nombre}
                  {x.codigo ? ` (${x.codigo})` : ""}
                </dt>
                <dd className="shrink-0 whitespace-nowrap">− {fmtMoney(x.monto)}</dd>
              </div>
            ))}
          </>
        )}
        <div className="flex justify-between border-t border-borde pt-1 text-base font-extrabold">
          <dt>TOTAL</dt>
          <dd>{fmtMoney(v.total)}</dd>
        </div>
      </dl>

      <dl className="mt-2 space-y-1 border-t border-dashed border-borde pt-2 text-sm">
        <div className="flex justify-between gap-3 text-texto-2">
          <dt className="shrink-0">Forma de pago</dt>
          <dd className="text-right font-bold text-texto">{textoFormaPago(v.pagos)}</dd>
        </div>
        {efectivo && (
          <div className="flex justify-between gap-2 text-texto-2">
            <dt>Efectivo recibido</dt>
            <dd className="font-bold text-texto">{fmtMoney(efectivo.recibido)}</dd>
          </div>
        )}
        {efectivo && esPositivo(efectivo.cambio) && (
          // Con `gap`: a 320 px se leía "CambioBs 27,00".
          <div className="flex justify-between gap-2 font-bold">
            <dt>Cambio</dt>
            <dd>{fmtMoney(efectivo.cambio)}</dd>
          </div>
        )}
      </dl>

      {pedido && (
        <section className="mt-2 border-t border-dashed border-borde pt-2 text-sm" aria-label={pedido.titulo}>
          <p className="text-center text-xs font-bold uppercase tracking-wide">{pedido.titulo}</p>
          {pedido.datos.length > 0 && (
            <dl className="mt-1 space-y-1">
              {pedido.datos.map((d) => (
                <FilaDato key={d.etiqueta} etiqueta={d.etiqueta} valor={d.valor} />
              ))}
            </dl>
          )}
        </section>
      )}

      {v.credito && (
        <div className="mt-2 border-t border-dashed border-borde pt-2 text-sm">
          <p className="text-center text-xs font-bold tracking-wide">VENTA A CRÉDITO</p>
          <dl className="mt-1 space-y-1">
            <FilaDato etiqueta="Cliente" valor={v.credito.clienteNombre} />
            {/* El saldo de hoy, no el de aquel día: lo que el cliente pregunta
                al volver con su ticket es cuánto le falta. */}
            <FilaDato
              etiqueta="Saldo por cobrar hoy"
              valor={esPositivo(v.credito.saldo) ? fmtMoney(v.credito.saldo) : "Pagado"}
            />
            {esPositivo(v.credito.saldo) && <FilaDato etiqueta="Paga el" valor={fmtFecha(v.credito.fechaCompromiso)} />}
          </dl>
        </div>
      )}

      <div className="mt-3 border-t border-dashed border-borde pt-2 text-center text-xs text-texto-3">
        <p>¡Gracias por su compra!</p>
      </div>
    </>
  );
}

/** Fila etiqueta/valor, como la cabecera del ticket del POS. */
function FilaDato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="shrink-0 text-texto-3">{etiqueta}</dt>
      <dd className="text-right font-bold text-texto">{valor}</dd>
    </div>
  );
}
