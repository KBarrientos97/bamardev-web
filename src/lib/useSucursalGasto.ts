import { useState } from "react";
import { usePalabras } from "./academia/usePalabras";
import { useSucursales } from "./useSucursales";

/**
 * La sucursal en los GASTOS (PLAN-SUCURSAL-TOTAL §3 etapa 4, contrato §9.1).
 *
 * Un gasto puede ser de un local o **general del negocio** (`almacenId` nulo:
 * el alquiler de la oficina, el contador). Los dos pedidos de esta pieza salen
 * de ahí, y los comparten Gastos, Gastos automáticos y la pantalla de la
 * farmacia para que no digan cosas distintas:
 *
 * - **filtrar** una lista: «Todas», cada local, o «General del negocio»
 *   (`useFiltroSucursalGasto`);
 * - **cargar** un gasto o una regla: a qué local va, o «General del negocio»
 *   (`useSucursalDelGasto`).
 *
 * La regla de §1 la sigue poniendo `useSucursales`: con un solo local, o con un
 * usuario atado a uno, nada de esto se ve y la pantalla queda como siempre.
 */

/** El valor del `<Select>` del filtro para «General del negocio». */
export const FILTRO_GENERAL = "general";

export const ETIQUETA_GENERAL = "General del negocio";

/**
 * El valor del campo de un gasto NUEVO cuando la organización está mirando
 * «Todas»: no hay un local que sugerir y adivinar el principal cargaba gastos
 * donde no eran, sin avisar. Hay que elegir un local o «General del negocio»
 * antes de guardar.
 */
export const SIN_ELEGIR = "sin-elegir";

/**
 * El filtro de las listas de gastos. Envuelve a `useSucursales` y le suma la
 * cuarta opción, que no es un local sino su ausencia: se manda como
 * `sinSucursal=true` (no como `sucursalId=0`, que se confundiría con «sin
 * filtro»).
 */
export function useFiltroSucursalGasto() {
  const suc = useSucursales();
  const [general, setGeneral] = useState(false);
  // «General» sólo existe para quien ve el selector (organización con 2+
  // locales): el backend se lo ignora al atado, así que no se le pide.
  const sinSucursal = general && suc.elegir;

  return {
    suc,
    /** El local filtrado; null = todas, o «General del negocio» (ver `sinSucursal`). */
    sucursalId: sinSucursal ? null : suc.sucursalId,
    /** true = sólo los gastos que no son de ningún local. */
    sinSucursal,
    /** Para el `<Select>`: `""` todas, `"general"`, o el id del local. */
    valor: sinSucursal ? FILTRO_GENERAL : suc.valorSelect,
    /** Traduce lo que devuelve el `<Select>`. */
    alElegir: (v: string) => {
      if (v === FILTRO_GENERAL) {
        setGeneral(true);
        suc.setSucursalId(null);
      } else {
        setGeneral(false);
        suc.alElegirSelect(v);
      }
    },
  };
}

/** Lo que el formulario necesita saber del gasto o la regla que edita. */
export interface DeQuienEs {
  sucursalId: number | null;
  sucursal: string | null;
}

/**
 * A qué local se le carga un gasto o una regla, en el formulario.
 *
 * - `elegir` (organización con 2+ locales): el campo se muestra. Arranca en el
 *   local que se estaba filtrando; si se venía mirando «General del negocio»
 *   (`sugerirGeneral`), en general; y con el filtro en «Todas» arranca VACÍO
 *   (`SIN_ELEGIR`): no se adivina el principal, y `validar()` no deja guardar
 *   hasta que se elija un local o «General». Al EDITAR arranca en lo que ya
 *   tenía y se puede reasignar.
 * - Sin `elegir` (un local, o usuario atado): no hay campo y se manda lo de
 *   siempre —al editar, lo que ya tenía; al crear, `sugerida`—. El backend le
 *   fuerza su local al atado.
 *
 * `valor` es `""` para «General del negocio». Mandar `null` explícito y no
 * omitir el campo: el backend los trata igual (los dos son «sin local»), pero
 * el PATCH sin el campo se lee como «reasignar a general», así que el cliente
 * siempre dice lo que quiere.
 */
export function useSucursalDelGasto({
  actual,
  sugerida,
  sugerirGeneral = false,
}: {
  /** null = alta. */
  actual: DeQuienEs | null;
  sugerida: number | null;
  sugerirGeneral?: boolean;
}) {
  const suc = useSucursales();
  const pal = usePalabras();
  const elegir = suc.elegir;
  const [tocado, setTocado] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);

  const porDefecto = actual
    ? actual.sucursalId == null
      ? ""
      : String(actual.sucursalId)
    : sugerirGeneral
      ? ""
      : sugerida != null
        ? String(sugerida)
        : elegir
          ? SIN_ELEGIR
          : suc.sugerida
            ? String(suc.sugerida.id)
            : "";
  const valor = tocado ?? porDefecto;
  const falta = elegir && valor === SIN_ELEGIR;
  const mensajeFalta = `Elegí una ${pal.sede} o «${ETIQUETA_GENERAL}».`;

  // Si el local que ya tenía el gasto no está entre los activos (se dio de baja
  // o es un depósito), igual se lista: sin esto el select caería en otro valor
  // y guardar lo reasignaría sin que nadie lo pidiera.
  const opciones = suc.sucursales.map((s) => ({ id: s.id, nombre: s.nombre }));
  if (actual?.sucursalId != null && !opciones.some((o) => o.id === actual.sucursalId)) {
    opciones.push({ id: actual.sucursalId, nombre: actual.sucursal ?? `Local ${actual.sucursalId}` });
  }

  return {
    elegir,
    opciones,
    valor,
    setValor: setTocado,
    /** El campo sigue vacío (`SIN_ELEGIR`): no se puede guardar así. */
    falta,
    /** El aviso bajo el campo: sólo después de intentar guardar sin elegir. */
    errorCampo: falta && intentado ? mensajeFalta : undefined,
    /**
     * Para llamar antes de guardar: el mensaje si falta elegir (y marca el
     * campo), o `null` si se puede seguir.
     */
    validar: (): string | null => {
      if (!falta) return null;
      setIntentado(true);
      return mensajeFalta;
    },
    /** Lo que va en `sucursalId` del body: id, o `null` explícito = general. */
    paraEnviar: (): number | null => {
      if (elegir) return valor === "" || valor === SIN_ELEGIR ? null : Number(valor);
      return actual ? actual.sucursalId : sugerida;
    },
  };
}
