/**
 * El borde de los platos en la foto de un plato sin fondo (Kevin, 9-nov).
 *
 * Con la varita sola (quitarFondo) el plato blanco sobre fondo blanco salía
 * mordido y con aureola: el canto del plato y el difuminado que deja la app
 * que lo recortó son del mismo gris claro que el fondo, y por color no hay
 * cómo saber dónde termina el plato. Los íconos hechos a mano con esas mismas
 * fotos se veían bien porque el plato se recortó con su FORMA.
 *
 * Un plato en una foto es una elipse (redondo, visto de arriba o un poco de
 * costado). Esto busca, en el borde de lo que dejó la varita, las elipses que
 * calzan con buena parte de ese borde: se prueban elipses por cinco puntos
 * del borde y gana la que pasa por más puntos (RANSAC). Lo que asoma del
 * plato (una papa, el ala del pollo), los mordiscos y el hueco entre dos
 * platos que se tocan no caen sobre la elipse y no la tuercen.
 *
 * La primera versión tomaba el contorno convexo de cada mancha: estiraba el
 * plato hasta la punta de la papa que asomaba y rellenaba de blanco la cuña
 * de al lado, y con platos y salseras que se tocan tapaba de blanco el hueco
 * entre ellos, con bordes rectos. Kevin lo vio en la TV de prueba (9-nov).
 *
 * Un plato cuadrado o rectangular no es una elipse: si en una mancha no hay
 * ningún plato redondo, se prueba con el contorno convexo de su CANTO (los
 * puntos del borde donde lo de adentro es claro, no la papa que asoma).
 *
 * Adentro de cada plato, todo opaco: se rellenan los mordiscos del canto.
 * Afuera, en la misma mancha, queda sólo lo que se aparta del fondo de verdad
 * (lo que asoma); el difuminado y el fondo que quedó encerrado entre platos
 * se van. Una mancha sin ningún plato no se toca: queda lo de la varita.
 */

import { manchas } from "./mascaras";

/** Qué tan lejos del color del fondo es "plato" seguro: el canto gris, ~240 de 255. */
export const UMBRAL_PLATO = 26;
/** Lo más ancho que puede ser el difuminado alrededor del plato. */
const DIFUMINADO_MAXIMO = 0.04;
/** Menos que esto de la imagen no es un plato ni lo tiene. */
const MANCHA_MINIMA = 0.004;
/**
 * El fondo que quedó encerrado entre platos que se tocan (la varita entra
 * sólo desde el borde de la foto) y es al menos esto de la imagen. Más chico
 * es el brillo del plato o el arroz, que no se toca.
 */
const ENCERRADO_MINIMO = 0.0015;
const MAX_PLATOS = 8;
/** Elipses que se prueban por cada plato. */
const VUELTAS = 400;
/** Más puntos del borde que esto se toman salteados (para que no tarde). */
const PUNTOS_MAXIMOS = 2500;
/**
 * La elipse tiene que pasar por el borde en dos tercios de su vuelta, y por
 * más de la mitad de su largo. Con las fotos de la pollería un plato redondo
 * da 32 a 36 de 36 sectores y 0,73 o más; una elipse metida en un plato
 * cuadrado, 17 a 20 sectores y menos de 0,5 (le cortaba las esquinas y
 * rellenaba de blanco donde se salía del plato).
 */
const VUELTA_MINIMA = 2 / 3;
const LARGO_MINIMO = 0.55;
/** Y su adentro no puede ser fondo en más que esto (los mordiscos, sí). */
const FONDO_MAXIMO = 0.1;
/**
 * Un plato que no es redondo (cuadrado, rectangular) va por el contorno
 * convexo de su canto: los puntos del borde donde lo de adentro es claro
 * (el plato), no los de la papa o el pollo que asoman. Lejos del fondo hasta
 * esto es claro: el plato gris, el arroz; una papa da ~200.
 */
const CANTO_MAXIMO = 80;
/** El hueco que puede haber adentro de ese contorno: más es que abarca dos platos. */
const HUECO_MAXIMO = 0.06;
/** Un plato de costado se ve achatado, pero no más que esto. */
const ACHATADO_MINIMO = 0.35;
/** El radio chico de un plato, como parte del lado de la imagen (una salsera ~6%). */
const RADIO_MINIMO = 0.04;

/** A·u² + B·uv + C·v² + D·u + E·v + F, en coordenadas normalizadas. */
type Conica = [number, number, number, number, number, number];

interface Plato {
  /** Con el adentro negativo. */
  q: Conica;
  /** El centro, normalizado. */
  cu: number;
  cv: number;
  /** Los semiejes, en píxeles. */
  a: number;
  b: number;
}

export interface Platos {
  /** Cuánto de cada píxel es plato (0 a 1, con el borde suavizado medio píxel). */
  cobertura: Float32Array;
  /**
   * Las manchas que tienen un plato: ahí lo que no es plato queda sólo si se
   * aparta del fondo de verdad. En las demás manda la varita.
   */
  zona: Uint8Array;
}

/** Siempre los mismos números: la misma foto sale siempre igual. */
function azar(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inversa3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  return [A / det, D / det, G / det, B / det, E / det, H / det, C / det, F / det, I / det];
}

function por3(x: number[], y: number[]): number[] {
  const r = new Array<number>(9).fill(0);
  for (let f = 0; f < 3; f++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) r[f * 3 + c] += x[f * 3 + k] * y[k * 3 + c];
  return r;
}

/** Los valores propios reales de una matriz de 3 × 3. */
function valoresPropios(m: number[]): number[] {
  const traza = m[0] + m[4] + m[8];
  const menores = m[0] * m[4] - m[1] * m[3] + m[0] * m[8] - m[2] * m[6] + m[4] * m[8] - m[5] * m[7];
  const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  // λ³ + a·λ² + b·λ + c = 0, con λ = t − a/3: t³ + p·t + q = 0.
  const a = -traza;
  const b = menores;
  const c = -det;
  const p = b - (a * a) / 3;
  const q = (2 * a * a * a) / 27 - (a * b) / 3 + c;
  const disc = (q * q) / 4 + (p * p * p) / 27;
  if (disc > 0) {
    const r = Math.sqrt(disc);
    return [Math.cbrt(-q / 2 + r) + Math.cbrt(-q / 2 - r) - a / 3];
  }
  const r = Math.sqrt(Math.max(0, -p / 3));
  const coseno = r === 0 ? 0 : Math.max(-1, Math.min(1, -q / (2 * r * r * r)));
  const fi = Math.acos(coseno);
  return [0, 1, 2].map((k) => 2 * r * Math.cos((fi - 2 * Math.PI * k) / 3) - a / 3);
}

function vectorPropio(m: number[], l: number): number[] | null {
  const f = [
    [m[0] - l, m[1], m[2]],
    [m[3], m[4] - l, m[5]],
    [m[6], m[7], m[8] - l],
  ];
  const cruz = (x: number[], y: number[]) => [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  let mejor: number[] | null = null;
  let norma = 0;
  for (const v of [cruz(f[0], f[1]), cruz(f[0], f[2]), cruz(f[1], f[2])]) {
    const n = Math.hypot(v[0], v[1], v[2]);
    if (n > norma) {
      norma = n;
      mejor = v;
    }
  }
  return mejor && norma > 1e-15 ? mejor.map((x) => x / norma) : null;
}

/**
 * La elipse que mejor pasa por los puntos (Fitzgibbon, en la versión estable
 * de Halír y Flusser): siempre sale una elipse, nunca una hipérbola.
 */
function ajustar(us: Float64Array, vs: Float64Array, cuales: ArrayLike<number>, n: number): Conica | null {
  const S1 = new Array<number>(9).fill(0);
  const S2 = new Array<number>(9).fill(0);
  const S3 = new Array<number>(9).fill(0);
  for (let j = 0; j < n; j++) {
    const u = us[cuales[j]];
    const v = vs[cuales[j]];
    const d1 = [u * u, u * v, v * v];
    const d2 = [u, v, 1];
    for (let f = 0; f < 3; f++) {
      for (let c = 0; c < 3; c++) {
        S1[f * 3 + c] += d1[f] * d1[c];
        S2[f * 3 + c] += d1[f] * d2[c];
        S3[f * 3 + c] += d2[f] * d2[c];
      }
    }
  }
  const S3i = inversa3(S3);
  if (!S3i) return null;
  const S2t = [S2[0], S2[3], S2[6], S2[1], S2[4], S2[7], S2[2], S2[5], S2[8]];
  const T = por3(S3i, S2t).map((x) => -x);
  const S2T = por3(S2, T);
  const M = S1.map((x, k) => x + S2T[k]);
  const M2 = [M[6] / 2, M[7] / 2, M[8] / 2, -M[3], -M[4], -M[5], M[0] / 2, M[1] / 2, M[2] / 2];
  for (const l of valoresPropios(M2)) {
    const v = vectorPropio(M2, l);
    if (!v || 4 * v[0] * v[2] - v[1] * v[1] <= 0) continue;
    return [
      v[0],
      v[1],
      v[2],
      T[0] * v[0] + T[1] * v[1] + T[2] * v[2],
      T[3] * v[0] + T[4] * v[1] + T[5] * v[2],
      T[6] * v[0] + T[7] * v[1] + T[8] * v[2],
    ];
  }
  return null;
}

function geometria(q: Conica, escala: number): Plato | null {
  let [A, B, C, D, E, F] = q;
  const det = 4 * A * C - B * B;
  if (det <= 0) return null;
  if (A < 0) {
    A = -A;
    B = -B;
    C = -C;
    D = -D;
    E = -E;
    F = -F;
  }
  const cu = (B * E - 2 * C * D) / det;
  const cv = (B * D - 2 * A * E) / det;
  const enCentro = A * cu * cu + B * cu * cv + C * cv * cv + D * cu + E * cv + F;
  if (enCentro >= 0) return null;
  const medio = (A + C) / 2;
  const radio = Math.hypot((A - C) / 2, B / 2);
  const chico = medio - radio;
  if (chico <= 0) return null;
  return { q: [A, B, C, D, E, F], cu, cv, a: Math.sqrt(-enCentro / chico) * escala, b: Math.sqrt(-enCentro / (medio + radio)) * escala };
}

/** Distancia aproximada al borde de la elipse, en píxeles: negativa adentro. */
function distancia(pl: Plato, u: number, v: number, escala: number): number {
  const [A, B, C, D, E, F] = pl.q;
  const q = A * u * u + B * u * v + C * v * v + D * u + E * v + F;
  const gu = 2 * A * u + B * v + D;
  const gv = B * u + 2 * C * v + E;
  const g = Math.hypot(gu, gv);
  if (g < 1e-12) return q < 0 ? -1e9 : 1e9;
  return (q / g) * escala;
}

type Punto = [number, number];

interface Contorno {
  /** Cada lado como semiplano: nx·x + ny·y + c ≥ 0 es adentro (c, en píxeles). */
  nx: number[];
  ny: number[];
  c: number[];
  vertices: Punto[];
  centro: Punto;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function convexo(puntos: Punto[]): Punto[] {
  puntos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cruz = (o: Punto, a: Punto, b: Punto) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const abajo: Punto[] = [];
  for (const p of puntos) {
    while (abajo.length >= 2 && cruz(abajo[abajo.length - 2], abajo[abajo.length - 1], p) <= 0) abajo.pop();
    abajo.push(p);
  }
  const arriba: Punto[] = [];
  for (let i = puntos.length - 1; i >= 0; i--) {
    const p = puntos[i];
    while (arriba.length >= 2 && cruz(arriba[arriba.length - 2], arriba[arriba.length - 1], p) <= 0) arriba.pop();
    arriba.push(p);
  }
  arriba.pop();
  abajo.pop();
  return abajo.concat(arriba);
}

function semiplanos(vertices: Punto[]): Contorno | null {
  if (vertices.length < 3) return null;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of vertices) {
    cx += x;
    cy += y;
  }
  cx /= vertices.length;
  cy /= vertices.length;
  const nx: number[] = [];
  const ny: number[] = [];
  const c: number[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const [ax, ay] = vertices[i];
    const [bx, by] = vertices[(i + 1) % vertices.length];
    const largo = Math.hypot(bx - ax, by - ay) || 1;
    let a = -(by - ay) / largo;
    let b = (bx - ax) / largo;
    let cc = -(a * ax + b * ay);
    if (a * cx + b * cy + cc < 0) {
      a = -a;
      b = -b;
      cc = -cc;
    }
    nx.push(a);
    ny.push(b);
    c.push(cc);
  }
  const xs = vertices.map((v) => v[0]);
  const ys = vertices.map((v) => v[1]);
  return { nx, ny, c, vertices, centro: [cx, cy], x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * Cuánto mide el difuminado: desde el contorno hacia adentro, cuánto hay que
 * caminar hasta el primer píxel que es plato seguro. La mediana: en un
 * mordisco se camina mucho más, pero son pocos.
 */
function anchoDelDifuminado(contorno: Contorno, seguro: (k: number) => boolean, ancho: number, alto: number, maximo: number): number {
  const { vertices, nx, ny } = contorno;
  const medidas: number[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const [ax, ay] = vertices[i];
    const [bx, by] = vertices[(i + 1) % vertices.length];
    const largo = Math.hypot(bx - ax, by - ay);
    for (let t = 0; t < largo; t += 3) {
      const px = ax + ((bx - ax) * t) / largo;
      const py = ay + ((by - ay) * t) / largo;
      let distancia = maximo;
      for (let paso = 0; paso < maximo; paso++) {
        const qx = Math.floor(px + nx[i] * paso);
        const qy = Math.floor(py + ny[i] * paso);
        if (qx < 0 || qy < 0 || qx >= ancho || qy >= alto) continue;
        if (seguro(qy * ancho + qx)) {
          distancia = paso;
          break;
        }
      }
      medidas.push(distancia);
    }
  }
  if (medidas.length === 0) return 0;
  medidas.sort((a, b) => a - b);
  return medidas[Math.floor(medidas.length / 2)];
}

/**
 * Los platos de la foto, o null si no hay ninguno: entonces se queda lo de
 * la varita.
 *
 * `lejos` es la distancia de cada píxel al color del fondo, `esFondo` lo que
 * borró la varita y `tol` la tolerancia con la que lo borró.
 */
export function cubrirPlatos(lejos: Uint16Array, esFondo: Uint8Array, ancho: number, alto: number, tol: number): Platos | null {
  const total = ancho * alto;
  const lado = Math.max(ancho, alto);
  const escala = lado / 2;
  const ox = ancho / 2;
  const oy = alto / 2;

  // La forma: lo que dejó la varita, sin el fondo encerrado entre platos (si
  // no, tres platos que se tocan son una sola mancha redonda).
  const forma = new Uint8Array(total);
  const pareceFondo = new Uint8Array(total);
  for (let k = 0; k < total; k++) {
    forma[k] = esFondo[k] ? 0 : 1;
    pareceFondo[k] = !esFondo[k] && lejos[k] <= tol ? 1 : 0;
  }
  for (const hueco of manchas(pareceFondo, ancho, alto, Math.round(total * ENCERRADO_MINIMO))) for (const k of hueco) forma[k] = 0;

  const borde: number[] = [];
  const grandes = manchas(forma, ancho, alto, Math.round(total * MANCHA_MINIMA));
  for (const mancha of grandes) {
    for (const k of mancha) {
      const x = k % ancho;
      const y = (k - x) / ancho;
      if (x === 0 || y === 0 || x === ancho - 1 || y === alto - 1 || !forma[k - 1] || !forma[k + 1] || !forma[k - ancho] || !forma[k + ancho]) {
        borde.push(k);
      }
    }
  }
  if (borde.length < 30) return null;
  const salto = Math.max(1, Math.ceil(borde.length / PUNTOS_MAXIMOS));
  const n = Math.ceil(borde.length / salto);
  const us = new Float64Array(n);
  const vs = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const k = borde[j * salto];
    const x = k % ancho;
    us[j] = (x + 0.5 - ox) / escala;
    vs[j] = ((k - x) / ancho + 0.5 - oy) / escala;
  }

  const cerca = Math.max(2, lado * 0.005);
  const razonable = (pl: Plato) => {
    const x = ox + pl.cu * escala;
    const y = oy + pl.cv * escala;
    return pl.b >= lado * RADIO_MINIMO && pl.a <= lado * 0.75 && pl.b / pl.a >= ACHATADO_MINIMO && x >= 0 && y >= 0 && x <= ancho && y <= alto;
  };
  const sobreElBorde = (pl: Plato, lista: Int32Array, m: number) => {
    const res: number[] = [];
    for (let j = 0; j < m; j++) if (Math.abs(distancia(pl, us[lista[j]], vs[lista[j]], escala)) < cerca) res.push(lista[j]);
    return res;
  };
  const esPlato = (pl: Plato, encima: number[]) => {
    // Pasa por el borde en buena parte de la vuelta...
    const sectores = new Uint8Array(36);
    for (const j of encima) {
      const ang = Math.atan2(vs[j] - pl.cv, us[j] - pl.cu);
      sectores[Math.min(35, Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 36))] = 1;
    }
    let vistos = 0;
    for (const s of sectores) vistos += s;
    if (vistos < 36 * VUELTA_MINIMA) return false;
    const perimetro = Math.PI * (3 * (pl.a + pl.b) - Math.sqrt((3 * pl.a + pl.b) * (pl.a + 3 * pl.b)));
    if (encima.length * salto < LARGO_MINIMO * perimetro) return false;
    // ...y adentro no tiene fondo (el hueco entre dos platos), salvo mordiscos.
    const cx = ox + pl.cu * escala;
    const cy = oy + pl.cv * escala;
    let adentro = 0;
    let fondo = 0;
    for (let y = Math.max(0, Math.floor(cy - pl.a)); y <= Math.min(alto - 1, Math.ceil(cy + pl.a)); y++) {
      for (let x = Math.max(0, Math.floor(cx - pl.a)); x <= Math.min(ancho - 1, Math.ceil(cx + pl.a)); x++) {
        if (distancia(pl, (x + 0.5 - ox) / escala, (y + 0.5 - oy) / escala, escala) > -1) continue;
        adentro++;
        if (!forma[y * ancho + x]) fondo++;
      }
    }
    return adentro > 0 && fondo / adentro <= FONDO_MAXIMO;
  };
  const parecidas = (x: Plato, y: Plato) =>
    Math.hypot(x.cu - y.cu, x.cv - y.cv) * escala < lado * 0.05 && Math.abs(x.a - y.a) < x.a * 0.1 && Math.abs(x.b - y.b) < x.b * 0.1;

  const rnd = azar(0x5eed);
  const vivo = new Uint8Array(n).fill(1);
  const lista = new Int32Array(n);
  const cinco = new Int32Array(5);
  const platos: Plato[] = [];
  const descartadas: Plato[] = [];
  while (platos.length < MAX_PLATOS && descartadas.length <= 4) {
    let m = 0;
    for (let j = 0; j < n; j++) if (vivo[j]) lista[m++] = j;
    if (m < 30) break;
    let mejor: Plato | null = null;
    let mejorCuenta = 0;
    for (let vuelta = 0; vuelta < VUELTAS; vuelta++) {
      // Cinco puntos cerca uno del otro: con suerte, del canto de un mismo plato.
      const primero = lista[Math.floor(rnd() * m)];
      const radio = ((0.1 + 0.35 * rnd()) * lado) / escala;
      cinco[0] = primero;
      let c = 1;
      for (let intento = 0; intento < 80 && c < 5; intento++) {
        const j = lista[Math.floor(rnd() * m)];
        if (Math.hypot(us[j] - us[primero], vs[j] - vs[primero]) > radio) continue;
        let repetido = false;
        for (let t = 0; t < c; t++) if (cinco[t] === j) repetido = true;
        if (!repetido) cinco[c++] = j;
      }
      if (c < 5) continue;
      const q = ajustar(us, vs, cinco, 5);
      const pl = q && geometria(q, escala);
      if (!pl || !razonable(pl) || descartadas.some((d) => parecidas(d, pl))) continue;
      let cuenta = 0;
      for (let j = 0; j < m; j++) if (Math.abs(distancia(pl, us[lista[j]], vs[lista[j]], escala)) < cerca) cuenta++;
      if (cuenta > mejorCuenta) {
        mejor = pl;
        mejorCuenta = cuenta;
      }
    }
    if (!mejor) break;
    // Se ajusta de nuevo con todos los puntos del canto que tocó.
    let pl = mejor;
    for (let vez = 0; vez < 3; vez++) {
      const encima = sobreElBorde(pl, lista, m);
      if (encima.length < 6) break;
      const q = ajustar(us, vs, encima, encima.length);
      const otra = q && geometria(q, escala);
      if (!otra || !razonable(otra)) break;
      pl = otra;
    }
    if (esPlato(pl, sobreElBorde(pl, lista, m))) {
      platos.push(pl);
      // Su canto y lo de adentro ya no sirven para buscar otro plato.
      for (let j = 0; j < n; j++) if (vivo[j] && distancia(pl, us[j], vs[j], escala) < cerca * 1.5) vivo[j] = 0;
    } else {
      descartadas.push(pl);
    }
  }
  const seguro = (k: number) => !esFondo[k] && lejos[k] > UMBRAL_PLATO;
  const maximo = Math.round(lado * DIFUMINADO_MAXIMO);
  const cobertura = new Float32Array(total);
  let hubo = platos.length > 0;
  for (const pl of platos) {
    const [A, B, C, D, E] = pl.q;
    const cx = ox + pl.cu * escala;
    const cy = oy + pl.cv * escala;
    // Cuánto mide el difuminado: desde el borde hacia adentro, hasta el
    // primer píxel que es plato seguro. La mediana: en un mordisco se camina
    // mucho más, y donde la comida tapa el canto, nada.
    const medidas: number[] = [];
    for (let i = 0; i < 180; i++) {
      const ang = (i / 180) * 2 * Math.PI;
      const du = Math.cos(ang);
      const dv = Math.sin(ang);
      const cuad = A * du * du + B * du * dv + C * dv * dv;
      const enCentro = A * pl.cu * pl.cu + B * pl.cu * pl.cv + C * pl.cv * pl.cv + D * pl.cu + E * pl.cv + pl.q[5];
      const t = Math.sqrt(-enCentro / cuad);
      const u = pl.cu + du * t;
      const v = pl.cv + dv * t;
      const gu = 2 * A * u + B * v + D;
      const gv = B * u + 2 * C * v + E;
      const g = Math.hypot(gu, gv) || 1;
      const px = ox + u * escala;
      const py = oy + v * escala;
      let paso = 0;
      for (; paso < maximo; paso++) {
        const qx = Math.floor(px - (gu / g) * paso);
        const qy = Math.floor(py - (gv / g) * paso);
        if (qx < 0 || qy < 0 || qx >= ancho || qy >= alto) continue;
        if (seguro(qy * ancho + qx)) break;
      }
      if (paso > 0) medidas.push(paso);
    }
    medidas.sort((x, y) => x - y);
    const metido = medidas.length >= 36 ? medidas[Math.floor(medidas.length / 2)] : 0;
    for (let y = Math.max(0, Math.floor(cy - pl.a) - 2); y <= Math.min(alto - 1, Math.ceil(cy + pl.a) + 2); y++) {
      for (let x = Math.max(0, Math.floor(cx - pl.a) - 2); x <= Math.min(ancho - 1, Math.ceil(cx + pl.a) + 2); x++) {
        const d = distancia(pl, (x + 0.5 - ox) / escala, (y + 0.5 - oy) / escala, escala);
        const a = Math.min(1, Math.max(0, -d - metido + 0.5));
        const k = y * ancho + x;
        if (a > cobertura[k]) cobertura[k] = a;
      }
    }
  }

  const cubrirPorElCanto = (mancha: Int32Array): boolean => {
    const w = Math.max(3, Math.round(lado * 0.012));
    const canto: Punto[] = [];
    for (const k of mancha) {
      const x = k % ancho;
      const y = (k - x) / ancho;
      if (x === 0 || y === 0 || x === ancho - 1 || y === alto - 1) continue;
      if (forma[k - 1] && forma[k + 1] && forma[k - ancho] && forma[k + ancho]) continue;
      let hay = 0;
      let claro = 0;
      for (let yy = Math.max(0, y - w); yy <= Math.min(alto - 1, y + w); yy++) {
        for (let xx = Math.max(0, x - w); xx <= Math.min(ancho - 1, x + w); xx++) {
          const kk = yy * ancho + xx;
          if (!forma[kk]) continue;
          hay++;
          if (lejos[kk] <= CANTO_MAXIMO) claro++;
        }
      }
      if (hay > 0 && claro / hay >= 0.6) canto.push([x + 0.5, y + 0.5]);
    }
    if (canto.length < 30) return false;
    const contorno = semiplanos(convexo(canto));
    if (!contorno) return false;
    // El canto tiene que dar la vuelta al plato, no ser un pedazo.
    const [mx, my] = contorno.centro;
    const sectores = new Uint8Array(36);
    for (const [x, y] of canto) sectores[Math.min(35, Math.floor(((Math.atan2(y - my, x - mx) + Math.PI) / (2 * Math.PI)) * 36))] = 1;
    let vistos = 0;
    for (const s of sectores) vistos += s;
    if (vistos < 36 * VUELTA_MINIMA) return false;
    const { x0, y0, x1, y1 } = contorno;
    const adentroDe = (x: number, y: number) => {
      let menor = Infinity;
      for (let i = 0; i < contorno.nx.length; i++) menor = Math.min(menor, contorno.nx[i] * x + contorno.ny[i] * y + contorno.c[i]);
      return menor;
    };
    let adentro = 0;
    let hueco = 0;
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(alto - 1, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(ancho - 1, Math.ceil(x1)); x++) {
        if (adentroDe(x + 0.5, y + 0.5) < 1) continue;
        adentro++;
        if (!forma[y * ancho + x]) hueco++;
      }
    }
    if (adentro === 0 || hueco / adentro > HUECO_MAXIMO) return false;
    const metido = anchoDelDifuminado(contorno, seguro, ancho, alto, maximo);
    for (let y = Math.max(0, Math.floor(y0) - 2); y <= Math.min(alto - 1, Math.ceil(y1) + 2); y++) {
      for (let x = Math.max(0, Math.floor(x0) - 2); x <= Math.min(ancho - 1, Math.ceil(x1) + 2); x++) {
        const a = Math.min(1, Math.max(0, adentroDe(x + 0.5, y + 0.5) - metido + 0.5));
        const k = y * ancho + x;
        if (a > cobertura[k]) cobertura[k] = a;
      }
    }
    return true;
  };

  // Las manchas sin un plato redondo: ¿un plato cuadrado o rectangular?
  for (const mancha of grandes) {
    let conPlato = false;
    for (const k of mancha) {
      if (cobertura[k] >= 1) {
        conPlato = true;
        break;
      }
    }
    if (!conPlato && cubrirPorElCanto(mancha)) hubo = true;
  }
  if (!hubo) return null;

  // Las manchas que tienen un plato adentro.
  const zona = new Uint8Array(total);
  const queda = new Uint8Array(total);
  for (let k = 0; k < total; k++) queda[k] = esFondo[k] ? 0 : 1;
  for (const mancha of manchas(queda, ancho, alto, 1)) {
    let conPlato = false;
    for (const k of mancha) {
      if (cobertura[k] >= 1) {
        conPlato = true;
        break;
      }
    }
    if (conPlato) for (const k of mancha) zona[k] = 1;
  }
  return { cobertura, zona };
}
