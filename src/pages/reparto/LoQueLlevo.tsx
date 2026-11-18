import { useState } from "react";
import { Icon } from "../../components/Icon";
import { fmtCantidad } from "../../lib/format";
import { textoLlevo, type ProductosLlevados } from "../../lib/repartoRendicion";

/**
 * Lo que llevó el repartidor, por categoría: «Pollos 5 · Bebidas 3 · Porciones 1».
 * Un toque lo despliega al detalle por producto, para contar la bolsa con él.
 * La usan la caja («Llevó») y el propio repartidor («Lo que llevaste»).
 * Sin nada que mostrar, no dibuja nada.
 */
export default function LoQueLlevo({ productos, etiqueta }: { productos: ProductosLlevados; etiqueta: string }) {
  const [abierto, setAbierto] = useState(false);
  const resumen = textoLlevo(productos);
  if (!resumen) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className="flex w-full items-start gap-2 rounded-lg text-left"
      >
        <span className="min-w-0 flex-1 text-[13px] text-texto-2">
          <span className="font-semibold text-texto">{etiqueta}:</span> {resumen}
        </span>
        <span className="mt-0.5 shrink-0 text-texto-3">
          <Icon name={abierto ? "chevronDown" : "chevronRight"} size={16} />
        </span>
      </button>
      {abierto && (
        <ul className="mt-2 space-y-2.5 rounded-xl bg-muted px-3 py-2.5" aria-label={`${etiqueta}, por producto`}>
          {productos.categorias
            .filter((c) => c.unidades > 0)
            .map((c) => (
              <li key={c.nombre}>
                <p className="flex justify-between gap-3 text-[11px] font-bold uppercase tracking-wide text-texto-4">
                  <span className="min-w-0 break-words">{c.nombre}</span>
                  <span className="shrink-0">{fmtCantidad(c.unidades)}</span>
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {c.items.map((i, n) => (
                    <li key={`${n}-${i.nombre}`} className="flex justify-between gap-3 text-[13px] text-texto-2">
                      <span className="min-w-0 break-words">{i.nombre}</span>
                      <span className="shrink-0 font-semibold text-texto">{fmtCantidad(i.cantidad)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
