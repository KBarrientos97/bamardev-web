import { tieneFeature } from "./permisos";
import { esBelleza } from "./rubro";
import type { Feature } from "../types";

/**
 * Cómo se ve la sucursal en una pantalla (PLAN-SUCURSAL-TOTAL §1). Es la
 * pregunta que se hace CADA pantalla; la respuesta sale de `useSucursales`.
 *
 * - `una`: hay un solo local (o rige `esUnLocal`). **No se ve nada nuevo**: ni
 *   selector, ni columna, ni etiqueta.
 * - `asignado`: hay 2+ locales y el usuario es de uno (`usuario.sucursalId`).
 *   Ve y opera sólo su sede: sin selector, sin filtros, sin columna; apenas su
 *   nombre, discreto (`miSede`).
 * - `organizacion`: hay 2+ locales y el usuario es de toda la organización
 *   (`sucursalId == null`). Selector "Todas / una", columna "Sucursal" en las
 *   listas, consolidado y comparativo.
 */
export type ModoSucursal = "una" | "asignado" | "organizacion";

/**
 * Regla 4, **escrita acá y en ningún otro lado**: ¿el negocio opera como de un
 * solo local aunque tenga otras sucursales cargadas?
 *
 * Fuera de belleza y academia, sin "Varios almacenes" (`multi_almacen`, se
 * prende en el panel) el negocio es de un local: de cuando tenía más o de
 * prueba. No hay filtro y se ve el negocio entero; la caja abre en la
 * `sugerida` (la principal). Kevin, 15-oct: con el multisucursal apagado,
 * Reportes dejaba elegir otra sucursal. Igual en la app (`FiltroSucursal`).
 *
 * - Belleza no entra: sus sucursales se cargan desde la agenda y no dependen de
 *   esa feature (una peluquería con dos locales y sólo `agenda` es un caso real).
 * - Una academia tampoco: cada grupo es de una sede (`Grupo.almacenId`) y el
 *   calendario, los cobros y los cercos se arman por sede, con o sin esa
 *   feature (PLAN-ACADEMIAS §10).
 *
 * Falla abierto como el resto: una sesión sin features sigue viendo el filtro.
 */
export function esUnLocal(
  negocio: { tipoNegocio?: string; features?: Feature[] } | null | undefined,
): boolean {
  return (
    !esBelleza(negocio?.tipoNegocio) &&
    negocio?.tipoNegocio !== "ACADEMIA" &&
    !tieneFeature(negocio?.features, "multi_almacen")
  );
}

/**
 * La tabla de §1 como función pura. `locales` es la cantidad de sucursales
 * activas (sin depósitos); **`undefined` = no se sabe** (la lista todavía carga,
 * o una sesión vieja no trae el conteo) y falla cerrado: se trata como un solo
 * local. Es mejor no mostrar una etiqueta que inventar que hay varias.
 */
export function modoDeSucursal(p: {
  asignado: boolean;
  unLocal: boolean;
  locales: number | undefined;
}): ModoSucursal {
  if (p.unLocal || (p.locales ?? 0) < 2) return "una";
  return p.asignado ? "asignado" : "organizacion";
}
