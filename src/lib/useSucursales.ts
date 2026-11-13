import { useContext, useState } from "react";
import { api } from "./api";
import { tieneFeature } from "./permisos";
import { esBelleza, termino } from "./rubro";
import { FuenteSucursalesCtx } from "./sucursalesCompartidas";
import { useApi } from "./useApi";
import { useAuth } from "../store/AuthContext";
import type { Almacen, Feature } from "../types";

/**
 * Cómo se ve la sucursal en una pantalla (PLAN-SUCURSAL-TOTAL §1). Es la
 * pregunta que se hace CADA pantalla; la respuesta sale de `useSucursales`.
 *
 * - `una`: hay un solo local (o rige `esUnLocal`). **No se ve nada nuevo**: ni
 *   selector, ni columna, ni etiqueta.
 * - `asignado`: hay 2+ locales y el usuario es de uno (`usuario.sucursalId`).
 *   Ve y opera sólo su sede: sin selector, sin filtros, sin columna; apenas su
 *   nombre, discreto (`miSede`).
 * - `organizacion`: hay 2+ locales y el usuario es de toda la organización
 *   (`sucursalId == null`). Selector "Todas / una", columna "Sucursal" en las
 *   listas, consolidado y comparativo.
 */
export type ModoSucursal = "una" | "asignado" | "organizacion";

/**
 * Regla 4, **escrita acá y en ningún otro lado**: ¿el negocio opera como de un
 * solo local aunque tenga otras sucursales cargadas?
 *
 * Fuera de belleza y academia, sin "Varios almacenes" (`multi_almacen`, se
 * prende en el panel) el negocio es de un local: de cuando tenía más o de
 * prueba. No hay filtro y se ve el negocio entero; la caja abre en la
 * `sugerida` (la principal). Kevin, 15-oct: con el multisucursal apagado,
 * Reportes dejaba elegir otra sucursal. Igual en la app (`FiltroSucursal`).
 *
 * - Belleza no entra: sus sucursales se cargan desde la agenda y no dependen de
 *   esa feature (una peluquería con dos locales y sólo `agenda` es un caso real).
 * - Una academia tampoco: cada grupo es de una sede (`Grupo.almacenId`) y el
 *   calendario, los cobros y los cercos se arman por sede, con o sin esa
 *   feature (PLAN-ACADEMIAS §10).
 *
 * Falla abierto como el resto: una sesión sin features sigue viendo el filtro.
 */
export function esUnLocal(
  negocio: { tipoNegocio?: string; features?: Feature[] } | null | undefined,
): boolean {
  return (
    !esBelleza(negocio?.tipoNegocio) &&
    negocio?.tipoNegocio !== "ACADEMIA" &&
    !tieneFeature(negocio?.features, "multi_almacen")
  );
}

/**
 * La tabla de §1 como función pura. `locales` es la cantidad de sucursales
 * activas (sin depósitos); **`undefined` = no se sabe** (la lista todavía carga,
 * o una sesión vieja no trae el conteo) y falla cerrado: se trata como un solo
 * local. Es mejor no mostrar una etiqueta que inventar que hay varias.
 */
export function modoDeSucursal(p: {
  asignado: boolean;
  unLocal: boolean;
  locales: number | undefined;
}): ModoSucursal {
  if (p.unLocal || (p.locales ?? 0) < 2) return "una";
  return p.asignado ? "asignado" : "organizacion";
}

/**
 * ¿Hay más de una sucursal distinta entre las filas? Es lo que decide si una
 * lista muestra la columna o el badge "Sucursal" (a quien es de organización):
 * si todas las filas son del mismo local, repetirlo en cada una es ruido.
 *
 * Las filas sin sucursal (dato viejo, "general del negocio") **no cuentan como
 * una sucursal más**, salvo que se pase `contarSinSucursal`: una sola sucursal
 * más filas viejas sin local sigue siendo "un solo local".
 *
 * Se combina con el modo de la pantalla: `suc.mostrarColumna(filas, clave)` ya
 * lo hace (organización + esto).
 */
export function hayVariasEntre<T>(
  filas: readonly T[] | null | undefined,
  clave: (fila: T) => number | string | null | undefined,
  contarSinSucursal = false,
): boolean {
  const vistas = new Set<number | string | null>();
  for (const fila of filas ?? []) {
    const k = clave(fila);
    if (k == null) {
      if (!contarSinSucursal) continue;
      vistas.add(null);
    } else {
      vistas.add(k);
    }
    if (vistas.size > 1) return true;
  }
  return false;
}

/**
 * Sólo el nombre de la sede del usuario ASIGNADO, para el shell (cabecera,
 * menú). No pide nada a la red: sale de la sesión. `null` = no hay nada que
 * mostrar (un solo local, usuario de organización, o sesión vieja sin el
 * conteo). Usar esto —y no `useSucursales`— donde no hace falta la lista.
 */
export function useSedeAsignada(): string | null {
  const { usuario, negocio } = useAuth();
  const modo = modoDeSucursal({
    asignado: usuario?.sucursalId != null,
    unLocal: esUnLocal(negocio),
    locales: negocio?.sucursalesActivas,
  });
  return modo === "asignado" ? (usuario?.sucursal ?? null) : null;
}

/**
 * La sucursal en la web: el filtro "Todas / una" y el modo de la pantalla.
 *
 * Existe para que las reglas vivan en un solo lugar y no se desincronicen
 * entre pantallas (la auditoría del 15-sep encontró justo eso: Android ofrecía
 * depósitos en reportes y la web no). **No copiar la regla**: preguntar acá.
 *
 * 1. Aparece recién con **dos o más** sucursales: con una sola no filtra nada,
 *    y un negocio de un local no debería enterarse de que esto existe.
 * 2. Sólo lo ve un usuario de **organización**. Al que pertenece a una sucursal
 *    el backend le fuerza la suya, así que un selector sería mentirle. A él, con
 *    2+ locales, sólo se le muestra el nombre de su sede (`miSede`).
 * 3. `null` = todas (el consolidado), que es lo que devuelve el backend cuando
 *    no se manda el parámetro.
 * 4. Un local aunque haya más cargados: ver `esUnLocal`.
 *
 * El modo (`una` / `asignado` / `organizacion`) y `hayVarias` ordenan lo que
 * cada pantalla muestra; la tabla completa está en `ModoSucursal`.
 *
 * La lista de locales se pide una vez por sesión y la comparten todas las
 * llamadas (`SucursalesProvider`); un usuario asignado no la pide: no puede
 * listarlos y sabe cuántos hay por `negocio.sucursalesActivas`.
 *
 * @param incluirDepositos por defecto false, porque el filtro se llama
 * "sucursal" y un depósito no vende. Inventario **sí** los incluye: la
 * mercadería entra ahí antes de repartirse a los locales. No cambia `modo` ni
 * `hayVarias`: cuentan sólo las sucursales.
 */
export function useSucursales({ incluirDepositos = false } = {}) {
  const { usuario, negocio, rubro, vocabulario } = useAuth();
  const fuente = useContext(FuenteSucursalesCtx);
  const [sucursalId, setSucursalId] = useState<number | null>(null);

  // `== null`, no `=== null`: una sesión vieja trae `undefined` y es de organización.
  const esDeOrganizacion = usuario?.sucursalId == null;
  // Para que la lista compartida no cruce sesiones: otro usuario u otro negocio
  // es otra clave.
  const clave = `${negocio?.id ?? ""}:${usuario?.id ?? ""}`;
  const almacenes = useApi(
    // El listado BÁSICO: este hook sólo necesita nombres para el selector.
    () =>
      esDeOrganizacion
        ? fuente
          ? fuente.obtener(clave)
          : api.getSucursales()
        : Promise.resolve([] as Almacen[]),
    [esDeOrganizacion, clave, fuente],
  );

  const sucursales = (almacenes.datos ?? []).filter(
    (a) => a.activo && (incluirDepositos || a.tipo !== "DEPOSITO"),
  );
  const unLocal = esUnLocal(negocio);
  const elegir = esDeOrganizacion && !unLocal && sucursales.length > 1;

  // El modo cuenta sólo sucursales (no depósitos), sea cual sea `incluirDepositos`.
  const locales = esDeOrganizacion
    ? almacenes.datos
      ? almacenes.datos.filter((a) => a.activo && a.tipo !== "DEPOSITO").length
      : undefined
    : negocio?.sucursalesActivas;
  const modo = modoDeSucursal({ asignado: !esDeOrganizacion, unLocal, locales });
  const miSede = modo === "asignado" ? (usuario?.sucursal ?? null) : null;
  const nombre = sucursales.find((a) => a.id === sucursalId)?.nombre ?? "";

  // «Sede» en el instituto, «sucursal» en los demás rubros (Lista 2 #9).
  const todas = `Todas las ${termino(rubro, "sucursales", vocabulario)}`;
  /** Opciones para `<Chips>`: "Todas" primero y después cada local. */
  const opciones = [
    ["", todas] as const,
    ...sucursales.map((a) => [String(a.id), a.nombre] as const),
  ];

  return {
    /** null = todas. Es lo que se manda al backend (o no se manda). */
    sucursalId,
    setSucursalId,
    /** ¿Se muestra el filtro? Falso con un local, o si el usuario no es de organización. */
    elegir,
    /**
     * `elegir`, pero sólo con 2+ SUCURSALES reales (no cuentan los depósitos).
     * Con `incluirDepositos`, `elegir` es `true` con una sucursal y un depósito
     * (inventario filtra por ahí desde siempre); una pantalla que NO tenía
     * filtro antes y lo agrega usa ésta: un negocio de un local con su depósito
     * no debe ver selectores nuevos (PLAN-SUCURSAL-TOTAL §1).
     */
    elegirSucursal: elegir && modo === "organizacion",
    /**
     * La organización todavía espera la lista de locales (primera carga). Mientras
     * tanto `elegir` y `modo` dicen "uno solo": para decidir algo irreversible
     * —redirigir una ruta, por ejemplo— hay que esperar a que sea `false`. Para el
     * usuario asignado y para quien no lista locales, siempre `false` (no hay
     * lista que esperar).
     */
    cargandoLocales: esDeOrganizacion && !unLocal && almacenes.cargando && !almacenes.datos,
    /** `una` | `asignado` | `organizacion`: qué ve esta pantalla (ver `ModoSucursal`). */
    modo,
    /**
     * ¿Hay 2+ sucursales y rige el multisucursal? Vale también para el usuario
     * asignado (por el conteo de la sesión). Con `false` la pantalla queda
     * exactamente como con un solo local.
     */
    hayVarias: modo !== "una",
    /** Nombre de la sede del usuario ASIGNADO; `null` en cualquier otro caso. */
    miSede,
    /**
     * Qué local se está mirando, para subtítulos: el elegido (organización) o la
     * sede propia (asignado). Vacío si son todas, o con un solo local.
     */
    sedeVista: nombre || (miSede ?? ""),
    /** Regla 4 (ver `esUnLocal`): el negocio opera como de un solo local. */
    unLocal,
    /**
     * ¿La lista muestra la columna/badge de sucursal? Sólo a la organización y
     * sólo si las filas son de más de un local (`hayVariasEntre`).
     */
    mostrarColumna: <T>(
      filas: readonly T[] | null | undefined,
      clave: (fila: T) => number | string | null | undefined,
    ) => modo === "organizacion" && hayVariasEntre(filas, clave),
    sucursales,
    opciones,
    /** "Todas las sucursales", o como las llame el rubro: para subtítulos y menús propios. */
    todas,
    /** Para `<Chips valor=…>`: la cadena vacía representa "todas". */
    valorChip: sucursalId == null ? "" : String(sucursalId),
    /** Traduce lo que devuelve `<Chips>` al id (o null). */
    alElegir: (v: string) => setSucursalId(v === "" ? null : Number(v)),
    /** Nombre del local elegido, para subtítulos. Vacío si son todas. */
    nombre,
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
    /**
     * Vuelve a pedir la lista (y descarta la compartida): para después de crear
     * o desactivar un local.
     */
    recargar: () => {
      fuente?.invalidar();
      almacenes.recargar();
    },
  };
}
