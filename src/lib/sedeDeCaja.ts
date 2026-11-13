import { esUnLocal, modoDeSucursal } from "./modoSucursal";
import type { SesionNegocio, SesionUsuario } from "../types";

/**
 * La sede activa de la caja (13-nov-2026): el admin de una organización con 2+
 * sucursales puede tener una caja abierta en cada una y saltar de una a otra
 * desde el Punto de venta. Esta es la sede en la que está parado.
 *
 * El backend resuelve «la caja del usuario» con la cabecera `X-Caja-Sucursal`
 * (sin ella, la abierta más reciente, como siempre). La web la manda sola en
 * todo pedido —así Créditos, Billar, Academia o el cierre siguen la sede que
 * se eligió en el POS sin tocarlas una por una— pero SÓLO a quien tiene sentido:
 *
 *  • el usuario de organización (`sucursalId == null`),
 *  • de un negocio que opera con varios locales (`modoDeSucursal` =
 *    `organizacion`: 2+ sucursales activas y sin la regla 4 de `esUnLocal`).
 *
 * Al cajero atado a una sede, a un negocio de un local o a una sesión vieja sin
 * el conteo no se le manda nada: sale exactamente lo de antes.
 *
 * Vive acá, sin React ni red, para que `api.ts` lo pueda preguntar sin ciclos;
 * el hook para las pantallas está en `useSedeDeCaja.ts`.
 */

/** La cabecera con la que viaja la sede. */
export const CABECERA_SEDE_DE_CAJA = "X-Caja-Sucursal";

type Sesion = {
  usuario: Pick<SesionUsuario, "id" | "sucursalId"> | null | undefined;
  negocio: Pick<SesionNegocio, "id" | "tipoNegocio" | "features" | "sucursalesActivas"> | null | undefined;
};

/**
 * ¿Rige la sede de caja para esta sesión? Es la pregunta de `useSucursales`
 * (modo `organizacion`), sin la lista de locales: alcanza con el conteo que
 * guarda la sesión. Falla cerrado (`undefined` = no se sabe = un solo local).
 */
export function usaSedeDeCaja({ usuario, negocio }: Sesion): boolean {
  if (!usuario || !negocio) return false;
  return (
    modoDeSucursal({
      asignado: usuario.sucursalId != null,
      unLocal: esUnLocal(negocio),
      locales: negocio.sucursalesActivas,
    }) === "organizacion"
  );
}

/** Por negocio y usuario: dos dueños en el mismo navegador no se pisan. */
const claveDe = ({ usuario, negocio }: Sesion) => `bamardev.caja.sede:${negocio?.id ?? ""}:${usuario?.id ?? ""}`;

/** La sede que el usuario eligió en este equipo, o null si no eligió ninguna. */
export function sedeDeCajaGuardada(sesion: Sesion): number | null {
  if (!sesion.usuario || !sesion.negocio) return null;
  try {
    const v = localStorage.getItem(claveDe(sesion));
    return v ? Number(v) || null : null;
  } catch {
    return null;
  }
}

const oyentes = new Set<() => void>();

/** Para `useSyncExternalStore`: se avisa cuando la sede cambia en esta pestaña. */
export function alCambiarLaSedeDeCaja(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/**
 * Guarda la sede activa (`null` = ninguna: el backend vuelve a la caja más
 * reciente). Sin almacenamiento (navegación privada) no se guarda y todo sigue
 * como sin selección: se vuelve a elegir y nada más.
 */
export function fijarSedeDeCaja(sesion: Sesion, id: number | null): void {
  if (!sesion.usuario || !sesion.negocio) return;
  try {
    if (id == null) localStorage.removeItem(claveDe(sesion));
    else localStorage.setItem(claveDe(sesion), String(id));
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
  oyentes.forEach((o) => o());
}

/**
 * La cabecera que `request()` agrega, o `{}`. `sedeExplicita` es la de una
 * venta que ya trae su almacén (la cola offline la sube tiempo después, y la
 * sede activa de ese momento puede ser otra): manda esa.
 */
export function cabeceraDeSedeDeCaja(sesion: Sesion, sedeExplicita?: number | null): Record<string, string> {
  if (!usaSedeDeCaja(sesion)) return {};
  const sede = sedeExplicita ?? sedeDeCajaGuardada(sesion);
  return sede != null ? { [CABECERA_SEDE_DE_CAJA]: String(sede) } : {};
}
