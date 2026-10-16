import { Link } from "react-router-dom";
import { api } from "../../../lib/api";
import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtMoney } from "../../../lib/format";
import { rangoParaApi, sinJornada } from "../../../lib/rangoApi";
import {
  diasDelRango,
  puntoEquilibrio,
  type LineaGasto,
  type PuntoEquilibrio as CuentaEquilibrio,
} from "../../../lib/resultado";
import { esBillar } from "../../../lib/rubro";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { apiReportes, fraccion } from "../api";
import { useExportar, useReporte } from "../contexto";
import { bsConSigno, bsEntero, bsResta, pct } from "../formato";
import { ProgresoMeta } from "../graficos";
import { Cargador, Delta, Destacado, FilaLista, Nota, Renglon, Tarjeta } from "../ui";
import {
  bsPorHoraDeMesa,
  comoVas,
  hojasEquilibrio,
  lineaGasto,
  lineaUnidad,
  sobraOFalta,
  textoMargen,
  type UnidadRubro,
} from "./PuntoEquilibrio.datos";

/**
 * Punto de equilibrio: cuánto hay que vender para no perder.
 *
 * Cruza el reporte financiero (ventas y costo de lo vendido) con los gastos
 * operativos del mismo período; la cuenta vive en `lib/resultado.ts`, con los
 * mismos tests que la app. Lo que agrega esta pantalla es decirla en el idioma
 * del dueño: por día, y en la unidad del rubro (horas de mesa en un billar,
 * ventas en el resto).
 */
export default function PuntoEquilibrio() {
  const { rango, rangoAnterior } = useReporte();
  const { rubro, puede } = useAuth();
  const enBillar = esBillar(rubro);
  const conMesas = enBillar && puede("reportes_billar");

  // Las dos mitades juntas: si falla una, falla el reporte entero
  // (invariante 6). Una meta sin los gastos fijos daría cero y se leería como
  // "ya está todo cubierto".
  const mitades = useApi(() => {
    // Los gastos con el MISMO corte que las ventas: medianoche local del
    // primer día a medianoche local del día siguiente al último. El
    // financiero lo convierte solo; getGastos no, porque la pantalla de Gastos
    // ya manda su `hasta` exclusivo. Sin el corte de la jornada de un billar:
    // el gasto lleva fecha, no hora (ver `sinJornada`).
    const { desde, hasta } = rangoParaApi(sinJornada(rango));
    return Promise.all([
      apiReportes.financiero(rango, rangoAnterior),
      api.getGastos({
        desde: desde ?? "",
        hasta: hasta ?? "",
        // Sin `filtro`: son TODOS. El backend no acepta "TODOS" como valor y
        // el reporte entero fallaba.
        sucursalId: rango.sucursalId ?? null,
      }),
    ]);
  }, [rango.desde, rango.hasta, rango.sucursalId, rangoAnterior.desde, rangoAnterior.hasta]);

  // La unidad del rubro es un dato de más: si falla, la meta se ve igual, sin
  // esa línea. En un billar sale de las mesas (sin sucursal elegida, el
  // reporte del billar es el de la principal: el Bs por hora de un local
  // alcanza para convertir la meta, no es una suma); en el resto, del ticket
  // promedio.
  const unidad = useApi<UnidadRubro | null>(
    () =>
      conMesas
        ? apiReportes.billar(rango).then((b) => {
            const bsPorHora = bsPorHoraDeMesa(b);
            return bsPorHora == null ? null : { tipo: "horas" as const, bsPorHora };
          })
        : apiReportes.resumen(rango).then((r) => {
            const ticket = r.ticketPromedio?.valor ?? 0;
            return esPositivo(ticket) ? { tipo: "ventas" as const, ticket } : null;
          }),
    [conMesas, rango.desde, rango.hasta, rango.sucursalId],
  );

  const [fin, gastos] = mitades.datos ?? [null, null];
  const pe = fin && gastos ? puntoEquilibrio(fin, gastos, diasDelRango(rango.desde, rango.hasta)) : null;
  useExportar("punto-de-equilibrio", pe && !pe.vacio ? () => hojasEquilibrio(pe) : null);

  return (
    <Cargador
      estado={mitades}
      vacio={() => (pe?.vacio ? { titulo: "Sin movimiento", texto: "No hay ventas ni gastos en este período.", icono: "chart" } : null)}
    >
      {() =>
        pe && (
          <Cuerpo
            pe={pe}
            deltaVentas={fraccion(fin?.ventasDeltaPct)}
            unidad={unidad.datos ?? null}
            enBillar={enBillar}
            conGastos={puede("gastos")}
          />
        )
      }
    </Cargador>
  );
}

function Cuerpo({
  pe,
  deltaVentas,
  unidad,
  enBillar,
  conGastos,
}: {
  pe: CuentaEquilibrio;
  deltaVentas: number | null;
  unidad: UnidadRubro | null;
  enBillar: boolean;
  conGastos: boolean;
}) {
  const meta = pe.puntoEquilibrio;
  const hayMeta = meta != null && esPositivo(meta);
  const nota = textoMargen(pe.margenContribucionPct, esPositivo(pe.gastosVariables), enBillar);
  const conDesglose = pe.lineasFijas.length > 0 || pe.lineasVariables.length > 0;
  return (
    <>
      {meta == null ? <SinEquilibrio pe={pe} /> : <Meta pe={pe} meta={meta} unidad={unidad} />}

      {pe.sinFijos && esPositivo(pe.ventas) && (
        <Nota tono="ambar">
          No hay gastos fijos cargados en el período (alquiler, sueldos, luz). Sin ellos la meta da cero, que es correcto
          con lo cargado pero no dice nada:{" "}
          {conGastos ? (
            <Link to="/gastos" className="font-bold underline">
              cargalos en Gastos operativos
            </Link>
          ) : (
            "cargalos en Gastos operativos"
          )}
          .
        </Nota>
      )}
      {pe.metaOptimista && pe.sinCostoSobreVentasPct != null && (
        <Nota tono="ambar">
          {pct(pe.sinCostoSobreVentasPct)} de lo vendido salió de artículos sin costo cargado: cuentan como si no costaran
          nada, y la meta se ve más fácil de lo que es.
        </Nota>
      )}

      {meta != null && (
        <div className={`grid items-start gap-4 ${hayMeta ? "lg:grid-cols-2" : ""}`}>
          {hayMeta && (
            <Tarjeta titulo="Cómo vas en el período">
              <ProgresoMeta valor={pe.ventas} meta={meta} etiquetaMeta="Equilibrio" valorMeta={bsEntero(meta)} />
              <div className="mt-8 flex items-center justify-between gap-3 text-[13px]">
                <span className="text-texto-3">Vendiste</span>
                <span className="flex items-center gap-2">
                  <Delta fraccion={deltaVentas} />
                  <b className="tabular-nums text-texto">{fmtMoney(pe.ventas)}</b>
                </span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-texto-3">
                {pe.cubierto
                  ? `Ya cubriste los gastos fijos: las ventas pueden caer ${pct(pe.margenSeguridadPct)} antes de perder.`
                  : `Te faltan ${fmtMoney(pe.faltaVender)} en ventas para llegar.`}
              </p>
            </Tarjeta>
          )}
          <ElCalculo pe={pe} meta={meta} />
        </div>
      )}

      <div className={`grid items-start gap-4 ${conDesglose ? "lg:grid-cols-2" : ""}`}>
        <Tarjeta titulo="De dónde sale el margen" subtitulo="Lo que deja cada venta para cubrir los gastos fijos">
          <Renglon etiqueta="Ventas" valor={fmtMoney(pe.ventas)} />
          <Renglon etiqueta="− Costo de lo vendido" valor={bsResta(pe.costoVentas)} resta apagado={esCero(pe.costoVentas)} />
          <Renglon
            etiqueta="− Gastos variables"
            detalle="Los que suben y bajan con las ventas"
            valor={bsResta(pe.gastosVariables)}
            resta
            apagado={esCero(pe.gastosVariables)}
          />
          <Renglon
            etiqueta="Margen de contribución"
            detalle={pe.margenContribucionPct != null ? `${pct(pe.margenContribucionPct)} de las ventas` : undefined}
            // Negativo es información (cada venta pierde): en rojo y con su
            // signo, nunca como un monto más.
            valor={esPositivo(-pe.margenContribucion) ? bsConSigno(pe.margenContribucion) : fmtMoney(pe.margenContribucion)}
            tonoValor={esPositivo(-pe.margenContribucion) ? "rojo" : "normal"}
            fuerte
            raya
          />
        </Tarjeta>
        {conDesglose && (
          <div className="space-y-4">
            {pe.lineasFijas.length > 0 && <Desglose titulo="Gastos fijos" lineas={pe.lineasFijas} />}
            {pe.lineasVariables.length > 0 && (
              <Desglose titulo="Gastos variables" subtitulo="Se restan de cada venta, no de la meta" lineas={pe.lineasVariables} />
            )}
          </div>
        )}
      </div>

      <Nota>
        {nota ? `${nota} ` : ""}Impuestos y gastos financieros no entran: la meta es la de cubrir la operación.
      </Nota>
    </>
  );
}

/** La tarjeta grande: la meta por día y, debajo, en la unidad del rubro y cómo se va. */
function Meta({ pe, meta, unidad }: { pe: CuentaEquilibrio; meta: number; unidad: UnidadRubro | null }) {
  const diaria = pe.ventaDiariaNecesaria;
  const detalle = esPositivo(meta)
    ? [lineaUnidad(diaria, unidad), comoVas(pe.ventas, meta)].filter(Boolean).join(" · ")
    : "Sin gastos fijos cargados en el período, la meta da cero.";
  return (
    <Destacado
      etiqueta="Para no perder necesitás vender"
      valor={bsEntero(diaria ?? meta)}
      sufijo={diaria != null ? "por día" : "en el período"}
    >
      {detalle || undefined}
    </Destacado>
  );
}

/**
 * Sin punto de equilibrio, y se dice con todas las letras: dividir igual daría
 * un número gigante o negativo que se lee como una meta alcanzable. Los dos
 * casos con margen negativo piden consejos opuestos, por eso se separan.
 */
function SinEquilibrio({ pe }: { pe: CuentaEquilibrio }) {
  const mensaje = !esPositivo(pe.ventas)
    ? "Sin ventas en el período no hay margen con qué calcularlo."
    : pe.margenNegativoPorVariables
      ? "La venta deja plata, pero los gastos variables del período se la llevan entera: vender más no alcanza. Revisá los gastos variables."
      : "Cada venta cuesta más de lo que deja: vender más pierde más. Revisá los precios o el costo cargado de los artículos.";
  return (
    <section className="rounded-[20px] border border-rose-200 bg-rose-50 p-5 sm:p-6">
      <p className="text-[12px] font-bold uppercase tracking-wider text-rose-700">No hay punto de equilibrio</p>
      <p className="mt-1.5 text-[15px] font-semibold leading-snug text-rose-900">{mensaje}</p>
    </section>
  );
}

function ElCalculo({ pe, meta }: { pe: CuentaEquilibrio; meta: number }) {
  const cierre = esPositivo(meta) ? sobraOFalta(pe.ventas, meta) : null;
  return (
    <Tarjeta titulo="El cálculo">
      <Renglon etiqueta="Gastos fijos del período" valor={fmtMoney(pe.gastosFijos)} apagado={esCero(pe.gastosFijos)} />
      <Renglon etiqueta="Margen de contribución" valor={pct(pe.margenContribucionPct)} />
      <Renglon
        etiqueta="Punto de equilibrio"
        detalle={`Gastos fijos ÷ ${pct(pe.margenContribucionPct)}`}
        valor={fmtMoney(meta)}
        fuerte
        raya
      />
      <Renglon etiqueta="Vendiste" valor={fmtMoney(pe.ventas)} />
      {cierre && (
        <Renglon
          etiqueta={cierre.etiqueta}
          detalle={cierre.detalle}
          valor={fmtMoney(cierre.monto)}
          tonoValor={cierre.tono}
          apagado={cierre.tono === "normal"}
          total
        />
      )}
    </Tarjeta>
  );
}

function Desglose({ titulo, subtitulo, lineas }: { titulo: string; subtitulo?: string; lineas: LineaGasto[] }) {
  return (
    <Tarjeta titulo={titulo} subtitulo={subtitulo} cuerpo="divide-y divide-borde-soft">
      {lineas.map((l) => (
        <FilaLista
          key={l.codigo}
          titulo={l.nombre}
          linea={lineaGasto(l)}
          valor={fmtMoney(l.monto)}
          barra={{ fraccion: l.sobreGastosPct }}
        />
      ))}
    </Tarjeta>
  );
}
