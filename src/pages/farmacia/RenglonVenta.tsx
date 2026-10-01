import { useState } from "react";
import { Icon } from "../../components/Icon";
import { fmtNum } from "../../lib/format";
import type { LoteParaVender, RecetaVenta } from "../../types";
import { repartirLotes } from "./lotesVenta";
import { COLOR_TRAMO } from "./medicamento";
import { isoAMes } from "./mercaderia";
import { resumenReceta } from "./receta";

/**
 * De qué lote sale este renglón, como en la maqueta: "FEFO · AMX-2601 ·
 * vence 04/2028".
 *
 * Es lo que la venta va a descontar (el servidor reparte igual), así que quien
 * atiende saca del estante ESA caja. Si la cantidad pasa lo que queda en el
 * primer lote, dice cuánto sale de cada uno. Y si el primero está vencido lo
 * grita: FEFO lo elige primero porque sigue en el estante, y es justo la caja
 * que no hay que entregar.
 */
export function LoteEnLaVenta({
  lotes,
  cantidad,
}: {
  /** undefined = todavía no se sabe: no se dibuja nada. */
  lotes: LoteParaVender[] | undefined;
  cantidad: number;
}) {
  if (!lotes) return null;
  const { reparto, sinLote } = repartirLotes(lotes, cantidad);

  if (reparto.length === 0) {
    return <p className="mt-1.5 text-[11px] text-texto-4">FEFO · sin lote asignado</p>;
  }

  const varios = reparto.length > 1 || sinLote > 0;
  const vencido = reparto.find((r) => r.lote.tramo === "VENCIDO");

  return (
    <div className="mt-1.5 text-[11px] leading-snug">
      <ul>
        {reparto.map(({ lote, cantidad: sale }, i) => (
          <li
            key={lote.codigo}
            className={lote.tramo ? COLOR_TRAMO[lote.tramo].texto : "text-texto-3"}
          >
            <span className="font-semibold">{i === 0 ? "FEFO · " : "+ "}</span>
            {varios && `${fmtNum(sale)} del `}
            {lote.codigo} · {textoVence(lote)}
          </li>
        ))}
        {sinLote > 0 && (
          <li className="text-texto-4">+ {fmtNum(sinLote)} sin lote asignado</li>
        )}
      </ul>
      {vencido && (
        <p className="mt-1 flex items-start gap-1 rounded-md bg-danger-bg px-1.5 py-1 font-semibold text-danger-text">
          <span className="mt-px shrink-0">
            <Icon name="alert" size={11} />
          </span>
          El lote {vencido.lote.codigo} está vencido: no lo entregues y avisá para darlo
          de baja.
        </p>
      )}
    </div>
  );
}

/**
 * La receta de un renglón controlado: de quién es, o que falta.
 *
 * Falta cuando la venta volvió de un F5 sin ella o se cerró el formulario sin
 * guardar: el renglón lo dice en rojo y tocarlo la pide. Con receta, se lee de
 * quién es y se puede corregir antes de cobrar.
 */
export function RecetaEnLaVenta({
  receta,
  onEditar,
}: {
  receta: RecetaVenta | undefined;
  onEditar: () => void;
}) {
  if (!receta) {
    return (
      <button
        onClick={onEditar}
        className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-danger-bg px-2 py-1 text-[11px] font-bold text-danger-text hover:bg-danger-bg/70"
      >
        <Icon name="alert" size={11} /> Falta la receta: tocá para cargarla
      </button>
    );
  }
  return (
    <button
      onClick={onEditar}
      title="Corregir la receta"
      className="mt-1.5 inline-flex max-w-full items-center gap-1 text-left text-[11px] font-semibold text-texto-3 hover:text-primary-700"
    >
      <span className="shrink-0">
        <Icon name="fileText" size={11} />
      </span>
      <span className="truncate">{resumenReceta(receta)}</span>
      <span className="shrink-0 text-texto-4">
        <Icon name="edit" size={11} />
      </span>
    </button>
  );
}

function textoVence(l: LoteParaVender): string {
  if (!l.vencimiento) return "sin fecha";
  const mes = isoAMes(l.vencimiento);
  return l.tramo === "VENCIDO" ? `venció ${mes}` : `vence ${mes}`;
}

/**
 * La cantidad del renglón, que también se ESCRIBE.
 *
 * La farmacia vende todo por unidad: un blíster de 10 son 10 unidades y la
 * caja de 30 son 30. Llegar a 30 con el "+" es tocar treinta veces, así que el
 * número es un campo: se toca, se escribe y listo.
 *
 * Mientras se escribe, cada número válido ya cuenta (el total se ve al
 * instante). Borrarlo todo no saca el renglón —para eso está el tacho—: al
 * salir del campo vuelve a lo último que valía. El tope de stock lo pone
 * `fijar`, que es quien avisa.
 */
export function CantidadVenta({
  nombre,
  cantidad,
  fijar,
}: {
  nombre: string;
  cantidad: number;
  fijar: (cantidad: number) => void;
}) {
  // null = no se está escribiendo: se muestra la cantidad del carrito.
  const [texto, setTexto] = useState<string | null>(null);
  // Si se escribió más de lo que hay, el carrito quedó en lo que hay: se ve
  // eso al instante, no el 999 (el aviso dice por qué). Vacío o 0 se ven como
  // están mientras se escribe.
  const n = Number(texto);
  const mostrado = texto === null || (n >= 1 && n !== cantidad) ? String(cantidad) : texto;

  return (
    <div className="flex items-center rounded-lg border border-borde">
      <button
        onClick={() => fijar(cantidad - 1)}
        aria-label={cantidad === 1 ? "Quitar de la venta" : "Quitar una unidad"}
        className={`p-2.5 ${
          cantidad === 1
            ? "text-danger-text hover:bg-danger-bg"
            : "text-texto-2 hover:bg-muted"
        }`}
      >
        <Icon name={cantidad === 1 ? "trash" : "minus"} size={16} />
      </button>
      <input
        value={mostrado}
        inputMode="numeric"
        aria-label={`Cantidad de ${nombre}`}
        onFocus={(e) => {
          setTexto(String(cantidad));
          e.target.select();
        }}
        onChange={(e) => {
          const limpio = e.target.value.replace(/\D/g, "").slice(0, 5);
          setTexto(limpio);
          const n = Number(limpio);
          if (n >= 1) fijar(n);
        }}
        onBlur={() => setTexto(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-11 rounded-md bg-transparent py-1 text-center text-[13px] font-bold text-texto outline-none focus:bg-primary-50 focus:ring-2 focus:ring-primary-100"
      />
      <button
        onClick={() => fijar(cantidad + 1)}
        aria-label="Agregar una unidad"
        className="p-2.5 text-texto-2 hover:bg-muted"
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
