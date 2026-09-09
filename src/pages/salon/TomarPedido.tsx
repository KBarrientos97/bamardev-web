import { useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Cargando, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney, fmtNum } from "../../lib/format";
import { contiene } from "../../lib/texto";
import { useApi } from "../../lib/useApi";
import type { Mesa } from "../../types/salon";
import CarritoPedido from "./CarritoPedido";
import TarjetaCarta from "./TarjetaCarta";
import { etiquetaMesa } from "./logicaSalon";
import {
  agregar,
  aItemsDeComanda,
  cantidadDeProducto,
  cantidadPedido,
  quitarUno,
  totalPedido,
  type LineaPedido,
} from "./pedido";

/**
 * La carta, para armar el pedido de una mesa.
 *
 * Tocar un producto lo suma directo. Las cantidades y las indicaciones se
 * ajustan en el carrito: separar "cargar rápido" de "revisar con calma" es lo
 * que permite seguirle el ritmo a un cliente que canta cinco platos seguidos.
 *
 * La píldora del pedido flota abajo y sólo aparece cuando hay algo cargado:
 * hasta entonces roba alto de grilla para no decir nada.
 */
export default function TomarPedido({
  mesa,
  onAtras,
  onEnviado,
}: {
  mesa: Mesa;
  onAtras: () => void;
  onEnviado: (mensaje: string) => void;
}) {
  // La carta y no /productos: trae el stock que REALMENTE queda, ya descontado
  // lo que otras mesas tienen pedido y sin cobrar. La cajera cuenta el stock
  // físico de la heladera; el mesero necesita saber qué puede prometer.
  const carta = useApi(() => api.cartaSalon(), []);

  const [lineas, setLineas] = useState<LineaPedido[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const proximoId = useRef(1);

  const productos = carta.datos ?? [];

  const categorias = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const p of productos) {
      const n = p.categoria?.nombre;
      if (n && !vistas.has(n)) vistas.set(n, n);
    }
    return [...vistas.values()];
  }, [productos]);

  const visibles = useMemo(
    () =>
      productos.filter((p) => {
        if (categoria && p.categoria?.nombre !== categoria) return false;
        if (busqueda && !contiene(p.nombre, busqueda)) return false;
        return true;
      }),
    [productos, categoria, busqueda],
  );

  const total = totalPedido(lineas);
  const items = cantidadPedido(lineas);

  async function enviar() {
    if (lineas.length === 0 || enviando) return;
    setError("");
    setEnviando(true);
    try {
      await api.crearComanda(mesa.id, { items: aItemsDeComanda(lineas) });
      setLineas([]);
      setAbierto(false);
      // Vuelve al salón y no a la mesa: después de mandar un pedido el mesero
      // sigue con otra mesa, no se queda mirando la carta.
      onEnviado("Pedido enviado a cocina");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el pedido");
      setEnviando(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-fondo">
      <header className="flex items-center gap-3 border-b border-borde bg-white px-4 py-3">
        <button
          onClick={onAtras}
          aria-label="Volver"
          className="rounded-lg p-1.5 text-texto-2 hover:bg-muted"
        >
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold text-texto">
            Pedido · {etiquetaMesa(mesa)}
          </h1>
          <p className="truncate text-xs text-texto-3">
            {mesa.zonaNombre} · {mesa.comensales}{" "}
            {mesa.comensales === 1 ? "persona" : "personas"}
          </p>
        </div>
        {items > 0 && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
            {items}
          </span>
        )}
      </header>

      <div className="border-b border-borde bg-white px-4 pb-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-3">
            <Icon name="search" size={16} />
          </span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en la carta…"
            className="w-full rounded-xl border border-borde py-2.5 pl-9 pr-3 text-[15px] outline-none focus:border-primary"
          />
        </div>
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
          <ChipCat activo={categoria === null} onClick={() => setCategoria(null)}>
            Todos
          </ChipCat>
          {categorias.map((c) => (
            <ChipCat key={c} activo={categoria === c} onClick={() => setCategoria(c)}>
              {c}
            </ChipCat>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24">
        {carta.error && <ErrorMsg>{carta.error}</ErrorMsg>}
        {error && <ErrorMsg>{error}</ErrorMsg>}
        {carta.cargando && !carta.datos ? (
          <Cargando />
        ) : visibles.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-texto-3">
            No hay productos que coincidan.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {visibles.map((p) => (
              <TarjetaCarta
                key={p.id}
                producto={p}
                cantidad={cantidadDeProducto(lineas, p.id)}
                onAgregar={() =>
                  setLineas((l) => agregar(l, p, proximoId.current++))
                }
                onQuitar={() => setLineas((l) => quitarUno(l, p.id))}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Píldora del pedido, igual que en el Punto de Venta. Oculta mientras
          no haya nada cargado. Enviar se decide en el carrito, que es donde se
          ven las cantidades y las indicaciones — no acá. */}
      {items > 0 && !abierto && (
        <button
          onClick={() => setAbierto(true)}
          className="absolute bottom-20 left-1/2 flex h-14 -translate-x-1/2 items-center gap-3 rounded-full bg-primary px-6 text-white shadow-xl shadow-primary/30"
        >
          <Icon name="cart" size={22} />
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-bold">
            {fmtNum(items)}
          </span>
          <span className="text-lg font-extrabold">{fmtMoney(total)}</span>
        </button>
      )}

      {abierto && (
        <CarritoPedido
          lineas={lineas}
          setLineas={setLineas}
          enviando={enviando}
          onCerrar={() => setAbierto(false)}
          onEnviar={enviar}
        />
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
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
        activo
          ? "border-primary bg-primary text-white"
          : "border-borde bg-white text-texto-2 hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
