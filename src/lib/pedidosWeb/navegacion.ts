/** Navegar con Waze hasta el pin del cliente (Google Maps está en `lib/mapa.ts`: `urlRuta`). */
export const urlWaze = (lat: number, lng: number) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
