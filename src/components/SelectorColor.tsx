import { useId, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { colorDeHex, FAMILIAS, PALETA, TONOS, type ColorPaleta } from "../lib/colores/paleta";

/**
 * El selector de color del sistema (12-oct-2026): el mismo en la página, el
 * anuncio, la agenda y el personal, con la misma paleta de 10 familias × 4
 * tonos (`lib/colores/paleta.ts`).
 *
 * A la vista, sólo lo elegido en una fila con "Cambiar" (como el resto de las
 * elecciones de Mi página). Al abrirlo, en el lugar (no en un popup: varios
 * viven dentro de un modal y un modal adentro de otro se cierra junto con él
 * al apretar Escape):
 *   - una vista previa que muestra el color sobre el que está el mouse o el
 *     foco, ANTES de elegirlo, y el elegido después;
 *   - los sugeridos (del logo, del estilo), si los hay;
 *   - la grilla: cada columna es una familia y baja de vivo a profundo;
 *   - "Automático" / "Sin color" y "Otro color" (selector del navegador + hex
 *     a mano), sólo donde ese dato lo admite.
 */

const HEX = /^#[0-9A-Fa-f]{6}$/;

export interface GrupoSugerido {
  titulo: string;
  hexes: string[];
}

export function SelectorColor({
  etiqueta,
  valor,
  onCambio,
  colores = PALETA,
  libre = false,
  automatico,
  sinColor = false,
  sugeridos = [],
  vistaPrevia,
  ayuda,
}: {
  etiqueta: string;
  /** Hex elegido; null = automático o sin color (según cuál se admita). */
  valor: string | null;
  onCambio: (hex: string | null) => void;
  /** La paleta, o la parte que este dato admite (los huecos quedan vacíos). */
  colores?: readonly ColorPaleta[];
  /** Admite un color fuera de la paleta. */
  libre?: boolean;
  /** Admite "Automático" (null): el color que se usaría en ese caso. */
  automatico?: { hex: string };
  /** Admite "Sin color" (null). */
  sinColor?: boolean;
  sugeridos?: GrupoSugerido[];
  /** Cómo se ve ese color donde se usa (null = automático o sin color); sin esto, una muestra general. */
  vistaPrevia?: (hex: string | null) => ReactNode;
  ayuda?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  // El color bajo el mouse o el foco: se previsualiza sin elegirlo.
  const [encima, setEncima] = useState<string | null | undefined>(undefined);
  const [tecleado, setTecleado] = useState<string | null>(null);
  const idPanel = useId();

  const actual = valor ? valor.toUpperCase() : null;
  const enPaleta = colorDeHex(actual);
  const propio = actual !== null && !enPaleta;
  const mostrado = encima !== undefined ? encima : actual;
  // La muestra general pinta, en automático, el color automático.
  const hexPrevia = mostrado ?? automatico?.hex ?? null;
  const conNulo = !!automatico || sinColor;
  const nombreNulo = automatico ? "Automático" : "Sin color";

  const resumen = actual === null ? nombreNulo : enPaleta ? enPaleta.nombre : `Color propio ${actual}`;
  const elegir = (hex: string | null) => {
    onCambio(hex);
    setEncima(undefined);
  };
  const previsualizar = (hex: string | null) => ({
    onMouseEnter: () => setEncima(hex),
    onFocus: () => setEncima(hex),
    onBlur: () => setEncima(undefined),
  });

  const celda = (familia: string, tono: number) => {
    const c = colores.find((x) => x.familia === familia && x.tono === tono);
    if (!c) return <span key={`${familia}-${tono}`} aria-hidden="true" />;
    const elegido = actual === c.hex;
    return (
      <button
        key={c.clave}
        type="button"
        role="radio"
        aria-checked={elegido}
        aria-label={c.nombre}
        title={`${c.nombre} · ${c.familia}, tono ${TONOS[c.tono].toLowerCase()}`}
        onClick={() => elegir(c.hex)}
        {...previsualizar(c.hex)}
        className={`flex aspect-square w-full items-center justify-center rounded-lg transition-transform hover:scale-110 focus-visible:scale-110 focus-visible:outline-none ${
          elegido ? "ring-2 ring-texto ring-offset-2" : ""
        }`}
        style={{ background: c.hex }}
      >
        {elegido && <Icon name="check" size={14} className="text-white" />}
      </button>
    );
  };

  return (
    <div className="space-y-1.5">
      <span className="block text-[13px] font-semibold text-texto-2">{etiqueta}</span>
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={idPanel}
        aria-label={`${etiqueta}: ${resumen}. ${abierto ? "Listo" : "Cambiar"}`}
        onClick={() => setAbierto((a) => !a)}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-borde bg-white px-3 py-2 text-left transition-colors hover:bg-muted"
      >
        <Circulo hex={actual ?? automatico?.hex ?? null} auto={actual === null && !!automatico} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-texto">{resumen}</span>
          {enPaleta && (
            <span className="block truncate text-xs text-texto-3">
              {enPaleta.familia}, tono {TONOS[enPaleta.tono].toLowerCase()}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-texto-3">
          {abierto ? "Listo" : "Cambiar"}
          <Icon name={abierto ? "chevronDown" : "chevronRight"} size={15} />
        </span>
      </button>

      {abierto && (
        <div id={idPanel} className="space-y-3 rounded-xl border border-borde bg-white p-3">
          <div className="rounded-lg bg-muted p-3" aria-live="polite">
            {vistaPrevia ? vistaPrevia(mostrado) : <PreviaGeneral hex={hexPrevia} />}
            <p className="mt-2 truncate text-xs text-texto-3">{describir(mostrado, automatico?.hex, sinColor)}</p>
          </div>

          {sugeridos
            .filter((g) => g.hexes.length > 0)
            .map((g) => (
              <div key={g.titulo} className="space-y-1.5">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-texto-3">{g.titulo}</span>
                <div className="flex flex-wrap gap-1.5">
                  {g.hexes.map((h) => {
                    const c = colorDeHex(h);
                    const nombre = c?.nombre ?? h.toUpperCase();
                    const elegido = actual === h.toUpperCase();
                    return (
                      <button
                        key={h}
                        type="button"
                        aria-pressed={elegido}
                        aria-label={`${g.titulo}: ${nombre}`}
                        onClick={() => elegir(h.toUpperCase())}
                        {...previsualizar(h.toUpperCase())}
                        className={`flex items-center gap-1.5 rounded-full border bg-white py-1 pl-1 pr-2.5 text-xs font-semibold ${
                          elegido ? "border-texto text-texto" : "border-borde text-texto-2 hover:bg-muted"
                        }`}
                      >
                        <span className="block h-5 w-5 rounded-full" style={{ background: h }} />
                        {nombre}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

          <div role="radiogroup" aria-label={etiqueta} className="space-y-2" onMouseLeave={() => setEncima(undefined)}>
            {conNulo && (
              <button
                type="button"
                role="radio"
                aria-checked={actual === null}
                aria-label={`${etiqueta}: ${nombreNulo.toLowerCase()}`}
                onClick={() => elegir(null)}
                {...previsualizar(null)}
                className={`flex items-center gap-2 rounded-full border bg-white py-1 pl-1 pr-3 text-xs font-semibold ${
                  actual === null ? "border-texto text-texto" : "border-borde text-texto-2 hover:bg-muted"
                }`}
              >
                <Circulo hex={automatico?.hex ?? null} auto={!!automatico} chico />
                {nombreNulo}
              </button>
            )}
            <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
              {TONOS.map((_, tono) => FAMILIAS.map((f) => celda(f, tono)))}
            </div>
          </div>
          <p className="text-[11px] text-texto-4">Cada columna es un color: arriba, el más vivo; abajo, el más profundo.</p>

          {libre && (
            <div className={`flex items-center gap-2 rounded-lg p-1.5 ${propio ? "ring-2 ring-texto" : ""}`}>
              <span className="shrink-0 text-xs font-semibold text-texto-2">Otro color</span>
              <input
                type="color"
                aria-label={`${etiqueta}: elegir otro`}
                value={(actual ?? automatico?.hex ?? "#7357B8").toLowerCase()}
                onChange={(ev) => elegir(ev.target.value.toUpperCase())}
                className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-borde bg-white p-1"
              />
              <input
                aria-label={`${etiqueta} en hex`}
                value={tecleado ?? actual ?? ""}
                placeholder="#RRGGBB"
                maxLength={7}
                onChange={(ev) => {
                  const v = ev.target.value.trim();
                  setTecleado(v);
                  if (v === "") return conNulo ? elegir(null) : undefined;
                  const hex = v.startsWith("#") ? v : `#${v}`;
                  if (HEX.test(hex)) elegir(hex.toUpperCase());
                }}
                onBlur={() => setTecleado(null)}
                className="min-w-0 flex-1 rounded-lg border border-borde bg-white px-2.5 py-1.5 font-mono text-sm uppercase text-texto outline-none placeholder:font-sans placeholder:normal-case placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
            </div>
          )}
          {ayuda && <span className="block text-xs text-texto-4">{ayuda}</span>}
        </div>
      )}
    </div>
  );
}

/** El círculo de lo elegido; en automático, partido con una "A". */
function Circulo({ hex, auto = false, chico = false }: { hex: string | null; auto?: boolean; chico?: boolean }) {
  const lado = chico ? "h-5 w-5" : "h-8 w-8";
  if (!hex)
    return <span aria-hidden="true" className={`block shrink-0 rounded-full border-2 border-dashed border-texto-4 ${lado}`} />;
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${lado}`}
      style={{ background: hex, boxShadow: "0 0 0 1px #E5E7EB" }}
    >
      {auto ? "A" : null}
    </span>
  );
}

/** La muestra de siempre: el color de fondo con letra blanca y como letra sobre blanco. */
function PreviaGeneral({ hex }: { hex: string | null }) {
  if (!hex)
    return (
      <div className="flex h-16 items-center justify-center rounded-lg border-2 border-dashed border-texto-4 text-sm text-texto-3">
        Sin color
      </div>
    );
  return (
    <div className="flex items-stretch gap-3">
      <span
        className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white"
        style={{ background: hex }}
      >
        Aa
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-2 rounded-lg bg-white px-3">
        <span className="truncate text-sm font-bold" style={{ color: hex }}>
          Así se lee como texto
        </span>
        <span className="block h-1.5 w-full rounded-full" style={{ background: `color-mix(in srgb, ${hex} 22%, white)` }}>
          <span className="block h-full w-2/3 rounded-full" style={{ background: hex }} />
        </span>
      </span>
    </div>
  );
}

function describir(hex: string | null, automatico: string | undefined, sinColor: boolean): string {
  if (hex === null) return automatico ? `Automático (${automatico.toUpperCase()})` : sinColor ? "Sin color" : "";
  const c: ColorPaleta | null = colorDeHex(hex);
  return c ? `${c.nombre} · ${c.familia}, tono ${TONOS[c.tono].toLowerCase()} · ${c.hex}` : `Color propio · ${hex.toUpperCase()}`;
}
