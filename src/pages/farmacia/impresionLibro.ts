import { fmtFecha } from "../../lib/format";
import type { AsientoControlado, LibroControlados } from "../../types";
import { NOMBRE_LIBRO } from "./receta";

/**
 * Lo que el libro impreso calcula antes de dibujarse: el título, el período y
 * el resumen por medicamento. Va aparte del componente para probarse sin DOM.
 */

/** "Libro de Psicotrópicos" o "Libro de Estupefacientes"; con los dos juntos, "Libro de controlados". */
export function tituloLibro(libro: "" | LibroControlados | null | undefined): string {
  return libro ? `Libro de ${NOMBRE_LIBRO[libro]}` : "Libro de controlados";
}

/** "del 01/09/2026 al 30/09/2026"; si es un solo día, "del día 01/09/2026". */
export function textoPeriodo(desde: string, hasta: string): string {
  if (desde === hasta) return `del día ${fmtFecha(desde)}`;
  return `del ${fmtFecha(desde)} al ${fmtFecha(hasta)}`;
}

/**
 * El medicamento como se asienta: el nombre y, si la concentración viene aparte
 * y el nombre no la dice ya, la concentración. "Clonazepam 2 mg" + "2 mg" no
 * se repite; "Clonazepam" + "2 mg" sale "Clonazepam 2 mg".
 */
export function medicamentoImpreso(p: AsientoControlado["producto"]): string {
  const concentracion = p.concentracion?.trim();
  if (!concentracion || p.nombre.toLowerCase().includes(concentracion.toLowerCase())) {
    return p.nombre;
  }
  return `${p.nombre} ${concentracion}`;
}

export interface ResumenMedicamento {
  medicamento: string;
  /** Asientos vigentes: los anulados no cuentan. */
  asientos: number;
  unidades: number;
}

/**
 * Total despachado por medicamento, en orden alfabético. Las ventas anuladas
 * no suman: el medicamento volvió al estante, y lo que el SEDES cruza con el
 * stock es lo que efectivamente salió. Un medicamento con todos sus asientos
 * anulados no aparece acá (en el detalle sí, marcado).
 *
 * Se agrupa por el nombre impreso y no por el id del artículo: el nombre se
 * copia al vender, y si el artículo se renombró a mitad de la gestión, el
 * resumen muestra los dos nombres tal como figuran en el detalle, en vez de
 * sumar bajo uno solo renglones que el lector no va a encontrar arriba.
 */
export function resumenPorMedicamento(filas: AsientoControlado[]): ResumenMedicamento[] {
  const porNombre = new Map<string, ResumenMedicamento>();
  for (const a of filas) {
    if (a.anuladaEn) continue;
    const medicamento = medicamentoImpreso(a.producto);
    const clave = medicamento.toLowerCase();
    const r = porNombre.get(clave) ?? { medicamento, asientos: 0, unidades: 0 };
    r.asientos += 1;
    r.unidades += a.cantidad;
    porNombre.set(clave, r);
  }
  return [...porNombre.values()].sort((x, y) => x.medicamento.localeCompare(y.medicamento, "es"));
}

/** Las unidades de todo el resumen, para el renglón de total. */
export function totalUnidades(resumen: ResumenMedicamento[]): number {
  return resumen.reduce((total, r) => total + r.unidades, 0);
}
