import { Icon } from "../../components/Icon";

/**
 * "No hay nada con «ibprofen». Mostrando «ibuprofeno»." (12-nov, pedido de
 * Kevin): la búsqueda de la farmacia prueba con lo más parecido cuando lo
 * tecleado no encuentra nada, y esto lo dice arriba de la lista.
 *
 * Ámbar y no gris: en una farmacia dos remedios pueden escribirse casi igual,
 * y quien atiende tiene que ver que la lista NO es de lo que escribió antes de
 * agregar algo. "Buscar lo que escribí" vuelve a lo tecleado (que no trae
 * nada), por si la corrección no era lo que buscaba.
 */
export function AvisoCorregido({
  tecleado,
  corregido,
  onUsar,
}: {
  tecleado: string;
  corregido: string;
  /** Pasa el texto corregido al buscador, para seguir desde ahí. */
  onUsar?: (texto: string) => void;
}) {
  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-warning-borde bg-warning-suave px-3.5 py-2.5 text-[13px] text-warning-text"
    >
      <Icon name="search" size={15} />
      <span>
        No hay nada con <strong>«{tecleado}»</strong>. Mostrando{" "}
        <strong>«{corregido}»</strong>.
      </span>
      {onUsar && (
        <button
          type="button"
          onClick={() => onUsar(corregido)}
          className="font-semibold underline underline-offset-2 hover:no-underline"
        >
          Buscar «{corregido}»
        </button>
      )}
    </div>
  );
}
