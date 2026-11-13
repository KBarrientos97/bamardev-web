import { createContext } from "react";
import type { Almacen } from "../types";

/**
 * La lista de locales que comparten todas las llamadas a `useSucursales` de una
 * misma sesión (PLAN-SUCURSAL-TOTAL §3, etapa 1). Antes cada pantalla hacía su
 * propio `GET /almacenes/mias`: Reportes, EstadoResultado y NotaSucursal, por
 * ejemplo, pedían lo mismo tres veces.
 */
export interface FuenteSucursales {
  /**
   * La lista de la sesión `clave`. Si ya hay una pedida hace menos del TTL (o
   * todavía en vuelo) la devuelve en vez de volver a pedirla; una clave
   * distinta (otro usuario u otro negocio) descarta la anterior.
   */
  obtener(clave: string): Promise<Almacen[]>;
  /** Olvida lo guardado: tras crear, editar o desactivar un local. */
  invalidar(): void;
}

/**
 * Cuánto vale la lista guardada. Corto a propósito: si el dueño crea un local
 * en otra pestaña, el selector lo ve en menos de un minuto sin recargar.
 */
export const VIDA_LISTA_MS = 60_000;

/**
 * Arma la fuente. `pedir` hace la llamada real y `ahora` se inyecta para
 * poder probar el vencimiento sin esperar.
 *
 * Una promesa que **falla no se guarda**: un corte de red momentáneo no puede
 * dejar a la sesión sin selector hasta que venza el TTL.
 */
export function crearFuenteSucursales(
  pedir: () => Promise<Almacen[]>,
  ahora: () => number = Date.now,
): FuenteSucursales {
  let guardada: { clave: string; desde: number; promesa: Promise<Almacen[]> } | null = null;
  return {
    obtener(clave) {
      if (guardada && guardada.clave === clave && ahora() - guardada.desde < VIDA_LISTA_MS) {
        return guardada.promesa;
      }
      const promesa = pedir();
      const entrada = { clave, desde: ahora(), promesa };
      guardada = entrada;
      promesa.catch(() => {
        if (guardada === entrada) guardada = null;
      });
      return promesa;
    },
    invalidar() {
      guardada = null;
    },
  };
}

/**
 * `null` = no hay proveedor (un test, o una pantalla fuera de la sesión): el
 * hook pide por su cuenta, como antes. Es lo que mantiene a los tests que
 * cambian lo que devuelve `api.getSucursales` entre un caso y otro.
 */
export const FuenteSucursalesCtx = createContext<FuenteSucursales | null>(null);
