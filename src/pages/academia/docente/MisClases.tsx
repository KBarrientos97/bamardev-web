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
import { Chip, claseBotonFila, EncabezadoPagina, LISTA, PaginaAcademia, Tarjeta } from "../piezas";
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
    <PaginaAcademia ancho="max-w-3xl" conBarraAbajo>
      <EncabezadoPagina
        sobre={d ? capitalizar(fechaLarga(d.fecha)) : "Hoy"}
        titulo={nombre ? `Hola, ${nombre}` : "Mis clases"}
        bajada={
          d && (d.clases.length === 0 ? "Hoy no tenés clases" : d.clases.length === 1 ? "Hoy das 1 clase" : `Hoy das ${d.clases.length} clases`)
        }
      />

      {datos.error && !d ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : (
        <>
          {d.clases.length > 0 && (
            <Tarjeta id="t-hoy" titulo="Clases de hoy" contador={d.clases.length} sinRelleno>
              <ul className={LISTA.lista}>
                {d.clases.map((c) => (
                  <Clase key={c.sesionId} c={c} />
                ))}
              </ul>
            </Tarjeta>
          )}
          {d.proximas.length > 0 && (
            <Tarjeta id="t-prox" titulo="Próximas clases" sinRelleno>
              <ul className={LISTA.lista}>
                {d.proximas.map((x, i) => (
                  <Proxima key={`${x.grupoId}-${x.fecha}-${i}`} x={x} />
                ))}
              </ul>
            </Tarjeta>
          )}
          {d.clases.length === 0 && d.proximas.length === 0 && (
            <Tarjeta etiqueta="Sin clases">
              <p className="text-sm text-texto-3">No hay clases tuyas en el calendario. Si es un error, avisale a la recepción.</p>
            </Tarjeta>
          )}
        </>
      )}
      <NavDocente />
    </PaginaAcademia>
  );
}

function Clase({ c }: { c: ClaseDelDia }) {
  const p = usePalabras();
  const cuando = cuandoEs(c);
  return (
    <li className={`space-y-3 ${LISTA.item} sm:py-4`}>
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
        <Chip tono={cuando === "en curso" ? "marca" : "gris"} className="shrink-0">
          {cuando}
        </Chip>
      </div>
      {/* Sin "17 de 22 pagaron": el docente ve sólo el semáforo (QA 23-oct), acá
          como cuántos tienen deuda, con su color. Si el backend no lo manda, nada. */}
      {c.semaforos && c.semaforos.rojo + c.semaforos.amarillo > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-texto-2">
          {c.semaforos.rojo > 0 && <Chip tono="rojo">{c.semaforos.rojo} {c.semaforos.rojo === 1 ? "pasó" : "pasaron"} la espera</Chip>}
          {c.semaforos.amarillo > 0 && <Chip tono="ambar">{c.semaforos.amarillo} en semana de espera</Chip>}
        </p>
      )}
      <div className="flex gap-2">
        <Link
          to={`/academia/lista?grupo=${c.grupoId}`}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary-boton px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-boton-hover"
        >
          <Icon name="lista" size={17} />
          {c.lista.pasada ? `Lista: ${c.lista.presentes} de ${c.lista.total}` : "Pasar lista"}
        </Link>
        <Link to={`/academia/notas?grupo=${c.grupoId}`} className={`${claseBotonFila("ghost")} flex-1 rounded-xl text-sm`}>
          <Icon name="edit" size={16} />
          Notas del {p.materia}
        </Link>
      </div>
    </li>
  );
}

function Proxima({ x }: { x: ProximaClase }) {
  const materia = typeof x.materia === "string" ? x.materia : `M${x.materia.orden} ${x.materia.nombre}`;
  return (
    <li className={`flex items-center justify-between gap-3 ${LISTA.itemHover}`}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-texto">{capitalizar(fechaLarga(x.fecha))}</span>
        <span className="block text-[13px] text-texto-3 sm:truncate">
          {x.nombre} · {materia}
          {x.aula ? ` · ${x.aula}` : ""}
        </span>
      </span>
      <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-[13px] font-semibold tabular-nums text-texto-2">
        {x.horaInicio} – {x.horaFin}
      </span>
    </li>
  );
}
