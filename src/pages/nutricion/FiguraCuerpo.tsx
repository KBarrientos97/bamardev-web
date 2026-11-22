import type { Sexo } from "../../lib/nutricion/tipos";

/**
 * La figura de las medidas (etapa 2 de la evaluación): el torso de frente, de
 * los hombros a los muslos, como un maniquí de trazo limpio, con las tres
 * cintas de medir. La del campo que tiene el foco se resalta con el color del
 * negocio; las otras quedan en gris. Sin texto ni marcas: la medida se escribe
 * al lado. Los colores son los del tema (variables CSS y `currentColor`).
 *
 * El contorno se arma con la mitad izquierda y su espejo: así las dos mitades
 * son exactamente iguales.
 */

export type Cinta = "pecho" | "cintura" | "cadera";

type Punto = [number, number];
/** Un tramo de Bézier cúbica: control 1, control 2 y a dónde llega. */
type Tramo = [Punto, Punto, Punto];

const ANCHO = 200;
const ALTO = 262;

const espejo = ([x, y]: Punto): Punto => [ANCHO - x, y];
const p = ([x, y]: Punto) => `${x} ${y}`;

/** El contorno cerrado: la mitad izquierda hacia abajo y la derecha, en espejo, hacia arriba. */
function contorno(inicio: Punto, tramos: Tramo[]): string {
  const puntos = [inicio, ...tramos.map((t) => t[2])];
  let d = `M${p(inicio)}`;
  for (const [c1, c2, fin] of tramos) d += ` C${p(c1)} ${p(c2)} ${p(fin)}`;
  for (let i = tramos.length - 1; i >= 0; i--) {
    const [c1, c2] = tramos[i];
    d += ` C${p(espejo(c2))} ${p(espejo(c1))} ${p(espejo(puntos[i]))}`;
  }
  return `${d} Z`;
}

/** Un trazo de detalle (la clavícula, el busto) y el mismo del otro lado. */
function conEspejo(trazo: [Punto, Punto, Punto, Punto]): string[] {
  const [a, b, c, d] = trazo;
  return [`M${p(a)} C${p(b)} ${p(c)} ${p(d)}`, `M${p(espejo(a))} C${p(espejo(b))} ${p(espejo(c))} ${p(espejo(d))}`];
}

interface Silueta {
  contorno: string;
  detalles: string[];
  /** Cada cinta: a qué altura pasa y la mitad de su ancho (un poco más que el cuerpo, para que lo abrace). */
  cintas: Record<Cinta, { y: number; rx: number }>;
}

const SILUETAS: Record<Sexo, Silueta> = {
  F: {
    contorno: contorno(
      [90, 8],
      [
        [[90, 18], [89, 25], [87, 31]], // cuello
        [[78, 35], [65, 40], [54, 45]], // trapecio, en bajada
        [[47, 48], [43, 55], [42, 65]], // hombro
        [[41, 77], [42, 89], [43, 100]], // costado del busto
        [[44, 113], [52, 129], [56, 142]], // bajo el busto
        [[58, 150], [58, 157], [57, 163]], // cintura
        [[55, 177], [44, 191], [43, 206]], // cadera
        [[42, 220], [46, 237], [50, 253]], // muslo
        [[65, 256], [81, 256], [96, 253]], // corte del muslo
        [[98, 245], [99, 238], [100, 232]], // entrepierna
      ],
    ),
    detalles: [
      ...conEspejo([[72, 43], [80, 45.5], [88, 45.5], [95, 44]]), // clavícula
      ...conEspejo([[55, 101], [59, 117], [83, 121], [95, 107]]), // busto
    ],
    cintas: { pecho: { y: 102, rx: 58 }, cintura: { y: 155, rx: 44 }, cadera: { y: 206, rx: 59 } },
  },
  M: {
    contorno: contorno(
      [88, 8],
      [
        [[88, 18], [87, 25], [85, 31]], // cuello
        [[73, 36], [57, 41], [43, 47]], // trapecio
        [[34, 51], [29, 60], [29, 71]], // hombro
        [[29, 82], [32, 92], [35, 102]], // pecho
        [[39, 116], [44, 131], [47, 147]], // dorsal, que se angosta
        [[49, 157], [49, 165], [48, 173]], // cintura
        [[47, 185], [46, 195], [46, 205]], // cadera
        [[46, 221], [49, 237], [52, 253]], // muslo
        [[67, 256], [82, 256], [97, 253]], // corte del muslo
        [[98, 246], [99, 239], [100, 234]], // entrepierna
      ],
    ),
    detalles: [
      ...conEspejo([[70, 44], [78, 46.5], [88, 46.5], [95, 45]]), // clavícula
      ...conEspejo([[58, 93], [66, 104], [86, 105], [96, 97]]), // pectoral
    ],
    cintas: { pecho: { y: 90, rx: 72 }, cintura: { y: 164, rx: 54 }, cadera: { y: 203, rx: 56 } },
  },
};

const ORDEN: Cinta[] = ["pecho", "cintura", "cadera"];
const RY = 6.5;
const TRANSICION = "stroke .15s ease, stroke-width .15s ease, opacity .15s ease";

export default function FiguraCuerpo({
  sexo,
  resaltada,
  className = "",
}: {
  sexo: Sexo;
  /** La cinta del campo con foco; null = ninguna. */
  resaltada: Cinta | null;
  className?: string;
}) {
  const s = SILUETAS[sexo];
  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      className={`block h-auto w-full text-texto-3 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={s.contorno} fill="var(--color-primary-50)" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      {s.detalles.map((d) => (
        <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" opacity={0.45} />
      ))}
      {ORDEN.map((cinta) => {
        const { y, rx } = s.cintas[cinta];
        const on = cinta === resaltada;
        const a = ANCHO / 2 - rx;
        const b = ANCHO / 2 + rx;
        // De frente se ve la mitad de adelante de la cinta (el arco de abajo);
        // la de atrás asoma arriba, punteada.
        const adelante = `M${a} ${y} A${rx} ${RY} 0 0 0 ${b} ${y}`;
        const atras = `M${a} ${y} A${rx} ${RY} 0 0 1 ${b} ${y}`;
        const color = on ? "var(--color-primary-boton)" : "var(--color-texto-4)";
        return (
          <g key={cinta} data-cinta={cinta} data-resaltada={on || undefined}>
            <path
              d={adelante}
              fill="none"
              stroke="var(--color-primary-200)"
              strokeLinecap="round"
              style={{ strokeWidth: on ? 9 : 0, opacity: on ? 0.75 : 0, transition: TRANSICION }}
            />
            <path
              d={atras}
              fill="none"
              stroke={color}
              strokeDasharray="3 3"
              style={{ strokeWidth: on ? 2 : 1.5, opacity: on ? 0.85 : 0.55, transition: TRANSICION }}
            />
            <path d={adelante} fill="none" stroke={color} strokeLinecap="round" style={{ strokeWidth: on ? 3.5 : 2.25, transition: TRANSICION }} />
          </g>
        );
      })}
    </svg>
  );
}
