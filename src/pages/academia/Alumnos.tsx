import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Buscador, FilaFiltros } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { Paginacion } from "../../components/Paginacion";
import { Boton, Cargando, ErrorMsg, Select, Vacio } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { horarioGrupo, nombreAlumno, nombreDe } from "../../lib/academia/formato";
import type { AlumnoFila, EstadoFotos, FiltroAlumnos } from "../../lib/academia/tipos";
import { useFiltroSede } from "../../lib/academia/useFiltroSede";
import { usePalabras } from "../../lib/academia/usePalabras";
import { rutaCobroInscripcion, textoEstadoInscripcion } from "../../lib/academia/vista";
import { fmtMoney } from "../../lib/format";
import { usePaginado } from "../../lib/paginado";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import Inscribir from "./Inscribir";
import { FiltrosConteo } from "./piezas";

type Vista = "todos" | "deben" | "retirados";

/** Lo que pide cada pestaña a `GET /academia/alumnos`. */
const FILTRO_VISTA: Record<Vista, Pick<FiltroAlumnos, "estado" | "debe">> = {
  todos: {},
  deben: { debe: true },
  retirados: { estado: "RETIRADA" },
};

/** Cómo se lee el estado de las fotos: gris si están bien, ámbar o rojo si piden algo. */
const FOTOS: Record<EstadoFotos, { texto: string; tono: string; ok: boolean }> = {
  COMPLETAS: { texto: "Fotos", tono: "text-texto-4", ok: true },
  POR_REVISAR: { texto: "Fotos por revisar", tono: "text-warning-text", ok: false },
  OBSERVADAS: { texto: "Fotos observadas", tono: "font-semibold text-danger-text", ok: false },
  FALTAN: { texto: "Faltan fotos", tono: "font-semibold text-danger-text", ok: false },
};

/**
 * E7 · Estudiantes (PLAN-ACADEMIAS §5, ronda 2): la lista con búsqueda por
 * nombre, CI, código o teléfono y los filtros de curso y grupo. Las pestañas
 * son los indicadores (Todos · Deben · Retirados). Cada fila dice su curso y
 * grupo, la forma de pago, si debe (rojo sólo lo vencido) y cómo están sus 3
 * fotos (D7). Tocar una fila abre la ficha (E6).
 */
export default function Alumnos() {
  const { usuario, puede } = useAuth();
  const p = usePalabras();
  const navigate = useNavigate();
  const sede = useFiltroSede();
  const [q, setQ] = useState("");
  const [buscado, setBuscado] = useState("");
  const [vista, setVista] = useState<Vista>("todos");
  const [carreraId, setCarreraId] = useState<number | null>(null);
  const [grupoId, setGrupoId] = useState<number | null>(null);
  const [inscribiendo, setInscribiendo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBuscado(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const carreras = useApi(() => apiAcademia.carreras().catch(() => []), []);
  const grupos = useApi(
    () => apiAcademia.grupos({ pageSize: 100, sede: sede.sucursalId, carreraId }).then((r) => r.items).catch(() => []),
    [sede.sucursalId, carreraId],
  );
  const base = { q: buscado || undefined, sede: sede.sucursalId, carreraId, grupoId };
  const lista = usePaginado(
    (pg) => apiAcademia.alumnos({ ...pg, ...base, ...FILTRO_VISTA[vista] }),
    [buscado, sede.sucursalId, carreraId, grupoId, vista],
  );
  // Los números de cada pestaña, con los mismos filtros (una página de 1 fila).
  const conteos = useApi(
    () =>
      Promise.all(
        (Object.keys(FILTRO_VISTA) as Vista[]).map((v) =>
          apiAcademia
            .alumnos({ ...base, ...FILTRO_VISTA[v], page: 1, pageSize: 1 })
            .then((r) => [v, r.total] as const)
            .catch(() => [v, null] as const),
        ),
      ).then((pares) => Object.fromEntries(pares) as Record<Vista, number | null>),
    [buscado, sede.sucursalId, carreraId, grupoId],
  );
  const preinscripciones = useApi(
    () =>
      puede("academia_preinscripciones")
        ? apiAcademia.preinscripciones({ pageSize: 1 }).then((r) => r.total).catch(() => 0)
        : Promise.resolve(0),
    [],
  );
  const inscribe = tienePermiso(usuario, "academia.inscribir");
  const hayFiltros = !!buscado || carreraId != null || grupoId != null || vista !== "todos";
  const nombreSede = sede.nombre || usuario?.sucursal || "";
  const n = (v: Vista) => conteos.datos?.[v] ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-texto">{p.Alumnos}</h1>
          <p className="mt-0.5 text-[13px] text-texto-3">
            {[nombreSede, n("todos") != null ? `${n("todos")} ${n("todos") === 1 ? p.alumno : p.alumnos}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {inscribe && (
          <Boton icono="plus" onClick={() => setInscribiendo(true)}>
            Inscribir {p.alumno}
          </Boton>
        )}
      </header>

      <FiltrosConteo<Vista>
        etiqueta={`Filtrar ${p.alumnos}`}
        valor={vista}
        onChange={setVista}
        opciones={[
          { clave: "todos", label: "Todos", n: n("todos") },
          { clave: "deben", label: "Deben", n: n("deben"), urgente: true },
          { clave: "retirados", label: "Retirados", n: n("retirados") },
        ]}
        derecha={
          puede("academia_preinscripciones") ? (
            <Link to="/academia/preinscripciones" className="flex items-center gap-1.5 pb-2 text-sm font-semibold text-primary-700 hover:underline">
              Inscripciones online
              {(preinscripciones.datos ?? 0) > 0 && (
                <span className="rounded-full bg-primary-50 px-1.5 text-[12px] tabular-nums">{preinscripciones.datos}</span>
              )}
            </Link>
          ) : undefined
        }
      />

      <FilaFiltros>
        <div className="min-w-0 flex-1 basis-56">
          <Buscador valor={q} onChange={setQ} placeholder="Nombre, CI, código o teléfono" />
        </div>
        {sede.selector}
        {(carreras.datos?.length ?? 0) > 1 && (
          <div className="w-full sm:w-48">
            <Select
              aria-label={p.Carrera}
              value={carreraId ?? ""}
              onChange={(e) => {
                setCarreraId(e.target.value ? Number(e.target.value) : null);
                setGrupoId(null);
              }}
            >
              <option value="">{p.Carrera}: todos</option>
              {carreras.datos?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </div>
        )}
        {(grupos.datos?.length ?? 0) > 1 && (
          <div className="w-full sm:w-56">
            <Select aria-label="Grupo" value={grupoId ?? ""} onChange={(e) => setGrupoId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Grupo: todos</option>
              {grupos.datos?.map((g) => (
                <option key={g.id} value={g.id}>
                  {nombreDe(g.carrera)} · {horarioGrupo(g)}
                </option>
              ))}
            </Select>
          </div>
        )}
      </FilaFiltros>

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
          <ListaAlumnos filas={lista.items} onAbrir={(a) => navigate(`/academia/alumnos/${a.id}`)} />
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

/** "Al día" en gris o "Debe Bs 500" (rojo si venció). */
function EstadoCuenta({ a }: { a: AlumnoFila }) {
  const debe = (a.saldo ?? 0) > 0;
  return (
    <span className={`text-sm tabular-nums ${debe ? (a.vencido ? "font-semibold text-danger-text" : "font-semibold text-texto-2") : "text-texto-3"}`}>
      {debe ? `Debe ${fmtMoney(a.saldo)}` : "Al día"}
    </span>
  );
}

function Fotos({ estado }: { estado?: EstadoFotos }) {
  if (!estado) return <span className="text-sm text-texto-4">—</span>;
  const f = FOTOS[estado];
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] ${f.tono}`}>
      {f.ok && <Icon name="check" size={14} />}
      {f.texto}
    </span>
  );
}

function ListaAlumnos({ filas, onAbrir }: { filas: AlumnoFila[]; onAbrir: (a: AlumnoFila) => void }) {
  const p = usePalabras();
  const columnas = "grid-cols-[minmax(200px,2fr)_minmax(160px,1.5fr)_120px_140px_140px]";
  const grupo = (a: AlumnoFila) => (a.grupoActual ? a.grupoActual.nombre : "—");
  return (
    <>
      <div className="hidden md:block">
        <div className={`grid ${columnas} gap-3 px-3 pb-2 text-[12px] text-texto-3`}>
          <span>{p.Alumno}</span>
          <span>{p.Carrera} y grupo</span>
          <span>Forma de pago</span>
          <span>Estado</span>
          <span>Fotos</span>
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
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-texto-2">{grupo(a)}</span>
                    {a.grupoActual && <span className="block truncate text-[12px] text-texto-3">{nombreDe(a.grupoActual.sede)}</span>}
                  </span>
                  <span className="truncate text-sm text-texto-2">{nombreDe(a.plan) || "—"}</span>
                  <EstadoCuenta a={a} />
                  <Fotos estado={a.fotos} />
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
              <button
                type="button"
                onClick={() => onAbrir(a)}
                className={`flex w-full items-start justify-between gap-3 py-3 text-left ${e.tono === "gris" ? "opacity-60" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-texto">{nombreAlumno(a)}</span>
                  <span className="block truncate text-[13px] text-texto-3">
                    {[grupo(a), nombreDe(a.plan), e.tono !== "normal" ? e.texto : null].filter(Boolean).join(" · ")}
                  </span>
                  {a.fotos && a.fotos !== "COMPLETAS" && <Fotos estado={a.fotos} />}
                </span>
                <EstadoCuenta a={a} />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
