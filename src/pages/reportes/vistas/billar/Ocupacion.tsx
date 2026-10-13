import { useMemo } from "react";
import { horaCorta } from "../../../billar/reportes/datosReporte";
import type { BillarReporteApi } from "../../api";
import { hoja, useExportar, useReporte } from "../../contexto";
import { horas, pct } from "../../formato";
import { LineaComparada, MapaCalor, type PuntoLinea } from "../../graficos";
import { diasDe, leyendaDe } from "../../periodo";
import { Cargador, Cifras, Delta, KpiR, Leyenda, Nota, Tarjeta } from "../../ui";
import {
  armarCalor,
  deltaPuntos,
  horaFloja,
  horaGlobo,
  horaPico,
  mejorDia,
  mesaMasUsada,
  ocupacionAnterior,
  puntosOcupacion,
  type MapaDeCalor,
} from "./datosBillar";
import { NotaSucursal } from "./NotaSucursal";
import { useReporteBillar } from "./useReporteBillar";

/** Un porcentaje entero para Excel (0,416 → 42). */
const enteroPct = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100));

/**
 * Ocupación: cuándo se llenan las mesas.
 *
 * El mapa día × hora dice qué noche conviene reforzar y cuál está muerta; la
 * curva por hora, contra el período anterior, dice si eso cambió. La hora más
 * floja va marcada como la buena para una promo: es la pregunta que el dueño
 * se hace con este reporte abierto.
 *
 * El mapa y la comparación son del rediseño (`calor`, `anterior`): contra un
 * backend anterior no llegan, y se ven la hora pico, la ocupación y la curva
 * del período, que sí estaban.
 */
export default function Ocupacion() {
  const estado = useReporteBillar();
  const { periodo, comparacion } = useReporte();
  const r = estado.datos;
  const todosLosDias = diasDe(periodo.desde, periodo.hasta) >= 7;
  const calor = useMemo(() => (r?.calor ? armarCalor(r.calor, r.porHora, todosLosDias) : null), [r, todosLosDias]);
  const puntos = useMemo(() => (r ? puntosOcupacion(r.porHora, r.anterior?.porHora) : []), [r]);
  const conAnterior = puntos.some((p) => p.anterior != null);

  useExportar(
    "ocupacion-billar",
    puntos.length
      ? () => [
          hoja<PuntoLinea>(
            "Por hora",
            [
              ["Hora", (p) => p.detalle ?? p.etiqueta],
              ["Ocupación (%)", (p) => enteroPct(p.valor)],
              ...(conAnterior ? [[`${comparacion.leyenda} (%)`, (p: PuntoLinea) => enteroPct(p.anterior)] as [string, (p: PuntoLinea) => number | null]] : []),
            ],
            puntos,
          ),
          ...(calor ? [hojaCalor(calor)] : []),
        ]
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(d) =>
        d.porHora.length === 0
          ? { titulo: "No hubo juego en este período", texto: "Sin mesas jugadas no hay ocupación que medir. Probá con Semana o Mes.", icono: "grid" }
          : null
      }
    >
      {(d) => <Contenido r={d} calor={calor} puntos={puntos} actual={leyendaDe(periodo)} anterior={comparacion.leyenda} />}
    </Cargador>
  );
}

function hojaCalor(calor: MapaDeCalor) {
  const indices = calor.filas.map((_, i) => i);
  return hoja<number>(
    "Día y hora",
    [["Día", (i) => calor.filas[i]], ...calor.horas.map((h, j): [string, (i: number) => number | null] => [horaCorta(h), (i) => enteroPct(calor.valores[i][j])])],
    indices,
  );
}

function Contenido({
  r,
  calor,
  puntos,
  actual,
  anterior,
}: {
  r: BillarReporteApi;
  calor: MapaDeCalor | null;
  puntos: PuntoLinea[];
  actual: string;
  anterior: string;
}) {
  const pico = horaPico(r.porHora);
  const floja = horaFloja(r.porHora);
  const mejor = calor ? mejorDia(calor) : null;
  const mesa = mesaMasUsada(r.porMesa);
  const delta = deltaPuntos(r.ocupacion, ocupacionAnterior(r));
  const hayAnterior = puntos.some((p) => p.anterior != null);
  const cuantas = 2 + (mejor ? 1 : 0) + (mesa ? 1 : 0);

  return (
    <>
      <NotaSucursal />
      <div className={`grid grid-cols-2 gap-3 ${cuantas === 4 ? "lg:grid-cols-4" : cuantas === 3 ? "lg:grid-cols-3" : ""}`}>
        <KpiR icono="trendingUp" etiqueta="Hora pico" valor={pico ? horaCorta(pico.hora) : "—"} pie={pico ? `${pct(pico.ocupacion)} ocupado` : undefined} />
        {mejor && <KpiR icono="calendar" etiqueta="Mejor día" valor={mejor.dia} pie={`${pct(mejor.promedio)} promedio`} />}
        <KpiR icono="bola" etiqueta="Ocupación" valor={pct(r.ocupacion)} delta={<Delta puntos={delta} />} />
        {mesa && <KpiR icono="numeral" etiqueta="Mesa más usada" valor={`Mesa ${mesa.mesaId}`} pie={horas(mesa.horas)} />}
      </div>

      {calor && (
        <Tarjeta titulo="Ocupación por día y hora" subtitulo="Promedio del período · más oscuro = más lleno">
          <MapaCalor
            filas={calor.filas}
            columnas={calor.columnas}
            valores={calor.valores}
            detalle={(f, c, v) => `${calor.filas[f]} ${horaGlobo(calor.horas[c])} · ${pct(v)} ocupado`}
          />
        </Tarjeta>
      )}

      <Tarjeta
        titulo="Ocupación por hora"
        subtitulo="Promedio de todas las mesas, por hora · tocá el gráfico para ver el detalle"
        extra={<Leyenda actual={actual} anterior={hayAnterior ? anterior : undefined} />}
        cuerpo=""
      >
        <Cifras
          items={[
            { etiqueta: "Ocupación promedio", valor: pct(r.ocupacion), pie: delta != null ? <Delta puntos={delta} /> : undefined },
            ...(pico ? [{ etiqueta: "Hora pico", valor: pct(pico.ocupacion), pie: horaCorta(pico.hora), tono: "marca" as const }] : []),
            ...(floja
              ? [{ etiqueta: "Hora más floja", valor: pct(floja.ocupacion), pie: `${horaCorta(floja.hora)} · buena para promo`, tono: "rojo" as const }]
              : []),
          ]}
        />
        <div className="px-4 pb-4 pt-5 sm:px-5">
          <LineaComparada
            puntos={puntos}
            formato={pct}
            formatoEje={pct}
            promedio={r.ocupacion}
            etiquetaPromedio={`Promedio ${pct(r.ocupacion)}`}
            nombreActual={actual}
            nombreAnterior={hayAnterior ? anterior : undefined}
            tope={1}
          />
        </div>
      </Tarjeta>

      <Nota>
        La ocupación son las horas jugadas sobre las horas de mesa que había mientras el local tuvo juego: no hay un
        horario de atención cargado, y contar las 24 horas del día daría un local vacío aunque esté lleno.
      </Nota>
    </>
  );
}
