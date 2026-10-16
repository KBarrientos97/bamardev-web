/**
 * Dónde y de qué alto va el panel del asistente en el celular.
 *
 * En iPhone el teclado NO achica el viewport de layout: `100dvh` y
 * `bottom: 16` siguen midiendo lo mismo con el teclado abierto, así que el
 * panel (580 px) quedaba más alto que el espacio visible, el encabezado subía
 * bajo la barra de estado y el teclado tapaba el campo. Lo que sí cambia es
 * el viewport VISUAL (`window.visualViewport`): de ahí sale el alto que queda
 * y cuánto tapa el teclado por abajo.
 *
 * Puro y sin tocar el DOM: recibe las medidas.
 */
export interface MedidasViewport {
  /** `window.innerHeight`: el viewport de layout. */
  alturaLayout: number;
  /** `visualViewport.height`: lo que se ve de verdad (sin teclado). */
  alturaVisible: number;
  /** `visualViewport.offsetTop`: cuánto se corrió la parte visible hacia abajo. */
  desplazamiento: number;
}

export interface GeometriaChat {
  /** Alto máximo del panel, en px. */
  altoMax: number;
  /** Distancia del panel al borde de abajo del viewport de layout, en px. */
  abajo: number;
}

const MARGEN = 16;
const ALTO_PREFERIDO = 580;
/** Menos que esto el chat no se puede usar: se deja como estaba. */
const ALTO_MINIMO = 200;

export function geometriaChat(m: MedidasViewport | null): GeometriaChat {
  if (!m || !(m.alturaVisible > 0)) return { altoMax: ALTO_PREFERIDO, abajo: MARGEN };
  // Lo que tapa el teclado (u otra barra) por debajo de la parte visible.
  const tapado = Math.max(0, m.alturaLayout - (m.desplazamiento + m.alturaVisible));
  const disponible = m.alturaVisible - 2 * MARGEN;
  return {
    altoMax: Math.max(ALTO_MINIMO, Math.min(ALTO_PREFERIDO, disponible)),
    abajo: tapado + MARGEN,
  };
}
