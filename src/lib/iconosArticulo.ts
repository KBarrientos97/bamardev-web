import type { Rubro } from "./rubro";
import { normalizar } from "./texto";

/**
 * Las URLs de las imágenes, sacadas de la carpeta en vez de un `import` por
 * archivo: con 175 íconos la lista a mano era imposible de mantener.
 *
 * `eager` trae sólo las URLs (strings cortos) al chunk que importa este
 * módulo; las imágenes quedan como archivos aparte y el navegador baja cada
 * una recién cuando se dibuja. El `?no-inline` es lo que lo garantiza: los
 * Fluent pesan entre 1 y 8 KB, y por debajo de 4 KB Vite los metía en el JS
 * como base64 — 126 de los 159 nuevos, unos 470 KB de texto que todos
 * descargaban aunque nunca abrieran el selector.
 */
const URLS = import.meta.glob<string>("../assets/articulos/ic_art_*.webp", {
  eager: true,
  query: "?no-inline",
  import: "default",
});

function urlDe(llave: string): string {
  return URLS[`../assets/articulos/ic_art_${llave}.webp`] ?? "";
}

/**
 * Las secciones del selector, en el orden en que se muestran. `tab` es la
 * llave del ícono que representa la pestaña.
 */
export const CATEGORIAS_ICONO = [
  { clave: "polleria", nombre: "Pollería", tab: "pollo_pierna" },
  { clave: "comidas", nombre: "Comidas", tab: "almuerzo" },
  { clave: "bebidas", nombre: "Bebidas", tab: "gaseosa" },
  { clave: "almacen", nombre: "Almacén", tab: "pan" },
  { clave: "hogar", nombre: "Hogar y limpieza", tab: "jabon" },
  { clave: "farmacia", nombre: "Farmacia", tab: "pastillas" },
  { clave: "ferreteria", nombre: "Ferretería", tab: "martillo" },
  { clave: "vehiculos", nombre: "Repuestos", tab: "llanta" },
  { clave: "belleza", nombre: "Belleza y spa", tab: "esmalte" },
  { clave: "juegos", nombre: "Billar y juegos", tab: "bola8" },
  { clave: "educacion", nombre: "Educación", tab: "libros" },
] as const;

export type ClaveCategoriaIcono = (typeof CATEGORIAS_ICONO)[number]["clave"];
export type CategoriaIcono = (typeof CATEGORIAS_ICONO)[number];

/**
 * Con qué sección abre el selector según el rubro del negocio. Es sólo el
 * punto de partida: se muestran SIEMPRE todas, porque un minimarket que vende
 * salteñas o una farmacia que vende agua tienen que poder elegirlas.
 */
export const CATEGORIA_DEL_RUBRO: Record<Rubro, ClaveCategoriaIcono> = {
  RESTAURANTE: "polleria",
  MINIMARKET: "almacen",
  FARMACIA: "farmacia",
  FERRETERIA: "ferreteria",
  REPUESTOS: "vehiculos",
  PELUQUERIA: "belleza",
  BARBERIA: "belleza",
  SPA: "belleza",
  UNAS: "belleza",
  BILLAR: "juegos",
  ACADEMIA: "educacion",
};

/** La sección con la que abre el selector; sin rubro conocido, la primera. */
export function categoriaDelRubro(rubro: string | null | undefined): ClaveCategoriaIcono {
  return CATEGORIA_DEL_RUBRO[rubro as Rubro] ?? CATEGORIAS_ICONO[0].clave;
}

/**
 * Un ícono elegible para un artículo. El backend guarda sólo la `llave`
 * (String); acá la resolvemos a la imagen local, a una `etiqueta` legible y a
 * la sección del selector donde aparece.
 *
 * Port de `IconoArticulo.kt` (Android). Las llaves son las MISMAS: un artículo
 * con ícono puesto desde la app tiene que verse igual en la web, y al revés.
 */
export interface IconoArticulo {
  llave: string;
  src: string;
  etiqueta: string;
  categoria: ClaveCategoriaIcono;
}

/**
 * Catálogo de íconos de artículo. Es la fuente única de verdad: el selector
 * del formulario, el listado de Artículos y el POS resuelven la llave contra
 * esta tabla.
 *
 * Para sumar un ícono nuevo: dejá el archivo como `ic_art_<llave>.webp` en
 * `src/assets/articulos` y agregá una línea acá — y la equivalente en Android,
 * o el artículo se verá con monograma en la otra plataforma. Una llave nunca
 * se renombra: la guardan los productos.
 *
 * Origen: los 16 primeros de pollería son de Flaticon (los que ya usaba Omar);
 * el resto es Fluent Emoji "Flat" de Microsoft (licencia MIT), rasterizado a
 * WebP de 192 px. Vienen en WebP y no en PNG como en Android: son las mismas
 * imágenes, pero los PNG originales pesaban 3.7 MB y acá se descargan por red.
 */
const DATOS: Omit<IconoArticulo, "src">[] = [
  // Pollería
  { llave: "economico_pollo_broaster", etiqueta: "Broaster económico", categoria: "polleria" },
  { llave: "cuarto_pollo_broaster", etiqueta: "Broaster cuarto", categoria: "polleria" },
  { llave: "medio_pollo_broaster", etiqueta: "Broaster medio", categoria: "polleria" },
  { llave: "pollo_entero_broaster", etiqueta: "Broaster entero", categoria: "polleria" },
  { llave: "economico_pollo_brasa", etiqueta: "Brasa económico", categoria: "polleria" },
  { llave: "cuarto_pollo_brasa", etiqueta: "Brasa cuarto", categoria: "polleria" },
  { llave: "medio_pollo_brasa", etiqueta: "Brasa medio", categoria: "polleria" },
  { llave: "pollo_entero_brasa", etiqueta: "Brasa entero", categoria: "polleria" },
  { llave: "combo_pollo_soda", etiqueta: "Combo pollo + soda", categoria: "polleria" },
  { llave: "hamburguesa", etiqueta: "Hamburguesa", categoria: "polleria" },
  { llave: "hamburguesa_soda", etiqueta: "Hamburguesa + soda", categoria: "polleria" },
  { llave: "salchipapas", etiqueta: "Salchipapas", categoria: "polleria" },
  { llave: "papas_fritas", etiqueta: "Papas fritas", categoria: "polleria" },
  { llave: "arroz", etiqueta: "Arroz", categoria: "polleria" },
  { llave: "soda", etiqueta: "Soda / gaseosa", categoria: "polleria" },
  { llave: "jugos", etiqueta: "Jugos", categoria: "polleria" },
  { llave: "pollo_pierna", etiqueta: "Pollo (pierna)", categoria: "polleria" },
  // Comidas
  { llave: "almuerzo", etiqueta: "Almuerzo", categoria: "comidas" },
  { llave: "plato_del_dia", etiqueta: "Plato del día", categoria: "comidas" },
  { llave: "sopa", etiqueta: "Sopa", categoria: "comidas" },
  { llave: "saltena", etiqueta: "Salteña / empanada", categoria: "comidas" },
  { llave: "carne", etiqueta: "Carne", categoria: "comidas" },
  { llave: "costilla", etiqueta: "Costilla", categoria: "comidas" },
  { llave: "pescado", etiqueta: "Pescado", categoria: "comidas" },
  { llave: "camarones", etiqueta: "Camarones", categoria: "comidas" },
  { llave: "ensalada", etiqueta: "Ensalada", categoria: "comidas" },
  { llave: "fideos", etiqueta: "Fideos", categoria: "comidas" },
  { llave: "huevo_frito", etiqueta: "Huevo frito", categoria: "comidas" },
  { llave: "pizza", etiqueta: "Pizza", categoria: "comidas" },
  { llave: "sandwich", etiqueta: "Sándwich", categoria: "comidas" },
  { llave: "hot_dog", etiqueta: "Hot dog", categoria: "comidas" },
  { llave: "taco", etiqueta: "Taco", categoria: "comidas" },
  { llave: "burrito", etiqueta: "Burrito", categoria: "comidas" },
  { llave: "torta", etiqueta: "Torta", categoria: "comidas" },
  { llave: "torta_cumple", etiqueta: "Torta de cumpleaños", categoria: "comidas" },
  { llave: "helado", etiqueta: "Helado", categoria: "comidas" },
  { llave: "copa_helado", etiqueta: "Copa de helado", categoria: "comidas" },
  { llave: "donas", etiqueta: "Donas", categoria: "comidas" },
  { llave: "croissant", etiqueta: "Croissant", categoria: "comidas" },
  // Bebidas
  { llave: "gaseosa", etiqueta: "Gaseosa", categoria: "bebidas" },
  { llave: "jugo_caja", etiqueta: "Jugo en caja", categoria: "bebidas" },
  { llave: "agua", etiqueta: "Agua", categoria: "bebidas" },
  { llave: "leche", etiqueta: "Leche", categoria: "bebidas" },
  { llave: "cafe", etiqueta: "Café", categoria: "bebidas" },
  { llave: "te", etiqueta: "Té", categoria: "bebidas" },
  { llave: "mate", etiqueta: "Mate", categoria: "bebidas" },
  { llave: "cerveza", etiqueta: "Cerveza", categoria: "bebidas" },
  { llave: "brindis", etiqueta: "Cervezas", categoria: "bebidas" },
  { llave: "vino", etiqueta: "Vino", categoria: "bebidas" },
  { llave: "coctel", etiqueta: "Cóctel", categoria: "bebidas" },
  { llave: "whisky", etiqueta: "Whisky", categoria: "bebidas" },
  { llave: "champan", etiqueta: "Champán", categoria: "bebidas" },
  { llave: "hielo", etiqueta: "Hielo", categoria: "bebidas" },
  // Almacén
  { llave: "pan", etiqueta: "Pan", categoria: "almacen" },
  { llave: "baguette", etiqueta: "Baguette", categoria: "almacen" },
  { llave: "huevos", etiqueta: "Huevos", categoria: "almacen" },
  { llave: "queso", etiqueta: "Queso", categoria: "almacen" },
  { llave: "mantequilla", etiqueta: "Mantequilla", categoria: "almacen" },
  { llave: "miel", etiqueta: "Miel", categoria: "almacen" },
  { llave: "platano", etiqueta: "Plátano", categoria: "almacen" },
  { llave: "manzana", etiqueta: "Manzana", categoria: "almacen" },
  { llave: "uvas", etiqueta: "Uvas", categoria: "almacen" },
  { llave: "mandarina", etiqueta: "Mandarina", categoria: "almacen" },
  { llave: "tomate", etiqueta: "Tomate", categoria: "almacen" },
  { llave: "zanahoria", etiqueta: "Zanahoria", categoria: "almacen" },
  { llave: "cebolla", etiqueta: "Cebolla", categoria: "almacen" },
  { llave: "papa", etiqueta: "Papa", categoria: "almacen" },
  { llave: "choclo", etiqueta: "Choclo", categoria: "almacen" },
  { llave: "palta", etiqueta: "Palta", categoria: "almacen" },
  { llave: "enlatados", etiqueta: "Enlatados", categoria: "almacen" },
  { llave: "frascos", etiqueta: "Frascos", categoria: "almacen" },
  { llave: "sal", etiqueta: "Sal y condimentos", categoria: "almacen" },
  { llave: "galletas", etiqueta: "Galletas", categoria: "almacen" },
  { llave: "chocolate", etiqueta: "Chocolate", categoria: "almacen" },
  { llave: "dulces", etiqueta: "Dulces", categoria: "almacen" },
  { llave: "chupete", etiqueta: "Chupete", categoria: "almacen" },
  { llave: "pipocas", etiqueta: "Pipocas", categoria: "almacen" },
  { llave: "mani", etiqueta: "Maní", categoria: "almacen" },
  { llave: "pretzel", etiqueta: "Snacks", categoria: "almacen" },
  // Hogar y limpieza
  { llave: "jabon", etiqueta: "Jabón", categoria: "hogar" },
  { llave: "esponja", etiqueta: "Esponja", categoria: "hogar" },
  { llave: "papel_higienico", etiqueta: "Papel higiénico", categoria: "hogar" },
  { llave: "escoba", etiqueta: "Escoba", categoria: "hogar" },
  { llave: "balde", etiqueta: "Balde", categoria: "hogar" },
  { llave: "detergente", etiqueta: "Detergente", categoria: "hogar" },
  { llave: "canasta", etiqueta: "Canasta", categoria: "hogar" },
  { llave: "bolsas", etiqueta: "Bolsas", categoria: "hogar" },
  { llave: "carrito", etiqueta: "Carrito", categoria: "hogar" },
  // Farmacia
  { llave: "pastillas", etiqueta: "Pastillas", categoria: "farmacia" },
  { llave: "inyectable", etiqueta: "Inyectable", categoria: "farmacia" },
  { llave: "curitas", etiqueta: "Curitas", categoria: "farmacia" },
  { llave: "termometro", etiqueta: "Termómetro", categoria: "farmacia" },
  { llave: "estetoscopio", etiqueta: "Estetoscopio", categoria: "farmacia" },
  { llave: "barbijo", etiqueta: "Barbijo", categoria: "farmacia" },
  { llave: "crema", etiqueta: "Crema / loción", categoria: "farmacia" },
  { llave: "cepillo_dientes", etiqueta: "Cepillo de dientes", categoria: "farmacia" },
  { llave: "muela", etiqueta: "Dental", categoria: "farmacia" },
  { llave: "biberon", etiqueta: "Biberón", categoria: "farmacia" },
  { llave: "analisis", etiqueta: "Análisis", categoria: "farmacia" },
  { llave: "muleta", etiqueta: "Muleta", categoria: "farmacia" },
  // Ferretería
  { llave: "martillo", etiqueta: "Martillo", categoria: "ferreteria" },
  { llave: "llave_inglesa", etiqueta: "Llave inglesa", categoria: "ferreteria" },
  { llave: "destornillador", etiqueta: "Destornillador", categoria: "ferreteria" },
  { llave: "tuercas", etiqueta: "Tuercas y pernos", categoria: "ferreteria" },
  { llave: "herramientas", etiqueta: "Herramientas", categoria: "ferreteria" },
  { llave: "caja_herramientas", etiqueta: "Caja de herramientas", categoria: "ferreteria" },
  { llave: "serrucho", etiqueta: "Serrucho", categoria: "ferreteria" },
  { llave: "hacha", etiqueta: "Hacha", categoria: "ferreteria" },
  { llave: "picota", etiqueta: "Picota", categoria: "ferreteria" },
  { llave: "escalera", etiqueta: "Escalera", categoria: "ferreteria" },
  { llave: "ladrillo", etiqueta: "Ladrillo", categoria: "ferreteria" },
  { llave: "madera", etiqueta: "Madera", categoria: "ferreteria" },
  { llave: "iman", etiqueta: "Imán", categoria: "ferreteria" },
  { llave: "cadena", etiqueta: "Cadena", categoria: "ferreteria" },
  { llave: "gancho", etiqueta: "Gancho", categoria: "ferreteria" },
  { llave: "foco", etiqueta: "Foco", categoria: "ferreteria" },
  { llave: "enchufe", etiqueta: "Enchufe", categoria: "ferreteria" },
  { llave: "pila", etiqueta: "Pila / batería", categoria: "ferreteria" },
  { llave: "linterna", etiqueta: "Linterna", categoria: "ferreteria" },
  { llave: "llave", etiqueta: "Llave", categoria: "ferreteria" },
  { llave: "candado", etiqueta: "Candado", categoria: "ferreteria" },
  { llave: "brocha", etiqueta: "Brocha", categoria: "ferreteria" },
  { llave: "regla", etiqueta: "Regla", categoria: "ferreteria" },
  // Repuestos
  { llave: "llanta", etiqueta: "Llanta", categoria: "vehiculos" },
  { llave: "aceite", etiqueta: "Aceite", categoria: "vehiculos" },
  { llave: "combustible", etiqueta: "Combustible", categoria: "vehiculos" },
  { llave: "auto", etiqueta: "Auto", categoria: "vehiculos" },
  { llave: "moto", etiqueta: "Moto", categoria: "vehiculos" },
  { llave: "scooter", etiqueta: "Scooter", categoria: "vehiculos" },
  { llave: "bicicleta", etiqueta: "Bicicleta", categoria: "vehiculos" },
  { llave: "camion", etiqueta: "Camión", categoria: "vehiculos" },
  { llave: "engranaje", etiqueta: "Engranaje", categoria: "vehiculos" },
  // Belleza y spa
  { llave: "tijeras", etiqueta: "Tijeras", categoria: "belleza" },
  { llave: "barberia", etiqueta: "Barbería", categoria: "belleza" },
  { llave: "corte_pelo", etiqueta: "Corte de pelo", categoria: "belleza" },
  { llave: "masaje", etiqueta: "Masaje", categoria: "belleza" },
  { llave: "esmalte", etiqueta: "Esmalte", categoria: "belleza" },
  { llave: "labial", etiqueta: "Labial", categoria: "belleza" },
  { llave: "espejo", etiqueta: "Espejo", categoria: "belleza" },
  { llave: "vela", etiqueta: "Vela", categoria: "belleza" },
  { llave: "hierbas", etiqueta: "Hierbas", categoria: "belleza" },
  { llave: "loto", etiqueta: "Flor de loto", categoria: "belleza" },
  { llave: "termas", etiqueta: "Aguas termales", categoria: "belleza" },
  { llave: "tina", etiqueta: "Tina", categoria: "belleza" },
  { llave: "mono", etiqueta: "Moño", categoria: "belleza" },
  { llave: "gema", etiqueta: "Gema", categoria: "belleza" },
  { llave: "anillo", etiqueta: "Anillo", categoria: "belleza" },
  { llave: "brillos", etiqueta: "Brillos", categoria: "belleza" },
  { llave: "concha", etiqueta: "Concha", categoria: "belleza" },
  { llave: "flor", etiqueta: "Flor", categoria: "belleza" },
  // Billar y juegos
  { llave: "bola8", etiqueta: "Bola 8", categoria: "juegos" },
  { llave: "cronometro", etiqueta: "Tiempo de mesa", categoria: "juegos" },
  { llave: "dardos", etiqueta: "Dardos", categoria: "juegos" },
  { llave: "cartas", etiqueta: "Cartas", categoria: "juegos" },
  { llave: "dados", etiqueta: "Dados", categoria: "juegos" },
  { llave: "trofeo", etiqueta: "Trofeo", categoria: "juegos" },
  // Educación
  { llave: "libros", etiqueta: "Libros", categoria: "educacion" },
  { llave: "cuaderno", etiqueta: "Cuaderno", categoria: "educacion" },
  { llave: "lapiz", etiqueta: "Lápiz", categoria: "educacion" },
  { llave: "birrete", etiqueta: "Graduación", categoria: "educacion" },
  { llave: "mochila", etiqueta: "Mochila", categoria: "educacion" },
  { llave: "apuntes", etiqueta: "Apuntes", categoria: "educacion" },
  { llave: "mundo", etiqueta: "Mundo", categoria: "educacion" },
  { llave: "abaco", etiqueta: "Ábaco", categoria: "educacion" },
  { llave: "escuadra", etiqueta: "Escuadra", categoria: "educacion" },
  { llave: "laptop", etiqueta: "Laptop", categoria: "educacion" },
  { llave: "microscopio", etiqueta: "Ciencia", categoria: "educacion" },
  { llave: "arte", etiqueta: "Arte", categoria: "educacion" },
  { llave: "guitarra", etiqueta: "Guitarra", categoria: "educacion" },
  { llave: "musica", etiqueta: "Música", categoria: "educacion" },
  { llave: "futbol", etiqueta: "Deportes", categoria: "educacion" },
  { llave: "polera", etiqueta: "Uniforme", categoria: "educacion" },
  { llave: "certificado", etiqueta: "Certificado", categoria: "educacion" },
  { llave: "carnet", etiqueta: "Carnet", categoria: "educacion" },
  { llave: "archivador", etiqueta: "Archivador", categoria: "educacion" },
];

export const ICONOS_ARTICULO: IconoArticulo[] = DATOS.map((d) => ({ ...d, src: urlDe(d.llave) }));

const POR_LLAVE = new Map(ICONOS_ARTICULO.map((i) => [i.llave, i]));

/** El ícono con esa llave, o null si es vacía o desconocida. */
export function iconoPorLlave(llave: string | null | undefined): IconoArticulo | null {
  if (!llave || !llave.trim()) return null;
  return POR_LLAVE.get(llave) ?? null;
}

/**
 * Con qué sección abre el selector. Si el producto ya tiene ícono, la de ese
 * ícono: al editar hay que ver cuál está puesto, aunque sea de otro rubro (un
 * minimarket que eligió la salteña). Si no, la del rubro; y si el rubro no se
 * conoce, la primera. Mismo criterio que Android.
 */
export function categoriaInicial(
  actual: string | null | undefined,
  rubro: string | null | undefined,
): ClaveCategoriaIcono {
  return iconoPorLlave(actual)?.categoria ?? categoriaDelRubro(rubro);
}

/** Los íconos de una sección, en el orden del catálogo. */
export function iconosDeCategoria(clave: ClaveCategoriaIcono): IconoArticulo[] {
  return ICONOS_ARTICULO.filter((i) => i.categoria === clave);
}

/**
 * Los íconos cuya etiqueta contiene el texto, sin distinguir mayúsculas ni
 * tildes ("cafe" encuentra "Café"). Texto vacío → ninguno: el selector
 * muestra entonces las secciones.
 */
export function buscarIconos(texto: string): IconoArticulo[] {
  const aguja = normalizar(texto.trim());
  if (!aguja) return [];
  return ICONOS_ARTICULO.filter((i) => normalizar(i.etiqueta).includes(aguja));
}

/**
 * Palabras a ignorar al calcular las iniciales de un producto: artículos,
 * conectores y abreviaturas de tamaño que no aportan al "logo" del producto.
 */
const MONOGRAMA_STOPWORDS = new Set([
  "de", "con", "sin", "la", "el", "y", "del", "al",
  "1l", "1/4", "1/2", "3/4",
  "500ml", "250ml", "355ml", "330ml", "1lt",
  "8u", "6u", "12u", "u",
]);

/**
 * Iniciales del producto para el monograma, cuando no tiene ícono elegido.
 *
 * - 2+ palabras significativas → primera letra de las 2 primeras.
 * - 1 palabra → sus 2 primeras letras.
 * - Vacío o sólo símbolos → primera letra del nombre original.
 *
 * Ejemplos: "Coca-Cola Lata" → "CC", "Agua sin gas 500ml" → "AG",
 * "Pollo Broaster 1/4" → "PB", "Hamburguesa Clásica" → "HC".
 */
export function inicialesDe(nombre: string): string {
  const limpio = nombre.replace(/[()]/g, "");
  const palabras = limpio
    .split(/[\s-]+/)
    .filter((p) => !MONOGRAMA_STOPWORDS.has(p.toLowerCase()) && /\p{L}/u.test(p));

  if (palabras.length >= 2) {
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
  }
  if (palabras.length === 1) {
    return palabras[0].slice(0, 2).toUpperCase();
  }
  return nombre.trim()[0]?.toUpperCase() ?? "?";
}

/** Fondo y texto del monograma. */
export interface ColorCategoria {
  bg: string;
  fg: string;
}

/**
 * Color del monograma según la categoría, con match sin distinguir mayúsculas
 * contra los nombres canónicos. Cualquier categoría no listada cae al color
 * por defecto: el verde de siempre (los mismos valores que `colors.xml` de la
 * app), salvo en belleza, donde sigue la paleta del negocio (QA B-24; lo
 * decide `aplicarTema` con las variables `--monograma-*`).
 */
export function colorDeCategoria(categoria: string | null | undefined): ColorCategoria {
  switch ((categoria ?? "").trim().toLowerCase()) {
    case "hamburguesas":
      return { bg: "#FEF3C7", fg: "#B45309" };
    case "pollo":
      return { bg: "#FFE4E6", fg: "#BE123C" };
    case "pizza":
    case "pizzas":
      return { bg: "#FEE2E2", fg: "#B91C1C" };
    case "bebidas":
      return { bg: "#DBEAFE", fg: "#1D4ED8" };
    case "acompañamientos":
    case "acompanamientos":
      return { bg: "#D1FAE5", fg: "#047857" };
    case "postres":
      return { bg: "#EDE9FE", fg: "#6D28D9" };
    case "combos":
      return { bg: "#FFE4E6", fg: "#BE123C" };
    case "helados":
      return { bg: "#EDE9FE", fg: "#6D28D9" };
    default:
      return { bg: "var(--monograma-bg, #D1FAE5)", fg: "var(--monograma-fg, #047857)" };
  }
}
