import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { Badge, Boton, Input, Modal, Vacio } from "../../components/ui";
import { fmtMoney, fmtNum } from "../../lib/format";
import { useAuth } from "../../store/AuthContext";
import type { Categoria, Consumo, Producto } from "../../types";
import type { Carrito, LineaCarrito } from "./useCarrito";

const TODAS = "__todas__";

export default function PantallaVenta({
  productos,
  categorias,
  carrito,
  onCobrar,
  cabecera,
}: {
  productos: Producto[];
  categorias: Categoria[];
  carrito: Carrito;
  onCobrar: () => void;
  cabecera?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>(TODAS);
  // En móvil el carrito es una hoja que se abre; en escritorio es una columna
  // siempre visible, así que este estado sólo pesa abajo de lg.
  const [carritoAbierto, setCarritoAbierto] = useState(false);

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return productos.filter((p) => {
      if (!p.habilitado) return false;
      if (cat !== TODAS && String(p.categoria?.id ?? "") !== cat) return false;
      if (!texto) return true;
      return (
        p.nombre.toLowerCase().includes(texto) ||
        (p.codBarra ?? "").toLowerCase().includes(texto) ||
        (p.categoria?.nombre ?? "").toLowerCase().includes(texto)
      );
    });
  }, [productos, q, cat, ]);

  const panelCarrito = (
    <PanelCarrito
      carrito={carrito}
      onCobrar={() => {
        setCarritoAbierto(false);
        onCobrar();
      }}
      onCerrar={() => setCarritoAbierto(false)}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Columna del catálogo */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {cabecera}

        <div className="space-y-3 border-b border-borde bg-white px-4 py-3">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-4">
              <Icon name="search" size={18} />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar producto o código"
              className="w-full rounded-xl border border-borde bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-0.5">
            <ChipCat activo={cat === TODAS} onClick={() => setCat(TODAS)}>
              Todos
            </ChipCat>
            {categorias.map((c) => (
              <ChipCat
                key={c.id}
                activo={cat === String(c.id)}
                onClick={() => setCat(String(c.id))}
              >
                {c.nombre}
              </ChipCat>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 lg:pb-4">
          {filtrados.length === 0 ? (
            <Vacio
              icono="search"
              titulo="Sin productos"
              texto={q ? "Probá con otro texto." : "No hay productos en esta categoría."}
            />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filtrados.map((p) => (
                <TarjetaVenta key={p.id} producto={p} onAgregar={() => carrito.agregar(p)} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Carrito: columna fija desde lg, igual que la app en tablet horizontal */}
      <aside className="hidden w-[380px] shrink-0 border-l border-borde bg-white lg:flex lg:flex-col xl:w-[420px]">
        {panelCarrito}
      </aside>

      {/* Móvil y tablet vertical: botón flotante + hoja inferior */}
      {carrito.lineas.length > 0 && (
        <button
          onClick={() => setCarritoAbierto(true)}
          className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-3.5 text-white shadow-xl shadow-primary/30 lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <Icon name="cart" size={19} />
            {carrito.unidades} {carrito.unidades === 1 ? "ítem" : "ítems"}
          </span>
          <span className="text-base font-extrabold">{fmtMoney(carrito.total)}</span>
        </button>
      )}

      {carritoAbierto && (
        <div className="fixed inset-0 z-40 flex items-end lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setCarritoAbierto(false)}
          />
          <div className="relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl">
            {panelCarrito}
          </div>
        </div>
      )}
    </div>
  );
}

function ChipCat({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
        activo
          ? "bg-primary text-white"
          : "border border-borde bg-white text-texto-2 hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function TarjetaVenta({
  producto: p,
  onAgregar,
}: {
  producto: Producto;
  onAgregar: () => void;
}) {
  // Sólo los almacenables se quedan sin stock; un elaborado se prepara al
  // momento y un combo descuenta sus ingredientes.
  const controlaStock = p.tipoProducto === "ALMACENABLE";
  const agotado = controlaStock && p.stockTotal <= 0;

  return (
    <li>
      <button
        onClick={onAgregar}
        disabled={agotado}
        className="card flex h-full w-full flex-col p-3 text-left transition-shadow enabled:hover:shadow-md disabled:opacity-50"
      >
        <div className="flex items-start justify-between gap-1.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
            <Icon name={p.tipoProducto === "COMPUESTO" ? "package" : "archive"} size={19} />
          </span>
          {agotado && <Badge tono="rojo">Agotado</Badge>}
          {!agotado && controlaStock && p.stockTotal <= p.stockMinimo && (
            <Badge tono="amarillo">{fmtNum(p.stockTotal)}</Badge>
          )}
        </div>
        <h3 className="mt-2 line-clamp-2 text-[13px] font-bold leading-snug text-texto">
          {p.nombre}
        </h3>
        <p className="mt-auto pt-2 text-[15px] font-extrabold text-primary-700">
          {fmtMoney(p.precio)}
        </p>
      </button>
    </li>
  );
}

function PanelCarrito({
  carrito,
  onCobrar,
  onCerrar,
}: {
  carrito: Carrito;
  onCobrar: () => void;
  onCerrar: () => void;
}) {
  const { incluye } = useAuth();
  // Sin la capacidad la comanda no distingue destino: todo sale para llevar,
  // que es el valor por defecto con el que nacen las líneas.
  const conMesaLlevar = incluye("mesa_llevar");
  const vacio = carrito.lineas.length === 0;

  return (
    <>
      <div className="flex items-center justify-between border-b border-borde-soft px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="cart" size={19} />
          <h2 className="text-[15px] font-bold text-texto">
            Venta
            {!vacio && (
              <span className="ml-1.5 font-normal text-texto-3">
                · {carrito.unidades} {carrito.unidades === 1 ? "ítem" : "ítems"}
              </span>
            )}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {!vacio && (
            <button
              onClick={carrito.vaciar}
              title="Vaciar la venta"
              className="rounded-lg p-1.5 text-texto-3 hover:bg-danger-bg hover:text-danger-text"
            >
              <Icon name="trash" size={17} />
            </button>
          )}
          <button
            onClick={onCerrar}
            aria-label="Cerrar carrito"
            className="rounded-lg p-1.5 text-texto-3 hover:bg-muted lg:hidden"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>

      {vacio ? (
        <div className="flex-1">
          <Vacio
            icono="cart"
            titulo="Carrito vacío"
            texto="Tocá un producto para agregarlo a la venta."
          />
        </div>
      ) : (
        <>
          {/* Atajo para marcar toda la comanda de una: lo más común es que
              todo el pedido sea para el mismo destino. */}
          {conMesaLlevar && (
            <div className="flex gap-2 border-b border-borde-soft px-4 py-2.5">
              <BotonConsumoTodo carrito={carrito} consumo="MESA" />
              <BotonConsumoTodo carrito={carrito} consumo="LLEVAR" />
            </div>
          )}

          <ul className="min-h-0 flex-1 divide-y divide-borde-soft overflow-y-auto">
            {carrito.lineas.map((l) => (
              <FilaCarrito
                key={l.producto.id}
                linea={l}
                carrito={carrito}
                conMesaLlevar={conMesaLlevar}
              />
            ))}
          </ul>

          <div className="border-t border-borde-soft px-4 py-3">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between text-texto-2">
                <dt>
                  {carrito.unidades} {carrito.unidades === 1 ? "unidad" : "unidades"}
                </dt>
                <dd>{fmtMoney(carrito.subtotal)}</dd>
              </div>
              <div className="flex justify-between border-t border-borde-soft pt-1.5 text-base font-extrabold text-texto">
                <dt>Total</dt>
                <dd>{fmtMoney(carrito.total)}</dd>
              </div>
            </dl>

            <Boton onClick={onCobrar} className="mt-3 w-full">
              Cobrar {fmtMoney(carrito.total)}
            </Boton>
          </div>
        </>
      )}
    </>
  );
}

function BotonConsumoTodo({ carrito, consumo }: { carrito: Carrito; consumo: Consumo }) {
  // Se marca activo sólo si TODAS las líneas están de ese lado: con un split
  // parcial ninguno de los dos representa la comanda.
  const activo = carrito.lineas.every((l) =>
    consumo === "MESA" ? l.enMesa === l.cantidad : l.enMesa === 0,
  );
  return (
    <button
      onClick={() => carrito.setConsumoTodo(consumo)}
      className={`flex-1 rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors ${
        activo
          ? "bg-primary text-white"
          : "border border-borde bg-white text-texto-2 hover:bg-muted"
      }`}
    >
      Todo {consumo === "MESA" ? "en mesa" : "para llevar"}
    </button>
  );
}

function FilaCarrito({
  linea: l,
  carrito,
  conMesaLlevar,
}: {
  linea: LineaCarrito;
  carrito: Carrito;
  conMesaLlevar: boolean;
}) {
  const [editandoNota, setEditandoNota] = useState(false);
  const [nota, setNota] = useState(l.nota);
  const [splitAbierto, setSplitAbierto] = useState(false);

  const partida = l.enMesa > 0 && l.enMesa < l.cantidad;
  const todaMesa = l.enMesa === l.cantidad;

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-texto">{l.producto.nombre}</p>
          <p className="text-xs text-texto-3">{fmtMoney(l.producto.precio)} c/u</p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-borde">
          <button
            onClick={() => carrito.setCantidad(l.producto.id, l.cantidad - 1)}
            aria-label="Quitar una unidad"
            className="p-2.5 text-texto-2 hover:bg-muted"
          >
            <Icon name={l.cantidad === 1 ? "trash" : "minus"} size={16} />
          </button>
          <span className="min-w-6 text-center text-[13px] font-bold">{l.cantidad}</span>
          <button
            onClick={() => carrito.setCantidad(l.producto.id, l.cantidad + 1)}
            aria-label="Agregar una unidad"
            className="p-2.5 text-texto-2 hover:bg-muted"
          >
            <Icon name="plus" size={16} />
          </button>
        </div>

        <span className="min-w-20 shrink-0 text-right text-[13px] font-bold text-texto">
          {fmtMoney(l.producto.precio * l.cantidad)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* Con una sola unidad no hay nada que partir: alcanza el toggle. */}
        {conMesaLlevar &&
          (l.cantidad === 1 ? (
            <button
              onClick={() => carrito.setConsumo(l.producto.id, todaMesa ? "LLEVAR" : "MESA")}
              className={`rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${
                todaMesa ? "bg-info-bg text-info-text" : "bg-slate-100 text-texto-3"
              }`}
            >
              {todaMesa ? "Mesa" : "Llevar"}
            </button>
          ) : (
            <button
              onClick={() => setSplitAbierto(true)}
              className={`rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${
                partida
                  ? "bg-warning-bg text-warning-text"
                  : todaMesa
                    ? "bg-info-bg text-info-text"
                    : "bg-slate-100 text-texto-3"
              }`}
            >
              {partida
                ? `${l.enMesa} mesa · ${l.cantidad - l.enMesa} llevar`
                : todaMesa
                  ? "Mesa"
                  : "Llevar"}
            </button>
          ))}

        {!editandoNota &&
          (l.nota ? (
            <button
              onClick={() => setEditandoNota(true)}
              className="flex items-center gap-1 rounded-lg bg-warning-bg px-2 py-1 text-[11px] font-semibold text-warning-text"
            >
              <Icon name="alert" size={11} /> {l.nota}
            </button>
          ) : (
            <button
              onClick={() => setEditandoNota(true)}
              className="flex items-center gap-1 rounded-lg border border-dashed border-borde px-2 py-1 text-[11px] text-texto-4 hover:border-primary hover:text-primary"
            >
              <Icon name="plus" size={11} /> Nota
            </button>
          ))}
      </div>

      {editandoNota && (
        <div className="mt-2 flex gap-1.5">
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej. sin cebolla"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                carrito.setNota(l.producto.id, nota.trim());
                setEditandoNota(false);
              }
            }}
            className="py-1.5 text-[13px]"
          />
          <Boton
            variante="soft"
            onClick={() => {
              carrito.setNota(l.producto.id, nota.trim());
              setEditandoNota(false);
            }}
            className="shrink-0 px-3 py-1.5"
          >
            <Icon name="check" size={15} />
          </Boton>
        </div>
      )}

      {/* Montado sólo mientras está abierto: su useState toma `l.enMesa` en
          el primer render, así que dejarlo montado le congelaba el valor y
          al reabrirlo mostraba una repartición vieja que al aplicar pisaba
          la marca recién puesta. */}
      {splitAbierto && conMesaLlevar && (
      <ModalSplit
        linea={l}
        onClose={() => setSplitAbierto(false)}
        onAplicar={(enMesa) => {
          carrito.setEnMesa(l.producto.id, enMesa);
          setSplitAbierto(false);
        }}
      />
      )}
    </li>
  );
}

function ModalSplit({
  linea: l,
  onClose,
  onAplicar,
}: {
  linea: LineaCarrito;
  onClose: () => void;
  onAplicar: (enMesa: number) => void;
}) {
  const [enMesa, setEnMesa] = useState(l.enMesa);

  return (
    <Modal
      abierto
      titulo="Mesa o para llevar"
      subtitulo={`${l.producto.nombre} · ${l.cantidad} unidades`}
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton onClick={() => onAplicar(enMesa)}>Aplicar</Boton>
        </>
      }
    >
      <p className="mb-4 text-[13px] text-texto-3">
        Elegí cuántas unidades se consumen en el local. El resto sale para llevar.
      </p>

      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setEnMesa(Math.max(0, enMesa - 1))}
          aria-label="Menos en mesa"
          className="rounded-xl border border-borde p-2.5 text-texto-2 hover:bg-muted"
        >
          <Icon name="minus" size={18} />
        </button>
        <div className="text-center">
          <p className="text-3xl font-extrabold text-texto">{enMesa}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-texto-4">
            en mesa
          </p>
        </div>
        <button
          onClick={() => setEnMesa(Math.min(l.cantidad, enMesa + 1))}
          aria-label="Más en mesa"
          className="rounded-xl border border-borde p-2.5 text-texto-2 hover:bg-muted"
        >
          <Icon name="plus" size={18} />
        </button>
      </div>

      <p className="mt-4 rounded-xl bg-muted px-3.5 py-2.5 text-center text-[13px] text-texto-2">
        <strong>{enMesa}</strong> en mesa · <strong>{l.cantidad - enMesa}</strong> para llevar
      </p>
    </Modal>
  );
}
