import { colorDeCategoria, iconoPorLlave, inicialesDe } from "../lib/iconosArticulo";

/**
 * La cara de un producto: su ícono elegido o, si no tiene, un monograma con las
 * iniciales sobre el color de su categoría.
 *
 * Vive en un solo lugar porque lo usan el POS, el listado de Artículos y el
 * detalle: si cada pantalla lo resolviera por su cuenta, el mismo producto se
 * vería distinto según dónde se lo mire. Mismo criterio que `ProductoPosAdapter`
 * en la app.
 */
export default function IconoProducto({
  nombre,
  icono,
  categoria,
  size = 40,
  className = "",
}: {
  nombre: string;
  /** Llave del catálogo de íconos; null o desconocida cae al monograma. */
  icono?: string | null;
  /** Nombre de la categoría: decide el color del monograma. */
  categoria?: string | null;
  size?: number;
  className?: string;
}) {
  const elegido = iconoPorLlave(icono);
  const lado = { width: size, height: size };

  if (elegido) {
    return (
      <img
        src={elegido.src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        // `contain` y no `cover`: son fotos de producto con fondo transparente,
        // recortarlas les come el borde.
        className={`shrink-0 rounded-xl object-contain ${className}`}
        style={lado}
      />
    );
  }

  const { bg, fg } = colorDeCategoria(categoria);
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-xl font-bold ${className}`}
      style={{ ...lado, background: bg, color: fg, fontSize: Math.round(size * 0.36) }}
    >
      {inicialesDe(nombre)}
    </span>
  );
}
