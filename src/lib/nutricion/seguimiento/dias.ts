/**
 * El día de la semana en que viene el paciente (CONTRATO-nutricion-seguimiento-23nov
 * §11): 1 = lunes … 6 = sábado (el domingo no se atiende). Es opcional: null es
 * «sin día fijo» y un backend anterior no manda el campo (`undefined`); en los
 * dos casos no se dibuja nada. La doctora guarda el vial de cada paciente por
 * día: la pastilla «Viene los martes» le dice a qué caja ir a buscarlo.
 *
 * Los nombres y los plurales viven sólo acá (la app Android copia los mismos).
 */

export interface DiaDeLaSemana {
  dia: number;
  nombre: string;
  corto: string;
}

export const DIAS_SEMANA: readonly DiaDeLaSemana[] = [
  { dia: 1, nombre: "Lunes", corto: "Lun" },
  { dia: 2, nombre: "Martes", corto: "Mar" },
  { dia: 3, nombre: "Miércoles", corto: "Mié" },
  { dia: 4, nombre: "Jueves", corto: "Jue" },
  { dia: 5, nombre: "Viernes", corto: "Vie" },
  { dia: 6, nombre: "Sábado", corto: "Sáb" },
];

/** «Viene los …»: el plural, en minúscula (el sábado es el único que cambia). */
const PLURALES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

/** ¿Es un día de lunes a sábado (1 a 6)? null, `undefined`, 0, 7 o 2,5: no. */
export const esDiaSemana = (dia: unknown): dia is number => typeof dia === "number" && Number.isInteger(dia) && dia >= 1 && dia <= 6;

/** «Martes», o null si no es un día de 1 a 6. */
export function nombreDia(dia: number | null | undefined): string | null {
  return esDiaSemana(dia) ? DIAS_SEMANA[dia - 1].nombre : null;
}

/** «martes», «sábados»: el día como va en «Viene los …», o null. */
export function pluralDia(dia: number | null | undefined): string | null {
  return esDiaSemana(dia) ? PLURALES[dia - 1] : null;
}

/** «Viene los martes» («Viene los sábados»), o null sin día. */
export function vieneLos(dia: number | null | undefined): string | null {
  const plural = pluralDia(dia);
  return plural ? `Viene los ${plural}` : null;
}
