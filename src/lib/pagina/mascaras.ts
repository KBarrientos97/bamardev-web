/**
 * Operaciones sobre máscaras de píxeles (1 = sí, 0 = no), fila por fila, que
 * comparten el quitado de fondo y el borde de los platos.
 */

/**
 * Lo que sigue en la máscara aunque se le coman r píxeles por cada lado (un
 * cuadrado de 2·r+1). Afuera de la imagen cuenta como parte de la máscara:
 * con el fondo, si no, el borde mismo se angostaba y el relleno de la varita
 * no tenía por dónde empezar.
 */
export function erosionar(m: Uint8Array, ancho: number, alto: number, r: number): Uint8Array {
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

/** Las manchas sueltas de la máscara (vecinos de a 4), de `minimo` píxeles o más. */
export function manchas(m: Uint8Array, ancho: number, alto: number, minimo: number): Int32Array[] {
  const total = ancho * alto;
  const visto = new Uint8Array(total);
  const cola = new Int32Array(total);
  const res: Int32Array[] = [];
  for (let inicio = 0; inicio < total; inicio++) {
    if (!m[inicio] || visto[inicio]) continue;
    let n = 0;
    cola[n++] = inicio;
    visto[inicio] = 1;
    for (let j = 0; j < n; j++) {
      const k = cola[j];
      const x = k % ancho;
      const vecinos = [x > 0 ? k - 1 : -1, x < ancho - 1 ? k + 1 : -1, k - ancho, k + ancho];
      for (const v of vecinos) {
        if (v < 0 || v >= total || !m[v] || visto[v]) continue;
        visto[v] = 1;
        cola[n++] = v;
      }
    }
    if (n >= minimo) res.push(cola.slice(0, n));
  }
  return res;
}
