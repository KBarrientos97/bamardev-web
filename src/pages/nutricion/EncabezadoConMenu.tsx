import type { ReactNode } from "react";

/**
 * El encabezado de la ficha del paciente con «⋯» en el teléfono (26-nov-2026):
 * la hoja de seguimiento y la planilla de la evaluación. A 360 px los botones
 * y el «⋯» no entraban en un renglón y el «⋯» caía solo abajo (Kevin). Debajo
 * de `sm` el «⋯» sube a la derecha del nombre y los botones ocupan su renglón
 * de lado a lado. Desde `sm`, nada de esto aplica: todo como siempre.
 *
 * Para `EncabezadoPagina` (su `className`): el `<header>` es el marco del
 * «⋯», el nombre le deja lugar a la derecha (también en dos renglones) y la
 * caja de las acciones se disuelve (`contents`) para que el renglón de los
 * botones tome todo el ancho.
 */
export const ENCABEZADO_CON_MENU = "max-sm:relative max-sm:[&_h1]:pr-14 max-sm:[&>:last-child]:contents";

/** Para el `MenuMas`: arriba a la derecha, a la altura del renglón del nombre (debajo de «← Volver»), de 44 px. */
export const MENU_AL_LADO_DEL_NOMBRE = "max-sm:absolute max-sm:right-0 max-sm:top-6 max-sm:[&>button]:h-11 max-sm:[&>button]:w-11";

/**
 * Los botones del encabezado (sin el «⋯»). Con el «⋯» aparte, en el teléfono
 * van en su propio renglón de lado a lado (y si son muchos, en dos); desde
 * `sm`, sueltos como siempre. Sin «⋯», tal cual.
 */
export function RenglonDeAcciones({ conMenu, children }: { conMenu: boolean; children: ReactNode }) {
  return conMenu ? <div className="flex w-full flex-wrap gap-2 sm:contents">{children}</div> : <>{children}</>;
}
