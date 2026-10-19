import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { Boton, Cargando, ErrorMsg, Select, Vacio } from "../../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../../lib/academia/apiAcademia";
import { fechaCorta, horarioGrupo, nombreDe } from "../../../lib/academia/formato";
import type { EstadoAsistencia, ListaDeClase } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { ApiError } from "../../../lib/api";
import { capitalizar, fechaLarga } from "../../../lib/agenda/horaAgenda";
import { fmtHora, isoDia } from "../../../lib/format";
import { soloLoSuyo } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { ErrorDeCarga, EstadoPagoTexto } from "../piezas";
import NavDocente from "./NavDocente";

type Filtro = "todos" | "debe";

/**
 * N6 · Pasar lista (ronda 2, F1b): en el celular, en la clase. Cada
 * estudiante con su estado de pago del módulo (el docente nunca ve montos ni
 * teléfonos, D6) y Presente / Ausente; arranca con todos presentes, que es lo
 * común, y se guarda todo junto. Se corrige hasta el final del día (después
 * sólo la administración: 403 LISTA_CERRADA).
 *
 * El docente entra desde Mis clases (`/academia/lista?grupo=`); la
 * administración y la recepción, desde el grupo (`/academia/grupos/:id/lista`).
 * Sin grupo, se elige entre las clases de hoy.
 */
export default function PasarLista() {
  const p = usePalabras();
  const { usuario } = useAuth();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const grupoId = Number(id ?? params.get("grupo")) || null;
  const fecha = params.get("fecha") ?? undefined;
  const docente = soloLoSuyo(usuario, "asistencia.registrar");

  // Sin grupo en la dirección: las clases de hoy para elegir (y si es una, esa).
  const hoy = useApi(() => (grupoId ? Promise.resolve(null) : apiAcademia.misClases()), [grupoId]);
  useEffect(() => {
    const clases = hoy.datos?.clases ?? [];
    if (!grupoId && clases.length === 1) setParams({ grupo: String(clases[0].grupoId) }, { replace: true });
  }, [hoy.datos, grupoId, setParams]);

  if (!grupoId) {
    const clases = hoy.datos?.clases ?? [];
    return (
      <div className="mx-auto max-w-xl space-y-4 p-4 pb-24 sm:p-6">
        <h1 className="text-xl font-bold text-texto">Pasar lista</h1>
        {hoy.error ? (
          <ErrorMsg onReintentar={hoy.recargar}>{hoy.error}</ErrorMsg>
        ) : !hoy.datos ? (
          <Cargando />
        ) : clases.length === 0 ? (
          <Vacio icono="calendar" titulo="Hoy no tenés clases" texto="La lista se pasa el día de la clase." />
        ) : (
          <Select aria-label="Clase" value="" onChange={(e) => setParams({ grupo: e.target.value })}>
            <option value="">Elegí la clase…</option>
            {clases.map((c) => (
              <option key={c.sesionId} value={c.grupoId}>
                {c.horaInicio} · {nombreDe(c.carrera)} · {c.nombre}
              </option>
            ))}
          </Select>
        )}
        {docente && <NavDocente />}
      </div>
    );
  }
  return <Lista key={`${grupoId}-${fecha ?? ""}`} grupoId={grupoId} fecha={fecha} docente={docente} palabras={p} />;
}

function Lista({
  grupoId,
  fecha,
  docente,
  palabras: p,
}: {
  grupoId: number;
  fecha?: string;
  docente: boolean;
  palabras: ReturnType<typeof usePalabras>;
}) {
  // Sin clase ese día (404 SIN_CLASE) no es un error: es "hoy no toca". Otro
  // 404 es un grupo que no existe o, para el docente, que no es suyo
  // (GRUPO_NO_EXISTE): eso no es "ese día no hay clase" (QA ronda 2, N-3).
  const lista = useApi(
    () =>
      apiAcademia.lista(grupoId, fecha).catch((e: unknown) => {
        if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.SIN_CLASE) return null;
        throw e;
      }),
    [grupoId, fecha],
  );
  const grupo = useApi(() => apiAcademia.grupo(grupoId).catch(() => null), [grupoId]);
  const [estados, setEstados] = useState<Record<number, EstadoAsistencia>>({});
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [guardando, setGuardando] = useState(false);
  const [guardadaEn, setGuardadaEn] = useState<string | null>(null);
  const [error, setError] = useState("");

  const d = lista.datos;
  // Lo guardado manda; lo que nunca se marcó arranca presente.
  useEffect(() => {
    if (!d) return;
    setEstados(Object.fromEntries(d.alumnos.map((a) => [a.inscripcionId, a.estado ?? "PRESENTE"])));
  }, [d]);

  const conteo = useMemo(() => {
    const vals = Object.values(estados);
    const ausentes = vals.filter((e) => e === "AUSENTE").length;
    return { presentes: vals.length - ausentes, ausentes };
  }, [estados]);

  const volver = docente ? "/academia/mis-clases" : `/academia/grupos/${grupoId}`;
  const sinClase = !lista.cargando && !lista.error && d === null;

  async function guardar(datos: ListaDeClase) {
    setGuardando(true);
    setError("");
    try {
      await apiAcademia.guardarLista(
        grupoId,
        datos.sesion.fecha,
        datos.alumnos.map((a) => ({ inscripcionId: a.inscripcionId, estado: estados[a.inscripcionId] ?? "PRESENTE" })),
      );
      setGuardadaEn(new Date().toISOString());
    } catch (e) {
      setError(
        e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.LISTA_CERRADA
          ? "La lista de ese día ya cerró: para corregirla, pedíselo a la administración."
          : e instanceof ApiError && e.codigo === "LISTA_FUTURA"
            ? "Todavía no es el día de esa clase."
            : e instanceof Error
            ? e.message
            : "No se pudo guardar la lista",
      );
    } finally {
      setGuardando(false);
    }
  }

  const g = grupo.datos;
  const titulo = g
    ? `${nombreDe(g.carrera)} · ${horarioGrupo(g)}`
    : d?.grupo
      ? `${nombreDe(d.grupo.carrera)} · ${d.grupo.nombre}`
      : "Pasar lista";
  const alumnos = (d?.alumnos ?? []).filter((a) => filtro === "todos" || a.estadoPago !== "PAGADO");
  const deben = (d?.alumnos ?? []).filter((a) => a.estadoPago && a.estadoPago !== "PAGADO").length;
  const esHoy = d ? d.sesion.fecha === isoDia(new Date()) : true;

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-40 sm:p-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Link to={volver} aria-label="Volver" className="flex h-9 w-9 items-center justify-center rounded-xl border border-borde bg-white text-texto-2">
            <Icon name="arrowLeft" size={18} />
          </Link>
          <Link to={docente ? `/academia/notas?grupo=${grupoId}` : `/academia/grupos/${grupoId}/notas`} className="flex items-center gap-1.5 text-sm font-semibold text-primary-700">
            <Icon name="edit" size={15} /> Notas del {p.materia}
          </Link>
        </div>
        <h1 className="text-xl font-bold text-texto">{titulo}</h1>
        {d && (
          <p className="text-[13px] text-texto-3">
            M{d.sesion.materia.orden} {d.sesion.materia.nombre} · {esHoy ? "Hoy " : ""}
            {capitalizar(fechaLarga(d.sesion.fecha)).toLowerCase()}
            {(g?.aula ?? d.grupo?.aula) ? ` · ${g?.aula ?? d.grupo?.aula}` : ""}
          </p>
        )}
        {d && (
          <p className="text-sm text-texto-2">
            {d.resumen.pagaron} de {d.resumen.total} ya pagaron el M{d.sesion.materia.orden}
          </p>
        )}
      </header>

      {lista.error && !d ? (
        <ErrorDeCarga
          falla={lista.falla}
          mensaje={lista.error}
          onReintentar={lista.recargar}
          que="este grupo"
          volver={{ a: volver, texto: docente ? "Ir a mis clases" : "Volver al grupo" }}
        />
      ) : sinClase ? (
        <Vacio
          icono="calendar"
          titulo="Ese día no hay clase de este grupo"
          accion={
            <Link to={volver} className="text-sm font-semibold text-primary-700">
              Volver
            </Link>
          }
        />
      ) : !d ? (
        <Cargando />
      ) : (
        <>
          <div role="tablist" aria-label={`Filtrar ${p.alumnos}`} className="flex gap-5 border-b border-borde-soft">
            {(
              [
                ["todos", "Todos", d.alumnos.length],
                ["debe", "Sin pagar o abonó", deben],
              ] as const
            ).map(([k, label, n]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={filtro === k}
                onClick={() => setFiltro(k)}
                className={`-mb-px border-b-2 pb-2.5 pt-1 text-sm ${filtro === k ? "border-primary font-semibold text-texto" : "border-transparent text-texto-3"}`}
              >
                {label} <span className={`tabular-nums ${k === "debe" && n > 0 ? "text-warning-text" : "text-texto-4"}`}>{n}</span>
              </button>
            ))}
          </div>

          <ul className="divide-y divide-borde-soft">
            {alumnos.map((a) => {
              const estado = estados[a.inscripcionId] ?? "PRESENTE";
              const ausente = estado === "AUSENTE";
              return (
                <li key={a.inscripcionId} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className={`block truncate text-[15px] ${ausente ? "text-texto-3" : "text-texto"}`}>{a.nombre}</span>
                    <EstadoPagoTexto estado={a.estadoPago} />
                  </span>
                  <div role="group" aria-label={`Asistencia de ${a.nombre}`} className="flex shrink-0 overflow-hidden rounded-xl border border-borde">
                    {(
                      [
                        ["PRESENTE", "Presente"],
                        ["AUSENTE", "Ausente"],
                      ] as const
                    ).map(([e, label]) => {
                      const on = e === "AUSENTE" ? ausente : !ausente;
                      return (
                        <button
                          key={e}
                          type="button"
                          aria-pressed={on}
                          disabled={!d.editable}
                          onClick={() => {
                            setEstados({ ...estados, [a.inscripcionId]: e });
                            setGuardadaEn(null);
                          }}
                          className={`min-h-11 px-3 text-[13px] font-semibold disabled:opacity-60 ${
                            on ? (e === "AUSENTE" ? "bg-danger-bg text-danger-text" : "bg-primary-boton text-white") : "bg-white text-texto-3"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-[13px] text-texto-3">Si alguien no pagó, recordáselo en clase; recepción le manda el QR.</p>

          <div className={`fixed inset-x-0 z-20 space-y-1.5 border-t border-borde-soft bg-white p-3 md:static md:border-0 md:p-0 ${docente ? "bottom-[57px] md:bottom-auto" : "bottom-0"}`}>
            <ErrorMsg>{error}</ErrorMsg>
            {d.editable ? (
              <Boton className="w-full" disabled={guardando} onClick={() => void guardar(d)}>
                {guardando
                  ? "Guardando…"
                  : `Guardar lista (${conteo.presentes} ${conteo.presentes === 1 ? "presente" : "presentes"}, ${conteo.ausentes} ${conteo.ausentes === 1 ? "ausente" : "ausentes"})`}
              </Boton>
            ) : (
              <p className="text-center text-[13px] text-texto-3">La lista de ese día ya cerró.</p>
            )}
            {(guardadaEn || (d.guardada && !guardadaEn && d.editable)) && (
              <p role="status" className="text-center text-[13px] text-texto-3">
                {guardadaEn ? `Guardada a las ${fmtHora(guardadaEn)} · podés corregirla hasta el final del día` : `Ya guardada el ${fechaCorta(d.sesion.fecha)} · podés corregirla`}
              </p>
            )}
          </div>
        </>
      )}
      {docente && <NavDocente />}
    </div>
  );
}
