import { precioFijo, precioHoras, round2 } from "./calculo";
import type { TipoMesa } from "./tipos";

/**
 * Las opciones de tiempo fijo del selector de horas (abrir y extender).
 *
 * Antes eran sólo los paquetes del tipo de mesa: un tipo sin paquete de 2 h no
 * ofrecía 2 h (había que ir a "Otra cantidad" y subir con el +), y "Abrir
 * mesa" arrancaba igual en 2 h sin ningún botón marcado, cobrando algo que no
 * se veía elegido (QA del 13-oct). Ahora 1, 2 y 3 h están siempre, a lo que
 * cobra el servidor (`precioFijo`: los paquetes combinados si convienen, la
 * hora suelta a tarifa si no), y los paquetes se suman a esas y se marcan.
 * Lo que pasa de ahí sigue en "Otra cantidad", que arranca en 4.
 */
export const HORAS_SIEMPRE = [1, 2, 3] as const;

export interface OpcionHoras {
  h: number;
  /** Lo que se cobra, con paquetes y promo: lo mismo que el botón de cobrar. */
  precio: number;
  /** Hay un paquete de exactamente estas horas. */
  paquete: boolean;
  /** Lo que se ahorra por los paquetes contra la tarifa por hora (sin la promo, que se dice aparte). */
  ahorro: number;
  /**
   * Un paquete con precio especial: es el que se marca. Uno cargado al mismo
   * precio que la tarifa (2 h a Bs 40 con Bs 20/h) no se marca: en el billar
   * de prueba eran los tres y la marca ya no decía nada.
   */
  especial: boolean;
}

export function opcionesHoras(tipo: TipoMesa): OpcionHoras[] {
  const horas = [...new Set<number>([...HORAS_SIEMPRE, ...tipo.paquetes.map((p) => p.h)])]
    .filter((h) => Number.isInteger(h) && h >= 1 && h <= 24)
    .sort((a, b) => a - b);
  return horas.map((h) => {
    const paquete = tipo.paquetes.some((p) => p.h === h);
    const ahorro = Math.max(0, round2(tipo.tarifa * h - precioHoras(tipo, h).precio));
    return { h, precio: precioFijo(tipo, h).precio, paquete, ahorro, especial: paquete && ahorro > 0 };
  });
}
