import { useRef, useState } from "react";
import { Boton, Cargando, ErrorMsg, Modal } from "../../../components/ui";
import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { tituloMes } from "../../../lib/academia/calendario";
import { archivoComprobante, mensajeComprobanteDocente, textoMetodoPago, whatsappComprobante } from "../../../lib/academia/pagosDocente";
import type { HistorialPagosDocente } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { compartirComoImagen, enviarPorWhatsapp, type ResultadoCompartir } from "../../../lib/compartirTicket";
import { fmtMoney } from "../../../lib/format";
import { PIE_BAMARDEV } from "../../../lib/pieBamarDev";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";

/** "3 de noviembre de 2026": en el papel va la fecha entera. */
function fechaLarga(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * «Mandar el comprobante» del pago a un docente (ítem 17 de la revisión del
 * 08-nov, D4): el docente no ve en la app cuánto cobra, así que el admin le
 * manda el comprobante del mes. Es una imagen con el mensaje, por WhatsApp,
 * igual que el recibo de una venta (`enviarPorWhatsapp`: en el celular el
 * diálogo de compartir con las dos cosas; en la compu abre el chat del docente
 * con el mensaje escrito y baja la imagen para arrastrarla).
 *
 * Los datos salen del historial de pagos del docente (`GET …/pagos`), que trae
 * también su WhatsApp. Si quien lo abre ya lo tiene cargado, lo pasa en
 * `historial` y no se vuelve a pedir.
 */
export default function ComprobantePago({
  personalId,
  mes,
  historial,
  onClose,
}: {
  personalId: number;
  mes: string;
  historial?: HistorialPagosDocente | null;
  onClose: () => void;
}) {
  const p = usePalabras();
  const { negocio } = useAuth();
  const carga = useApi(async () => historial ?? apiAcademia.pagosDocente(personalId), [personalId, historial]);
  const h = carga.datos;
  const pago = h?.pagos.find((x) => x.mes === mes && x.estado === "PAGADA") ?? null;
  const ticket = useRef<HTMLElement>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [aviso, setAviso] = useState("");

  const datos = h && pago ? { docente: h.docente.nombre, negocio: negocio?.nombre, mes, monto: pago.liquido, metodoPago: pago.metodoPago, pagadaEn: pago.pagadaEn } : null;
  const mensaje = datos ? mensajeComprobanteDocente(datos) : "";
  const archivo = h ? archivoComprobante(h.docente.nombre, mes) : "comprobante";

  function avisar(res: ResultadoCompartir, siDescargo: string) {
    // Cancelar el diálogo del sistema no es un error que mostrar.
    if (!res.ok && res.motivo === "no_soportado") setAviso(siDescargo);
    else if (!res.ok && res.motivo === "error") setAviso("No se pudo generar la imagen del comprobante.");
  }

  async function porWhatsapp() {
    if (!ticket.current || !h || compartiendo) return;
    setAviso("");
    setCompartiendo(true);
    const res = await enviarPorWhatsapp(ticket.current, archivo, mensaje, whatsappComprobante(h.docente.telefono, mensaje));
    setCompartiendo(false);
    avisar(res, "Se bajó la imagen del comprobante: adjuntala en el chat de WhatsApp.");
  }

  async function compartir() {
    if (!ticket.current || compartiendo) return;
    setAviso("");
    setCompartiendo(true);
    const res = await compartirComoImagen(ticket.current, archivo, mensaje);
    setCompartiendo(false);
    avisar(res, "Se bajó la imagen del comprobante y se copió el mensaje para que los pegues.");
  }

  return (
    <Modal
      abierto
      titulo="Comprobante de pago"
      subtitulo={h?.docente.nombre}
      onClose={() => !compartiendo && onClose()}
      ancho="max-w-md"
      acciones={
        pago ? (
          <>
            <Boton variante="ghost" icono="compartir" className="min-h-11" onClick={() => void compartir()} disabled={compartiendo}>
              Compartir imagen
            </Boton>
            <Boton icono="phone" className="min-h-11" onClick={() => void porWhatsapp()} disabled={compartiendo}>
              {compartiendo ? "Generando…" : "Mandar por WhatsApp"}
            </Boton>
          </>
        ) : (
          <Boton variante="ghost" onClick={onClose}>
            Cerrar
          </Boton>
        )
      }
    >
      {carga.error && !h ? (
        <ErrorMsg onReintentar={carga.recargar}>{carga.error}</ErrorMsg>
      ) : !h ? (
        <Cargando />
      ) : !pago ? (
        <p className="text-sm text-texto-2">El pago de {tituloMes(mes).toLowerCase()} todavía no está registrado.</p>
      ) : (
        <div className="space-y-3">
          <article ref={ticket} aria-label="Comprobante" className="mx-auto max-w-[320px] space-y-3 bg-white p-4 text-[13px] text-texto">
            <header className="border-b border-dashed border-borde pb-3 text-center">
              <h3 className="text-base font-extrabold">{negocio?.nombre ?? "BamarDev"}</h3>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-texto-3">Comprobante de pago</p>
            </header>
            <dl className="space-y-1.5">
              <Fila etiqueta={p.Docente} valor={h.docente.nombre} />
              <Fila etiqueta="Mes" valor={tituloMes(mes)} />
              {pago.pagadaEn && <Fila etiqueta="Fecha" valor={fechaLarga(pago.pagadaEn)} />}
              {pago.metodoPago && <Fila etiqueta="Forma de pago" valor={textoMetodoPago(pago.metodoPago)} />}
            </dl>
            <div className="rounded-lg bg-muted px-3 py-2.5 text-center">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-texto-3">Monto pagado</span>
              <span className="block text-2xl font-extrabold tabular-nums">{fmtMoney(pago.liquido)}</span>
            </div>
            <div className="text-center text-xs text-texto-3">
              <p>{pago.pagadoPor ? `Pagó: ${pago.pagadoPor} · ¡Gracias!` : "¡Gracias!"}</p>
              <p className="mt-0.5">{PIE_BAMARDEV}</p>
            </div>
          </article>
          <p className="text-[13px] text-texto-3">
            {h.docente.telefono
              ? `Va con este mensaje a su WhatsApp: «${mensaje}»`
              : `No tiene WhatsApp cargado: al mandarlo, elegí el chat. Mensaje: «${mensaje}»`}
          </p>
          {aviso && (
            <p role="status" className="text-center text-[13px] text-texto-2">
              {aviso}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-texto-3">{etiqueta}</dt>
      <dd className="text-right font-semibold">{valor}</dd>
    </div>
  );
}
