import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtMoney, fmtNum } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { apiReportes, type DescuentosApi, type ModificacionesApi } from "../api";
import { useColumnaSucursal, useExportar, useReporte } from "../contexto";
import { bsResta, pct, plural, variacion } from "../formato";
import { Cargador, Chip, Delta, FilaLista, KpiR, Nota, Tarjeta } from "../ui";
import {
  hojasDescuentos,
  medioDelCambio,
  porCajero,
  queCambio,
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
  // De qué local es cada anulación: sólo la organización y sólo si son de 2+ locales.
  const { conLocal, rotulo } = useColumnaSucursal(d?.ultimasAnulaciones, (a) => a.sucursal?.id);
  useExportar("descuentos-y-anulaciones", d && !sinDescuentos(d) ? () => hojasDescuentos(d, conLocal, rotulo) : null);

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
              <UltimasAnulaciones lista={x.ultimasAnulaciones} total={anuladas} conLocal={conLocal} />
            </div>
            {/* Las ventas a las que se les cambiaron productos después de
                cobradas (con PIN): sólo si hubo alguna en el período. */}
            {x.modificaciones && <VentasModificadas m={x.modificaciones} conLocal={conLocal} />}
            <Nota>
              Las anulaciones cuentan por el día de la venta y van a nombre de quien vendió, no de quien anuló. No hay
              descuentos a mano en el sistema: lo que se ve son promociones y cupones.
              {x.modificaciones &&
                " Las ventas modificadas cuentan por el día del cambio y van a nombre de quien lo hizo; siempre las autoriza un encargado con su PIN."}{" "}
              Las flechas comparan contra {comparacion.contra}.
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

/**
 * Las ventas modificadas después de cobradas: cuánta plata se devolvió, quién
 * hizo cada cambio, quién lo autorizó con su PIN y qué salió y qué entró del
 * pedido. Es lo que el dueño mira para saber que nadie "achicó" una venta para
 * quedarse con la diferencia.
 */
function VentasModificadas({ m, conLocal }: { m: ModificacionesApi; conLocal: boolean }) {
  const subtitulo = [
    plural(m.cantidad, "cambio", "cambios"),
    esPositivo(m.devuelto) ? `${fmtMoney(m.devuelto)} devueltos a clientes` : null,
    esPositivo(m.cobrado) ? `${fmtMoney(m.cobrado)} cobrados de más` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Tarjeta titulo="Ventas modificadas" subtitulo={subtitulo} cuerpo="">
      {/* Quién hizo los cambios: primero el que más plata devolvió. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 border-b border-borde-soft px-4 py-2.5 text-[12.5px] text-texto-2 sm:px-5">
        {m.porCajero.map((c) => (
          <li key={c.cajero}>
            <span className="font-bold text-texto">{c.cajero}:</span> {plural(c.cantidad, "cambio", "cambios")}
            {esPositivo(c.devuelto) && `, devolvió ${fmtMoney(c.devuelto)}`}
            {esPositivo(c.cobrado) && `, cobró ${fmtMoney(c.cobrado)} más`}
          </li>
        ))}
      </ul>
      <div className="divide-y divide-borde-soft">
        {m.ultimas.map((c, i) => {
          const medio = medioDelCambio(c);
          return (
            <FilaLista
              key={`${c.ventaId}-${i}`}
              icono="edit"
              tono={c.diferencia < 0 ? "rosa" : "verde"}
              titulo={`Cambio · ${c.idVenta}`}
              chip={
                <>
                  {conLocal && c.sucursal ? <Chip>{c.sucursal.nombre}</Chip> : null}
                  {c.anulada ? <Chip tono="rojo">Anulada después</Chip> : null}
                </>
              }
              linea={[c.cajero, c.fecha, c.motivo].filter(Boolean).join(" · ")}
              linea2={`${queCambio(c)} · ${
                c.autorizadoPor && c.autorizadoPor !== c.cajero ? `Autorizó ${c.autorizadoPor}` : "Con su propio PIN"
              }`}
              valor={
                esCero(c.diferencia) ? "Sin diferencia" : c.diferencia < 0 ? bsResta(c.diferencia) : `+${fmtMoney(c.diferencia)}`
              }
              valorPie={
                esCero(c.diferencia) ? undefined : `${c.diferencia < 0 ? "devuelto" : "cobrado"}${medio ? ` ${medio}` : ""}`
              }
              tonoValor={esCero(c.diferencia) ? "apagado" : c.diferencia < 0 ? "rojo" : "marca"}
              // El dato es justo lo que se cortaría: qué salió y qué entró.
              ajustar
            />
          );
        })}
      </div>
      {m.cantidad > m.ultimas.length && (
        <p className="border-t border-borde-soft px-4 py-2.5 text-[12px] text-texto-3 sm:px-5">
          Se ven los {fmtNum(m.ultimas.length)} cambios más nuevos de {fmtNum(m.cantidad)}.
        </p>
      )}
    </Tarjeta>
  );
}

function UltimasAnulaciones({ lista, total, conLocal }: { lista: DescuentosApi["ultimasAnulaciones"]; total: number; conLocal: boolean }) {
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
              chip={conLocal && a.sucursal ? <Chip>{a.sucursal.nombre}</Chip> : undefined}
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
