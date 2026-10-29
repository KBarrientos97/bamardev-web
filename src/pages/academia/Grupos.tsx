import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Buscador } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { Paginacion } from "../../components/Paginacion";
import { Boton, Cargando, ErrorMsg, Select, Vacio } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { fechaCorta, horarioGrupo, nombreDe } from "../../lib/academia/formato";
import type { EstadoGrupo, GrupoResumen } from "../../lib/academia/tipos";
import { useFiltroSede } from "../../lib/academia/useFiltroSede";
import { usePalabras } from "../../lib/academia/usePalabras";
import { usePaginado } from "../../lib/paginado";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import NuevoGrupo from "./NuevoGrupo";
import { Chip, ChipsFiltro, EncabezadoPagina, PaginaAcademia, Tarjeta, type TonoChip } from "./piezas";

/**
 * E2 · Grupos (PLAN-ACADEMIAS §5): una tarjeta por grupo con su barra de
 * materias, el docente de la actual, la ocupación y cuántos están al día. El
 * docente ve sólo los suyos (lo recorta el backend). La acción principal es
 * "Nuevo grupo", para quien arma los grupos. Desde la ronda 2 es el "Ver como
 * lista" del calendario: los filtros van en la barra de la tarjeta y cada
 * grupo es una tarjetita con borde dentro de ella.
 */
export default function Grupos() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const p = usePalabras();
  const sede = useFiltroSede();
  const [estado, setEstado] = useState<"" | EstadoGrupo>("");
  const [carreraId, setCarreraId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [buscado, setBuscado] = useState("");
  const [creando, setCreando] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBuscado(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const carreras = useApi(() => apiAcademia.carreras().catch(() => []), []);
  const lista = usePaginado(
    (pg) => apiAcademia.grupos({ ...pg, sede: sede.sucursalId, carreraId, estado, q: buscado }),
    [sede.sucursalId, carreraId, estado, buscado],
  );
  const armaGrupos = tienePermiso(usuario, "academia.grupos");
  const conFiltros = !!estado || carreraId != null || !!buscado || sede.sucursalId != null;

  return (
    <PaginaAcademia>
      <EncabezadoPagina
        titulo="Grupos"
        volver={{ a: "/academia/calendario", texto: "Calendario" }}
        bajada={lista.total ? `${lista.total} ${lista.total === 1 ? "grupo" : "grupos"}` : undefined}
        acciones={
          armaGrupos ? (
            <Boton icono="plus" onClick={() => setCreando(true)}>
              Nuevo grupo
            </Boton>
          ) : undefined
        }
      />

      {sede.selector}

      <Tarjeta
        etiqueta="Lista de grupos"
        barra={
          <div className="flex flex-wrap items-center gap-3 py-3">
            <ChipsFiltro<"" | EstadoGrupo>
              etiqueta="Estado"
              valor={estado}
              onChange={setEstado}
              opciones={[
                { clave: "", label: "Todos" },
                { clave: "POR_EMPEZAR", label: "Por empezar" },
                { clave: "EN_CURSO", label: "En curso" },
                { clave: "TERMINADO", label: "Terminados" },
              ]}
            />
            <div className="flex min-w-0 flex-1 basis-full flex-wrap gap-2 lg:basis-80">
              <div className="flex min-w-0 flex-1 basis-56">
                <Buscador valor={q} onChange={setQ} placeholder="Buscar grupo" />
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
          </div>
        }
      >
        {lista.error && !lista.items.length ? (
          <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
        ) : lista.cargando && !lista.items.length ? (
          <Cargando />
        ) : lista.items.length === 0 ? (
          <Vacio
            icono="birrete"
            titulo={conFiltros ? "Ningún grupo con estos filtros" : "Todavía no hay grupos"}
            texto={conFiltros ? "Probá con otros filtros." : armaGrupos ? "Armá el primero con su horario y sus docentes." : undefined}
            accion={
              !conFiltros && armaGrupos ? (
                <Boton icono="plus" onClick={() => setCreando(true)}>
                  Nuevo grupo
                </Boton>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            <ul className="grid gap-3 md:grid-cols-2 sm:gap-4">
              {lista.items.map((g) => (
                <li key={g.id} className="min-w-0">
                  <TarjetaGrupo g={g} conSede={sede.variasSedes} />
                </li>
              ))}
            </ul>
            <Paginacion {...lista.paginacion} />
          </div>
        )}
      </Tarjeta>

      {creando && (
        <NuevoGrupo
          onCerrar={() => setCreando(false)}
          onCreado={(g) => {
            setCreando(false);
            // Al grupo recién creado: ahí se inscribe al primero.
            navigate(`/academia/grupos/${g.id}`, { state: { avisos: g.avisos ?? [] } });
          }}
        />
      )}
    </PaginaAcademia>
  );
}

const ESTADO_GRUPO: Record<EstadoGrupo, { texto: string; tono: TonoChip }> = {
  POR_EMPEZAR: { texto: "Por empezar", tono: "azul" },
  EN_CURSO: { texto: "En curso", tono: "marca" },
  TERMINADO: { texto: "Terminado", tono: "gris" },
};

/** La tarjeta de E2: toda ella lleva al grupo. */
function TarjetaGrupo({ g, conSede }: { g: GrupoResumen; conSede: boolean }) {
  const ocupacion = g.cupo ? Math.min(100, Math.round((g.inscritos / g.cupo) * 100)) : null;
  const alDiaPct = g.inscritos > 0 ? g.alDia / g.inscritos : 1;
  // Ámbar sólo cuando pide atención: menos del 80 % al día.
  const flojo = g.inscritos > 0 && alDiaPct < 0.8;
  const est = ESTADO_GRUPO[g.estado];
  return (
    <Link
      to={`/academia/grupos/${g.id}`}
      className="group block h-full space-y-3 rounded-xl border border-borde bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow] hover:border-primary-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-texto">{nombreDe(g.carrera)}</p>
          <p className="text-[13px] text-texto-3">
            {horarioGrupo(g)}
            {conSede ? ` · ${nombreDe(g.sede)}` : ""}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {est && <Chip tono={est.tono}>{est.texto}</Chip>}
          <span className="flex h-8 w-8 items-center max-sm:!hidden justify-center rounded-lg border border-borde bg-white text-texto-3 transition-colors group-hover:border-primary-200 group-hover:text-primary-700">
            <Icon name="chevronRight" size={16} />
          </span>
        </span>
      </div>

      <BarraMaterias materias={g.materias} />

      <p className="truncate text-[13px] text-texto-2">
        {g.estado === "POR_EMPEZAR"
          ? `Empieza ${fechaCorta(g.fechaInicio)}${g.materiaActual?.docente ? ` · ${g.materiaActual.docente}` : ""}`
          : g.materiaActual
            ? `M${g.materiaActual.orden} · ${g.materiaActual.docente ?? "sin docente"}`
            : g.estado === "TERMINADO"
              ? "Terminado"
              : "—"}
      </p>

      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted px-3 py-2.5 text-[13px]">
        <div className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Ocupación</dt>
          <dd className="font-semibold tabular-nums text-texto">
            {g.inscritos}
            {g.cupo ? ` / ${g.cupo}` : ""}
          </dd>
          {ocupacion != null && (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${ocupacion}%` }} />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Al día</dt>
          <dd className={`font-semibold tabular-nums ${flojo ? "text-warning-text" : "text-texto"}`}>
            {g.estado === "POR_EMPEZAR" && g.inscritos === 0 ? "—" : `${g.alDia} de ${g.inscritos}`}
          </dd>
        </div>
      </dl>

      <p className="text-[12px] text-texto-4">
        {fechaCorta(g.fechaInicio)} → {fechaCorta(g.fechaFin)}
        {g.aula ? ` · ${g.aula}` : ""}
      </p>
    </Link>
  );
}

/** M1 ✓ · M2 · M3: la actual con el color de marca, las cerradas con su ✓. */
export function BarraMaterias({ materias }: { materias: GrupoResumen["materias"] }) {
  if (!materias.length) return null;
  const orden = [...materias].sort((a, b) => a.orden - b.orden);
  return (
    <div className="space-y-1">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${orden.length}, minmax(0, 1fr))` }}>
        {orden.map((m) => (
          <span
            key={m.orden}
            className={`h-1.5 rounded-full ${m.estado === "FUTURA" ? "bg-primary-100" : "bg-primary"}`}
          />
        ))}
      </div>
      <div
        className="grid gap-1 text-[12px]"
        style={{ gridTemplateColumns: `repeat(${orden.length}, minmax(0, 1fr))` }}
      >
        {orden.map((m) => (
          <span
            key={m.orden}
            className={m.estado === "ACTUAL" ? "font-semibold text-primary-700" : "text-texto-3"}
          >
            M{m.orden}
            {m.estado === "CERRADA" ? " ✓" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
