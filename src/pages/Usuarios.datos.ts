import { tieneFeature } from "../lib/permisos";
import type { Feature } from "../types";

/**
 * Lo que autoriza el PIN en ESTE negocio, según su plan. Decía siempre
 * "anular ventas y fiar por encima del límite": a un billar sin fiado (el
 * dueño lo apaga para el rubro, 17-oct) le nombraba algo que no tiene y no le
 * decía lo que sí pide PIN en sus mesas.
 *
 * El billar no falla abierto como `tieneFeature`: sin la lista de features,
 * un restaurante leería que su PIN sirve para las mesas de billar.
 */
function usos(features: Feature[] | undefined) {
  return {
    fiado: tieneFeature(features, "fiado"),
    billar: !!features?.includes("billar"),
  };
}

/** "a", "a y b", "a, b y c". */
function enLista(partes: string[], ultimo: string): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} ${ultimo} ${partes[partes.length - 1]}`;
}

/** Para el formulario del PIN: "El PIN autoriza …". */
export function paraQueSirveElPin(features: Feature[] | undefined): string {
  const u = usos(features);
  return enLista(
    [
      "anular ventas",
      ...(u.fiado ? ["fiar por encima del límite del cliente"] : []),
      ...(u.billar ? ["lo que pide PIN en las mesas de billar (pausar, anular una mesa, corregir la hora o un pago)"] : []),
    ],
    "y",
  );
}

/** Para "Quitar PIN": "No va a poder autorizar …". */
export function queDejaDeAutorizar(features: Feature[] | undefined): string {
  const u = usos(features);
  return enLista(
    [
      "anulaciones",
      ...(u.fiado ? ["fiar por encima del límite"] : []),
      ...(u.billar ? ["lo que pide PIN en el billar"] : []),
    ],
    "ni",
  );
}
