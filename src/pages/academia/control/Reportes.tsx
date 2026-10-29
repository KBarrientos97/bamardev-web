import { useState } from "react";
import { Link } from "react-router-dom";
import { AyudaCalculo } from "../../../components/AyudaCalculo";
import { Chips } from "../../../components/filtros";
import { Icon } from "../../../components/Icon";
import { Cargando, ErrorMsg } from "../../../components/ui";
import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { tituloMes } from "../../../lib/academia/calendario";
import { nombreDe } from "../../../lib/academia/formato";
import type { AgruparReporte, EstudiantesAcademia, ReportesAcademia, TramoEstudiantes } from "../../../lib/academia/tipos";
import { useFiltroSede } from "../../../lib/academia/useFiltroSede";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { BarraPeriodo } from "../../reportes/BarraPeriodo";
import { catalogo, esVisible } from "../../reportes/catalogo";
import { diasDe, textoRango, type Periodo } from "../../reportes/periodo";
import { usePeriodo } from "../../reportes/usePeriodo";
import { ayudaInstituto } from "./ayudaReportes";
import { BotonFila, EncabezadoPagina, GrillaKpi, KpiTarjeta, LISTA, PaginaAcademia, TABLA, Tarjeta } from "../piezas";

const CLAVE_PERIODO = "bamardev_academia_reportes_periodo";

const AGRUPAR: [AgruparReporte, string][] = [
  ["dia", "Por día"],
  ["semana", "Por semana"],
  ["mes", "Por mes"],
];

/**
 * Cómo se parte el período si el dueño no eligió: la semana por día, el mes
 * por semana (también el día 3, para que "Mes" se lea siempre igual) y los 3
 * meses por mes. Un rango a mano, por su largo.
 */
function agruparPorDefecto(p: Periodo): AgruparReporte {
  if (p.preset === "hoy" || p.preset === "ayer" || p.preset === "semana") return "dia";
  if (p.preset === "mes" || p.preset === "mesPasado" || p.preset === "dias30") return "semana";
  if (p.preset === "dias90") return "mes";
  const dias = diasDe(p.desde, p.hasta);
  if (dias <= 14) return "dia";
  if (dias <= 62) return "semana";
  return "mes";
}

/**
 * E18 · Reportes del instituto, académicos desde L5 (28-oct).
 *
 * Hasta el 28-oct traía un "Resultado por sede" en plata que no daba lo mismo
 * que el Estado de resultado: el dueño veía dos ganancias del mismo mes. El
 * resultado vive ahora sólo en Reportes de ventas → Estado de resultado (con
 * "Cobrado por clases", "Ventas de productos" y "Sueldos docentes"); acá queda
 * lo académico: cuántos ingresaron, cuánto se cobró en clases, cuántos están
 * al día y en mora (con los días de espera, el semáforo del docente), los
 * activos por curso y la asistencia.
 *
 * El período se elige igual que en Reportes de ventas (`BarraPeriodo`: Hoy,
 * Ayer, Semana, Mes, 3 meses o un rango), y el reporte de estudiantes se parte
 * por día, semana o mes. Cada tarjeta tiene su "Cómo se calcula".
 */
export default function Reportes() {
  const p = usePalabras();
  const { puede, rubro, negocio, usuario, incluye } = useAuth();
  const sede = useFiltroSede();
  const [periodo, setPeriodo] = usePeriodo(0, CLAVE_PERIODO);
  const [elegido, setElegido] = useState<{ para: string; valor: AgruparReporte } | null>(null);
  const clave = `${periodo.desde}|${periodo.hasta}`;
  const agrupar = elegido?.para === clave ? elegido.valor : agruparPorDefecto(periodo);

  const datos = useApi(
    () => apiAcademia.reportes({ desde: periodo.desde, hasta: periodo.hasta, sede: sede.sucursalId }),
    [periodo.desde, periodo.hasta, sede.sucursalId],
  );
  const estudiantes = useApi(
    () => apiAcademia.reportesEstudiantes({ desde: periodo.desde, hasta: periodo.hasta, agrupar, sede: sede.sucursalId }),
    [periodo.desde, periodo.hasta, agrupar, sede.sucursalId],
  );
  const d = datos.datos;
  const e = estudiantes.datos;
  const ayuda = ayudaInstituto(d?.morosidad.diasEspera ?? e?.diasEspera);
  // El resultado en plata está en el Estado de resultado: se ofrece el salto
  // sólo a quien lo ve (mismo permiso, feature y sección que el catálogo).
  const fichaResultado = catalogo(rubro).find((f) => f.id === "resultado");
  const veResultado = !!fichaResultado && esVisible(fichaResultado, { rubro, features: negocio?.features, permisos: usuario?.permisos, puede, incluye });

  return (
    <PaginaAcademia>
      <EncabezadoPagina
        titulo="Reportes del instituto"
        bajada={
          <>
            {textoRango(periodo.desde, periodo.hasta)}
            {sede.nombre ? ` · ${sede.nombre}` : sede.variasSedes ? ` · todas las ${p.sedes}` : ""}
          </>
        }
        acciones={
          veResultado && (
            <BotonFila variante="ghost" a="/reportes/resultado">
              Estado de resultado
              <Icon name="chevronRight" size={15} />
            </BotonFila>
          )
        }
      />

      <div className="card pt-3">
        <BarraPeriodo periodo={periodo} onCambio={setPeriodo} corteMin={0} />
      </div>

      {sede.selector}

      {datos.error && !d ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : (
        <>
          <Resumen d={d} e={e} />

          <Tarjeta
            id="t-estudiantes"
            titulo={`${p.Alumnos} ${agrupar === "dia" ? "por día" : agrupar === "semana" ? "por semana" : "por mes"}`}
            bajada="Ingresaron, cobrado en clases y cómo van las mensualidades de cada tramo"
            acciones={<AyudaCalculo titulo={`${p.Alumnos} por período`} ayuda={ayuda.estudiantes} compacto />}
            barra={<Chips titulo="Agrupar" valor={agrupar} opciones={AGRUPAR} onChange={(v) => setElegido({ para: clave, valor: v as AgruparReporte })} />}
            sinRelleno
          >
            {estudiantes.error && !e ? (
              <div className="p-4 sm:p-5">
                <ErrorMsg onReintentar={estudiantes.recargar}>{estudiantes.error}</ErrorMsg>
              </div>
            ) : !e ? (
              <Cargando />
            ) : (
              <TablaEstudiantes e={e} />
            )}
          </Tarjeta>

          <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-6">
            <Tarjeta
              id="t-cursos"
              titulo={`Por ${p.carrera}`}
              acciones={<AyudaCalculo titulo={`Por ${p.carrera}`} ayuda={ayuda.cursos} compacto />}
              sinRelleno
              pie={
                d.activosPorCurso.length > 0 && (
                  <p className="flex justify-between text-sm font-bold text-texto">
                    <span>Total</span>
                    <span className="tabular-nums">{d.activosPorCurso.reduce((s, c) => s + c.activos, 0)} activos</span>
                  </p>
                )
              }
            >
              {d.activosPorCurso.length === 0 ? (
                <p className="p-4 text-sm text-texto-3 sm:p-5">Sin {p.alumnos} activos.</p>
              ) : (
                <ul className={LISTA.lista}>
                  {d.activosPorCurso.map((c) => {
                    const pct = c.cupo ? Math.min(100, Math.round((c.activos / c.cupo) * 100)) : null;
                    return (
                      <li
                        key={nombreDe(c.curso)}
                        className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_15rem] ${LISTA.itemHover}`}
                      >
                        <span className="truncate text-sm font-semibold text-texto">{nombreDe(c.curso)}</span>
                        <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-primary-100 max-sm:col-span-2 max-sm:row-start-2">
                          {pct != null && <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />}
                        </span>
                        <span className="text-right text-sm tabular-nums text-texto-2 max-sm:col-start-2 max-sm:row-start-1">
                          {c.activos}
                          {c.cupo != null ? ` de ${c.cupo}` : ""} activos
                          {(c.cobrado != null || c.vencido) && (
                            <span className="block text-[12px] text-texto-3">
                              {c.cobrado != null ? `cobrado ${fmtMoney(c.cobrado)}` : ""}
                              {c.vencido ? <span className="font-semibold text-danger-text"> · vencido {fmtMoney(c.vencido)}</span> : null}
                            </span>
                          )}
                          {c.inscritosPorEmpezar ? <span className="block text-[12px] text-texto-3">{c.inscritosPorEmpezar} por empezar</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Tarjeta>

            <div className="min-w-0 space-y-5 lg:space-y-6">
              <Tarjeta
                id="t-asis"
                titulo="Asistencia promedio"
                acciones={<AyudaCalculo titulo="Asistencia promedio" ayuda={ayuda.asistencia} compacto />}
                sinRelleno={!!d.asistenciaPorGrupo?.length}
              >
                <Asistencia d={d} />
              </Tarjeta>

              <Tarjeta
                id="t-mora"
                titulo="Morosidad"
                bajada="Hoy, con los días de espera"
                acciones={
                  <>
                    <AyudaCalculo titulo="Morosidad" ayuda={ayuda.mora} compacto />
                    {puede("academia_cobranza") && (
                      <BotonFila variante="ghost" a="/academia/cobranza">
                        Ir a Cobranza
                        <Icon name="chevronRight" size={15} />
                      </BotonFila>
                    )}
                  </>
                }
              >
                <Morosidad d={d} />
              </Tarjeta>
            </div>
          </div>
          <p className="text-[13px] text-texto-3">
            Lo que gana o pierde el instituto (cuotas y productos menos gastos y sueldos docentes) está en{" "}
            {veResultado ? (
              <Link to="/reportes/resultado" className="font-semibold text-primary-700 hover:underline">
                Estado de resultado
              </Link>
            ) : (
              "Estado de resultado"
            )}
            .
          </p>
        </>
      )}
    </PaginaAcademia>
  );
}

/** Lo de un vistazo: cuántos ingresaron, lo cobrado en clases, la mora de hoy y la asistencia. */
function Resumen({ d, e }: { d: ReportesAcademia; e: EstudiantesAcademia | null }) {
  const p = usePalabras();
  const asis = d.asistenciaPromedioPct;
  const m = d.morosidad;
  const cobrado = e?.totales.cobradoClases;
  return (
    <GrillaKpi>
      <KpiTarjeta etiqueta="Ingresaron" valor={e ? e.totales.ingresaron : "—"} pie="inscripciones nuevas del período" icono="users" />
      {cobrado != null ? (
        <KpiTarjeta etiqueta="Cobrado en clases" valor={fmtMoney(cobrado)} pie="cuotas del período" icono="coins" />
      ) : (
        <KpiTarjeta etiqueta={`${p.Alumnos} activos`} valor={m.activos ?? "—"} pie="hoy" icono="users" />
      )}
      <KpiTarjeta
        etiqueta="En mora"
        valor={m.estudiantes}
        pie={`${m.activos != null ? `de ${m.activos} activos` : "hoy"}${m.diasEspera != null ? ` · pasó la espera de ${m.diasEspera} días` : ""}`}
        tono={m.estudiantes > 0 ? "urgente" : "normal"}
        icono="alert"
      />
      <KpiTarjeta
        etiqueta="Asistencia promedio"
        valor={asis != null ? `${Math.round(asis)} %` : "—"}
        pie="del período"
        tono={asis != null && asis < 80 ? "ambar" : "normal"}
        icono="checkCirculo"
      />
    </GrillaKpi>
  );
}

/** El nombre de un tramo: el día, la semana o el mes. */
function nombreTramo(t: Pick<TramoEstudiantes, "desde" | "hasta">, agrupar: AgruparReporte): string {
  if (agrupar === "mes") return tituloMes(t.desde.slice(0, 7));
  return textoRango(t.desde, t.hasta);
}

function TablaEstudiantes({ e }: { e: EstudiantesAcademia }) {
  const filas = e.filas;
  const porCobrar = (t: Pick<TramoEstudiantes, "porVencer" | "enEspera">) => t.porVencer + t.enEspera;
  const cero = (n: number) => (n === 0 ? "text-texto-4" : "");
  return (
    // scroll-lateral-ok: seis columnas angostas; en un celular el scroll queda dentro de la tarjeta.
    <div className={TABLA.envoltura}>
      <table className={`${TABLA.tabla} min-w-[560px] tabular-nums`}>
        <thead>
          <tr className={TABLA.encabezado}>
            <th className={TABLA.th}>{e.agrupar === "dia" ? "Día" : e.agrupar === "semana" ? "Semana" : "Mes"}</th>
            <th className={`${TABLA.th} text-right`}>Ingresaron</th>
            {e.montos && <th className={`${TABLA.th} text-right`}>Cobrado en clases</th>}
            <th className={`${TABLA.th} text-right`}>Al día</th>
            <th className={`${TABLA.th} text-right`} title={`Deben, pero todavía no venció o está dentro de los ${e.diasEspera} días de espera`}>
              Por cobrar
            </th>
            <th className={`${TABLA.th} text-right`}>En mora</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((t) => (
            <tr key={t.desde} className={`${TABLA.fila} text-texto`}>
              <td className={`${TABLA.td} whitespace-nowrap`}>{nombreTramo(t, e.agrupar)}</td>
              <td className={`${TABLA.td} ${TABLA.numero} ${cero(t.ingresaron)}`}>{t.ingresaron}</td>
              {e.montos && <td className={`${TABLA.td} ${TABLA.numero} whitespace-nowrap ${cero(t.cobradoClases ?? 0)}`}>{fmtMoney(t.cobradoClases ?? 0)}</td>}
              <td className={`${TABLA.td} ${TABLA.numero} ${cero(t.alDia)}`}>{t.alDia}</td>
              <td className={`${TABLA.td} ${TABLA.numero} ${cero(porCobrar(t))}`}>{porCobrar(t)}</td>
              <td className={`${TABLA.td} ${TABLA.numero} ${t.enMora ? "font-semibold text-danger-text" : "text-texto-4"}`}>{t.enMora}</td>
            </tr>
          ))}
          {filas.length > 1 && (
            <tr className="border-t border-borde bg-primary-50/60 font-bold text-primary-700">
              <td className={TABLA.td}>Total</td>
              <td className={`${TABLA.td} ${TABLA.numero}`}>{e.totales.ingresaron}</td>
              {e.montos && <td className={`${TABLA.td} ${TABLA.numero} whitespace-nowrap`}>{fmtMoney(e.totales.cobradoClases ?? 0)}</td>}
              <td className={`${TABLA.td} ${TABLA.numero}`}>{e.totales.alDia}</td>
              <td className={`${TABLA.td} ${TABLA.numero}`}>{porCobrar(e.totales)}</td>
              <td className={`${TABLA.td} ${TABLA.numero}`}>{e.totales.enMora}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Asistencia({ d }: { d: ReportesAcademia }) {
  if (d.asistenciaPorGrupo?.length) {
    return (
      <ul className={LISTA.lista}>
        {d.asistenciaPorGrupo.map((a) => (
          <li key={nombreDe(a.grupo)} className={`grid grid-cols-[minmax(0,1fr)_80px_48px] items-center gap-3 ${LISTA.itemHover}`}>
            <span className="min-w-0">
              <span className="block truncate text-sm text-texto">{nombreDe(a.grupo)}</span>
              {a.docente && <span className="block truncate text-[12px] text-texto-3">Prof. {nombreDe(a.docente)}</span>}
            </span>
            <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-primary-100">
              <span
                className={`block h-full rounded-full ${a.pct != null && a.pct < 80 ? "bg-warning-text" : "bg-primary"}`}
                style={{ width: `${Math.min(100, a.pct ?? 0)}%` }}
              />
            </span>
            <span className={`text-right text-sm tabular-nums ${a.pct != null && a.pct < 80 ? "font-semibold text-warning-text" : "text-texto"}`}>
              {a.pct != null ? `${Math.round(a.pct)} %` : "—"}
            </span>
          </li>
        ))}
        {d.asistenciaPromedioPct != null && (
          <li className="bg-muted px-4 py-3 text-[13px] font-semibold text-texto-2 sm:px-5">Promedio del instituto {Math.round(d.asistenciaPromedioPct)} %</li>
        )}
      </ul>
    );
  }
  if (d.asistenciaPromedioPct == null) return <p className="text-sm text-texto-3">Todavía no hay listas pasadas en este período.</p>;
  return (
    <div className="space-y-2">
      <span className="block text-[13px] text-texto-3">Promedio del instituto {Math.round(d.asistenciaPromedioPct)} %</span>
      <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-primary-100">
        <span
          className={`block h-full rounded-full ${d.asistenciaPromedioPct < 80 ? "bg-warning-text" : "bg-primary"}`}
          style={{ width: `${Math.min(100, d.asistenciaPromedioPct)}%` }}
        />
      </span>
    </div>
  );
}

function Morosidad({ d }: { d: ReportesAcademia }) {
  const p = usePalabras();
  const m = d.morosidad;
  const celdas: { titulo: string; valor: string; clase: string }[] = [
    { titulo: "Al día", valor: m.alDia != null ? String(m.alDia) : "—", clase: "text-texto" },
    { titulo: "En la espera", valor: m.enEspera != null ? String(m.enEspera) : "—", clase: m.enEspera ? "text-warning-text" : "text-texto" },
    {
      titulo: "En mora",
      valor: `${m.estudiantes}${m.pctEstudiantes != null ? ` · ${Math.round(m.pctEstudiantes)} %` : ""}`,
      clase: m.estudiantes > 0 ? "text-danger-text" : "text-texto",
    },
    ...(m.vencido != null ? [{ titulo: "Vencido", valor: fmtMoney(m.vencido), clase: m.vencido > 0 ? "text-danger-text" : "text-texto" }] : []),
  ];
  return (
    <>
      <dl className="grid grid-cols-2 gap-3">
        {celdas.map((c) => (
          <div key={c.titulo} className="rounded-xl bg-muted px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{c.titulo}</dt>
            <dd className={`mt-1 text-lg font-bold tabular-nums ${c.clase}`}>{c.valor}</dd>
          </div>
        ))}
      </dl>
      {m.activos != null && (
        <p className="mt-3 text-[12.5px] text-texto-3">
          De {m.activos} {p.alumnos} activos.{m.diasEspera != null ? ` La espera es de ${m.diasEspera} días después del vencimiento.` : ""}
        </p>
      )}
    </>
  );
}
