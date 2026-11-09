import { Cargando, ErrorMsg } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { fechaCorta, nombreDe } from "../../lib/academia/formato";
import type { ClaseDelHorario } from "../../lib/academia/tipos";
import { capitalizar, diaCorto } from "../../lib/agenda/horaAgenda";
import { isoDia } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { Chip, LISTA } from "./piezas";

/**
 * «Ver su horario» en la tarjeta de cada docente (tanda 2 de la revisión del
 * 08-nov): sus clases de hoy y de las dos semanas que vienen, por día, con la
 * hora, el curso, el módulo y el aula. Las suspendidas y las suyas que ese día
 * da otro se ven marcadas: así el dueño sabe si ese día tiene que cubrirlo.
 */
export function HorarioDocente({ personalId, nombre }: { personalId: number; nombre: string }) {
  const horario = useApi(() => apiAcademia.horarioDocente(personalId), [personalId]);
  if (horario.error && !horario.datos) return <ErrorMsg onReintentar={horario.recargar}>{horario.error}</ErrorMsg>;
  if (!horario.datos) return <Cargando />;
  const clases = horario.datos.clases;
  if (!clases.length) {
    return <p className="text-[13px] text-texto-3">{nombre} no tiene clases en las próximas dos semanas.</p>;
  }
  const hoy = isoDia(new Date());
  const dias = [...new Set(clases.map((c) => c.fecha))];
  return (
    <div aria-label={`Horario de ${nombre}`} className="space-y-3">
      {dias.map((dia) => (
        <section key={dia} aria-label={capitalizar(diaCorto(dia).toLowerCase())} className="space-y-1">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-texto-3">
            {capitalizar(diaCorto(dia).toLowerCase())} {fechaCorta(dia)}
            {dia === hoy ? " · hoy" : ""}
          </h3>
          <ul className={`rounded-xl border border-borde-soft ${LISTA.lista}`}>
            {clases
              .filter((c) => c.fecha === dia)
              .map((c) => (
                <FilaHorario key={c.sesionId} c={c} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FilaHorario({ c }: { c: ClaseDelHorario }) {
  const fuera = c.estado === "SUSPENDIDA" || !c.mia;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <span className={`w-24 shrink-0 text-sm font-bold tabular-nums ${fuera ? "text-texto-4 line-through" : "text-texto"}`}>
        {c.horaInicio}–{c.horaFin}
      </span>
      <span className="min-w-0 flex-1 basis-40 text-[13px] text-texto-2">
        {[nombreDe(c.carrera), c.grupo, `M${c.materia.orden} ${c.materia.nombre}`, c.aula].filter(Boolean).join(" · ")}
      </span>
      {c.estado === "SUSPENDIDA" ? (
        <Chip tono="rojo" className="text-[12px]">
          suspendida
        </Chip>
      ) : !c.mia ? (
        <Chip tono="azul" className="text-[12px]">
          la da {c.docente?.nombre ?? "otro"}
        </Chip>
      ) : c.reemplazo ? (
        <Chip tono="azul" className="text-[12px]">
          reemplazo
        </Chip>
      ) : null}
    </li>
  );
}
