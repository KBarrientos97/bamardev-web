import { esUnLocal, modoDeSucursal } from "./useSucursales";
import { useAuth } from "../store/AuthContext";

/**
 * ¿Hay 2+ sucursales y rige el multisucursal? Para los papeles (recibo, comanda,
 * cierre de caja, mensajes al cliente): ahí el nombre del local sale **sólo**
 * cuando hay varios, y con uno el papel queda idéntico, byte a byte
 * (PLAN-SUCURSAL-TOTAL §1).
 *
 * Sale de la sesión, sin tocar la red: un recibo no puede esperar la lista de
 * locales ni fallar por ella. Usa la regla de `useSucursales` (`modoDeSucursal` +
 * `esUnLocal`) y no una copia; el conteo es el de `negocio.sucursalesActivas`
 * del login (que `AuthContext` renueva para quien es de un local). `undefined`
 * —sesión vieja— cuenta como un solo local.
 */
export function useHayVariasSucursales(): boolean {
  const { usuario, negocio } = useAuth();
  return (
    modoDeSucursal({
      asignado: usuario?.sucursalId != null,
      unLocal: esUnLocal(negocio),
      locales: negocio?.sucursalesActivas,
    }) !== "una"
  );
}

/** El local de un papel (la venta, la caja), sólo si corresponde mostrarlo; si no, `null`. */
export function useLocalDelPapel<T extends { nombre: string }>(local: T | null | undefined): T | null {
  const hayVarias = useHayVariasSucursales();
  return hayVarias && local?.nombre ? local : null;
}
