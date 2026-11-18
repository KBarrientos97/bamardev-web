import type { ConteoDeCategoria } from "../../lib/conteo";
import { fmtCantidad } from "../../lib/format";

/**
 * «45 u.»: cuántos vasos de ese tamaño se pueden cargar todavía (conteo por
 * categoría, 18-nov). Es lo que queda en el local menos lo que el carrito ya
 * lleva de ese tamaño, de cualquier producto: al cargar 3 «Nutella C» todas
 * las tarjetas C bajan 3. Así la cajera ve cuántos van sin ir al cierre, y
 * avisa a tiempo para que repongan.
 *
 * La misma forma y tamaño que «N disp.» de la tarjeta (un span y no <Badge>,
 * que fuerza mayúsculas), en tono de aviso cuando quedan pocos. Nunca se parte
 * en dos renglones ni se achica: si no entra al lado de otra cosa, baja entero.
 */
export default function RotuloConteo({ conteo }: { conteo: ConteoDeCategoria }) {
  return (
    <span
      title={conteo.etiqueta}
      aria-label={conteo.etiqueta}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-bold ${
        conteo.poco ? "bg-warning-bg text-warning-text" : "bg-primary-50 text-primary-700"
      }`}
    >
      {fmtCantidad(conteo.libre)} u.
    </span>
  );
}
