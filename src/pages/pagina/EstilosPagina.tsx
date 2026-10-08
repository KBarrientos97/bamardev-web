import { useEffect, useState, type CSSProperties } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Modal } from "../../components/ui";
import { ICONO_BOTON, ICONO_RESERVAR, type Paleta } from "../../lib/pagina/aspecto";
import {
  cargarCatalogoLetras,
  cargarFuentesPagina,
  colorEsFondo,
  coloresAnuncio,
  CONTRASTE_MINIMO,
  ESTILOS_ANUNCIO,
  estiloBotones,
  estiloLetra,
  FORMAS,
  FORMAS_A_LA_VISTA,
  GRIS_PAGINA,
  GRUPOS_LETRA,
  HEX_COLOR,
  letraTitulo,
  LETRAS,
  LETRAS_A_LA_VISTA,
  nombreForma,
} from "../../lib/pagina/estilos";
import type { AjustesPagina, CambiosPagina, FormaBotones, Muestra, Tipografia } from "../../lib/pagina/tipos";
import { AnuncioPagina, Trazo } from "./VistaPagina";

/**
 * Los selectores de la apariencia de "Mi página" (08-oct): forma de los
 * botones y letra del nombre (tres a la vista y el resto en un popup, cada
 * opción con su muestra real) y el estilo y los colores del anuncio.
 *
 * Todo va al borrador del editor: la vista previa lo muestra al instante y se
 * manda con "Guardar cambios".
 */

/** El botón de una opción a la vista, marcado con el color de la página. */
function estiloOpcion(elegida: boolean, c: Paleta): CSSProperties {
  return {
    border: elegida ? `2px solid ${c.acento}` : "1px solid #E5E7EB",
    background: elegida ? c.tinte : "#ffffff",
    color: elegida ? c.oscuro : "#374151",
    fontWeight: elegida ? 600 : 400,
  };
}

/** La tarjeta de una opción del popup. */
function estiloTarjeta(elegida: boolean, c: Paleta): CSSProperties {
  return {
    border: elegida ? `2px solid ${c.acento}` : "1px solid #E5E7EB",
    boxShadow: elegida ? `0 0 0 1px ${c.acento}` : undefined,
  };
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="block text-[13px] font-semibold text-texto-2">{children}</span>;
}

// ── Forma de los botones ───────────────────────────────────────────────────

/** El botón principal y uno secundario de verdad, en chico, sobre el gris de la página. */
function MiniBotones({ forma, c }: { forma: string; c: Paleta }) {
  const b = estiloBotones(forma, c);
  return (
    <span
      aria-hidden="true"
      className="flex flex-col gap-2 rounded-lg p-2.5"
      style={{ background: GRIS_PAGINA.fondo }}
    >
      <span
        style={{
          minHeight: 34,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 700,
          padding: "0 10px",
          ...b.principal.estilo,
        }}
      >
        <Trazo d={ICONO_RESERVAR} color={b.principal.icono} size={14} ancho={2} />
        Reservar
      </span>
      <span
        style={{
          minHeight: 30,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          padding: "0 10px",
          ...b.secundario.estilo,
        }}
      >
        <Trazo d={ICONO_BOTON.menu} color={b.secundario.icono} size={13} />
        <span style={{ flex: 1 }}>Ver el menú</span>
      </span>
    </span>
  );
}

export function SelectorForma({
  valor,
  c,
  onCambio,
}: {
  valor: string;
  c: Paleta;
  onCambio: (f: FormaBotones) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const extra = !FORMAS_A_LA_VISTA.includes(valor as FormaBotones);
  return (
    <div className="space-y-2">
      <Etiqueta>Forma de los botones</Etiqueta>
      <div className="flex flex-wrap gap-1.5">
        {FORMAS_A_LA_VISTA.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={valor === f}
            onClick={() => onCambio(f)}
            className="h-10 min-w-[92px] flex-1 text-[13px]"
            style={{ ...estiloOpcion(valor === f, c), borderRadius: estiloBotones(f, c).principal.estilo.borderRadius }}
          >
            {nombreForma(f)}
          </button>
        ))}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-pressed={extra}
          aria-label={extra ? `Más formas (elegida: ${nombreForma(valor)})` : "Más formas"}
          onClick={() => setAbierto(true)}
          className="flex h-10 min-w-[92px] flex-1 items-center justify-center gap-1 rounded-[10px] px-2 text-[13px]"
          style={estiloOpcion(extra, c)}
        >
          {extra ? nombreForma(valor) : "Más formas"}
          <Icon name="chevronRight" size={14} />
        </button>
      </div>
      <Modal
        abierto={abierto}
        titulo="Forma de los botones"
        subtitulo="Cambia el botón principal, los demás botones y los de tus sucursales."
        onClose={() => setAbierto(false)}
        ancho="max-w-3xl"
      >
        <div role="radiogroup" aria-label="Formas de los botones" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FORMAS.map((f) => {
            const elegida = valor === f.clave;
            return (
              <button
                key={f.clave}
                type="button"
                role="radio"
                aria-checked={elegida}
                aria-label={f.nombre}
                onClick={() => {
                  onCambio(f.clave);
                  setAbierto(false);
                }}
                className="flex flex-col gap-2 rounded-xl bg-white p-2 text-left transition-shadow hover:shadow-md"
                style={estiloTarjeta(elegida, c)}
              >
                <MiniBotones forma={f.clave} c={c} />
                <span className="px-1 pb-0.5">
                  <strong className="block text-[13px] text-texto">{f.nombre}</strong>
                  <span className="block text-[11px] leading-snug text-texto-3">{f.detalle}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

// ── Letra del nombre ───────────────────────────────────────────────────────

export function SelectorLetra({
  valor,
  nombre,
  c,
  onCambio,
}: {
  valor: string;
  /** El nombre del negocio: cada opción lo muestra escrito con su letra. */
  nombre: string;
  c: Paleta;
  onCambio: (t: Tipografia) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const extra = !LETRAS_A_LA_VISTA.includes(valor as Tipografia);
  // Las tres de la vista y la elegida (para la vista previa); las 30, sólo
  // cuando se abre el popup.
  useEffect(() => {
    for (const t of LETRAS_A_LA_VISTA) cargarFuentesPagina(t);
  }, []);
  useEffect(() => cargarFuentesPagina(valor), [valor]);
  useEffect(() => {
    if (abierto) cargarCatalogoLetras();
  }, [abierto]);

  return (
    <div className="space-y-2">
      <Etiqueta>Letra del nombre</Etiqueta>
      <div className="flex flex-wrap gap-1.5">
        {LETRAS_A_LA_VISTA.map((t) => {
          const l = letraTitulo(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={valor === t}
              onClick={() => onCambio(t)}
              className="h-10 min-w-[92px] flex-1 rounded-[10px] text-sm"
              style={{
                ...estiloOpcion(valor === t, c),
                fontFamily: l.familia,
                textTransform: l.mayusculas ? "uppercase" : undefined,
                fontWeight: valor === t ? 700 : 400,
              }}
            >
              {l.nombre}
            </button>
          );
        })}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-pressed={extra}
          aria-label={extra ? `Más letras (elegida: ${letraTitulo(valor).nombre})` : "Más letras"}
          onClick={() => setAbierto(true)}
          className="flex h-10 min-w-[92px] flex-1 items-center justify-center gap-1 rounded-[10px] px-2 text-sm"
          style={{ ...estiloOpcion(extra, c), ...(extra ? { fontFamily: letraTitulo(valor).familia } : {}) }}
        >
          {extra ? letraTitulo(valor).nombre : "Más letras"}
          <Icon name="chevronRight" size={14} />
        </button>
      </div>
      <Modal
        abierto={abierto}
        titulo="Letra del nombre"
        subtitulo={`${LETRAS.length} letras. Sólo cambia el nombre de tu negocio en la página.`}
        onClose={() => setAbierto(false)}
        ancho="max-w-3xl"
      >
        <div className="space-y-5">
          {GRUPOS_LETRA.map((g) => (
            <section key={g}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-texto-3">{g}</h3>
              <div role="radiogroup" aria-label={`Letras ${g.toLowerCase()}`} className="grid gap-2 sm:grid-cols-2">
                {LETRAS.filter((l) => l.grupo === g).map((l) => {
                  const elegida = valor === l.clave;
                  return (
                    <button
                      key={l.clave}
                      type="button"
                      role="radio"
                      aria-checked={elegida}
                      aria-label={l.nombre}
                      onClick={() => {
                        onCambio(l.clave);
                        setAbierto(false);
                      }}
                      className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-white px-3 py-2.5 text-left transition-shadow hover:shadow-md"
                      style={estiloTarjeta(elegida, c)}
                    >
                      <span
                        className="block truncate"
                        style={{ ...estiloLetra(l, 21), color: GRIS_PAGINA.texto, lineHeight: 1.3 }}
                      >
                        {nombre}
                      </span>
                      <span className="text-[11px] text-texto-3">{l.nombre}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// ── Anuncio destacado ──────────────────────────────────────────────────────

const unico = (xs: string[]) => [...new Set(xs.map((x) => x.toUpperCase()))];

/** Muestras + selector del navegador + hex a mano. null = automático. */
function SelectorColor({
  etiqueta,
  ayuda,
  valor,
  automatico,
  muestras,
  onCambio,
}: {
  etiqueta: string;
  ayuda: string;
  valor: string | null;
  /** El color que se usa en automático (para el selector y como pista). */
  automatico: string;
  muestras: string[];
  onCambio: (hex: string | null) => void;
}) {
  // Lo que se está tecleando; null = mostrar el valor de verdad.
  const [tecleado, setTecleado] = useState<string | null>(null);
  const actual = valor?.toUpperCase() ?? null;
  const circulo = (elegido: boolean): CSSProperties => ({
    border: `3px solid ${elegido ? "#1F2937" : "#ffffff"}`,
    boxShadow: "0 0 0 1px #D1D5DB",
  });
  return (
    <div className="space-y-2">
      <Etiqueta>{etiqueta}</Etiqueta>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={etiqueta}>
        <button
          type="button"
          role="radio"
          aria-checked={actual === null}
          aria-label={`${etiqueta}: automático`}
          title="Automático"
          onClick={() => onCambio(null)}
          className="flex h-8 items-center rounded-full px-2.5 text-[11px] font-semibold text-texto-2"
          style={{ ...circulo(actual === null), background: "#ffffff" }}
        >
          Auto
        </button>
        {muestras.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={actual === m}
            aria-label={`${etiqueta} ${m}`}
            title={m}
            onClick={() => onCambio(m)}
            className="h-8 w-8 rounded-full"
            style={{ ...circulo(actual === m), background: m }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${etiqueta}: elegir otro`}
          value={(actual ?? automatico).toLowerCase()}
          onChange={(ev) => onCambio(ev.target.value.toUpperCase())}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-borde bg-white p-1"
        />
        <input
          aria-label={`${etiqueta} en hex`}
          value={tecleado ?? actual ?? ""}
          placeholder={`Automático (${automatico.toUpperCase()})`}
          maxLength={7}
          onChange={(ev) => {
            const v = ev.target.value.trim();
            setTecleado(v);
            if (v === "") return onCambio(null);
            const hex = v.startsWith("#") ? v : `#${v}`;
            if (HEX_COLOR.test(hex)) onCambio(hex.toUpperCase());
          }}
          onBlur={() => setTecleado(null)}
          className="min-w-0 flex-1 rounded-xl border border-borde bg-white px-3 py-2 font-mono text-sm uppercase text-texto outline-none placeholder:font-sans placeholder:normal-case placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100"
        />
      </div>
      <span className="block text-xs text-texto-4">{ayuda}</span>
    </div>
  );
}

const AYUDA_COLOR: Record<string, string> = {
  CONTORNO: "El borde del anuncio (el fondo queda blanco).",
  TARJETA: "La barra de la izquierda (la tarjeta queda blanca).",
  MINIMAL: "La línea de abajo.",
};

/**
 * Estilo y colores del anuncio, con el aviso de contraste. No bloquea: si el
 * dueño quiere una letra que se lee mal, se le avisa claro y se le ofrece
 * volver a lo automático.
 */
export function EditorAnuncio({
  ajustes,
  c,
  muestras,
  cambiar,
}: {
  ajustes: AjustesPagina;
  c: Paleta;
  muestras: Muestra[];
  cambiar: (cambios: CambiosPagina) => void;
}) {
  const estilo = ajustes.anuncioEstilo ?? "SUAVE";
  const fondo = ajustes.anuncioColorFondo ?? null;
  const texto = ajustes.anuncioColorTexto ?? null;
  const k = coloresAnuncio(estilo, fondo, texto, c);
  const bajo = k.contraste < CONTRASTE_MINIMO;
  const deLaPagina = muestras.map((m) => m.hex);
  const ratio = k.contraste.toFixed(1).replace(".", ",");

  return (
    <div className="space-y-4 rounded-xl border border-borde-soft p-3">
      <div className="space-y-2">
        <Etiqueta>Estilo del anuncio</Etiqueta>
        <div role="radiogroup" aria-label="Estilo del anuncio" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {ESTILOS_ANUNCIO.map((x) => {
            const elegido = estilo === x.clave;
            return (
              <button
                key={x.clave}
                type="button"
                role="radio"
                aria-checked={elegido}
                aria-label={x.nombre}
                onClick={() => cambiar({ anuncioEstilo: x.clave })}
                className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-white p-1.5 text-left"
                style={estiloTarjeta(elegido, c)}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none block overflow-hidden rounded-lg p-1.5"
                  style={{ background: GRIS_PAGINA.fondo, whiteSpace: "nowrap" }}
                >
                  <AnuncioPagina
                    anuncio={{ texto: "¡2x1 hoy!", url: null, estilo: x.clave, colorFondo: fondo, colorTexto: texto }}
                    paleta={c}
                    estatico
                  />
                </span>
                <span className="px-1 text-[12px] font-semibold text-texto">{x.nombre}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectorColor
          etiqueta="Color del anuncio"
          ayuda={colorEsFondo(estilo) ? "El fondo del anuncio." : AYUDA_COLOR[estilo]}
          valor={fondo}
          automatico={k.color}
          muestras={unico(["#FFFBEB", "#FEF3C7", "#FDE047", "#FFFFFF", "#111827", ...deLaPagina])}
          onCambio={(hex) => cambiar({ anuncioColorFondo: hex })}
        />
        <SelectorColor
          etiqueta="Color de la letra"
          ayuda="Elegí uno que se lea bien sobre el anuncio."
          valor={texto}
          automatico={k.texto}
          muestras={unico(["#FFFFFF", "#111827", "#78350F", c.oscuro, ...deLaPagina])}
          onCambio={(hex) => cambiar({ anuncioColorTexto: hex })}
        />
      </div>

      {bajo ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <Icon name="alert" size={18} />
          <span className="min-w-0 flex-[1_1_240px]">
            <strong>La letra se va a leer mal.</strong> El contraste es de {ratio} a 1 y lo mínimo recomendado es 4,5 a 1:
            mucha gente (y cualquiera al sol) no va a poder leer tu anuncio.
          </span>
          <Boton
            variante="ghost"
            className="!px-3 !py-1.5 text-[13px]"
            onClick={() => cambiar({ anuncioColorFondo: null, anuncioColorTexto: null })}
          >
            Usar automático
          </Boton>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-texto-3">
          <span>Contraste {ratio} a 1: se lee bien.</span>
          {(fondo || texto) && (
            <button
              type="button"
              className="font-semibold underline"
              style={{ color: c.oscuro }}
              onClick={() => cambiar({ anuncioColorFondo: null, anuncioColorTexto: null })}
            >
              Usar automático
            </button>
          )}
        </div>
      )}
    </div>
  );
}
