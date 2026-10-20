import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import MenuMas, { type AccionMenu } from "../../../components/MenuMas";
import { Cargando, ErrorMsg, Select } from "../../../components/ui";
import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { mesDe, sumarMeses, tituloMes } from "../../../lib/academia/calendario";
import { fechaCorta, nombreDe } from "../../../lib/academia/formato";
import type { ReportesAcademia } from "../../../lib/academia/tipos";
import { useFiltroSede } from "../../../lib/academia/useFiltroSede";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { fmtMoney, isoDia } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { BotonFila, EncabezadoPagina, GrillaKpi, KpiTarjeta, LISTA, PaginaAcademia, TABLA, Tarjeta } from "../piezas";

type Concepto = keyof Omit<ReportesAcademia["porSede"][number], "sede">;

/** Las filas del resultado por sede: lo que entra, lo que sale y lo que queda. */
const CONCEPTOS: { clave: Concepto; titulo: string; nota: string; signo: 1 | -1; fuerte?: boolean }[] = [
  { clave: "cobradoModulos", titulo: "Cobrado por cursos", nota: "módulos mes a mes, pagos completos y abonos", signo: 1 },
  { clave: "ventasProductos", titulo: "Ventas de productos", nota: "poleras, kits y material, en el punto de venta", signo: 1 },
  { clave: "sueldosDocentes", titulo: "Sueldos docentes", nota: "planilla del mes (retención por confirmar)", signo: -1 },
  { clave: "otrosGastos", titulo: "Otros gastos", nota: "alquiler, servicios e insumos", signo: -1 },
  { clave: "resultado", titulo: "Resultado", nota: "", signo: 1, fuerte: true },
];

/**
 * E18 · Reportes del instituto (ronda 2): el mes en una pantalla. El
 * resultado por sede (lo cobrado por cursos y productos menos los sueldos de
 * los docentes y los otros gastos), los activos por curso contra su cupo, la
 * asistencia promedio y la morosidad, que lleva a Cobranza. Los reportes de
 * ventas de siempre siguen en "Más reportes".
 */
export default function Reportes() {
  const p = usePalabras();
  const { puede } = useAuth();
  const sede = useFiltroSede();
  const hoy = mesDe(new Date());
  const [mes, setMes] = useState(hoy);
  const datos = useApi(() => apiAcademia.reportes(mes, sede.sucursalId), [mes, sede.sucursalId]);
  const d = datos.datos;
  const meses = Array.from({ length: 6 }, (_, i) => sumarMeses(hoy, -i));
  const acciones: AccionMenu[] = [
    { clave: "excel", etiqueta: "Exportar Excel", icono: "download", detalle: "Pronto", deshabilitada: true, onClick: () => {} },
  ];

  return (
    <PaginaAcademia>
      <EncabezadoPagina
        titulo={`Reportes · ${tituloMes(mes)}`}
        bajada={
          <>
            {mes === hoy ? `Al ${fechaCorta(isoDia(new Date()))}` : "Mes cerrado"}
            {sede.nombre ? ` · ${sede.nombre}` : sede.variasSedes ? ` · todas las ${p.sedes}` : ""}
          </>
        }
        acciones={
          <>
            <div className="w-40 sm:w-44">
              <Select aria-label="Mes" value={mes} onChange={(e) => setMes(e.target.value)}>
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {tituloMes(m)}
                  </option>
                ))}
              </Select>
            </div>
            <MenuMas etiqueta="Más acciones de los reportes" acciones={acciones} />
          </>
        }
      />

      {sede.selector}

      {datos.error && !d ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : (
        <>
          <Resumen d={d} />
          <ResultadoPorSede d={d} />
          <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-6">
            <Tarjeta
              id="t-cursos"
              titulo={`Por ${p.carrera}`}
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
                <p className="p-4 text-sm text-texto-3 sm:p-5">Sin {p.alumnos} activos este mes.</p>
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
              <Tarjeta id="t-asis" titulo="Asistencia promedio" sinRelleno={!!d.asistenciaPorGrupo?.length}>
                {d.asistenciaPorGrupo?.length ? (
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
                        <span
                          className={`text-right text-sm tabular-nums ${a.pct != null && a.pct < 80 ? "font-semibold text-warning-text" : "text-texto"}`}
                        >
                          {a.pct != null ? `${Math.round(a.pct)} %` : "—"}
                        </span>
                      </li>
                    ))}
                    {d.asistenciaPromedioPct != null && (
                      <li className="bg-muted px-4 py-3 text-[13px] font-semibold text-texto-2 sm:px-5">
                        Promedio del instituto {Math.round(d.asistenciaPromedioPct)} %
                      </li>
                    )}
                  </ul>
                ) : d.asistenciaPromedioPct == null ? (
                  <p className="text-sm text-texto-3">Todavía no hay listas pasadas este mes.</p>
                ) : (
                  // El número grande ya está en el indicador de arriba: acá, la barra.
                  <div className="space-y-2">
                    <span className="block text-[13px] text-texto-3">Promedio del instituto {Math.round(d.asistenciaPromedioPct)} %</span>
                    <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-primary-100">
                      <span
                        className={`block h-full rounded-full ${d.asistenciaPromedioPct < 80 ? "bg-warning-text" : "bg-primary"}`}
                        style={{ width: `${Math.min(100, d.asistenciaPromedioPct)}%` }}
                      />
                    </span>
                  </div>
                )}
              </Tarjeta>

              <Tarjeta
                id="t-mora"
                titulo="Morosidad"
                acciones={
                  puede("academia_cobranza") && (
                    <BotonFila variante="ghost" a="/academia/cobranza">
                      Ir a Cobranza
                      <Icon name="chevronRight" size={15} />
                    </BotonFila>
                  )
                }
              >
                <dl className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-muted px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Vencido</dt>
                    <dd className={`mt-1 text-lg font-bold tabular-nums ${d.morosidad.vencido > 0 ? "text-danger-text" : "text-texto"}`}>
                      {fmtMoney(d.morosidad.vencido)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-muted px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{p.Alumnos} que deben</dt>
                    <dd className="mt-1 text-lg font-bold tabular-nums text-texto">
                      {d.morosidad.estudiantes}{" "}
                      <span className="text-sm font-normal text-texto-3">
                        {d.morosidad.activos != null ? `de ${d.morosidad.activos} ` : ""}· {Math.round(d.morosidad.pctEstudiantes)} %
                      </span>
                    </dd>
                  </div>
                </dl>
              </Tarjeta>
            </div>
          </div>
          <p className="text-[13px] text-texto-3">
            Las ventas por producto, por hora y por forma de pago siguen en{" "}
            <Link to="/reportes" className="font-semibold text-primary-700 hover:underline">
              Más reportes
            </Link>
            .
          </p>
        </>
      )}
    </PaginaAcademia>
  );
}

/**
 * El mes de un vistazo: lo que entró, lo que quedó, lo vencido y la
 * asistencia. Son la suma de lo que detallan las tarjetas de abajo.
 */
function Resumen({ d }: { d: ReportesAcademia }) {
  const p = usePalabras();
  const suma = (c: Concepto) => d.porSede.reduce((s, x) => s + x[c], 0);
  const cobrado = suma("cobradoModulos") + suma("ventasProductos");
  const resultado = suma("resultado");
  const asis = d.asistenciaPromedioPct;
  return (
    <GrillaKpi>
      <KpiTarjeta etiqueta="Cobrado" valor={fmtMoney(cobrado)} pie="cursos y productos" icono="coins" />
      <KpiTarjeta
        etiqueta="Resultado"
        valor={fmtMoney(resultado)}
        pie="lo cobrado menos los gastos"
        tono={resultado < 0 ? "urgente" : "ok"}
        icono="trendingUp"
      />
      <KpiTarjeta
        etiqueta="Vencido"
        valor={fmtMoney(d.morosidad.vencido)}
        pie={`${d.morosidad.estudiantes} ${p.alumnos} que deben`}
        tono={d.morosidad.vencido > 0 ? "urgente" : "normal"}
        icono="alert"
      />
      <KpiTarjeta
        etiqueta="Asistencia promedio"
        valor={asis != null ? `${Math.round(asis)} %` : "—"}
        pie="del instituto"
        tono={asis != null && asis < 80 ? "ambar" : "normal"}
        icono="users"
      />
    </GrillaKpi>
  );
}

function ResultadoPorSede({ d }: { d: ReportesAcademia }) {
  const p = usePalabras();
  const sedes = d.porSede;
  const total = (c: Concepto) => sedes.reduce((s, x) => s + x[c], 0);
  const valor = (n: number, signo: 1 | -1) => (n === 0 ? "—" : signo === -1 ? `− ${fmtMoney(Math.abs(n))}` : fmtMoney(n));
  const conTotal = sedes.length > 1;
  return (
    <Tarjeta id="t-res" titulo={`Resultado por ${p.sede}`} sinRelleno>
      {/* scroll-lateral-ok: una columna por sede, a lo sumo tres o cuatro; el scroll queda dentro de la tarjeta. */}
      <div className={TABLA.envoltura}>
        <table className={`${TABLA.tabla} min-w-[520px] tabular-nums`}>
          <thead>
            <tr className={TABLA.encabezado}>
              <th className={TABLA.th}>Concepto</th>
              {sedes.map((s) => (
                <th key={nombreDe(s.sede)} className={`${TABLA.th} text-right`}>
                  {nombreDe(s.sede)}
                </th>
              ))}
              {conTotal && <th className={`${TABLA.th} text-right`}>Total</th>}
            </tr>
          </thead>
          <tbody>
            {CONCEPTOS.map((c) => (
              <tr
                key={c.clave}
                className={c.fuerte ? "border-t border-borde bg-primary-50/60 font-bold text-primary-700" : `${TABLA.fila} text-texto`}
              >
                <td className={TABLA.td}>
                  {c.titulo}
                  {c.nota && <span className="block text-[12px] font-normal text-texto-3">{c.nota}</span>}
                </td>
                {sedes.map((s) => (
                  <td
                    key={nombreDe(s.sede)}
                    className={`${TABLA.td} ${TABLA.numero} whitespace-nowrap ${c.signo === -1 && s[c.clave] ? "text-texto-2" : ""}`}
                  >
                    {valor(s[c.clave], c.signo)}
                  </td>
                ))}
                {conTotal && (
                  <td className={`${TABLA.td} ${TABLA.numero} whitespace-nowrap ${c.fuerte ? "" : "font-semibold"}`}>
                    {valor(total(c.clave), c.signo)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
