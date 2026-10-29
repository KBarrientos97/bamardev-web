import { Chips } from "../../components/filtros";
import { useSucursales } from "../useSucursales";
import { usePalabras } from "./usePalabras";

/**
 * El filtro de sede: sólo para quien ve la organización y sólo con 2 o más
 * sedes (PLAN-ACADEMIAS §10.3). La secretaría ve siempre la suya, sin
 * selector. `null` = todas.
 */
export function useFiltroSede() {
  const s = useSucursales();
  const { sedes } = usePalabras();
  return {
    ...s,
    /** Más de una sede entre las del negocio: los chips de sede tienen sentido. */
    variasSedes: s.sucursales.length > 1,
    selector: s.elegir ? (
      <Chips
        titulo="Sede"
        valor={s.valorChip}
        opciones={[["", `Todas las ${sedes}`] as const, ...s.sucursales.map((a) => [String(a.id), a.nombre] as const)]}
        onChange={s.alElegir}
      />
    ) : null,
  };
}
