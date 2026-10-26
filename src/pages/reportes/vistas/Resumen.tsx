import { Link } from "react-router-dom";
import { ErrorMsg } from "../../../components/ui";
import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtCantidad, fmtMoney, fmtNum } from "../../../lib/format";
import { esBelleza, esBillar, esFarmacia } from "../../../lib/rubro";
import type { EstadoResultado } from "../../../lib/resultado";
import { useAuth } from "../../../store/AuthContext";
import { fraccion, type ResumenApi } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { bsEntero, bsResta, bsSubtotal, ejeCorto, horas, pct, variacion } from "../formato";
import { BarrasVerticales, LineaComparada } from "../graficos";
import { enElPeriodo, leyendaDe } from "../periodo";
import { Cargador, CifraClara, Cifras, Delta, DeltaClaro, Destacado, FichaIcono, KpiR, Leyenda, Renglon, Tarjeta } from "../ui";
import { consejos, esMensual, estadisticas, filasResumen, partesVenta, pedidosPorCobrar, serie, textoPedidos, type Consejo } from "./resumen/datos";
import { horasDeJornada } from "./resumen/datos";
import { useDatosResumen } from "./resumen/useResumen";

/**
 * Resumen: lo más importante del período en una pantalla. Las ventas con su
 * flecha y de dónde vinieron (según el rubro), la ganancia real, cuatro
 * números de un vistazo, la tendencia contra el período anterior y hasta tres
 * avisos que salen de los números, cada uno con su reporte.
 *
 * Lo único imprescindible es el resumen de ventas: si falla, falla la
 * pantalla. Lo demás se pide aparte y aparece cuando llega; si una pieza
 * falla, falla ESA tarjeta (con su Reintentar), no el resumen entero.
 */
// Con pedidos sin cobrar el período no está vacío: es justo cuando el dueño
// necesita ver que hay plata en camino.
const sinVentas = (r: ResumenApi) => r.tickets.valor === 0 && esCero(r.ventas) && !pedidosPorCobrar(r);

export default function Resumen() {
  const d = useDatosResumen();
  const { periodo, comparacion, veReporte } = useReporte();
  const { rubro } = useAuth();
  const r = d.resumen.datos;

  // Sin ventas no hay nada que bajar: un Excel de ceros se lee como un dato.
  useExportar("resumen", r && !sinVentas(r) ? () => hojasResumen(r, d.er) : null);

  return (
    <Cargador
      estado={d.resumen}
      vacio={(res) =>
        sinVentas(res)
          ? { titulo: "Sin ventas en este período", texto: "Probá con otro período o revisá que la caja esté abierta.", icono: "chart" }
          : null
      }
    >
      {(res) => {
        const deltaVentas = fraccion(res.ventasDeltaPct);
        const partes = partesVenta(rubro, { billar: d.billar, composicion: res.composicion, metodos: d.metodos });
        const puntos = serie(res.tendencia, res.tendenciaAnterior);
        const mensual = esMensual(res.tendencia);
        const est = estadisticas(puntos);
        const avisos = consejos({
          rubro,
          ve: veReporte,
          ventasDelta: deltaVentas,
          contra: comparacion.contra,
          billar: d.billar,
          sugerencia: d.sugerencia,
          creditos: d.creditos,
          ventasSinCosto: d.fin?.ventasSinCosto,
          mermas: d.mermas,
          agenda: d.agenda,
          meseros: d.meseros,
        });
        return (
          <>
            <div className={`grid items-stretch gap-4 ${d.rentabilidad ? "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" : ""}`}>
              <Destacado
                etiqueta={`Ventas ${enElPeriodo(periodo)}`}
                valor={fmtMoney(res.ventas)}
                pie={
                  partes.length > 0 ? (
                    <div className={`grid gap-3 ${partes.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                      {partes.slice(0, 3).map((p) => (
                        <CifraClara key={p.etiqueta} etiqueta={p.etiqueta} valor={bsEntero(p.valor)} />
                      ))}
                    </div>
                  ) : undefined
                }
              >
                <span className="flex flex-wrap items-center gap-2">
                  <DeltaClaro fraccion={deltaVentas} />
                  <span>
                    vs. {comparacion.contra} ({bsEntero(res.ventasPeriodoAnterior)})
                  </span>
                </span>
              </Destacado>
              {d.rentabilidad && <ResumenFinanciero d={d} res={res} />}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiR etiqueta="Tickets" valor={fmtNum(res.tickets.valor)} delta={<Delta fraccion={fraccion(res.tickets.deltaPct)} />} />
              <KpiR etiqueta="Ticket prom." valor={bsEntero(res.ticketPromedio.valor)} delta={<Delta fraccion={fraccion(res.ticketPromedio.deltaPct)} />} />
              <KpiR etiqueta="Unidades" valor={fmtCantidad(res.unidades.valor)} delta={<Delta fraccion={fraccion(res.unidades.deltaPct)} />} />
              <CuartoKpi d={d} res={res} rubro={rubro} />
            </div>

            <PorCobrar res={res} />

            <Tarjeta
              titulo="Tendencia de ventas"
              subtitulo={puntos.length > 1 ? `Ingresos por ${mensual ? "mes" : "día"} · tocá el gráfico para ver el detalle` : "Ingresos por hora del día"}
              extra={puntos.length > 1 ? <Leyenda actual={leyendaDe(periodo)} anterior={res.tendenciaAnterior ? comparacion.leyenda : undefined} /> : undefined}
              cuerpo=""
            >
              <Cifras
                items={[
                  { etiqueta: "Total", valor: bsEntero(res.ventas), pie: <Delta fraccion={deltaVentas} /> },
                  puntos.length > 1
                    ? { etiqueta: `Promedio por ${mensual ? "mes" : "día"}`, valor: bsEntero(est.promedio) }
                    : { etiqueta: "Ticket promedio", valor: bsEntero(res.ticketPromedio.valor) },
                  puntos.length > 1
                    ? { etiqueta: `Mejor ${mensual ? "mes" : "día"}`, valor: est.mejor ? bsEntero(est.mejor.valor) : "—", pie: est.mejor?.detalle, tono: "marca" }
                    : { etiqueta: "Tickets", valor: fmtNum(res.tickets.valor) },
                ]}
              />
              <div className="px-2 pb-3 pt-4 sm:px-4">
                {puntos.length > 1 ? (
                  <LineaComparada
                    puntos={puntos}
                    formato={bsEntero}
                    formatoEje={ejeCorto}
                    promedio={est.promedio}
                    etiquetaPromedio={`Promedio ${bsEntero(est.promedio)}`}
                    nombreActual={leyendaDe(periodo)}
                    nombreAnterior={comparacion.leyenda}
                  />
                ) : d.horasDelDia ? (
                  <PorHora porHora={d.horasDelDia.porHora} />
                ) : (
                  <p className="px-2 py-6 text-center text-[13px] text-texto-3">Elegí Semana o Mes para ver cómo vienen las ventas día a día.</p>
                )}
              </div>
            </Tarjeta>

            {avisos.length > 0 && <ParaTenerEnCuenta avisos={avisos} cual={enElPeriodo(periodo)} />}
          </>
        );
      }}
    </Cargador>
  );
}

type Datos = ReturnType<typeof useDatosResumen>;

/**
 * La ganancia real: lo que queda después del costo de lo vendido y de los
 * gastos. Es el mismo número que el final del Estado de resultado (mismas
 * cuentas, `lib/resultado.ts`, y en un billar lo mismo que se pagó de la caja):
 * si acá dijera una cosa y allá otra, ninguno de los dos se creería.
 */
function ResumenFinanciero({ d, res }: { d: Datos; res: ResumenApi }) {
  const f = res.finanzas;
  const er = d.er;
  if (d.plata.error) {
    return (
      <Tarjeta titulo="Resumen financiero">
        <ErrorMsg onReintentar={d.plata.recargar}>{d.plata.error}</ErrorMsg>
      </Tarjeta>
    );
  }
  const ganancia = er?.utilidadNeta ?? null;
  const margen = er ? er.margenNetoPct : f.ingresosNetos > 0 ? f.margenPct / 100 : null;
  const deltaGanancia = er && d.erAnterior ? variacion(er.utilidadNeta, d.erAnterior.utilidadNeta) : null;
  const bancoEImpuestos = er ? er.gastosFinancieros + er.impuestos : 0;
  return (
    <Tarjeta titulo="Resumen financiero" subtitulo="Tu ganancia real, después de costos, descuentos y gastos" cuerpo="flex flex-col px-4 py-3 sm:px-5">
      <Renglon etiqueta="Ingresos brutos" valor={fmtMoney(f.ingresosBrutos)} />
      <Renglon etiqueta="− Descuentos y promos" valor={bsResta(f.descuentos)} resta apagado={esCero(f.descuentos)} />
      <Renglon etiqueta="= Ingresos netos" valor={bsSubtotal(f.ingresosNetos)} />
      <Renglon etiqueta="− Costo de venta" valor={bsResta(f.costoVenta)} resta apagado={esCero(f.costoVenta)} />
      <Renglon etiqueta="Utilidad bruta" valor={bsSubtotal(f.utilidadBruta)} fuerte raya />
      {er ? (
        <>
          {esPositivo(er.mermas) && <Renglon etiqueta="− Mermas" valor={bsResta(er.mermas)} resta />}
          <Renglon etiqueta="− Gastos operativos" valor={bsResta(er.gastosOperativos)} resta apagado={esCero(er.gastosOperativos)} />
          {/* Billar: lo que se pagó de la caja, sólo si hubo. Ya está restado en
              la ganancia de abajo; sin el renglón, la cuenta no cerraba a la vista. */}
          {esPositivo(er.cenasPersonal) && <Renglon etiqueta="− Cenas del personal" valor={bsResta(er.cenasPersonal)} resta />}
          {esPositivo(er.gastosCaja) && <Renglon etiqueta="− Gastos pagados de la caja" valor={bsResta(er.gastosCaja)} resta />}
          {esPositivo(bancoEImpuestos) && <Renglon etiqueta="− Banco e impuestos" valor={bsResta(bancoEImpuestos)} resta />}
          <Renglon
            etiqueta={er.enPerdida ? "Pérdida real" : "Ganancia real"}
            valor={er.enPerdida ? `−${fmtMoney(-er.utilidadNeta)}` : fmtMoney(er.utilidadNeta)}
            total
            tonoValor={er.enPerdida ? "rojo" : esCero(er.utilidadNeta) ? "normal" : "marca"}
          />
        </>
      ) : d.plata.cargando ? (
        <p className="py-2 text-[12px] text-texto-4">Sumando los gastos…</p>
      ) : (
        !d.conGastos && (
          <p className="py-2 text-[12px] text-texto-3">La ganancia real resta los gastos operativos: los ve quien tiene acceso a Gastos.</p>
        )
      )}
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-borde-soft pt-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-texto-3">{ganancia != null ? "Margen" : "Margen bruto"}</p>
          <p className={`text-[26px] font-extrabold tabular-nums ${ganancia != null && ganancia < 0 ? "text-rose-700" : "text-primary-700"}`}>
            {margen != null ? `${Math.round(margen * 100)} %`.replace("-", "−") : "—"}
          </p>
        </div>
        {deltaGanancia != null && (
          <span className="flex items-center gap-1.5 pb-1.5 text-[12px] text-texto-3">
            <Delta fraccion={deltaGanancia} />
            ganancia
          </span>
        )}
      </div>
    </Tarjeta>
  );
}

/** El cuarto número cambia con el rubro: horas de mesa, mesas atendidas, citas, lo que está por vencer. */
function CuartoKpi({ d, res, rubro }: { d: Datos; res: ResumenApi; rubro: string | undefined }) {
  if (esBillar(rubro) && d.billar) {
    const antes = d.billar.anterior?.horas;
    return (
      <KpiR
        etiqueta="Horas de mesa"
        valor={horas(d.billar.horas)}
        delta={<Delta fraccion={antes != null ? variacion(d.billar.horas, antes) : null} />}
        pie={d.billar.jornadas ? `ocupación ${pct(d.billar.ocupacion)}` : undefined}
      />
    );
  }
  if (rubro === "RESTAURANTE" && d.meseros) {
    const t = d.meseros.totales;
    return <KpiR etiqueta="Mesas atendidas" valor={fmtNum(t.mesas)} pie={t.comensales ? `${fmtNum(t.comensales)} comensales` : undefined} />;
  }
  if (esBelleza(rubro) && d.agenda) {
    const a = d.agenda.asistencia;
    return (
      <KpiR
        etiqueta="Citas atendidas"
        valor={fmtNum(a.completadas)}
        pie={a.tasaNoShow != null ? `no vinieron ${fmtNum(a.tasaNoShow, 0)} %` : undefined}
      />
    );
  }
  if (esFarmacia(rubro) && d.mermas) {
    const riesgo = d.mermas.resumen.enRiesgo;
    return <KpiR etiqueta="Por vencer" valor={bsEntero(riesgo)} tono={esPositivo(riesgo) ? "alerta" : "normal"} pie="vencido o en 90 días" />;
  }
  const f = res.finanzas;
  return <KpiR etiqueta="Margen bruto" valor={f.ingresosNetos > 0 ? `${Math.round(f.margenPct)} %` : "—"} delta={<Delta fraccion={fraccion(f.deltaUtilidadPct)} />} pie="utilidad bruta" />;
}

/**
 * Los pedidos del período que se cobran al entregar y todavía no se cobraron.
 * Van aparte y lo dicen: no están en las ventas de arriba (entran el día que
 * se cobran), y sumarlos de cabeza daría un total que la caja nunca vio.
 */
function PorCobrar({ res }: { res: ResumenApi }) {
  const pc = pedidosPorCobrar(res);
  if (!pc) return null;
  return (
    <section className="card flex items-center gap-3 p-4" aria-label="Por cobrar">
      <FichaIcono icono="clock" tono="ambar" size={38} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-texto-3">Por cobrar</p>
        <p className="text-[13.5px] text-texto-2">
          <b className="text-texto">{textoPedidos(pc.cantidad)}</b> sin cobrar todavía.{" "}
          {pc.cantidad === 1
            ? "No está incluido en las ventas: entra cuando se cobra."
            : "No están incluidos en las ventas: entran cuando se cobran."}
        </p>
      </div>
      <p className="shrink-0 text-[20px] font-extrabold tabular-nums text-texto">{fmtMoney(pc.total)}</p>
    </section>
  );
}

/** Las ventas de un solo día, por hora (en el orden de la jornada). */
function PorHora({ porHora }: { porHora: number[] }) {
  const conVentas = porHora.map((v, h) => ({ h, v })).filter((x) => x.v > 0);
  if (conVentas.length === 0) return <p className="px-2 py-6 text-center text-[13px] text-texto-3">Sin ventas en este día.</p>;
  const orden = horasDeJornada(conVentas.map((x) => x.h));
  const desde = orden[0];
  const hasta = orden[orden.length - 1];
  // Del primer al último tramo con ventas, con las horas vacías del medio en
  // cero: saltarlas haría parecer seguidas dos horas que no lo son.
  const tramo: number[] = [];
  for (let h = desde; ; h = (h + 1) % 24) {
    tramo.push(h);
    if (h === hasta || tramo.length > 24) break;
  }
  return (
    <BarrasVerticales
      barras={tramo.map((h) => ({ etiqueta: `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`, valor: porHora[h] ?? 0 }))}
      formato={bsEntero}
    />
  );
}

function ParaTenerEnCuenta({ avisos, cual }: { avisos: Consejo[]; cual: string }) {
  return (
    <Tarjeta titulo="Para tener en cuenta" subtitulo={`Sale de los números ${cual}`} cuerpo="">
      <ul className="divide-y divide-borde-soft">
        {avisos.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
            <FichaIcono icono={c.icono} tono={c.tono} size={38} />
            <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-texto-2">
              {c.partes.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <b key={i} className="text-texto">{p.b}</b>))}
            </p>
            <Link to={`/reportes/${c.a}`} className="flex shrink-0 items-center gap-1 text-[13px] font-bold text-texto hover:text-primary-700">
              Ver
              <span aria-hidden>›</span>
            </Link>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

function hojasResumen(r: ResumenApi, er: EstadoResultado | null) {
  const filas = filasResumen(r, er);
  return [
    hoja("Resumen", [["Concepto", (f: [string, number | null]) => f[0]], ["Valor", (f) => f[1]]], filas),
    hoja(
      "Tendencia",
      [
        ["Fecha", (p: ResumenApi["tendencia"][number] & { anterior: number | null }) => p.fecha ?? p.etiqueta],
        ["Ventas (Bs)", (p) => p.monto],
        ["Período anterior (Bs)", (p) => p.anterior],
      ],
      r.tendencia.map((p, i) => ({ ...p, anterior: r.tendenciaAnterior?.[i]?.monto ?? null })),
    ),
  ];
}
