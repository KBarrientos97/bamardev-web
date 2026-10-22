/**
 * Un PIN al azar para "Generar uno al azar" (Usuarios).
 *
 * El PIN que pone el administrador es LIBRE: 1234, una fecha o lo que quiera
 * cada negocio (21-oct, el dueño: "es decisión de cada cliente"). Se probó
 * rechazar los fáciles (18-oct, 887 de 10.000) y se sacó, en la web y en el
 * backend. `pinFacil` queda sólo para que el generado no sea uno de esos:
 * un "al azar" que sale 1111 parece un error.
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

/** Un PIN de 4 dígitos al azar, sin los de siempre (1111, 1234, una fecha…). */
export function pinAlAzar(azar: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0]): string {
  for (;;) {
    const pin = String(azar() % 10_000).padStart(4, "0");
    if (!pinFacil(pin)) return pin;
  }
}
