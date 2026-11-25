import { useCallback, useRef } from "react";
import { tokenStore } from "../../api";
import { useApi } from "../../useApi";
import { apiSeguimiento } from "./api";
import type { CatalogoSeguimiento, ProductoSeguimiento } from "./tipos";

/**
 * El catálogo del seguimiento (sugerencias y ajustes del negocio) se pide una
 * vez por sesión: lo comparten la lista, los pagos y la hoja. Va atado al
 * token porque `ajustes.puedeCambiarlos` es de la persona que entró: otra
 * sesión en la misma pestaña lo vuelve a pedir. Si falla se olvida; cambiar los
 * ajustes o la lista de tratamientos también lo olvida (`olvidarCatalogoSeguimiento`).
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

/**
 * El catálogo con la lista del negocio que devolvió una escritura (§9.1): los
 * botones son los que no están ocultos, en el orden de la lista; los ocultos
 * van aparte (siguen valiendo para leer los escalones).
 */
export function catalogoConLista(catalogo: CatalogoSeguimiento, productos: ProductoSeguimiento[]): CatalogoSeguimiento {
  const sugerido = ({ id, nombre, deFabrica, pasosMg, presentaciones }: ProductoSeguimiento) => ({ id, nombre, deFabrica, pasosMg, presentaciones });
  return {
    ...catalogo,
    tratamientos: productos.filter((p) => !p.oculto).map(sugerido),
    ocultos: productos.filter((p) => p.oculto).map(sugerido),
  };
}

export function useCatalogoSeguimiento() {
  const catalogo = useApi(pedirCatalogoSeguimiento, []);
  const { datos, setDatos } = catalogo;
  const vuelta = useRef(0);
  /**
   * Se cambió la lista de tratamientos (§9.2): los botones salen al toque de
   * la lista que devolvió el servidor y el catálogo se vuelve a pedir por
   * detrás. Si eso falla queda lo de la lista: la pantalla no se va a un error
   * (ni se pierde lo escrito en la hoja que está abierta).
   */
  const listaCambiada = useCallback(
    (productos: ProductoSeguimiento[]) => {
      const mia = ++vuelta.current;
      if (datos) setDatos(catalogoConLista(datos, productos));
      olvidarCatalogoSeguimiento();
      pedirCatalogoSeguimiento().then(
        (nuevo) => {
          if (mia === vuelta.current) setDatos(nuevo);
        },
        () => {},
      );
    },
    [datos, setDatos],
  );
  return { ...catalogo, listaCambiada };
}
