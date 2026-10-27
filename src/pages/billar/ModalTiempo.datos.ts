import { esTiempoFijoValido, precioDelTiempo, precioTiempoFijo, round2 } from "./calculo";
import type { TipoMesa } from "./tipos";

/**
 * Las opciones de tiempo fijo del selector (abrir y extender).
 *
 * Antes eran sólo los paquetes del tipo de mesa: un tipo sin paquete de 2 h no
 * ofrecía 2 h (había que ir a "Otra cantidad" y subir con el +), y "Abrir
 * mesa" arrancaba igual en 2 h sin ningún botón marcado, cobrando algo que no
 * se veía elegido (QA del 13-oct). Ahora 1, 2 y 3 h están siempre, a lo que
 * cobra el servidor (`precioTiempoFijo`: los paquetes combinados si convienen,
 * el tiempo suelto a tarifa si no), y los paquetes se suman a esas y se marcan.
 * Lo que pasa de ahí sigue en "Otra cantidad", que arranca en 4 h.
 *
 * Desde el 27-oct también 30 min: Miguel, el administrador del billar, vende
 * media hora de tiempo fijo, y antes lo mínimo era una hora.
 */
export const MINUTOS_SIEMPRE = [30, 60, 120, 180] as const;

export interface OpcionTiempo {
  min: number;
  /** Lo que se cobra, con paquetes y promo: lo mismo que el botón de cobrar. */
  precio: number;
  /** Hay un paquete de exactamente estos minutos. */
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

export function opcionesTiempo(tipo: TipoMesa): OpcionTiempo[] {
  const minutos = [...new Set<number>([...MINUTOS_SIEMPRE, ...tipo.paquetes.map((p) => p.min)])]
    .filter(esTiempoFijoValido)
    .sort((a, b) => a - b);
  return minutos.map((min) => {
    const paquete = tipo.paquetes.some((p) => p.min === min);
    const ahorro = Math.max(0, round2((tipo.tarifa * min) / 60 - precioDelTiempo(tipo, min).precio));
    return { min, precio: precioTiempoFijo(tipo, min).precio, paquete, ahorro, especial: paquete && ahorro > 0 };
  });
}
