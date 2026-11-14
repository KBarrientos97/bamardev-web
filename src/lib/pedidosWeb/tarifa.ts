import type { TarifaEnvio, TramoTarifa } from "./tipos";

/**
 * La tarifa de envío (CONTRATO-PEDIDOS-WEB §3): la MISMA cuenta que hace el
 * backend (`src/pedidos-web/tarifa.ts`). El backend es el que manda; esto le
 * muestra al cliente «Envío ≈ Bs X» antes de pedir, y a la cajera el sugerido.
 * Si se toca una cuenta, se toca la otra y los casos de los dos tests.
 *
 *   distanciaKm = haversine(sucursal, pin) × 1,3   (a 2 decimales)
 *
 * Hasta el primer tramo, su `base`. Después, el precio por km de cada tramo por
 * la parte de la distancia que cae en él. El resultado se redondea hacia arriba
 * al boliviano.
 */

/** Lo que rige cuando el negocio no cargó una tarifa propia. */
export const TARIFA_POR_DEFECTO: TarifaEnvio = {
  tramos: [{ hastaKm: 2, base: 7 }, { hastaKm: 5, porKm: 2 }, { hastaKm: 10, porKm: 1.5 }, { hastaKm: null, porKm: 1 }],
  maxKm: 12,
};

/** Las calles no van derechas: la línea recta se estira un 30 %. */
export const FACTOR_CALLES = 1.3;

const RADIO_TIERRA_KM = 6371;

export interface Punto {
  latitud: number;
  longitud: number;
}

const aRad = (g: number) => (g * Math.PI) / 180;
const aDosDecimales = (n: number) => Math.round(n * 100) / 100;

/** La distancia en línea recta, en km (fórmula de haversine). */
export function haversineKm(a: Punto, b: Punto): number {
  const dLat = aRad(b.latitud - a.latitud);
  const dLng = aRad(b.longitud - a.longitud);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aRad(a.latitud)) * Math.cos(aRad(b.latitud)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** La distancia por calles que se cobra: la recta por 1,3, a 2 decimales. */
export function distanciaEntregaKm(sucursal: Punto, pin: Punto): number {
  return aDosDecimales(haversineKm(sucursal, pin) * FACTOR_CALLES);
}

/** El redondeo del total: «hacia arriba al boliviano» (§3; 12 km son 22,50 y dan Bs 23). */
export function redondearAlBoliviano(monto: number): number {
  // Los 1e-9 evitan que un 13,000000000002 por coma flotante suba a 14.
  return Math.ceil(monto - 1e-9);
}

/** ¿Se entrega a esta distancia? Más de `maxKm` no (el backend rechaza con 400). */
export function dentroDeZona(distanciaKm: number, tarifa: TarifaEnvio = TARIFA_POR_DEFECTO): boolean {
  return distanciaKm <= tarifa.maxKm;
}

/**
 * El envío para una distancia, o null si queda fuera de la zona. Los tramos se
 * recorren en orden: el primero pone la base y los demás suman lo que cae en cada uno.
 */
export function calcularEnvio(distanciaKm: number, tarifa: TarifaEnvio = TARIFA_POR_DEFECTO): number | null {
  if (!Number.isFinite(distanciaKm) || distanciaKm < 0 || !dentroDeZona(distanciaKm, tarifa)) return null;
  let total = 0;
  let desde = 0;
  tarifa.tramos.forEach((t: TramoTarifa, i) => {
    const hasta = t.hastaKm ?? Infinity;
    if (i === 0) total += t.base ?? 0;
    else if (distanciaKm > desde) total += (Math.min(distanciaKm, hasta) - desde) * (t.porKm ?? 0);
    desde = hasta;
  });
  return redondearAlBoliviano(total);
}

/** Atajo: del pin y la sucursal al envío. */
export function envioDesde(sucursal: Punto, pin: Punto, tarifa: TarifaEnvio = TARIFA_POR_DEFECTO) {
  const distanciaKm = distanciaEntregaKm(sucursal, pin);
  return { distanciaKm, envio: calcularEnvio(distanciaKm, tarifa) };
}
