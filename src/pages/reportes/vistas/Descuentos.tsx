import { esCero } from "../../../lib/dinero";
import { fmtMoney, fmtNum } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { apiReportes, type DescuentosApi } from "../api";
import { useExportar, useReporte } from "../contexto";
import { bsResta, pct, plural, variacion } from "../formato";
import { Cargador, Delta, FilaLista, KpiR, Nota, Tarjeta } from "../ui";
import {
  hojasDescuentos,
  porCajero,
  sinDescuentos,
  sobreVentas,
  sumaCantidades,
  type FilaDescuentoCajero,
} from "./Descuentos.datos";

/**
 * Descuentos y anulaciones: la plata que se regaló (promociones y cupones) y
 * la que se deshizo (ventas anuladas).
 *
 * En el sistema NO hay descuentos a mano: un cajero no puede bajar un precio
 * en el mostrador. Lo que el backend llama "descuento" es lo que restaron las
 * promos y los cupones, y la pantalla lo nombra así para que nadie busque acá
 * un descuento que no existe.
 */
export default function Descuentos() {
  const { rango, rangoAnterior, comparacion } = useReporte();
  // El "% de las ventas" es parte del reporte: si no se puede leer lo vendido
  // falla el reporte entero (invariante 6), en vez de un "—" que esconde el
  // error.
  const datos = useApi(
    () => Promise.all([apiReportes.descuentos(rango), apiReportes.resumen(rango)]),
    [rango.desde, rango.hasta, rango.sucursalId],
  );
  // La comparación es un dato de más: si falla, los números se ven sin flecha.
  const previo = useApi(
    () => apiReportes.descuentos(rangoAnterior),
    [rangoAnterior.desde, rangoAnterior.hasta, rangoAnterior.sucursalId],
  );
  const d = datos.datos?.[0] ?? null;
  useExportar("descuentos-y-anulaciones", d && !sinDescuentos(d) ? () => hojasDescuentos(d) : null);

  return (
    <Cargador
      estado={datos}
      vacio={([x]) =>
        sinDescuentos(x)
          ? {
              titulo: "Sin descuentos ni anulaciones",
              texto: "En este período no se aplicó ninguna promo ni se anuló ninguna venta.",
              icono: "checkCirculo",
            }
          : null
      }
    >
      {([x, resumen]) => {
        const tickets = sumaCantidades(x.descuentosPorCajero);
        const anuladas = sumaCantidades(x.anulacionesPorCajero);
        const totalTickets = resumen.tickets.valor;
        // Sobre lo vendido neto (lo cobrado), la misma base que "Ventas" en
        // todos los reportes.
        const sobre = sobreVentas(x.totalPerdido, resumen.ventas);
        const antes = previo.datos;
        return (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiR
                etiqueta="Descuentos y promos"
                valor={<Monto n={x.totalDescuentos} />}
                // Bajar es bueno: menos plata regalada.
                delta={<Delta fraccion={antes ? variacion(x.totalDescuentos, antes.totalDescuentos) : null} menosEsMejor />}
                pie={
                  totalTickets > 0
                    ? `${plural(tickets, "ticket", "tickets")} · ${pct(x.pctConDescuento / 100)} de los tickets`
                    : plural(tickets, "ticket", "tickets")
                }
              />
              <KpiR
                etiqueta="Anulaciones"
                valor={<Monto n={x.totalAnulado} />}
                delta={<Delta fraccion={antes ? variacion(x.totalAnulado, antes.totalAnulado) : null} menosEsMejor />}
                pie={plural(anuladas, "venta anulada", "ventas anuladas")}
              />
              <KpiR
                etiqueta="Total"
                valor={pct(sobre)}
                pie={sobre == null ? "sin ventas en el período" : `${fmtMoney(x.totalPerdido)} de las ventas`}
              />
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <PorCajero filas={porCajero(x)} />
              <UltimasAnulaciones lista={x.ultimasAnulaciones} total={anuladas} />
            </div>
            <Nota>
              Las anulaciones cuentan por el día de la venta y van a nombre de quien vendió, no de quien anuló. No hay
              descuentos a mano en el sistema: lo que se ve son promociones y cupones. Las flechas comparan contra{" "}
              {comparacion.contra}.
            </Nota>
          </>
        );
      }}
    </Cargador>
  );
}

/** Un monto que no hubo va en gris: "Bs 0,00" en negro se leía como una pérdida chiquita. */
function Monto({ n }: { n: number }) {
  return <span className={esCero(n) ? "text-texto-4" : undefined}>{fmtMoney(n)}</span>;
}

function PorCajero({ filas }: { filas: FilaDescuentoCajero[] }) {
  return (
    <Tarjeta titulo="Por cajero" subtitulo={filas.length > 0 ? "A nombre de quien vendió" : undefined} cuerpo="">
      {filas.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-texto-3 sm:px-5">Nadie aplicó promos ni anuló ventas.</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-borde-soft bg-slate-50/70 text-left text-[11px] font-bold uppercase tracking-wider text-texto-3">
              <th className="px-4 py-2.5 sm:px-5">Cajero</th>
              <th className="px-3 py-2.5 text-right">Descuentos</th>
              <th className="px-4 py-2.5 text-right sm:px-5">Anulaciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde-soft">
            {filas.map((f) => (
              <tr key={f.clave}>
                <td className="px-4 py-3 font-semibold text-texto sm:px-5">{f.cajero}</td>
                <td className="px-3 py-3 text-right">
                  <Celda monto={f.descuentos} cantidad={f.tickets} uno="ticket" varios="tickets" />
                </td>
                <td className="px-4 py-3 text-right sm:px-5">
                  <Celda monto={f.anulado} cantidad={f.anuladas} uno="venta" varios="ventas" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Tarjeta>
  );
}

function Celda({ monto, cantidad, uno, varios }: { monto: number; cantidad: number; uno: string; varios: string }) {
  if (cantidad === 0 && esCero(monto)) return <span className="text-texto-4">—</span>;
  return (
    <>
      <span className="block whitespace-nowrap font-bold tabular-nums text-texto">{fmtMoney(monto)}</span>
      <span className="block text-[11.5px] text-texto-3">{plural(cantidad, uno, varios)}</span>
    </>
  );
}

function UltimasAnulaciones({ lista, total }: { lista: DescuentosApi["ultimasAnulaciones"]; total: number }) {
  // El backend manda las 20 más nuevas: si hubo más, se dice de cuántas.
  const subtitulo =
    lista.length === 0
      ? undefined
      : total > lista.length
        ? `Las ${fmtNum(lista.length)} más nuevas de ${fmtNum(total)}`
        : "Las más nuevas primero";
  return (
    <Tarjeta titulo="Últimas anulaciones" subtitulo={subtitulo} cuerpo="">
      {lista.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-texto-3 sm:px-5">No se anuló ninguna venta en este período.</p>
      ) : (
        <div className="divide-y divide-borde-soft">
          {lista.map((a, i) => (
            <FilaLista
              key={`${a.idVenta}-${i}`}
              icono="x"
              tono="rosa"
              titulo={`Anulación · ${a.idVenta}`}
              linea={[a.cajero, a.fecha, a.motivo].filter(Boolean).join(" · ")}
              // Las anteriores a la trazabilidad (1-oct-2026) no guardan quién
              // dio el visto bueno: se dice, en vez de dejar el hueco.
              linea2={a.autorizadoPor ? `Autorizó ${a.autorizadoPor}` : "Sin registro de quién la autorizó"}
              valor={bsResta(a.monto)}
              tonoValor="rojo"
            />
          ))}
        </div>
      )}
    </Tarjeta>
  );
}
