import type { Almacen } from "../../types";

/**
 * Con qué almacén arranca un formulario de inventario (PLAN-SUCURSAL-TOTAL,
 * etapa 3): el de quien carga, y si es de organización (el dueño no pertenece a
 * ninguno), la principal. Antes era el primero de la lista, que viene por
 * nombre: con "Depósito" y "Mostrador" la mercadería se cargaba en el equivocado
 * sin que nadie lo notara. Es la misma regla de `FormMercaderia`.
 *
 * Sólo activos: un almacén dado de baja no recibe movimientos.
 */
export function almacenInicial(
  almacenes: readonly Almacen[],
  sucursalId: number | null | undefined,
): Almacen | undefined {
  const activos = almacenes.filter((a) => a.activo);
  return (
    activos.find((a) => a.id === sucursalId) ??
    activos.find((a) => a.esPrincipal) ??
    activos[0]
  );
}

/**
 * Los almacenes que el usuario puede elegir: todos los activos, o sólo el suyo
 * si es de un local (no mueve mercadería de otro: el backend responde 403).
 */
export function almacenesElegibles(
  almacenes: readonly Almacen[],
  sucursalId: number | null | undefined,
): Almacen[] {
  const activos = almacenes.filter((a) => a.activo);
  return sucursalId == null ? activos : activos.filter((a) => a.id === sucursalId);
}
