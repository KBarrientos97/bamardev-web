import { useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton } from "../../components/ui";
import { compartirComoImagen } from "../../lib/compartirTicket";
import { fmtFecha, fmtFechaHora, fmtMoney, fmtNum } from "../../lib/format";
import { useAuth } from "../../store/AuthContext";
import type { Venta } from "../../types";

/**
 * Comprobante de la venta recién cobrada.
 *
 * El ticket copia el formato de la app (`fragment_recibo.xml` + `TicketItems`):
 * cabecera etiquetada, artículos en dos renglones con el badge M/LL, Subtotal
 * y TOTAL, y el desglose de efectivo/QR/cambio. Es el mismo papel que recibe
 * el cliente en el mostrador, salga de la tablet o de la web.
 *
 * Al imprimir sale SÓLO este ticket: el `id="area-impresion"` es lo único que
 * `index.css` deja visible, y el papel es rollo de 80 mm.
 */
export default function PantallaRecibo({
  venta,
  onNuevaVenta,
  onHistorial,
}: {
  venta: Venta;
  onNuevaVenta: () => void;
  onHistorial: () => void;
}) {
  const { negocio, incluye } = useAuth();

  /**
   * El ticket que se rasteriza al compartir: se manda la MISMA vista que se
   * imprime, no una versión aparte que después se desincroniza.
   */
  const ticket = useRef<HTMLElement>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [avisoCompartir, setAvisoCompartir] = useState("");

  async function compartir() {
    if (!ticket.current || compartiendo) return;
    setAvisoCompartir("");
    setCompartiendo(true);
    const res = await compartirComoImagen(
      ticket.current,
      venta.comprobante ?? `recibo-${venta.id}`,
    );
    setCompartiendo(false);
    // Cancelar el diálogo del sistema no es un error que mostrar.
    if (!res.ok && res.motivo === "no_soportado") {
      setAvisoCompartir("Se descargó la imagen del recibo para que la adjuntes.");
    } else if (!res.ok && res.motivo === "error") {
      setAvisoCompartir("No se pudo generar la imagen del recibo.");
    }
  }

  const detalles = venta.detalles ?? [];
  const pagos = venta.pagos ?? [];

  // El badge M/LL sólo aplica a ventas de local: en delivery/recoger todo va
  // para llevar y ensuciaría el ticket (misma regla que TicketItems.kt).
  const mostrarConsumo = venta.tipoPedido === "LOCAL";

  // Subtotal = suma de las líneas. El envío va aparte, así que Subtotal y TOTAL
  // sólo difieren cuando el pedido tiene tarifa de entrega.
  const subtotal = detalles.reduce((acum, d) => acum + d.subtotal, 0);

  // Efectivo y QR salen desglosados como en la app, no como una lista genérica
  // de pagos: el cliente busca "Efectivo recibido" y "Cambio entregado".
  const efectivo = pagos.find((p) => /efectivo/i.test(p.formaPago ?? ""));
  const qr = pagos.find((p) => /qr|transfer/i.test(p.formaPago ?? ""));
  const metodo =
    venta.formasPago?.join(" + ") ||
    pagos
      .map((p) => p.formaPago)
      .filter(Boolean)
      .join(" + ") ||
    "—";

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex flex-col items-center text-center print:hidden">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
            <Icon name="check" size={28} strokeWidth={2.5} />
          </span>
          <h1 className="mt-3 text-lg font-bold text-texto">Venta registrada</h1>
          <p className="mt-0.5 text-[13px] text-texto-3">
            {venta.comprobante ?? `#${venta.id}`}
          </p>
        </div>

        {/* El ticket: el `id` lo hace lo ÚNICO visible al imprimir (index.css). */}
        <article
          id="area-impresion"
          ref={ticket}
          className="card mx-auto max-w-[320px] p-5 print:border-0 print:shadow-none"
        >
          <header className="pb-2 text-center">
            <h2 className="text-base font-bold text-texto">
              {negocio?.nombre ?? "BamarDev"}
            </h2>
          </header>

          {/* Cabecera en filas etiquetadas, como en la app: el número de ticket
              queda siempre en el mismo lugar y el cliente lo encuentra solo. */}
          <dl className="border-t border-dashed border-borde pt-2 text-xs">
            <FilaDato etiqueta="Ticket:" valor={venta.comprobante ?? `#${venta.id}`} />
            <FilaDato etiqueta="Fecha:" valor={fmtFechaHora(venta.fecha)} />
            {venta.cajero && <FilaDato etiqueta="Cajero:" valor={venta.cajero} />}
            <FilaDato etiqueta="Pago:" valor={metodo} />
          </dl>

          <div className="mt-2 border-t border-dashed border-borde pt-1">
            {detalles.map((d, i) => (
              <LineaTicket key={i} linea={d} mostrarConsumo={mostrarConsumo} />
            ))}
          </div>

          <dl className="mt-2 space-y-1 border-t border-dashed border-borde pt-2 text-sm">
            <div className="flex justify-between text-texto-2">
              <dt>Subtotal</dt>
              <dd>{fmtMoney(subtotal)}</dd>
            </div>
            {venta.tarifaEnvio > 0 && (
              <div className="flex justify-between text-texto-2">
                <dt>Envío</dt>
                <dd>{fmtMoney(venta.tarifaEnvio)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-borde pt-1 text-base font-extrabold text-texto">
              <dt>TOTAL</dt>
              <dd>{fmtMoney(venta.total)}</dd>
            </div>
          </dl>

          <dl className="mt-2 space-y-1 border-t border-dashed border-borde pt-2 text-sm">
            <div className="flex justify-between text-texto-2">
              <dt>Método de pago</dt>
              <dd className="font-bold text-texto">{metodo}</dd>
            </div>
            {efectivo && (
              <div className="flex justify-between text-texto-2">
                <dt>Efectivo recibido</dt>
                <dd className="font-bold text-texto">
                  {fmtMoney(efectivo.recibido ?? efectivo.monto)}
                </dd>
              </div>
            )}
            {qr && (
              <div className="flex justify-between text-texto-2">
                <dt>Monto QR</dt>
                <dd className="font-bold text-texto">{fmtMoney(qr.monto)}</dd>
              </div>
            )}
            {typeof venta.cambio === "number" && venta.cambio > 0 && (
              <div className="flex justify-between font-bold text-texto">
                <dt>Cambio entregado</dt>
                <dd>{fmtMoney(venta.cambio)}</dd>
              </div>
            )}
          </dl>

          {venta.credito && (
            <div className="mt-2 border-t border-dashed border-borde pt-2 text-sm">
              <p className="text-center text-xs font-bold tracking-wide text-texto">
                VENTA A CRÉDITO
              </p>
              <dl className="mt-1 space-y-1">
                <FilaDato etiqueta="Cliente" valor={venta.credito.clienteNombre} />
                {venta.credito.adelanto > 0 && (
                  <FilaDato
                    etiqueta="Adelanto de hoy"
                    valor={fmtMoney(venta.credito.adelanto)}
                  />
                )}
                <div className="flex justify-between font-bold text-texto">
                  <dt>SALDO POR COBRAR</dt>
                  <dd>{fmtMoney(venta.credito.saldo)}</dd>
                </div>
                <FilaDato
                  etiqueta="Paga el"
                  valor={fmtFecha(venta.credito.fechaCompromiso)}
                />
              </dl>
            </div>
          )}

          <div className="mt-3 border-t border-dashed border-borde pt-2 text-center text-xs text-texto-3">
            <p>¡Gracias por su compra!</p>
            <p className="mt-0.5">Conserve este recibo</p>
          </div>
        </article>
      </div>

      {avisoCompartir && (
        <p className="border-t border-borde bg-muted px-4 py-2 text-center text-[13px] text-texto-2 print:hidden">
          {avisoCompartir}
        </p>
      )}

      <div className="flex gap-2 border-t border-borde bg-white p-4 print:hidden">
        {incluye("recibo_pdf") && (
          <>
            <Boton variante="ghost" icono="printer" onClick={() => window.print()}>
              Imprimir
            </Boton>
            {/* Siempre visible: si el equipo no sabe compartir archivos, la
                imagen se descarga, que en un escritorio es lo más parecido. */}
            <Boton
              variante="ghost"
              icono="arrowUpRight"
              onClick={compartir}
              disabled={compartiendo}
            >
              {compartiendo ? "Generando…" : "Compartir"}
            </Boton>
          </>
        )}
        <Boton variante="ghost" onClick={onHistorial}>
          Historial
        </Boton>
        <Boton icono="plus" onClick={onNuevaVenta} className="flex-1">
          Nueva venta
        </Boton>
      </div>
    </div>
  );
}

/** Fila etiqueta/valor de la cabecera y del bloque de crédito. */
function FilaDato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-texto-3">{etiqueta}</dt>
      <dd className="text-right font-bold text-texto">{valor}</dd>
    </div>
  );
}

/**
 * Un artículo en DOS renglones, como `row_ticket_item.xml`:
 *
 *     Brasa cuarto                    M
 *     1 × Bs 26.00             Bs 26.00
 *
 * En una sola línea, a 72 mm de ancho el nombre se come el espacio y sale
 * cortado con "…". Partido, el nombre tiene el renglón entero y los números
 * quedan alineados en columna, que es como se lee un ticket.
 */
function LineaTicket({
  linea,
  mostrarConsumo,
}: {
  linea: NonNullable<Venta["detalles"]>[number];
  mostrarConsumo: boolean;
}) {
  const enMesa = linea.consumo === "MESA";
  return (
    <div className="py-1 text-[13px]">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 font-semibold text-texto">{linea.producto}</p>
        {mostrarConsumo && (
          <span
            className={`shrink-0 font-bold ${enMesa ? "text-primary-700" : "text-texto-3"}`}
          >
            {enMesa ? "M" : "LL"}
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 text-texto-3">
        <span>
          {fmtNum(linea.cantidad)} × {fmtMoney(linea.precio)}
        </span>
        <span className="shrink-0 font-bold text-texto">{fmtMoney(linea.subtotal)}</span>
      </div>
      {linea.nota && <p className="text-xs italic text-texto-3">{linea.nota}</p>}
    </div>
  );
}
