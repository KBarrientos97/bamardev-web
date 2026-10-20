import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Buscador } from "../../components/filtros";
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
import {
  BotonFila,
  Chip,
  claseBotonFila,
  EncabezadoPagina,
  FiltrosConteo,
  LISTA,
  PaginaAcademia,
  TABLA,
  Tarjeta,
  type TonoChip,
} from "./piezas";

type Vista = "todos" | "deben" | "retirados";

/** Lo que pide cada pestaña a `GET /academia/alumnos`. */
const FILTRO_VISTA: Record<Vista, Pick<FiltroAlumnos, "estado" | "debe">> = {
  todos: {},
  deben: { debe: true },
  retirados: { estado: "RETIRADA" },
};

/** Cómo se lee el estado de las fotos: gris si están bien, chip ámbar o rojo si piden algo. */
const FOTOS: Record<EstadoFotos, { texto: string; tono: TonoChip; ok: boolean }> = {
  COMPLETAS: { texto: "Fotos", tono: "gris", ok: true },
  POR_REVISAR: { texto: "Fotos por revisar", tono: "ambar", ok: false },
  OBSERVADAS: { texto: "Fotos observadas", tono: "rojo", ok: false },
  FALTAN: { texto: "Faltan fotos", tono: "rojo", ok: false },
};

/** El filtro por fotos (`?fotos=`, contrato #47): lo que pide que alguien haga algo. */
const FILTRO_FOTOS: [EstadoFotos, string][] = [
  ["FALTAN", "Faltan"],
  ["POR_REVISAR", "Por revisar"],
  ["OBSERVADAS", "Observadas"],
];

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
  const [fotos, setFotos] = useState<EstadoFotos | null>(null);
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
  const base = { q: buscado || undefined, sede: sede.sucursalId, carreraId, grupoId, fotos: fotos ?? undefined };
  const lista = usePaginado(
    (pg) => apiAcademia.alumnos({ ...pg, ...base, ...FILTRO_VISTA[vista] }),
    [buscado, sede.sucursalId, carreraId, grupoId, fotos, vista],
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
    [buscado, sede.sucursalId, carreraId, grupoId, fotos],
  );
  const preinscripciones = useApi(
    () =>
      puede("academia_preinscripciones")
        ? apiAcademia.preinscripciones({ pageSize: 1 }).then((r) => r.total).catch(() => 0)
        : Promise.resolve(0),
    [],
  );
  const inscribe = tienePermiso(usuario, "academia.inscribir");
  const hayFiltros = !!buscado || carreraId != null || grupoId != null || fotos != null || vista !== "todos";
  const nombreSede = sede.nombre || usuario?.sucursal || "";
  const n = (v: Vista) => conteos.datos?.[v] ?? null;

  return (
    <PaginaAcademia>
      <EncabezadoPagina
        titulo={p.Alumnos}
        bajada={[nombreSede, n("todos") != null ? `${n("todos")} ${n("todos") === 1 ? p.alumno : p.alumnos}` : null].filter(Boolean).join(" · ")}
        acciones={
          <>
            {puede("academia_preinscripciones") && (
              <Link to="/academia/preinscripciones" className={claseBotonFila("ghost")}>
                <Icon name="bell" size={15} />
                Inscripciones online
                {(preinscripciones.datos ?? 0) > 0 && (
                  <span className="rounded-full bg-primary-50 px-1.5 text-[12px] tabular-nums text-primary-700">{preinscripciones.datos}</span>
                )}
              </Link>
            )}
            {inscribe && (
              <Boton icono="plus" onClick={() => setInscribiendo(true)}>
                Inscribir {p.alumno}
              </Boton>
            )}
          </>
        }
      />

      {sede.selector}

      <Tarjeta
        etiqueta={`Lista de ${p.alumnos}`}
        sinRelleno
        barra={
          <FiltrosConteo<Vista>
            enTarjeta
            etiqueta={`Filtrar ${p.alumnos}`}
            valor={vista}
            onChange={setVista}
            opciones={[
              { clave: "todos", label: "Todos", n: n("todos") },
              { clave: "deben", label: "Deben", n: n("deben"), urgente: true },
              { clave: "retirados", label: "Retirados", n: n("retirados") },
            ]}
          />
        }
      >
        {/* El buscador y los desplegables, en su propia fila de la tarjeta.
            Antes iban todos dentro de `FilaFiltros`, que sólo sabe de chips:
            con 2 cursos y 2 grupos la pantalla se caía (QA ronda 2, B-01). */}
        <div className="flex flex-wrap gap-2 border-b border-borde-soft bg-muted/50 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1 basis-56">
            <Buscador valor={q} onChange={setQ} placeholder="Nombre, CI, código o teléfono" />
          </div>
          {(carreras.datos?.length ?? 0) > 1 && (
            <div className="w-[calc(50%-0.25rem)] sm:w-48">
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
            <div className="w-[calc(50%-0.25rem)] sm:w-56">
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
          <div className="w-[calc(50%-0.25rem)] sm:w-44">
            <Select aria-label="Fotos" value={fotos ?? ""} onChange={(e) => setFotos((e.target.value || null) as EstadoFotos | null)}>
              <option value="">Fotos: todas</option>
              {FILTRO_FOTOS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {lista.error && !lista.items.length ? (
          <div className="p-4 sm:p-5">
            <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
          </div>
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
            {/* `empty:hidden`: con pocas filas la paginación no dibuja nada y no queda una franja vacía. */}
            <div className="border-t border-borde-soft px-4 py-3 empty:hidden sm:px-5">
              <Paginacion {...lista.paginacion} />
            </div>
          </>
        )}
      </Tarjeta>

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
    </PaginaAcademia>
  );
}

/** "Al día" en verde o "Debe Bs 500" (rojo si venció, ámbar si todavía no). */
function EstadoCuenta({ a }: { a: AlumnoFila }) {
  const debe = (a.saldo ?? 0) > 0;
  if (!debe) return <Chip tono="verde">Al día</Chip>;
  return (
    <Chip tono={a.vencido ? "rojo" : "ambar"} className="tabular-nums">
      Debe {fmtMoney(a.saldo)}
    </Chip>
  );
}

/** Las fotos completas no piden nada y van en gris; las que piden algo, en chip de color. */
function Fotos({ estado }: { estado?: EstadoFotos }) {
  if (!estado) return <span className="text-sm text-texto-4">—</span>;
  const f = FOTOS[estado];
  if (f.ok) {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-texto-4">
        <Icon name="check" size={14} />
        {f.texto}
      </span>
    );
  }
  return <Chip tono={f.tono}>{f.texto}</Chip>;
}

/** El estado de la inscripción, sólo cuando no es el de siempre (activo). */
function EstadoInscripcion({ estado }: { estado: string }) {
  const e = textoEstadoInscripcion(estado);
  if (e.tono === "normal") return null;
  return <Chip tono={e.tono}>{e.texto}</Chip>;
}

function ListaAlumnos({ filas, onAbrir }: { filas: AlumnoFila[]; onAbrir: (a: AlumnoFila) => void }) {
  const p = usePalabras();
  const grupo = (a: AlumnoFila) => (a.grupoActual ? a.grupoActual.nombre : "—");
  return (
    <>
      <div className={`hidden md:block ${TABLA.envoltura}`}>
        <table className={TABLA.tabla}>
          <thead>
            <tr className={TABLA.encabezado}>
              <th scope="col" className={TABLA.th}>
                {p.Alumno}
              </th>
              <th scope="col" className={TABLA.th}>
                {p.Carrera} y grupo
              </th>
              <th scope="col" className={TABLA.th}>
                Forma de pago
              </th>
              <th scope="col" className={TABLA.th}>
                Estado
              </th>
              <th scope="col" className={TABLA.th}>
                Fotos
              </th>
              <th scope="col" className={TABLA.th}>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((a) => {
              const e = textoEstadoInscripcion(a.estado);
              return (
                <tr
                  key={a.id}
                  // Toda la fila abre la ficha; "Ver ficha" es el camino del teclado.
                  onClick={(ev) => {
                    if ((ev.target as HTMLElement).closest("a,button")) return;
                    onAbrir(a);
                  }}
                  className={`${TABLA.fila} cursor-pointer ${e.tono === "gris" ? "opacity-60" : ""}`}
                >
                  <td className={`${TABLA.td} max-w-[280px]`}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold text-texto">{nombreAlumno(a)}</span>
                      <EstadoInscripcion estado={a.estado} />
                    </span>
                    <span className="block truncate text-[12px] text-texto-3">
                      {[a.codigo, a.ci && `CI ${a.ci}`].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </td>
                  <td className={TABLA.td}>
                    <span className="block whitespace-nowrap text-texto-2">{grupo(a)}</span>
                    {a.grupoActual && <span className="block text-[12px] text-texto-3">{nombreDe(a.grupoActual.sede)}</span>}
                  </td>
                  <td className={`${TABLA.td} whitespace-nowrap text-texto-2`}>{nombreDe(a.plan) || "—"}</td>
                  <td className={TABLA.td}>
                    <EstadoCuenta a={a} />
                  </td>
                  <td className={TABLA.td}>
                    <Fotos estado={a.fotos} />
                  </td>
                  <td className={`${TABLA.td} text-right`}>
                    <BotonFila variante="ghost" a={`/academia/alumnos/${a.id}`} aria-label={`Ver ficha de ${nombreAlumno(a)}`}>
                      Ver ficha
                    </BotonFila>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className={`${LISTA.lista} md:hidden`}>
        {filas.map((a) => {
          const e = textoEstadoInscripcion(a.estado);
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onAbrir(a)}
                className={`flex w-full items-center gap-3 text-left ${LISTA.itemHover} ${e.tono === "gris" ? "opacity-60" : ""}`}
              >
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="block truncate text-[15px] font-semibold text-texto">{nombreAlumno(a)}</span>
                  <span className="block truncate text-[13px] text-texto-3">{[grupo(a), nombreDe(a.plan)].filter(Boolean).join(" · ")}</span>
                  <span className="flex flex-wrap gap-1.5">
                    <EstadoCuenta a={a} />
                    <EstadoInscripcion estado={a.estado} />
                    {a.fotos && a.fotos !== "COMPLETAS" && <Fotos estado={a.fotos} />}
                  </span>
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-borde bg-white text-texto-3">
                  <Icon name="chevronRight" size={16} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
