import { Icon } from "../../components/Icon";
import { ErrorMsg } from "../../components/ui";
import { horaNegocio } from "../../lib/agenda/horaAgenda";
import type { Cita } from "../../lib/agenda/tiposAgenda";
import { fmtMoney } from "../../lib/format";

/**
 * Las citas que terminaron y nadie cobró (belleza, PLAN-AGENDA-BELLEZA §10).
 *
 * Es el "Mesas por cobrar" de un salón de belleza: la profesional finaliza y
 * la cita aparece acá; tocarla carga sus servicios al carrito con quién hizo
 * cada uno, y la cajera puede sumar productos antes de cobrar.
 */
export default function CitasPorCobrar({
  citas,
  cargando,
  error,
  onReintentar,
  onAtras,
  onCobrar,
  cobrandoId,
}: {
  citas: Cita[];
  cargando: boolean;
  error: string;
  onReintentar: () => void;
  onAtras: () => void;
  onCobrar: (cita: Cita) => void;
  /** La que se está cargando al carrito (deshabilita su botón). */
  cobrandoId: number | null;
}) {
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col">
      <div className="flex items-center gap-2 border-b border-borde bg-white px-4 py-3">
        <button onClick={onAtras} aria-label="Volver" className="rounded-lg p-1.5 text-texto-2 hover:bg-muted">
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold text-texto">Citas por cobrar</h1>
          {!cargando && (
            <p className="text-xs text-texto-3">
              {citas.length === 0
                ? "No hay citas terminadas sin cobrar."
                : `${citas.length} ${citas.length === 1 ? "cita esperando" : "citas esperando"}`}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
        <ErrorMsg onReintentar={onReintentar}>{error}</ErrorMsg>
        {citas.map((c) => {
          const servicios = c.lineas.map((l) => `${l.servicio} · ${l.recurso}`).join(", ");
          return (
            <article key={c.id} className="card flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-texto">{c.cliente.nombre}</p>
                <p className="truncate text-[13px] text-texto-2">{servicios || "Sin servicios"}</p>
                <p className="text-[12px] text-texto-3">
                  {horaNegocio(c.inicio)} · {fmtMoney(c.total)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onCobrar(c)}
                disabled={cobrandoId !== null}
                aria-label={`Cobrar la cita de ${c.cliente.nombre}`}
                className="h-11 rounded-xl bg-primary-boton px-4 text-sm font-bold text-white hover:bg-primary-boton-hover disabled:opacity-50"
              >
                {cobrandoId === c.id ? "Cargando…" : "Cobrar"}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
