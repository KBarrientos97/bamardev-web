/**
 * El código con que se conecta una TV del local (`/tv`, Kevin 4-nov). Aparte
 * de `apiTelevisores` para que la TV lo use sin cargar el cliente con sesión.
 */

/** "k7p4qx" → "K7P 4QX": como lo muestra la TV, para leerlo de lejos. */
export function codigoParaVer(codigo: string): string {
  const c = codigo.toUpperCase().replace(/[\s-]/g, "");
  return c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c;
}

/** Lo que se escribe en el campo: mayúsculas, sin espacios ni guiones, hasta 6. */
export function codigoEscrito(texto: string): string {
  return texto
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}
