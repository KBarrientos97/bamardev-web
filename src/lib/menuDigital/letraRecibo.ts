import type { CSSProperties } from "react";
import type { TamanoLetra } from "../../types/menuDigital";

/**
 * Cuánto se achica cada papel (recibo y comanda) con la letra elegida en
 * Configuración del recibo. "Grande" es el papel como salía hasta el 5-nov:
 * en la térmica del restaurante gastaba rollo de más y se leía más grande que
 * en la pantalla (Kevin, con los tickets impresos en la mano). "Normal", el de
 * fábrica, deja el renglón de un plato en ~11 px, la letra de un ticket de
 * supermercado.
 */
export const ESCALA_LETRA: Record<TamanoLetra, number> = { s: 0.75, m: 0.85, l: 1 };

/** Sin diseño del recibo (un negocio sin pantallas), el papel de siempre. */
export function escalaLetra(tamano: TamanoLetra | null | undefined): number {
  return (tamano && ESCALA_LETRA[tamano]) || 1;
}

/**
 * El `style` del papel con su letra: va en el `article` junto con la clase
 * `papel-letra`, que es la que achica (index.css). Sin escala, nada: el papel
 * de un negocio sin pantallas no cambia.
 */
export function estiloLetra(tamano: TamanoLetra | null | undefined): CSSProperties | undefined {
  const escala = escalaLetra(tamano);
  return escala === 1 ? undefined : ({ "--escala-letra": escala } as CSSProperties);
}
