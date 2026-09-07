import { fmtFecha, fmtFechaHora, fmtMoney } from "../lib/format";
import { useAuth } from "../store/AuthContext";
import { Boton, Modal } from "./ui";
import type { Credito } from "../types";

/**
 * Los papeles que el cliente se lleva de una cuenta a crédito.
 *
 * Un solo layout para los tres, como en la app: el cliente los junta en la
 * misma carpeta y tiene que poder comparar las cifras de uno con las del otro.
 *
 *  - `COMPROMISO`: lo que firma al llevarse el pedido — qué debe y para cuándo.
 *  - `RECIBO`: por cada abono, la constancia de lo que entregó.
 *  - `CONSTANCIA`: cuando la cuenta queda en cero, el papel de que no debe nada.
 */
export type TipoComprobante = "COMPROMISO" | "RECIBO" | "CONSTANCIA";

export default function ComprobanteCredito({
  credito,
  tipo,
  /** Sólo para el RECIBO: el abono que se está entregando. */
  abono,
  onClose,
}: {
  credito: Credito;
  tipo: TipoComprobante;
  abono?: { monto: number; fecha: string; formaPago?: string | null };
  onClose: () => void;
}) {
  const { negocio } = useAuth();

  const titulo =
    tipo === "COMPROMISO"
      ? "Comprobante de crédito"
      : tipo === "RECIBO"
        ? "Recibo de pago"
        : "Constancia de cuenta saldada";

  return (
    <Modal
      abierto
      titulo={titulo}
      subtitulo={credito.clienteNombre}
      onClose={onClose}
      acciones={
        <Boton variante="ghost" icono="printer" onClick={() => window.print()}>
          Imprimir
        </Boton>
      }
    >
      {/* El ticket es lo único que va al papel: el resto de la pantalla se
          esconde al imprimir (ver las clases print: del layout). */}
      <article className="mx-auto max-w-sm space-y-3 bg-white p-4 text-[13px] text-texto print:max-w-none print:p-0">
        <header className="border-b border-dashed border-borde pb-3 text-center">
          <h3 className="text-base font-extrabold">{negocio?.nombre ?? "BamarDev"}</h3>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-texto-3">{titulo}</p>
          {credito.codigo && <p className="mt-1 font-bold">{credito.codigo}</p>}
        </header>

        <dl className="space-y-1">
          <Fila etiqueta="Cliente" valor={credito.clienteNombre} />
          {credito.clienteTelefono && (
            <Fila etiqueta="Teléfono" valor={credito.clienteTelefono} />
          )}
          <Fila etiqueta="Fecha" valor={fmtFechaHora(new Date().toISOString())} />
        </dl>

        <div className="border-t border-dashed border-borde pt-3">
          {tipo === "RECIBO" && abono ? (
            <>
              <dl className="space-y-1">
                <Fila etiqueta="Pagó" valor={fmtMoney(abono.monto)} fuerte />
                {abono.formaPago && <Fila etiqueta="Forma de pago" valor={abono.formaPago} />}
                <Fila etiqueta="Recibido el" valor={fmtFecha(abono.fecha)} />
              </dl>
              <dl className="mt-2 space-y-1 border-t border-dashed border-borde pt-2">
                <Fila etiqueta="Deuda total" valor={fmtMoney(credito.montoTotal)} />
                <Fila etiqueta="Saldo pendiente" valor={fmtMoney(credito.saldo)} fuerte />
              </dl>
            </>
          ) : tipo === "CONSTANCIA" ? (
            <>
              <p className="rounded-lg bg-primary-50 px-3 py-2.5 text-center font-bold text-primary-700">
                Cuenta saldada
              </p>
              <dl className="mt-2 space-y-1">
                <Fila etiqueta="Monto total" valor={fmtMoney(credito.montoTotal)} />
                <Fila etiqueta="Saldo" valor={fmtMoney(0)} fuerte />
              </dl>
              <p className="mt-2 text-center text-xs text-texto-3">
                {credito.clienteNombre} no tiene deuda pendiente por esta cuenta.
              </p>
            </>
          ) : (
            <dl className="space-y-1">
              <Fila etiqueta="Monto total" valor={fmtMoney(credito.montoTotal)} />
              {credito.adelanto > 0 && (
                <Fila etiqueta="Adelanto entregado" valor={fmtMoney(credito.adelanto)} />
              )}
              <Fila etiqueta="Queda debiendo" valor={fmtMoney(credito.saldo)} fuerte />
              <Fila
                etiqueta="Se compromete a pagar el"
                valor={fmtFecha(credito.fechaCompromiso)}
                fuerte
              />
            </dl>
          )}
        </div>

        {tipo === "COMPROMISO" && (
          // La firma es lo que convierte el papel en un compromiso: sin espacio
          // para firmarlo, es sólo un resumen.
          <div className="mt-8 border-t border-texto-4 pt-1 text-center text-xs text-texto-3">
            Firma del cliente
          </div>
        )}
      </article>
    </Modal>
  );
}

function Fila({
  etiqueta,
  valor,
  fuerte,
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-texto-3">{etiqueta}</dt>
      <dd className={fuerte ? "font-bold text-texto" : "text-texto-2"}>{valor}</dd>
    </div>
  );
}
