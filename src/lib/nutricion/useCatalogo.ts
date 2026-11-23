import { useApi } from "../useApi";
import { apiNutricion } from "./api";
import type { Catalogo } from "./tipos";

/**
 * El catálogo (enfermedades y tablas de grados) se pide una vez por pestaña:
 * es el mismo para todos los negocios y no cambia mientras se trabaja. Si la
 * llamada falla se olvida, y la próxima pantalla lo vuelve a pedir.
 */
let enVuelo: Promise<Catalogo> | null = null;

export function pedirCatalogo(): Promise<Catalogo> {
  if (!enVuelo) {
    enVuelo = apiNutricion.catalogo().catch((e: unknown) => {
      enVuelo = null;
      throw e;
    });
  }
  return enVuelo;
}

export function useCatalogo() {
  return useApi(pedirCatalogo, []);
}
