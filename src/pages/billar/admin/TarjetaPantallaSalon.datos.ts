/**
 * El enlace de la TV del salón (`/tv/billar/<llave>`, publico/tv).
 *
 * Absoluto, porque se copia y se abre en otro equipo. `?sucursal=` sólo si
 * hay que elegir un local: sin él el backend muestra la principal, que en un
 * negocio de un solo local es la única (el enlace queda igual que siempre).
 */
export function urlTv(origen: string, llave: string, sucursalId?: number | null): string {
  const base = `${origen}/tv/billar/${encodeURIComponent(llave)}`;
  return sucursalId != null ? `${base}?sucursal=${sucursalId}` : base;
}
