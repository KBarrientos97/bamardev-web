import type { TarifaEnvio, TramoTarifa } from "./tipos";

/**
 * La tarifa de envío como la edita el dueño: filas de texto (un tramo por fila)
 * que se validan y pasan a la tarifa del contrato (CONTRATO-PEDIDOS-WEB §3 y §5:
 * tramos crecientes, montos >= 0 y `maxKm` entre 1 y 50).
 */

export interface Fila {
  /** Hasta qué km llega el tramo; vacío en el último («en adelante»). */
  hasta: string;
  /** El precio fijo (primer tramo) o el precio por km (los demás). */
  valor: string;
}

const aNumero = (t: string) => Number(t.trim().replace(",", "."));

export function filasDe(t: TarifaEnvio): Fila[] {
  return t.tramos.map((x, i) => ({
    hasta: x.hastaKm == null ? "" : String(x.hastaKm),
    valor: String(i === 0 ? (x.base ?? 0) : (x.porKm ?? 0)),
  }));
}

/** La tarifa que quedaría con lo escrito, o el motivo por el que no vale. */
export function tarifaDeFilas(filas: Fila[], maxKm: string): { tarifa: TarifaEnvio } | { error: string } {
  // Un solo tramo es un precio fijo para toda la zona: el backend lo acepta (PW-18).
  if (filas.length < 1) return { error: "Hace falta al menos un tramo." };
  const tramos: TramoTarifa[] = [];
  let anterior = 0;
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const ultimo = i === filas.length - 1;
    const valor = aNumero(f.valor);
    if (!Number.isFinite(valor) || valor < 0 || f.valor.trim() === "") return { error: `Escribí el precio del tramo ${i + 1}.` };
    let hasta: number | null = null;
    if (!ultimo) {
      hasta = aNumero(f.hasta);
      if (!Number.isFinite(hasta) || f.hasta.trim() === "") return { error: `Escribí hasta qué km llega el tramo ${i + 1}.` };
      if (hasta <= anterior) return { error: "Los tramos tienen que ir creciendo: cada uno llega más lejos que el anterior." };
      anterior = hasta;
    }
    tramos.push({ hastaKm: hasta, ...(i === 0 ? { base: valor } : { porKm: valor }) });
  }
  const max = aNumero(maxKm);
  if (!Number.isFinite(max) || maxKm.trim() === "" || max < 1 || max > 50) return { error: "La distancia máxima va entre 1 y 50 km." };
  return { tarifa: { tramos, maxKm: max } };
}
