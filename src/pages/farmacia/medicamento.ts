import { contiene } from "../../lib/texto";
import type { CondicionVenta, Producto } from "../../types";

/**
 * Lo que un medicamento significa para las pantallas del rubro: cómo se
 * anuncia su condición de venta, cuándo hay que frenar antes de venderlo y qué
 * texto lo identifica cuando el nombre no alcanza.
 *
 * Está en un solo lugar para que todas las pantallas digan lo mismo: si
 * "receta valorada" fuera rojo en una y ámbar en otra, el color dejaría de
 * significar algo. Las piezas visuales que lo usan están en `piezas.tsx`.
 */

export const CONDICION: Record<
  CondicionVenta,
  { texto: string; largo: string; tono: "azul" | "amarillo" | "rojo" } | null
> = {
  // La venta libre no lleva señal: lo que tiene que saltar a la vista es lo
  // que exige receta. Marcarlo todo es no marcar nada.
  LIBRE: null,
  RECETA_MEDICA: { texto: "Receta", largo: "Receta médica", tono: "azul" },
  RECETA_ARCHIVADA: {
    texto: "Receta archivada",
    largo: "Receta archivada (psicotrópico)",
    tono: "amarillo",
  },
  RECETA_VALORADA: {
    texto: "Receta valorada",
    largo: "Receta valorada (estupefaciente)",
    tono: "rojo",
  },
};

/**
 * Si hay que detenerse a pedir algo antes de venderlo.
 *
 * Un controlado y una receta valorada o archivada **no se despachan y ya**: la
 * farmacia se queda con el papel y lo asienta en el libro. Por eso el punto de
 * venta para y pregunta, en vez de sumarlo al carrito como una gaseosa. Una
 * receta médica común se muestra pero no frena: alcanza con que quien atiende
 * la vea.
 */
export function pideConfirmacion(p: Producto): boolean {
  return (
    p.controlado ||
    p.condicionVenta === "RECETA_VALORADA" ||
    p.condicionVenta === "RECETA_ARCHIVADA"
  );
}

/**
 * La línea que distingue dos artículos que se llaman casi igual: la droga, el
 * laboratorio y la forma. Es lo que separa "Paracetamol BAGÓ" de "Paracetamol
 * IFA" cuando los dos se llaman "Paracetamol 500 mg".
 */
export function detalleDe(p: Producto): string {
  return [p.principioActivo, p.laboratorio, p.formaFarmaceutica]
    .filter(Boolean)
    .join(" · ");
}

/**
 * La concentración, sólo si el nombre no la trae ya. Casi todos los nombres
 * comerciales la incluyen ("Paracetamol 500 mg") y repetirla al lado quedaba
 * como un error de dedo.
 */
export function concentracionAparte(p: Producto): string | null {
  if (!p.concentracion || contiene(p.nombre, p.concentracion)) return null;
  return p.concentracion;
}
