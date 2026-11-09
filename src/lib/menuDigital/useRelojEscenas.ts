import { useCallback, useEffect, useState } from "react";

/**
 * Hace avanzar las escenas de una TV animada, cada una lo que dura, y vuelve
 * a empezar al terminar.
 *
 * `vuelta` cuenta cada paso: va en la `key` de la escena para que React la
 * monte de nuevo y la animación de entrada se vea otra vez, aunque sea el
 * mismo plato (una TV con un solo plato, o la presentación de cada vuelta).
 *
 * El reloj depende del índice, de cuántas escenas hay y de lo que dura la
 * actual, NO de la lista: la TV pregunta cada 30 s y cada respuesta es una
 * lista nueva. Si dependiera de ella, cada pregunta reiniciaba la escena y un
 * plato de 6 s quedaba 6 s más (como pasó con las páginas de "20 s" en TvMenu).
 */
export function useRelojEscenas(duraciones: number[], pausado = false) {
  const [pos, setPos] = useState({ indice: 0, vuelta: 0 });
  const total = duraciones.length;
  const indice = total ? pos.indice % total : 0;
  const ms = duraciones[indice] ?? 0;

  useEffect(() => {
    if (pausado || total === 0 || ms <= 0) return;
    const id = setTimeout(() => setPos((p) => ({ indice: (p.indice + 1) % total, vuelta: p.vuelta + 1 })), ms);
    return () => clearTimeout(id);
  }, [pos, total, ms, pausado]);

  // Sin depender de `total`: el editor vuelve al principio cuando cambia el
  // diseño, y si `ir` cambiara con cada plato que se apaga, volvía al
  // principio también por eso. El índice se acota al leerlo (arriba).
  const ir = useCallback((i: number) => {
    setPos((p) => ({ indice: Math.max(0, Math.floor(i)), vuelta: p.vuelta + 1 }));
  }, []);

  return { indice, vuelta: pos.vuelta, ir };
}
