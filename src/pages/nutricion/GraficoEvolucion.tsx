import { useEffect, useRef, useState } from "react";
import { fechaCorta, fechaLarga, fmtNumero, sufijoDelDia } from "../../lib/nutricion/calculo";
import { caminoSuave } from "../reportes/trazos";

/**
 * La evolución de una medida entre controles: una línea con sus puntos, con
 * la misma técnica que los gráficos de Reportes (SVG a mano, con el ancho real
 * del contenedor y la curva que no se pasa de largo). A diferencia de las
 * ventas, el eje NO arranca en cero: 82 → 79 kg tiene que verse como una
 * bajada, no como una línea plana arriba de todo.
 */

/** El ancho del contenedor, al día. Sin ResizeObserver (los tests), 640. */
function useAncho() {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.clientWidth) setAncho(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((e) => {
      const w = e[0]?.contentRect.width;
      if (w) setAncho(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

/** Un eje con números redondos que abraza los valores (con aire arriba y abajo). */
function ejeAjustado(min: number, max: number, pasos = 4): { desde: number; hasta: number; paso: number } {
  const rango = max - min;
  const base = rango > 0 ? rango : Math.max(Math.abs(max) * 0.1, 1);
  const crudo = (base * 1.3) / pasos;
  const mag = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((x) => x >= crudo) ?? 10 * mag;
  const medio = (min + max) / 2;
  let desde = Math.floor((medio - (paso * pasos) / 2) / paso) * paso;
  if (min >= 0 && desde < 0) desde = 0;
  let hasta = desde + paso * pasos;
  while (hasta < max) hasta += paso;
  while (desde > min) desde -= paso;
  return { desde, hasta, paso };
}

export default function GraficoEvolucion({
  puntos,
  formato,
  nombre,
  alto = 220,
}: {
  /**
   * `vez`: el segundo control del mismo día lleva «(2)» en el eje. `chico`: un
   * peso del seguimiento semanal, con un punto más chico (§4.4 del
   * seguimiento). `etiqueta`: lo que va en el eje en vez de la fecha
   * («Sem. 6» en la hoja de seguimiento); la fecha sigue en el globo.
   */
  puntos: { fecha: string; valor: number; vez?: number; chico?: boolean; etiqueta?: string }[];
  /** «82,4 kg». */
  formato: (n: number) => string;
  /** «Peso», para el lector de pantalla. */
  nombre: string;
  alto?: number;
}) {
  const [ref, ancho] = useAncho();
  const [foco, setFoco] = useState<number | null>(null);
  if (!puntos.length) return null;
  const izq = 44;
  const der = 18;
  const arriba = 26;
  const abajo = 26;
  const w = Math.max(260, ancho);
  const util = alto - arriba - abajo;

  const valores = puntos.map((x) => x.valor);
  const eje = ejeAjustado(Math.min(...valores), Math.max(...valores));
  const y = (v: number) => arriba + util - ((v - eje.desde) / (eje.hasta - eje.desde)) * util;
  const x = (i: number) => (puntos.length <= 1 ? izq + (w - izq - der) / 2 : izq + (i * (w - izq - der)) / (puntos.length - 1));
  const pts = puntos.map((pt, i) => [x(i), y(pt.valor)] as [number, number]);
  const linea = caminoSuave(pts);
  const marcas = Array.from({ length: Math.round((eje.hasta - eje.desde) / eje.paso) + 1 }, (_, k) => eje.desde + k * eje.paso);
  // Las fechas del eje no se pisan: una de cada `salto`, y siempre la última.
  const salto = Math.max(1, Math.ceil(puntos.length / Math.max(2, Math.floor((w - izq) / 64))));
  // Muchos puntos juntos (30 semanas en el teléfono): puntos chicos y llenos, que no se monten unos sobre otros.
  const apretado = puntos.length > 1 && (w - izq - der) / (puntos.length - 1) < 12;

  const alMover = (clientX: number) => {
    const el = ref.current;
    if (!el || !puntos.length) return;
    const rel = clientX - el.getBoundingClientRect().left;
    const i = puntos.length <= 1 ? 0 : Math.round(((rel - izq) / (w - izq - der)) * (puntos.length - 1));
    setFoco(Math.max(0, Math.min(puntos.length - 1, i)));
  };

  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  const resumen = puntos.length
    ? `${nombre}: ${formato(primero.valor)} el ${fechaLarga(primero.fecha)}${puntos.length > 1 ? `, ${formato(ultimo.valor)} el ${fechaLarga(ultimo.fecha)}${sufijoDelDia(ultimo.vez)}` : ""}`
    : nombre;
  const f = foco != null ? puntos[foco] : null;

  // El globo del último valor: centrado en el último punto (sin salirse), y
  // arriba del punto MÁS ALTO que quede debajo de él. Antes iba sólo arriba
  // del último y, con el peso bajando, tapaba los dos o tres de antes. Si
  // arriba no entra, va debajo del más bajo de esos.
  const textoUltimo = ultimo ? formato(ultimo.valor) : "";
  const anchoGlobo = textoUltimo.length * 6.6 + 18;
  const centroGlobo = ultimo ? Math.min(w - anchoGlobo / 2, Math.max(izq, x(puntos.length - 1))) : 0;
  const debajoDelGlobo = pts.filter(([cx]) => Math.abs(cx - centroGlobo) <= anchoGlobo / 2 + 6).map(([, cy]) => cy);
  const arribaDeTodos = debajoDelGlobo.length ? Math.min(...debajoDelGlobo) - 30 : 0;
  const topGlobo = arribaDeTodos >= 0 ? arribaDeTodos : Math.min(alto - abajo - 22, Math.max(...debajoDelGlobo) + 10);

  return (
    <div
      ref={ref}
      className="relative w-full touch-pan-y select-none"
      onPointerMove={(e) => alMover(e.clientX)}
      onPointerDown={(e) => alMover(e.clientX)}
      onPointerLeave={() => setFoco(null)}
    >
      <svg width={w} height={alto} role="img" aria-label={resumen} className="block overflow-visible">
        {marcas.map((m) => (
          <g key={m}>
            <line x1={izq} x2={w - der} y1={y(m)} y2={y(m)} stroke="var(--color-borde)" strokeDasharray={m === eje.desde ? undefined : "3 4"} />
            <text x={izq - 8} y={y(m) + 4} textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">
              {fmtNumero(m, 2)}
            </text>
          </g>
        ))}
        {pts.length > 1 && <path d={linea} fill="none" stroke="var(--color-primary-boton)" strokeWidth={2.5} strokeLinejoin="round" />}
        {f && foco != null && <line x1={x(foco)} x2={x(foco)} y1={arriba - 6} y2={arriba + util} stroke="#94A3B8" strokeDasharray="2 3" />}
        {pts.map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={i === foco || puntos.length === 1 ? 5.5 : puntos[i].chico ? 2.75 : apretado ? 2.5 : 4}
            fill={(puntos[i].chico || apretado) && i !== foco ? "var(--color-primary-boton)" : "#fff"}
            stroke="var(--color-primary-boton)"
            strokeWidth={puntos[i].chico || apretado ? 1.5 : 2.25}
          />
        ))}
        {puntos.map((pt, i) =>
          // La última va siempre; la de la grilla que le queda pegada, no (se pisaban «Sem. 6Sem. 7»).
          (i % salto === 0 && puntos.length - 1 - i >= salto) || i === puntos.length - 1 ? (
            <text key={i} x={x(i)} y={alto - 6} textAnchor="middle" className="fill-slate-500 text-[11px]">
              {pt.etiqueta ?? `${fechaCorta(pt.fecha)}${sufijoDelDia(pt.vez)}`}
            </text>
          ) : null,
        )}
      </svg>
      {/* El valor del último punto, siempre a la vista; el de los demás, al tocarlos. */}
      {foco == null && ultimo && (
        <span
          className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-full bg-primary-boton px-2 py-0.5 text-[11px] font-bold tabular-nums text-white"
          style={{ left: centroGlobo, top: topGlobo }}
        >
          {textoUltimo}
        </span>
      )}
      {f && foco != null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-borde bg-white px-3 py-2 text-[12px] shadow-lg"
          style={{ left: Math.min(w - 80, Math.max(80, x(foco))), top: 0 }}
        >
          <p className="font-bold text-texto">
            {f.etiqueta && <>{f.etiqueta} · </>}
            {fechaLarga(f.fecha)}
            {sufijoDelDia(f.vez)}
          </p>
          <p className="tabular-nums text-texto-2">{formato(f.valor)}</p>
        </div>
      )}
    </div>
  );
}
