/**
 * La paleta única de BamarDev (12-oct-2026): la misma en todo selector de
 * color del sistema (color de la página, anuncio, agenda, personal). Antes
 * había cuatro listas distintas (32, ~45, 8 y ninguna) y casi todas con el
 * mismo brillo: parecían muchos colores pero no había tonos.
 *
 * 10 familias × 4 tonos = 40 colores. Cada familia va de "Vivo" a
 * "Profundo" por contraste con el blanco (≈4.7 → 6.4 → 8.7 → 12, con algunas
 * excepciones de colores que ya existían), y TODOS superan 4.5:1: cualquiera
 * sirve de fondo con letra blanca o de letra sobre blanco, que es lo que
 * piden la página y la agenda.
 *
 * Es copia de `bamardev-backend/src/pagina/muestras.ts` (el backend valida la
 * clave del color de la página y es la fuente de la verdad): un cambio acá va
 * también allá. Las 32 claves de antes siguen existiendo (ninguna página se
 * migra) y Ciruela, Frambuesa, Lavanda y Carbón conservan el hex de los temas
 * de belleza (D25).
 */
export interface ColorPaleta {
  clave: string;
  nombre: string;
  /** Una de FAMILIAS. */
  familia: string;
  /** 0 = Vivo … 3 = Profundo (índice de TONOS). */
  tono: number;
  hex: string;
}

export const FAMILIAS = ["Rojo", "Rosa", "Violeta", "Azul", "Turquesa", "Verde", "Amarillo", "Naranja", "Café", "Gris"] as const;

export const TONOS = ["Vivo", "Medio", "Oscuro", "Profundo"] as const;

export const PALETA: readonly ColorPaleta[] = [
  // Rojo
  { clave: "ROJO", nombre: "Rojo", familia: "Rojo", tono: 0, hex: "#C0262D" },
  { clave: "TEJA", nombre: "Teja", familia: "Rojo", tono: 1, hex: "#993629" },
  { clave: "VINO", nombre: "Vino", familia: "Rojo", tono: 2, hex: "#8C1D3A" },
  { clave: "GRANATE", nombre: "Granate", familia: "Rojo", tono: 3, hex: "#681826" },
  // Rosa
  { clave: "ROSA", nombre: "Rosa", familia: "Rosa", tono: 0, hex: "#DA2372" },
  { clave: "FRAMBUESA", nombre: "Frambuesa", familia: "Rosa", tono: 1, hex: "#B5285A" },
  { clave: "CIRUELA", nombre: "Ciruela", familia: "Rosa", tono: 2, hex: "#9B2C6B" },
  { clave: "MORA", nombre: "Mora", familia: "Rosa", tono: 3, hex: "#601C41" },
  // Violeta
  { clave: "LAVANDA", nombre: "Lavanda", familia: "Violeta", tono: 0, hex: "#7357B8" },
  { clave: "MAGENTA", nombre: "Magenta", familia: "Violeta", tono: 1, hex: "#A21CAF" },
  { clave: "VIOLETA", nombre: "Violeta", familia: "Violeta", tono: 2, hex: "#6028AD" },
  { clave: "UVA", nombre: "Uva", familia: "Violeta", tono: 3, hex: "#49246B" },
  // Azul
  { clave: "CIELO", nombre: "Cielo", familia: "Azul", tono: 0, hex: "#0878BE" },
  { clave: "AZUL", nombre: "Azul", familia: "Azul", tono: 1, hex: "#235FA8" },
  { clave: "INDIGO", nombre: "Índigo", familia: "Azul", tono: 2, hex: "#3B42A9" },
  { clave: "MARINO", nombre: "Marino", familia: "Azul", tono: 3, hex: "#1E3A8A" },
  // Turquesa
  { clave: "ESMERALDA", nombre: "Esmeralda", familia: "Turquesa", tono: 0, hex: "#078474" },
  { clave: "AGUAMARINA", nombre: "Aguamarina", familia: "Turquesa", tono: 1, hex: "#0F6969" },
  { clave: "PETROLEO", nombre: "Petróleo", familia: "Turquesa", tono: 2, hex: "#0F535B" },
  { clave: "OCEANO", nombre: "Océano", familia: "Turquesa", tono: 3, hex: "#103B46" },
  // Verde
  { clave: "VERDE", nombre: "Verde", familia: "Verde", tono: 0, hex: "#0C7A55" },
  { clave: "OLIVA", nombre: "Oliva", familia: "Verde", tono: 1, hex: "#52661D" },
  { clave: "SALVIA", nombre: "Salvia", familia: "Verde", tono: 2, hex: "#38513D" },
  { clave: "BOSQUE", nombre: "Bosque", familia: "Verde", tono: 3, hex: "#193D22" },
  // Amarillo
  { clave: "ORO", nombre: "Oro", familia: "Amarillo", tono: 0, hex: "#986B04" },
  { clave: "MOSTAZA", nombre: "Mostaza", familia: "Amarillo", tono: 1, hex: "#7A6400" },
  { clave: "AMBAR", nombre: "Ámbar", familia: "Amarillo", tono: 2, hex: "#6C4B07" },
  { clave: "BRONCE", nombre: "Bronce", familia: "Amarillo", tono: 3, hex: "#413513" },
  // Naranja
  { clave: "NARANJA", nombre: "Naranja", familia: "Naranja", tono: 0, hex: "#B4501A" },
  { clave: "CANELA", nombre: "Canela", familia: "Naranja", tono: 1, hex: "#99491B" },
  { clave: "OCRE", nombre: "Ocre", familia: "Naranja", tono: 2, hex: "#753507" },
  { clave: "OXIDO", nombre: "Óxido", familia: "Naranja", tono: 3, hex: "#5E2419" },
  // Café
  { clave: "ARENA", nombre: "Arena", familia: "Café", tono: 0, hex: "#817156" },
  { clave: "CAFE", nombre: "Café", familia: "Café", tono: 1, hex: "#7C5A45" },
  { clave: "CHOCOLATE", nombre: "Chocolate", familia: "Café", tono: 2, hex: "#6B3F25" },
  { clave: "ESPRESSO", nombre: "Espresso", familia: "Café", tono: 3, hex: "#4B3022" },
  // Gris
  { clave: "PIZARRA", nombre: "Pizarra", familia: "Gris", tono: 0, hex: "#5B7789" },
  { clave: "ACERO", nombre: "Acero", familia: "Gris", tono: 1, hex: "#475569" },
  { clave: "CARBON", nombre: "Carbón", familia: "Gris", tono: 2, hex: "#4A4744" },
  { clave: "NEGRO", nombre: "Negro", familia: "Gris", tono: 3, hex: "#18181B" },
];

/** El color de la paleta con ese hex (sin importar mayúsculas), o null si es uno propio. */
export function colorDeHex(hex: string | null | undefined): ColorPaleta | null {
  if (!hex) return null;
  const h = hex.toUpperCase();
  return PALETA.find((c) => c.hex === h) ?? null;
}

export function colorDeClave(clave: string | null | undefined): ColorPaleta | null {
  return PALETA.find((c) => c.clave === clave) ?? null;
}

/** "Violeta · vivo": dónde está un color dentro de la paleta. */
export function ubicacion(c: ColorPaleta): string {
  return `${c.familia} · ${TONOS[c.tono]?.toLowerCase() ?? ""}`;
}

/**
 * Los colores con que arrancan los profesionales y espacios nuevos de la
 * agenda, rotando: familias distintas para que dos columnas vecinas no se
 * confundan. El backend usa la misma lista (`agenda/configuracion.service.ts`)
 * cuando el alta llega sin color; Lavanda va primero porque es el default de
 * la columna.
 */
export const ROTACION_AGENDA = ["LAVANDA", "FRAMBUESA", "AGUAMARINA", "NARANJA", "AZUL", "OLIVA", "ROJO", "CARBON"].map(
  (k) => colorDeClave(k)!.hex,
);

export function colorParaNuevo(cuantos: number): string {
  return ROTACION_AGENDA[cuantos % ROTACION_AGENDA.length];
}
