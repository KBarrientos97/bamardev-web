import { conMayuscula, termino } from "./rubro";
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

/**
 * La palabra del rubro para el local en un papel o un rótulo: «Sucursal», y
 * «Sede» en un instituto (o la que el negocio eligió en su perfil). Con el rubro
 * de siempre es exactamente «Sucursal», así el papel de un solo local no cambia.
 */
export function useRotuloSucursal(): string {
  const { rubro, vocabulario } = useAuth();
  return conMayuscula(termino(rubro, "sucursal", vocabulario));
}

/** El local de un papel (la venta, la caja), sólo si corresponde mostrarlo; si no, `null`. */
export function useLocalDelPapel<T extends { nombre: string }>(local: T | null | undefined): T | null {
  const hayVarias = useHayVariasSucursales();
  return hayVarias && local?.nombre ? local : null;
}
