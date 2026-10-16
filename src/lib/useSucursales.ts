import { useState } from "react";
import { api } from "./api";
import { tieneFeature } from "./permisos";
import { esBelleza } from "./rubro";
import { useApi } from "./useApi";
import { useAuth } from "../store/AuthContext";
import type { Almacen } from "../types";

/**
 * El filtro "Todas las sucursales / una" que comparten inventario, insumos y
 * reportes.
 *
 * Existe para que las tres reglas vivan en un solo lugar y no se desincronicen
 * entre pantallas (la auditoría del 15-sep encontró justo eso: Android ofrecía
 * depósitos en reportes y la web no):
 *
 * 1. Aparece recién con **dos o más** sucursales: con una sola no filtra nada,
 *    y un negocio de un local no debería enterarse de que esto existe.
 * 2. Sólo lo ve un usuario de **organización**. Al que pertenece a una sucursal
 *    el backend le fuerza la suya, así que un selector sería mentirle.
 * 3. `null` = todas (el consolidado), que es lo que devuelve el backend cuando
 *    no se manda el parámetro.
 * 4. Fuera de belleza, sin "Varios almacenes" (`multi_almacen`, se prende en el
 *    panel) el negocio es de un local aunque tenga otras sucursales cargadas,
 *    de cuando lo tenía o de prueba: no hay filtro y se ve el negocio entero.
 *    La caja abre en la `sugerida` (la principal). Kevin, 15-oct: con el
 *    multisucursal apagado, Reportes dejaba elegir otra sucursal. Belleza no
 *    entra: sus sucursales se cargan desde la agenda y no dependen de esa
 *    feature (una peluquería con dos locales y sólo `agenda` es un caso real).
 *    Igual en la app (`FiltroSucursal`).
 *
 * @param incluirDepositos por defecto false, porque el filtro se llama
 * "sucursal" y un depósito no vende. Inventario **sí** los incluye: la
 * mercadería entra ahí antes de repartirse a los locales.
 */
export function useSucursales({ incluirDepositos = false } = {}) {
  const { usuario, negocio } = useAuth();
  const [sucursalId, setSucursalId] = useState<number | null>(null);

  const esDeOrganizacion = usuario?.sucursalId == null;
  const almacenes = useApi(
    // El listado BÁSICO: este hook sólo necesita nombres para el selector.
    () => (esDeOrganizacion ? api.getSucursales() : Promise.resolve([] as Almacen[])),
    [esDeOrganizacion],
  );

  const sucursales = (almacenes.datos ?? []).filter(
    (a) => a.activo && (incluirDepositos || a.tipo !== "DEPOSITO"),
  );
  // Regla 4. Falla abierto como el resto: una sesión sin features sigue viendo
  // el filtro. El rubro es el mismo dato que `useAuth().rubro`.
  const unLocal =
    !esBelleza(negocio?.tipoNegocio) && !tieneFeature(negocio?.features, "multi_almacen");
  const elegir = esDeOrganizacion && !unLocal && sucursales.length > 1;

  /** Opciones para `<Chips>`: "Todas" primero y después cada local. */
  const opciones = [
    ["", "Todas las sucursales"] as const,
    ...sucursales.map((a) => [String(a.id), a.nombre] as const),
  ];

  return {
    /** null = todas. Es lo que se manda al backend (o no se manda). */
    sucursalId,
    setSucursalId,
    /** ¿Se muestra el filtro? Falso con un local, o si el usuario no es de organización. */
    elegir,
    sucursales,
    opciones,
    /** Para `<Chips valor=…>`: la cadena vacía representa "todas". */
    valorChip: sucursalId == null ? "" : String(sucursalId),
    /** Traduce lo que devuelve `<Chips>` al id (o null). */
    alElegir: (v: string) => setSucursalId(v === "" ? null : Number(v)),
    /** Nombre del local elegido, para subtítulos. Vacío si son todas. */
    nombre: sucursales.find((a) => a.id === sucursalId)?.nombre ?? "",
    /**
     * Cuál proponer cuando hay que elegir una sí o sí (abrir caja): la
     * principal, y si ninguna lo es, la primera. Es distinto de `sucursalId`,
     * que arranca en null = "todas" y sirve para filtrar.
     */
    sugerida: sucursales.find((a) => a.esPrincipal) ?? sucursales[0],
    /**
     * Para `<Select>`: `""` = todas. Las pantallas que usan un desplegable en
     * vez de chips necesitan el mismo valor pero con el tipo del control.
     */
    valorSelect: sucursalId ?? "",
    /** Traduce lo que devuelve un `<Select>` al id (o null). */
    alElegirSelect: (v: string) => setSucursalId(v === "" ? null : Number(v)),
  };
}
