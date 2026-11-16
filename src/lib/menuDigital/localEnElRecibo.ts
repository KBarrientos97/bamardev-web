import type { AjustesRecibo } from "../../types/menuDigital";
import { useLocalDelPapel } from "../useHayVariasSucursales";

/**
 * Dónde va el local en el recibo. Es UNA regla para el papel de la caja
 * (`PantallaRecibo`, con el local de la venta) y para la vista previa de
 * «Ticket y recibo» (con la sucursal de `GET /pantallas/recibo`): la vista
 * previa dibuja lo que sale al vender.
 *
 * - `sede`: el local, sólo con 2+ sucursales (`useLocalDelPapel`, el criterio
 *   de siempre). Pone su dirección y su teléfono en la cabecera en lugar de los
 *   del negocio. Con un solo local, `null`: el papel de siempre.
 * - `arriba`: con «Sucursal» prendida (16-nov), el local va en la cabecera
 *   debajo del nombre del negocio, también con un solo local.
 * - `fila`: la fila «Sucursal: X» de los datos, con 2+ sucursales y sólo si no
 *   va ya arriba: no se imprime dos veces.
 *
 * Sin local (una venta vieja o sin internet, o un backend que no manda la
 * sucursal de la vista previa) los tres son `null` y no se dibuja nada.
 */
export function useLocalEnElRecibo<T extends { nombre: string }>(
  r: Pick<AjustesRecibo, "sucursal"> | null | undefined,
  local: T | null | undefined,
): { sede: T | null; arriba: T | null; fila: T | null } {
  const sede = useLocalDelPapel(local);
  const arriba = r?.sucursal === true && local?.nombre?.trim() ? local : null;
  return { sede, arriba, fila: arriba ? null : sede };
}
