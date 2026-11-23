import { tokenStore } from "../../api";
import { useApi } from "../../useApi";
import { apiSeguimiento } from "./api";
import type { CatalogoSeguimiento } from "./tipos";

/**
 * El catálogo del seguimiento (sugerencias y ajustes del negocio) se pide una
 * vez por sesión: lo comparten la lista, los pagos y la hoja. Va atado al
 * token porque `ajustes.puedeCambiarlos` es de la persona que entró: otra
 * sesión en la misma pestaña lo vuelve a pedir. Si falla se olvida; cambiar los
 * ajustes también lo olvida (`olvidarCatalogoSeguimiento`).
 */
let enVuelo: { token: string; promesa: Promise<CatalogoSeguimiento> } | null = null;

export function pedirCatalogoSeguimiento(): Promise<CatalogoSeguimiento> {
  const token = tokenStore.get() ?? "";
  if (!enVuelo || enVuelo.token !== token) {
    const promesa = apiSeguimiento.catalogo().catch((e: unknown) => {
      if (enVuelo?.promesa === promesa) enVuelo = null;
      throw e;
    });
    enVuelo = { token, promesa };
  }
  return enVuelo.promesa;
}

export function olvidarCatalogoSeguimiento() {
  enVuelo = null;
}

export function useCatalogoSeguimiento() {
  return useApi(pedirCatalogoSeguimiento, []);
}
