import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton } from "../../components/ui";
import { fmtMoney, fmtNum } from "../../lib/format";
import {
  INDICACIONES,
  cantidadPedido,
  setCantidadLinea,
  setNotaLinea,
  totalPedido,
  type LineaPedido,
} from "./pedido";

/**
 * Revisar el pedido antes de mandarlo a cocina: ajustar cantidades y anotar
 * las indicaciones.
 *
 * Va separado de la carta a propósito: cargar es rápido y se hace mientras el
 * cliente habla; revisar es lento y se hace una vez, al final. Mezclarlo
 * obligaría a un stepper por producto en la grilla y triplicaría los toques.
 */
export default function CarritoPedido({
  lineas,
  setLineas,
  enviando,
  onCerrar,
  onEnviar,
}: {
  lineas: LineaPedido[];
  setLineas: (f: (l: LineaPedido[]) => LineaPedido[]) => void;
  enviando: boolean;
  onCerrar: () => void;
  onEnviar: () => void;
}) {
  const total = totalPedido(lineas);
  const items = cantidadPedido(lineas);

  // Vaciar deja la hoja sin nada que mostrar: se cierra sola.
  useEffect(() => {
    if (lineas.length === 0) onCerrar();
  }, [lineas.length, onCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-borde-soft px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-texto">Revisar pedido</h2>
            <p className="text-xs text-texto-3">
              {items} {items === 1 ? "ítem" : "ítems"} · {fmtMoney(total)}
            </p>
          </div>
          <button
            onClick={() => setLineas(() => [])}
            className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-semibold text-[#DC2626] hover:bg-[#FEF2F2]"
          >
            Vaciar
          </button>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-2 text-texto-3 hover:bg-muted"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-fondo px-4 py-3">
          {lineas.map((l) => (
            <Linea
              key={l.id}
              linea={l}
              onCantidad={(c) => setLineas((ls) => setCantidadLinea(ls, l.id, c))}
              onNota={(n) => setLineas((ls) => setNotaLinea(ls, l.id, n))}
            />
          ))}
        </div>

        <div className="border-t border-borde bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xl font-bold text-texto">Total</span>
            <span className="text-2xl font-extrabold text-texto">{fmtMoney(total)}</span>
          </div>
          <Boton
            icono="check"
            onClick={onEnviar}
            disabled={enviando || lineas.length === 0}
            className="w-full py-3 text-base"
          >
            {enviando ? "Enviando…" : `Enviar a cocina · ${fmtMoney(total)}`}
          </Boton>
        </div>
      </div>
    </div>
  );
}

function Linea({
  linea,
  onCantidad,
  onNota,
}: {
  linea: LineaPedido;
  onCantidad: (c: number) => void;
  onNota: (n: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="mb-2 rounded-xl border border-borde bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-bold text-texto">{linea.nombre}</p>
          <p className="text-xs text-texto-3">
            {fmtMoney(linea.precio)} c/u · {fmtMoney(linea.precio * linea.cantidad)}
          </p>
        </div>

        <div className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-borde px-1">
          <button
            onClick={() => onCantidad(linea.cantidad - 1)}
            aria-label={linea.cantidad === 1 ? "Quitar del pedido" : "Uno menos"}
            className={`flex h-6 w-6 items-center justify-center rounded-full ${
              // En la última unidad el "−" se vuelve tacho: avisa que el
              // próximo toque saca el producto del pedido.
              linea.cantidad === 1
                ? "text-[#DC2626] hover:bg-[#FEF2F2]"
                : "text-texto-2 hover:bg-muted"
            }`}
          >
            <Icon name={linea.cantidad === 1 ? "trash" : "minus"} size={14} />
          </button>
          <span className="min-w-5 text-center text-sm font-bold text-texto">
            {fmtNum(linea.cantidad)}
          </span>
          <button
            onClick={() => onCantidad(linea.cantidad + 1)}
            aria-label="Uno más"
            className="flex h-6 w-6 items-center justify-center rounded-full text-primary-700 hover:bg-primary-50"
          >
            <Icon name="plus" size={14} />
          </button>
        </div>

        <span className="min-w-[60px] shrink-0 text-right text-sm font-bold text-texto">
          {fmtMoney(linea.precio * linea.cantidad)}
        </span>
      </div>

      <button
        onClick={() => setAbierto((v) => !v)}
        className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-primary-700"
      >
        <Icon name="edit" size={12} />
        Agregar indicación
      </button>

      {/* La indicación ya elegida se ve siempre, aunque el panel esté cerrado:
          es lo que hay que revisar antes de llevar el plato a la mesa. */}
      {linea.nota && (
        <p className="mt-1 text-xs font-semibold text-[#D97706]">{linea.nota}</p>
      )}

      {/* Las indicaciones rápidas se despliegan y no están siempre a la vista:
          son ocho por producto y, abiertas de entrada, un pedido de cinco
          platos no entraba en tres pantallas. */}
      {abierto && (
        <div className="mt-2">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {INDICACIONES.map((ind) => (
              <button
                key={ind}
                onClick={() => onNota(ind)}
                className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  linea.nota === ind
                    ? "border-[#D97706] bg-[#FFFBEB] text-[#D97706]"
                    : "border-borde bg-white text-texto-2 hover:bg-muted"
                }`}
              >
                {ind}
              </button>
            ))}
          </div>
          {/* No controlado: si se reescribiera en cada tecla, el cursor
              saltaría al final en cada letra. */}
          <input
            defaultValue={linea.nota ?? ""}
            onBlur={(e) => onNota(e.target.value.slice(0, 120))}
            placeholder="Otra indicación para cocina"
            className="mt-2 w-full rounded-lg border border-borde px-3 py-2 text-[13px] outline-none focus:border-primary"
          />
        </div>
      )}
    </div>
  );
}
