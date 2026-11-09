/**
 * El sitio del plan Profesional (PLAN-PAGINA-PRO §4, §5 y §7, M1): las
 * reglas que comparten la página pública, la vista previa y el editor.
 *
 * Las formas vienen de `pagina/sitio/sitio.ts` del backend. Lo que acá se
 * repite (cómo se ve un bloque vacío, qué se publica) tiene que seguir lo de
 * allá: la vista previa del editor no puede prometer un bloque que la página
 * de verdad no va a mostrar.
 *
 * No toca el DOM ni la app: lo usa también la página pública (separacion.test.ts).
 */
import type { Paleta } from "./aspecto";
import { tonosPagina, type ClaveEstilo, type TonosPagina } from "./estilosPagina";
import { familiaTexto } from "./estilos";
import type {
  Bloque,
  BloquePublico,
  DestacadoDia,
  EstadoSitio,
  FotoPublica,
  PlantillaSitio,
  Sitio,
  SitioPublico,
  TipoBloque,
} from "./tipos";

// ── Nombres ───────────────────────────────────────────────────────────────

export const PLANTILLAS_SITIO: { clave: PlantillaSitio; nombre: string; detalle: string }[] = [
  { clave: "GASTRONOMIA", nombre: "Gastronomía", detalle: "Carta, almuerzo del día y pedidos" },
  { clave: "BELLEZA", nombre: "Belleza", detalle: "Servicios, trabajos y reservas" },
  { clave: "COMERCIO", nombre: "Comercio", detalle: "Productos, ofertas y envíos" },
];

export function nombrePlantilla(p: string): string {
  return PLANTILLAS_SITIO.find((x) => x.clave === p)?.nombre ?? p;
}

/** El nombre del bloque en el editor. El catálogo se llama como lo llama la plantilla. */
export function nombreBloque(tipo: TipoBloque | string, plantilla?: string): string {
  switch (tipo) {
    case "PORTADA":
      return "Portada";
    case "DESTACADO":
      return "Destacado del día";
    case "CATALOGO":
      return plantilla === "GASTRONOMIA" ? "La carta" : plantilla === "BELLEZA" ? "Servicios" : "Productos";
    case "QUIENES":
      return "Quiénes somos";
    case "GALERIA":
      return "Galería";
    case "UBICACION":
      return "Dónde estamos";
    case "PREGUNTAS":
      return "Preguntas frecuentes";
    case "RESENAS":
      return "Reseñas en Google";
    case "VIDEO":
      return "Video";
    default:
      return tipo;
  }
}

// ── Del editor a la página ────────────────────────────────────────────────

/**
 * Lo que la página pública recibiría con este sitio (`sitioPublico` del
 * backend): sólo lo prendido, sin los bloques que quedaron vacíos, y las
 * fotos ya como URL. `urlDe` da la de cada `FOTO_<n>` (null si no está).
 */
export function sitioPublicoDe(s: Sitio | null | undefined, urlDe: (foto: string) => string | null): SitioPublico | null {
  if (!s) return null;
  const pub = (foto: string, leyenda: string | null = null): FotoPublica | null => {
    const url = urlDe(foto);
    return url ? { url, leyenda } : null;
  };
  const conFoto = (x: FotoPublica | null): x is FotoPublica => x !== null;
  const bloques: BloquePublico[] = [];
  for (const b of s.bloques) {
    if (!b.visible) continue;
    switch (b.tipo) {
      case "PORTADA":
        bloques.push({
          tipo: "PORTADA",
          titulo: b.datos.titulo,
          subtitulo: b.datos.subtitulo,
          fotos: b.datos.fotos.map((f) => pub(f)).filter(conFoto),
        });
        break;
      case "QUIENES":
        if (b.datos.texto?.trim() || b.datos.datos.length) {
          bloques.push({ tipo: "QUIENES", ...b.datos, foto: b.datos.foto ? pub(b.datos.foto) : null });
        }
        break;
      case "GALERIA": {
        const fotos = b.datos.fotos.map((f) => pub(f.foto, f.leyenda)).filter(conFoto);
        if (fotos.length) bloques.push({ tipo: "GALERIA", titulo: b.datos.titulo, fotos });
        break;
      }
      case "PREGUNTAS": {
        const items = b.datos.items.filter((x) => x.pregunta.trim() && x.respuesta.trim());
        if (items.length) bloques.push({ tipo: "PREGUNTAS", titulo: b.datos.titulo, items });
        break;
      }
      case "RESENAS":
        if (b.datos.googleUrl) bloques.push({ tipo: "RESENAS", googleUrl: b.datos.googleUrl });
        break;
      case "VIDEO":
        if (b.datos.url) bloques.push({ tipo: "VIDEO", titulo: b.datos.titulo, url: b.datos.url });
        break;
      case "CATALOGO":
      case "UBICACION":
        bloques.push({ tipo: b.tipo, titulo: b.datos.titulo });
        break;
      case "DESTACADO":
        bloques.push({ tipo: "DESTACADO" });
        break;
    }
  }
  return { plantilla: s.plantilla, bloques };
}

/** El sitio que ve la vista previa del editor, con las URL de las fotos subidas. */
export function sitioDeVistaPrevia(estado: EstadoSitio | undefined, actual: Sitio | null | undefined): SitioPublico | null {
  if (!estado?.disponible) return null;
  const urls = new Map(estado.fotos.map((f) => [f.foto, f.url]));
  return sitioPublicoDe(actual, (f) => urls.get(f) ?? null);
}

// ── Lo que falta ──────────────────────────────────────────────────────────

/** Un texto sugerido que el dueño todavía no completó: "[zonas a las que llegan]". */
export function tieneCorchetes(texto: string | null | undefined): boolean {
  return !!texto && /\[[^\]]*\]/.test(texto);
}

export interface Falta {
  tipo: TipoBloque;
  texto: string;
}

export interface Progreso {
  porcentaje: number;
  faltan: Falta[];
}

/**
 * "Tu sitio está al 80 %" (PLAN-PAGINA-PRO §5.4): cada bloque que se puede
 * llenar cuenta lo mismo, y lo que falta va en el orden de la página. Lo que
 * sale solo del sistema (catálogo, sucursales, destacado) no se cuenta: no
 * depende de esta pantalla. Un bloque apagado tampoco: el dueño eligió no
 * mostrarlo.
 */
export function progresoSitio(s: Sitio): Progreso {
  const faltan: Falta[] = [];
  let total = 0;
  for (const b of s.bloques) {
    if (!b.visible) continue;
    const falta = faltaDe(b);
    if (falta === undefined) continue;
    total += 1;
    if (falta) faltan.push({ tipo: b.tipo, texto: falta });
  }
  const porcentaje = total === 0 ? 100 : Math.round(((total - faltan.length) / total) * 100);
  return { porcentaje, faltan };
}

/** null = completo; undefined = no se cuenta; un texto = lo que falta. */
function faltaDe(b: Bloque): string | null | undefined {
  switch (b.tipo) {
    case "PORTADA":
      if (!b.datos.titulo) return "Portada: escribí el título";
      return b.datos.fotos.length ? null : "Portada: subí al menos una foto";
    case "QUIENES":
      return b.datos.texto?.trim() ? null : "Quiénes somos: contá tu historia";
    case "GALERIA":
      return b.datos.fotos.length ? null : "Galería: subí tus fotos";
    case "PREGUNTAS": {
      const sinRevisar = b.datos.items.filter((x) => tieneCorchetes(x.respuesta) || tieneCorchetes(x.pregunta)).length;
      if (!b.datos.items.length) return "Preguntas: agregá al menos una";
      return sinRevisar ? `Preguntas: completá lo que está entre [corchetes] (${sinRevisar})` : null;
    }
    case "RESENAS":
      return b.datos.googleUrl ? null : "Reseñas: pegá el enlace de tu ficha de Google";
    case "VIDEO":
      return b.datos.url ? null : "Video: pegá el enlace del video";
    default:
      return undefined;
  }
}

// ── Cómo se ve cada plantilla ─────────────────────────────────────────────

/**
 * Cada plantilla se apoya en los estilos de página que ya existen (§5.1): de
 * ahí salen los colores con su contraste ya revisado, la letra del texto y
 * cómo va el catálogo. El color y la letra del nombre siguen siendo los que
 * el dueño eligió en Mi página. Gastronomía: la crema de Carta con la letra
 * de Dulce; Belleza: Noche, con la letra de Carta; Comercio: el Clásico, con
 * la de Dulce. Ninguna letra nueva: todas están en `LETRA_TEXTO`.
 */
const ARMADO: Record<PlantillaSitio, { tonos: ClaveEstilo; texto: ClaveEstilo; catalogo: ClaveEstilo; alterno: string; pie: string; textoPie: string }> = {
  GASTRONOMIA: { tonos: "CARTA", texto: "DULCE", catalogo: "CARTA", alterno: "#ffffff", pie: "#2B2420", textoPie: "#EFE7DF" },
  BELLEZA: { tonos: "NOCHE", texto: "CARTA", catalogo: "CARTA", alterno: "#18181B", pie: "#0A0A0C", textoPie: "#D4D4D8" },
  COMERCIO: { tonos: "CLASICO", texto: "DULCE", catalogo: "CLASICO", alterno: "#ffffff", pie: "#1F2937", textoPie: "#E5E7EB" },
};

export function plantillaValida(p: string | null | undefined): PlantillaSitio {
  return p === "BELLEZA" || p === "COMERCIO" ? p : "GASTRONOMIA";
}

export interface TonosSitio extends TonosPagina {
  /** El fondo de las franjas alternadas (quiénes somos, ubicación). */
  alterno: string;
  /** El pie oscuro y su texto. */
  pie: string;
  textoPie: string;
}

/** El estilo de página del que sale cómo va el catálogo del sitio. */
export function estiloCatalogoSitio(plantilla: string): ClaveEstilo {
  return ARMADO[plantillaValida(plantilla)].catalogo;
}

/** El estilo cuya letra de texto usa el sitio (para `cargarFuentesPagina`). */
export function estiloTextoSitio(plantilla: string): ClaveEstilo {
  return ARMADO[plantillaValida(plantilla)].texto;
}

export function tonosSitio(plantilla: string, c: Paleta): TonosSitio {
  const a = ARMADO[plantillaValida(plantilla)];
  const base = tonosPagina(a.tonos, c, false);
  // El Clásico titula en gris tenue (sus títulos son chicos); en el sitio son
  // grandes y van con el texto principal.
  const titulo = a.tonos === "CLASICO" ? base.texto : base.titulo;
  return { ...base, titulo, familia: familiaTexto(a.texto), alterno: a.alterno, pie: a.pie, textoPie: a.textoPie };
}

// ── Video ─────────────────────────────────────────────────────────────────

export interface VideoSitio {
  red: "YouTube" | "TikTok" | "Facebook";
  /** Lo que carga el iframe al tocar la fachada; null = se abre afuera. */
  embebido: string | null;
  miniatura: string | null;
}

/**
 * El video del bloque (YouTube, TikTok o Facebook, ya validados por el
 * backend). De YouTube sale la miniatura sin pedir nada; de los otros no hay
 * miniatura sin su API, así que van como un botón que abre el video.
 */
export function videoDe(url: string): VideoSitio | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
    else if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
      id = m ? m[2] : null;
    }
    if (!id || !/^[\w-]{6,20}$/.test(id)) return { red: "YouTube", embebido: null, miniatura: null };
    return {
      red: "YouTube",
      // Sin cookies hasta que se reproduce, y arranca solo: ya lo tocaron.
      embebido: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
      miniatura: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return { red: "TikTok", embebido: null, miniatura: null };
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch") {
    return { red: "Facebook", embebido: null, miniatura: null };
  }
  return null;
}

// ── Menú de la computadora ────────────────────────────────────────────────

/** El ancla de cada bloque en la página (`#carta`, `#ubicacion`…). */
export function anclaDe(tipo: TipoBloque | string): string {
  switch (tipo) {
    case "CATALOGO":
      return "catalogo";
    case "QUIENES":
      return "nosotros";
    case "GALERIA":
      return "galeria";
    case "UBICACION":
      return "ubicacion";
    case "PREGUNTAS":
      return "preguntas";
    case "VIDEO":
      return "video";
    default:
      return "";
  }
}

/** El texto corto del menú de arriba. */
export function textoMenu(tipo: TipoBloque | string, plantilla: string): string {
  switch (tipo) {
    case "CATALOGO":
      return plantilla === "GASTRONOMIA" ? "Carta" : plantilla === "BELLEZA" ? "Servicios" : "Productos";
    case "QUIENES":
      return "Nosotros";
    case "GALERIA":
      return plantilla === "BELLEZA" ? "Trabajos" : "Galería";
    case "UBICACION":
      return "Ubicación";
    case "PREGUNTAS":
      return "Preguntas";
    case "VIDEO":
      return "Video";
    default:
      return "";
  }
}

/** ¿Sigue vigente? El backend lo saca solo al vencer; esto cubre la página que quedó abierta. */
export function destacadoVigente(d: DestacadoDia | null | undefined, ahora = Date.now()): d is DestacadoDia {
  if (!d) return false;
  const hasta = Date.parse(d.hasta);
  return Number.isNaN(hasta) || hasta > ahora;
}

/** Una línea del destacado del día: "Quedan 18", "-20 %". */
export function textoRestante(restante: number | null): string | null {
  if (restante == null) return null;
  return restante === 1 ? "Queda 1" : `Quedan ${restante}`;
}
