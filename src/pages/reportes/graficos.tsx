import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { pct } from "./formato";
import { caminoSuave, escala } from "./trazos";

/**
 * Los gráficos de Reportes, en SVG a mano: la web no tiene librería de
 * gráficos y para cinco formas no vale sumar cien kilos al paquete que baja
 * cada negocio. Todos se dibujan con el ancho real del contenedor (y no con un
 * viewBox estirado), así el texto de los ejes no se deforma en un celular.
 *
 * Los colores de las líneas y barras siguen al tema del negocio; las
 * categorías (dona) usan una paleta fija, porque el tema da un solo color.
 */

/** El ancho del contenedor, al día con los cambios de tamaño. En los tests (sin ResizeObserver), 640. */
function useAncho<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.clientWidth) setAncho(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entradas) => {
      const w = entradas[0]?.contentRect.width;
      if (w) setAncho(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho];
}

export interface PuntoLinea {
  /** Lo que va en el eje ("2 oct", "10p"). */
  etiqueta: string;
  /** Lo que va en el globo al tocar ("Sáb 3 oct"). */
  detalle?: string;
  valor: number;
  /** El mismo punto del período anterior. Null si no hay. */
  anterior?: number | null;
}

/**
 * Línea del período con la del anterior punteada, el promedio y el pico
 * marcados. Se toca (o se pasa el mouse) para ver cada punto.
 */
export function LineaComparada({
  puntos,
  formato,
  formatoEje,
  promedio,
  etiquetaPromedio,
  nombreActual,
  nombreAnterior,
  tope,
  alto = 250,
}: {
  puntos: PuntoLinea[];
  formato: (n: number) => string;
  formatoEje: (n: number) => string;
  promedio?: number | null;
  etiquetaPromedio?: string;
  nombreActual: string;
  nombreAnterior?: string;
  /** Un tope fijo para el eje (1 = 100 % en la ocupación). */
  tope?: number;
  alto?: number;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [foco, setFoco] = useState<number | null>(null);
  const izq = 46;
  const der = 18;
  const arriba = 30;
  const abajo = 28;
  const w = Math.max(240, ancho);
  const altoUtil = alto - arriba - abajo;

  const maximo = Math.max(0, ...puntos.map((p) => Math.max(p.valor, p.anterior ?? 0)), promedio ?? 0);
  const esc = tope != null ? { tope, paso: tope / 4 } : escala(maximo);
  const y = (v: number) => arriba + altoUtil - (Math.max(0, v) / esc.tope) * altoUtil;
  const x = (i: number) => (puntos.length <= 1 ? izq + (w - izq - der) / 2 : izq + (i * (w - izq - der)) / (puntos.length - 1));

  const actuales = puntos.map((p, i) => [x(i), y(p.valor)] as [number, number]);
  const anteriores = puntos.flatMap((p, i) => (p.anterior == null ? [] : [[x(i), y(p.anterior)] as [number, number]]));
  const linea = caminoSuave(actuales);
  const area = actuales.length > 1 ? `${linea}L${actuales[actuales.length - 1][0]},${arriba + altoUtil}L${actuales[0][0]},${arriba + altoUtil}Z` : "";
  const iMax = puntos.reduce((mejor, p, i) => (p.valor > puntos[mejor].valor ? i : mejor), 0);
  const hayPico = puntos.length > 0 && puntos[iMax].valor > 0;
  const paso = Math.max(1, Math.ceil(puntos.length / Math.max(2, Math.floor((w - izq) / 70))));
  const marcas = Array.from({ length: Math.round(esc.tope / esc.paso) + 1 }, (_, k) => k * esc.paso);
  const idGradiente = useMemo(() => `area-${Math.random().toString(36).slice(2, 8)}`, []);

  const alMover = (clientX: number) => {
    const el = ref.current;
    if (!el || puntos.length === 0) return;
    const rel = clientX - el.getBoundingClientRect().left;
    const i = puntos.length <= 1 ? 0 : Math.round(((rel - izq) / (w - izq - der)) * (puntos.length - 1));
    setFoco(Math.max(0, Math.min(puntos.length - 1, i)));
  };

  const p = foco != null ? puntos[foco] : null;
  const resumen = hayPico ? `${nombreActual}: pico de ${formato(puntos[iMax].valor)} el ${puntos[iMax].detalle ?? puntos[iMax].etiqueta}` : nombreActual;

  return (
    <div
      ref={ref}
      className="relative w-full touch-pan-y select-none"
      onPointerMove={(e) => alMover(e.clientX)}
      onPointerDown={(e) => alMover(e.clientX)}
      onPointerLeave={() => setFoco(null)}
    >
      <svg width={w} height={alto} role="img" aria-label={resumen} className="block overflow-visible">
        <defs>
          <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={izq} x2={w - der} y1={y(m)} y2={y(m)} stroke="#E2E8F0" strokeDasharray={m === 0 ? undefined : "3 4"} />
            <text x={izq - 8} y={y(m) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
              {formatoEje(m)}
            </text>
          </g>
        ))}
        {area && <path d={area} fill={`url(#${idGradiente})`} />}
        {anteriores.length > 1 && <path d={caminoSuave(anteriores)} fill="none" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5 5" />}
        {promedio != null && promedio > 0 && (
          <line x1={izq} x2={w - der} y1={y(promedio)} y2={y(promedio)} stroke="var(--color-primary-700)" strokeWidth={1.5} strokeDasharray="6 5" />
        )}
        {linea && <path d={linea} fill="none" stroke="var(--color-primary-boton)" strokeWidth={2.5} strokeLinejoin="round" />}
        {puntos.length <= 31 &&
          actuales.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={i === iMax && hayPico ? 5 : 3.5} fill="#fff" stroke="var(--color-primary-boton)" strokeWidth={2} />
          ))}
        {p && foco != null && (
          <line x1={x(foco)} x2={x(foco)} y1={arriba - 6} y2={arriba + altoUtil} stroke="#94A3B8" strokeDasharray="2 3" />
        )}
        {puntos.map((pt, i) =>
          i % paso === 0 || i === puntos.length - 1 ? (
            <text key={i} x={x(i)} y={alto - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
              {pt.etiqueta}
            </text>
          ) : null,
        )}
      </svg>

      {/* Los globos van en HTML: un texto con fondo redondeado en SVG obliga a medirlo. */}
      {promedio != null && promedio > 0 && etiquetaPromedio && (
        <span
          className="pointer-events-none absolute -translate-y-1/2 whitespace-nowrap rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[10.5px] font-bold text-primary-700"
          style={{ left: izq + 6, top: y(promedio) }}
        >
          {etiquetaPromedio}
        </span>
      )}
      {hayPico && foco == null && (
        <span
          className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-full bg-primary-boton px-2 py-0.5 text-[10.5px] font-bold text-white"
          style={{ left: Math.min(w - 40, Math.max(40, x(iMax))), top: Math.max(0, y(puntos[iMax].valor) - 26) }}
        >
          {formato(puntos[iMax].valor)}
        </span>
      )}
      {p && foco != null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-borde bg-white px-3 py-2 text-[12px] shadow-lg"
          style={{ left: Math.min(w - 90, Math.max(90, x(foco))), top: 0 }}
        >
          <p className="font-bold text-texto">{p.detalle ?? p.etiqueta}</p>
          <p className="tabular-nums text-texto-2">
            {nombreActual}: <b className="text-texto">{formato(p.valor)}</b>
          </p>
          {p.anterior != null && nombreAnterior && (
            <p className="tabular-nums text-texto-3">
              {nombreAnterior}: {formato(p.anterior)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export interface ParteDona {
  etiqueta: string;
  valor: number;
  color: string;
}

/** Dona con el total al medio. Sin nada que repartir, un anillo gris. */
export function Dona({
  partes,
  centroTitulo,
  centroValor,
  tamano = 200,
  grosor = 30,
}: {
  partes: ParteDona[];
  centroTitulo: string;
  centroValor: ReactNode;
  tamano?: number;
  grosor?: number;
}) {
  const r = (tamano - grosor) / 2;
  const c = 2 * Math.PI * r;
  const total = partes.reduce((a, p) => a + Math.max(0, p.valor), 0);
  const visibles = partes.filter((p) => p.valor > 0);
  const hueco = visibles.length > 1 ? 2.5 : 0;
  let acumulado = 0;
  const resumen = visibles.map((p) => `${p.etiqueta} ${pct(total ? p.valor / total : null)}`).join(", ");

  return (
    <div className="relative mx-auto" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} role="img" aria-label={resumen || "Sin datos"} className="-rotate-90">
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={grosor} />
        {total > 0 &&
          visibles.map((p) => {
            const largo = (p.valor / total) * c;
            const trazo = Math.max(0, largo - hueco);
            const desde = acumulado;
            acumulado += largo;
            return (
              <circle
                key={p.etiqueta}
                cx={tamano / 2}
                cy={tamano / 2}
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={grosor}
                strokeDasharray={`${trazo} ${c - trazo}`}
                strokeDashoffset={-desde}
              >
                <title>{`${p.etiqueta}: ${pct(p.valor / total)}`}</title>
              </circle>
            );
          })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[12px] text-texto-3">{centroTitulo}</span>
        <span className="text-[22px] font-extrabold tabular-nums text-texto">{centroValor}</span>
      </div>
    </div>
  );
}

/**
 * Barras verticales (ventas por hora, por día de la semana). La más alta va
 * oscura y con su número arriba; las demás, claras.
 */
export function BarrasVerticales({
  barras,
  formato,
  alto = 170,
}: {
  barras: { etiqueta: string; valor: number; detalle?: string }[];
  formato: (n: number) => string;
  alto?: number;
}) {
  const max = Math.max(0, ...barras.map((b) => b.valor));
  const iMax = barras.findIndex((b) => b.valor === max && max > 0);
  return (
    <div>
      <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: alto }}>
        {barras.map((b, i) => (
          <div key={b.etiqueta} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            {i === iMax && (
              <span className="absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-full bg-primary-50 px-1.5 py-0.5 text-[10.5px] font-bold text-primary-700">
                {formato(b.valor)}
              </span>
            )}
            <span
              className={`w-full max-w-12 rounded-t-md ${i === iMax ? "bg-primary" : "bg-primary/35"}`}
              style={{ height: `${max > 0 ? Math.max(2, (b.valor / max) * 100) : 2}%` }}
              title={`${b.detalle ?? b.etiqueta}: ${formato(b.valor)}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 sm:gap-2">
        {barras.map((b) => (
          <span key={b.etiqueta} className="min-w-0 flex-1 truncate text-center text-[11px] text-texto-3">
            {b.etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Mapa de calor día × hora (la ocupación del billar). Más oscuro = más lleno,
 * en el color del negocio. Las celdas sin dato (el local cerrado) quedan
 * blancas: un cero se pinta, un "no abrió" no.
 */
export function MapaCalor({
  filas,
  columnas,
  valores,
  detalle,
}: {
  filas: string[];
  columnas: string[];
  /** valores[fila][columna], de 0 a 1. */
  valores: (number | null)[][];
  /** El globo de una celda: "Vie 11 pm · 88 % ocupado". */
  detalle: (fila: number, columna: number, v: number) => string;
}) {
  const [foco, setFoco] = useState<{ f: number; c: number } | null>(null);
  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[560px] gap-1"
        style={{ gridTemplateColumns: `40px repeat(${columnas.length}, minmax(0, 1fr))` }}
        onPointerLeave={() => setFoco(null)}
      >
        <span />
        {columnas.map((c) => (
          <span key={c} className="text-center text-[11px] text-texto-3">
            {c}
          </span>
        ))}
        {filas.map((f, i) => (
          <FilaCalor key={f} nombre={f}>
            {columnas.map((c, j) => {
              const v = valores[i]?.[j];
              const lleno = v == null ? 0 : Math.round(Math.max(0, Math.min(1, v)) * 100);
              const enFoco = foco?.f === i && foco?.c === j;
              return (
                <span
                  key={c}
                  onPointerEnter={() => v != null && setFoco({ f: i, c: j })}
                  onPointerDown={() => v != null && setFoco({ f: i, c: j })}
                  className={`relative flex h-8 items-center justify-center rounded-md text-[11.5px] font-semibold tabular-nums ${
                    lleno > 55 ? "text-white" : "text-texto-2"
                  } ${enFoco ? "ring-2 ring-texto/60" : ""}`}
                  style={{
                    background: v == null ? "#F8FAFC" : `color-mix(in srgb, var(--color-primary-boton) ${Math.max(8, lleno)}%, var(--color-primary-50))`,
                  }}
                  title={v == null ? undefined : detalle(i, j, v)}
                >
                  {v == null ? "" : lleno}
                  {enFoco && v != null && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white">
                      {detalle(i, j, v)}
                    </span>
                  )}
                </span>
              );
            })}
          </FilaCalor>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12px] text-texto-3">
        Vacío
        <span className="h-2 w-28 rounded-full bg-[linear-gradient(90deg,var(--color-primary-50),var(--color-primary-boton))]" />
        Lleno
      </div>
    </div>
  );
}

function FilaCalor({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <>
      <span className="flex items-center text-[12px] font-semibold text-texto-2">{nombre}</span>
      {children}
    </>
  );
}

/**
 * La barra de "cómo vas": lo vendido contra la meta, con la meta marcada.
 * Pasada la meta la barra se llena hasta el final y la marca queda donde está.
 */
export function ProgresoMeta({
  valor,
  meta,
  etiquetaMeta,
  valorMeta,
  marcaExtra,
}: {
  valor: number;
  meta: number;
  etiquetaMeta: string;
  valorMeta: string;
  /** Otra marca fina (en qué parte del mes estamos), de 0 a 1. */
  marcaExtra?: { fraccion: number; etiqueta: string };
}) {
  const fondo = Math.max(valor, meta) * 1.08 || 1;
  const fv = Math.min(1, valor / fondo);
  const fm = Math.min(1, meta / fondo);
  return (
    <div className="pt-12">
      <div className="relative h-3.5 rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-primary" style={{ width: `${fv * 100}%` }} />
        <div className="absolute -top-1.5 h-6.5 w-0.5 -translate-x-1/2 bg-texto" style={{ left: `${fm * 100}%` }} />
        <div className="absolute bottom-full mb-2 flex -translate-x-1/2 flex-col items-center gap-1" style={{ left: `${fm * 100}%` }}>
          <span className="whitespace-nowrap rounded-md bg-texto px-1.5 py-0.5 text-[10.5px] font-bold text-white">{etiquetaMeta}</span>
          <span className="whitespace-nowrap rounded-md bg-texto px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-white">{valorMeta}</span>
        </div>
        {marcaExtra && (
          <div
            className="absolute top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-semibold text-texto-3"
            style={{ left: `${Math.min(1, Math.max(0, marcaExtra.fraccion)) * 100}%` }}
          >
            ▲ {marcaExtra.etiqueta}
          </div>
        )}
      </div>
    </div>
  );
}
