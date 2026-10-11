import { useState } from "react";
import { api } from "./api";
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
 *
 * @param incluirDepositos por defecto false, porque el filtro se llama
 * "sucursal" y un depósito no vende. Inventario **sí** los incluye: la
 * mercadería entra ahí antes de repartirse a los locales.
 */
export function useSucursales({ incluirDepositos = false } = {}) {
  const { usuario } = useAuth();
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
  const elegir = esDeOrganizacion && sucursales.length > 1;

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
