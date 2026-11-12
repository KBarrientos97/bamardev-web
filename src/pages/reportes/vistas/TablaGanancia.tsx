import type { ReactNode } from "react";
import { fmtCantidad, fmtMoney } from "../../../lib/format";
import { textoAlFiado } from "../../pos/productosVendidos";
import { KpiR } from "../ui";
import { enPerdida, sinCosto, textoGanancia, type CifrasGanancia, type VentasGanancia } from "./VentasGanancia.datos";

/**
 * El cuadro de Ventas y ganancia, aparte de su pantalla porque también lo
 * muestra el arqueo de cada turno (7-nov, igual que `TablaGanancia.kt` en la
 * app). Una sola copia: si el dueño compara el reporte por fechas con el de un
 * turno, tienen que verse iguales.
 */

/** Vendido, costo y ganancia. Si da negativa cambia la etiqueta y va en rojo. */
export function KpisGanancia({ datos }: { datos: VentasGanancia }) {
  const perdida = enPerdida(datos);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <KpiR etiqueta="Vendido" valor={fmtMoney(datos.total)} />
      <KpiR etiqueta="Costo" valor={fmtMoney(datos.costo)} />
      <KpiR
        etiqueta={perdida ? "Pérdida" : "Ganancia"}
        valor={textoGanancia(datos)}
        tono={perdida ? "alerta" : "marca"}
      />
    </div>
  );
}

/**
 * La tabla. Si no entra se desliza a los costados con la columna de los
 * nombres fija: si no, al llegar a la ganancia ya no se ve de qué producto es.
 */
export function TablaGanancia({ datos }: { datos: VentasGanancia }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-[13px] tabular-nums">
        <thead>
          <tr className="text-[11px] font-bold uppercase tracking-wider text-texto-3">
            <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left">Producto</th>
            <th className="px-3 py-3 text-right">Cant.</th>
            <th className="px-3 py-3 text-right">Total</th>
            <th className="px-3 py-3 text-right">Costo</th>
            <th className="px-4 py-3 text-right">Ganancia</th>
          </tr>
        </thead>
        <tbody>
          {datos.categorias.map((c) => (
            <Grupo key={c.nombre} nombre={c.nombre} cifras={c}>
              {c.productos.map((p, i) => (
                <tr key={`${p.nombre}-${i}`}>
                  <td className="sticky left-0 z-10 bg-card px-4 py-2 text-texto">
                    {p.nombre}
                    {/* Cuántas salieron fiadas (el cuadro de un turno, 11-nov): en
                        ámbar, plata que se debe, como en la lista de la cajera. */}
                    {p.fiado ? <span className="block text-[12px] font-semibold text-amber-700">{textoAlFiado(p.fiado)}</span> : null}
                  </td>
                  <Celdas c={p} esProducto />
                </tr>
              ))}
            </Grupo>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-extrabold">
            <td className="sticky left-0 z-10 border-t border-borde bg-card px-4 py-3 text-texto">TOTAL</td>
            <Celdas c={datos} fuerte borde />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Grupo({ nombre, cifras, children }: { nombre: string; cifras: CifrasGanancia; children: ReactNode }) {
  return (
    <>
      <tr className="font-bold text-primary-700">
        <td className="sticky left-0 z-10 border-b border-borde bg-card px-4 pb-1.5 pt-3 text-[12px] uppercase tracking-wider">
          {nombre}
        </td>
        <Celdas c={cifras} grupo />
      </tr>
      {children}
    </>
  );
}

/** Las cifras de un renglón. Un producto sin costo dice "Sin costo" y su ganancia va en gris, no en verde. */
function Celdas({
  c,
  esProducto = false,
  grupo = false,
  fuerte = false,
  borde = false,
}: {
  c: CifrasGanancia;
  esProducto?: boolean;
  grupo?: boolean;
  fuerte?: boolean;
  borde?: boolean;
}) {
  const sc = esProducto && sinCosto(c);
  const perdida = enPerdida(c);
  const base = `px-3 text-right ${grupo ? "border-b border-borde pb-1.5 pt-3" : fuerte ? "py-3" : "py-2"} ${borde ? "border-t border-borde" : ""}`;
  const cifra = grupo ? "" : fuerte ? "text-primary-700" : "font-bold text-texto";
  return (
    <>
      <td className={`${base} ${grupo ? "" : cifra}`}>{fmtCantidad(c.unidades)}</td>
      <td className={`${base} ${cifra}`}>{fmtMoney(c.total)}</td>
      <td className={`${base} ${sc ? "font-normal text-texto-3" : cifra}`}>{sc ? "Sin costo" : fmtMoney(c.costo)}</td>
      <td className={`${base} px-4 ${perdida ? "text-rose-700" : sc ? "font-normal text-texto-3" : cifra}`}>
        {perdida ? `−${textoGanancia(c)}` : textoGanancia(c)}
      </td>
    </>
  );
}
