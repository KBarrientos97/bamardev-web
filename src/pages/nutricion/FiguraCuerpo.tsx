import { useId, type MouseEvent } from "react";
import type { Sexo } from "../../lib/nutricion/tipos";
import "./FiguraCuerpo.css";

/**
 * La figura de las medidas (etapa 2 de la evaluación): el torso de frente, de
 * los hombros a los muslos, como un maniquí de trazo limpio, con las tres
 * cintas de medir. Cada cinta tiene tres estados que se distinguen de un
 * vistazo: vacía (gris y fina), cargada (ya tiene un número: el color del
 * negocio, sin brillo) y activa (la del campo con foco: más gruesa, con el
 * halo y un pulso suave). Con `rotulos`, cada cinta saca a la derecha una
 * línea guía hasta su nombre y lo escrito en el campo, dentro del mismo dibujo:
 * así el rótulo queda siempre a la altura de su cinta y escala con la figura.
 * Los colores son los del tema (variables CSS y `currentColor`), porque cada
 * rubro tiene el suyo.
 *
 * El contorno se arma con la mitad izquierda y su espejo: así las dos mitades
 * son exactamente iguales.
 */

export type Cinta = "pecho" | "cintura" | "cadera";
export type EstadoCinta = "vacia" | "cargada" | "activa";

type Punto = [number, number];
/** Un tramo de Bézier cúbica: control 1, control 2 y a dónde llega. */
type Tramo = [Punto, Punto, Punto];

/** El marco del cuerpo: 200 de ancho, con el eje en x = 100. */
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
const NOMBRE: Record<Cinta, string> = { pecho: "Pecho", cintura: "Cintura", cadera: "Cadera" };
/** La mitad del alto de la elipse de la cinta (lo que se ve de costado). */
const RY = 6.5;
const TRANSICION = "stroke .2s ease, stroke-width .2s ease, opacity .2s ease, fill .2s ease";

// ── Encuadre ────────────────────────────────────────────────────────────────
// Sin rótulos, sólo el cuerpo (de hombro a hombro del hombre, que es el más
// ancho): la figura llena su lugar. Con rótulos, el mismo encuadre estirado a
// la derecha, donde van las líneas guía y los textos.
const IZQUIERDA = 22;
const ARRIBA = 2;
const DERECHA_SOLA = 178;
const DERECHA_CON_ROTULOS = 296;

// ── Rótulos ─────────────────────────────────────────────────────────────────
/** Donde se doblan las líneas guía que tienen que abrirse (todas a la misma x: quedan ordenadas). */
const X_CODO = 184;
/** Lo que avanza el codo en diagonal. */
const LARGO_CODO = 10;
/** Donde empieza el texto de los rótulos (todos alineados a la izquierda). */
const X_TEXTO = 206;
/** La distancia mínima entre los centros de dos rótulos: nombre + valor + aire. */
const SEPARACION = 46;
/** Lo que se muestra de un valor: lo escrito, cortado si alguien pegó un texto largo. */
const LARGO_VALOR = 6;

/**
 * A qué altura va el rótulo de cada cinta: a la de su cinta, salvo que pise
 * al de arriba; entonces baja lo justo (el codo de su línea guía lo une igual).
 * En la mujer las tres quedan derechas; en el hombre la cadera baja un poco.
 */
function alturasDeRotulos(s: Silueta): Record<Cinta, number> {
  const alturas = {} as Record<Cinta, number>;
  let anterior = -Infinity;
  for (const c of ORDEN) {
    const y = Math.max(s.cintas[c].y, anterior + SEPARACION);
    alturas[c] = y;
    anterior = y;
  }
  return alturas;
}

/** Lo que dice el rótulo: el número tal cual se escribió (cortado si es muy largo), o nada. */
function valorVisible(valor: string | undefined): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  return v.length > LARGO_VALOR ? `${v.slice(0, LARGO_VALOR - 1)}…` : v;
}

/** El estado de una cinta: la del foco manda; si no, si ya tiene algo escrito. */
function estadoDeCinta(cinta: Cinta, resaltada: Cinta | null, valores?: Partial<Record<Cinta, string>>): EstadoCinta {
  if (cinta === resaltada) return "activa";
  return valorVisible(valores?.[cinta]) != null ? "cargada" : "vacia";
}

/** Los colores de cada estado, todos del tema. */
const COLOR_CINTA: Record<EstadoCinta, string> = {
  vacia: "var(--color-texto-4)",
  cargada: "var(--color-primary)",
  activa: "var(--color-primary-boton)",
};
const ANCHO_CINTA: Record<EstadoCinta, number> = { vacia: 2.25, cargada: 2.75, activa: 3.75 };

export default function FiguraCuerpo({
  sexo,
  resaltada,
  valores,
  rotulos = false,
  onTocar,
  className = "block h-auto w-full",
}: {
  sexo: Sexo;
  /** La cinta del campo con foco; null = ninguna. */
  resaltada: Cinta | null;
  /** Lo escrito en cada campo, tal cual: con algo escrito, la cinta queda «cargada». */
  valores?: Partial<Record<Cinta, string>>;
  /** A la derecha, el nombre y el valor de cada cinta (cuando hay lugar). */
  rotulos?: boolean;
  /** Tocaron una cinta o su rótulo: la pantalla lleva el foco a su campo. */
  onTocar?: (cinta: Cinta) => void;
  /** El tamaño y cómo se muestra (por defecto, a todo el ancho). */
  className?: string;
}) {
  const s = SILUETAS[sexo];
  // Los degradados y la máscara necesitan un id propio: puede haber dos figuras en la página.
  const id = `figura-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const derecha = rotulos ? DERECHA_CON_ROTULOS : DERECHA_SOLA;
  const alturas = alturasDeRotulos(s);
  // Que tocar la figura no le saque el foco al campo antes de tiempo: el foco
  // pasa derecho al campo de la cinta tocada (sin un instante «sin foco»).
  const sinRobarFoco = (e: MouseEvent) => e.preventDefault();
  const tocable = onTocar
    ? (cinta: Cinta) => ({ onMouseDown: sinRobarFoco, onClick: () => onTocar(cinta), style: { cursor: "pointer" } })
    : () => ({});

  return (
    <svg
      viewBox={`${IZQUIERDA} ${ARRIBA} ${derecha - IZQUIERDA} ${ALTO - ARRIBA}`}
      className={`text-texto-3 ${onTocar ? "figura-tocable" : ""} ${className}`}
      data-figura={rotulos ? "con-rotulos" : "sola"}
      aria-hidden="true"
      focusable="false"
      // El halo de la cinta más ancha (el pecho del hombre) pasa apenas el encuadre: que no se corte.
      overflow="visible"
      style={{ fontFamily: "inherit" }}
    >
      <defs>
        {/* El volumen del maniquí: los costados apenas teñidos y el centro claro. */}
        <linearGradient id={`${id}-volumen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--color-primary-100)" }} />
          <stop offset="0.2" style={{ stopColor: "var(--color-primary-50)" }} />
          <stop offset="0.4" style={{ stopColor: "var(--color-card)" }} />
          <stop offset="0.6" style={{ stopColor: "var(--color-card)" }} />
          <stop offset="0.8" style={{ stopColor: "var(--color-primary-50)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-primary-100)" }} />
        </linearGradient>
        {/* Los muslos se desvanecen abajo en vez de terminar en un corte. */}
        <linearGradient id={`${id}-desvanecer`} x1="0" y1="222" x2="0" y2="258" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id={`${id}-mascara`} maskUnits="userSpaceOnUse" x="0" y="0" width={ANCHO} height={ALTO}>
          <rect x="0" y="0" width={ANCHO} height={ALTO} fill={`url(#${id}-desvanecer)`} />
        </mask>
      </defs>

      <g mask={`url(#${id}-mascara)`}>
        <path d={s.contorno} fill={`url(#${id}-volumen)`} stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" />
        {s.detalles.map((d) => (
          <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" opacity={0.4} />
        ))}
      </g>

      {ORDEN.map((cinta) => {
        const { y, rx } = s.cintas[cinta];
        const estado = estadoDeCinta(cinta, resaltada, valores);
        const on = estado === "activa";
        const color = COLOR_CINTA[estado];
        const a = ANCHO / 2 - rx;
        const b = ANCHO / 2 + rx;
        // De frente se ve la mitad de adelante de la cinta (el arco de abajo);
        // la de atrás asoma arriba, punteada.
        const adelante = `M${a} ${y} A${rx} ${RY} 0 0 0 ${b} ${y}`;
        const atras = `M${a} ${y} A${rx} ${RY} 0 0 1 ${b} ${y}`;
        // La zona de toque: una franja generosa sobre la cinta, sin pisar la de al lado.
        const i = ORDEN.indexOf(cinta);
        const arriba = i > 0 ? Math.min(18, (y - s.cintas[ORDEN[i - 1]].y) / 2) : 18;
        const abajo = i < ORDEN.length - 1 ? Math.min(18, (s.cintas[ORDEN[i + 1]].y - y) / 2) : 18;
        return (
          <g key={cinta} data-cinta={cinta} data-estado={estado} data-resaltada={on || undefined}>
            {/* Lo que se ve no recibe toques: los reciben las franjas de abajo, que no se pisan. */}
            <g pointerEvents="none">
              <path
                d={adelante}
                fill="none"
                stroke="var(--color-primary-200)"
                strokeLinecap="round"
                style={{ strokeWidth: on ? 10 : 0, opacity: on ? 0.8 : 0, transition: TRANSICION }}
              />
              {on && <path className="figura-aura" d={adelante} fill="none" stroke="var(--color-primary)" strokeLinecap="round" />}
              <path
                d={atras}
                fill="none"
                stroke={color}
                strokeDasharray="3 3"
                style={{ strokeWidth: on ? 2 : 1.5, opacity: estado === "vacia" ? 0.55 : 0.75, transition: TRANSICION }}
              />
              <path
                className="figura-frente"
                d={adelante}
                fill="none"
                stroke={color}
                strokeLinecap="round"
                style={{ strokeWidth: ANCHO_CINTA[estado], transition: TRANSICION }}
              />
              {rotulos && <Rotulo cinta={cinta} estado={estado} valor={valorVisible(valores?.[cinta])} desdeX={b} y={y} yRotulo={alturas[cinta]} />}
            </g>

            {onTocar && (
              <rect x={a - 8} y={y - arriba} width={b - a + 16} height={arriba + abajo} fill="transparent" {...tocable(cinta)} />
            )}
            {onTocar && rotulos && (
              <rect
                x={b + 8}
                y={Math.min(y, alturas[cinta]) - Math.min(20, SEPARACION / 2 - 2)}
                width={derecha - b - 8}
                height={Math.abs(alturas[cinta] - y) + 2 * Math.min(20, SEPARACION / 2 - 2)}
                fill="transparent"
                {...tocable(cinta)}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * El rótulo de una cinta: la línea guía desde su punta (con un codo si tuvo
 * que bajar para no pisar al de arriba), el nombre chico y gris y, debajo, lo
 * escrito en grande. La activa pinta todo con el color del negocio.
 */
function Rotulo({
  cinta,
  estado,
  valor,
  desdeX,
  y,
  yRotulo,
}: {
  cinta: Cinta;
  estado: EstadoCinta;
  valor: string | null;
  desdeX: number;
  y: number;
  yRotulo: number;
}) {
  const on = estado === "activa";
  const linea =
    yRotulo === y
      ? `M${desdeX + 5} ${y} H${X_TEXTO - 7}`
      : `M${desdeX + 5} ${y} H${X_CODO} L${X_CODO + LARGO_CODO} ${yRotulo} H${X_TEXTO - 7}`;
  const colorLinea = on ? "var(--color-primary-boton)" : estado === "cargada" ? "var(--color-primary)" : "var(--color-texto-4)";
  const colorTexto = on ? "var(--color-primary-700)" : "var(--color-texto)";
  return (
    <g data-rotulo={cinta}>
      <path
        d={linea}
        fill="none"
        stroke={colorLinea}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ strokeWidth: on ? 1.5 : 1, opacity: on ? 1 : estado === "cargada" ? 0.7 : 0.6, transition: TRANSICION }}
      />
      <circle cx={X_TEXTO - 7} cy={yRotulo} r={on ? 2.2 : 1.7} style={{ fill: colorLinea, opacity: on ? 1 : 0.8, transition: TRANSICION }} />
      <text
        x={X_TEXTO}
        y={yRotulo - 6}
        fontSize={10.5}
        fontWeight={on ? 700 : 600}
        letterSpacing={0.2}
        style={{ fill: on ? "var(--color-primary-700)" : "var(--color-texto-3)", transition: TRANSICION }}
      >
        {NOMBRE[cinta]}
      </text>
      <text x={X_TEXTO} y={yRotulo + 14} data-valor="" style={{ fontVariantNumeric: "tabular-nums" }}>
        {valor != null ? (
          <>
            <tspan fontSize={19} fontWeight={700} style={{ fill: colorTexto, transition: TRANSICION }}>
              {valor}
            </tspan>
            <tspan fontSize={11.5} fontWeight={600} dx={1} style={{ fill: on ? "var(--color-primary-700)" : "var(--color-texto-3)", transition: TRANSICION }}>
              {" cm"}
            </tspan>
          </>
        ) : (
          <tspan fontSize={19} fontWeight={500} style={{ fill: on ? "var(--color-primary)" : "var(--color-texto-4)", transition: TRANSICION }}>
            —
          </tspan>
        )}
      </text>
    </g>
  );
}
