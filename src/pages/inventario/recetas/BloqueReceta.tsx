import { Boton, ErrorMsg } from "../../../components/ui";
import { fmtMoney } from "../../../lib/format";
import { apiRecetas } from "../../../lib/recetas/api";
import { useApi } from "../../../lib/useApi";
import { cantidadDe, resumenReceta } from "./textos";

/**
 * Lo que el formulario de Artículos muestra de un plato «Con receta»
 * (CONTRATO-recetas-plato §3.4): en lugar del campo «Costo», lo que calcula la
 * receta; y el bloque «Receta», con lo que lleva y el botón que abre el editor.
 */

/**
 * En lugar del campo «Costo»: no se escribe, lo calcula la receta. `costo`
 * null = no se sabe (todavía no hay receta, o quien edita no ve los costos).
 */
export function CostoDeLaReceta({ costo, armada }: { costo: number | null | undefined; armada: boolean }) {
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">Costo</span>
      <p className="rounded-xl border border-borde bg-muted px-3.5 py-2.5 text-sm text-texto-2">
        {armada && costo != null ? (
          <>
            <strong className="text-texto">{fmtMoney(costo)}</strong> · lo calcula la receta
          </>
        ) : armada ? (
          "Lo calcula la receta."
        ) : (
          "Lo calcula la receta cuando la armes."
        )}
      </p>
    </div>
  );
}

/**
 * El bloque «Receta» del formulario. Con `platoId` (un plato que ya es «Con
 * receta») trae su receta y ofrece cambiarla; sin él (un alta, o un elaborado
 * que recién pasa a «Con receta») avisa que se arma al guardar.
 */
export function BloqueReceta({ platoId, onArmar }: { platoId: number | null; onArmar?: () => void }) {
  const receta = useApi(
    () => (platoId == null ? Promise.resolve(null) : apiRecetas.receta(platoId)),
    [platoId],
  );
  const lineas = receta.datos?.lineas ?? [];
  return (
    <div className="rounded-xl border border-borde p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-bold text-texto">Receta</h4>
        {lineas.length > 0 && <span className="text-xs text-texto-3">{cantidadDe(lineas.length, "insumo")}</span>}
      </div>
      {platoId == null ? (
        <p className="text-[13px] text-texto-3">
          Todavía no tiene receta: al guardar el artículo se abre para que la armes con tus insumos.
        </p>
      ) : receta.error ? (
        <ErrorMsg onReintentar={receta.recargar}>{receta.error}</ErrorMsg>
      ) : receta.cargando && !receta.datos ? (
        <p className="text-[13px] text-texto-3">Cargando la receta…</p>
      ) : (
        <p className="text-[13px] text-texto-2">{resumenReceta(lineas)}</p>
      )}
      {platoId != null && onArmar && (
        <Boton type="button" variante="soft" icono="edit" className="mt-3 min-h-11" onClick={onArmar}>
          {lineas.length ? "Cambiar la receta" : "Armar la receta"}
        </Boton>
      )}
    </div>
  );
}
