import { Link } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { Cargando, ErrorMsg } from "../../../components/ui";
import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { cuandoEs } from "../../../lib/academia/calendario";
import { nombreDe } from "../../../lib/academia/formato";
import type { ClaseDelDia, ProximaClase } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { capitalizar, fechaLarga } from "../../../lib/agenda/horaAgenda";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import NavDocente from "./NavDocente";

/**
 * E11a · Mis clases (ronda 2, F1b): la pantalla del docente al entrar, en el
 * celular. Sus clases de hoy con cuántos pagaron el módulo (el número que le
 * interesa: sin pago no cobra por ese estudiante, D2) y a un toque Pasar
 * lista y las Notas del módulo; abajo, las próximas.
 */
export default function MisClases() {
  const { usuario } = useAuth();
  const datos = useApi(() => apiAcademia.misClases(), []);
  const d = datos.datos;
  const nombre = (usuario?.nombre ?? usuario?.username ?? "").split(" ")[0];

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-24 sm:p-6">
      <header className="space-y-0.5">
        <p className="text-[13px] text-texto-3">{d ? capitalizar(fechaLarga(d.fecha)) : "Hoy"}</p>
        <h1 className="text-2xl font-bold text-texto">{nombre ? `Hola, ${nombre}` : "Mis clases"}</h1>
        {d && (
          <p className="text-sm text-texto-3">
            {d.clases.length === 0 ? "Hoy no tenés clases" : d.clases.length === 1 ? "Hoy das 1 clase" : `Hoy das ${d.clases.length} clases`}
          </p>
        )}
      </header>

      {datos.error && !d ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : (
        <>
          <div className="space-y-3">
            {d.clases.map((c) => (
              <Clase key={c.sesionId} c={c} />
            ))}
          </div>
          {d.proximas.length > 0 && (
            <section aria-labelledby="t-prox" className="space-y-2">
              <h2 id="t-prox" className="text-sm font-bold text-texto">
                Próximas clases
              </h2>
              <ul className="divide-y divide-borde-soft border-y border-borde-soft">
                {d.proximas.map((x, i) => (
                  <Proxima key={`${x.grupoId}-${x.fecha}-${i}`} x={x} />
                ))}
              </ul>
            </section>
          )}
          {d.clases.length === 0 && d.proximas.length === 0 && (
            <p className="text-sm text-texto-3">No hay clases tuyas en el calendario. Si es un error, avisale a la recepción.</p>
          )}
        </>
      )}
      <NavDocente />
    </div>
  );
}

function Clase({ c }: { c: ClaseDelDia }) {
  const p = usePalabras();
  const cuando = cuandoEs(c);
  const pct = c.inscritos ? Math.round(((c.pagaronModulo ?? 0) / c.inscritos) * 100) : 0;
  return (
    <article className="space-y-3 rounded-2xl border border-borde bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tabular-nums text-texto-3">
            {c.horaInicio} – {c.horaFin}
          </p>
          <p className="truncate text-base font-bold text-texto">
            {nombreDe(c.carrera)} · {c.nombre}
          </p>
          <p className="truncate text-[13px] text-texto-3">
            M{c.materia.orden} {c.materia.nombre} · {nombreDe(c.sede)}
            {c.aula ? ` · ${c.aula}` : ""} · {c.inscritos} {c.inscritos === 1 ? p.alumno : p.alumnos}
          </p>
        </div>
        <span className={`shrink-0 text-xs ${cuando === "en curso" ? "font-semibold text-primary-700" : "text-texto-3"}`}>{cuando}</span>
      </div>
      {c.pagaronModulo != null && (
        <div className="space-y-1">
          <span className="block h-1.5 overflow-hidden rounded-full bg-primary-100">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </span>
          <p className="text-[13px] text-texto-2">
            {c.pagaronModulo} de {c.inscritos} pagaron el M{c.materia.orden}
          </p>
        </div>
      )}
      <div className="flex gap-2">
        <Link
          to={`/academia/lista?grupo=${c.grupoId}`}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary-boton px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-boton-hover"
        >
          <Icon name="lista" size={17} />
          {c.lista.pasada ? `Lista: ${c.lista.presentes} de ${c.lista.total}` : "Pasar lista"}
        </Link>
        <Link
          to={`/academia/notas?grupo=${c.grupoId}`}
          className="inline-flex flex-1 items-center justify-center rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted"
        >
          Notas del {p.materia}
        </Link>
      </div>
    </article>
  );
}

function Proxima({ x }: { x: ProximaClase }) {
  const materia = typeof x.materia === "string" ? x.materia : `M${x.materia.orden} ${x.materia.nombre}`;
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-texto">{capitalizar(fechaLarga(x.fecha))}</span>
        <span className="block truncate text-[13px] text-texto-3">
          {x.nombre} · {materia}
          {x.aula ? ` · ${x.aula}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-[13px] tabular-nums text-texto-2">
        {x.horaInicio} – {x.horaFin}
      </span>
    </li>
  );
}
