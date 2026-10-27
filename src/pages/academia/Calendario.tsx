import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { RUTA_COBRAR, rutaCobroInscripcion } from "../../lib/academia/vista";
import { fmtMoney, isoDia } from "../../lib/format";
import { cobraCuotas, tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import ClasesDeHoy from "./ClasesDeHoy";
import Inscribir from "./Inscribir";
import NuevoGrupo, { type HuecoCalendario } from "./NuevoGrupo";
import PrimerosPasos from "./PrimerosPasos";
import { BotonFila, BotonIcono, Chip, ChipsFiltro, EncabezadoPagina, PaginaAcademia, ResumenPanel, SeccionPanel, Tarjeta } from "./piezas";

/**
 * La tarjetita de un grupo en el calendario (punto 8 del rediseño): blanca y
 * con borde para que se despegue de la grilla, con la franja de color a la
 * izquierda y el módulo resaltado. El último módulo del grupo lleva la franja
 * más clara: el grupo se termina ahí.
 */
const claseTarjetita = (ultimo: boolean) =>
  `border border-borde bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] border-l-[3px] ${ultimo ? "border-l-primary-200" : "border-l-primary"}`;

/** El hueco libre: punteado y gris, que no se confunda con un grupo. */
const CLASE_HUECO =
  "border-[1.5px] border-dashed border-slate-300 bg-muted/60 text-texto-4 transition-colors hover:border-primary hover:bg-primary-50 hover:text-primary-700";

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
  const { usuario, puede, negocio, rubro } = useAuth();
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
  /** "Inscribir" de la cabecera: sin grupo elegido, igual que desde Estudiantes. */
  const [inscribiendo, setInscribiendo] = useState(false);

  const abre = tienePermiso(usuario, "academia.grupos");
  const configura = tienePermiso(usuario, "academia.configurar");
  const inscribe = tienePermiso(usuario, "academia.inscribir");
  // Lo mismo que Cobranza: inscribir o gestionar la cobranza, con la feature.
  const cobra = cobraCuotas({
    features: negocio?.features,
    rubro,
    permisos: usuario?.permisos,
    permisosPropios: usuario?.permisosPropios,
  });

  // En el celular se piden siempre 6 meses desde el actual: las pestañas.
  const pedirDesde = celular ? hoy : desde;
  const pedirMeses = celular ? 6 : cant;
  const cal = useApi(
    () => apiAcademia.calendario({ sede: sede.sucursalId, desde: pedirDesde, meses: pedirMeses }),
    [sede.sucursalId, pedirDesde, pedirMeses],
  );
  const ajustes = useApi(() => apiAcademia.ajustes(), []);
  const carreras = useApi(() => apiAcademia.carreras(), []);

  // Con "Todas las sedes" las tarjetas se mezclan y ninguna diría de qué sede
  // es (auditoría 26-oct, U3): cada tarjeta trae su `sede` y se la rotula. Con
  // una sola sede a la vista no hace falta: se ve en el selector y el título.
  const verVariasSedes = sede.elegir && sede.sucursalId == null;
  const sedeDe = (g: GrupoEnCalendario) => (verVariasSedes ? g.sede?.nombre : undefined);

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

  /**
   * Con "Todas las sedes" la fila no dice de qué sede es: se deduce de las
   * franjas. Si la franja es de una sola sede, esa; si es de varias o de
   * todas, se pide elegir. Antes se proponía la principal y el grupo quedaba
   * fuera de sus franjas (QA ronda 2, B-07).
   */
  const abrirHueco = (fila: FilaCalendario, mes: string) => {
    const base = { inicio: fila.inicio, fin: fila.fin, mes, esFranja: fila.esFranja };
    const propia = sede.sucursalId ?? usuario?.sucursalId ?? null;
    if (propia != null || !sede.elegir) return setHueco({ ...base, sede: propia });
    const iguales = fila.esFranja ? (ajustes.datos?.franjas ?? []).filter((f) => f.inicio === fila.inicio && f.fin === fila.fin) : [];
    const deTodas = iguales.some((f) => f.almacenId == null);
    const ids = [...new Set(iguales.map((f) => f.almacenId).filter((x): x is number => x != null))];
    if (!deTodas && ids.length === 1) return setHueco({ ...base, sede: ids[0] });
    setHueco({ ...base, sede: null, elegirSede: true, ...(!deTodas && ids.length > 1 ? { sedesPosibles: ids } : {}) });
  };

  const ultimoVisible = sumarMeses(desde, cant - 1);
  const rango = `${nombreMes(desde)} ${desde.slice(0, 4)} – ${nombreMes(ultimoVisible)} ${ultimoVisible.slice(0, 4)}`;

  // Un solo panel a la vez (26-oct): en el celular el resumen del grupo es una
  // hoja, y abrir "Nuevo grupo" o Inscribir con ella abierta los encimaba.
  const elegir = (e: Elegido) => {
    setHueco(null);
    setElegido(e);
  };
  const enHueco = (fila: FilaCalendario, mes: string) => {
    setElegido(null);
    abrirHueco(fila, mes);
  };
  // C2: «Abrir el primer grupo», al crear un curso, llega con `?nuevoGrupo=<curso>`
  // y abre «Nuevo grupo» con ese curso ya elegido. El parámetro se consume al
  // abrirse: un F5 o el botón «atrás» no vuelven a abrir el panel.
  const [params, setParams] = useSearchParams();
  const cursoPedido = Number(params.get("nuevoGrupo"));
  useEffect(() => {
    if (!params.has("nuevoGrupo")) return;
    if (abre && Number.isInteger(cursoPedido) && cursoPedido > 0) {
      setElegido(null);
      setHueco({ sede: sede.sucursalId ?? usuario?.sucursalId ?? null, carreraId: cursoPedido });
    }
    // Se limpia aunque no se pueda abrir (sin el permiso, o un valor que no es un curso).
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete("nuevoGrupo");
        return n;
      },
      { replace: true },
    );
    // Sólo reacciona al parámetro; el resto se lee en el momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const nuevoGrupo = () => {
    setElegido(null);
    setHueco({ sede: sede.sucursalId ?? usuario?.sucursalId ?? null });
  };
  const abrirInscribir = () => {
    setElegido(null);
    setHueco(null);
    setInscribiendo(true);
  };
  const hayGrilla = !!datos && datos.filas.length > 0;

  return (
    <PaginaAcademia ancho="max-w-[1400px]" conBarraAbajo={celular && abre} className={elegido && !celular ? "md:!pr-[404px]" : ""}>
      <EncabezadoPagina
        titulo="Calendario"
        bajada={
          <>
            {nombreSede ? `${p.Sede} ${nombreSede} · ` : ""}los {p.materias} empiezan el {dia} de cada mes
          </>
        }
        acciones={
          <>
            {/* D1: la recepción no tiene `academia.grupos` y su primera pantalla era un
                calendario sin una sola acción. La principal es la primera que tenga el
                rol: "Nuevo grupo" (en el celular va en la barra de abajo), "Inscribir"
                o "Cobrar a un estudiante"; las demás quedan en gris. */}
            {abre && !celular && (
              <Boton icono="plus" onClick={nuevoGrupo}>
                Nuevo grupo
              </Boton>
            )}
            {inscribe && (
              <Boton icono={abre ? undefined : "plus"} variante={abre ? "ghost" : "primary"} onClick={abrirInscribir}>
                Inscribir
              </Boton>
            )}
            {cobra && (
              <Boton icono="dollar" variante={abre || inscribe ? "ghost" : "primary"} onClick={() => navigate(RUTA_COBRAR)}>
                Cobrar a un estudiante
              </Boton>
            )}
            <MenuMas etiqueta="Más acciones del calendario" titulo="Calendario" acciones={acciones} />
          </>
        }
      />

      {/* C1: la lista de primeros pasos de un instituto nuevo; se va sola al completarse. */}
      <PrimerosPasos />

      {sede.selector}

      {/* Lo del día que vivía en "Hoy" (26-oct): la llegada del docente. */}
      {puede("academia_hoy") && <ClasesDeHoy sucursalId={sede.sucursalId} />}

      {cal.error && !datos ? (
        <ErrorMsg onReintentar={cal.recargar}>{cal.error}</ErrorMsg>
      ) : !datos ? (
        <Cargando />
      ) : !hayGrilla ? (
        <Tarjeta etiqueta="Calendario de grupos">
          <Vacio
            icono="calendar"
            titulo="El calendario está vacío"
            texto={configura ? "Cargá las franjas horarias en Ajustes, o abrí el primer grupo." : "Todavía no hay grupos abiertos."}
            accion={abre ? <Boton onClick={() => setHueco({ sede: sede.sucursalId ?? null })}>Nuevo grupo</Boton> : undefined}
          />
        </Tarjeta>
      ) : celular ? (
        <Tarjeta etiqueta="Calendario de grupos" sinRelleno barra={<PestanasMes meses={datos.meses} valor={mesCel} hoy={hoy} onChange={setMesCel} />}>
          <VistaCelular
            filas={datos.filas}
            mes={mesCel}
            hoy={hoy}
            pasa={pasa}
            sedeDe={sedeDe}
            abre={abre}
            onElegir={(grupo, fila) => elegir({ grupo, inicio: fila.inicio, fin: fila.fin, mes: mesCel })}
            onHueco={(fila) => enHueco(fila, mesCel)}
          />
        </Tarjeta>
      ) : (
        <Tarjeta
          etiqueta="Calendario de grupos"
          sinRelleno
          barra={
            <div className="flex flex-wrap items-center justify-between gap-3 py-3">
              <ChipsFiltro
                etiqueta={`Filtrar por ${p.carrera}`}
                valor={curso == null ? "todos" : String(curso)}
                onChange={(v) => setCurso(v === "todos" ? null : Number(v))}
                opciones={[{ clave: "todos", label: "Todos", n: totalGrupos }, ...cursos.map((c) => ({ clave: String(c.id), label: c.nombre, n: c.n }))]}
              />
              <div className="flex flex-wrap items-center gap-2">
                {desde !== hoy && (
                  <BotonFila icono="calendar" onClick={() => setDesde(hoy)}>
                    Volver a {nombreMes(hoy)}
                  </BotonFila>
                )}
                <div className="flex items-center gap-1.5">
                  <BotonIcono icono="chevronLeft" etiqueta="Mes anterior" onClick={() => setDesde(sumarMeses(desde, -1))} />
                  <span aria-live="polite" className="min-w-[13rem] text-center text-[13px] font-semibold capitalize text-texto-2">
                    {rango}
                  </span>
                  <BotonIcono icono="chevronRight" etiqueta="Mes siguiente" onClick={() => setDesde(sumarMeses(desde, 1))} />
                </div>
                <div role="group" aria-label="Cuántos meses mostrar" className="flex rounded-lg border border-borde bg-white p-0.5">
                  {[3, 6].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={cant === n}
                      onClick={() => setCant(n)}
                      className={`min-h-8 rounded-md px-3 text-[13px] font-semibold transition-colors ${
                        cant === n ? "bg-primary-50 text-primary-700" : "text-texto-3 hover:bg-muted"
                      }`}
                    >
                      {n} meses
                    </button>
                  ))}
                </div>
              </div>
            </div>
          }
          pie={
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-texto-3">
              <span className="flex items-center gap-1.5">
                <span className={`h-3.5 w-5 rounded ${claseTarjetita(false)}`} /> {p.Materia} en curso o por venir
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`h-3.5 w-5 rounded ${claseTarjetita(true)}`} /> Último {p.materia} del grupo
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`h-3.5 w-5 rounded ${CLASE_HUECO}`} /> Hueco libre
              </span>
              <span>Cada columna es el mes en que empieza el {p.materia}</span>
            </div>
          }
        >
          <Grilla
            meses={datos.meses}
            filas={datos.filas}
            hoy={hoy}
            pasa={pasa}
            abre={abre}
            sedeDe={sedeDe}
            elegidoId={elegido?.grupo.grupoId ?? null}
            onElegir={(grupo, fila, mes) => elegir({ grupo, inicio: fila.inicio, fin: fila.fin, mes })}
            onHueco={enHueco}
          />
        </Tarjeta>
      )}

      {celular && abre && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde-soft bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] md:hidden">
          <Boton icono="plus" className="min-h-11 w-full" onClick={nuevoGrupo}>
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
          onInscribir={() => {
            // Se cierra el resumen: Inscribir es de pantalla completa y quedaba
            // debajo de la hoja del celular.
            setInscribir({ id: elegido.grupo.grupoId, nombre: elegido.grupo.nombre });
            setElegido(null);
          }}
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

      {inscribiendo && (
        <Inscribir
          onCerrar={() => setInscribiendo(false)}
          onInscrito={(r) => {
            setInscribiendo(false);
            cal.recargar();
            if (r.cobrar) navigate(rutaCobroInscripcion(r.inscripcion.id, r.inscripcion.grupo?.sede, r.montoHoy));
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
    </PaginaAcademia>
  );
}

/** "18/20" con su barrita; se llena en el color del negocio, nunca en rojo. */
function Ocupacion({ inscritos, cupo }: { inscritos: number; cupo: number | null }) {
  const pct = cupo ? Math.min(100, Math.round((inscritos / cupo) * 100)) : 0;
  return (
    <span className="flex items-center gap-2">
      {cupo != null && (
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-50">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </span>
      )}
      <span className="text-xs font-semibold tabular-nums text-texto-2">
        {inscritos}/{cupo ?? "—"}
      </span>
    </span>
  );
}

/** "M2 de 3 · Degradados": el módulo, resaltado en el color del negocio. */
const CLASE_MODULO = "truncate rounded-md bg-primary-50 px-1.5 py-0.5 font-semibold text-primary-700";

function TarjetaGrupo({
  g,
  sede,
  pasado,
  elegido,
  onClick,
}: {
  g: GrupoEnCalendario;
  /** El nombre de la sede, sólo cuando se ven varias a la vez. */
  sede?: string;
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
      className={`block w-full rounded-lg p-2.5 text-left text-xs transition-[border-color,box-shadow] hover:border-primary-200 hover:shadow-md ${claseTarjetita(g.ultimo)} ${
        elegido ? "!border-primary ring-2 ring-primary-100" : ""
      } ${pasado ? "opacity-60" : ""}`}
    >
      <span className="flex items-baseline justify-between gap-1">
        <b className="truncate text-[13px] text-texto">{g.carrera.nombre}</b>
        <span className="shrink-0 font-semibold text-texto-3">{diasTexto(g.dias)}</span>
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-1">
        <span className={CLASE_MODULO}>
          M{g.modulo.orden} de {g.modulo.total} · {g.modulo.nombre}
        </span>
        {g.ultimo && <span className="shrink-0 rounded border border-primary-200 px-1 text-[10px] font-semibold text-primary-700">último</span>}
      </span>
      <span className="mt-1 block truncate text-texto-3">{g.docente ? `Prof. ${g.docente.nombre}` : `${p.Docente} por elegir`}</span>
      {sede && <span className="mt-0.5 block truncate font-semibold text-texto-4">{`${p.Sede} ${sede}`}</span>}
      <span className="mt-1.5 block">
        <Ocupacion inscritos={g.inscritos} cupo={g.cupo} />
      </span>
      {g.inscripcionAbierta && g.modulo.orden === 1 && !pasado && (
        <span className="mt-1.5 block">
          <Chip tono="verde">Inscripción abierta</Chip>
        </span>
      )}
    </button>
  );
}

function Grilla({
  meses,
  filas,
  hoy,
  pasa,
  sedeDe,
  abre,
  elegidoId,
  onElegir,
  onHueco,
}: {
  meses: string[];
  filas: FilaCalendario[];
  hoy: string;
  pasa: (g: GrupoEnCalendario) => boolean;
  sedeDe: (g: GrupoEnCalendario) => string | undefined;
  abre: boolean;
  elegidoId: number | null;
  onElegir: (g: GrupoEnCalendario, fila: FilaCalendario, mes: string) => void;
  onHueco: (fila: FilaCalendario, mes: string) => void;
}) {
  const columnas = `96px repeat(${meses.length}, minmax(${meses.length > 3 ? 168 : 220}px, 1fr))`;
  // El fondo de cada columna: el mes actual con un tinte, los que pasaron en gris.
  const fondoMes = (m: string) => (m === hoy ? "bg-primary-50/50" : m < hoy ? "bg-muted/50" : "");
  return (
    // scroll-lateral-ok: la grilla del calendario, 6 columnas de meses; el scroll queda dentro de la tarjeta.
    <div className="overflow-x-auto">
      <div role="table" aria-label="Calendario de módulos" className="min-w-max">
        <div role="row" className="grid border-b border-borde-soft bg-muted" style={{ gridTemplateColumns: columnas }}>
          <span role="columnheader" className="sticky left-0 z-10 bg-muted px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-texto-4 sm:pl-5">
            Horario
          </span>
          {meses.map((m) => (
            <div key={m} role="columnheader" className={`border-l border-borde-soft px-3 py-2.5 ${m === hoy ? "bg-primary-50" : ""}`}>
              <span className={`block text-sm capitalize ${m === hoy ? "font-bold text-primary-700" : m < hoy ? "text-texto-3" : "font-semibold text-texto"}`}>
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
            <div role="rowheader" className="sticky left-0 z-10 bg-white px-4 py-3 sm:pl-5">
              <span className="block text-sm font-bold tabular-nums text-texto">{fila.inicio}</span>
              <span className="block text-xs tabular-nums text-texto-3">a {fila.fin}</span>
              {!fila.esFranja && <span className="text-[10px] text-texto-4">fuera de franja</span>}
            </div>
            {meses.map((mes) => {
              const celda = fila.celdas.find((c) => c.mes === mes);
              const todos = celda?.grupos ?? [];
              const visibles = todos.filter(pasa);
              const pasado = mes < hoy;
              return (
                <div key={mes} role="cell" className={`space-y-2 border-l border-borde-soft p-2 ${fondoMes(mes)}`}>
                  {visibles.map((g) => (
                    <TarjetaGrupo key={g.grupoId} g={g} sede={sedeDe(g)} pasado={pasado} elegido={elegidoId === g.grupoId} onClick={() => onElegir(g, fila, mes)} />
                  ))}
                  {todos.length === 0 && !pasado && abre && (
                    <button
                      type="button"
                      title="Abrir grupo aquí"
                      aria-label={`Abrir grupo aquí: ${fila.inicio} a ${fila.fin}, ${nombreMes(mes)}`}
                      onClick={() => onHueco(fila, mes)}
                      className={`group flex min-h-[72px] w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold ${CLASE_HUECO}`}
                    >
                      <Icon name="plus" size={15} />
                      <span className="group-hover:hidden group-focus-visible:hidden">Libre</span>
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
    <div role="tablist" aria-label="Mes" className="-mx-4 -mb-px flex gap-1 overflow-x-auto px-2 [scrollbar-width:none]">
      {meses.map((m) => {
        const sel = m === valor;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(m)}
            className={`min-h-11 shrink-0 border-b-2 px-3 pb-2 pt-2 text-left ${sel ? "border-primary" : "border-transparent"}`}
          >
            <span className={`block text-sm capitalize ${sel ? "font-semibold text-texto" : "text-texto-3"}`}>{mesCorto(m)}</span>
            <span className={`block text-[11px] ${m === hoy ? "font-semibold text-primary-700" : "text-texto-4"}`}>{m === hoy ? "actual" : m.slice(0, 4)}</span>
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
  sedeDe,
  abre,
  onElegir,
  onHueco,
}: {
  filas: FilaCalendario[];
  mes: string;
  hoy: string;
  pasa: (g: GrupoEnCalendario) => boolean;
  sedeDe: (g: GrupoEnCalendario) => string | undefined;
  abre: boolean;
  onElegir: (g: GrupoEnCalendario, fila: FilaCalendario) => void;
  onHueco: (fila: FilaCalendario) => void;
}) {
  const p = usePalabras();
  return (
    <div className="divide-y divide-borde-soft">
      {filas.map((fila) => {
        const grupos = (fila.celdas.find((c) => c.mes === mes)?.grupos ?? []).filter(pasa);
        const rango = `${fila.inicio} a ${fila.fin}`;
        return (
          <section key={`${fila.inicio}-${fila.fin}-${fila.esFranja}`} aria-label={rango} className="px-4 py-3">
            <h2 className="mb-2 text-[13px] font-bold tabular-nums text-texto">{rango}</h2>
            <div className="space-y-2">
              {grupos.map((g) => (
                <button
                  key={g.grupoId}
                  type="button"
                  onClick={() => onElegir(g, fila)}
                  className={`flex w-full min-w-0 items-center gap-3 rounded-xl p-3 text-left ${claseTarjetita(g.ultimo)}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-texto">
                      {g.carrera.nombre} · {diasTexto(g.dias)}
                    </span>
                    <span className="mt-1 flex min-w-0">
                      <span className={`${CLASE_MODULO} text-[13px]`}>
                        M{g.modulo.orden} de {g.modulo.total} · {g.modulo.nombre}
                        {g.ultimo ? " · último" : ""}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-texto-3">{g.docente ? `Prof. ${g.docente.nombre}` : `${p.Docente} por elegir`}</span>
                    {sedeDe(g) && <span className="mt-0.5 block truncate text-xs font-semibold text-texto-4">{`${p.Sede} ${sedeDe(g)}`}</span>}
                    {g.inscripcionAbierta && g.modulo.orden === 1 && mes >= hoy && (
                      <span className="mt-1.5 block">
                        <Chip tono="verde">Inscripción abierta</Chip>
                      </span>
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
                  className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold ${CLASE_HUECO}`}
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

  const ver = (
    <Link
      to={`/academia/grupos/${g.grupoId}`}
      className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
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
              <Boton className="min-h-11 flex-1" onClick={onInscribir}>
                Inscribir {p.alumno}
              </Boton>
              {ver}
            </>
          ) : (
            <>
              {ver}
              {inscribe && (
                <Boton variante="ghost" className="min-h-11" onClick={onInscribir}>
                  Inscribir
                </Boton>
              )}
            </>
          )}
        </div>
      }
    >
      <ResumenPanel className="mb-4 grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-texto-4">Inscritos</span>
          <span className="mt-0.5 block text-xl font-bold tabular-nums text-texto">
            {g.inscritos}
            {g.cupo != null && <span className="text-sm font-normal text-texto-3"> de {g.cupo}</span>}
          </span>
          {g.cupo != null && (
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </span>
          )}
        </div>
        {g.pagaronModulo != null && (
          <div className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-texto-4">
              {empezo ? `Pagaron el M${g.modulo.orden}${mes === hoy ? " (actual)" : ""}` : `Pagaron el M${g.modulo.orden} por adelantado`}
            </span>
            <span className="mt-0.5 block text-xl font-bold tabular-nums text-texto">
              {g.pagaronModulo}
              <span className="text-sm font-normal text-texto-3"> de {g.inscritos}</span>
            </span>
            <span className={`text-xs ${faltan && empezo ? "font-semibold text-danger-text" : "text-texto-3"}`}>
              {faltan === 0 ? "todos al día" : empezo ? `${faltan} sin pagar` : `${faltan} todavía no`}
            </span>
          </div>
        )}
      </ResumenPanel>

      <SeccionPanel titulo={p.Materias}>
        {!d ? (
          <p className="text-sm text-texto-3">{detalle.error || "Cargando…"}</p>
        ) : (
          <ul className="divide-y divide-borde-soft">
            {[...d.materiasGrupo]
              .sort((x, y) => x.materia.orden - y.materia.orden)
              .map((mg) => {
                const enCurso = mg.desde <= hoyIso && hoyIso <= mg.hasta;
                const terminado = mg.hasta < hoyIso;
                return (
                  <li key={mg.id} className="flex items-start gap-3 py-2.5">
                    <span
                      className={`flex h-7 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                        enCurso ? "bg-primary-50 text-primary-700" : "bg-muted text-texto-4"
                      }`}
                    >
                      M{mg.materia.orden}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${enCurso ? "font-semibold text-texto" : "text-texto-2"}`}>{mg.materia.nombre}</span>
                      <span className="block truncate text-xs text-texto-3">{mg.docente ? `Prof. ${mg.docente.nombre}` : `${p.Docente} por elegir`}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs capitalize text-texto-2">{nombreMes(mg.mesLiquidacion, hoy)}</span>
                      {terminado ? (
                        <Chip tono="gris">terminado</Chip>
                      ) : enCurso ? (
                        <Chip tono="marca">en curso</Chip>
                      ) : (
                        <span className="block text-xs text-texto-3">empieza el {fechaCorta(mg.desde)}</span>
                      )}
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </SeccionPanel>

      {carrera?.precioModulo != null && (
        <SeccionPanel titulo="Precio">
          <p className="text-sm text-texto-2">
            <b className="tabular-nums text-texto">{fmtMoney(carrera.precioModulo)}</b> por {p.materia}
            {completo != null && ` · pago completo ${fmtMoney(completo)}`}
          </p>
        </SeccionPanel>
      )}

      {/* Antes era un "⋯" al pie, que en el celular abría una segunda hoja
          encima de ésta (26-oct). Editar el grupo es "Ver grupo", y exportar
          todavía no existía: queda pasar lista, a la vista. */}
      <BotonFila variante="ghost" icono="lista" onClick={() => navigate(`/academia/grupos/${g.grupoId}/lista`)}>
        Pasar lista
      </BotonFila>
    </PanelLateral>
  );
}
