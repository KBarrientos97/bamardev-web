/**
 * El total del recibo en letras, como lo escribe una factura en Bolivia:
 * "Son: ciento veintitrés 50/100 bolivianos". Los centavos van en número
 * sobre cien, no en letras.
 */

const UNIDADES = [
  "cero",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiuno",
  "veintidós",
  "veintitrés",
  "veinticuatro",
  "veinticinco",
  "veintiséis",
  "veintisiete",
  "veintiocho",
  "veintinueve",
];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = [
  "",
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
];

/** 0 a 999. */
function hastaMil(n: number): string {
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 30) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d]);
    }
  }
  return partes.join(" ") || "cero";
}

/**
 * Un entero en letras, hasta los millones. Delante de "mil" o de un sustantivo
 * "uno" se apocopa ("un mil" no: "mil"; "veintiún mil"), como se lee.
 */
export function enteroEnLetras(n: number): string {
  const entero = Math.floor(Math.abs(n));
  if (entero === 0) return "cero";
  const millones = Math.floor(entero / 1_000_000);
  const miles = Math.floor((entero % 1_000_000) / 1000);
  const resto = entero % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? "un millón" : `${apocopar(hastaMil(millones))} millones`);
  if (miles) partes.push(miles === 1 ? "mil" : `${apocopar(hastaMil(miles))} mil`);
  if (resto) partes.push(hastaMil(resto));
  return partes.join(" ");
}

/** "veintiuno mil" → "veintiún mil"; "ciento uno mil" → "ciento un mil". */
function apocopar(s: string): string {
  return s.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un");
}

/** "Son: ciento veintitrés 00/100 bolivianos". */
export function totalEnLetras(monto: number, moneda = "bolivianos"): string {
  const centavos = Math.round(Math.abs(monto) * 100);
  const entero = Math.floor(centavos / 100);
  const cent = String(centavos % 100).padStart(2, "0");
  return `Son: ${enteroEnLetras(entero)} ${cent}/100 ${moneda}`;
}
