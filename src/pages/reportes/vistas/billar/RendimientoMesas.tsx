import { useMemo, type ReactNode } from "react";
import { fmtNum } from "../../../../lib/format";
import type { BillarReporteApi } from "../../api";
import { hoja, useExportar, useReporte } from "../../contexto";
import { bsEntero, horas, pct } from "../../formato";
import { BarraFila, Cargador, Chip, Delta, KpiR, Nota, Puesto, Tarjeta } from "../../ui";
import { deltaPuntos, filasMesas, hayDetallePorMesa, ocupacionAnterior, tarjetasTipo, type FilaMesa } from "./datosBillar";
import { NotaSucursal } from "./NotaSucursal";
import { useReporteBillar } from "./useReporteBillar";

/**
 * Rendimiento por mesa: qué deja cada mesa y cada tipo de mesa.
 *
 * Arriba los tipos (pool, carambola…) con lo que dejaron y cuánto por hora
 * abierta, y la ocupación general contra el período anterior; abajo cada mesa,
 * de la que más dejó a la que menos, y las horas de las más usadas.
 *
 * El detalle por mesa (tipo, sesiones, lo cobrado, Bs por hora abierta) y la
 * comparación son del rediseño: con un backend anterior no llegan y la
 * pantalla queda con lo que sí hay (lo cobrado en total, la ocupación y las
 * horas por mesa), sin columnas en cero.
 */
export default function RendimientoMesas() {
  const estado = useReporteBillar();
  const { comparacion } = useReporte();
  const r = estado.datos;
  const filas = useMemo(() => (r ? filasMesas(r) : []), [r]);
  const tipos = useMemo(() => (r ? tarjetasTipo(r) : []), [r]);

  useExportar(
    "rendimiento-por-mesa",
    // Sin mesas cobradas la pantalla dice "No se cobró ninguna mesa", y el
    // Excel bajaba igual una planilla en ceros con las mesas paradas.
    r && r.porMesa.length > 0 && filas.length
      ? () => [
          hoja<FilaMesa>(
            "Por mesa",
            [
              ["Mesa", (f) => `Mesa ${f.mesaId}`],
              ["Sin juego", (f) => (f.parada ? "Sí" : null)],
              ["Tipo", (f) => f.tipo],
              ["Horas", (f) => Math.round(f.horas * 10) / 10],
              ["Ocupación (%)", (f) => (f.ocupacion == null ? null : Math.round(f.ocupacion * 100))],
              ["Sesiones", (f) => f.sesiones],
              ["Tiempo (Bs)", (f) => f.tiempoBs],
              ["Consumos (Bs)", (f) => f.consumosBs],
              ["Total (Bs)", (f) => f.total],
              ["Bs por hora abierta", (f) => f.bsPorHoraAbierta],
              ...(r.anterior ? [[`Total ${comparacion.leyenda} (Bs)`, (f: FilaMesa) => f.totalAnterior] as [string, (f: FilaMesa) => number | null]] : []),
            ],
            filas,
          ),
          ...(tipos.length
            ? [
                hoja<ReturnType<typeof tarjetasTipo>[number]>(
                  "Por tipo",
                  [
                    ["Tipo", (t) => t.tipo],
                    ["Mesas", (t) => t.mesas],
                    ["Horas", (t) => Math.round(t.horas * 10) / 10],
                    ["Tiempo (Bs)", (t) => t.tiempoBs],
                    ["Consumos (Bs)", (t) => t.consumosBs],
                    ["Total (Bs)", (t) => t.total],
                    ["Bs por mesa y hora abierta", (t) => t.bsPorHoraAbierta],
                  ],
                  tipos,
                ),
              ]
            : []),
        ]
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(d) =>
        d.porMesa.length === 0
          ? { titulo: "No se cobró ninguna mesa en este período", texto: "Probá con Semana o Mes.", icono: "bola" }
          : null
      }
    >
      {(d) => <Contenido r={d} filas={filas} tipos={tipos} />}
    </Cargador>
  );
}

function Contenido({ r, filas, tipos }: { r: BillarReporteApi; filas: FilaMesa[]; tipos: ReturnType<typeof tarjetasTipo> }) {
  const detalle = hayDetallePorMesa(filas);
  return (
    <>
      <NotaSucursal />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tipos.length > 0 ? (
          tipos.map((t) => (
            // El backend da el Bs por hora abierta del tipo POR MESA: sin
            // decirlo, el tipo con más mesas parecía rendir menos que uno de dos.
            <KpiR
              key={t.tipo}
              etiqueta={`${t.tipo} · ${t.mesas} ${t.mesas === 1 ? "mesa" : "mesas"}`}
              valor={bsEntero(t.total)}
              pie={`${horas(t.horas)} · ${bsEntero(t.bsPorHoraAbierta)} por mesa y hora abierta`}
            />
          ))
        ) : (
          // Sin el reparto por tipo (backend anterior), lo cobrado en total:
          // es lo mismo que suman las tarjetas, sin partir.
          <>
            <KpiR etiqueta="Tiempo de mesa" valor={bsEntero(r.tiempoBs)} pie={`${horas(r.horas)} jugadas`} />
            <KpiR etiqueta="Consumos en mesas" valor={bsEntero(r.consumosBs)} pie="Lo cargado a las mesas" />
          </>
        )}
        <KpiR
          etiqueta="Ocupación general"
          valor={pct(r.ocupacion)}
          delta={<Delta puntos={deltaPuntos(r.ocupacion, ocupacionAnterior(r))} />}
          pie="de las horas abiertas"
        />
      </div>

      {detalle && <TablaMesas filas={filas} conAnterior={r.anterior != null} />}

      <HorasPorMesa porMesa={r.porMesa} />

      {detalle && filas.some((f) => f.bsPorHoraAbierta != null) && (
        <Nota>
          <b>Bs por hora abierta</b> es lo que dejó la mesa (tiempo y consumos) por cada hora que el local estuvo
          abierto, se haya jugado en ella o no. Compara todas las mesas con la misma vara: una que deja poco por hora
          abierta es candidata a una promo o a cambiar de lugar.
        </Nota>
      )}
    </>
  );
}

/** Qué columnas llegaron: una que el backend no manda no se dibuja (ni en cero ni vacía). */
function columnasPresentes(filas: FilaMesa[]) {
  return {
    tipo: filas.some((f) => f.tipo != null),
    ocupacion: filas.some((f) => f.ocupacion != null),
    sesiones: filas.some((f) => f.sesiones != null),
    tiempo: filas.some((f) => f.tiempoBs != null),
    consumos: filas.some((f) => f.consumosBs != null),
    porHora: filas.some((f) => f.bsPorHoraAbierta != null),
  };
}

const bsONada = (n: number | null) => (n == null ? "—" : bsEntero(n));

function TablaMesas({ filas, conAnterior }: { filas: FilaMesa[]; conAnterior: boolean }) {
  const hay = columnasPresentes(filas);
  const th = "px-3 py-3 text-[11px] font-bold uppercase leading-tight tracking-wider text-texto-3";
  const td = "px-3 py-3 tabular-nums";
  return (
    <Tarjeta cuerpo="">
      {/* Desde tablet, la tabla. El tipo va en su columna recién en pantallas
          grandes: en una tablet diez columnas no entran sin correr la página,
          y debajo del número de mesa se lee igual. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Mesa</th>
              {hay.tipo && <th className={`${th} hidden xl:table-cell`}>Tipo</th>}
              <th className={`${th} text-right`}>Horas</th>
              {hay.ocupacion && <th className={th}>Ocupación</th>}
              {hay.sesiones && <th className={`${th} text-right`}>Sesiones</th>}
              {hay.tiempo && <th className={`${th} text-right`}>Tiempo</th>}
              {hay.consumos && <th className={`${th} text-right`}>Consumos</th>}
              <th className={`${th} text-right`}>Total</th>
              {hay.porHora && <th className={`${th} text-right`}>Bs / h abierta</th>}
              {conAnterior && <th className={`${th} text-right`}>vs. anterior</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-borde-soft">
            {filas.map((f) => {
              // La mesa parada se ve (es la que hay que mirar), pero apagada:
              // sus ceros son reales y no compiten con las que dejaron plata.
              const tenue = f.parada ? "text-texto-4" : "text-texto-2";
              return (
                <tr key={f.mesaId}>
                  <td className="px-3 py-3">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={`whitespace-nowrap font-bold ${f.parada ? "text-texto-3" : "text-texto"}`}>Mesa {f.mesaId}</span>
                      {f.parada && <Chip>Sin juego</Chip>}
                    </span>
                    {f.tipo && <span className="block text-[11.5px] text-texto-3 xl:hidden">{f.tipo}</span>}
                  </td>
                  {hay.tipo && <td className={`hidden px-3 py-3 xl:table-cell ${tenue}`}>{f.tipo ?? "—"}</td>}
                  <td className={`${td} whitespace-nowrap text-right ${tenue}`}>{horas(f.horas)}</td>
                  {hay.ocupacion && (
                    <td className={td}>
                      {f.ocupacion == null ? (
                        <span className="text-texto-4">—</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100 lg:block" aria-hidden>
                            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(1, Math.max(0, f.ocupacion)) * 100}%` }} />
                          </span>
                          <span className={`whitespace-nowrap ${tenue}`}>{pct(f.ocupacion)}</span>
                        </span>
                      )}
                    </td>
                  )}
                  {hay.sesiones && <td className={`${td} text-right ${tenue}`}>{f.sesiones == null ? "—" : fmtNum(f.sesiones)}</td>}
                  {hay.tiempo && <td className={`${td} whitespace-nowrap text-right ${tenue}`}>{bsONada(f.tiempoBs)}</td>}
                  {hay.consumos && <td className={`${td} whitespace-nowrap text-right ${tenue}`}>{bsONada(f.consumosBs)}</td>}
                  <td className={`${td} whitespace-nowrap text-right font-extrabold ${f.parada ? "text-texto-4" : "text-texto"}`}>{bsONada(f.total)}</td>
                  {hay.porHora && <td className={`${td} whitespace-nowrap text-right ${tenue}`}>{bsONada(f.bsPorHoraAbierta)}</td>}
                  {conAnterior && (
                    <td className={`${td} text-right`}>
                      {f.delta == null ? <span className="text-texto-4" title="No se jugó en el período anterior">—</span> : <Delta fraccion={f.delta} />}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* En el celular, una tarjeta por mesa con sus números en grilla. */}
      <ul className="divide-y divide-borde-soft md:hidden">
        {filas.map((f, i) => (
          <li key={f.mesaId} className="px-4 py-3.5">
            <div className="flex items-start gap-3">
              <Puesto n={i + 1} destacado={i === 0} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={`text-[14px] font-bold ${f.parada ? "text-texto-3" : "text-texto"}`}>Mesa {f.mesaId}</span>
                  {f.tipo && <Chip>{f.tipo}</Chip>}
                </div>
                <p className="mt-0.5 text-[12px] text-texto-3">
                  {f.parada ? "Sin juego en el período" : horas(f.horas)}
                  {!f.parada && f.ocupacion != null && ` · ${pct(f.ocupacion)} ocupada`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-[15px] font-extrabold tabular-nums ${f.parada ? "text-texto-4" : "text-texto"}`}>{bsONada(f.total)}</p>
                {conAnterior && f.delta != null && (
                  <div className="mt-0.5 flex justify-end">
                    <Delta fraccion={f.delta} />
                  </div>
                )}
              </div>
            </div>
            {/* La parada no lleva la grilla: cuatro ceros dicen lo mismo que "Sin juego". */}
            {!f.parada && (hay.sesiones || hay.tiempo || hay.consumos || hay.porHora) && (
              <dl className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2 pl-[52px]">
                {hay.sesiones && <Dato etiqueta="Sesiones" valor={f.sesiones == null ? "—" : fmtNum(f.sesiones)} />}
                {hay.tiempo && <Dato etiqueta="Tiempo" valor={bsONada(f.tiempoBs)} />}
                {hay.consumos && <Dato etiqueta="Consumos" valor={bsONada(f.consumosBs)} />}
                {hay.porHora && <Dato etiqueta="Bs/h abierta" valor={bsONada(f.bsPorHoraAbierta)} />}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10.5px] font-bold uppercase tracking-wide text-texto-4">{etiqueta}</dt>
      <dd className="truncate text-[13px] font-semibold tabular-nums text-texto-2">{valor}</dd>
    </div>
  );
}

/** Las horas de las mesas más usadas: dónde está el juego, sin importar cuánto dejó. */
function HorasPorMesa({ porMesa }: { porMesa: BillarReporteApi["porMesa"] }) {
  const top = [...porMesa].sort((a, b) => b.horas - a.horas || a.mesaId - b.mesaId).slice(0, 10);
  const max = Math.max(0, ...top.map((m) => m.horas));
  return (
    <Tarjeta titulo="Horas por mesa" subtitulo={porMesa.length > 10 ? "Las 10 más usadas" : "Las mesas jugadas en el período"}>
      <div className="space-y-2.5">
        {top.map((m) => (
          <BarraFila key={m.mesaId} etiqueta={`Mesa ${m.mesaId}`} valor={horas(m.horas)} fraccion={max > 0 ? m.horas / max : 0} ancho="w-16" />
        ))}
      </div>
    </Tarjeta>
  );
}
