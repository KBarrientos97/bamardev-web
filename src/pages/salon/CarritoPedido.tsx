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
import { CabeceraHoja, Hoja } from "./HojaMesa";
import { vibrarToque } from "./toque";

/**
 * Revisar el pedido antes de mandarlo a cocina: ajustar cantidades y anotar
 * las indicaciones.
 *
 * Va separado de la carta a propósito: cargar es rápido y se hace mientras el
 * cliente habla; revisar es lento y se hace una vez, al final. Mezclarlo
 * obligaría a un stepper por producto en la grilla y triplicaría los toques.
 *
 * Es la misma hoja que la de la mesa (`Hoja`): se baja con el dedo desde la
 * cabecera.
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
  const [vaciando, setVaciando] = useState(false);

  // Vaciar deja la hoja sin nada que mostrar: se cierra sola.
  useEffect(() => {
    if (lineas.length === 0) onCerrar();
  }, [lineas.length, onCerrar]);

  return (
    <Hoja etiqueta="Revisar pedido" onCerrar={onCerrar}>
      <CabeceraHoja
        titulo="Revisar pedido"
        subtitulo={`${items} ${items === 1 ? "ítem" : "ítems"} · ${fmtMoney(total)}`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto bg-fondo px-4 py-3">
        {lineas.map((l) => (
          <Linea
            key={l.id}
            linea={l}
            onCantidad={(c) => setLineas((ls) => setCantidadLinea(ls, l.id, c))}
            onNota={(n) => setLineas((ls) => setNotaLinea(ls, l.id, n))}
          />
        ))}

        {/* "Vaciar" iba arriba, flotando al lado del título y a un dedo de la
            cruz: un toque impreciso borraba los platos que el cliente acababa
            de cantar. Va al final de la lista, y se confirma acá mismo, sin
            abrir otro diálogo encima de la hoja (pedido del dueño, 10-nov). */}
        {vaciando ? (
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-danger-borde bg-danger-suave px-3 py-2.5">
            <span className="flex-1 text-[13px] font-semibold text-danger-text">
              ¿Quitar los {fmtNum(items)} {items === 1 ? "ítem" : "ítems"}?
            </span>
            <button
              onClick={() => setVaciando(false)}
              className="min-h-10 rounded-lg px-3 text-[13px] font-semibold text-texto-2 hover:bg-white"
            >
              No
            </button>
            <button
              onClick={() => {
                setVaciando(false);
                setLineas(() => []);
              }}
              className="min-h-10 rounded-lg bg-danger-text px-3 text-[13px] font-bold text-white"
            >
              Sí, vaciar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setVaciando(true)}
            className="mt-1 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-danger-text hover:bg-danger-suave"
          >
            <Icon name="trash" size={14} />
            Vaciar el pedido
          </button>
        )}
      </div>

      <div className="shrink-0 border-t border-borde bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
    </Hoja>
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
          {/* Sólo el unitario: el total de la línea ya va a la derecha, y
              repetido acá decía lo mismo dos veces (pedido del dueño, 10-nov). */}
          <p className="text-xs text-texto-3">{fmtMoney(linea.precio)} c/u</p>
        </div>

        {/* h-11 y botones de 36px: el mesero maneja esto con el celular en
            una mano y en movimiento. A 24px, errar el "−" dos veces borraba el
            producto, porque en la última unidad se vuelve tacho. */}
        <div className="flex h-11 shrink-0 items-center gap-1 rounded-full border border-borde px-1">
          <button
            onClick={() => {
              vibrarToque();
              onCantidad(linea.cantidad - 1);
            }}
            aria-label={linea.cantidad === 1 ? "Quitar del pedido" : "Uno menos"}
            // Se achica y se pinta al apretar: en el celular no hay hover, y
            // sin esto el botón no respondía nada al dedo (pedido del dueño).
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform duration-75 active:scale-90 ${
              // En la última unidad el "−" se vuelve tacho: avisa que el
              // próximo toque saca el producto del pedido.
              linea.cantidad === 1
                ? "text-danger-text hover:bg-danger-suave active:bg-danger-bg"
                : "text-texto-2 hover:bg-muted active:bg-borde"
            }`}
          >
            <Icon name={linea.cantidad === 1 ? "trash" : "minus"} size={14} />
          </button>
          <span className="min-w-5 text-center text-sm font-bold text-texto">
            {fmtNum(linea.cantidad)}
          </span>
          <button
            onClick={() => {
              vibrarToque();
              onCantidad(linea.cantidad + 1);
            }}
            aria-label="Uno más"
            className="flex h-9 w-9 items-center justify-center rounded-full text-primary-700 transition-transform duration-75 hover:bg-primary-50 active:scale-90 active:bg-primary-100"
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
        <p className="mt-1 text-xs font-semibold text-warning-text">{linea.nota}</p>
      )}

      {/* Las indicaciones rápidas se despliegan y no están siempre a la vista:
          son ocho por producto y, abiertas de entrada, un pedido de cinco
          platos no entraba en tres pantallas. */}
      {abierto && (
        <div className="mt-2">
          <div className="sin-barra -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {INDICACIONES.map((ind) => (
              <button
                key={ind}
                onClick={() => onNota(ind)}
                className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  linea.nota === ind
                    ? "border-primary bg-primary-50 text-primary-700"
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
