import { pinDeEntrega } from "../../lib/ubicacionEntrega";
import type { Venta } from "../../types";
import type { PuntoDeEntrega } from "./MapaEntregas";

/**
 * Las pendientes, separadas para el mapa del día: las que tienen pin, con su
 * número en el orden de la lista (el mismo que ve en «Por entregar»), y las
 * que no, que se listan aparte con su dirección.
 */
export function puntosDelDia(pendientes: Venta[]): { conPin: PuntoDeEntrega[]; sinPin: Venta[] } {
  const conPin: PuntoDeEntrega[] = [];
  const sinPin: Venta[] = [];
  pendientes.forEach((v, i) => {
    const pin = pinDeEntrega(v);
    if (pin) conPin.push({ id: v.id, numero: i + 1, lat: pin.lat, lng: pin.lng, etiqueta: v.clienteNombre ?? "Sin nombre" });
    else sinPin.push(v);
  });
  return { conPin, sinPin };
}
