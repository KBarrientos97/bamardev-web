import type { ReactNode } from "react";
import { Icon } from "../../components/Icon";
import { fmtCantidad, fmtMoney } from "../../lib/format";
import { useCoincideMedia } from "../../lib/useCoincideMedia";

/** Un renglón de lo que se cobra: lo que se ve, ya con su precio de esta venta. */
export interface LineaDelCobro {
  clave: string | number;
  nombre: string;
  cantidad: number;
  /** Precio por unidad. */
  precio: number;
}

/**
 * El cobro en la computadora (27-oct): lo que se cobra a la izquierda y el
 * cobro en una tarjeta de 400 px a la derecha, igual que "Cobrar a estudiante".
 *
 * Antes el cobro ocupaba la pantalla entera en dos columnas: el total y los
 * botones arriba a la izquierda, el efectivo arriba a la derecha y "Confirmar
 * cobro" en una barra pegada al borde de abajo, con media pantalla vacía en
 * el medio. Kevin lo vio raro al cobrar en el Punto de venta del billar, al
 * lado del cobro de una cuenta del billar, que es un cuadro compacto con la
 * lista de lo que se cobra y el botón al pie.
 *
 * El cobro queda SIEMPRE en el mismo lugar del árbol: lo que cambia con la
 * medida son las clases y el detalle que se suma al lado. Así, achicar la
 * ventana en medio de un cobro no borra el medio de pago ni el efectivo ya
 * tecleado. En el celular y la tablet en vertical se ve como siempre.
 */
export function CobroEnLaCompu({
  lineas,
  total,
  children,
}: {
  lineas: LineaDelCobro[];
  /** Lo que se cobra: si es menos que la suma de los renglones, la diferencia son descuentos. */
  total: number;
  /** La `PantallaCobro`. */
  children: ReactNode;
}) {
  // Sin `matchMedia` (los tests) responde celular: el cobro de siempre.
  const ancha = useCoincideMedia("(min-width: 1024px)");
  return (
    <div className={ancha ? "h-full overflow-y-auto" : "h-full"}>
      <div className={ancha ? "mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_400px] items-start gap-6 p-8" : "h-full"}>
        {ancha && <DetalleDelCobro lineas={lineas} total={total} />}
        {/* Un panel que nunca pasa del alto de la pantalla: lo que no entra
            (el QR) scrollea adentro y "Confirmar cobro" queda a la vista. */}
        <aside
          aria-label={ancha ? "Cobro" : undefined}
          className={ancha ? "card sticky top-8 flex max-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden" : "h-full"}
        >
          {children}
        </aside>
      </div>
    </div>
  );
}

function DetalleDelCobro({ lineas, total }: { lineas: LineaDelCobro[]; total: number }) {
  const unidades = lineas.reduce((a, l) => a + l.cantidad, 0);
  const subtotal = Math.round(lineas.reduce((a, l) => a + l.precio * l.cantidad, 0) * 100) / 100;
  // Los descuentos (cupón, promoción) no tienen renglón propio acá: el total
  // ya los trae y la diferencia se dice entera, para que la lista cuadre.
  const descuento = Math.round((subtotal - total) * 100) / 100;
  return (
    <section aria-label="Lo que se cobra" className="card min-w-0">
      <header className="flex items-center gap-2 border-b border-borde-soft px-5 py-4">
        <Icon name="cart" size={19} />
        <h2 className="text-[15px] font-bold text-texto">
          Lo que se cobra
          {unidades > 0 && (
            <span className="ml-1.5 font-normal text-texto-3">
              · {fmtCantidad(unidades)} {unidades === 1 ? "ítem" : "ítems"}
            </span>
          )}
        </h2>
      </header>
      {lineas.length > 0 && (
        <ul className="divide-y divide-borde-soft px-5">
          {lineas.map((l) => (
            <li key={l.clave} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-texto">{l.nombre}</p>
                <p className="text-[13px] text-texto-3">
                  {fmtCantidad(l.cantidad)} × {fmtMoney(l.precio)}
                </p>
              </div>
              <p className="shrink-0 font-bold tabular-nums text-texto">{fmtMoney(l.precio * l.cantidad)}</p>
            </li>
          ))}
        </ul>
      )}
      <dl className="space-y-1 border-t border-borde-soft px-5 py-4 text-sm">
        {descuento > 0.005 && (
          <>
            <div className="flex justify-between text-texto-2">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{fmtMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-texto-2">
              <dt>Descuentos</dt>
              <dd className="tabular-nums">− {fmtMoney(descuento)}</dd>
            </div>
          </>
        )}
        <div className="flex justify-between text-lg font-extrabold text-texto">
          <dt>Total</dt>
          <dd className="tabular-nums">{fmtMoney(total)}</dd>
        </div>
      </dl>
    </section>
  );
}
