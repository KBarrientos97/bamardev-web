/**
 * Las cuentas de los gráficos de Reportes (la escala del eje, la curva, la
 * paleta), aparte de los componentes de `graficos.tsx` para poder probarlas.
 */

/** Paleta de categorías. El ámbar queda para el fiado: es el color de la plata que te deben. */
export const PALETA = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#F43F5E", "#06B6D4", "#84CC16", "#94A3B8"];

/**
 * Un tope "redondo" para el eje: 2.527 → 3.000 con pasos de 750. Con el
 * máximo pelado el eje decía "632 · 1,3 mil · 1,9 mil", que no se lee.
 */
export function escala(max: number, pasos = 4): { tope: number; paso: number } {
  if (!(max > 0)) return { tope: 1, paso: 0.25 };
  const crudo = max / pasos;
  const mag = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= crudo) ?? 10 * mag;
  return { tope: paso * Math.ceil(max / paso - 1e-9), paso };
}

/**
 * La curva suave que pasa por los puntos sin pasarse de largo (Fritsch–Carlson):
 * una curva común entre 0 y 2.500 dibuja una panza por debajo de cero, que se
 * lee como un día con ventas negativas.
 */
export function caminoSuave(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  if (n === 2) return `M${pts[0][0]},${pts[0][1]}L${pts[1][0]},${pts[1][1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1));
  }
  const t = new Array<number>(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * m[i];
      t[i + 1] = tau * b * m[i];
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}
