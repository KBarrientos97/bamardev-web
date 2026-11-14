import { dentroDeZona, calcularEnvio, distanciaEntregaKm, type Punto } from "./tarifa";
import type { SucursalPedido } from "./tipos";

/**
 * Qué sucursal atiende un pedido a domicilio (PLAN-PEDIDOS-WEB §5): la más
 * cercana al pin que tenga la caja abierta y lo deje dentro de su zona. El
 * cliente puede cambiarla, así que acá se devuelven TODAS evaluadas, ordenadas.
 */

export interface Evaluada {
  sucursal: SucursalPedido;
  /** Índice en la lista que mandó el backend (= el de `CatalogoPublico.sucursales`). */
  indice: number;
  distanciaKm: number | null;
  /** null si queda fuera de la zona o la sucursal no tiene coordenadas. */
  envio: number | null;
  /** Sin coordenadas la sucursal sólo admite recoger. */
  conCoordenadas: boolean;
  dentroDeZona: boolean;
  /** Abierta y dentro de la zona: se puede elegir para este pin. */
  atiende: boolean;
}

export function tieneCoordenadas(s: SucursalPedido): s is SucursalPedido & { latitud: number; longitud: number } {
  return s.latitud != null && s.longitud != null;
}

/** Todas las sucursales vistas desde el pin: primero las que atienden, de la más cerca a la más lejos. */
export function evaluarSucursales(pin: Punto | null, sucursales: SucursalPedido[]): Evaluada[] {
  const lista = sucursales.map((sucursal, indice): Evaluada => {
    if (!pin || !tieneCoordenadas(sucursal)) {
      return {
        sucursal,
        indice,
        distanciaKm: null,
        envio: null,
        conCoordenadas: tieneCoordenadas(sucursal),
        dentroDeZona: false,
        atiende: false,
      };
    }
    const distanciaKm = distanciaEntregaKm({ latitud: sucursal.latitud, longitud: sucursal.longitud }, pin);
    const dentro = dentroDeZona(distanciaKm, sucursal.tarifa);
    return {
      sucursal,
      indice,
      distanciaKm,
      envio: dentro ? calcularEnvio(distanciaKm, sucursal.tarifa) : null,
      conCoordenadas: true,
      dentroDeZona: dentro,
      atiende: sucursal.abierta && dentro,
    };
  });
  return lista.sort((a, b) => {
    if (a.atiende !== b.atiende) return a.atiende ? -1 : 1;
    if (a.distanciaKm == null || b.distanciaKm == null) return a.indice - b.indice;
    return a.distanciaKm - b.distanciaKm || a.indice - b.indice;
  });
}

/** La más cercana abierta y dentro de la zona, o null si ninguna llega. */
export function sucursalMasCercana(pin: Punto | null, sucursales: SucursalPedido[]): Evaluada | null {
  if (!pin) return null;
  return evaluarSucursales(pin, sucursales).find((e) => e.atiende) ?? null;
}

/**
 * Por qué ninguna sucursal atiende a ese pin, dicho en lenguaje del cliente
 * (o null si alguna atiende o todavía no hay pin).
 */
export function motivoSinCobertura(pin: Punto | null, sucursales: SucursalPedido[]): string | null {
  if (!pin) return null;
  const todas = evaluarSucursales(pin, sucursales);
  if (todas.some((e) => e.atiende)) return null;
  const conMapa = todas.filter((e) => e.conCoordenadas);
  if (conMapa.length === 0) return "Este local todavía no hace entregas a domicilio. Podés pasar a recoger tu pedido.";
  const alAlcance = conMapa.filter((e) => e.dentroDeZona);
  if (alAlcance.length === 0) return "Esa dirección queda fuera de la zona de entrega. Probá con otra o pasá a recoger.";
  return "Los locales que llegan a tu dirección están cerrados ahora. Probá más tarde o pasá a recoger.";
}
