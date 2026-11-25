import { Link } from "react-router-dom";
import { Cargando, ErrorMsg, Vacio } from "../../../components/ui";
import { fmtMoney } from "../../../lib/format";
import { fechaLarga, fmtNumero } from "../../../lib/nutricion/calculo";
import { apiReportesNutricion, type ReporteNutricion, type ResultadoPaciente } from "../../../lib/nutricion/reportes";
import { colorDeEscalaImc } from "../../../lib/nutricion/tonos";
import { RUTA_EVALUACION } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { EncabezadoPagina, GrillaKpi, KpiTarjeta, PaginaAcademia as Pagina, TABLA, Tarjeta } from "../../academia/piezas";
import { BarraPeriodo } from "../../reportes/BarraPeriodo";
import { textoRango } from "../../reportes/periodo";
import { usePeriodo } from "../../reportes/usePeriodo";

const CLAVE_PERIODO = "bamardev_nutricion_reportes_periodo";

/** Los grados del medidor, en su orden (los mismos del catálogo de la evaluación). */
const GRADOS_IMC: { grado: string; nombre: string }[] = [
  { grado: "BAJO_PESO", nombre: "Bajo peso" },
  { grado: "NORMAL", nombre: "Peso normal" },
  { grado: "SOBREPESO", nombre: "Sobrepeso" },
  { grado: "OBESIDAD_1", nombre: "Obesidad grado 1" },
  { grado: "OBESIDAD_2", nombre: "Obesidad grado 2" },
  { grado: "OBESIDAD_3", nombre: "Obesidad grado 3" },
];
const NOMBRE_GRADO = new Map(GRADOS_IMC.map((g) => [g.grado, g.nombre]));

const kg = (n: number | null | undefined) => (n == null ? "—" : `${fmtNumero(n, 2)} kg`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${fmtNumero(n, 1)} %`);
/** «Bajó 3,2 kg» / «Subió 1 kg» / «Igual». */
function cambio(n: number): string {
  if (n >= 0.1) return `−${fmtNumero(n, 2)} kg`;
  if (n <= -0.1) return `+${fmtNumero(-n, 2)} kg`;
  return "Igual";
}
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «2026-11» → «Noviembre 2026». */
function nombreMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const n = MESES[m - 1] ?? mes;
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${a}`;
}

/**
 * Los reportes del consultorio de nutrición (25-nov-2026): un módulo propio,
 * no una ficha de Reportes de ventas. Cómo le va con sus pacientes (cuántos
 * atendió, cuánto bajaron, cómo les cambió el IMC), con sus tratamientos y lo
 * que anotó como pagado en el seguimiento. Con el permiso `nutricion.reportes`.
 *
 * Las cuentas las hace el backend; el período se elige igual que en los demás
 * reportes (`BarraPeriodo`).
 */
export default function ReportesNutricion() {
  const { puede } = useAuth();
  const [periodo, setPeriodo] = usePeriodo(0, CLAVE_PERIODO);
  const datos = useApi(() => apiReportesNutricion.reporte({ desde: periodo.desde, hasta: periodo.hasta }), [periodo.desde, periodo.hasta]);
  const r = datos.datos;
  // El nombre del ranking abre la planilla sólo a quien ve la evaluación.
  const veEvaluacion = puede("nutricion");

  return (
    <Pagina>
      <EncabezadoPagina titulo="Reportes del consultorio" bajada={textoRango(periodo.desde, periodo.hasta)} />

      <div className="card pt-3">
        <BarraPeriodo periodo={periodo} onCambio={setPeriodo} corteMin={0} />
      </div>

      {datos.error && !r ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : !r ? (
        <Cargando texto="Armando los reportes…" />
      ) : (
        <>
          <Resumen r={r} />
          <Resultados r={r} veEvaluacion={veEvaluacion} />
          <DistribucionImc r={r} />
          <Tratamientos r={r} />
          <Pagos r={r} />
        </>
      )}
    </Pagina>
  );
}

function Resumen({ r }: { r: ReporteNutricion }) {
  const s = r.resumen;
  return (
    <GrillaKpi columnas={3}>
      <KpiTarjeta etiqueta="Pacientes atendidos" valor={s.pacientesAtendidos} pie="Con un control o una semana en el período" icono="userHeart" />
      <KpiTarjeta etiqueta="Pacientes nuevos" valor={s.pacientesNuevos} pie="Registrados en el período" icono="plus" />
      <KpiTarjeta etiqueta="Pacientes activos" valor={s.pacientesActivos} pie="Hoy, sin los archivados" icono="evaluacion" />
      <KpiTarjeta etiqueta="Controles" valor={s.controles} pie="De la evaluación, en el período" />
      <KpiTarjeta etiqueta="Semanas anotadas" valor={s.semanasAnotadas} pie="Del seguimiento, en el período" />
      <KpiTarjeta etiqueta="En tratamiento" valor={s.enTratamiento} pie="Hoy" icono="seguimiento" />
    </GrillaKpi>
  );
}

function Resultados({ r, veEvaluacion }: { r: ReporteNutricion; veEvaluacion: boolean }) {
  const x = r.resultados;
  return (
    <Tarjeta
      titulo="Resultados de los pacientes"
      bajada="Los que se pesaron en el período y tienen al menos dos pesos (evaluación y seguimiento en una sola serie)"
      sinRelleno
    >
      {x.pacientes === 0 ? (
        <Vacio icono="evaluacion" titulo="Todavía no hay resultados en este período" texto="Aparecen cuando un paciente con un peso anterior se vuelve a pesar." />
      ) : (
        <>
          <div className="p-4 sm:p-5">
            <GrillaKpi columnas={4}>
              <KpiTarjeta etiqueta="Kg bajados" valor={kg(x.kgBajadosTotal)} pie={`${kg(x.kgBajadosEnPeriodo)} en el período`} tono={x.kgBajadosTotal < 0 ? "urgente" : "normal"} />
              <KpiTarjeta etiqueta="Promedio por paciente" valor={kg(x.kgPromedio)} pie={`${pct(x.pctPromedio)} del peso inicial`} />
              <KpiTarjeta
                etiqueta="Bajaron de peso"
                valor={`${x.bajaron} de ${x.pacientes}`}
                pie={[x.subieron && `${x.subieron} subieron`, x.mantuvieron && `${x.mantuvieron} igual`].filter(Boolean).join(" · ") || "Todos bajaron"}
              />
              <KpiTarjeta
                etiqueta="Mejoraron su IMC"
                valor={x.grados.mejoraron}
                pie={[`${x.grados.igual} igual`, x.grados.empeoraron ? `${x.grados.empeoraron} empeoraron` : null].filter(Boolean).join(" · ")}
                tono={x.grados.empeoraron > x.grados.mejoraron ? "ambar" : "normal"}
              />
            </GrillaKpi>
          </div>
          <div className={TABLA.envoltura}>
            <table className={TABLA.tabla}>
              <caption className="sr-only">Los pacientes que más bajaron</caption>
              <thead className={TABLA.encabezado}>
                <tr>
                  <th className={TABLA.th}>Paciente</th>
                  <th className={`${TABLA.th} ${TABLA.numero}`}>Inicial</th>
                  <th className={`${TABLA.th} ${TABLA.numero}`}>Actual</th>
                  <th className={`${TABLA.th} ${TABLA.numero}`}>Cambio</th>
                  <th className={`${TABLA.th} ${TABLA.numero}`}>%</th>
                  <th className={TABLA.th}>IMC</th>
                </tr>
              </thead>
              <tbody>
                {x.ranking.map((f) => (
                  <FilaRanking key={f.pacienteId} f={f} veEvaluacion={veEvaluacion} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-borde-soft px-4 py-3 text-xs text-texto-3 sm:px-5">
            Los {x.ranking.length} que más bajaron desde su primer peso. Bajar o subir menos de 0,1 kg cuenta como igual.
          </p>
        </>
      )}
    </Tarjeta>
  );
}

function FilaRanking({ f, veEvaluacion }: { f: ResultadoPaciente; veEvaluacion: boolean }) {
  const ini = f.gradoInicial ? NOMBRE_GRADO.get(f.gradoInicial) ?? f.gradoInicial : null;
  const act = f.gradoActual ? NOMBRE_GRADO.get(f.gradoActual) ?? f.gradoActual : null;
  return (
    <tr className={TABLA.fila}>
      <td className={TABLA.td}>
        {veEvaluacion ? (
          <Link to={`${RUTA_EVALUACION}/${f.pacienteId}`} className="font-semibold text-texto hover:text-primary-700 hover:underline">
            {f.nombre}
          </Link>
        ) : (
          <span className="font-semibold text-texto">{f.nombre}</span>
        )}
        <span className="block text-xs text-texto-4">
          {fechaLarga(f.desde)} → {fechaLarga(f.hasta)}
        </span>
      </td>
      <td className={`${TABLA.td} ${TABLA.numero}`}>{kg(f.pesoInicial)}</td>
      <td className={`${TABLA.td} ${TABLA.numero}`}>{kg(f.pesoActual)}</td>
      <td className={`${TABLA.td} ${TABLA.numero} font-semibold ${f.kgBajados >= 0.1 ? "text-emerald-700" : f.kgBajados <= -0.1 ? "text-danger-text" : "text-texto-3"}`}>
        {cambio(f.kgBajados)}
      </td>
      <td className={`${TABLA.td} ${TABLA.numero}`}>{pct(f.pctBajado)}</td>
      <td className={`${TABLA.td} text-xs text-texto-2`}>{ini && act && ini !== act ? `${ini} → ${act}` : act ?? ini ?? "—"}</td>
    </tr>
  );
}

function DistribucionImc({ r }: { r: ReporteNutricion }) {
  const total = r.imc.grados.reduce((a, g) => a + g.pacientes, 0);
  if (!total) return null;
  const max = Math.max(...r.imc.grados.map((g) => g.pacientes), 1);
  return (
    <Tarjeta titulo="Pacientes por grado de IMC" bajada="Hoy, con el último peso de cada paciente activo">
      <ul className="space-y-2.5">
        {r.imc.grados.map((g, i) => {
          const color = colorDeEscalaImc(i, r.imc.grados.length);
          return (
            <li key={g.grado} className="grid grid-cols-[minmax(7.5rem,10rem)_1fr_auto] items-center gap-3 text-sm">
              <span className="text-texto-2">{NOMBRE_GRADO.get(g.grado) ?? g.grado}</span>
              <span className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="block h-full rounded-full" style={{ width: `${(g.pacientes / max) * 100}%`, background: color.fondo }} />
              </span>
              <span className="w-16 text-right tabular-nums text-texto">
                {g.pacientes} <span className="text-xs text-texto-4">({Math.round((g.pacientes / total) * 100)} %)</span>
              </span>
            </li>
          );
        })}
      </ul>
      {r.imc.sinDato > 0 && <p className="mt-3 text-xs text-texto-3">{r.imc.sinDato} sin peso o sin talla cargada.</p>}
    </Tarjeta>
  );
}

function Tratamientos({ r }: { r: ReporteNutricion }) {
  return (
    <Tarjeta
      titulo="Tratamientos"
      bajada="Por producto (el que usa hoy cada tratamiento). La adherencia es de las semanas del período: con dosis contra «no se aplicó»."
      contador={r.tratamientos.length}
      sinRelleno
    >
      {r.tratamientos.length === 0 ? (
        <Vacio icono="seguimiento" titulo="Todavía no hay tratamientos" texto="Se inician desde el Seguimiento de cada paciente." />
      ) : (
        <div className={TABLA.envoltura}>
          <table className={TABLA.tabla}>
            <thead className={TABLA.encabezado}>
              <tr>
                <th className={TABLA.th}>Producto</th>
                <th className={`${TABLA.th} ${TABLA.numero}`}>Activos hoy</th>
                <th className={`${TABLA.th} ${TABLA.numero}`}>Iniciados</th>
                <th className={`${TABLA.th} ${TABLA.numero}`}>Terminados</th>
                <th className={`${TABLA.th} ${TABLA.numero}`}>Semanas prom.</th>
                <th className={`${TABLA.th} ${TABLA.numero}`}>Kg prom.</th>
                <th className={`${TABLA.th} ${TABLA.numero}`}>Adherencia</th>
              </tr>
            </thead>
            <tbody>
              {r.tratamientos.map((t) => (
                <tr key={t.nombre} className={TABLA.fila}>
                  <td className={TABLA.td}>
                    <span className="font-semibold text-texto">{t.nombre}</span>
                    <span className="block text-xs text-texto-4">
                      {t.pacientes} {t.pacientes === 1 ? "paciente" : "pacientes"} en total
                    </span>
                  </td>
                  <td className={`${TABLA.td} ${TABLA.numero}`}>{t.activos}</td>
                  <td className={`${TABLA.td} ${TABLA.numero}`}>{t.iniciados}</td>
                  <td className={`${TABLA.td} ${TABLA.numero}`}>{t.terminados}</td>
                  <td className={`${TABLA.td} ${TABLA.numero}`}>{t.semanasPromedio == null ? "—" : fmtNumero(t.semanasPromedio, 1)}</td>
                  <td className={`${TABLA.td} ${TABLA.numero}`}>{t.kgPromedio == null ? "—" : cambio(t.kgPromedio)}</td>
                  <td className={`${TABLA.td} ${TABLA.numero}`}>
                    {pct(t.adherenciaPct)}
                    {t.semanasSinDosis > 0 && <span className="block text-xs text-texto-4">{t.semanasSinDosis} sin aplicar</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

function Pagos({ r }: { r: ReporteNutricion }) {
  const p = r.pagos;
  return (
    <Tarjeta
      titulo="Pagos anotados en el seguimiento"
      bajada="Lo que se anotó como pagado en la hoja de cada paciente, por mes. Es una anotación: no es la caja ni las ventas."
      sinRelleno
    >
      {p.meses.length === 0 ? (
        <Vacio icono="seguimiento" titulo="No hay pagos anotados en este período" texto="Se anotan en la semana de cada paciente, en el Seguimiento." />
      ) : (
        <div className={TABLA.envoltura}>
          <table className={TABLA.tabla}>
            <thead className={TABLA.encabezado}>
              <tr>
                <th className={TABLA.th}>Mes</th>
                <th className={`${TABLA.th} ${TABLA.numero}`}>Medicamento</th>
                <th className={`${TABLA.th} ${TABLA.numero}`}>Control</th>
                <th className={`${TABLA.th} ${TABLA.numero}`}>Otro</th>
                <th className={`${TABLA.th} ${TABLA.numero}`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {p.meses.map((m) => (
                <tr key={m.mes} className={TABLA.fila}>
                  <td className={TABLA.td}>
                    <span className="font-semibold text-texto">{nombreMes(m.mes)}</span>
                    <span className="block text-xs text-texto-4">
                      {m.pacientes} {m.pacientes === 1 ? "paciente" : "pacientes"}
                    </span>
                  </td>
                  <td className={`${TABLA.td} ${TABLA.numero}`}>{fmtMoney(m.medicamento)}</td>
                  <td className={`${TABLA.td} ${TABLA.numero}`}>{fmtMoney(m.control)}</td>
                  <td className={`${TABLA.td} ${TABLA.numero}`}>{fmtMoney(m.otro)}</td>
                  <td className={`${TABLA.td} ${TABLA.numero} font-semibold`}>{fmtMoney(m.total)}</td>
                </tr>
              ))}
            </tbody>
            {p.meses.length > 1 && (
              <tfoot>
                <tr className="border-t border-borde bg-muted font-semibold">
                  <td className={TABLA.td}>Total</td>
                  <td className={`${TABLA.td} ${TABLA.numero}`}>{fmtMoney(p.total.medicamento)}</td>
                  <td className={`${TABLA.td} ${TABLA.numero}`}>{fmtMoney(p.total.control)}</td>
                  <td className={`${TABLA.td} ${TABLA.numero}`}>{fmtMoney(p.total.otro)}</td>
                  <td className={`${TABLA.td} ${TABLA.numero}`}>{fmtMoney(p.total.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
