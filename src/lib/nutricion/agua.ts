/**
 * El consumo de agua de la ficha (26-nov-2026): lo que se toca en la regla de
 * litros («1,5 L» o «No toma agua») y la nota se arman en UN texto, que es lo
 * que guarda el servidor (`consumoAgua`, un string):
 *
 *   «1,5 L»                 sólo la cantidad
 *   «1,5 L: con limón»      con nota
 *   «No toma agua»          no toma
 *   «No toma agua: nota»    no toma, con nota
 *   «con limón»             sólo la nota
 *
 * `leerAgua` es lo inverso y tolera lo viejo (los atajos «2 L», «2 L: con
 * limón») y lo escrito a mano («2 litros», «1.5 l»). Lo que no entiende queda
 * como nota, tal cual: nunca se pierde nada de lo escrito.
 */

export type Cantidad = { tipo: "litros"; litros: number } | { tipo: "no_toma" };

export interface Agua {
  cantidad: Cantidad | null;
  nota: string;
}

/** Un vaso son 250 ml. */
export const LITROS_POR_VASO = 0.25;

/** «1,5», «1», «0,25»: coma decimal y sin «,0». */
export function fmtLitros(l: number): string {
  return String(Math.round(l * 100) / 100).replace(".", ",");
}

/** Cuántos vasos de 250 ml son esos litros. */
export const vasosDe = (l: number) => Math.round(l / LITROS_POR_VASO);

/** Para comparar sin mayúsculas ni tildes. */
const plegar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** Arma el texto del campo. No recorta nada: mientras se escribe, la nota queda como se tecleó. */
export function componerAgua(a: Agua): string {
  let cantidad = "";
  if (a.cantidad?.tipo === "litros") cantidad = `${fmtLitros(a.cantidad.litros)} L`;
  else if (a.cantidad?.tipo === "no_toma") cantidad = "No toma agua";
  if (!a.nota) return cantidad;
  return cantidad ? `${cantidad}: ${a.nota}` : a.nota;
}

const NUMERO = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIDAD = String.raw`\s*(?:litros?|lts?|l)(?![a-z0-9])`;
const RE_LITROS = new RegExp(`^${NUMERO}${UNIDAD}`);
const RE_NO_TOMA = /^no toma(?: agua)?(?![a-z])/;
/** Lo que puede seguir para que la nota sea aparte (como en `respuestas.ts`). Come a lo sumo UN espacio. */
const DESPUES = /^(?:\s*[:,;.]|\s+[-–—](?=\s|$)) ?/;

const numero = (s: string) => Number(s.replace(",", "."));

/**
 * Lee el texto guardado. Después de la cantidad tiene que venir el fin o un
 * separador antes de la nota; si no («1 L y medio»), todo es nota y no hay
 * cantidad. Los litros fuera de la regla («5 L», «2,25 L») se leen igual.
 */
export function leerAgua(texto: string | null | undefined): Agua {
  const t = (texto ?? "").normalize("NFC");
  const todoNota: Agua = { cantidad: null, nota: t };
  const cuerpo = t.trimStart();
  // Mismo largo que el original: los índices sirven para cortar la nota tal cual se escribió.
  const s = plegar(cuerpo);
  if (s.length !== cuerpo.length) return todoNota;

  let cantidad: Cantidad | null = null;
  let largo = 0;
  let m: RegExpExecArray | null;
  if ((m = RE_NO_TOMA.exec(s))) {
    cantidad = { tipo: "no_toma" };
    largo = m[0].length;
  } else if ((m = RE_LITROS.exec(s))) {
    const litros = numero(m[1]);
    if (litros > 0) {
      cantidad = { tipo: "litros", litros };
      largo = m[0].length;
    }
  }
  if (cantidad === null) return todoNota;

  const resto = cuerpo.slice(largo);
  if (!resto.trim()) return { cantidad, nota: "" };
  const sep = DESPUES.exec(resto);
  if (!sep) return todoNota;
  return { cantidad, nota: resto.slice(sep[0].length) };
}

/** Lo que se guarda: la cantidad con su escritura de siempre («2 l» → «2 L») y la nota recortada. */
export function normalizarAgua(texto: string | null | undefined): string {
  const a = leerAgua(texto);
  return componerAgua({ cantidad: a.cantidad, nota: a.nota.trim() }).trim();
}
