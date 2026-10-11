import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
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
  GRIS_PAGINA,
  GRUPOS_LETRA,
  HEX_COLOR,
  letraTitulo,
  LETRAS,
  nombreForma,
  SUPERFICIE_CLASICA,
  type Superficie,
} from "../../lib/pagina/estilos";
import type { AjustesPagina, CambiosPagina, FormaBotones, Muestra, Tipografia } from "../../lib/pagina/tipos";
import { AnuncioPagina, Trazo } from "./VistaPagina";

/**
 * Los selectores de la apariencia de "Mi página" (08-oct): color, forma de
 * los botones, letra del nombre y diseño del anuncio.
 *
 * Pedido del dueño de BamarDev: la pantalla muestra SÓLO lo elegido, en una
 * fila con "Cambiar"; las opciones (y sus combinaciones de color) viven en un
 * popup. Con todas las opciones a la vista la pantalla se llenaba de botones
 * y colores y no se entendía.
 *
 * Todo va al borrador del editor: la vista previa lo muestra al instante y se
 * manda con "Guardar cambios".
 */

/** La tarjeta de una opción del popup, marcada con el color de la página. */
function estiloTarjeta(elegida: boolean, c: Paleta): CSSProperties {
  return {
    border: elegida ? `2px solid ${c.acento}` : "1px solid #E5E7EB",
    boxShadow: elegida ? `0 0 0 1px ${c.acento}` : undefined,
  };
}

function Etiqueta({ children }: { children: ReactNode }) {
  return <span className="block text-[13px] font-semibold text-texto-2">{children}</span>;
}

/** El subtítulo de un grupo de opciones dentro de un popup ("Recomendados para este estilo"). */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-texto-3">{titulo}</h3>
      {children}
    </section>
  );
}

/**
 * La página detrás de las miniaturas de los popups: el fondo y la superficie
 * del estilo elegido, así un botón de Noche se ve sobre lo oscuro.
 */
export interface FondoEstilo {
  superficie: Superficie;
  fondo: string;
}

const FONDO_CLASICO: FondoEstilo = { superficie: SUPERFICIE_CLASICA, fondo: GRIS_PAGINA.fondo };

/**
 * Lo elegido, en una fila: su muestra, su nombre y "Cambiar". Es el único
 * control a la vista; tocarlo abre el popup.
 */
export function FilaEleccion({
  etiqueta,
  resumen,
  muestra,
  onAbrir,
}: {
  etiqueta: string;
  resumen: string;
  muestra: ReactNode;
  onAbrir: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Etiqueta>{etiqueta}</Etiqueta>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`${etiqueta}: ${resumen}. Cambiar`}
        onClick={onAbrir}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-borde bg-white px-3 py-2 text-left transition-colors hover:bg-muted"
      >
        <span className="flex min-w-0 shrink-0 items-center" aria-hidden="true">
          {muestra}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-texto">{resumen}</span>
        <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-texto-3">
          Cambiar
          <Icon name="chevronRight" size={15} />
        </span>
      </button>
    </div>
  );
}

// ── Color de la página ─────────────────────────────────────────────────────

export function SelectorColorPagina({
  valor,
  muestras,
  recomendados = [],
  deTuLogo = [],
  onCambio,
}: {
  valor: string;
  muestras: Muestra[];
  /** Las claves que mejor van con el estilo: se muestran primero. */
  recomendados?: string[];
  /** Las muestras más parecidas a los colores del logo, arriba de todo. */
  deTuLogo?: string[];
  onCambio: (clave: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const actual = muestras.find((m) => m.clave === valor) ?? muestras[0];
  // Cada muestra una sola vez: la del logo no se repite en recomendados ni en el resto.
  const logo = muestras.filter((m) => deTuLogo.includes(m.clave));
  const reco = muestras.filter((m) => recomendados.includes(m.clave) && !deTuLogo.includes(m.clave));
  const resto = muestras.filter((m) => !deTuLogo.includes(m.clave) && !recomendados.includes(m.clave));
  const grilla = (lista: Muestra[], etiqueta: string) => (
    <div role="radiogroup" aria-label={etiqueta} className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {lista.map((m) => {
        const elegido = m.clave === valor;
        return (
          <button
            key={m.clave}
            type="button"
            role="radio"
            aria-checked={elegido}
            aria-label={`Color ${m.nombre}`}
            onClick={() => {
              onCambio(m.clave);
              setAbierto(false);
            }}
            className="flex flex-col items-center gap-1.5 rounded-xl p-1.5 hover:bg-muted"
          >
            <span
              className="block h-11 w-11 rounded-full"
              style={{
                background: m.hex,
                border: `3px solid ${elegido ? "#1F2937" : "#ffffff"}`,
                boxShadow: "0 0 0 1px #E5E7EB",
              }}
            />
            <span className={`text-[11px] ${elegido ? "font-bold text-texto" : "text-texto-3"}`}>{m.nombre}</span>
          </button>
        );
      })}
    </div>
  );
  return (
    <>
      <FilaEleccion
        etiqueta="Color de la página"
        resumen={actual?.nombre ?? ""}
        muestra={<span className="block h-8 w-8 rounded-full" style={{ background: actual?.hex, boxShadow: "0 0 0 1px #E5E7EB" }} />}
        onAbrir={() => setAbierto(true)}
      />
      <Modal
        abierto={abierto}
        titulo="Color de la página"
        subtitulo={`${muestras.length} colores, todos probados para que el texto blanco se lea bien.`}
        onClose={() => setAbierto(false)}
        ancho="max-w-2xl"
      >
        {logo.length === 0 && reco.length === 0 ? (
          grilla(muestras, "Colores de la página")
        ) : (
          <div className="space-y-5">
            {logo.length > 0 && (
              <Grupo titulo="De tu logo">{grilla(logo, "Colores de tu logo")}</Grupo>
            )}
            {reco.length > 0 && (
              <Grupo titulo="Recomendados para este estilo">{grilla(reco, "Colores recomendados para este estilo")}</Grupo>
            )}
            <Grupo titulo="Todos los colores">{grilla(resto, "Colores de la página")}</Grupo>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Forma de los botones ───────────────────────────────────────────────────

/** El botón principal de verdad, en chico. */
function MiniPrincipal({ forma, c, ancho, sup }: { forma: string; c: Paleta; ancho?: number; sup: Superficie }) {
  const b = estiloBotones(forma, c, sup);
  return (
    <span
      style={{
        minHeight: 32,
        width: ancho,
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
  );
}

/** El botón principal y uno secundario de verdad, en chico, sobre el fondo de la página. */
function MiniBotones({ forma, c, f }: { forma: string; c: Paleta; f: FondoEstilo }) {
  const b = estiloBotones(forma, c, f.superficie);
  return (
    <span aria-hidden="true" className="flex flex-col gap-2 rounded-lg p-2.5" style={{ background: f.fondo }}>
      <MiniPrincipal forma={forma} c={c} sup={f.superficie} />
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
  recomendadas = [],
  fondo = FONDO_CLASICO,
  onCambio,
}: {
  valor: string;
  c: Paleta;
  /** Las que mejor van con el estilo: se muestran primero. */
  recomendadas?: string[];
  fondo?: FondoEstilo;
  onCambio: (f: FormaBotones) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const opcion = (f: (typeof FORMAS)[number]) => {
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
        <MiniBotones forma={f.clave} c={c} f={fondo} />
        <span className="px-1 pb-0.5">
          <strong className="block text-[13px] text-texto">{f.nombre}</strong>
          <span className="block text-[11px] leading-snug text-texto-3">{f.detalle}</span>
        </span>
      </button>
    );
  };
  const reco = FORMAS.filter((f) => recomendadas.includes(f.clave));
  const resto = FORMAS.filter((f) => !recomendadas.includes(f.clave));
  return (
    <>
      <FilaEleccion
        etiqueta="Forma de los botones"
        resumen={nombreForma(valor)}
        muestra={
          <span className="block rounded-lg p-1.5" style={{ background: fondo.fondo }}>
            <MiniPrincipal forma={valor} c={c} ancho={104} sup={fondo.superficie} />
          </span>
        }
        onAbrir={() => setAbierto(true)}
      />
      <Modal
        abierto={abierto}
        titulo="Forma de los botones"
        subtitulo="Cambia el botón principal, los demás botones y los de tus sucursales."
        onClose={() => setAbierto(false)}
        ancho="max-w-3xl"
      >
        {reco.length === 0 ? (
          <div role="radiogroup" aria-label="Formas de los botones" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {FORMAS.map(opcion)}
          </div>
        ) : (
          <div className="space-y-5">
            <Grupo titulo="Recomendadas para este estilo">
              <div role="radiogroup" aria-label="Formas recomendadas para este estilo" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {reco.map(opcion)}
              </div>
            </Grupo>
            <Grupo titulo="Más formas">
              <div role="radiogroup" aria-label="Formas de los botones" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {resto.map(opcion)}
              </div>
            </Grupo>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Letra del nombre ───────────────────────────────────────────────────────

export function SelectorLetra({
  valor,
  nombre,
  c,
  recomendadas = [],
  onCambio,
}: {
  valor: string;
  /** El nombre del negocio: cada opción lo muestra escrito con su letra. */
  nombre: string;
  c: Paleta;
  /** Las que mejor van con el estilo: arriba, y fuera de su grupo. */
  recomendadas?: string[];
  onCambio: (t: Tipografia) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  // A la vista sólo la elegida; las 30, recién al abrir el popup.
  useEffect(() => cargarFuentesPagina(valor), [valor]);
  useEffect(() => {
    if (abierto) cargarCatalogoLetras();
  }, [abierto]);
  const l = letraTitulo(valor);
  const opcionLetra = (x: (typeof LETRAS)[number]) => {
    const elegida = valor === x.clave;
    return (
      <button
        key={x.clave}
        type="button"
        role="radio"
        aria-checked={elegida}
        aria-label={x.nombre}
        onClick={() => {
          onCambio(x.clave);
          setAbierto(false);
        }}
        className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-white px-3 py-2.5 text-left transition-shadow hover:shadow-md"
        style={estiloTarjeta(elegida, c)}
      >
        <span className="block truncate" style={{ ...estiloLetra(x, 21), color: GRIS_PAGINA.texto, lineHeight: 1.3 }}>
          {nombre}
        </span>
        <span className="text-[11px] text-texto-3">{x.nombre}</span>
      </button>
    );
  };

  return (
    <>
      <FilaEleccion
        etiqueta="Letra del nombre"
        resumen={l.nombre}
        muestra={
          <span
            className="flex h-10 min-w-12 items-center justify-center rounded-lg px-2"
            style={{ ...estiloLetra(l, 20), background: GRIS_PAGINA.fondo, color: GRIS_PAGINA.texto }}
          >
            Aa
          </span>
        }
        onAbrir={() => setAbierto(true)}
      />
      <Modal
        abierto={abierto}
        titulo="Letra del nombre"
        subtitulo={`${LETRAS.length} letras. Sólo cambia el nombre de tu negocio en la página.`}
        onClose={() => setAbierto(false)}
        ancho="max-w-3xl"
      >
        <div className="space-y-5">
          {LETRAS.some((x) => recomendadas.includes(x.clave)) && (
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-texto-3">Recomendadas para este estilo</h3>
              <div role="radiogroup" aria-label="Letras recomendadas para este estilo" className="grid gap-2 sm:grid-cols-2">
                {recomendadas.map((k) => LETRAS.find((x) => x.clave === k)).filter((x) => !!x).map((x) => opcionLetra(x!))}
              </div>
            </section>
          )}
          {GRUPOS_LETRA.map((g) => (
            <section key={g}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-texto-3">{g}</h3>
              <div role="radiogroup" aria-label={`Letras ${g.toLowerCase()}`} className="grid gap-2 sm:grid-cols-2">
                {LETRAS.filter((x) => x.grupo === g && !recomendadas.includes(x.clave)).map(opcionLetra)}
              </div>
            </section>
          ))}
        </div>
      </Modal>
    </>
  );
}

// ── Anuncio destacado ──────────────────────────────────────────────────────

const unico = (xs: string[]) => [...new Set(xs.map((x) => x.toUpperCase()))];

/**
 * Los claros para el fondo del anuncio (los colores de la página son todos
 * oscuros: sirven para la letra o para un anuncio lleno).
 */
const CLAROS = [
  "#FFFFFF",
  "#FFFBEB",
  "#FEF3C7",
  "#FDE047",
  "#FFEDD5",
  "#FFE4E6",
  "#FCE7F3",
  "#F3E8FF",
  "#E0E7FF",
  "#DBEAFE",
  "#CFFAFE",
  "#D1FAE5",
  "#ECFCCB",
  "#F5F5F4",
  "#E5E7EB",
];

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
          className="flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold text-texto-2"
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
            className="h-7 w-7 rounded-full"
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
 * Diseño del anuncio: a la vista, el anuncio como va a salir; en el popup, el
 * estilo, los dos colores y el aviso de contraste. No bloquea: si el dueño
 * quiere una letra que se lee mal, se le avisa claro y se le ofrece volver a
 * lo automático.
 */
export function EditorAnuncio({
  ajustes,
  c,
  muestras,
  pagina = FONDO_CLASICO,
  cambiar,
}: {
  ajustes: AjustesPagina;
  c: Paleta;
  muestras: Muestra[];
  /** El fondo del estilo de página: el anuncio se ve (y se mide) sobre él. */
  pagina?: FondoEstilo;
  cambiar: (cambios: CambiosPagina) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const estilo = ajustes.anuncioEstilo ?? "SUAVE";
  const fondo = ajustes.anuncioColorFondo ?? null;
  const texto = ajustes.anuncioColorTexto ?? null;
  const sup = pagina.superficie;
  const k = coloresAnuncio(estilo, fondo, texto, c, sup);
  const bajo = k.contraste < CONTRASTE_MINIMO;
  const deLaPagina = muestras.map((m) => m.hex);
  const ratio = k.contraste.toFixed(1).replace(".", ",");
  const nombreEstilo = ESTILOS_ANUNCIO.find((x) => x.clave === estilo)?.nombre ?? "Franja suave";
  const automatico = !fondo && !texto;
  const textoMuestra = ajustes.anuncioTexto?.trim() || "¡2x1 hoy!";
  const anuncio = (est: string) => ({ texto: textoMuestra, url: null, estilo: est, colorFondo: fondo, colorTexto: texto });

  return (
    <>
      <FilaEleccion
        etiqueta="Diseño del anuncio"
        resumen={`${nombreEstilo} · ${automatico ? "colores automáticos" : "colores propios"}${bajo ? " · se lee mal" : ""}`}
        muestra={
          <span
            className="pointer-events-none block w-36 overflow-hidden rounded-lg p-1 sm:w-48"
            style={{ background: pagina.fondo, whiteSpace: "nowrap" }}
          >
            <AnuncioPagina anuncio={anuncio(estilo)} paleta={c} estatico superficie={sup} />
          </span>
        }
        onAbrir={() => setAbierto(true)}
      />
      <Modal
        abierto={abierto}
        titulo="Diseño del anuncio"
        subtitulo="El estilo de la franja y sus colores. Se ve al toque en la vista previa."
        onClose={() => setAbierto(false)}
        ancho="max-w-3xl"
        acciones={<Boton onClick={() => setAbierto(false)}>Listo</Boton>}
      >
        <div className="space-y-5">
          <div className="rounded-xl p-3" style={{ background: pagina.fondo }} aria-label="Así queda tu anuncio">
            <AnuncioPagina anuncio={anuncio(estilo)} paleta={c} estatico superficie={sup} />
          </div>

          <div className="space-y-2">
            <Etiqueta>Estilo</Etiqueta>
            <div role="radiogroup" aria-label="Estilo del anuncio" className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
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
                      style={{ background: pagina.fondo, whiteSpace: "nowrap" }}
                    >
                      <AnuncioPagina
                        anuncio={{ texto: "¡2x1!", url: null, estilo: x.clave, colorFondo: fondo, colorTexto: texto }}
                        paleta={c}
                        estatico
                        superficie={sup}
                      />
                    </span>
                    <span className="px-1 text-[12px] font-semibold text-texto">{x.nombre}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectorColor
              etiqueta="Color del anuncio"
              ayuda={colorEsFondo(estilo) ? "El fondo del anuncio." : AYUDA_COLOR[estilo]}
              valor={fondo}
              automatico={k.color}
              muestras={unico([...CLAROS, ...deLaPagina])}
              onCambio={(hex) => cambiar({ anuncioColorFondo: hex })}
            />
            <SelectorColor
              etiqueta="Color de la letra"
              ayuda="Elegí uno que se lea bien sobre el anuncio."
              valor={texto}
              automatico={k.texto}
              muestras={unico(["#FFFFFF", "#111827", "#78350F", c.oscuro, ...deLaPagina, ...CLAROS.slice(1, 8)])}
              onCambio={(hex) => cambiar({ anuncioColorTexto: hex })}
            />
          </div>

          {bajo ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <Icon name="alert" size={18} />
              <span className="min-w-0 flex-[1_1_240px]">
                <strong>La letra se va a leer mal.</strong> El contraste es de {ratio} a 1 y lo mínimo recomendado es 4,5 a
                1: mucha gente (y cualquiera al sol) no va a poder leer tu anuncio.
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
              {!automatico && (
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
      </Modal>
    </>
  );
}
