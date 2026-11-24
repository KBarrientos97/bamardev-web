import type { KeyboardEvent } from "react";
import { useAncho } from "../../lib/agenda/useEsCelular";
import { fmtNumero, posicionEnMedidor, rangoDe } from "../../lib/nutricion/calculo";
import { colorDeEscalaImc } from "../../lib/nutricion/tonos";
import type { Rango } from "../../lib/nutricion/tipos";

/**
 * El medidor del IMC en semicírculo, como el de la hoja de la doctora
 * (CONTRATO-nutricion-evaluacion-22nov §4.2, etapa 4): un sector por grado de
 * la tabla (que llega del backend), del celeste al rojo, con los cortes por
 * fuera del arco y una aguja en el IMC. Tocar un sector elige ese grado, lo
 * mismo que un clic en la fila de la tabla. Sin IMC se ve igual, sin aguja.
 *
 * Los colores son los de la hoja y no los del negocio: es una escala que se
 * lee igual en todos lados. Los nombres van adentro de cada sector; si el
 * medidor queda angosto (un celular), van como leyenda debajo, para que no
 * queden chicos ni encimados.
 */

/** El color del sector i de n (la escala de la hoja, `ESCALA_IMC`): con otra cantidad de grados, se reparte la misma escala. */
const colorDe = colorDeEscalaImc;

// Con lugar a los costados para los números de los cortes.
const ANCHO = 340;
const ALTO = 184;
const CX = 170;
const CY = 170;
const R = 148;
const r = 86;
/** Desde este ancho en pantalla (px) los nombres entran cómodos adentro de los sectores. */
const ANCHO_CON_NOMBRES = 340;

const rad = (grados: number) => (grados * Math.PI) / 180;
const punto = (grados: number, radio: number): [number, number] => [CX + radio * Math.cos(rad(grados)), CY - radio * Math.sin(rad(grados))];
const p2 = ([x, y]: [number, number]) => `${x.toFixed(2)} ${y.toFixed(2)}`;

/** El sector entre dos ángulos (de izquierda a derecha, por arriba). El elegido sobresale un poco. */
function sector(desde: number, hasta: number, afuera = R): string {
  return [
    `M${p2(punto(desde, afuera))}`,
    `A${afuera} ${afuera} 0 0 1 ${p2(punto(hasta, afuera))}`,
    `L${p2(punto(hasta, r))}`,
    `A${r} ${r} 0 0 0 ${p2(punto(desde, r))}`,
    "Z",
  ].join(" ");
}

/** El nombre en dos renglones si tiene más de una palabra («Obesidad / grado 1»). */
function renglones(nombre: string): string[] {
  const espacios = [...nombre.matchAll(/ /g)].map((m) => m.index ?? 0);
  if (!espacios.length) return [nombre];
  const medio = nombre.length / 2;
  const corte = espacios.reduce((a, b) => (Math.abs(b - medio) < Math.abs(a - medio) ? b : a));
  return [nombre.slice(0, corte), nombre.slice(corte + 1)];
}

export default function MedidorImc({
  rangos,
  valor,
  elegido,
  onElegir,
  className = "",
}: {
  /** Los rangos de la tabla del IMC (`catalogo.tablas.imc`). */
  rangos: Rango[] | undefined;
  valor: number | null;
  /** El grado elegido a mano (null = el de la tabla). */
  elegido: string | null;
  /** Sin esto, es sólo para mirar (la planilla). */
  onElegir?: (grado: string | null) => void;
  className?: string;
}) {
  const [medir, anchoPx] = useAncho();
  if (!rangos?.length) return null;
  const n = rangos.length;
  const paso = 180 / n;
  const deTabla = rangoDe({ sexo: null, edadDesde: null, edadHasta: null, rangos }, valor)?.grado ?? null;
  const activo = elegido ?? deTabla;
  const posicion = posicionEnMedidor(valor, rangos);
  // Sin medir todavía (0), adentro: es lo que se ve en una compu.
  const nombresAdentro = anchoPx === 0 || anchoPx >= ANCHO_CON_NOMBRES;

  const tocar = (g: Rango) => {
    if (!onElegir) return;
    // La misma regla que la tabla: otra vez la elegida (o la de la tabla) vuelve a la de la tabla.
    if (g.grado === elegido || g.grado === deTabla) onElegir(null);
    else onElegir(g.grado);
  };
  const teclear = (e: KeyboardEvent, g: Rango) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    tocar(g);
  };

  return (
    <div ref={medir} className={`w-full ${className}`}>
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="mx-auto block h-auto w-full max-w-[420px] overflow-visible"
        role={onElegir ? "radiogroup" : "img"}
        aria-label={valor != null ? `Medidor del IMC: ${fmtNumero(valor)}` : "Medidor del IMC"}
      >
        {rangos.map((g, i) => {
          const a = 180 - i * paso;
          const b = 180 - (i + 1) * paso;
          const color = colorDe(i, n);
          const on = g.grado === activo;
          const [tx, ty] = punto(a - paso / 2, (R + r) / 2);
          const lineas = renglones(g.nombre);
          // Los colores no se apagan (los nombres tienen que leerse): el elegido
          // sobresale del arco y lleva el borde oscuro.
          const forma = sector(a, b, on ? R + 6 : R);
          return (
            <g
              key={g.grado}
              role={onElegir ? "radio" : undefined}
              aria-checked={onElegir ? on : undefined}
              aria-label={onElegir ? `${g.nombre}: ${g.texto}` : undefined}
              tabIndex={onElegir ? 0 : undefined}
              onClick={onElegir ? () => tocar(g) : undefined}
              onKeyDown={onElegir ? (e) => teclear(e, g) : undefined}
              className={`outline-none ${onElegir ? "cursor-pointer [&:focus-visible>path]:stroke-[var(--color-texto)]" : ""}`}
            >
              <path d={forma} fill={color.fondo} stroke="#FFFFFF" strokeWidth={2} strokeLinejoin="round" />
              {on && <path d={forma} fill="none" stroke="var(--color-texto)" strokeWidth={2.5} strokeLinejoin="round" pointerEvents="none" />}
              {nombresAdentro && (
                <text
                  x={tx}
                  y={ty - ((lineas.length - 1) * 11.5) / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={color.texto}
                  fontSize={10}
                  fontWeight={700}
                  pointerEvents="none"
                >
                  {lineas.map((l, k) => (
                    <tspan key={k} x={tx} dy={k === 0 ? 0 : 11.5}>
                      {l}
                    </tspan>
                  ))}
                </text>
              )}
            </g>
          );
        })}

        {/* Los cortes, por fuera del arco (y del sector que sobresale). */}
        {rangos.slice(0, -1).map((g, i) => {
          if (g.hasta == null) return null;
          const angulo = 180 - (i + 1) * paso;
          const [x, y] = punto(angulo, R + 14);
          const ancla = Math.abs(angulo - 90) < 1 ? "middle" : angulo > 90 ? "end" : "start";
          return (
            <text key={g.grado} x={x} y={y} textAnchor={ancla} dominantBaseline="middle" fontSize={11} fontWeight={600} fill="var(--color-texto-3)">
              {fmtNumero(g.hasta)}
            </text>
          );
        })}

        {/* La aguja: dibujada hacia arriba y girada hasta el IMC. Llega hasta el
            borde de adentro del arco: no tapa los nombres de los sectores. */}
        {posicion != null && (
          <g
            pointerEvents="none"
            style={{
              transform: `rotate(${(posicion - 0.5) * 180}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: "transform .35s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <path d={`M${CX - 5} ${CY} L${CX} ${CY - (r - 6)} L${CX + 5} ${CY} Z`} fill="var(--color-texto)" />
          </g>
        )}
        <circle cx={CX} cy={CY} r={9} fill="var(--color-texto)" />
        <circle cx={CX} cy={CY} r={3.5} fill="#FFFFFF" />
      </svg>

      {!nombresAdentro && (
        <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
          {rangos.map((g, i) => (
            <li key={g.grado} className={`flex items-center gap-1.5 text-[12px] ${g.grado === activo ? "font-bold text-texto" : "text-texto-3"}`}>
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorDe(i, n).fondo }} />
              <span className="whitespace-nowrap">{g.nombre}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
