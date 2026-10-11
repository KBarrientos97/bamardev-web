import { useRef, useState } from "react";
import { Boton, Modal } from "../../components/ui";
import { compartirComoImagen } from "../../lib/compartirTicket";
import { excede } from "../../lib/dinero";
import { fmtFechaHora, fmtMoney, fmtNum } from "../../lib/format";
import { useAuth } from "../../store/AuthContext";
import type { Mesa } from "../../types/salon";
import { datosComprobanteMesa } from "./datosComprobanteMesa";

/**
 * La cuenta (precuenta) o el recibo de una mesa, para imprimirlo o mandarlo.
 *
 * En la app el mesero lo tenía desde la hoja de la mesa y desde "Mi turno";
 * en la web no existía, y el cliente que pedía la cuenta en papel —o el
 * recibo después de pagarle al mesero— se quedaba sin él.
 *
 * Al imprimir sale sólo el ticket: `id="area-impresion"` es lo único que
 * `index.css` deja visible (el mismo mecanismo que el recibo del POS).
 */
export default function ComprobanteMesa({
  mesa,
  onCerrar,
}: {
  mesa: Mesa;
  onCerrar: () => void;
}) {
  const { negocio } = useAuth();
  const d = datosComprobanteMesa(mesa);
  const ticket = useRef<HTMLElement>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [aviso, setAviso] = useState("");

  async function compartir() {
    if (!ticket.current || compartiendo) return;
    setAviso("");
    setCompartiendo(true);
    const nombre = (d.comprobante || d.mesaTitulo).replace(/[^A-Za-z0-9_-]/g, "_");
    const res = await compartirComoImagen(ticket.current, nombre);
    setCompartiendo(false);
    // Cancelar el diálogo del sistema no es un error que mostrar.
    if (!res.ok && res.motivo === "no_soportado") {
      setAviso("Se descargó la imagen para que la adjuntes.");
    } else if (!res.ok && res.motivo === "error") {
      setAviso("No se pudo preparar el comprobante.");
    }
  }

  const porPersona = d.comensales > 0 ? d.total / d.comensales : 0;

  return (
    <Modal
      abierto
      titulo={d.esRecibo ? "Recibo" : "La cuenta"}
      onClose={onCerrar}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" icono="printer" onClick={() => window.print()}>
            Imprimir
          </Boton>
          <Boton icono="arrowUpRight" onClick={compartir} disabled={compartiendo}>
            {compartiendo ? "Preparando…" : "Enviar"}
          </Boton>
        </>
      }
    >
      <article
        id="area-impresion"
        ref={ticket}
        className="mx-auto max-w-[300px] bg-white p-1 text-texto"
      >
        <header className="pb-2 text-center">
          <h3 className="text-base font-bold">{negocio?.nombre ?? "BamarDev"}</h3>
          {/* El papel dice qué es: una precuenta que se parece a un recibo
              sirve para que alguien crea que ya pagó. */}
          <p
            className={`mt-1 inline-block rounded-lg px-2 py-0.5 text-[10px] font-bold tracking-wide ${
              d.esRecibo
                ? "bg-primary-50 text-primary-700"
                : "bg-warning-bg text-warning-text"
            }`}
          >
            {d.esRecibo ? "RECIBO DE PAGO" : "CUENTA · NO ES COMPROBANTE DE PAGO"}
          </p>
        </header>

        <div className="border-t border-dashed border-borde pt-2 text-xs text-texto-2">
          <p className="font-bold text-texto">{d.mesaTitulo}</p>
          <p>
            {[
              d.zona,
              `${d.comensales} ${d.comensales === 1 ? "persona" : "personas"}`,
              d.meseroNombre ? `Atiende ${d.meseroNombre}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {d.fecha && (
            <p>
              {fmtFechaHora(d.fecha)}
              {d.comprobante ? ` · Ticket ${d.comprobante}` : ""}
            </p>
          )}
        </div>

        <div className="mt-2 space-y-1 border-t border-dashed border-borde pt-2 text-sm">
          {d.lineas.map((l, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate">{l.nombre}</span>
                <span className="text-xs text-texto-3">
                  {fmtNum(l.cantidad)} × {fmtMoney(l.precio)}
                </span>
              </span>
              <span className="shrink-0 font-semibold">{fmtMoney(l.total)}</span>
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-borde pt-2">
          <div className="flex justify-between text-base font-extrabold">
            <span>TOTAL</span>
            <span>{fmtMoney(d.total)}</span>
          </div>
          {d.comensales > 1 && (
            <p className="text-right text-xs text-texto-3">
              {fmtMoney(porPersona)} por persona
            </p>
          )}
        </div>

        {d.pagos.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-dashed border-borde pt-2 text-sm">
            {d.pagos.map((p, i) => (
              <div key={i}>
                <div className="flex justify-between">
                  <span>{p.formaPago}</span>
                  <span className="font-semibold">{fmtMoney(p.monto)}</span>
                </div>
                {/* Recibido y cambio sólo si le dieron de más: en un pago
                    justo o por QR, "Cambio Bs 0" es ruido en el papel. */}
                {excede(p.recibido, p.monto) && (
                  <>
                    <div className="flex justify-between text-xs text-texto-3">
                      <span>Recibido</span>
                      <span>{fmtMoney(p.recibido)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-texto-3">
                      <span>Cambio</span>
                      <span>{fmtMoney(p.entregado)}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 border-t border-dashed border-borde pt-2 text-center text-xs text-texto-3">
          {d.esRecibo ? "¡Gracias por su compra!" : "Gracias por su visita"}
        </p>
      </article>

      {aviso && <p className="mt-3 text-center text-[13px] text-texto-2">{aviso}</p>}
    </Modal>
  );
}
