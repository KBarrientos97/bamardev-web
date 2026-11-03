import { useRef, useState } from "react";
import { compartirComoImagen } from "../lib/compartirTicket";
import { esPositivo } from "../lib/dinero";
import { fmtCantidad, fmtFecha, fmtFechaHora, fmtMoney, isoDia } from "../lib/format";
import { abonosDe, historialDePagos, type PagoDelHistorial } from "../lib/historialPagos";
import { useAuth } from "../store/AuthContext";
import { Boton, Modal } from "./ui";
import type { CreditoDetalle } from "../types";

/**
 * Los papeles que el cliente se lleva de una cuenta a crédito.
 *
 * Un solo layout para los tres, como en la app: el cliente los junta en la
 * misma carpeta y tiene que poder comparar las cifras de uno con las del otro.
 *
 *  - `COMPROMISO`: lo que firma al llevarse el pedido — qué se llevó, qué dejó
 *    y para cuándo se compromete a pagar el resto.
 *  - `RECIBO`: el de UN pago concreto (el adelanto incluido).
 *  - `CONSTANCIA`: cuando la cuenta queda en cero, el papel de que no debe nada.
 *
 * **Cada papel dice la verdad del momento que documenta, no la de hoy** (ver
 * `historialPagos`): el recibo del primer abono dice lo que quedaba debiendo
 * ese día aunque hoy la cuenta esté saldada. El comprobante es la excepción
 * declarada: muestra el saldo de HOY, que es lo que el cliente tiene que pagar,
 * y cuando ya hubo abonos lo dice con todas las letras (fila de abonos y aviso
 * de reimpresión).
 */
export type TipoComprobante = "COMPROMISO" | "RECIBO" | "CONSTANCIA";

export default function ComprobanteCredito({
  credito,
  tipo,
  pago,
  onClose,
}: {
  /** El detalle de la cuenta (con lo que se llevó y los pagos). */
  credito: CreditoDetalle;
  tipo: TipoComprobante;
  /** Sólo para el RECIBO: el pago que documenta, con la cuenta como quedó ESE día. */
  pago?: PagoDelHistorial;
  onClose: () => void;
}) {
  const { negocio } = useAuth();
  const ticket = useRef<HTMLElement>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [aviso, setAviso] = useState("");

  const titulo =
    tipo === "COMPROMISO"
      ? "Comprobante de crédito"
      : tipo === "RECIBO"
        ? "Recibo de pago"
        : "Constancia de cuenta saldada";

  async function compartir() {
    if (!ticket.current || compartiendo) return;
    setAviso("");
    setCompartiendo(true);
    const res = await compartirComoImagen(
      ticket.current,
      `${titulo.toLowerCase().replace(/ /g, "-")}-${credito.codigo ?? credito.id}`,
    );
    setCompartiendo(false);
    if (!res.ok && res.motivo === "no_soportado") {
      setAviso("Se descargó la imagen para que la adjuntes.");
    } else if (!res.ok && res.motivo === "error") {
      setAviso("No se pudo generar la imagen.");
    }
  }

  // El código de la cuenta y el de la venta: con los dos el cliente encuentra
  // su papel en el historial del negocio y el cajero, la venta.
  const codigos = [credito.codigo, credito.comprobante].filter(Boolean).join(" · ");
  // Quién atendió ESTE papel: en el recibo es quien cobró ese pago, no quien
  // registró la venta.
  const quien = tipo === "RECIBO" ? pago?.usuario : credito.registradoPor;

  return (
    <Modal
      abierto
      titulo={titulo}
      subtitulo={credito.clienteNombre}
      onClose={onClose}
      acciones={
        <>
          <Boton variante="ghost" icono="printer" onClick={() => window.print()}>
            Imprimir
          </Boton>
          <Boton
            variante="ghost"
            icono="arrowUpRight"
            onClick={compartir}
            disabled={compartiendo}
          >
            {compartiendo ? "Generando…" : "Compartir"}
          </Boton>
        </>
      }
    >
      {/* El ticket es lo único que va al papel: el resto de la pantalla se
          esconde al imprimir (ver las clases print: del layout). */}
      <article
        id="area-impresion"
        ref={ticket}
        className="mx-auto max-w-[320px] space-y-3 bg-white p-4 text-[13px] text-texto"
      >
        <header className="border-b border-dashed border-borde pb-3 text-center">
          <h3 className="text-base font-extrabold">{negocio?.nombre ?? "BamarDev"}</h3>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-texto-3">{titulo}</p>
          {codigos && <p className="mt-1 font-bold">{codigos}</p>}
        </header>

        {tipo === "COMPROMISO" ? (
          <Compromiso credito={credito} />
        ) : tipo === "RECIBO" ? (
          pago ? (
            <Recibo credito={credito} pago={pago} />
          ) : (
            // No pasa desde las pantallas; si pasara, un papel con ceros sería
            // peor que decir que falta el dato.
            <p className="text-center text-texto-3">No se encontró el pago.</p>
          )
        ) : (
          <Constancia credito={credito} />
        )}

        {tipo !== "RECIBO" && (
          // La firma es lo que convierte el papel en un compromiso: sin espacio
          // para firmarlo, es sólo un resumen. En la constancia firma el
          // NEGOCIO, que es quien da fe de que no le deben nada. Un pago ya
          // cobrado no se firma: una raya en blanco al pie sólo invita a
          // preguntar quién tiene que firmarla.
          <div className="mt-8 border-t border-texto-4 pt-1 text-center text-xs text-texto-3">
            {tipo === "COMPROMISO" ? "Firma del cliente" : "Sello y firma del negocio"}
          </div>
        )}

        <p className="text-center text-xs text-texto-3">
          {quien ? `${tipo === "RECIBO" ? "Cobró" : "Atendió"}: ${quien} · ¡Gracias!` : "¡Gracias!"}
        </p>
      </article>

      {aviso && (
        <p className="mt-2 text-center text-[13px] text-texto-2 print:hidden">{aviso}</p>
      )}
    </Modal>
  );
}

/**
 * El papel que firma el cliente.
 *
 * CRE-5 / C-02 / BUG-finanzas-3: decía Monto total, Adelanto y "Queda debiendo"
 * con el saldo de hoy, fechado con la hora de impresión. Reimpreso después de
 * un abono, total − adelanto no daba lo que decía que debía y nada lo
 * explicaba. Ahora lista lo que se llevó, suma los abonos y lleva la fecha de
 * la VENTA: total − adelanto − abonos = saldo, y si se reimprime otro día lo
 * dice.
 */
function Compromiso({ credito }: { credito: CreditoDetalle }) {
  const abonos = abonosDe(credito);
  const lineas = credito.detalles ?? [];

  return (
    <>
      <DatosCliente credito={credito} etiqueta="Fecha de la venta" fecha={fmtFecha(credito.fechaVenta)} />
      {/* El saldo ya no es el de ese día: el cliente tiene derecho a saber a
          qué fecha corresponde el número que está firmando. */}
      {credito.fechaVenta && !esDeHoy(credito.fechaVenta) && (
        <p className="text-xs text-texto-3">
          Reimpreso el {fmtFecha(new Date())} · saldo al día de hoy
        </p>
      )}

      {lineas.length > 0 && (
        <ul className="space-y-1 border-t border-dashed border-borde pt-3">
          {lineas.map((d, i) => (
            <li key={i}>
              <Renglon etiqueta={`${fmtCantidad(d.cantidad)} × ${d.producto}`} valor={fmtMoney(d.subtotal)} />
              {/* El unitario sólo cuando se llevó más de uno: con 1 es el mismo
                  número dos veces. Con varios es lo que evita el "a mí me
                  dijiste otro precio". */}
              {d.cantidad > 1 && (
                <p className="text-xs text-texto-4">{fmtMoney(d.precio)} c/u</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <dl className="space-y-1 border-t border-dashed border-borde pt-3">
        <Fila etiqueta="Total" valor={fmtMoney(credito.montoTotal)} />
        {esPositivo(credito.adelanto) && (
          <Fila etiqueta="Adelanto recibido" valor={`-${fmtMoney(credito.adelanto)}`} />
        )}
        {esPositivo(abonos.monto) && (
          <Fila
            etiqueta={
              abonos.cantidad === null ? "Abonos recibidos" : `Abonos recibidos (${abonos.cantidad})`
            }
            valor={`-${fmtMoney(abonos.monto)}`}
          />
        )}
        <Fila etiqueta="Saldo a pagar" valor={fmtMoney(credito.saldo)} fuerte />
      </dl>

      <dl className="space-y-1 border-t border-dashed border-borde pt-3">
        <Fila etiqueta="Se compromete a pagar el" valor={fmtFecha(credito.fechaCompromiso)} fuerte />
      </dl>
      <p className="text-xs text-texto-3">
        {lineas.length > 0
          ? "Recibí los productos detallados y me comprometo a pagar el saldo en la fecha indicada."
          : "Me comprometo a pagar el saldo en la fecha indicada."}
      </p>
    </>
  );
}

/**
 * El recibo de un pago, con lo pagado hasta ese momento y el saldo después de
 * ese pago (C-01 / CRE-6). El sello va sólo en el pago que saldó la cuenta.
 */
function Recibo({ credito, pago }: { credito: CreditoDetalle; pago: PagoDelHistorial }) {
  return (
    <>
      <DatosCliente credito={credito} etiqueta="Recibido el" fecha={fmtFechaHora(pago.fecha)} />
      <dl className="space-y-1 border-t border-dashed border-borde pt-3">
        <Fila etiqueta="Total de la cuenta" valor={fmtMoney(credito.montoTotal)} />
        <Fila
          etiqueta={pago.esAdelanto ? "Adelanto al entregar" : "Abono recibido"}
          valor={fmtMoney(pago.monto)}
          fuerte
        />
        {/* BUG-finanzas-7: el recibo de después del abono no decía cómo se
            pagó. El adelanto no la tiene guardada y no se inventa. */}
        {pago.formaPago && <Fila etiqueta="Forma de pago" valor={pago.formaPago} />}
        {pago.partes?.map((p) => (
          <Fila key={p.formaPago} etiqueta={`· ${p.formaPago}`} valor={fmtMoney(p.monto)} />
        ))}
        <Fila etiqueta="Pagado hasta acá" valor={fmtMoney(pago.pagadoAcumulado)} />
        <Fila etiqueta="Saldo pendiente" valor={fmtMoney(pago.saldoDespues)} fuerte />
      </dl>
      {pago.cancela && <Sello />}
    </>
  );
}

/**
 * La prueba de que no debe nada (CRE-7): decía "Cuenta saldada", el total y
 * saldo 0. Ahora trae cuándo se emitió, de qué venta es, cuándo pagó lo último
 * y cada pago con su fecha y su forma, como la de la app.
 */
function Constancia({ credito }: { credito: CreditoDetalle }) {
  const historial = historialDePagos(credito);
  const ultimo = historial[historial.length - 1];

  return (
    <>
      {/* La fecha de un papel que se emite hoy es la de hoy: con la del último
          pago salía fechado semanas atrás. */}
      <DatosCliente credito={credito} etiqueta="Fecha de emisión" fecha={fmtFecha(new Date())} />
      <Sello />
      <dl className="space-y-1 border-t border-dashed border-borde pt-3">
        <Fila etiqueta="Deuda original" valor={fmtMoney(credito.montoTotal)} />
        <Fila etiqueta="Fecha de la venta" valor={fmtFecha(credito.fechaVenta)} />
        {ultimo && <Fila etiqueta="Último pago" valor={fmtFecha(ultimo.fecha)} />}
      </dl>

      {historial.length > 0 && (
        <div className="border-t border-dashed border-borde pt-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-texto-2">Pagos recibidos</p>
          <dl className="space-y-1">
            {historial.map((p, i) => (
              <Fila
                key={p.id ?? `adelanto-${i}`}
                etiqueta={`${fmtFecha(p.fecha)} · ${p.formaPago || "Adelanto"}`}
                valor={fmtMoney(p.monto)}
              />
            ))}
          </dl>
        </div>
      )}

      <dl className="space-y-1 border-t border-dashed border-borde pt-3">
        <Fila
          etiqueta="Total pagado"
          valor={fmtMoney(credito.pagado ?? credito.montoTotal - credito.saldo)}
          fuerte
        />
        <Fila etiqueta="Saldo pendiente" valor="Ninguno" />
      </dl>
      <p className="text-xs text-texto-3">
        Se hace constar que {credito.clienteNombre} pagó la totalidad de esta cuenta y no mantiene
        saldo pendiente por este crédito.
      </p>
    </>
  );
}

function DatosCliente({
  credito,
  etiqueta,
  fecha,
}: {
  credito: CreditoDetalle;
  etiqueta: string;
  fecha: string;
}) {
  return (
    <dl className="space-y-1">
      <Fila etiqueta="Cliente" valor={credito.clienteNombre} />
      {/* Sin teléfono la fila sobra: un renglón para decir que no hay dato. */}
      {credito.clienteTelefono && <Fila etiqueta="Teléfono" valor={credito.clienteTelefono} />}
      <Fila etiqueta={etiqueta} valor={fecha} />
    </dl>
  );
}

/** Con asteriscos y no sólo con color: impreso en blanco y negro, el fondo no sale. */
function Sello() {
  return (
    <p className="rounded-lg bg-primary-50 px-3 py-2.5 text-center font-bold text-primary-700">
      *** DEUDA CANCELADA ***
    </p>
  );
}

/** "Hoy" en el día local: una venta de anoche a las 23:00 ya no es de hoy. */
function esDeHoy(iso: string): boolean {
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && isoDia(d) === isoDia(new Date());
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
      <dt className={fuerte ? "font-bold text-texto" : "text-texto-3"}>{etiqueta}</dt>
      <dd className={`shrink-0 ${fuerte ? "font-bold text-texto" : "text-texto-2"}`}>{valor}</dd>
    </div>
  );
}

/** Un renglón de lo que se llevó: fuera de un `<dl>`, no es etiqueta y valor. */
function Renglon({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-texto-2">{etiqueta}</span>
      <span className="shrink-0 text-texto-2">{valor}</span>
    </div>
  );
}
