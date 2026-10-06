import { ETIQUETA_ACCION, type Rapida } from "../../lib/agenda/estadosCita";
import { duracionTexto, horaNegocio, minutosEntre } from "../../lib/agenda/horaAgenda";
import type { AccionCita, Cita } from "../../lib/agenda/tiposAgenda";
import { BadgeEstado } from "./piezas";

/**
 * Una cita en una lista (Hoy.dc y MiAgenda.dc del lienzo): la hora grande a la
 * izquierda, el cliente y lo que se hace, el estado, y hasta dos botones
 * rápidos. Tocar la tarjeta abre el detalle; tocar un botón NO (por eso los
 * botones cortan la propagación).
 */
export default function TarjetaCita({
  cita,
  rapidas,
  onAbrir,
  onAccion,
  ocupado = false,
  mostrarRecurso = true,
  destacada = false,
}: {
  cita: Cita;
  rapidas: Rapida[];
  onAbrir: () => void;
  onAccion: (accion: AccionCita) => void;
  ocupado?: boolean;
  mostrarRecurso?: boolean;
  destacada?: boolean;
}) {
  const servicios = [...new Set(cita.lineas.map((l) => l.servicio))].join(" + ");
  const recursos = [...new Set(cita.lineas.map((l) => l.recurso))].join(", ");
  const detalle = [servicios, mostrarRecurso ? recursos : "", cita.origen === "ONLINE" ? "online" : ""]
    .filter(Boolean)
    .join(" · ");
  const duracion = cita.inicio && cita.fin ? duracionTexto(minutosEntre(cita.inicio, cita.fin)) : "";
  // Lo que recepción tiene que ver antes de que la clienta se siente.
  const avisos: [string, string][] = [];
  if (cita.noShowSugerido) avisos.push(["No llegó", "font-semibold text-warning-text"]);
  if (cita.cliente.alergias) avisos.push([`Alergia: ${cita.cliente.alergias}`, "font-semibold text-danger-text"]);
  if (cita.cliente.noShows > 0)
    avisos.push([
      `${cita.cliente.noShows} ${cita.cliente.noShows === 1 ? "inasistencia" : "inasistencias"}`,
      "text-danger-text",
    ]);
  if (cita.cliente.nuevo) avisos.push(["Primera vez", "text-texto-3"]);

  return (
    <article
      className={`card flex flex-col gap-2.5 p-3.5 ${
        cita.noShowSugerido ? "border-warning" : destacada ? "border-primary" : ""
      }`}
    >
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Ver la cita de ${cita.cliente.nombre}`}
        className="flex items-start gap-3 text-left"
      >
        <div className="flex min-w-[52px] flex-col items-center">
          <strong className="text-base text-texto">{horaNegocio(cita.inicio)}</strong>
          <span className="text-[11px] text-texto-3">{duracion}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-texto">{cita.cliente.nombre}</p>
          <p className="text-[13px] text-texto-2">{detalle}</p>
          {avisos.length > 0 && (
            <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12px]">
              {avisos.map(([texto, clase]) => (
                <span key={texto} className={clase}>
                  {texto}
                </span>
              ))}
            </p>
          )}
        </div>
        <BadgeEstado estado={cita.estado} />
      </button>

      {rapidas.length > 0 && (
        <div className="flex gap-2">
          {rapidas.map((r) =>
            r.accion === "COBRAR" ? (
              // El cobro desde la agenda es la siguiente entrega (F1.5): se ve
              // dónde va a estar, pero todavía no hace nada.
              <button
                key="cobrar"
                type="button"
                disabled
                title="El cobro desde la agenda llega pronto"
                className="h-11 flex-1 cursor-not-allowed rounded-xl bg-warning-bg text-sm font-bold text-warning-text opacity-70"
              >
                Cobrar · llega pronto
              </button>
            ) : (
              <button
                key={r.accion}
                type="button"
                disabled={ocupado}
                onClick={() => onAccion(r.accion as AccionCita)}
                className={`h-11 flex-1 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${
                  r.principal
                    ? r.accion === "NO_ASISTIO"
                      ? "bg-danger text-white"
                      : "bg-primary-boton text-white hover:bg-primary-boton-hover"
                    : "border border-borde bg-white text-texto-2 hover:bg-muted"
                }`}
              >
                {ETIQUETA_ACCION[r.accion as AccionCita]}
              </button>
            ),
          )}
        </div>
      )}
    </article>
  );
}
