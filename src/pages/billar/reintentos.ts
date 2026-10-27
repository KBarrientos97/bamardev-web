import { aCentavos } from "../../lib/dinero";

/**
 * Qué identifica cada acción del billar que mueve plata o la cuenta, para la
 * clave de idempotencia (`clienteRequestId`) que viaja al backend.
 *
 * Con wifi malo el cajero toca "Confirmar", la respuesta no llega (o toca dos
 * veces) y vuelve a mandar: con la misma clave el servidor devuelve la mesa
 * como quedó en vez de cobrar el adelanto dos veces, sumar la extensión dos
 * veces o cargar los consumos dobles. La clave la lleva `useIntentoDeCobro`,
 * la misma del POS: se repite mientras la huella sea la misma y se estrena
 * cuando cambia.
 *
 * Por qué una huella y no una clave fija por diálogo: si el primer envío sí
 * entró y el cajero corrige lo que cobra (otro monto, otra forma de pago,
 * otras horas), con la misma clave el backend devolvía lo viejo como si fuera
 * lo nuevo y lo corregido no quedaba registrado. Lo recibido no entra: dar
 * otro billete por el mismo monto es el mismo cobro.
 */

/** Lo que se mira de un cobro de la pantalla (`PagoNuevo`). */
interface CobroHuella {
  metodo: string;
  monto: number;
  partes?: { efectivo: number; qr: number };
  /** No entra en la huella (ver arriba). */
  recibido?: number;
}

// En centavos: 10 y 10.000000001 son el mismo cobro.
const deCobro = (p: CobroHuella) => [
  p.metodo,
  aCentavos(p.monto),
  p.partes ? [aCentavos(p.partes.efectivo), aCentavos(p.partes.qr)] : null,
];

/** Un adelanto: la mesa en juego, cuánto y cómo. */
export function huellaAdelanto(sesionId: string, pago: CobroHuella): string {
  return JSON.stringify(["adelanto", sesionId, deCobro(pago)]);
}

/**
 * Una extensión: la mesa, cuántos minutos y si se cobra ahora (y cómo) o al
 * final. Pasar de "cobrar al final" a "cobrar ahora" es otra acción.
 */
export function huellaExtension(sesionId: string, minutos: number, pago?: CobroHuella): string {
  return JSON.stringify(["extender", sesionId, minutos, pago ? deCobro(pago) : "al final"]);
}

/**
 * Una carga de consumos: la mesa y qué se carga, sin importar el orden en que
 * se tocaron los productos. Lo que quedó en cero no cuenta (no viaja).
 */
export function huellaConsumos(sesionId: string, items: { productoId: number; cant: number }[]): string {
  const lineas = items
    .filter((i) => i.cant > 0)
    .map((i) => [i.productoId, i.cant])
    .sort((a, b) => a[0] - b[0]);
  return JSON.stringify(["consumos", sesionId, lineas]);
}
