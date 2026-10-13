import { useState, type ReactNode } from "react";
import { fmtNum } from "../../../lib/format";
import { Lista } from "../ui";

/**
 * Una lista de reporte que muestra los primeros y abre el resto con "Ver todos
 * (N)". Los rankings traen TODO lo del período (el top de productos no es un
 * top 20: son todos los vendidos, y los lentos de una farmacia pueden ser mil):
 * dibujarlos enteros de entrada deja lo importante, los primeros, perdido
 * arriba de una página interminable.
 */
export function ListaRecortada<T>({
  filas,
  tope = 20,
  clave,
  children,
}: {
  filas: T[];
  tope?: number;
  clave: (fila: T, i: number) => string;
  children: (fila: T, i: number) => ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);
  const visibles = abierta ? filas : filas.slice(0, tope);
  return (
    <Lista>
      {visibles.map((f, i) => (
        <div key={clave(f, i)}>{children(f, i)}</div>
      ))}
      {filas.length > tope && (
        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          aria-expanded={abierta}
          className="block w-full px-4 py-3 text-center text-[13px] font-bold text-primary-700 transition-colors hover:bg-muted"
        >
          {abierta ? "Mostrar menos" : `Ver todos (${fmtNum(filas.length)})`}
        </button>
      )}
    </Lista>
  );
}
