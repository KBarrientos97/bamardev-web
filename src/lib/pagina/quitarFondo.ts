/**
 * Le saca el fondo al logo del negocio antes de subirlo (Kevin, 9-nov).
 *
 * El logo de la pollería se veía como un cuadrado pegado encima del rojo de la
 * TV, con cualquiera de los tres archivos que tenía: el original con fondo
 * negro, uno con fondo blanco y un "PNG transparente" que en verdad era un JPG
 * con los cuadritos grises DIBUJADOS (los de Google y Gemini salen así). En el
 * recibo no se notaba porque el papel es blanco. El dueño no tiene cómo
 * arreglar el archivo: lo arreglamos al subirlo.
 *
 * Es la varita mágica de cualquier editor de fotos: se mira el borde de la
 * imagen y, si es parejo (uno, dos o tres colores, como los cuadritos), se
 * borra todo lo que esté pegado al borde con ese color. Lo de adentro del
 * dibujo no se toca aunque sea del mismo color: el blanco del brillo dentro
 * del círculo del gallo queda, porque el contorno negro lo encierra.
 *
 * NO mide si la foto "tiene" fondo: una foto de verdad (un plato, una
 * fachada) tiene el borde de mil colores y se deja como está.
 *
 * Trabaja sobre los píxeles crudos (RGBA) y no conoce el canvas: así se prueba
 * sin navegador.
 */

export interface Pixeles {
  /** RGBA, 4 bytes por píxel, fila por fila. Se modifica en el lugar. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Recorte {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export type ResultadoFondo =
  /** Se borró el fondo; `recorte` es lo que queda del dibujo, con un margen. */
  | { tipo: "quitado"; recorte: Recorte }
  /** Ya venía transparente (un PNG de verdad): sólo se recortan los bordes vacíos. */
  | { tipo: "ya-transparente"; recorte: Recorte }
  /** El borde no es parejo (una foto) o se iba a borrar casi todo: no se tocó nada. */
  | { tipo: "sin-cambios" };

/**
 * Cuánto puede alejarse un color del fondo y seguir siendo fondo (distancia en
 * RGB, de 0 a 441). Alcanza para el ruido del JPG y para los dos grises de los
 * cuadritos; un contorno, aunque sea gris claro, queda afuera.
 */
const TOLERANCIA = 42;
/** Con esta parte del borde de un mismo color (o de dos o tres), es un fondo. */
const BORDE_PAREJO = 0.8;
const MAX_COLORES_FONDO = 3;
/**
 * Si se iba a borrar más que esto, lo que se borraba era el logo: un dibujo
 * claro sobre blanco sin contorno. Mejor dejarlo como vino. No más bajo: un
 * logo de letras finas sobre mucho blanco tiene apenas un 3% de tinta.
 */
const MAX_BORRADO = 0.995;
/** Menos opaco que esto cuenta como vacío (el borde de un PNG transparente). */
const ALFA_VACIO = 32;
/** El backend rechaza un logo con un lado de menos de 64 px. */
export const LADO_MINIMO_LOGO = 64;

interface Grupo {
  r: number;
  g: number;
  b: number;
  n: number;
}

function distancia(d: Uint8ClampedArray, i: number, c: Grupo): number {
  const dr = d[i] - c.r;
  const dg = d[i + 1] - c.g;
  const db = d[i + 2] - c.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Los índices (de píxel) del borde, sin repetir las esquinas. */
function indicesDelBorde(ancho: number, alto: number): number[] {
  const res: number[] = [];
  for (let x = 0; x < ancho; x++) {
    res.push(x);
    if (alto > 1) res.push((alto - 1) * ancho + x);
  }
  for (let y = 1; y < alto - 1; y++) {
    res.push(y * ancho);
    if (ancho > 1) res.push(y * ancho + ancho - 1);
  }
  return res;
}

/**
 * Los colores del fondo, mirando sólo el borde. Null si el borde no es parejo.
 * Cada grupo es el promedio de los píxeles que se le parecen: los cuadritos
 * dan dos grupos (blanco y gris), un fondo liso da uno.
 */
function coloresDelFondo(p: Pixeles, borde: number[]): Grupo[] | null {
  const d = p.data;
  const grupos: Grupo[] = [];
  for (const k of borde) {
    const i = k * 4;
    let mejor: Grupo | null = null;
    let menor = Infinity;
    for (const g of grupos) {
      const dist = distancia(d, i, g);
      if (dist < menor) {
        menor = dist;
        mejor = g;
      }
    }
    if (mejor && menor <= TOLERANCIA) {
      // Promedio que se va corriendo: el centro no queda clavado en el
      // primer píxel, que puede ser justo uno con ruido del JPG.
      mejor.n++;
      mejor.r += (d[i] - mejor.r) / mejor.n;
      mejor.g += (d[i + 1] - mejor.g) / mejor.n;
      mejor.b += (d[i + 2] - mejor.b) / mejor.n;
    } else {
      grupos.push({ r: d[i], g: d[i + 1], b: d[i + 2], n: 1 });
    }
  }
  grupos.sort((a, b) => b.n - a.n);
  const elegidos: Grupo[] = [];
  let cubierto = 0;
  for (const g of grupos) {
    if (cubierto >= BORDE_PAREJO * borde.length || elegidos.length === MAX_COLORES_FONDO) break;
    elegidos.push(g);
    cubierto += g.n;
  }
  return cubierto >= BORDE_PAREJO * borde.length ? elegidos : null;
}

function cercaDelFondo(d: Uint8ClampedArray, i: number, fondo: Grupo[]): number {
  let menor = Infinity;
  for (const g of fondo) menor = Math.min(menor, distancia(d, i, g));
  return menor;
}

/**
 * Lo que queda con algo de dibujo, más un margen. El backend pide al menos 64
 * px por lado: si el dibujo es más chico, el recorte crece alrededor.
 */
function recortar(p: Pixeles): Recorte {
  const { data: d, width: ancho, height: alto } = p;
  let x0 = ancho;
  let y0 = alto;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (d[(y * ancho + x) * 4 + 3] > ALFA_VACIO) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, ancho, alto };
  // Un poco de aire: la sombra de la TV no queda cortada contra el borde.
  const margen = Math.max(2, Math.round(Math.max(x1 - x0, y1 - y0) * 0.02));
  const lado = (a: number, b: number, total: number): [number, number] => {
    let ini = Math.max(0, a - margen);
    let fin = Math.min(total - 1, b + margen);
    const minimo = Math.min(total, LADO_MINIMO_LOGO);
    while (fin - ini + 1 < minimo) {
      if (ini > 0) ini--;
      if (fin - ini + 1 < minimo && fin < total - 1) fin++;
    }
    return [ini, fin];
  };
  const [ix, fx] = lado(x0, x1, ancho);
  const [iy, fy] = lado(y0, y1, alto);
  return { x: ix, y: iy, ancho: fx - ix + 1, alto: fy - iy + 1 };
}

/**
 * Lo que sigue siendo fondo aunque se le coman r píxeles por cada lado (un
 * cuadrado de 2·r+1). Afuera de la imagen cuenta como fondo: si no, el borde
 * mismo se angostaba y el relleno no tenía por dónde empezar.
 */
function erosionar(m: Uint8Array, ancho: number, alto: number, r: number): Uint8Array {
  const pasada = (origen: Uint8Array, largo: number, cuantas: number, indice: (linea: number, i: number) => number) => {
    const res = new Uint8Array(origen.length);
    for (let linea = 0; linea < cuantas; linea++) {
      // Cuántos "no fondo" hay en la ventana [i − r, i + r].
      let faltan = 0;
      for (let i = 0; i <= r && i < largo; i++) if (!origen[indice(linea, i)]) faltan++;
      for (let i = 0; i < largo; i++) {
        if (faltan === 0) res[indice(linea, i)] = 1;
        const sale = i - r;
        const entra = i + r + 1;
        if (sale >= 0 && !origen[indice(linea, sale)]) faltan--;
        if (entra < largo && !origen[indice(linea, entra)]) faltan++;
      }
    }
    return res;
  };
  const horizontal = pasada(m, ancho, alto, (y, x) => y * ancho + x);
  return pasada(horizontal, alto, ancho, (x, y) => y * ancho + x);
}

/**
 * Las motas que quedan sueltas en lo borrado: ruido del JPG, un poco más
 * oscuro que el blanco, que el relleno no se comió. En la TV eran puntitos
 * flotando y además agrandaban el recorte (el gallo quedaba corrido y más
 * chico). Una isla que en ningún píxel se aleja del fondo más de dos
 * tolerancias es mancha, no dibujo: una letra, por chica que sea, contrasta.
 */
function borrarMotas(esFondo: Uint8Array, lejos: Uint16Array, ancho: number, alto: number) {
  const total = ancho * alto;
  const visto = new Uint8Array(total);
  const isla = new Int32Array(total);
  for (let inicio = 0; inicio < total; inicio++) {
    if (esFondo[inicio] || visto[inicio]) continue;
    let n = 0;
    let fuerte = false;
    isla[n++] = inicio;
    visto[inicio] = 1;
    for (let j = 0; j < n; j++) {
      const k = isla[j];
      if (lejos[k] >= 2 * TOLERANCIA) fuerte = true;
      const x = k % ancho;
      const y = (k - x) / ancho;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
          const v = ny * ancho + nx;
          if (!esFondo[v] && !visto[v]) {
            visto[v] = 1;
            isla[n++] = v;
          }
        }
      }
    }
    if (!fuerte) for (let j = 0; j < n; j++) esFondo[isla[j]] = 1;
  }
}

export function quitarFondo(p: Pixeles): ResultadoFondo {
  const { data: d, width: ancho, height: alto } = p;
  const total = ancho * alto;
  if (total === 0) return { tipo: "sin-cambios" };
  const borde = indicesDelBorde(ancho, alto);

  // Un PNG que ya es transparente: el borde está vacío. Rellenarlo con la
  // varita borraría el contorno claro de un logo hecho para fondos oscuros.
  const vacios = borde.filter((k) => d[k * 4 + 3] <= ALFA_VACIO).length;
  if (vacios >= borde.length / 2) return { tipo: "ya-transparente", recorte: recortar(p) };

  const fondo = coloresDelFondo(p, borde);
  if (!fondo) return { tipo: "sin-cambios" };

  // Cuánto se aleja cada píxel del fondo (lo vacío, cero).
  const lejos = new Uint16Array(total);
  const parecido = new Uint8Array(total);
  for (let k = 0; k < total; k++) {
    lejos[k] = d[k * 4 + 3] <= ALFA_VACIO ? 0 : Math.round(cercaDelFondo(d, k * 4, fondo));
    parecido[k] = lejos[k] <= TOLERANCIA ? 1 : 0;
  }

  // Relleno desde el borde: sólo se borra lo que está PEGADO al borde. Pero
  // no por cualquier rendija: en el logo de los cuadritos, el blanco de
  // afuera tocaba el brillo blanco de adentro del círculo por un hueco de dos
  // píxeles donde el círculo se junta con el cartel, y el relleno se comía
  // medio círculo. Primero se rellena el fondo "angostado" (sólo pasa por
  // huecos de más de 2·r+1 píxeles) y después se le devuelven los r píxeles
  // de la orilla.
  const r = Math.max(ancho, alto) >= 480 ? 2 : 1;
  const angosto = erosionar(parecido, ancho, alto, r);
  const esFondo = new Uint8Array(total);
  const cola = new Int32Array(total);
  let cabeza = 0;
  let largo = 0;
  for (const k of borde) {
    if (!esFondo[k] && angosto[k]) {
      esFondo[k] = 1;
      cola[largo++] = k;
    }
  }
  const avanzar = (permitido: Uint8Array) => {
    while (cabeza < largo) {
      const k = cola[cabeza++];
      const x = k % ancho;
      if (x > 0) marcar(k - 1, permitido);
      if (x < ancho - 1) marcar(k + 1, permitido);
      if (k >= ancho) marcar(k - ancho, permitido);
      if (k + ancho < total) marcar(k + ancho, permitido);
    }
  };
  const marcar = (v: number, permitido: Uint8Array) => {
    if (!esFondo[v] && permitido[v]) {
      esFondo[v] = 1;
      cola[largo++] = v;
    }
  };
  avanzar(angosto);
  // La orilla: r pasos más, sólo por lo que se parece al fondo. No alcanzan
  // para cruzar la rendija entera.
  for (let paso = 0; paso < r; paso++) {
    const desde = largo;
    for (let j = 0; j < desde; j++) {
      const k = cola[j];
      const x = k % ancho;
      if (x > 0) marcar(k - 1, parecido);
      if (x < ancho - 1) marcar(k + 1, parecido);
      if (k >= ancho) marcar(k - ancho, parecido);
      if (k + ancho < total) marcar(k + ancho, parecido);
    }
  }
  borrarMotas(esFondo, lejos, ancho, alto);
  let borrados = 0;
  for (let k = 0; k < total; k++) borrados += esFondo[k];
  if (borrados > total * MAX_BORRADO) return { tipo: "sin-cambios" };

  // El borde del dibujo: los dos píxeles que tocan lo borrado mezclan el
  // color del logo con el del fondo (el suavizado). Dejarlos opacos dejaba un
  // halo blanco alrededor del gallo sobre el rojo de la TV: se aclaran según
  // cuánto se parecen al fondo y se les saca el fondo de encima del color.
  const anillo = new Uint8Array(total);
  const tocaA = (k: number, marca: Uint8Array) => {
    const x = k % ancho;
    return (
      (x > 0 && marca[k - 1] === 1) ||
      (x < ancho - 1 && marca[k + 1] === 1) ||
      (k >= ancho && marca[k - ancho] === 1) ||
      (k + ancho < total && marca[k + ancho] === 1)
    );
  };
  for (let k = 0; k < total; k++) if (!esFondo[k] && tocaA(k, esFondo)) anillo[k] = 1;
  const segundo = new Uint8Array(total);
  for (let k = 0; k < total; k++) if (!esFondo[k] && !anillo[k] && tocaA(k, anillo)) segundo[k] = 1;

  for (let k = 0; k < total; k++) {
    const i = k * 4;
    if (esFondo[k]) {
      d[i + 3] = 0;
      continue;
    }
    if (!anillo[k] && !segundo[k]) continue;
    let mas: Grupo = fondo[0];
    let menor = Infinity;
    for (const g of fondo) {
      const dist = distancia(d, i, g);
      if (dist < menor) {
        menor = dist;
        mas = g;
      }
    }
    // A 3 tolerancias del fondo ya es dibujo entero.
    const a = Math.min(1, Math.max(0, (menor - TOLERANCIA) / (2 * TOLERANCIA)));
    if (a >= 1) continue;
    if (a <= 0) {
      d[i + 3] = 0;
      continue;
    }
    // color = a·logo + (1−a)·fondo  ⇒  logo = (color − (1−a)·fondo) / a
    d[i] = (d[i] - (1 - a) * mas.r) / a;
    d[i + 1] = (d[i + 1] - (1 - a) * mas.g) / a;
    d[i + 2] = (d[i + 2] - (1 - a) * mas.b) / a;
    d[i + 3] = d[i + 3] * a;
  }

  return { tipo: "quitado", recorte: recortar(p) };
}
