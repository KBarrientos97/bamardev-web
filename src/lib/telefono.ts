/**
 * Normaliza teléfonos a formato Bolivia (+591) para llamar y para WhatsApp.
 *
 * Calcado de `Telefono.kt` de la app, a propósito: los números se guardan como
 * los teclea la cajera (normalmente 8 dígitos locales) y el código de país se
 * antepone recién al usarlos, así funciona aunque el dato viejo no lo tenga. Si
 * las dos apps normalizaran distinto, el mismo cliente sería llamable desde una
 * y no desde la otra.
 */
const COD_BOLIVIA = "591";

/** Sólo dígitos con código de país (ej. 59170490686), o null si está vacío. */
function bolivia(raw?: string | null): string | null {
  const digitos = (raw ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  // Ya viene con código de país; si no, es un celular/fijo local.
  return digitos.startsWith(COD_BOLIVIA) && digitos.length >= 11
    ? digitos
    : COD_BOLIVIA + digitos;
}

export const Telefono = {
  bolivia,
  /** Formato para marcar: +59170490686. */
  paraLlamada(raw?: string | null): string | null {
    const n = bolivia(raw);
    return n ? `+${n}` : null;
  },
  /** Formato para wa.me: 59170490686 (sin el +). */
  paraWhatsApp(raw?: string | null): string | null {
    return bolivia(raw);
  },
  /** Cómo se muestra: +591 70490686. */
  paraMostrar(raw?: string | null): string {
    const n = bolivia(raw);
    if (!n) return raw ?? "";
    return `+${COD_BOLIVIA} ${n.slice(COD_BOLIVIA.length)}`;
  },
};
