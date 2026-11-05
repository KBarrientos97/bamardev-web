import type { ResultadoAcademiaApi } from "../api";
import { hoja } from "../contexto";

/** El Excel: los dos totales arriba, las categorías y el resultado. */
export function hojaResultado(d: ResultadoAcademiaApi) {
  const filas: { concepto: string; monto: number }[] = [
    { concepto: "Cobrado por clases", monto: d.ingresos },
    ...d.categorias.map((c) => ({ concepto: `Gasto · ${c.nombre}`, monto: -c.monto })),
    { concepto: "Resultado de la academia", monto: d.resultado },
  ];
  return hoja<(typeof filas)[number]>(
    "Resultado de la academia",
    [
      ["Concepto", (f) => f.concepto],
      ["Monto (Bs)", (f) => f.monto],
    ],
    filas,
  );
}
