/**
 * La página del negocio escrita en HTML para buscadores y lectores de IA
 * (PLAN-PAGINA-PRO §7, M0; IDEAS/7-PAGINA-SEO-Y-REDES fase 1).
 *
 * La página es una SPA: el servidor manda `<div id="root"></div>` vacío y el
 * contenido lo arma el navegador. Google lo ve recién en una segunda pasada, y
 * los lectores de IA (GPTBot, ClaudeBot, PerplexityBot) no ejecutan JavaScript:
 * de nuestras páginas sólo veían el título. Con esto, a ellos se les manda el
 * mismo contenido que ve una persona, ya escrito: nombre, descripción, cada
 * sucursal con dirección, teléfono y horario, el catálogo con precios, las
 * redes; más los datos estructurados (schema.org) y la dirección canónica.
 *
 * A las personas se les sigue sirviendo la SPA tal cual (ver `og.ts`): no se
 * suma una espera al backend ni un parpadeo entre este HTML y el de React en
 * los celulares baratos. Es el mismo contenido, servido de otra forma.
 *
 * Todo sale de `GET /publico/pagina/:sub` (lo mismo que dibuja la SPA): no hay
 * datos que la página no muestre. Vive en `src/` para que lo chequee `tsc` y
 * lo prueben los tests; wrangler lo empaqueta con las Functions.
 */

/** Escapa texto para meterlo en HTML (contenido o atributo entre comillas). */
export function escapar(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Un tramo de atención (`pagina/horario.ts` del backend): 1 = lunes … 7 = domingo. */
export interface TramoSeo {
  dia: number;
  desde: string;
  hasta: string;
}

export interface SucursalSeo {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  horario: string | null;
  horarioSemanal: TramoSeo[] | null;
  ubicacion: { lat: number; lng: number } | null;
}

export interface ItemSeo {
  titulo: string;
  descripcion: string | null;
  precio: number | null;
  precioDesde: boolean;
  fotoUrl: string | null;
  categoria?: string | null;
}

export interface EnlaceSeo {
  etiqueta: string;
  url: string;
}

/** Lo que se usa de la página pública (`PaginaPublica` del backend). */
export interface PaginaSeo {
  subdominio: string;
  nombre: string;
  rubro: string;
  rubroClave: string;
  descripcion: string | null;
  color: string | null;
  logoUrl: string | null;
  portadaUrl: string | null;
  reservar: boolean;
  redes: EnlaceSeo[];
  botones: EnlaceSeo[];
  sucursales: SucursalSeo[];
  catalogo: { titulo: string; items: ItemSeo[] } | null;
  og: { titulo: string; descripcion: string; imagen: string | null; url: string };
}

/** Tope de ítems del catálogo en el HTML y en el schema: una carta larga no infla la respuesta. */
export const MAX_ITEMS = 60;

const HEX = /^#[0-9A-Fa-f]{6}$/;
const HORA = /^\d{2}:\d{2}$/;

/** Texto plano: sin etiquetas ni espacios de más, recortado. */
export function plano(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const textoONull = (v: unknown, max: number) => plano(v, max) || null;

const numeroONull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Sólo http(s): una URL rara de un enlace no viaja al HTML. */
function urlSegura(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const u = v.trim();
  return /^https?:\/\//i.test(u) ? u.slice(0, 500) : null;
}

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function aTramos(v: unknown): TramoSeo[] | null {
  if (!Array.isArray(v)) return null;
  const tramos = v
    .map(objeto)
    .filter((t) => typeof t.dia === "number" && t.dia >= 1 && t.dia <= 7)
    .filter((t) => typeof t.desde === "string" && HORA.test(t.desde) && typeof t.hasta === "string" && HORA.test(t.hasta))
    .map((t) => ({ dia: t.dia as number, desde: t.desde as string, hasta: t.hasta as string }));
  return tramos.length ? tramos : null;
}

function aUbicacion(v: unknown): { lat: number; lng: number } | null {
  const u = objeto(v);
  const lat = numeroONull(u.lat);
  const lng = numeroONull(u.lng);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function aEnlaces(v: unknown): EnlaceSeo[] {
  return lista(v)
    .map(objeto)
    .map((e) => ({ etiqueta: plano(e.etiqueta, 80), url: urlSegura(e.url) }))
    .filter((e): e is EnlaceSeo => !!e.etiqueta && !!e.url);
}

/**
 * La respuesta de `GET /publico/pagina/:sub`, validada. Lo que no tiene la
 * forma esperada es null (y se sirve sin este HTML, como antes).
 */
export function aPaginaSeo(cuerpo: unknown): PaginaSeo | null {
  const c = objeto(cuerpo);
  const nombre = plano(c.nombre, 120);
  const subdominio = plano(c.subdominio, 63);
  const og = objeto(c.og);
  const url = urlSegura(og.url);
  if (!nombre || !subdominio || !url) return null;
  const color = objeto(c.color).hex;
  const catalogo = objeto(c.catalogo);
  const items = lista(catalogo.items)
    .map(objeto)
    .map((i) => ({
      titulo: plano(i.titulo, 120),
      descripcion: textoONull(i.descripcion, 300),
      precio: numeroONull(i.precio),
      precioDesde: i.precioDesde === true,
      fotoUrl: typeof i.fotoUrl === "string" ? i.fotoUrl.slice(0, 500) : null,
      categoria: textoONull(i.categoria, 80),
    }))
    .filter((i) => !!i.titulo)
    .slice(0, MAX_ITEMS);
  return {
    subdominio,
    nombre,
    rubro: plano(c.rubro, 60),
    rubroClave: plano(c.rubroClave, 30).toUpperCase(),
    descripcion: textoONull(c.descripcion, 600),
    color: typeof color === "string" && HEX.test(color) ? color : null,
    logoUrl: typeof c.logoUrl === "string" ? c.logoUrl.slice(0, 500) : null,
    portadaUrl: typeof c.portadaUrl === "string" ? c.portadaUrl.slice(0, 500) : null,
    reservar: c.reservar === true,
    redes: aEnlaces(c.redes),
    botones: aEnlaces(c.botones),
    sucursales: lista(c.sucursales)
      .map(objeto)
      .map((s) => ({
        nombre: plano(s.nombre, 120),
        direccion: textoONull(s.direccion, 300),
        telefono: textoONull(s.telefono, 40),
        horario: textoONull(s.horario, 300),
        horarioSemanal: aTramos(s.horarioSemanal),
        ubicacion: aUbicacion(s.ubicacion),
      }))
      .filter((s) => !!s.nombre),
    catalogo: items.length ? { titulo: plano(catalogo.titulo, 80) || "Catálogo", items } : null,
    og: {
      titulo: plano(og.titulo, 120) || nombre,
      descripcion: plano(og.descripcion, 300),
      imagen: typeof og.imagen === "string" ? og.imagen.slice(0, 500) : null,
      url,
    },
  };
}

/**
 * El tipo de schema.org de cada rubro (IDEAS/7 §3 #2): Google entiende mejor
 * una "Pharmacy" que un "LocalBusiness" genérico. Barbería va como
 * `HairSalon`: schema.org no tiene uno propio.
 */
const TIPO_SCHEMA: Record<string, string> = {
  RESTAURANTE: "Restaurant",
  FARMACIA: "Pharmacy",
  MINIMARKET: "ConvenienceStore",
  FERRETERIA: "HardwareStore",
  REPUESTOS: "AutoPartsStore",
  PELUQUERIA: "HairSalon",
  BARBERIA: "HairSalon",
  SPA: "DaySpa",
  UNAS: "NailSalon",
  BILLAR: "EntertainmentBusiness",
  ACADEMIA: "EducationalOrganization",
};

export function tipoSchema(rubroClave: string): string {
  return TIPO_SCHEMA[rubroClave] ?? "LocalBusiness";
}

/** Servicios (belleza, academia) y no productos: cambia el tipo de cada ítem del catálogo. */
const DE_SERVICIOS = new Set(["PELUQUERIA", "BARBERIA", "SPA", "UNAS", "ACADEMIA", "BILLAR"]);

const DIA_SCHEMA = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DIA_ES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Google pide "23:59" para la medianoche; el backend guarda "24:00". */
const cierre = (h: string) => (h === "24:00" ? "23:59" : h);

export function horarioSchema(tramos: TramoSeo[] | null): Record<string, string>[] {
  return (tramos ?? []).map((t) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: `https://schema.org/${DIA_SCHEMA[t.dia]}`,
    opens: t.desde,
    closes: cierre(t.hasta),
  }));
}

/** "Lunes 09:00–13:00 y 15:00–21:00", un día por línea; los días sin tramos, cerrados. */
export function horarioEnTexto(tramos: TramoSeo[] | null): string[] {
  if (!tramos?.length) return [];
  return [1, 2, 3, 4, 5, 6, 7].map((dia) => {
    const delDia = tramos.filter((t) => t.dia === dia).sort((a, b) => a.desde.localeCompare(b.desde));
    return delDia.length
      ? `${DIA_ES[dia]} ${delDia.map((t) => `${t.desde}–${t.hasta}`).join(" y ")}`
      : `${DIA_ES[dia]} cerrado`;
  });
}

/** "28", "0,50": como se escriben los precios en Bolivia. */
export function precioEnTexto(precio: number): string {
  return Number.isInteger(precio) ? String(precio) : precio.toFixed(2).replace(".", ",");
}

const absoluta = (url: string | null, base: string) =>
  !url ? null : /^https?:\/\//.test(url) ? url : `${base}${url.startsWith("/") ? "" : "/"}${url}`;

/** Cinco decimales: unos metros, lo que pide Google para `geo`. */
const redondear = (n: number) => Math.round(n * 1e5) / 1e5;

function lugar(s: SucursalSeo): Record<string, unknown> {
  const l: Record<string, unknown> = {};
  if (s.direccion) l.address = { "@type": "PostalAddress", streetAddress: s.direccion, addressCountry: "BO" };
  if (s.telefono) l.telephone = s.telefono;
  if (s.ubicacion) {
    l.geo = { "@type": "GeoCoordinates", latitude: redondear(s.ubicacion.lat), longitude: redondear(s.ubicacion.lng) };
  }
  const horario = horarioSchema(s.horarioSemanal);
  if (horario.length) l.openingHoursSpecification = horario;
  return l;
}

/**
 * Los datos estructurados de la página. Con una sucursal, el negocio lleva su
 * dirección; con varias, la primera es la principal y las demás van como
 * `department` (cada una con su dirección y horario). Sin `AggregateRating`:
 * las estrellas de reseñas propias no salen en Google (IDEAS/7 §2).
 */
export function jsonLd(p: PaginaSeo, base: string): Record<string, unknown> {
  const tipo = tipoSchema(p.rubroClave);
  const [principal, ...otras] = p.sucursales;
  const imagen = absoluta(p.portadaUrl, base) ?? absoluta(p.logoUrl, base);
  const datos: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": tipo,
    "@id": `${p.og.url}#negocio`,
    name: p.nombre,
    url: p.og.url,
  };
  if (p.descripcion) datos.description = p.descripcion;
  if (imagen) datos.image = imagen;
  const logo = absoluta(p.logoUrl, base);
  if (logo) datos.logo = logo;
  if (principal) Object.assign(datos, lugar(principal));
  if (otras.length) {
    datos.department = otras.map((s) => ({ "@type": tipo, name: `${p.nombre} · ${s.nombre}`, ...lugar(s) }));
  }
  if (p.redes.length) datos.sameAs = p.redes.map((r) => r.url);
  if (p.catalogo) {
    const tipoItem = DE_SERVICIOS.has(p.rubroClave) ? "Service" : "Product";
    datos.hasOfferCatalog = {
      "@type": "OfferCatalog",
      name: p.catalogo.titulo,
      itemListElement: p.catalogo.items.map((i) => {
        const oferta: Record<string, unknown> = {
          "@type": "Offer",
          itemOffered: {
            "@type": tipoItem,
            name: i.titulo,
            ...(i.descripcion ? { description: i.descripcion } : {}),
            ...(absoluta(i.fotoUrl, base) ? { image: absoluta(i.fotoUrl, base) } : {}),
          },
        };
        if (i.precio !== null) {
          oferta.priceCurrency = "BOB";
          if (i.precioDesde) {
            oferta.priceSpecification = { "@type": "PriceSpecification", minPrice: i.precio, priceCurrency: "BOB" };
          } else {
            oferta.price = i.precio;
          }
        }
        return oferta;
      }),
    };
  }
  if (p.reservar) datos.acceptsReservations = true;
  return datos;
}

/**
 * ¿La página tiene lo mínimo para mostrarse en Google? Cientos de fichas
 * vacías bajo un mismo dominio pueden arrastrar a las buenas (IDEAS/7 §2,
 * contenido escaso). Hace falta: una sucursal con dirección o ubicación, un
 * horario, y algo que leer (3 ítems en el catálogo o una descripción de 40
 * caracteres). Si no, `noindex` hasta que la complete. Es un umbral para
 * ajustar con el piloto.
 */
export function esIndexable(p: PaginaSeo): boolean {
  const conLugar = p.sucursales.some((s) => s.direccion || s.ubicacion);
  const conHorario = p.sucursales.some((s) => s.horarioSemanal?.length || s.horario);
  const conContenido = (p.catalogo?.items.length ?? 0) >= 3 || (p.descripcion?.length ?? 0) >= 40;
  return conLugar && conHorario && conContenido;
}

/**
 * La descripción para Google: la del dueño, o una armada con el rubro y la
 * primera dirección. Unos 155 caracteres, lo que muestra el buscador.
 */
export function descripcionSeo(p: PaginaSeo): string {
  if (p.descripcion) return p.descripcion.slice(0, 155);
  const direccion = p.sucursales.find((s) => s.direccion)?.direccion;
  const partes = [p.rubro || "Negocio", direccion ? `en ${direccion}` : null].filter(Boolean).join(" ");
  return `${p.nombre}: ${partes}. Horarios, precios y contacto.`.slice(0, 155);
}

/**
 * El contenido visible, en HTML semántico, para quien no ejecuta JavaScript.
 * Es lo mismo que dibuja la SPA (que lo reemplaza al arrancar), con el estilo
 * justo para leerse.
 */
export function htmlVisible(p: PaginaSeo, base: string): string {
  const e = escapar;
  const partes: string[] = [];
  const logo = absoluta(p.logoUrl, base);
  partes.push("<header>");
  if (logo) partes.push(`<img src="${e(logo)}" alt="Logo de ${e(p.nombre)}" width="96" height="96" />`);
  partes.push(`<h1>${e(p.nombre)}</h1>`);
  if (p.rubro) partes.push(`<p>${e(p.rubro)}</p>`);
  if (p.descripcion) partes.push(`<p>${e(p.descripcion)}</p>`);
  partes.push("</header>");

  if (p.sucursales.length) {
    partes.push(`<section><h2>${p.sucursales.length > 1 ? "Sucursales" : "Dónde estamos"}</h2>`);
    for (const s of p.sucursales) {
      partes.push(`<article><h3>${e(s.nombre)}</h3>`);
      if (s.direccion) partes.push(`<p>Dirección: ${e(s.direccion)}</p>`);
      if (s.telefono) partes.push(`<p>Teléfono: <a href="tel:${e(s.telefono.replace(/[^\d+]/g, ""))}">${e(s.telefono)}</a></p>`);
      const dias = horarioEnTexto(s.horarioSemanal);
      if (dias.length) partes.push(`<p>Horario:</p><ul>${dias.map((d) => `<li>${e(d)}</li>`).join("")}</ul>`);
      else if (s.horario) partes.push(`<p>Horario: ${e(s.horario)}</p>`);
      partes.push("</article>");
    }
    partes.push("</section>");
  }

  if (p.catalogo) {
    partes.push(`<section><h2>${e(p.catalogo.titulo)}</h2><ul>`);
    for (const i of p.catalogo.items) {
      const precio = i.precio !== null ? ` — ${i.precioDesde ? "desde " : ""}Bs ${precioEnTexto(i.precio)}` : "";
      const detalle = i.descripcion ? `. ${e(i.descripcion)}` : "";
      partes.push(`<li><strong>${e(i.titulo)}</strong>${e(precio)}${detalle}</li>`);
    }
    partes.push("</ul></section>");
  }

  const enlaces = [...p.botones, ...p.redes];
  if (p.reservar || enlaces.length) {
    partes.push("<nav><h2>Contacto</h2><ul>");
    if (p.reservar) partes.push(`<li><a href="${e(p.og.url)}/reservar">Reservar turno</a></li>`);
    for (const l of enlaces) partes.push(`<li><a href="${e(l.url)}" rel="noopener">${e(l.etiqueta)}</a></li>`);
    partes.push("</ul></nav>");
  }
  partes.push(`<footer><p>Página de ${e(p.nombre)}, hecha con BamarDev.</p></footer>`);

  return `<main style="max-width:720px;margin:0 auto;padding:16px;font-family:system-ui,sans-serif;line-height:1.5">${partes.join("")}</main>`;
}

/** `</script>` adentro del JSON-LD cerraría la etiqueta: se escapa el `<`. */
export function jsonEnScript(datos: unknown): string {
  return JSON.stringify(datos).replace(/</g, "\\u003c");
}

export interface OpcionesSeo {
  /** URL del API, para volver absolutas las imágenes. */
  base: string;
  /** false = `noindex` (QA, una copia en otro host, o la página está incompleta). */
  indexable: boolean;
}

/**
 * El `index.html` con todo lo de arriba: título, descripción, canónica,
 * robots, Open Graph, color de la barra, datos estructurados y el contenido
 * visible dentro de `#root`. Texto y no HTMLRewriter, como `inyectarOg`.
 */
export function inyectarSeo(html: string, p: PaginaSeo, { base, indexable }: OpcionesSeo): string {
  const e = escapar;
  const descripcion = descripcionSeo(p);
  const imagen = absoluta(p.og.imagen, base) ?? absoluta(p.portadaUrl, base) ?? absoluta(p.logoUrl, base);
  const metas = [
    `<meta name="description" content="${e(descripcion)}" />`,
    `<link rel="canonical" href="${e(p.og.url)}" />`,
    `<meta name="robots" content="${indexable ? "index, follow, max-image-preview:large" : "noindex, follow"}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="es_BO" />`,
    `<meta property="og:site_name" content="${e(p.nombre)}" />`,
    `<meta property="og:title" content="${e(p.og.titulo)}" />`,
    `<meta property="og:description" content="${e(p.og.descripcion || descripcion)}" />`,
    `<meta property="og:url" content="${e(p.og.url)}" />`,
    imagen
      ? `<meta property="og:image" content="${e(imagen)}" /><meta property="og:image:alt" content="${e(p.nombre)}" /><meta name="twitter:card" content="summary_large_image" />`
      : `<meta name="twitter:card" content="summary" />`,
    `<script type="application/ld+json">${jsonEnScript(jsonLd(p, base))}</script>`,
  ].join("\n    ");
  const rubro = p.rubro ? ` · ${p.rubro}` : "";
  const titulo = `<title>${e(`${p.nombre}${rubro}`)}</title>`;
  let salida = /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, titulo)
    : html.replace(/<\/head>/i, `  ${titulo}\n  </head>`);
  if (p.color) {
    const tema = `<meta name="theme-color" content="${p.color}" />`;
    salida = /<meta name="theme-color"[^>]*>/i.test(salida)
      ? salida.replace(/<meta name="theme-color"[^>]*>/i, tema)
      : salida.replace(/<\/head>/i, `  ${tema}\n  </head>`);
  }
  salida = salida.replace(/<\/head>/i, `  ${metas}\n  </head>`);
  return salida.replace(/<div id="root"><\/div>/i, `<div id="root">${htmlVisible(p, base)}</div>`);
}
