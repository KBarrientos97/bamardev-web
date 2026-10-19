import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import MenuMas, { type AccionMenu } from "../../components/MenuMas";
import PanelLateral from "../../components/PanelLateral";
import { Boton, Cargando, ErrorMsg, Vacio } from "../../components/ui";
import { useConsultaMedia } from "../../lib/agenda/useEsCelular";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { mesCorto, mesDe, nombreMes, sumarMeses } from "../../lib/academia/calendario";
import { diasTexto, fechaCorta, nombreDe } from "../../lib/academia/formato";
import type { Carrera, FilaCalendario, GrupoEnCalendario } from "../../lib/academia/tipos";
import { useFiltroSede } from "../../lib/academia/useFiltroSede";
import { usePalabras } from "../../lib/academia/usePalabras";
import { rutaCobroInscripcion } from "../../lib/academia/vista";
import { fmtMoney, isoDia } from "../../lib/format";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import Inscribir from "./Inscribir";
import NuevoGrupo, { type HuecoCalendario } from "./NuevoGrupo";

/**
 * N1 · Calendario de módulos (ronda 2, requerimiento 2): la pantalla de
 * grupos de recepción y administración. Filas = franjas horarias de la sede,
 * columnas = meses con su nombre (6 por defecto), y en cada celda la tarjeta
 * del grupo con el módulo que arranca ese mes ("M2 de 3"). Una celda vacía de
 * un mes que no pasó es un hueco: tocarla abre "Abrir grupo" con esa franja y
 * ese mes. Tocar una tarjeta abre el resumen del grupo en el panel lateral.
 *
 * En el celular (N1m) cambia la forma, no los datos: una pestaña por mes y
 * las franjas una debajo de la otra; el resumen sale en la hoja inferior.
 */

interface Elegido {
  grupo: GrupoEnCalendario;
  inicio: string;
  fin: string;
  mes: string;
}

export default function Calendario() {
  const p = usePalabras();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const celular = useConsultaMedia("(max-width: 767px)");
  const sede = useFiltroSede();
  const hoy = mesDe(new Date());
  const [desde, setDesde] = useState(hoy);
  const [cant, setCant] = useState(6);
  const [mesCel, setMesCel] = useState(hoy);
  const [curso, setCurso] = useState<number | null>(null);
  const [elegido, setElegido] = useState<Elegido | null>(null);
  const [hueco, setHueco] = useState<HuecoCalendario | null>(null);
  const [inscribir, setInscribir] = useState<{ id: number; nombre: string } | null>(null);

  const abre = tienePermiso(usuario, "academia.grupos");
  const configura = tienePermiso(usuario, "academia.configurar");
  const inscribe = tienePermiso(usuario, "academia.inscribir");

  // En el celular se piden siempre 6 meses desde el actual: las pestañas.
  const pedirDesde = celular ? hoy : desde;
  const pedirMeses = celular ? 6 : cant;
  const cal = useApi(
    () => apiAcademia.calendario({ sede: sede.sucursalId, desde: pedirDesde, meses: pedirMeses }),
    [sede.sucursalId, pedirDesde, pedirMeses],
  );
  const ajustes = useApi(() => apiAcademia.ajustes(), []);
  const carreras = useApi(() => apiAcademia.carreras(), []);

  const datos = cal.datos;
  const dia = datos?.diaInicioModulo ?? ajustes.datos?.diaInicioModulo ?? 10;
  const nombreSede = datos?.sede?.nombre ?? (sede.nombre || usuario?.sucursal || "");

  // Los cursos que aparecen, con cuántos grupos tiene cada uno: los chips.
  const cursos = useMemo(() => {
    const porCurso = new Map<number, { nombre: string; grupos: Set<number> }>();
    for (const f of datos?.filas ?? [])
      for (const c of f.celdas)
        for (const g of c.grupos) {
          const e = porCurso.get(g.carrera.id) ?? { nombre: g.carrera.nombre, grupos: new Set<number>() };
          e.grupos.add(g.grupoId);
          porCurso.set(g.carrera.id, e);
        }
    return [...porCurso.entries()].map(([id, e]) => ({ id, nombre: e.nombre, n: e.grupos.size }));
  }, [datos]);
  const totalGrupos = new Set((datos?.filas ?? []).flatMap((f) => f.celdas.flatMap((c) => c.grupos.map((g) => g.grupoId)))).size;
  const pasa = (g: GrupoEnCalendario) => curso == null || g.carrera.id === curso;

  const acciones: AccionMenu[] = [
    { clave: "lista", etiqueta: "Ver como lista", icono: "lista", onClick: () => navigate("/academia/calendario/lista") },
    ...(configura
      ? [{ clave: "franjas", etiqueta: "Cambiar franjas horarias", icono: "clock" as const, onClick: () => navigate("/configuracion/academia") }]
      : []),
    ...(!celular ? [{ clave: "imprimir", etiqueta: "Imprimir calendario", icono: "printer" as const, separar: true, onClick: () => window.print() }] : []),
  ];

  const abrirHueco = (fila: FilaCalendario, mes: string) =>
    setHueco({ inicio: fila.inicio, fin: fila.fin, mes, sede: sede.sucursalId ?? usuario?.sucursalId ?? null });

  const ultimoVisible = sumarMeses(desde, cant - 1);
  const rango = `${nombreMes(desde)} ${desde.slice(0, 4)} – ${nombreMes(ultimoVisible)} ${ultimoVisible.slice(0, 4)}`;

  return (
    <div className={`mx-auto max-w-[1400px] space-y-4 p-4 pb-24 sm:p-6 md:pb-6 lg:p-8 ${elegido && !celular ? "md:pr-[404px]" : ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-texto">Calendario</h1>
          <p className="mt-0.5 text-[13px] text-texto-3">
            {nombreSede ? `${p.Sede} ${nombreSede} · ` : ""}los {p.materias} empiezan el {dia} de cada mes
          </p>
        </div>
        <div className="flex items-center gap-2">
          {abre && !celular && (
            <Boton icono="plus" onClick={() => setHueco({ sede: sede.sucursalId ?? usuario?.sucursalId ?? null })}>
              Nuevo grupo
            </Boton>
          )}
          <MenuMas etiqueta="Más acciones del calendario" titulo="Calendario" acciones={acciones} />
        </div>
      </header>

      {sede.selector}

      {celular ? (
        <PestanasMes meses={datos?.meses ?? []} valor={mesCel} hoy={hoy} onChange={setMesCel} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label={`Filtrar por ${p.carrera}`} className="flex flex-wrap gap-2">
            <ChipCurso activo={curso == null} onClick={() => setCurso(null)} label="Todos" n={totalGrupos} />
            {cursos.map((c) => (
              <ChipCurso key={c.id} activo={curso === c.id} onClick={() => setCurso(c.id)} label={c.nombre} n={c.n} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {desde !== hoy && (
              <button type="button" onClick={() => setDesde(hoy)} className="text-[13px] font-semibold text-primary-700 hover:underline">
                Volver a {nombreMes(hoy)}
              </button>
            )}
            <div className="flex items-center gap-1 rounded-xl border border-borde bg-white px-1">
              <button type="button" aria-label="Mes anterior" onClick={() => setDesde(sumarMeses(desde, -1))} className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted">
                <Icon name="chevronLeft" size={16} />
              </button>
              <span aria-live="polite" className="min-w-[13rem] text-center text-[13px] capitalize text-texto-2">
                {rango}
              </span>
              <button type="button" aria-label="Mes siguiente" onClick={() => setDesde(sumarMeses(desde, 1))} className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted">
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
            <div role="group" aria-label="Cuántos meses mostrar" className="flex rounded-xl border border-borde bg-white p-0.5">
              {[3, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={cant === n}
                  onClick={() => setCant(n)}
                  className={`rounded-lg px-3 py-1.5 text-[13px] ${cant === n ? "bg-primary-50 font-semibold text-primary-700" : "text-texto-3"}`}
                >
                  {n} meses
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {cal.error && !datos ? (
        <ErrorMsg onReintentar={cal.recargar}>{cal.error}</ErrorMsg>
      ) : !datos ? (
        <Cargando />
      ) : datos.filas.length === 0 ? (
        <Vacio
          icono="calendar"
          titulo="El calendario está vacío"
          texto={configura ? "Cargá las franjas horarias en Ajustes, o abrí el primer grupo." : "Todavía no hay grupos abiertos."}
          accion={abre ? <Boton onClick={() => setHueco({ sede: sede.sucursalId ?? null })}>Nuevo grupo</Boton> : undefined}
        />
      ) : celular ? (
        <VistaCelular
          filas={datos.filas}
          mes={mesCel}
          hoy={hoy}
          pasa={pasa}
          abre={abre}
          onElegir={(grupo, fila) => setElegido({ grupo, inicio: fila.inicio, fin: fila.fin, mes: mesCel })}
          onHueco={(fila) => abrirHueco(fila, mesCel)}
        />
      ) : (
        <Grilla
          meses={datos.meses}
          filas={datos.filas}
          hoy={hoy}
          pasa={pasa}
          abre={abre}
          elegidoId={elegido?.grupo.grupoId ?? null}
          onElegir={(grupo, fila, mes) => setElegido({ grupo, inicio: fila.inicio, fin: fila.fin, mes })}
          onHueco={abrirHueco}
        />
      )}

      {!celular && datos && datos.filas.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-texto-3">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-primary-50" /> {p.Materia} en curso o por venir
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-primary-100 bg-white" /> Último {p.materia} del grupo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-dashed border-borde" /> Hueco libre
          </span>
          <span>Cada columna es el mes en que empieza el {p.materia}</span>
        </div>
      )}

      {celular && abre && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde-soft bg-white p-3 md:hidden">
          <Boton className="w-full" onClick={() => setHueco({ sede: sede.sucursalId ?? usuario?.sucursalId ?? null })}>
            Nuevo grupo
          </Boton>
        </div>
      )}

      {elegido && (
        <ResumenGrupo
          elegido={elegido}
          hoy={hoy}
          carreras={carreras.datos ?? []}
          inscribe={inscribe}
          onCerrar={() => setElegido(null)}
          onInscribir={() => setInscribir({ id: elegido.grupo.grupoId, nombre: elegido.grupo.nombre })}
        />
      )}

      {hueco && (
        <NuevoGrupo
          hueco={hueco}
          onCerrar={() => setHueco(null)}
          onCreado={(g) => {
            setHueco(null);
            cal.recargar();
            navigate(`/academia/grupos/${g.id}`);
          }}
        />
      )}

      {inscribir && (
        <Inscribir
          grupoInicial={inscribir}
          onCerrar={() => setInscribir(null)}
          onInscrito={(r) => {
            setInscribir(null);
            cal.recargar();
            if (r.cobrar) navigate(rutaCobroInscripcion(r.inscripcion.id, undefined, r.montoHoy));
          }}
        />
      )}
    </div>
  );
}

function ChipCurso({ activo, onClick, label, n }: { activo: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
        activo ? "border-primary bg-primary-50 font-semibold text-primary-700" : "border-borde bg-white text-texto-2 hover:bg-muted"
      }`}
    >
      {label} <span className="tabular-nums text-texto-4">{n}</span>
    </button>
  );
}

/** "18/20" con su barrita; se llena en el color del negocio, nunca en rojo. */
function Ocupacion({ inscritos, cupo, fondo = "bg-primary-100" }: { inscritos: number; cupo: number | null; fondo?: string }) {
  const pct = cupo ? Math.min(100, Math.round((inscritos / cupo) * 100)) : 0;
  return (
    <span className="flex items-center gap-2">
      {cupo != null && (
        <span className={`h-1.5 flex-1 overflow-hidden rounded-full ${fondo}`}>
          <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </span>
      )}
      <span className="text-xs tabular-nums text-texto-3">
        {inscritos}/{cupo ?? "—"}
      </span>
    </span>
  );
}

function Tarjeta({
  g,
  pasado,
  elegido,
  onClick,
}: {
  g: GrupoEnCalendario;
  pasado: boolean;
  elegido: boolean;
  onClick: () => void;
}) {
  const p = usePalabras();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${g.carrera.nombre} ${diasTexto(g.dias)}, ${p.materia} ${g.modulo.orden} de ${g.modulo.total}`}
      className={`block w-full rounded-lg border p-2 text-left text-xs transition-colors hover:border-primary ${
        g.ultimo ? "border-primary-100 bg-white" : "border-primary-50 bg-primary-50"
      } ${elegido ? "ring-1 ring-primary border-primary" : ""} ${pasado ? "opacity-55" : ""}`}
    >
      <span className="flex items-baseline justify-between gap-1">
        <b className="truncate text-[13px] text-texto">{g.carrera.nombre}</b>
        <span className="shrink-0 text-texto-3">{diasTexto(g.dias)}</span>
      </span>
      <span className="mt-0.5 flex items-center gap-1">
        <span className="truncate text-texto-2">
          M{g.modulo.orden} de {g.modulo.total} · {g.modulo.nombre}
        </span>
        {g.ultimo && <span className="shrink-0 rounded bg-primary-50 px-1 text-[10px] font-semibold text-primary-700">último</span>}
      </span>
      <span className="block truncate text-texto-3">{g.docente ? `Prof. ${g.docente.nombre}` : `${p.Docente} por elegir`}</span>
      <span className="mt-1 block">
        <Ocupacion inscritos={g.inscritos} cupo={g.cupo} fondo={g.ultimo ? "bg-primary-50" : "bg-primary-100"} />
      </span>
      {g.inscripcionAbierta && g.modulo.orden === 1 && !pasado && (
        <span className="mt-1 block font-semibold text-primary-700">Inscripción abierta</span>
      )}
    </button>
  );
}

function Grilla({
  meses,
  filas,
  hoy,
  pasa,
  abre,
  elegidoId,
  onElegir,
  onHueco,
}: {
  meses: string[];
  filas: FilaCalendario[];
  hoy: string;
  pasa: (g: GrupoEnCalendario) => boolean;
  abre: boolean;
  elegidoId: number | null;
  onElegir: (g: GrupoEnCalendario, fila: FilaCalendario, mes: string) => void;
  onHueco: (fila: FilaCalendario, mes: string) => void;
}) {
  const columnas = `96px repeat(${meses.length}, minmax(${meses.length > 3 ? 160 : 220}px, 1fr))`;
  return (
    // scroll-lateral-ok: la grilla del calendario, 6 columnas de meses.
    <div className="overflow-x-auto rounded-xl border border-borde-soft">
      <div role="table" aria-label="Calendario de módulos" className="min-w-max">
        <div role="row" className="grid border-b border-borde-soft" style={{ gridTemplateColumns: columnas }}>
          <span role="columnheader" className="px-3 py-2.5 text-xs text-texto-3">
            Horario
          </span>
          {meses.map((m) => (
            <div key={m} role="columnheader" className={`px-3 py-2.5 ${m === hoy ? "bg-primary-50/40" : ""}`}>
              <span className={`block text-sm capitalize ${m === hoy ? "font-bold text-primary-700" : m < hoy ? "text-texto-3" : "font-medium text-texto"}`}>
                {nombreMes(m)}
              </span>
              <span className="text-xs text-texto-4">
                {m.slice(0, 4)}
                {m === hoy && " · mes actual"}
              </span>
            </div>
          ))}
        </div>
        {filas.map((fila) => (
          <div key={`${fila.inicio}-${fila.fin}-${fila.esFranja}`} role="row" className="grid border-b border-borde-soft last:border-b-0" style={{ gridTemplateColumns: columnas }}>
            <div role="rowheader" className="px-3 py-3">
              <span className="block text-sm font-semibold tabular-nums text-texto">{fila.inicio}</span>
              <span className="block text-xs tabular-nums text-texto-3">a {fila.fin}</span>
              {!fila.esFranja && <span className="text-[10px] text-texto-4">fuera de franja</span>}
            </div>
            {meses.map((mes) => {
              const celda = fila.celdas.find((c) => c.mes === mes);
              const todos = celda?.grupos ?? [];
              const visibles = todos.filter(pasa);
              const pasado = mes < hoy;
              return (
                <div key={mes} role="cell" className={`space-y-1.5 border-l border-borde-soft p-1.5 ${mes === hoy ? "bg-primary-50/40" : ""}`}>
                  {visibles.map((g) => (
                    <Tarjeta key={g.grupoId} g={g} pasado={pasado} elegido={elegidoId === g.grupoId} onClick={() => onElegir(g, fila, mes)} />
                  ))}
                  {todos.length === 0 && !pasado && abre && (
                    <button
                      type="button"
                      title="Abrir grupo aquí"
                      aria-label={`Abrir grupo aquí: ${fila.inicio} a ${fila.fin}, ${nombreMes(mes)}`}
                      onClick={() => onHueco(fila, mes)}
                      className="group flex min-h-[72px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-borde text-xs text-texto-4 transition-colors hover:border-primary hover:bg-primary-50 hover:text-primary-700"
                    >
                      <Icon name="plus" size={16} />
                      <span className="hidden group-hover:inline group-focus-visible:inline">Abrir grupo aquí</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function PestanasMes({ meses, valor, hoy, onChange }: { meses: string[]; valor: string; hoy: string; onChange: (m: string) => void }) {
  return (
    // scroll-lateral-ok: pestañas de mes, el patrón aceptado (PLAN-TABLAS-MOVIL §2.6).
    <div role="tablist" aria-label="Mes" className="-mx-4 flex gap-1 overflow-x-auto border-b border-borde-soft px-4 [scrollbar-width:none]">
      {meses.map((m) => {
        const sel = m === valor;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(m)}
            className={`shrink-0 border-b-2 px-3 pb-2 pt-1.5 text-left ${sel ? "border-primary" : "border-transparent"}`}
          >
            <span className={`block text-sm capitalize ${sel ? "font-semibold text-texto" : "text-texto-3"}`}>{mesCorto(m)}</span>
            <span className="block text-[11px] text-texto-4">{m === hoy ? "actual" : m.slice(0, 4)}</span>
          </button>
        );
      })}
    </div>
  );
}

function VistaCelular({
  filas,
  mes,
  hoy,
  pasa,
  abre,
  onElegir,
  onHueco,
}: {
  filas: FilaCalendario[];
  mes: string;
  hoy: string;
  pasa: (g: GrupoEnCalendario) => boolean;
  abre: boolean;
  onElegir: (g: GrupoEnCalendario, fila: FilaCalendario) => void;
  onHueco: (fila: FilaCalendario) => void;
}) {
  const p = usePalabras();
  return (
    <div className="space-y-4">
      {filas.map((fila) => {
        const grupos = (fila.celdas.find((c) => c.mes === mes)?.grupos ?? []).filter(pasa);
        const rango = `${fila.inicio} a ${fila.fin}`;
        return (
          <section key={`${fila.inicio}-${fila.fin}-${fila.esFranja}`} aria-label={rango}>
            <h2 className="mb-1.5 text-[13px] font-semibold tabular-nums text-texto-3">{rango}</h2>
            <div className="space-y-2">
              {grupos.map((g) => (
                <button
                  key={g.grupoId}
                  type="button"
                  onClick={() => onElegir(g, fila)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${g.ultimo ? "border-primary-100 bg-white" : "border-primary-50 bg-primary-50"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-texto">
                      {g.carrera.nombre} · {diasTexto(g.dias)}
                    </span>
                    <span className="block truncate text-[13px] text-texto-2">
                      M{g.modulo.orden} de {g.modulo.total} · {g.modulo.nombre}
                      {g.ultimo ? " · último" : ""}
                    </span>
                    <span className="block truncate text-xs text-texto-3">{g.docente ? `Prof. ${g.docente.nombre}` : `${p.Docente} por elegir`}</span>
                    {g.inscripcionAbierta && g.modulo.orden === 1 && mes >= hoy && (
                      <span className="text-xs font-semibold text-primary-700">Inscripción abierta</span>
                    )}
                  </span>
                  <span className="w-16 shrink-0">
                    <Ocupacion inscritos={g.inscritos} cupo={g.cupo} />
                  </span>
                </button>
              ))}
              {grupos.length === 0 && mes >= hoy && abre && (
                <button
                  type="button"
                  onClick={() => onHueco(fila)}
                  className="flex w-full items-center gap-2 rounded-xl border border-dashed border-borde px-3 py-3 text-sm text-texto-3"
                >
                  <Icon name="plus" size={16} /> Libre · Abrir grupo aquí
                </button>
              )}
              {grupos.length === 0 && (mes < hoy || !abre) && <p className="text-sm text-texto-4">Libre</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * El resumen del grupo (panel lateral o hoja inferior): cuántos hay, cuántos
 * pagaron el módulo de ese mes (el número que importa para el docente) y los
 * módulos con su docente. La acción principal es inscribir si el grupo todavía
 * está en el primer módulo; si no, ver el grupo.
 */
function ResumenGrupo({
  elegido,
  hoy,
  carreras,
  inscribe,
  onCerrar,
  onInscribir,
}: {
  elegido: Elegido;
  hoy: string;
  carreras: Carrera[];
  inscribe: boolean;
  onCerrar: () => void;
  onInscribir: () => void;
}) {
  const p = usePalabras();
  const navigate = useNavigate();
  const { grupo: g, inicio, fin, mes } = elegido;
  const detalle = useApi(() => apiAcademia.grupo(g.grupoId), [g.grupoId]);
  const d = detalle.datos;
  const carrera = carreras.find((c) => c.id === g.carrera.id);
  const completo = carrera?.planes.find((x) => x.activo && x.generado === "COMPLETO")?.total;
  const hoyIso = isoDia(new Date());
  const empezo = mes <= hoy;
  const primerModulo = g.modulo.orden === 1;
  const faltan = g.pagaronModulo != null ? g.inscritos - g.pagaronModulo : null;
  const pct = g.cupo ? Math.min(100, Math.round((g.inscritos / g.cupo) * 100)) : 0;
  const inscribirPrimero = inscribe && (primerModulo || !empezo);

  const acciones: AccionMenu[] = [
    { clave: "lista", etiqueta: "Pasar lista", icono: "lista", onClick: () => navigate(`/academia/grupos/${g.grupoId}/lista`) },
    { clave: "excel", etiqueta: "Exportar a Excel", icono: "download", detalle: "Pronto", deshabilitada: true, onClick: () => {} },
    { clave: "editar", etiqueta: "Editar grupo", icono: "edit", separar: true, onClick: () => navigate(`/academia/grupos/${g.grupoId}`) },
  ];

  const ver = (
    <Link
      to={`/academia/grupos/${g.grupoId}`}
      className={`inline-flex flex-1 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold ${
        inscribirPrimero ? "border border-borde bg-white text-texto-2 hover:bg-muted" : "bg-primary-boton text-white hover:bg-primary-boton-hover"
      }`}
    >
      Ver grupo
    </Link>
  );

  return (
    <PanelLateral
      abierto
      titulo={`${g.carrera.nombre} · ${diasTexto(g.dias)} ${inicio}–${fin}`}
      subtitulo={[d ? nombreDe(d.sede) : "", g.aula, g.cupo != null ? `cupo ${g.cupo}` : ""].filter(Boolean).join(" · ")}
      onClose={onCerrar}
      acciones={
        <div className="flex w-full items-center gap-2">
          {inscribirPrimero ? (
            <>
              <Boton className="flex-1" onClick={onInscribir}>
                Inscribir {p.alumno}
              </Boton>
              {ver}
            </>
          ) : (
            <>
              {ver}
              {inscribe && (
                <Boton variante="ghost" onClick={onInscribir}>
                  Inscribir
                </Boton>
              )}
            </>
          )}
          <MenuMas etiqueta="Más acciones del grupo" acciones={acciones} />
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="block text-xs text-texto-3">Inscritos</span>
            <span className="block text-lg font-bold tabular-nums text-texto">
              {g.inscritos}
              {g.cupo != null && <span className="text-sm font-normal text-texto-3"> de {g.cupo}</span>}
            </span>
            {g.cupo != null && (
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-primary-100">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </span>
            )}
          </div>
          {g.pagaronModulo != null && (
            <div>
              <span className="block text-xs text-texto-3">
                {empezo ? `Pagaron el M${g.modulo.orden}${mes === hoy ? " (actual)" : ""}` : `Pagaron el M${g.modulo.orden} por adelantado`}
              </span>
              <span className="block text-lg font-bold tabular-nums text-texto">
                {g.pagaronModulo}
                <span className="text-sm font-normal text-texto-3"> de {g.inscritos}</span>
              </span>
              <span className={`text-xs ${faltan && empezo ? "font-semibold text-danger-text" : "text-texto-3"}`}>
                {faltan === 0 ? "todos al día" : empezo ? `${faltan} sin pagar` : `${faltan} todavía no`}
              </span>
            </div>
          )}
        </div>

        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-texto-4">{p.Materias}</span>
          {!d ? (
            <p className="mt-2 text-sm text-texto-3">{detalle.error || "Cargando…"}</p>
          ) : (
            <ul className="mt-1 divide-y divide-borde-soft">
              {[...d.materiasGrupo]
                .sort((x, y) => x.materia.orden - y.materia.orden)
                .map((mg) => {
                  const enCurso = mg.desde <= hoyIso && hoyIso <= mg.hasta;
                  const estado = mg.hasta < hoyIso ? "terminado" : enCurso ? "en curso" : `empieza el ${fechaCorta(mg.desde)}`;
                  return (
                    <li key={mg.id} className="flex items-start gap-3 py-2.5">
                      <span className={`w-7 text-sm font-semibold ${enCurso ? "text-primary-700" : "text-texto-4"}`}>M{mg.materia.orden}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${enCurso ? "font-semibold text-texto" : "text-texto-2"}`}>{mg.materia.nombre}</span>
                        <span className="block truncate text-xs text-texto-3">{mg.docente ? `Prof. ${mg.docente.nombre}` : `${p.Docente} por elegir`}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-xs capitalize text-texto-2">{nombreMes(mg.mesLiquidacion, hoy)}</span>
                        <span className={`block text-xs ${enCurso ? "font-semibold text-primary-700" : "text-texto-3"}`}>{estado}</span>
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>

        {carrera?.precioModulo != null && (
          <p className="text-[13px] text-texto-3">
            {fmtMoney(carrera.precioModulo)} por {p.materia}
            {completo != null && ` · pago completo ${fmtMoney(completo)}`}
          </p>
        )}
      </div>
    </PanelLateral>
  );
}
