import { NEGOCIO_KEY, USER_KEY } from "../api";

/**
 * De quién es lo guardado en el celular: negocio y usuario de la sesión.
 *
 * La copia del catálogo y la cola van con este prefijo. Si en el mismo iPhone
 * entra otro usuario (u otro negocio), no ve ni sube las ventas del anterior:
 * esas esperan a que él vuelva a entrar, y suben con SU sesión y a SU caja,
 * que es donde se cobraron.
 *
 * Se lee de localStorage (lo que escribe AuthContext al entrar) y no del
 * contexto de React: el POS pide el catálogo en el primer render, antes de
 * que cualquier efecto de la cáscara alcance a avisar quién entró.
 */
export function ambitoSesion(): string | null {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY) ?? "null") as { id?: number } | null;
    const n = JSON.parse(localStorage.getItem(NEGOCIO_KEY) ?? "null") as { id?: number } | null;
    if (u?.id == null || n?.id == null) return null;
    return `${n.id}:${u.id}`;
  } catch {
    return null;
  }
}
