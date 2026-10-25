import { fmtCantidad, fmtMoney, fmtMoneySinCeros, fmtNum } from "../../lib/format";
import type { ReporteCierreProductos } from "../../types";

/**
 * Lo que se vendió en un turno, por categoría y producto: las unidades, lo
 * recaudado y cada producto con su cantidad y su total. Ya viene agrupado y
 * ordenado del backend: no se reordena acá.
 *
 * `sinCeros` (billar, 25-oct): "9 unidades · 3 × Bs 10 · Bs 30" en vez de
 * "9,00 unidades · 3,00 × Bs 10,00 · Bs 30,00". Los demás rubros siguen con dos
 * decimales hasta que se decida otra cosa.
 *
 * Lo usan el cierre de caja (el modal "Productos vendidos") y Supervisión del
 * billar ("Lo que salió en el turno"): es el mismo número en los dos lados.
 */
export default function ListaProductosVendidos({ d, sinCeros = false }: { d: ReporteCierreProductos; sinCeros?: boolean }) {
  const plata = sinCeros ? fmtMoneySinCeros : fmtMoney;
  const cantidad = (n: number) => (sinCeros ? fmtCantidad(n) : fmtNum(n, 2));
  return (
    <>
      <div className="flex justify-between rounded-xl bg-muted px-3.5 py-2.5 text-[13px]">
        <span className="text-texto-2">
          {cantidad(d.unidades)} unidades · {fmtNum(d.lineas)} {d.lineas === 1 ? "producto" : "productos"}
        </span>
        <span className="font-bold text-texto">{plata(d.total)}</span>
      </div>

      {d.categorias.map((c) => (
        <div key={c.nombre}>
          <div className="flex items-baseline justify-between">
            <h4 className="text-[13px] font-bold text-texto">{c.nombre}</h4>
            <span className="text-xs text-texto-3">
              {cantidad(c.unidades)} u · {plata(c.total)}
            </span>
          </div>
          <ul className="mt-1 divide-y divide-borde-soft">
            {c.items.map((i) => (
              <li key={i.nombre} className="flex items-center gap-2 py-1.5 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-texto-2">{i.nombre}</span>
                <span className="shrink-0 text-texto-3">
                  {cantidad(i.cantidad)} × {plata(i.precio)}
                </span>
                <span className="w-20 shrink-0 text-right font-bold text-texto">{plata(i.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
