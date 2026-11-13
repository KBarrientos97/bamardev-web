import { Badge } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtCantidad } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import type { Existencia, Producto } from "../../types";

/**
 * Cuánto hay del artículo en cada local (PLAN-SUCURSAL-TOTAL §3, etapa 5).
 *
 * Es para quien es de organización con 2+ locales: el "Stock actual" del
 * detalle es la suma del negocio, y el dueño que mira "12 unidades" no sabe si
 * están en el mostrador o en el depósito. Va con `verPorLocal`, que sale de
 * `useSucursales` (`modo === "organizacion"`): con un solo local, o para quien
 * es de uno, no aparece (para ese usuario, esto sería ruido o una fuga).
 *
 * Sin costos: es `GET /productos/:id/existencias`, el mismo que lee el
 * mostrador de farmacia en la ficha del medicamento.
 */
export function StockPorLocal({
  producto: p,
}: {
  producto: Pick<Producto, "id" | "unidadMedida" | "stockTotal"> & { stockMinimo?: number };
}) {
  const existencias = useApi(() => api.existenciasProducto(p.id), [p.id]);
  const lista = existencias.datos ?? [];
  // Un solo lugar con stock no dice nada que el "Stock actual" no diga ya; y
  // mientras carga (o si falla) no se muestra nada: el detalle ya está completo.
  if (lista.length < 2) return null;
  const unidad = p.unidadMedida?.nombre ?? "";
  // «Bajo stock» por local: cada uno contra SU mínimo (el propio, o el del
  // artículo si no tiene) — PLAN-SUCURSAL-TOTAL §10.1. Un depósito sin mínimo
  // propio no cuenta: guarda, no vende, y con el global sería ruido.
  const minimoDe = (e: Existencia) => e.stockMinimo ?? p.stockMinimo ?? 0;
  const bajos = lista.filter(
    (e) => minimoDe(e) > 0 && e.cantidad <= minimoDe(e) && (e.tipo !== "DEPOSITO" || e.stockMinimo != null),
  );
  return (
    <div>
      <h4 className="mb-2 text-[13px] font-bold text-texto">
        Stock por sucursal
        <span className="ml-1.5 font-normal text-texto-3">— el total de arriba es la suma</span>
      </h4>
      {bajos.length > 0 && (
        <p role="note" className="mb-2 text-xs font-semibold text-warning-text">
          Bajo su mínimo en {bajos.map((e) => `${e.nombre} (${fmtCantidad(e.cantidad)} de ${fmtCantidad(minimoDe(e))})`).join(" · ")}
        </p>
      )}
      <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
        {lista.map((e) => (
          <li key={e.almacenId} className="flex items-center gap-2 px-3.5 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[13px] text-texto">
              {e.nombre}
              {e.tipo === "DEPOSITO" && (
                <Badge tono="marca" className="ml-1.5">
                  Depósito
                </Badge>
              )}
              {/* El mínimo propio, sólo si lo tiene: con el global no se repite. */}
              {e.stockMinimo != null && (
                <span className="ml-1.5 text-xs font-normal text-texto-3">
                  mínimo {fmtCantidad(e.stockMinimo)}
                </span>
              )}
            </span>
            <span className={`shrink-0 text-[13px] font-bold ${e.cantidad <= 0 ? "text-danger-text" : "text-texto"}`}>
              {fmtCantidad(e.cantidad)} {unidad}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
