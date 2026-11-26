/**
 * Las respuestas con atajos de la ficha (25-nov-2026): cuatro campos de texto
 * («Últimos análisis clínicos», «Cirugías», «Conducta del sueño» y «Actividad
 * física») ganan una fila de botoncitos con lo típico, sin
 * perder el campo para escribir.
 *
 * El dato sigue siendo UN texto (el backend guarda un string por campo):
 * sólo el atajo → «No»; atajo y nota → «No: nunca»; sólo la nota → «nunca».
 * Al leer un texto guardado se reconoce el atajo aunque esté escrito a mano
 * («si», «SI, cesárea», «No - nunca»); si no empieza con uno, todo es la nota
 * («Apendicitis 2015», «Nos operaron»), sin ningún botón encendido.
 *
 * Mientras se escribe no se recorta nada (la nota guarda los espacios que se
 * van tecleando); al guardar, `normalizarRespuesta` deja la escritura de
 * siempre («si:  » → «Sí»).
 */

/** Los campos de la ficha que tienen atajos. */
export type CampoConAtajos = "ultimosAnalisis" | "cirugias" | "conductaSueno" | "actividadFisica";

/** Los atajos de cada campo, en el orden en que se muestran. Una sola elección por campo. */
export const ATAJOS: Record<CampoConAtajos, readonly string[]> = {
  ultimosAnalisis: ["Ninguno", "No los trajo", "Normales", "Con alteraciones", "Pendientes"],
  cirugias: ["Sí", "No"],
  conductaSueno: ["Bien", "Regular", "Mal"],
  actividadFisica: ["Sí", "No"],
};

/** Los campos con atajos, para recorrerlos. */
export const CAMPOS_CON_ATAJOS = Object.keys(ATAJOS) as CampoConAtajos[];

/** Lo que dice un campo con atajos: el atajo elegido (o ninguno) y la nota escrita. */
export interface Respuesta {
  opcion: string | null;
  nota: string;
}

/** El separador de la forma de siempre: «Atajo: nota». */
const SEPARADOR = ": ";

/** Para comparar sin mayúsculas ni tildes: «Sí», «SI» y «si» son lo mismo. */
const plegar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/**
 * Lo que puede seguir al atajo para que la nota sea aparte: «:», «,», «;» o
 * «.» (con espacios antes o no), o un guion entre espacios («No - nunca»,
 * «No — nunca»). Después del separador se come a lo sumo UN espacio: así
 * «Sí:  » (lo que queda al teclear un espacio en la nota) se lee con la nota
 * « » y no se pierde lo que se va escribiendo.
 */
const DESPUES_DEL_ATAJO = /^(?:\s*[:,;.]|\s+[-–—](?=\s|$)) ?/;

/** Arma el texto del campo. No recorta nada: mientras se escribe, la nota queda como se tecleó. */
export function componerRespuesta(opcion: string | null, nota: string): string {
  if (!opcion) return nota;
  return nota ? `${opcion}${SEPARADOR}${nota}` : opcion;
}

/**
 * Lee el texto de un campo con su lista de atajos. Coincide si el texto ES el
 * atajo o empieza con él seguido de un separador; los atajos se prueban del
 * más largo al más corto («No los trajo» antes que «No»). Si no coincide,
 * todo el texto es la nota.
 */
export function leerRespuesta(texto: string | null | undefined, atajos: readonly string[]): Respuesta {
  const t = (texto ?? "").normalize("NFC");
  // Los espacios de adelante no cuentan para reconocer el atajo.
  const cuerpo = t.trimStart();
  const ordenados = [...atajos].sort((a, b) => b.length - a.length);
  for (const atajo of ordenados) {
    if (plegar(cuerpo.slice(0, atajo.length)) !== plegar(atajo)) continue;
    const resto = cuerpo.slice(atajo.length);
    // Es el atajo solo (a lo sumo con espacios atrás).
    if (!resto.trim()) return { opcion: atajo, nota: "" };
    const sep = DESPUES_DEL_ATAJO.exec(resto);
    // «Sin» no es «Sí» ni «No los trajo» es «No»: sin separador, sigue buscando.
    if (sep) return { opcion: atajo, nota: resto.slice(sep[0].length) };
  }
  return { opcion: null, nota: t };
}

/**
 * Lo que se guarda: el atajo con su escritura de siempre y la nota recortada
 * («si:  » → «Sí», « no , nunca » → «No: nunca»). Leer lo normalizado da lo
 * mismo, así comparar dos fichas no muestra cambios que no hubo.
 */
export function normalizarRespuesta(texto: string | null | undefined, atajos: readonly string[]): string {
  const { opcion, nota } = leerRespuesta(texto, atajos);
  return componerRespuesta(opcion, nota.trim());
}
