import { Icon } from "../../components/Icon";
import IconoProducto from "../../components/IconoProducto";
import { Badge } from "../../components/ui";
import { fmtCantidad, fmtMoney, fmtNum } from "../../lib/format";
import type { Producto } from "../../types";
import { controlaStock } from "../pos/useCarrito";

/**
 * Un producto de la carta.
 *
 * Es la misma tarjeta del Punto de Venta: el mesero y la cajera tienen que ver
 * el producto igual, y el stock manda igual en los dos lados — la comanda
 * descuenta inventario cuando la caja cobra la mesa.
 *
 * Tocarla suma uno directo, sin confirmación: en el mostrador el mesero repite
 * lo que el cliente le canta, y pedir una confirmación por producto duplicaría
 * los toques del momento más rápido del turno. Lo que se cargó de más se
 * corrige en el carrito.
 *
 * Tres estados: normal, **en el pedido** (borde verde, fondo verde claro y el
 * stepper visible debajo) y sin stock (apagada y sin click).
 */
export default function TarjetaCarta({
  producto,
  cantidad,
  onAgregar,
  onQuitar,
}: {
  producto: Producto;
  /** Cuánto hay de este producto sumando todas sus líneas. */
  cantidad: number;
  onAgregar: () => void;
  onQuitar: () => void;
}) {
  // Sólo el elaborado no se agota: se prepara al momento. El combo tiene su
  // propio stock (los que armó el local) y se agota como un producto. Antes la
  // carta lo ofrecía siempre, sin decir cuántos quedaban, y como cobrar la
  // mesa deja pasar el negativo, el stock del combo quedaba en rojo sin que
  // nadie lo viera venir (POS-2).
  const controla = controlaStock(producto);
  const agotado = controla && producto.stockTotal <= 0;
  const enPedido = cantidad > 0;
  // El "+" se apaga al llegar a lo que queda, como en la app (que usa la misma
  // tarjeta del POS): avisa que ya no hay para prometer. No es un freno, y
  // tocar la tarjeta sigue sumando, igual que en la app: cobrar la mesa deja
  // pasar el negativo a propósito, porque lo servido no vuelve a la heladera.
  const alTope = controla && cantidad >= producto.stockTotal;

  return (
    <li>
      <div
        className={[
          "flex h-full flex-col rounded-2xl border p-3 transition-shadow",
          enPedido
            ? "border-primary bg-primary-50 shadow-sm"
            : "border-borde bg-white hover:shadow-md",
          agotado ? "opacity-50" : "",
        ].join(" ")}
      >
        <button
          onClick={onAgregar}
          disabled={agotado}
          className="flex flex-1 flex-col text-left disabled:cursor-not-allowed"
        >
          <div className="flex items-start justify-between gap-1.5">
            <IconoProducto
              nombre={producto.nombre}
              icono={producto.icono}
              categoria={producto.categoria?.nombre}
              size={40}
            />
            {agotado && <Badge tono="rojo">Sin stock</Badge>}
            {/* Cuántos quedan siempre, como en el Punto de Venta y en la app:
                antes sólo bajo el mínimo, y el mesero no sabía qué podía
                prometer hasta que se agotaba. Un span y no <Badge>: Badge
                fuerza mayúsculas y "2 DISP." se leía como una sigla. */}
            {!agotado && controla && (
              <span
                className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                  producto.stockTotal <= producto.stockMinimo
                    ? "bg-warning-bg text-warning-text"
                    : "bg-primary-50 text-primary-700"
                }`}
              >
                {fmtCantidad(producto.stockTotal)} disp.
              </span>
            )}
          </div>
          <h3 className="mt-2 line-clamp-2 min-h-[34px] text-[13px] font-bold leading-snug text-texto">
            {producto.nombre}
          </h3>
          <p className="mt-auto pt-2 text-[15px] font-extrabold text-primary-700">
            {fmtMoney(producto.precio)}
          </p>
        </button>

        {/* El stepper sólo existe cuando el producto está en el pedido: hasta
            entonces no hay nada que ajustar y roba alto a la tarjeta. */}
        {enPedido && (
          <div className="mt-2 flex h-9 items-center justify-between rounded-full border border-primary bg-white px-1">
            <button
              onClick={onQuitar}
              aria-label={cantidad === 1 ? "Quitar del pedido" : "Uno menos"}
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                // En la última unidad el "−" se vuelve tacho: avisa que el
                // próximo toque saca el producto del pedido, no que lo baja a
                // cero.
                cantidad === 1
                  ? "text-[#DC2626] hover:bg-[#FEF2F2]"
                  : "text-texto-2 hover:bg-muted"
              }`}
            >
              <Icon name={cantidad === 1 ? "trash" : "minus"} size={15} />
            </button>
            <span className="text-sm font-bold text-texto">{fmtNum(cantidad)}</span>
            <button
              onClick={onAgregar}
              disabled={alTope}
              aria-label="Uno más"
              title={alTope ? "No quedan más en la carta" : undefined}
              className="flex h-9 w-9 items-center justify-center rounded-full text-primary-700 hover:bg-primary-50 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Icon name="plus" size={15} />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
