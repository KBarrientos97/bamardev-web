import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Paginacion } from "../../components/Paginacion";
import { AvisoOk, Boton, Cargando, ErrorMsg, Vacio, useAviso } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { avisoFotosPendientes, avisoInscripcionHecha } from "../../lib/academia/fotos";
import { nombreAlumno, nombreDe } from "../../lib/academia/formato";
import type { AlumnoFila, EstadoFotos, FiltroAlumnos } from "../../lib/academia/tipos";
import { useFiltroSede } from "../../lib/academia/useFiltroSede";
import { useBusquedaEstudiante } from "../../lib/academia/useBusquedaEstudiante";
import { usePalabras } from "../../lib/academia/usePalabras";
import { rutaCobroInscripcion, textoEstadoInscripcion } from "../../lib/academia/vista";
import { fmtMoney } from "../../lib/format";
import { usePaginado } from "../../lib/paginado";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import BuscadorEstudiante from "./BuscadorEstudiante";
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

type Vista = "todos" | "deben" | "retirados" | "faltanFotos";

/** Lo que pide cada pestaña a `GET /academia/alumnos`. */
const FILTRO_VISTA: Record<Vista, Pick<FiltroAlumnos, "estado" | "debe" | "fotos">> = {
  todos: {},
  deben: { debe: true },
  retirados: { estado: "RETIRADA" },
  // Sólo se ofrece si hay alguno (U4): las demás fotos se miran en la ficha y en el panel de control.
  faltanFotos: { fotos: "FALTAN" },
};

/** Cómo se lee el estado de las fotos: gris si están bien, chip ámbar o rojo si piden algo. */
const FOTOS: Record<EstadoFotos, { texto: string; tono: TonoChip; ok: boolean }> = {
  COMPLETAS: { texto: "Fotos", tono: "gris", ok: true },
  POR_REVISAR: { texto: "Fotos por revisar", tono: "ambar", ok: false },
  OBSERVADAS: { texto: "Fotos observadas", tono: "rojo", ok: false },
  FALTAN: { texto: "Faltan fotos", tono: "rojo", ok: false },
};

/**
 * E7 · Estudiantes (PLAN-ACADEMIAS §5, ronda 2): la lista con búsqueda por
 * nombre, CI, código o teléfono. Las pestañas son los indicadores (Todos ·
 * Deben · Retirados, y «Faltan fotos» sólo si hay alguno): desde el 26-oct no
 * hay selectores de curso, grupo ni fotos (U4, menos filtros); los estudiantes
 * de un grupo se ven en la pantalla del grupo. Cada fila dice su curso y
 * grupo, la forma de pago, si debe (rojo sólo lo vencido) y cómo están sus 3
 * fotos (D7). Tocar una fila abre la ficha (E6).
 */
export default function Alumnos() {
  const { usuario, puede } = useAuth();
  const p = usePalabras();
  const navigate = useNavigate();
  const sede = useFiltroSede();
  const { q, setQ, buscado } = useBusquedaEstudiante();
  const [vista, setVista] = useState<Vista>("todos");
  const [inscribiendo, setInscribiendo] = useState(false);
  const [aviso, setAviso] = useAviso(8000);

  const base = { q: buscado || undefined, sede: sede.sucursalId };
  const lista = usePaginado(
    (pg) => apiAcademia.alumnos({ ...pg, ...base, ...FILTRO_VISTA[vista] }),
    [buscado, sede.sucursalId, vista],
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
    [buscado, sede.sucursalId],
  );
  const preinscripciones = useApi(
    () =>
      puede("academia_preinscripciones")
        ? apiAcademia.preinscripciones({ pageSize: 1 }).then((r) => r.total).catch(() => 0)
        : Promise.resolve(0),
    [],
  );
  const inscribe = tienePermiso(usuario, "academia.inscribir");
  const hayFiltros = !!buscado || vista !== "todos";
  const nombreSede = sede.nombre || usuario?.sucursal || "";
  const n = (v: Vista) => conteos.datos?.[v] ?? null;
  // Al docente el backend no le manda saldo ni vencido (`null`): no ve montos,
  // así que no hay estado de deuda que mostrar ni pestaña «Deben» que ofrecer.
  // «null» no es «al día»: sin dato, no se dice nada.
  const sinMontos = lista.items.length > 0 && lista.items.every((a) => a.saldo == null);

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

      <AvisoOk>{aviso}</AvisoOk>

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
              ...(sinMontos && vista !== "deben" ? [] : [{ clave: "deben" as const, label: "Deben", n: n("deben"), urgente: true }]),
              { clave: "retirados", label: "Retirados", n: n("retirados") },
              // Sólo si hay alguno (o si ya está elegido, para que no se esfume al arreglar el último).
              ...(n("faltanFotos") || vista === "faltanFotos"
                ? [{ clave: "faltanFotos" as const, label: "Faltan fotos", n: n("faltanFotos"), urgente: true }]
                : []),
            ]}
          />
        }
      >
        {/* El buscador, en su propia fila de la tarjeta (`FilaFiltros` sólo sabe de chips). */}
        <div className="border-b border-borde-soft bg-muted/50 px-4 py-3 sm:px-5">
          <BuscadorEstudiante valor={q} onChange={setQ} />
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
            <ListaAlumnos filas={lista.items} sinMontos={sinMontos} onAbrir={(a) => navigate(`/academia/alumnos/${a.id}`)} />
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
            // Los conteos (N estudiantes, «Faltan fotos») cambian con la inscripción (ronda 1, D12).
            conteos.recargar();
            // D3: sin las fotos, el aviso va a Cobrar si se sigue de largo.
            const sinFotos = avisoFotosPendientes(r.inscripcion);
            if (r.cobrar) navigate(rutaCobroInscripcion(r.inscripcion.id, r.inscripcion.grupo?.sede, r.montoHoy), sinFotos ? { state: { aviso: sinFotos } } : undefined);
            else setAviso(avisoInscripcionHecha(r.nombre, sinFotos));
          }}
        />
      )}
    </PaginaAcademia>
  );
}

/**
 * "Al día" en verde o "Debe Bs 500" (rojo si venció, ámbar si todavía no).
 * Sin saldo (el docente no ve montos) no se dibuja nada: ni «Bs 0» ni un «Al
 * día» que no se sabe.
 */
function EstadoCuenta({ a }: { a: AlumnoFila }) {
  if (a.saldo == null) return null;
  const debe = a.saldo > 0;
  if (!debe) return <Chip tono="verde">Al día</Chip>;
  return (
    <Chip tono={a.vencido === true ? "rojo" : "ambar"} className="tabular-nums">
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

function ListaAlumnos({ filas, sinMontos, onAbrir }: { filas: AlumnoFila[]; sinMontos: boolean; onAbrir: (a: AlumnoFila) => void }) {
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
              {!sinMontos && (
                <>
                  <th scope="col" className={TABLA.th}>
                    Forma de pago
                  </th>
                  <th scope="col" className={TABLA.th}>
                    Estado
                  </th>
                </>
              )}
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
                  {!sinMontos && (
                    <>
                      <td className={`${TABLA.td} whitespace-nowrap text-texto-2`}>{nombreDe(a.plan) || "—"}</td>
                      <td className={TABLA.td}>
                        <EstadoCuenta a={a} />
                      </td>
                    </>
                  )}
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
                  <span className="block truncate text-[13px] text-texto-3">{[grupo(a), sinMontos ? null : nombreDe(a.plan)].filter(Boolean).join(" · ")}</span>
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
