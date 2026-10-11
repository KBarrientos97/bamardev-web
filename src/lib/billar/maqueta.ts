import type { ContextoPermisos } from "../permisos";

/**
 * MAQUETA DE BILLAR (oct-2026) — se borra cuando el backend tenga el extra
 * `billar` y los permisos `billar.operar` y `billar.admin`.
 *
 * Mientras tanto ningún negocio los tiene, así que nadie puede entrar a las
 * pantallas para revisarlas. Esto los suma a la sesión SÓLO en `npm run dev`
 * y sólo si se pidió: `localStorage["bamardev.maqueta.billar"] = "1"`, o
 * entrando una vez con `?maqueta=billar` en la dirección. En el build (QA y
 * producción) `import.meta.env.DEV` es false y la función devuelve lo mismo
 * que recibe: el bundle publicado ni siquiera trae el código.
 *
 * El rubro se sigue respetando: en una farmacia o un salón de belleza no
 * aparece igual.
 */

const CLAVE = "bamardev.maqueta.billar";

function prendida(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("maqueta") === "billar") {
      localStorage.setItem(CLAVE, "1");
    }
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

export function conMaquetaBillar(ctx: ContextoPermisos): ContextoPermisos {
  if (!import.meta.env.DEV || !prendida()) return ctx;
  return {
    ...ctx,
    features: ctx.features?.length ? [...ctx.features, "billar"] : ctx.features,
    permisos: [...(ctx.permisos ?? []), "billar.operar", "billar.admin"],
  };
}
