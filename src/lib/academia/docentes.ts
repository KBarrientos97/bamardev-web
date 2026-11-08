import type { CargoRol } from "../personal";
import { normalizar } from "../texto";

/**
 * Los permisos que hacen docente a un cargo, con alcance PROPIO (sólo sus
 * grupos): los del rol Docente de la plantilla de la academia. Copia de
 * `PERMISOS_DE_DOCENTE` del backend (`academia/grupos.service.ts`), que con el
 * mismo criterio arma la lista de docentes de «Abrir grupo». La Coordinación
 * los tiene GENERAL: administra, no dicta.
 */
export const PERMISOS_DE_DOCENTE = ["asistencia.registrar", "notas.registrar"];

/** ¿El cargo es de docente? Por sus permisos, no por cómo se llama. */
export function esCargoDocente(cargo: Pick<CargoRol, "permisos" | "esAdministrador">): boolean {
  return !cargo.esAdministrador && cargo.permisos.some((p) => PERMISOS_DE_DOCENTE.includes(p.codigo) && p.alcance === "PROPIO");
}

/**
 * El cargo con que se da de alta a un docente (alta rápida de «Abrir grupo» y
 * el cargo propuesto en Personal). Revisión del 08-nov: antes se buscaba por el
 * nombre «Docente» y un rol renombrado o creado como «Profesor» hacía fallar el
 * alta rápida. Ahora va por permisos (`esCargoDocente`); entre varios, el que
 * se llama como el docente del instituto (o «Docente»). Si ninguno tiene esos
 * permisos, queda el de antes: el que se llama así.
 */
export function cargoDeDocente<C extends Pick<CargoRol, "nombre" | "permisos" | "esAdministrador">>(
  cargos: C[],
  palabraDocente: string,
): C | undefined {
  const nombres = [normalizar(palabraDocente), "docente"];
  const porNombre = (c: C) => nombres.includes(normalizar(c.nombre));
  const docentes = cargos.filter(esCargoDocente);
  return docentes.find(porNombre) ?? docentes[0] ?? cargos.find(porNombre);
}
