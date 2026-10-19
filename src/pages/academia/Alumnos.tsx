import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Buscador, Chips, EncabezadoPagina, FilaFiltros } from "../../components/filtros";
import { Paginacion } from "../../components/Paginacion";
import { Boton, Cargando, ErrorMsg, Select, Vacio } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { fechaCorta, nombreAlumno, nombreDe } from "../../lib/academia/formato";
import type { AlumnoFila } from "../../lib/academia/tipos";
import { useFiltroSede } from "../../lib/academia/useFiltroSede";
import { usePalabras } from "../../lib/academia/usePalabras";
import { rutaCobroInscripcion, textoEstadoInscripcion } from "../../lib/academia/vista";
import { fmtMoney } from "../../lib/format";
import { usePaginado } from "../../lib/paginado";
import { soloLoSuyo, tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import Inscribir from "./Inscribir";

/**
 * Supuesto: los valores de `estado` que acepta `GET /academia/alumnos` son
 * los de la inscripción actual (PA §7). Vacío = todos.
 */
const ESTADOS = [
  ["", "Todos"],
  ["ACTIVA", "Activos"],
  ["OBSERVACION", "En observación"],
  ["RETIRADA", "Retirados"],
  ["CONCLUIDA", "Concluidos"],
] as const;

/**
 * E7 · Alumnos (PLAN-ACADEMIAS §5): lista y búsqueda por nombre, CI, código o
 * teléfono, con los filtros de sede, carrera, estado y "sólo los que deben".
 * Tocar una fila abre la ficha (E6). El docente ve los de sus grupos, sin
 * montos.
 */
export default function Alumnos() {
  const { usuario, puede } = useAuth();
  const p = usePalabras();
  const navigate = useNavigate();
  const sede = useFiltroSede();
  const [q, setQ] = useState("");
  const [buscado, setBuscado] = useState("");
  const [estado, setEstado] = useState<(typeof ESTADOS)[number][0]>("");
  const [carreraId, setCarreraId] = useState<number | null>(null);
  const [debe, setDebe] = useState(false);
  const [inscribiendo, setInscribiendo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBuscado(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const sinMontos = soloLoSuyo(usuario, "academia.ver");
  const carreras = useApi(() => apiAcademia.carreras().catch(() => []), []);
  const lista = usePaginado(
    (pg) =>
      apiAcademia.alumnos({
        ...pg,
        q: buscado || undefined,
        sede: sede.sucursalId,
        carreraId,
        estado: estado || undefined,
        debe: debe || undefined,
      }),
    [buscado, sede.sucursalId, carreraId, estado, debe],
  );
  const preinscripciones = useApi(
    () =>
      puede("academia_preinscripciones")
        ? apiAcademia.preinscripciones({ pageSize: 1 }).then((r) => r.total).catch(() => 0)
        : Promise.resolve(0),
    [],
  );
  const inscribe = tienePermiso(usuario, "academia.inscribir");
  const hayFiltros = !!buscado || !!estado || carreraId != null || debe || sede.sucursalId != null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
      <EncabezadoPagina
        titulo={p.Alumnos}
        subtitulo={lista.total ? `${lista.total} ${lista.total === 1 ? p.alumno : p.alumnos}` : undefined}
        accion={
          <div className="flex flex-wrap items-center gap-2">
            {puede("academia_preinscripciones") && (
              <Link
                to="/academia/preinscripciones"
                className="inline-flex items-center gap-1.5 rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted"
              >
                Preinscripciones
                {(preinscripciones.datos ?? 0) > 0 && <span className="tabular-nums text-primary-700">{preinscripciones.datos}</span>}
              </Link>
            )}
            {inscribe && (
              <Boton icono="plus" onClick={() => setInscribiendo(true)}>
                Inscribir {p.alumno}
              </Boton>
            )}
          </div>
        }
      />

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="min-w-0 flex-1 basis-56">
            <Buscador valor={q} onChange={setQ} placeholder={`Buscar ${p.alumno}: nombre, CI, código o teléfono`} />
          </div>
          {(carreras.datos?.length ?? 0) > 1 && (
            <div className="w-full sm:w-56">
              <Select
                aria-label={p.Carrera}
                value={carreraId ?? ""}
                onChange={(e) => setCarreraId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">{p.Carrera}: todas</option>
                {carreras.datos?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
        <FilaFiltros>
          {sede.selector}
          <Chips titulo="Estado" valor={estado} opciones={ESTADOS} onChange={setEstado} />
          {!sinMontos ? (
            <Chips
              titulo="Deuda"
              valor={debe ? "si" : ""}
              opciones={[
                ["", "Con o sin deuda"],
                ["si", "Sólo los que deben"],
              ]}
              onChange={(v) => setDebe(v === "si")}
            />
          ) : null}
        </FilaFiltros>
      </div>

      {lista.error && !lista.items.length ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : lista.cargando && !lista.items.length ? (
        <Cargando />
      ) : lista.items.length === 0 ? (
        <Vacio
          icono="users"
          titulo={hayFiltros ? `Ningún ${p.alumno} con estos filtros` : `Todavía no hay ${p.alumnos}`}
          texto={hayFiltros ? "Probá con otra búsqueda." : undefined}
        />
      ) : (
        <>
          <ListaAlumnos filas={lista.items} sinMontos={sinMontos} onAbrir={(a) => navigate(`/academia/alumnos/${a.id}`)} />
          <Paginacion {...lista.paginacion} />
        </>
      )}

      {inscribiendo && (
        <Inscribir
          onCerrar={() => setInscribiendo(false)}
          onInscrito={(r) => {
            setInscribiendo(false);
            lista.recargar();
            if (r.cobrar) navigate(rutaCobroInscripcion(r.inscripcion.id, r.inscripcion.grupo?.sede, r.montoHoy));
          }}
        />
      )}
    </div>
  );
}

function ListaAlumnos({
  filas,
  sinMontos,
  onAbrir,
}: {
  filas: AlumnoFila[];
  sinMontos: boolean;
  onAbrir: (a: AlumnoFila) => void;
}) {
  const p = usePalabras();
  const columnas = sinMontos
    ? "grid-cols-[minmax(200px,2fr)_minmax(160px,1.5fr)_110px_130px]"
    : "grid-cols-[minmax(200px,2fr)_minmax(160px,1.5fr)_110px_110px_130px]";
  return (
    <>
      <div className="hidden md:block">
        <div className={`grid ${columnas} gap-3 px-3 pb-2 text-[12px] text-texto-3`}>
          <span>{p.Alumno}</span>
          <span>Grupo actual</span>
          <span>Plan</span>
          {!sinMontos && <span className="text-right">Saldo</span>}
          <span>Última asistencia</span>
        </div>
        <ul>
          {filas.map((a) => {
            const e = textoEstadoInscripcion(a.estado);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onAbrir(a)}
                  className={`grid w-full ${columnas} items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted ${
                    e.tono === "gris" ? "opacity-60" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-texto">{nombreAlumno(a)}</span>
                    <span className="block truncate text-[12px] text-texto-3">
                      {[a.codigo, a.ci && `CI ${a.ci}`, e.tono === "ambar" || e.tono === "gris" ? e.texto.toLowerCase() : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="truncate text-sm text-texto-2">
                    {a.grupoActual ? a.grupoActual.nombre : "—"}
                  </span>
                  <span className="truncate text-sm text-texto-2">{nombreDe(a.plan) || "—"}</span>
                  {!sinMontos && (
                    <span className={`text-right text-sm font-semibold tabular-nums ${a.vencido ? "text-danger-text" : "text-texto-2"}`}>
                      {(a.saldo ?? 0) > 0 ? fmtMoney(a.saldo) : "—"}
                    </span>
                  )}
                  <span className="truncate text-sm text-texto-3">{a.ultimaAsistencia ? fechaCorta(a.ultimaAsistencia) : "—"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <ul className="divide-y divide-borde-soft md:hidden">
        {filas.map((a) => {
          const e = textoEstadoInscripcion(a.estado);
          return (
            <li key={a.id}>
              <button type="button" onClick={() => onAbrir(a)} className={`flex w-full items-start justify-between gap-3 py-3 text-left ${e.tono === "gris" ? "opacity-60" : ""}`}>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-texto">{nombreAlumno(a)}</span>
                  <span className="block truncate text-[13px] text-texto-3">
                    {[a.grupoActual?.nombre, nombreDe(a.plan), e.tono !== "normal" ? e.texto : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {!sinMontos && (a.saldo ?? 0) > 0 && (
                  <span className={`shrink-0 text-[15px] font-bold tabular-nums ${a.vencido ? "text-danger-text" : "text-texto"}`}>
                    {fmtMoney(a.saldo)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
