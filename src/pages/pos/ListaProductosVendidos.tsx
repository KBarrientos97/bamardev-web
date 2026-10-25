import { fmtMoney, fmtNum } from "../../lib/format";
import type { ReporteCierreProductos } from "../../types";

/**
 * Lo que se vendió en un turno, por categoría y producto: las unidades, lo
 * recaudado y cada producto con su cantidad y su total. Ya viene agrupado y
 * ordenado del backend: no se reordena acá.
 *
 * Lo usan el cierre de caja (el modal "Productos vendidos") y Supervisión del
 * billar ("Lo que salió en el turno"): es el mismo número en los dos lados.
 */
export default function ListaProductosVendidos({ d }: { d: ReporteCierreProductos }) {
  return (
    <>
      <div className="flex justify-between rounded-xl bg-muted px-3.5 py-2.5 text-[13px]">
        <span className="text-texto-2">
          {fmtNum(d.unidades, 2)} unidades · {fmtNum(d.lineas)} {d.lineas === 1 ? "producto" : "productos"}
        </span>
        <span className="font-bold text-texto">{fmtMoney(d.total)}</span>
      </div>

      {d.categorias.map((c) => (
        <div key={c.nombre}>
          <div className="flex items-baseline justify-between">
            <h4 className="text-[13px] font-bold text-texto">{c.nombre}</h4>
            <span className="text-xs text-texto-3">
              {fmtNum(c.unidades, 2)} u · {fmtMoney(c.total)}
            </span>
          </div>
          <ul className="mt-1 divide-y divide-borde-soft">
            {c.items.map((i) => (
              <li key={i.nombre} className="flex items-center gap-2 py-1.5 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-texto-2">{i.nombre}</span>
                <span className="shrink-0 text-texto-3">
                  {fmtNum(i.cantidad, 2)} × {fmtMoney(i.precio)}
                </span>
                <span className="w-20 shrink-0 text-right font-bold text-texto">{fmtMoney(i.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
