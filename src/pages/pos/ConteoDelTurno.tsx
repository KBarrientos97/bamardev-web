import { cuadra, nombreConteo } from "../../lib/conteo";
import { fmtNum } from "../../lib/format";
import type { ConteoDeCaja } from "../../types";

/**
 * El conteo por categoría del turno, en el cierre y en «Caja cerrada» (17-nov):
 * por cada tamaño, cuántos había al abrir, cuántos se vendieron y cuántos
 * quedan.
 *
 * «Quedan» es lo del LOCAL, no de esta caja: cuenta también lo vendido por
 * otras cajas de la misma sucursal y lo repuesto desde Supervisión. Por eso
 * puede no cuadrar con «al abrir + repuesto − vendido» y, cuando no cuadra, la
 * nota lo dice en vez de dejar al cajero buscando una venta que no hizo.
 *
 * Un negativo se pinta en rojo, no se esconde: se vendió más de lo que se
 * contó y el dueño tiene que verlo (el conteo de la apertura quedó corto).
 */
export default function ConteoDelTurno({
  conteo,
  className = "",
}: {
  conteo: ConteoDeCaja;
  className?: string;
}) {
  const nombre = nombreConteo(conteo.nombre);
  const hayDescuadre = conteo.items.some((i) => !cuadra(i));
  return (
    <section aria-label={`${nombre} del turno`} className={className}>
      <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-texto-4">{nombre} del turno</h2>
      <ul className="divide-y divide-borde-soft">
        {conteo.items.map((i) => (
          <li key={i.categoriaId} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-texto">{i.nombre}</p>
              <p className="text-[12px] text-texto-3">
                {i.alAbrir == null ? "Al abrir sin contar" : `Al abrir ${fmtNum(i.alAbrir)}`}
                {" · "}Vendidos {fmtNum(i.vendido)}
                {i.repuesto > 0 && <> · Repuestos +{fmtNum(i.repuesto)}</>}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {/* Sin contar no hay un «quedan» que rotular: se lee igual que en la Supervisión. */}
              {i.quedan == null ? (
                <p className="text-sm font-semibold text-texto-3">Sin contar</p>
              ) : (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Quedan</p>
                  <p className={`text-lg font-extrabold leading-tight ${i.quedan < 0 ? "text-danger-text" : "text-texto"}`}>
                    {fmtNum(i.quedan)}
                  </p>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {hayDescuadre && (
        <p className="mt-1.5 text-balance text-[12px] text-texto-3">
          «Quedan» es lo del local: cuenta también lo vendido en otras cajas y lo repuesto.
        </p>
      )}
    </section>
  );
}
