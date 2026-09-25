import { Cargando, ErrorMsg, Vacio } from "../../components/ui";
import { api } from "../../lib/api";
import { esPositivo } from "../../lib/dinero";
import { fmtMoney, fmtPct } from "../../lib/format";
import {
  diasDelRango,
  estadoResultado,
  puntoEquilibrio,
  type FinancieroBase,
  type LineaGasto,
} from "../../lib/resultado";
import { rangoParaApi } from "../../lib/rangoApi";
import { useApi } from "../../lib/useApi";
import type { Gasto, RangoReporte } from "../../types";

/**
 * Estado de resultado y punto de equilibrio en la web.
 *
 * En la app estaban (Finanzas → Financiero y Punto de equilibrio); la web sólo
 * tenía el "financiero" genérico, que muestra ventas contra compras pero no
 * descuenta los gastos operativos: el dueño veía una ganancia que no tenía.
 * La cuenta vive en `lib/resultado.ts`, con los mismos tests que la app.
 */

/**
 * Las dos mitades del reporte, juntas.
 *
 * `Promise.all`: si falla una, falla el reporte entero (invariante 6). Un
 * resultado sin los gastos mostraría una utilidad inflada como si fuera real.
 */
function useMitades(rango: RangoReporte) {
  return useApi(() => {
    // Los gastos con el MISMO corte que las ventas: medianoche local del
    // primer día a medianoche local del día siguiente al último (el reporte
    // financiero lo convierte solo; getGastos no, porque la pantalla de
    // Gastos ya manda su `hasta` exclusivo).
    const { desde, hasta } = rangoParaApi(rango);
    return Promise.all([
      api.reporte<FinancieroBase>("financiero", rango),
      api.getGastos({
        desde: desde ?? "",
        hasta: hasta ?? "",
        // Sin `filtro`: son TODOS. El backend no acepta "TODOS" como valor
        // (sólo PENDIENTES, VENCIDOS o PAGADOS) y el reporte entero fallaba.
        sucursalId: rango.sucursalId ?? null,
      }),
    ]);
  }, [rango.desde, rango.hasta, rango.sucursalId]);
}

function Estado({
  cargando,
  error,
  reintentar,
}: {
  cargando: boolean;
  error: string;
  reintentar: () => void;
}) {
  if (cargando) return <Cargando />;
  return <ErrorMsg onReintentar={reintentar}>{error}</ErrorMsg>;
}

// ── Estado de resultado ─────────────────────────────────────────────────────

export function EstadoResultadoVista({ rango }: { rango: RangoReporte }) {
  const mitades = useMitades(rango);
  if (!mitades.datos) {
    return (
      <Estado cargando={mitades.cargando} error={mitades.error} reintentar={mitades.recargar} />
    );
  }
  const [fin, gastos] = mitades.datos as [FinancieroBase, Gasto[]];
  const er = estadoResultado(fin, gastos);

  if (er.vacio) {
    return <Vacio icono="chart" titulo="Sin movimiento" texto="No hay ventas ni gastos en este período." />;
  }

  return (
    <div className="space-y-4">
      {/* El número de abajo cambia de nombre con el signo: un negativo no se
          llama "utilidad" ni se pinta de verde. */}
      <div
        className={`rounded-2xl p-4 ${
          er.enPerdida ? "bg-[#FEF2F2] text-[#B91C1C]" : "bg-primary-50 text-primary-700"
        }`}
      >
        <p className="text-[11px] font-bold uppercase tracking-widest">
          {er.enPerdida ? "Pérdida del período" : "Utilidad neta"}
        </p>
        <p className="mt-1 text-3xl font-extrabold">{fmtMoney(er.utilidadNeta)}</p>
        {er.margenNetoPct != null && (
          <p className="mt-0.5 text-sm">{fmtPct(er.margenNetoPct)} de las ventas</p>
        )}
      </div>

      {er.sinCostoSobreVentasPct != null && esPositivo(er.ventasSinCosto) && (
        <p className="rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-[13px] text-[#D97706]">
          {fmtMoney(er.ventasSinCosto)} ({fmtPct(er.sinCostoSobreVentasPct)} de lo vendido) salió
          de artículos sin costo cargado: cuentan como si no costaran nada y la utilidad se ve
          más alta de lo que es.
        </p>
      )}

      <dl className="card divide-y divide-borde-soft text-sm">
        <Renglon etiqueta="Ventas" valor={er.ventas} />
        <Renglon etiqueta="Costo de lo vendido" valor={-er.costoVentas} />
        <Renglon
          etiqueta="Utilidad bruta"
          valor={er.utilidadBruta}
          pct={er.margenBrutoPct}
          fuerte
        />
        <Renglon etiqueta="Gastos operativos" valor={-er.gastosOperativos} pct={er.gastosSobreVentasPct} />
        <Renglon
          etiqueta="Utilidad operativa"
          valor={er.utilidadOperativa}
          pct={er.margenOperativoPct}
          fuerte
        />
        {/* Impuestos y financieros van debajo de la operativa (invariante 3).
            Sin ninguno, la neta es la operativa y esos renglones sobran. */}
        {!er.sinBajoLaLinea && (
          <>
            <Renglon etiqueta="Gastos financieros" valor={-er.gastosFinancieros} />
            <Renglon etiqueta="Antes de impuestos" valor={er.utilidadAntesImpuestos} />
            <Renglon etiqueta="Impuestos" valor={-er.impuestos} />
          </>
        )}
        <Renglon
          etiqueta={er.enPerdida ? "Pérdida del período" : "Utilidad neta"}
          valor={er.utilidadNeta}
          pct={er.margenNetoPct}
          fuerte
        />
      </dl>

      {er.lineas.length > 0 && (
        <Desglose titulo="En qué se fueron los gastos operativos" lineas={er.lineas} />
      )}

      {/* Las compras no restan: lo comprado y no vendido sigue en el almacén.
          Se dice para que nadie busque ahí la diferencia con su cuaderno. */}
      {esPositivo(er.comprasTotal) && (
        <p className="text-xs text-texto-3">
          Compras del período: {fmtMoney(er.comprasTotal)}. No se restan acá: lo que se compró y
          todavía no se vendió sigue en el almacén; lo vendido entra como costo.
        </p>
      )}
    </div>
  );
}

function Renglon({
  etiqueta,
  valor,
  pct,
  fuerte,
}: {
  etiqueta: string;
  valor: number;
  pct?: number | null;
  fuerte?: boolean;
}) {
  // Negativo de verdad (no un residuo de centavos): va en rojo, nunca en
  // verde. Los renglones que restan (costo, gastos) son egresos y también.
  const negativo = esPositivo(-valor);
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2.5 ${fuerte ? "bg-muted" : ""}`}>
      <dt className={fuerte ? "font-bold text-texto" : "text-texto-2"}>{etiqueta}</dt>
      <dd className="text-right">
        <span
          className={`${fuerte ? "font-extrabold" : "font-semibold"} ${
            negativo ? "text-[#B91C1C]" : "text-texto"
          }`}
        >
          {fmtMoney(valor)}
        </span>
        {/* Un porcentaje que no se puede calcular no se muestra: "0 %" en un
            mes sin ventas se lee como un dato. */}
        {pct != null && <span className="ml-2 text-xs text-texto-3">{fmtPct(pct)}</span>}
      </dd>
    </div>
  );
}

function Desglose({ titulo, lineas }: { titulo: string; lineas: LineaGasto[] }) {
  return (
    <section>
      <h4 className="mb-2 text-[13px] font-bold text-texto">{titulo}</h4>
      <ul className="card divide-y divide-borde-soft">
        {lineas.map((l) => (
          <li key={l.codigo} className="px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-texto">
                {l.nombre}
                <span className="ml-1.5 text-xs text-texto-4">
                  {l.cantidad} {l.cantidad === 1 ? "gasto" : "gastos"}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-texto">{fmtMoney(l.monto)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round(l.sobreGastosPct * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Punto de equilibrio ─────────────────────────────────────────────────────

export function PuntoEquilibrioVista({ rango }: { rango: RangoReporte }) {
  const mitades = useMitades(rango);
  if (!mitades.datos) {
    return (
      <Estado cargando={mitades.cargando} error={mitades.error} reintentar={mitades.recargar} />
    );
  }
  const [fin, gastos] = mitades.datos as [FinancieroBase, Gasto[]];
  const pe = puntoEquilibrio(fin, gastos, diasDelRango(rango.desde, rango.hasta));

  if (pe.vacio) {
    return <Vacio icono="chart" titulo="Sin movimiento" texto="No hay ventas ni gastos en este período." />;
  }

  // Cuánto del camino a la meta ya se recorrió, para la barra. Tope 1: pasada
  // la meta, la barra está llena y el resto lo dice el texto.
  const avance =
    pe.puntoEquilibrio != null && esPositivo(pe.puntoEquilibrio)
      ? Math.min(1, pe.ventas / pe.puntoEquilibrio)
      : 1;

  return (
    <div className="space-y-4">
      {pe.puntoEquilibrio == null ? (
        // Puede no existir, y se dice con todas las letras: dividir igual daría
        // un número gigante o negativo que se lee como una meta alcanzable.
        <div className="rounded-2xl bg-[#FEF2F2] p-4 text-[#B91C1C]">
          <p className="text-[11px] font-bold uppercase tracking-widest">
            No hay punto de equilibrio
          </p>
          <p className="mt-1 text-sm">
            {!esPositivo(pe.ventas)
              ? "Sin ventas en el período no hay margen con qué calcularlo."
              : pe.margenNegativoPorVariables
                ? "La venta deja plata, pero los gastos variables del período se la llevan entera: vender más no alcanza. Revisá los gastos variables."
                : "Cada venta cuesta más de lo que deja: vender más pierde más. Revisá los precios o el costo cargado de los artículos."}
          </p>
        </div>
      ) : (
        <div
          className={`rounded-2xl p-4 ${
            pe.cubierto ? "bg-primary-50 text-primary-700" : "bg-[#FFFBEB] text-[#B45309]"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-widest">
            Hay que vender para no perder
          </p>
          <p className="mt-1 text-3xl font-extrabold">{fmtMoney(pe.puntoEquilibrio)}</p>
          {pe.ventaDiariaNecesaria != null && (
            <p className="mt-0.5 text-sm">{fmtMoney(pe.ventaDiariaNecesaria)} por día</p>
          )}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
            <div
              className={`h-full rounded-full ${pe.cubierto ? "bg-primary" : "bg-[#D97706]"}`}
              style={{ width: `${Math.round(avance * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-sm font-semibold">
            {pe.cubierto
              ? `Ya se cubrieron los gastos fijos. Las ventas pueden caer ${fmtPct(pe.margenSeguridadPct)} antes de perder.`
              : `Faltan ${fmtMoney(pe.faltaVender)} en ventas para llegar.`}
          </p>
        </div>
      )}

      {pe.sinFijos && esPositivo(pe.ventas) && (
        <p className="rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-[13px] text-[#D97706]">
          No hay gastos fijos cargados en el período (alquiler, sueldos, luz). Sin ellos la meta da
          cero, que es correcto con lo cargado pero no dice nada: cargalos en Gastos operativos.
        </p>
      )}

      {pe.metaOptimista && pe.sinCostoSobreVentasPct != null && (
        <p className="rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-[13px] text-[#D97706]">
          {fmtPct(pe.sinCostoSobreVentasPct)} de lo vendido salió de artículos sin costo cargado:
          la meta se ve más fácil de lo que es.
        </p>
      )}

      <dl className="card divide-y divide-borde-soft text-sm">
        <Renglon etiqueta="Ventas" valor={pe.ventas} />
        <Renglon etiqueta="Costo de lo vendido" valor={-pe.costoVentas} />
        <Renglon etiqueta="Gastos variables" valor={-pe.gastosVariables} />
        <Renglon
          etiqueta="Margen de contribución"
          valor={pe.margenContribucion}
          pct={pe.margenContribucionPct}
          fuerte
        />
        <Renglon etiqueta="Gastos fijos a cubrir" valor={pe.gastosFijos} fuerte />
      </dl>

      <p className="text-xs text-texto-3">
        Margen de contribución: lo que deja cada venta después de pagar lo que costó y los gastos
        que se mueven con ella. Con ese porcentaje se cubren los gastos fijos. Impuestos y gastos
        financieros no entran: la meta es la de cubrir la operación.
      </p>

      {pe.lineasFijas.length > 0 && <Desglose titulo="Gastos fijos" lineas={pe.lineasFijas} />}
      {pe.lineasVariables.length > 0 && (
        <Desglose titulo="Gastos variables (se restan de cada venta)" lineas={pe.lineasVariables} />
      )}
    </div>
  );
}
