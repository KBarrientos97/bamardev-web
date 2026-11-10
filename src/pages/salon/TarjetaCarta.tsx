import { Icon } from "../../components/Icon";
import { fmtCantidad, fmtMoney, fmtNum } from "../../lib/format";
import type { Producto } from "../../types";
import { controlaStock } from "../pos/useCarrito";

/**
 * Un producto de la carta del mesero: un botón chico, sin ícono.
 *
 * Hasta el 10-nov era la tarjeta del Punto de Venta (ícono grande, precio
 * abajo, stepper debajo) y en un celular entraban 6 por pantalla. El mesero
 * pide de memoria lo que el cliente le canta: el ícono no le ayuda a encontrar
 * nada y ocupaba el lugar de dos productos. Así entran unos 16, en 2 columnas
 * porque en un celular 3 dejaban los nombres ilegibles (decisión del dueño,
 * UX-MESEROS §2). La caja sigue con su tarjeta con ícono.
 *
 * Tocarla suma uno directo, sin confirmación: en el mostrador el mesero repite
 * lo que el cliente le canta, y pedir una confirmación por producto duplicaría
 * los toques del momento más rápido del turno. El "−" aparece sólo sobre lo ya
 * pedido; las cantidades finas y las indicaciones van en el carrito.
 *
 * Tres estados: normal, **en el pedido** (borde y fondo del color del negocio,
 * la cantidad en la esquina) y sin stock (apagada y sin click).
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
  // Lo que queda para prometer descuenta lo que ya está en ESTE pedido: el
  // stock de la carta ya resta lo de otras mesas, pero no lo que el mesero
  // tiene cargado y sin enviar, y con 2 Paceñas en el carrito seguía diciendo
  // "4 disp." (UX-MESEROS §2). No frena: cobrar la mesa deja pasar el negativo
  // a propósito, porque lo servido no vuelve a la heladera.
  const quedan = producto.stockTotal - cantidad;
  const pocas = quedan <= producto.stockMinimo;

  return (
    <li className="relative">
      <button
        onClick={onAgregar}
        disabled={agotado}
        title={controla && quedan <= 0 && !agotado ? "No quedan más en la carta" : undefined}
        className={[
          "flex min-h-[68px] w-full flex-col justify-between rounded-xl border-[1.5px] px-3 py-2 text-left transition-colors disabled:cursor-not-allowed",
          enPedido
            ? "border-primary-boton bg-primary-50"
            : "border-borde bg-white hover:bg-muted",
          agotado ? "opacity-50" : "",
        ].join(" ")}
      >
        {/* El margen derecho deja lugar a la cantidad de la esquina. */}
        <span className="line-clamp-2 pr-6 text-[15px] font-bold leading-tight text-texto">
          {producto.nombre}
        </span>
        <span className={`mt-1 text-[13px] font-semibold text-texto-2 ${enPedido ? "pr-10" : ""}`}>
          {fmtMoney(producto.precio)}
          {agotado ? (
            <span className="font-bold text-danger-text"> · Sin stock</span>
          ) : (
            controla && (
              // Cuántos quedan siempre, como en el Punto de Venta: antes sólo
              // bajo el mínimo, y el mesero no sabía qué podía prometer hasta
              // que se agotaba.
              <span className={`whitespace-nowrap ${pocas ? "font-bold text-warning-text" : "text-texto-3"}`}>
                {" "}· quedan {fmtCantidad(Math.max(0, quedan))}
              </span>
            )
          )}
        </span>
      </button>

      {enPedido && (
        <>
          <span className="pointer-events-none absolute -right-1 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-primary-boton px-1.5 text-xs font-extrabold text-white">
            {fmtNum(cantidad)}
          </span>
          <button
            onClick={onQuitar}
            aria-label={cantidad === 1 ? "Quitar del pedido" : "Uno menos"}
            className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full border border-primary-200 bg-white text-primary-700 hover:bg-primary-50"
          >
            {/* En la última unidad el "−" se vuelve tacho: avisa que el
                próximo toque saca el producto del pedido, no que lo baja a
                cero. */}
            <Icon name={cantidad === 1 ? "trash" : "minus"} size={16} />
          </button>
        </>
      )}
    </li>
  );
}
