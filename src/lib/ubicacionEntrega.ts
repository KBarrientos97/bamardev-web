import { redondear, type Ubicacion } from "./mapa";

/**
 * Dónde se entrega un delivery (20-nov, AUDITORIA-REPARTIDOR-20NOV §2.2): el
 * pin que marcó el cliente en la página o el que cargó la caja.
 *
 * Contrato: `GET /ventas/mis-entregas` y `/ventas/pendientes` traen en la
 * venta `latitud`, `longitud` y `precisionM` (null sin pin). Un backend
 * anterior no los manda, pero un pedido de la página igual trae su pin en
 * `pedidoWeb`: se usa ése. Nunca se inventa un punto.
 */
export interface PinDeEntrega extends Ubicacion {
  /** Lo que dijo el GPS del cliente, en metros; null si lo tocó en el mapa o no se sabe. */
  precisionM: number | null;
}

interface ConUbicacion {
  latitud?: number | null;
  longitud?: number | null;
  precisionM?: number | null;
  pedidoWeb?: { latitud: number | null; longitud: number | null } | null;
}

const esCoordenada = (lat: unknown, lng: unknown): boolean =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180 &&
  // (0, 0) es el golfo de Guinea: un pin «vacío» que alguien guardó como ceros.
  !(lat === 0 && lng === 0);

export function pinDeEntrega(v: ConUbicacion): PinDeEntrega | null {
  if (esCoordenada(v.latitud, v.longitud)) {
    return { lat: v.latitud as number, lng: v.longitud as number, precisionM: v.precisionM ?? null };
  }
  const w = v.pedidoWeb;
  if (w && esCoordenada(w.latitud, w.longitud)) return { lat: w.latitud as number, lng: w.longitud as number, precisionM: null };
  return null;
}

/** Más que esto el pin se dice «impreciso»: con 100 m de radio son dos cuadras. */
export const PRECISION_DUDOSA_M = 100;

export function pinImpreciso(p: PinDeEntrega | null): boolean {
  return !!p && p.precisionM != null && p.precisionM > PRECISION_DUDOSA_M;
}

/** Sin pin: buscar la dirección escrita en Google Maps (no hay punto que dibujar). */
export function urlBuscarEnMaps(direccion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
}

/** Sin pin, en Waze: la búsqueda por dirección, que abre la navegación. */
export function urlWazeBuscar(direccion: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(direccion)}&navigate=yes`;
}

/**
 * El punto de un enlace de Google Maps, o de un «lat, lng» pegado tal cual
 * (20-nov): muchas cajeras reciben la ubicación por WhatsApp y así no tienen
 * que tocar un mapa. Entiende los enlaces largos de Maps (`@lat,lng`,
 * `!3dlat!4dlng`, `q=`/`query=`/`ll=`/`destination=`) y las coordenadas
 * sueltas. Los enlaces cortos (`maps.app.goo.gl/…`) no traen el punto: hay que
 * abrirlos, y eso no se puede desde acá; da null y la pantalla lo dice.
 */
export function coordsDeEnlace(texto: string): Ubicacion | null {
  const crudo = texto.trim().replace(/\+/g, " ");
  if (!crudo) return null;
  let t = crudo;
  try {
    t = decodeURIComponent(crudo);
  } catch {
    // Un «%» suelto en lo pegado: se lee tal cual.
  }
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const patrones = [
    // El lugar marcado (más exacto que el centro de la vista).
    new RegExp(String.raw`!3d${num}!4d${num}`),
    new RegExp(String.raw`[?&](?:q|query|ll|destination|daddr|center)=(?:loc:)?${num}\s*,\s*${num}`),
    new RegExp(String.raw`@${num},${num}`),
    // Las coordenadas solas: «-17.78, -63.18».
    new RegExp(String.raw`^${num}\s*,\s*${num}$`),
  ];
  for (const p of patrones) {
    const m = t.match(p);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (esCoordenada(lat, lng)) return redondear({ lat, lng });
  }
  return null;
}
