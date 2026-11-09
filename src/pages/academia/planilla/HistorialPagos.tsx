import { useState } from "react";
import { Cargando, ErrorMsg, Vacio } from "../../../components/ui";
import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { tituloMes } from "../../../lib/academia/calendario";
import { textoPagado } from "../../../lib/academia/pagosDocente";
import type { HistorialPagosDocente } from "../../../lib/academia/tipos";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { BotonFila, Chip, LISTA, Tarjeta } from "../piezas";
import ComprobantePago from "./ComprobantePago";

/**
 * El historial de pagos de un docente (ítem 17 de la revisión del 08-nov):
 * cada mes cerrado con cuánto, con qué, cuándo y quién le pagó, del más nuevo
 * al más viejo, y en cada uno pagado «Mandar el comprobante». Se abre desde
 * su tarjeta en «Pagos a docentes» o desde la pantalla Docentes
 * (`/academia/planilla?docente=ID`).
 *
 * `version` sube cuando se paga algo en la pantalla: el historial se vuelve a
 * pedir para que el mes recién pagado aparezca.
 */
export default function HistorialPagos({
  personalId,
  version = 0,
  onDocente,
}: {
  personalId: number;
  version?: number;
  /** Avisa el nombre del docente apenas se sabe (el título de la pantalla). */
  onDocente?: (h: HistorialPagosDocente) => void;
}) {
  const carga = useApi(async () => {
    const h = await apiAcademia.pagosDocente(personalId);
    onDocente?.(h);
    return h;
  }, [personalId, version]);
  const h = carga.datos;
  const [comprobante, setComprobante] = useState<string | null>(null);
  const pagado = h ? h.pagos.filter((x) => x.estado === "PAGADA").reduce((s, x) => s + x.liquido, 0) : 0;

  return (
    <Tarjeta
      titulo="Historial de pagos"
      bajada={h && h.pagos.length ? `Pagado en total: ${fmtMoney(pagado)}` : undefined}
      sinRelleno
    >
      {carga.error && !h ? (
        <div className="p-4 sm:p-5">
          <ErrorMsg onReintentar={carga.recargar}>{carga.error}</ErrorMsg>
        </div>
      ) : !h ? (
        <Cargando />
      ) : h.pagos.length === 0 ? (
        <Vacio icono="fileText" titulo="Todavía no se le pagó ningún mes" />
      ) : (
        <ul aria-label={`Pagos a ${h.docente.nombre}`} className={LISTA.lista}>
          {h.pagos.map((x) => (
            <li key={x.mes} aria-label={tituloMes(x.mes)} className={`${LISTA.item} flex flex-wrap items-center gap-x-4 gap-y-2`}>
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-sm font-bold text-texto">{tituloMes(x.mes)}</p>
                <p className="text-[13px] text-texto-3">
                  {x.estado === "PAGADA"
                    ? [x.liquido > 0 ? textoPagado(x) : "Resuelta sin pago", x.pagadoPor ? `pagó ${x.pagadoPor}` : null].filter(Boolean).join(" · ")
                    : "Cerrada, falta pagarla"}
                </p>
              </div>
              <span className="text-base font-bold tabular-nums text-texto">{fmtMoney(x.liquido)}</span>
              {x.estado === "PAGADA" && x.liquido > 0 ? (
                <BotonFila icono="phone" className="min-h-11 sm:min-h-0" onClick={() => setComprobante(x.mes)} aria-label={`Mandar el comprobante de ${tituloMes(x.mes)}`}>
                  Mandar el comprobante
                </BotonFila>
              ) : (
                <Chip tono={x.estado === "PAGADA" ? "verde" : "ambar"}>{x.estado === "PAGADA" ? "pagada" : "cerrada"}</Chip>
              )}
            </li>
          ))}
        </ul>
      )}
      {comprobante && h && <ComprobantePago personalId={personalId} mes={comprobante} historial={h} onClose={() => setComprobante(null)} />}
    </Tarjeta>
  );
}
