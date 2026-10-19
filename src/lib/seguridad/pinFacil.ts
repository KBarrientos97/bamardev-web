/**
 * Los PIN que no se dejan asignar (copia de src/seguridad/pin-facil.ts del
 * backend, con los mismos mensajes: si cambia allá, cambia acá). Son los
 * primeros que prueba quien quiere adivinar el PIN de un encargado: 887 de
 * 10.000 (repetidos, escaleras, líneas del teclado, pares, años y fechas).
 *
 * La web avisa antes de mandar; el backend igual lo rechaza (400 PIN_FACIL).
 */
export type MotivoPinFacil = "REPETIDO" | "ESCALERA" | "TECLADO" | "PARES" | "ANIO" | "FECHA";

const TECLADO = new Set([
  "2580", "0852", "1470", "0741", "3690", "0963", "1379", "9731",
  "1397", "7931", "3197", "7913", "2468", "8642", "1357", "7531",
  "1590", "0951", "3570", "0753", "1478", "8741", "3698", "8963",
  "1236", "6321", "7896", "9874",
]);

const DIAS_DEL_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const esFecha = (dia: number, mes: number) => mes >= 1 && mes <= 12 && dia >= 1 && dia <= DIAS_DEL_MES[mes - 1];

/** Por qué un PIN de 4 dígitos es fácil de adivinar, o null si no lo es. */
export function pinFacil(pin: string): MotivoPinFacil | null {
  if (!/^\d{4}$/.test(pin)) return null;
  const d = [...pin].map(Number);
  if (d.every((x) => x === d[0])) return "REPETIDO";
  const sube = d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10);
  const baja = d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10);
  if (sube || baja) return "ESCALERA";
  if (TECLADO.has(pin)) return "TECLADO";
  if ((d[0] === d[2] && d[1] === d[3]) || (d[0] === d[1] && d[2] === d[3])) return "PARES";
  const numero = Number(pin);
  if (numero >= 1940 && numero <= 2029) return "ANIO";
  const a = d[0] * 10 + d[1];
  const b = d[2] * 10 + d[3];
  if (esFecha(a, b) || esFecha(b, a)) return "FECHA";
  return null;
}

export const MENSAJE_PIN_FACIL: Record<MotivoPinFacil, string> = {
  REPETIDO: "Ese PIN repite el mismo número (como 0000): es de los primeros que alguien prueba. Elegí otro.",
  ESCALERA: "Ese PIN es una escalera (como 1234 o 4321): es de los primeros que alguien prueba. Elegí otro.",
  TECLADO: "Ese PIN es una línea del teclado (como 2580): es de los primeros que alguien prueba. Elegí otro.",
  PARES: "Ese PIN repite un par (como 1212 o 1122): es de los primeros que alguien prueba. Elegí otro.",
  ANIO: "Ese PIN parece un año: quien conoce a la persona lo prueba enseguida. Elegí otro.",
  FECHA: "Ese PIN parece una fecha (día y mes): quien sabe un cumpleaños lo prueba enseguida. Elegí otro.",
};

/**
 * Un PIN al azar que no sea fácil. Es lo único que frena a quien conoce al
 * encargado (su cumpleaños, su carnet, su teléfono): uno elegido por una
 * persona cae mucho antes (Markert et al., 2020).
 */
export function pinAlAzar(azar: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0]): string {
  for (;;) {
    const pin = String(azar() % 10_000).padStart(4, "0");
    if (!pinFacil(pin)) return pin;
  }
}
