/**
 * Las reglas de la venta a crédito que no son pantalla: para cuándo se
 * compromete el cliente y a quién le va a cargar la deuda el backend.
 *
 * Viven aparte de `PantallaCredito` para poder probar los bordes (el último día
 * del mes, la tarde, un nombre con tildes) sin montar la pantalla entera.
 */
import type { ClienteCredito } from "../../types";

/** Los plazos de un toque, más "Fin de mes" y una fecha del calendario. */
export type Plazo = 7 | 15 | 30 | "FIN_DE_MES" | "OTRA";

/**
 * El tope del calendario. El backend rechaza un compromiso a más de 365 días
 * (`MAX_DIAS_CREDITO`) y lo mide desde AHORA hasta las 23:59:59 del día
 * pactado: el día 365 siempre lo pasa por unas horas, el 364 nunca.
 */
export const PLAZO_MAXIMO_DIAS = 364;

/** El día calendario `n` días después de `desde`, a la medianoche local. */
export function sumarDias(desde: Date, n: number): Date {
  return new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + n);
}

/**
 * El último día del mes en curso; si hoy ya es ese día, el del mes siguiente
 * (el backend exige un plazo futuro y "fin de mes" no puede ser hoy mismo).
 *
 * BUG-cobro-1: antes se contaban los milisegundos que faltaban hasta la
 * medianoche del último día y se REDONDEABAN a días. El 28-oct a las 15:00
 * faltaban 2,375 días, daba 2 y el compromiso quedaba el 30-oct: la cuenta
 * vencía y salía en rojo un día antes de lo pactado. El turno de la pollería es
 * de 12:00 a la madrugada, así que casi siempre caía en el caso malo. Y el
 * anteúltimo día de tarde redondeaba a 0 y saltaba al mes siguiente (29-nov en
 * vez del 31-oct). Se cuenta en días del calendario, como Android
 * (`getActualMaximum`), y la hora deja de importar.
 */
export function finDeMes(hoy: Date): Date {
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  if (fin.getDate() !== hoy.getDate()) return fin;
  return new Date(hoy.getFullYear(), hoy.getMonth() + 2, 0);
}

/**
 * Un "aaaa-mm-dd" (lo que deja un `<input type="date">`) como día local, o
 * null si no es una fecha. Sin pasar por `new Date(texto)`: eso lo lee como
 * medianoche UTC, que en Bolivia es el día anterior a las 20:00.
 */
export function diaLocal(texto: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const d = new Date(anio, mes, dia);
  // "2026-02-30" no existe: el constructor lo corre al 2 de marzo sin avisar.
  return d.getFullYear() === anio && d.getMonth() === mes && d.getDate() === dia ? d : null;
}

/**
 * El día en que se compromete a pagar, o null si eligió "Otra fecha" y todavía
 * no hay una válida en el calendario.
 */
export function fechaDelPlazo(plazo: Plazo, hoy: Date, otraFecha: string): Date | null {
  if (plazo === "FIN_DE_MES") return finDeMes(hoy);
  if (plazo === "OTRA") return diaLocal(otraFecha);
  return sumarDias(hoy, plazo);
}

/**
 * Por qué no se puede fiar con esa fecha, o null si está bien.
 *
 * Desde mañana, como el calendario de Android: una cuenta que vence hoy (o que
 * nace vencida) sale en rojo el mismo día que se fió.
 */
export function problemaDeLaFecha(fecha: Date | null, hoy: Date): string | null {
  if (!fecha) return "Elegí en el calendario el día en que va a pagar.";
  if (fecha.getTime() < sumarDias(hoy, 1).getTime())
    return "La fecha de pago tiene que ser desde mañana.";
  if (fecha.getTime() > sumarDias(hoy, PLAZO_MAXIMO_DIAS).getTime())
    return "El plazo para pagar no puede pasar de un año.";
  return null;
}

/**
 * El nombre como lo compara el backend (`claveCliente` en credito.util.ts):
 * sin tildes, sin mayúsculas y con los espacios colapsados.
 *
 * No es `normalizar` de `lib/texto`: ésa conserva la ñ porque sirve para
 * buscar, y el backend no la conserva ("Doña Elena" y "Dona Elena" son para él
 * la misma ficha). Lo que importa acá es adivinar a quién le va a cargar la
 * deuda el backend, así que se compara igual que él (y que Android).
 */
export function claveCliente(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * El cliente que ya fió antes y al que apunta un nombre tecleado a mano, o
 * null si es alguien nuevo.
 *
 * CRE-4: la web miraba sólo al cliente elegido del desplegable. Si la cajera
 * dejaba "Cliente nuevo" y escribía "rosa", no avisaba la deuda ni el límite y
 * mandaba el fiado sin firma; el backend la reconocía por el nombre y lo
 * frenaba con un 403 que la pantalla no sabía resolver.
 */
export function clientePorNombre(
  clientes: ClienteCredito[],
  nombre: string,
): ClienteCredito | null {
  const clave = claveCliente(nombre);
  if (!clave) return null;
  return clientes.find((c) => claveCliente(c.nombre) === clave) ?? null;
}

/**
 * El adelanto como porcentaje del total, para el campo "%": entero si es
 * redondo ("50") y con un decimal si no ("33,3"). Vacío sin adelanto, como el
 * campo en Bs.
 */
export function textoPorcentaje(adelanto: number, total: number): string {
  if (!(total > 0) || !(adelanto > 0)) return "";
  const pct = Math.round((adelanto / total) * 1000) / 10;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1).replace(".", ",");
}

/** Lo que vale el "%" tecleado (acepta "33,3" y "33.3"), entre 0 y 100. */
export function leerPorcentaje(texto: string): number {
  const n = Number(texto.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, n);
}
