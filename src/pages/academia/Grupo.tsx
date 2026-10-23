import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import MenuMas, { type AccionMenu } from "../../components/MenuMas";
import { Paginacion } from "../../components/Paginacion";
import PanelLateral from "../../components/PanelLateral";
import { AvisoOk, Boton, Campo, Cargando, Confirmar, ErrorMsg, Input, Modal, Select, Vacio, useAviso } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { mesCorto, mesDe } from "../../lib/academia/calendario";
import { fechaCorta, horarioGrupo, nombreAlumno, nombreDe } from "../../lib/academia/formato";
import type { AlumnoDelGrupo, FiltroAlumnosGrupo, GrupoDetalle } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { abrirWhatsapp, rutaCobroInscripcion, textoFormaPago } from "../../lib/academia/vista";
import { enlaceWhatsApp } from "../../lib/agenda/recordatorio";
import { fmtMoney } from "../../lib/format";
import { usePaginado } from "../../lib/paginado";
import { cobraCuotas, soloLoSuyo, tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import Inscribir from "./Inscribir";
import {
  BotonFila,
  EncabezadoPagina,
  ErrorDeCarga,
  EstadoDeCuenta,
  PagoDelModulo,
  FiltrosConteo,
  GrillaKpi,
  KpiTarjeta,
  LISTA,
  PaginaAcademia,
  PuntosPago,
  ResumenPanel,
  SeccionPanel,
  TABLA,
  Tarjeta,
} from "./piezas";

/**
 * E3 · Detalle de grupo, versión limpia (lienzo E3 v2): el centralizador,
 * pero vivo. Arriba el curso, el horario y la barra de módulos con su mes;
 * una acción principal (Inscribir) y el resto en "⋯". La lista lleva los
 * filtros como indicadores (Todos · Deben · Al día · Retirados) y tocar una
 * fila abre el panel del estudiante con su estado de cuenta, Cobrar y el
 * enlace de pago por WhatsApp. Asistencia y Notas son sus propias pantallas
 * (N6, E13): cada cosa en su lugar, no las dos en la misma celda.
 *
 * El docente ve a los suyos sin montos ni teléfonos: sólo si pagaron el
 * módulo actual (D6).
 */
export default function Grupo() {
  const { id } = useParams();
  const grupoId = Number(id);
  const navigate = useNavigate();
  const { state } = useLocation() as { state?: { avisos?: string[] } | null };
  const { usuario, negocio, rubro } = useAuth();
  const p = usePalabras();
  const [filtro, setFiltro] = useState<FiltroAlumnosGrupo>("todos");
  const [elegido, setElegido] = useState<AlumnoDelGrupo | null>(null);
  const [inscribiendo, setInscribiendo] = useState(false);
  const [editando, setEditando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [errorAccion, setErrorAccion] = useState("");
  /** Lo que avisa el backend al guardar (más de 4 h por día, clases regeneradas…). */
  const [aviso, setAviso] = useAviso(8000);

  const grupo = useApi(() => apiAcademia.grupo(grupoId), [grupoId]);
  const alumnos = usePaginado((pg) => apiAcademia.alumnosDelGrupo(grupoId, filtro, pg), [grupoId, filtro]);
  /**
   * Los números de cada filtro, contados con el mismo filtro que la lista
   * (una página de 1 fila por filtro): así "Todos" incluye al retirado que se
   * ve en la lista, y "Vencidos" es exactamente lo que muestra ese filtro. Los
   * contadores del grupo (`inscritos`, `deben`) cuentan otra cosa: sólo las
   * inscripciones vivas.
   */
  const conteos = useApi(
    () =>
      Promise.all(
        (["todos", "deben", "aldia", "retirados"] as const).map((f) =>
          apiAcademia
            .alumnosDelGrupo(grupoId, f, { page: 1, pageSize: 1 })
            .then((r) => [f, r.total] as const)
            .catch(() => [f, null] as const),
        ),
      ).then((pares) => Object.fromEntries(pares) as Record<FiltroAlumnosGrupo, number | null>),
    [grupoId],
  );
  const n = (f: FiltroAlumnosGrupo) => conteos.datos?.[f] ?? null;

  // El docente ve a sus alumnos sin montos (PLAN-ACADEMIAS §4).
  const sinMontos = soloLoSuyo(usuario, "academia.ver");
  const volverA = sinMontos ? "/academia/mis-clases" : "/academia/calendario";
  const cobra = cobraCuotas({ features: negocio?.features, rubro, permisos: usuario?.permisos, permisosPropios: usuario?.permisosPropios });
  const inscribe = tienePermiso(usuario, "academia.inscribir");
  const arma = tienePermiso(usuario, "academia.grupos");

  const g = grupo.datos;
  if (grupo.error && !g) {
    return (
      <PaginaAcademia>
        <EncabezadoPagina titulo="Grupo" volver={{ a: volverA, texto: sinMontos ? "Mis clases" : "Calendario" }} />
        <Tarjeta etiqueta="Grupo">
          <ErrorDeCarga
            falla={grupo.falla}
            mensaje={grupo.error}
            onReintentar={grupo.recargar}
            que="este grupo"
            volver={sinMontos ? { a: "/academia/mis-clases", texto: "Ir a mis clases" } : { a: "/academia/calendario", texto: "Volver al calendario" }}
          />
        </Tarjeta>
      </PaginaAcademia>
    );
  }
  if (!g) return <Cargando />;

  const actual = g.materiaActual;
  const cobroActual = actual ? g.resumenCobro.porMateria.find((m) => m.materiaOrden === actual.orden) : null;
  const mgActual = actual ? g.materiasGrupo.find((m) => m.materia.orden === actual.orden) : null;
  const docenteActual = actual?.docente ?? g.materiasGrupo.find((m) => m.docente)?.docente?.nombre ?? null;
  const subtitulo = [
    nombreDe(g.sede),
    g.aula,
    docenteActual ? `Prof. ${docenteActual}` : null,
    actual && mgActual
      ? `M${actual.orden} ${actual.nombre} (${fechaCorta(mgActual.desde)} al ${fechaCorta(mgActual.hasta)})`
      : `hasta el ${fechaCorta(g.fechaFin)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const acciones: AccionMenu[] = [
    { clave: "lista", etiqueta: "Pasar lista", icono: "lista", onClick: () => navigate(`/academia/grupos/${grupoId}/lista`) },
    // Quien no carga notas (recepción) las puede mirar, pero el menú no le
    // promete cargarlas: el servidor se lo rechazaba (QA ronda 2, B-05).
    {
      clave: "notas",
      etiqueta: tienePermiso(usuario, "notas.registrar") ? "Cargar notas" : "Ver notas",
      icono: "edit",
      onClick: () => navigate(`/academia/grupos/${grupoId}/notas`),
    },
    ...(sinMontos
      ? []
      : [{ clave: "excel", etiqueta: "Exportar Excel", icono: "download" as const, detalle: "Pronto", deshabilitada: true, separar: true, onClick: () => {} }]),
    ...(arma
      ? [
          { clave: "editar", etiqueta: "Editar grupo", onClick: () => setEditando(true), separar: true },
          g.cancelado
            ? { clave: "reactivar", etiqueta: "Reactivar grupo", onClick: () => void cambiarCancelado(false) }
            : { clave: "cancelar", etiqueta: "Cancelar grupo", onClick: () => setCancelando(true), peligrosa: true },
        ]
      : []),
  ];

  /** Cancelar (o reactivar) el grupo: deja de aparecer en la lista y no inscribe. */
  async function cambiarCancelado(cancelado: boolean) {
    setProcesando(true);
    setErrorAccion("");
    try {
      const nuevo = await apiAcademia.editarGrupo(grupoId, { cancelado });
      grupo.setDatos(nuevo);
      setCancelando(false);
      setAviso([cancelado ? "Grupo cancelado." : "Grupo reactivado.", ...(nuevo.avisos ?? [])].join(" "));
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : "No se pudo guardar");
      setCancelando(false);
    } finally {
      setProcesando(false);
    }
  }

  const conPie = alumnos.items.length > 0 && (!!cobroActual || alumnos.paginacion.total > 20);
  const faltanPagar = cobroActual ? cobroActual.total - cobroActual.pagaron : null;

  return (
    <PaginaAcademia conBarraAbajo className={elegido ? "md:mr-[380px] md:w-auto" : ""}>
      {/* En el celular Inscribir va en la barra de abajo y el "⋯" sube a la
          esquina, a la altura de "Calendario": solo debajo del título quedaba
          suelto. */}
      <div className="relative max-md:pr-12">
        <EncabezadoPagina
          titulo={`${nombreDe(g.carrera)} · ${horarioGrupo(g)}`}
          volver={{ a: volverA, texto: sinMontos ? "Mis clases" : "Calendario" }}
          bajada={subtitulo}
          acciones={
            <>
              {inscribe && (
                <Boton icono="plus" className="max-md:!hidden" onClick={() => setInscribiendo(true)} disabled={g.estado === "TERMINADO" || !!g.cancelado}>
                  Inscribir {p.alumno}
                </Boton>
              )}
              <span className="max-md:absolute max-md:right-0 max-md:top-0">
                <MenuMas etiqueta="Más acciones del grupo" titulo={`${nombreDe(g.carrera)} · ${horarioGrupo(g)}`} acciones={acciones} />
              </span>
            </>
          }
        />
      </div>

      {state?.avisos?.length ? <AvisoOk>{`Grupo creado. ${state.avisos.join(" · ")}`}</AvisoOk> : null}
      {g.cancelado && (
        <p role="status" className="rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm font-semibold text-texto-2">
          Grupo cancelado: no aparece en la lista ni recibe inscripciones.
        </p>
      )}
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{errorAccion}</ErrorMsg>

      {/* Los números del grupo de un vistazo: el docente, sin montos (D6). */}
      <GrillaKpi columnas={sinMontos ? 3 : 4}>
        <KpiTarjeta
          etiqueta="Inscritos"
          icono="users"
          valor={g.inscritos}
          pie={g.cupo != null ? `de ${g.cupo} lugares` : "sin tope de cupo"}
        />
        <KpiTarjeta
          etiqueta={cobroActual ? `Pagaron el M${cobroActual.materiaOrden}` : `Pago del ${p.materia}`}
          icono="coins"
          valor={cobroActual ? `${cobroActual.pagaron} de ${cobroActual.total}` : "—"}
          tono={cobroActual && cobroActual.total > 0 && cobroActual.pagaron === cobroActual.total ? "ok" : "normal"}
          pie={actual ? actual.nombre : "todavía no empezó"}
        />
        {sinMontos ? (
          // La tercera del docente va a lo ancho en el celular (2 por fila): sola quedaba media fila vacía.
          <div className="col-span-2 grid lg:col-span-1">
            <KpiTarjeta
              etiqueta="Falta pagar"
              icono="clock"
              valor={faltanPagar ?? "—"}
              tono={faltanPagar ? "ambar" : "normal"}
              pie="sin pagar o abonó"
            />
          </div>
        ) : (
          <>
            <KpiTarjeta
              etiqueta="Deben"
              icono="alert"
              valor={g.deben}
              tono={g.deben > 0 ? "urgente" : "normal"}
              pie={g.deben > 0 && g.montoDebe != null ? fmtMoney(g.montoDebe) : "nadie debe"}
            />
            <KpiTarjeta etiqueta="Al día" icono="checkCirculo" valor={g.alDia} tono={g.alDia > 0 ? "ok" : "normal"} pie={`de ${g.inscritos} inscritos`} />
          </>
        )}
      </GrillaKpi>

      <MateriasDelGrupo g={g} />

      <Tarjeta
        id="t-alumnos"
        titulo={p.Alumnos}
        sinRelleno
        acciones={
          <nav aria-label="Más del grupo" className="flex flex-wrap gap-2">
            <BotonFila variante="ghost" icono="lista" a={`/academia/grupos/${grupoId}/lista`}>
              Asistencia
            </BotonFila>
            <BotonFila variante="ghost" icono="edit" a={`/academia/grupos/${grupoId}/notas`}>
              Notas
            </BotonFila>
          </nav>
        }
        barra={
          <FiltrosConteo<FiltroAlumnosGrupo>
            enTarjeta
            etiqueta={`Filtrar ${p.alumnos}`}
            opciones={[
              { clave: "todos", label: "Todos", n: n("todos") },
              ...(sinMontos
                ? []
                : [
                    { clave: "deben" as const, label: "Deben", n: n("deben"), urgente: true },
                    { clave: "aldia" as const, label: "Al día", n: n("aldia") },
                  ]),
              { clave: "retirados", label: "Retirados", n: n("retirados") },
            ]}
            valor={filtro}
            onChange={(v) => {
              setFiltro(v);
              setElegido(null);
            }}
          />
        }
        pie={
          conPie ? (
            <Paginacion
              {...alumnos.paginacion}
              extra={cobroActual ? `M${cobroActual.materiaOrden} pagado por ${cobroActual.pagaron} de ${cobroActual.total}` : undefined}
            />
          ) : undefined
        }
      >
        {alumnos.error && !alumnos.items.length ? (
          <div className="p-4 sm:p-5">
            <ErrorMsg onReintentar={alumnos.recargar}>{alumnos.error}</ErrorMsg>
          </div>
        ) : alumnos.cargando && !alumnos.items.length ? (
          <Cargando />
        ) : alumnos.items.length === 0 ? (
          <Vacio
            icono="users"
            titulo={filtro === "todos" ? `Todavía no hay ${p.alumnos} en este grupo` : `Ningún ${p.alumno} en esta lista`}
            accion={
              filtro === "todos" && inscribe ? (
                <Boton icono="plus" onClick={() => setInscribiendo(true)}>
                  Inscribir {p.alumno}
                </Boton>
              ) : undefined
            }
          />
        ) : (
          <TablaAlumnos
            filas={alumnos.items}
            elegido={elegido?.inscripcionId ?? null}
            // Con el panel abierto la columna Cobrar quedaría debajo: el panel ya
            // tiene su "Cobrar".
            conPanel={!!elegido}
            sinMontos={sinMontos}
            cobra={cobra}
            onElegir={setElegido}
            onCobrar={(a) => navigate(rutaCobroInscripcion(a.inscripcionId, g.sede))}
          />
        )}
      </Tarjeta>

      {inscribe && !g.cancelado && g.estado !== "TERMINADO" && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde-soft bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] md:hidden">
          <Boton icono="plus" className="min-h-11 w-full" onClick={() => setInscribiendo(true)}>
            Inscribir {p.alumno}
          </Boton>
        </div>
      )}

      <PanelAlumno
        fila={elegido}
        sinMontos={sinMontos}
        cobra={cobra}
        onCerrar={() => setElegido(null)}
        onCobrar={(a) => navigate(rutaCobroInscripcion(a.inscripcionId, g.sede))}
      />

      {inscribiendo && (
        <Inscribir
          grupoInicial={g}
          onCerrar={() => setInscribiendo(false)}
          onInscrito={(r) => {
            setInscribiendo(false);
            grupo.recargar();
            alumnos.recargar();
            conteos.recargar();
            if (r.cobrar) navigate(rutaCobroInscripcion(r.inscripcion.id, g.sede, r.montoHoy));
          }}
        />
      )}
      {editando && (
        <EditarGrupo
          g={g}
          onCerrar={() => setEditando(false)}
          onGuardado={(nuevo) => {
            setEditando(false);
            grupo.setDatos(nuevo);
            setAviso(["Grupo guardado.", ...(nuevo.avisos ?? [])].join(" "));
          }}
        />
      )}
      <Confirmar
        abierto={cancelando}
        titulo="Cancelar el grupo"
        texto="Deja de aparecer en la lista y en la página, y no recibe inscripciones. Se puede reactivar."
        etiquetaOk="Cancelar grupo"
        peligroso
        procesando={procesando}
        onCancel={() => setCancelando(false)}
        onOk={() => void cambiarCancelado(true)}
      />
    </PaginaAcademia>
  );
}

/** La barra de materias con su nombre: la actual resaltada, las cerradas con ✓. */
function MateriasDelGrupo({ g }: { g: GrupoDetalle }) {
  const p = usePalabras();
  const filas = [...g.materiasGrupo].sort((a, b) => a.materia.orden - b.materia.orden);
  if (!filas.length) return null;
  const estado = (orden: number) => g.materias.find((m) => m.orden === orden)?.estado ?? "FUTURA";
  const hoy = mesDe(new Date());
  const cols = { gridTemplateColumns: `repeat(${filas.length}, minmax(0, 1fr))` };
  return (
    <Tarjeta id="t-modulos" titulo={`${p.Materias} del grupo`}>
      <div className="space-y-2">
        <div className="grid gap-1.5" style={cols}>
          {filas.map((m) => (
            <span
              key={m.id}
              className={`h-1.5 rounded-full ${estado(m.materia.orden) === "FUTURA" ? "bg-primary-100" : "bg-primary"}`}
            />
          ))}
        </div>
        <div className="grid gap-1.5 text-[12px] sm:text-[13px]" style={cols}>
          {filas.map((m) => {
            const e = estado(m.materia.orden);
            return (
              <span key={m.id} className={`truncate ${e === "ACTUAL" ? "font-semibold text-primary-700" : "text-texto-3"}`}>
                M{m.materia.orden} <span className="hidden sm:inline">{m.materia.nombre} </span>· {mesCorto(m.mesLiquidacion)}
                {e === "CERRADA" ? " ✓" : e === "ACTUAL" ? " · actual" : m.mesLiquidacion.slice(0, 4) !== hoy.slice(0, 4) ? ` ${m.mesLiquidacion.slice(0, 4)}` : ""}
              </span>
            );
          })}
        </div>
      </div>
    </Tarjeta>
  );
}

function subtituloFila(a: AlumnoDelGrupo, sinMontos: boolean): string {
  const partes = [a.alumno.codigo];
  if (a.alumno.menor) partes.push("menor");
  if (a.descuento && !sinMontos) {
    const tipo = a.descuento.tipo === "BECA" ? "beca" : "promo";
    partes.push(a.descuento.pct != null ? `${tipo} ${a.descuento.pct} %` : tipo);
  }
  if (a.estado === "RETIRADA") partes.push("retirado");
  else if (a.estado === "OBSERVACION" || a.estado === "EN_OBSERVACION") partes.push("en observación");
  return partes.filter(Boolean).join(" · ");
}

/**
 * La tabla del grupo en escritorio y las tarjetas en el celular
 * (PLAN-TABLAS-MOVIL §2): nada de scroll lateral. La fila entera se toca; a
 * lo sumo queda el enlace "Cobrar" cuando hay algo que cobrar.
 */
function TablaAlumnos({
  filas,
  elegido,
  conPanel,
  sinMontos,
  cobra,
  onElegir,
  onCobrar,
}: {
  filas: AlumnoDelGrupo[];
  elegido: number | null;
  conPanel: boolean;
  sinMontos: boolean;
  cobra: boolean;
  onElegir: (a: AlumnoDelGrupo) => void;
  onCobrar: (a: AlumnoDelGrupo) => void;
}) {
  const p = usePalabras();
  const conCobrar = !sinMontos && !conPanel;
  const columnas = sinMontos
    ? "grid-cols-[minmax(200px,2fr)_140px_90px]"
    : conCobrar
      ? "grid-cols-[minmax(200px,2fr)_110px_120px_90px_110px_96px]"
      : "grid-cols-[minmax(180px,2fr)_100px_110px_80px_100px]";
  return (
    <>
      <div className="hidden md:block">
        <div className={`grid ${columnas} gap-3 px-5 py-2.5 ${TABLA.encabezado}`}>
          <span>{p.Alumno}</span>
          {sinMontos ? <span>Pago del {p.materia}</span> : <span>Forma de pago</span>}
          {!sinMontos && <span>Pagos</span>}
          <span>Asistencia</span>
          {!sinMontos && <span className="text-right">Debe</span>}
          {conCobrar && <span />}
        </div>
        <ul>
          {filas.map((a) => {
            const retirado = a.estado === "RETIRADA";
            return (
              <li key={a.inscripcionId}>
                {/* La fila no es un botón: el nombre es el botón que abre el
                    panel (y se estira sobre toda la fila con `after:`), y
                    "Cobrar" es otro botón aparte, encima. Un botón dentro de
                    otro es HTML inválido y los lectores de pantalla lo pierden. */}
                <div
                  className={`relative grid ${columnas} items-center gap-3 border-t border-borde-soft px-5 py-3 transition-colors ${
                    elegido === a.inscripcionId ? "bg-primary-50" : "hover:bg-muted"
                  } ${retirado ? "opacity-50" : ""}`}
                >
                  <span className="min-w-0">
                    <button
                      type="button"
                      aria-label={`Ver a ${nombreAlumno(a.alumno)}`}
                      aria-expanded={elegido === a.inscripcionId}
                      onClick={() => onElegir(a)}
                      className="block max-w-full truncate text-left text-sm font-semibold text-texto after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary"
                    >
                      {nombreAlumno(a.alumno)}
                    </button>
                    <span className="block truncate text-[12px] text-texto-3">{subtituloFila(a, sinMontos)}</span>
                  </span>
                  {sinMontos ? (
                    <PagoDelModulo estado={a.estadoPago} semaforo={a.semaforo} conSemaforo={a.semaforo !== undefined} />
                  ) : (
                    <>
                      <span className="truncate text-sm text-texto-2">{textoFormaPago(a.formaPago, a.plan?.nombre)}</span>
                      <PuntosPago pagos={a.pagos} />
                    </>
                  )}
                  <span className="text-sm tabular-nums text-texto-2">{a.asistenciaPct != null ? `${Math.round(a.asistenciaPct)} %` : "—"}</span>
                  {!sinMontos && (
                    <span className={`text-right text-sm font-semibold tabular-nums ${a.vencido ? "text-danger-text" : "text-texto-2"}`}>
                      {(a.saldo ?? 0) > 0 ? fmtMoney(a.saldo) : ""}
                    </span>
                  )}
                  {conCobrar && (
                    <span className="text-right">
                      {cobra && (a.saldo ?? 0) > 0 && !retirado && (
                        <BotonFila
                          icono="dollar"
                          aria-label={`Cobrar a ${nombreAlumno(a.alumno)}`}
                          onClick={() => onCobrar(a)}
                          className="relative z-10"
                        >
                          Cobrar
                        </BotonFila>
                      )}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <ul className={`${LISTA.lista} md:hidden`}>
        {filas.map((a) => (
          <li key={a.inscripcionId}>
            <button
              type="button"
              onClick={() => onElegir(a)}
              className={`flex w-full items-start justify-between gap-3 text-left ${LISTA.itemHover} ${a.estado === "RETIRADA" ? "opacity-50" : ""}`}
            >
              <span className="min-w-0 space-y-1">
                <span className="block truncate text-[15px] font-semibold text-texto">{nombreAlumno(a.alumno)}</span>
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-texto-3">
                  <span className="shrink-0">
                    {sinMontos ? (
                      <PagoDelModulo estado={a.estadoPago} semaforo={a.semaforo} conSemaforo={a.semaforo !== undefined} />
                    ) : (
                      <PuntosPago pagos={a.pagos} />
                    )}
                  </span>
                  <span className="truncate">
                    {[sinMontos ? null : textoFormaPago(a.formaPago, a.plan?.nombre), a.asistenciaPct != null ? `${Math.round(a.asistenciaPct)} %` : null, subtituloFila(a, sinMontos)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </span>
              {!sinMontos && (a.saldo ?? 0) > 0 && (
                <span className={`shrink-0 text-[15px] font-bold tabular-nums ${a.vencido ? "text-danger-text" : "text-texto"}`}>
                  {fmtMoney(a.saldo)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * El panel del alumno (lateral en escritorio, hoja en el celular): su estado
 * de cuenta en esta inscripción y las acciones Cobrar · WhatsApp · Ficha.
 */
function PanelAlumno({
  fila,
  sinMontos,
  cobra,
  onCerrar,
  onCobrar,
}: {
  fila: AlumnoDelGrupo | null;
  sinMontos: boolean;
  cobra: boolean;
  onCerrar: () => void;
  onCobrar: (a: AlumnoDelGrupo) => void;
}) {
  const navigate = useNavigate();
  const p = usePalabras();
  const alumnoId = fila?.alumno.id ?? null;
  const ficha = useApi(() => (alumnoId ? apiAcademia.alumno(alumnoId) : Promise.resolve(null)), [alumnoId]);
  const [error, setError] = useState("");
  const [avisando, setAvisando] = useState(false);
  if (!fila) return null;

  const datos = ficha.datos?.id === fila.alumno.id ? ficha.datos : null;
  const inscripcion = datos?.inscripciones.find((i) => i.id === fila.inscripcionId) ?? null;
  const tutor = datos?.tutores.find((t) => t.principal) ?? datos?.tutores[0] ?? null;
  const pendiente = inscripcion?.cuotas.find((c) => c.estado !== "PAGADA" && c.estado !== "ANULADA" && c.vencida) ??
    inscripcion?.cuotas.find((c) => c.estado !== "PAGADA" && c.estado !== "ANULADA");
  // Como el recordatorio del backend: al tutor si es menor o si el alumno no
  // tiene teléfono.
  const destinoWhats = tutor && (fila.alumno.menor || !datos?.telefono) ? tutor : null;

  async function whatsapp() {
    setError("");
    // Con algo que se debe, el recordatorio de esa cuota con el enlace de
    // pago (ronda 2): queda anotado.
    if (pendiente && !sinMontos) {
      setAvisando(true);
      try {
        const r = await apiAcademia.recordatorio(pendiente.id);
        abrirWhatsapp(r.url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo armar el mensaje");
      } finally {
        setAvisando(false);
      }
      return;
    }
    const telefono = destinoWhats?.telefono ?? datos?.telefono;
    const url = enlaceWhatsApp(telefono, `Hola ${destinoWhats?.nombre.split(" ")[0] ?? fila!.alumno.nombres.split(" ")[0]}`);
    if (url) abrirWhatsapp(url);
    else setError("No tiene un teléfono cargado.");
  }

  const subtitulo = [
    fila.alumno.codigo,
    sinMontos ? null : textoFormaPago(fila.formaPago, fila.plan?.nombre),
    tutor && fila.alumno.menor && !sinMontos ? `tutor: ${tutor.nombre}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PanelLateral
      abierto
      titulo={nombreAlumno(fila.alumno)}
      subtitulo={subtitulo}
      onClose={onCerrar}
      acciones={
        <>
          {cobra && !sinMontos && (fila.saldo ?? 0) > 0 && fila.estado !== "RETIRADA" && (
            <Boton className="w-full" onClick={() => onCobrar(fila)}>
              Cobrar {fmtMoney(fila.saldo)}
            </Boton>
          )}
          {/* El docente no escribe a los estudiantes ni ve su ficha: lo dice
              en clase y el recordatorio lo manda la recepción. */}
          {!sinMontos && (
            // Lado a lado si entran; si el texto es largo, uno debajo del otro (sin partir el texto).
            <div className="flex flex-wrap gap-2">
              <Boton variante="ghost" className="flex-auto whitespace-nowrap" onClick={() => void whatsapp()} disabled={avisando}>
                {pendiente ? (destinoWhats ? "Enviar QR al tutor" : "Enviar QR por WhatsApp") : destinoWhats ? "WhatsApp al tutor" : "WhatsApp"}
              </Boton>
              <Boton variante="ghost" className="flex-auto whitespace-nowrap" onClick={() => navigate(`/academia/alumnos/${fila.alumno.id}`)}>
                Ficha completa
              </Boton>
            </div>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Lo que importa de un vistazo: cuánto debe (o si pagó el módulo, para
            el docente) y cómo viene de asistencia. */}
        <ResumenPanel className="grid grid-cols-2 gap-3">
          {sinMontos ? (
            <div className="min-w-0 text-sm">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-texto-4">Pago del {p.materia} actual</span>
              <span className="mt-1 block">
                <PagoDelModulo estado={fila.estadoPago} semaforo={fila.semaforo} conSemaforo={fila.semaforo !== undefined} />
              </span>
            </div>
          ) : (
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-texto-4">Por pagar</span>
              <span
                className={`mt-0.5 block text-lg font-bold tabular-nums ${(fila.saldo ?? 0) > 0 && fila.vencido ? "text-danger-text" : "text-texto"}`}
              >
                {(fila.saldo ?? 0) > 0 ? fmtMoney(fila.saldo) : "Nada"}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-texto-4">Asistencia</span>
            <span className="mt-0.5 block text-lg font-bold tabular-nums text-texto">
              {fila.asistenciaPct != null ? `${Math.round(fila.asistenciaPct)} %` : "—"}
            </span>
          </div>
        </ResumenPanel>
        <div>
          {!sinMontos && (
            <SeccionPanel titulo={`Estado de cuenta${fila.formaPago || fila.plan ? ` · ${textoFormaPago(fila.formaPago, fila.plan?.nombre)}` : ""}`}>
              {ficha.cargando && !datos ? (
                <Cargando />
              ) : inscripcion ? (
                <EstadoDeCuenta cuotas={inscripcion.cuotas} />
              ) : (
                <ul className="space-y-1 text-sm">
                  {fila.pagos.map((x) => (
                    <li key={x.materiaOrden} className="flex justify-between gap-3">
                      <span>M{x.materiaOrden}</span>
                      <span className={x.estado === "VENCIDA" ? "font-semibold text-danger-text" : "text-texto-3"}>{x.detalle}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SeccionPanel>
          )}
          {!sinMontos && (datos?.telefono || (fila.alumno.menor && tutor)) && (
            <SeccionPanel titulo="Contacto">
              <dl className="space-y-2 text-sm">
                {datos?.telefono && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-texto-3">Teléfono</dt>
                    <dd className="tabular-nums text-texto">{datos.telefono}</dd>
                  </div>
                )}
                {fila.alumno.menor && tutor && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-texto-3">Tutor</dt>
                    <dd className="min-w-0 text-right text-texto">
                      {tutor.nombre} ({tutor.parentesco}){tutor.telefono ? ` · ${tutor.telefono}` : ""}
                    </dd>
                  </div>
                )}
              </dl>
            </SeccionPanel>
          )}
        </div>
        <ErrorMsg>{error}</ErrorMsg>
        {!datos && ficha.error && <ErrorMsg>{`No se pudo cargar la ficha del ${p.alumno}.`}</ErrorMsg>}
      </div>
    </PanelLateral>
  );
}

/** Editar el grupo: aula, cupo, la inscripción y la página, y el docente de cada materia. */
function EditarGrupo({
  g,
  onCerrar,
  onGuardado,
}: {
  g: GrupoDetalle;
  onCerrar: () => void;
  onGuardado: (g: GrupoDetalle) => void;
}) {
  const p = usePalabras();
  const docentes = useApi(() => apiAcademia.docentes().catch(() => []), []);
  const [aula, setAula] = useState(g.aula ?? "");
  const [cupo, setCupo] = useState(g.cupo != null ? String(g.cupo) : "");
  const [abierta, setAbierta] = useState(g.inscripcionAbierta);
  const [publicar, setPublicar] = useState(g.publicarEnPagina);
  const [docentePor, setDocentePor] = useState<Record<number, number | null>>(
    Object.fromEntries(g.materiasGrupo.map((m) => [m.materia.id, m.docente?.personalId ?? null])),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      let nuevo = await apiAcademia.editarGrupo(g.id, {
        aula: aula.trim() || null,
        cupo: Number(cupo) > 0 ? Number(cupo) : null,
        inscripcionAbierta: abierta,
        publicarEnPagina: publicar,
      });
      for (const m of g.materiasGrupo) {
        const antes = m.docente?.personalId ?? null;
        const ahora = docentePor[m.materia.id] ?? null;
        if (antes !== ahora) nuevo = await apiAcademia.editarMateriaDelGrupo(g.id, m.materia.id, { personalId: ahora });
      }
      onGuardado(nuevo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Editar grupo"
      subtitulo={`${nombreDe(g.carrera)} · ${horarioGrupo(g)}`}
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Aula">
            <Input value={aula} onChange={(e) => setAula(e.target.value)} />
          </Campo>
          <Campo label="Cupo" hint="Vacío = sin tope.">
            <Input type="number" inputMode="numeric" value={cupo} onChange={(e) => setCupo(e.target.value)} />
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-sm text-texto">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary-boton)]" checked={abierta} onChange={(e) => setAbierta(e.target.checked)} />
          Inscripción abierta
        </label>
        <label className="flex items-center gap-2 text-sm text-texto">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary-boton)]" checked={publicar} onChange={(e) => setPublicar(e.target.checked)} />
          Mostrar en la página
        </label>
        {g.materiasGrupo.length > 0 && (
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-texto-2">
              {p.Docente} por {p.materia}
            </p>
            {[...g.materiasGrupo]
              .sort((a, b) => a.materia.orden - b.materia.orden)
              .map((m) => (
                <div key={m.id} className="grid items-center gap-2 sm:grid-cols-[1fr_14rem]">
                  <span className="text-sm text-texto">
                    M{m.materia.orden} · {m.materia.nombre}
                  </span>
                  <Select
                    aria-label={`${p.Docente} de M${m.materia.orden}`}
                    value={docentePor[m.materia.id] ?? ""}
                    onChange={(e) => setDocentePor({ ...docentePor, [m.materia.id]: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">Sin asignar</option>
                    {(docentes.datos ?? []).map((d) => (
                      <option key={d.personalId} value={d.personalId}>
                        {d.nombre}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
          </div>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
