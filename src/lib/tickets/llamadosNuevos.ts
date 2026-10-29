/**
 * Qué llamados de la TV de tickets son NUEVOS en esta vuelta del sondeo, y
 * tienen que sonar.
 *
 * La TV pregunta cada pocos segundos y recibe los listos con la hora de su
 * último llamado. Suena un número cuando su llamado es más nuevo que el que
 * ya conocía: así "Llamar otra vez" vuelve a sonar, y un 0001 de después de
 * reiniciar la numeración también.
 *
 * Lo que ya estaba llamado cuando la TV se encendió NO suena (la primera
 * vuelta sólo aprende): prender la TV a media tarde no puede cantar diez
 * números viejos seguidos. Tampoco un llamado de hace rato que llega tarde
 * (la TV estuvo sin conexión): pasado `VIGENCIA_MS` ya nadie lo espera.
 */

export const VIGENCIA_MS = 45_000;

export interface Llamado {
  numero: number;
  llamadoEn: number | null;
}

export function llamadosNuevos(
  listos: Llamado[],
  vistos: Map<number, number>,
  ahoraServidor: number,
  primeraVez: boolean,
): number[] {
  const nuevos: Llamado[] = [];
  for (const l of listos) {
    if (l.llamadoEn == null) continue;
    const antes = vistos.get(l.numero) ?? 0;
    if (l.llamadoEn <= antes) continue;
    vistos.set(l.numero, l.llamadoEn);
    if (!primeraVez && ahoraServidor - l.llamadoEn < VIGENCIA_MS) nuevos.push(l);
  }
  // En el orden en que se llamaron: el primero que despacho tocó, primero.
  return nuevos.sort((a, b) => (a.llamadoEn ?? 0) - (b.llamadoEn ?? 0)).map((l) => l.numero);
}
