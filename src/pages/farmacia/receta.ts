import type { LibroControlados, Producto, RecetaVenta } from "../../types";

/**
 * La receta de un controlado: qué se pide, qué falta y cómo se resume.
 *
 * Las reglas son las del servidor (`src/controlado/receta.ts`): la web avisa
 * antes para no mandar una venta que va a volver rechazada, pero quien manda
 * es el backend.
 */

export type CampoReceta = keyof RecetaVenta;

/** Qué le falta a cada campo, para marcarlo en el formulario. Vacío = alcanza. */
export function erroresReceta(
  p: Pick<Producto, "condicionVenta">,
  r: RecetaVenta,
  hoy: string,
): Partial<Record<CampoReceta, string>> {
  const e: Partial<Record<CampoReceta, string>> = {};
  if (r.pacienteNombre.trim().length < 3) e.pacienteNombre = "Nombre y apellido del paciente";
  if (r.medicoNombre.trim().length < 3) e.medicoNombre = "El nombre del médico";
  if (!r.medicoMatricula.trim()) e.medicoMatricula = "La matrícula que figura en la receta";
  if (p.condicionVenta === "RECETA_VALORADA" && !r.recetaNumero?.trim()) {
    e.recetaNumero = "La receta valorada es un formulario numerado";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.recetaFecha)) e.recetaFecha = "La fecha de la receta";
  else if (r.recetaFecha > hoy) e.recetaFecha = "No puede ser de un día que todavía no llegó";
  return e;
}

/** Sin espacios de más y sin campos opcionales vacíos: así viaja. */
export function recetaLimpia(r: RecetaVenta): RecetaVenta {
  const t = (s: string | undefined) => s?.trim().replace(/\s+/g, " ") ?? "";
  const documento = t(r.pacienteDocumento);
  const numero = t(r.recetaNumero);
  return {
    pacienteNombre: t(r.pacienteNombre),
    ...(documento ? { pacienteDocumento: documento } : {}),
    medicoNombre: t(r.medicoNombre),
    medicoMatricula: t(r.medicoMatricula),
    ...(numero ? { recetaNumero: numero } : {}),
    recetaFecha: r.recetaFecha,
  };
}

/** El renglón del carrito: "Receta N° V-981 · Juan Pérez". */
export function resumenReceta(r: RecetaVenta): string {
  return r.recetaNumero
    ? `Receta N° ${r.recetaNumero} · ${r.pacienteNombre}`
    : `Receta de ${r.pacienteNombre}`;
}

/** En qué libro se asienta, según la condición de venta. */
export function libroDe(p: Pick<Producto, "condicionVenta">): LibroControlados | null {
  if (p.condicionVenta === "RECETA_VALORADA") return "ESTUPEFACIENTES";
  if (p.condicionVenta === "RECETA_ARCHIVADA") return "PSICOTROPICOS";
  return null;
}

export const NOMBRE_LIBRO: Record<LibroControlados, string> = {
  PSICOTROPICOS: "Psicotrópicos",
  ESTUPEFACIENTES: "Estupefacientes",
};
