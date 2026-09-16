import { Badge } from "../../components/ui";
import { posicionDe } from "../../lib/texto";
import type { Producto } from "../../types";
import { CONDICION } from "./medicamento";

/** Los chips de un medicamento: receta y, si corresponde, controlado. */
export function ChipsCondicion({
  producto: p,
  largo = false,
}: {
  producto: Producto;
  largo?: boolean;
}) {
  const c = CONDICION[p.condicionVenta];
  if (!c && !p.controlado) return null;
  return (
    <>
      {c && <Badge tono={c.tono}>{largo ? c.largo : c.texto}</Badge>}
      {p.controlado && <Badge tono="rojo">Controlado</Badge>}
    </>
  );
}

/**
 * Marca la parte que coincide con lo tecleado. Resalta sobre el texto ORIGINAL
 * (ver `posicionDe`): buscar sobre el normalizado corre los índices y el
 * resaltado se desfasa en cuanto hay una tilde.
 */
export function Resaltado({ texto, q }: { texto: string; q: string }) {
  const rango = posicionDe(texto, q);
  if (!rango) return <>{texto}</>;
  const [desde, hasta] = rango;
  return (
    <>
      {texto.slice(0, desde)}
      <mark className="rounded bg-primary-100 px-0.5 text-texto">
        {texto.slice(desde, hasta)}
      </mark>
      {texto.slice(hasta)}
    </>
  );
}
