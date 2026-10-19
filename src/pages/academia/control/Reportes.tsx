import { useState } from "react";
import { Link } from "react-router-dom";
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
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-texto">Reportes · {tituloMes(mes)}</h1>
          <p className="mt-0.5 text-[13px] text-texto-3">
            {mes === hoy ? `Al ${fechaCorta(isoDia(new Date()))}` : "Mes cerrado"}
            {sede.nombre ? ` · ${sede.nombre}` : sede.variasSedes ? ` · todas las ${p.sedes}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-[12px] text-texto-3">
            Mes
            <Select value={mes} onChange={(e) => setMes(e.target.value)}>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {tituloMes(m)}
                </option>
              ))}
            </Select>
          </label>
          <MenuMas etiqueta="Más acciones de los reportes" acciones={acciones} />
        </div>
      </header>

      {sede.selector}

      {datos.error && !d ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : (
        <>
          <ResultadoPorSede d={d} />
          <div className="grid gap-8 lg:grid-cols-2">
            <section aria-labelledby="t-cursos" className="space-y-2">
              <h2 id="t-cursos" className="text-base font-bold text-texto">
                Por {p.carrera}
              </h2>
              {d.activosPorCurso.length === 0 ? (
                <p className="text-sm text-texto-3">Sin {p.alumnos} activos este mes.</p>
              ) : (
                <ul className="divide-y divide-borde-soft border-y border-borde-soft">
                  {d.activosPorCurso.map((c) => {
                    const pct = c.cupo ? Math.min(100, Math.round((c.activos / c.cupo) * 100)) : null;
                    return (
                      <li key={nombreDe(c.curso)} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                        <span className="truncate text-sm font-semibold text-texto">{nombreDe(c.curso)}</span>
                        <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-primary-100">
                          {pct != null && <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />}
                        </span>
                        <span className="text-sm tabular-nums text-texto-2">
                          {c.activos}
                          {c.cupo != null ? ` de ${c.cupo}` : ""} activos
                        </span>
                      </li>
                    );
                  })}
                  <li className="flex justify-between py-2.5 text-sm font-bold text-texto">
                    <span>Total</span>
                    <span className="tabular-nums">{d.activosPorCurso.reduce((s, c) => s + c.activos, 0)} activos</span>
                  </li>
                </ul>
              )}
            </section>

            <div className="space-y-8">
              <section aria-labelledby="t-asis" className="space-y-2">
                <h2 id="t-asis" className="text-base font-bold text-texto">
                  Asistencia promedio
                </h2>
                {d.asistenciaPromedioPct == null ? (
                  <p className="text-sm text-texto-3">Todavía no hay listas pasadas este mes.</p>
                ) : (
                  <div className="space-y-1">
                    <span className={`block text-2xl font-bold tabular-nums ${d.asistenciaPromedioPct < 80 ? "text-warning-text" : "text-texto"}`}>
                      {Math.round(d.asistenciaPromedioPct)} %
                    </span>
                    <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-primary-100">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, d.asistenciaPromedioPct)}%` }} />
                    </span>
                  </div>
                )}
              </section>

              <section aria-labelledby="t-mora" className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 id="t-mora" className="text-base font-bold text-texto">
                    Morosidad
                  </h2>
                  {puede("academia_cobranza") && (
                    <Link to="/academia/cobranza" className="text-sm font-semibold text-primary-700 hover:underline">
                      Ir a Cobranza
                    </Link>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="block text-[12px] text-texto-3">Vencido</span>
                    <span className={`block text-lg font-bold tabular-nums ${d.morosidad.vencido > 0 ? "text-danger-text" : "text-texto"}`}>
                      {fmtMoney(d.morosidad.vencido)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[12px] text-texto-3">{p.Alumnos} que deben</span>
                    <span className="block text-lg font-bold tabular-nums text-texto">
                      {d.morosidad.estudiantes}{" "}
                      <span className="text-sm font-normal text-texto-3">· {Math.round(d.morosidad.pctEstudiantes)} %</span>
                    </span>
                  </div>
                </div>
              </section>
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
    </div>
  );
}

function ResultadoPorSede({ d }: { d: ReportesAcademia }) {
  const p = usePalabras();
  const sedes = d.porSede;
  const total = (c: Concepto) => sedes.reduce((s, x) => s + x[c], 0);
  const valor = (n: number, signo: 1 | -1) => (n === 0 ? "—" : signo === -1 ? `− ${fmtMoney(Math.abs(n))}` : fmtMoney(n));
  const conTotal = sedes.length > 1;
  return (
    <section aria-labelledby="t-res" className="space-y-2">
      <h2 id="t-res" className="text-base font-bold text-texto">
        Resultado por {p.sede}
      </h2>
      {/* scroll-lateral-ok: una columna por sede, a lo sumo tres o cuatro. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-texto-3">
              <th className="pb-2 font-normal">Concepto</th>
              {sedes.map((s) => (
                <th key={nombreDe(s.sede)} className="pb-2 text-right font-normal">
                  {nombreDe(s.sede)}
                </th>
              ))}
              {conTotal && <th className="pb-2 text-right font-normal">Total</th>}
            </tr>
          </thead>
          <tbody>
            {CONCEPTOS.map((c) => (
              <tr key={c.clave} className={`border-t ${c.fuerte ? "border-borde font-bold text-primary-700" : "border-borde-soft text-texto"}`}>
                <td className="py-2.5">
                  {c.titulo}
                  {c.nota && <span className="block text-[12px] font-normal text-texto-3">{c.nota}</span>}
                </td>
                {sedes.map((s) => (
                  <td key={nombreDe(s.sede)} className="py-2.5 text-right">
                    {valor(s[c.clave], c.signo)}
                  </td>
                ))}
                {conTotal && <td className="py-2.5 text-right">{valor(total(c.clave), c.signo)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
