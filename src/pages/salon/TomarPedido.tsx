import { useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Cargando, Confirmar, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney, fmtNum } from "../../lib/format";
import { contiene } from "../../lib/texto";
import { useApi } from "../../lib/useApi";
import type { Mesa } from "../../types/salon";
import { huellaDeCobro, useIntentoDeCobro } from "../pos/useIntentoDeCobro";
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
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const proximoId = useRef(1);
  /**
   * La identidad de ESTE envío a cocina (`clienteRequestId`), la misma en cada
   * reintento. La comanda viajaba sin ella: si la respuesta se perdía (wifi
   * del local, el corte de 20 s) la pantalla mostraba el error, el mesero
   * tocaba "Enviar a cocina" de nuevo y la cocina recibía el pedido dos veces
   * — y se cobraba dos veces si nadie lo veía. Con el mismo id el backend
   * devuelve la comanda que ya entró. Se renueva al enviar bien o si el pedido
   * cambió (mismo criterio que el cobro del POS: ver `useIntentoDeCobro`).
   */
  const intento = useIntentoDeCobro();

  const productos = useMemo(() => carta.datos ?? [], [carta.datos]);

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

  /**
   * La carta en grupos, en el orden de las categorías.
   *
   * En "Todos" iba en orden alfabético y mezclaba Agua, Cerveza, Chairo y
   * Coca-Cola: el mesero buscaba el plato entre las bebidas. Agrupada, cada
   * cosa queda siempre en el mismo lugar y se aprende dónde está
   * (UX-MESEROS §2). Lo que no tiene categoría va al final, en "Otros".
   */
  const grupos = useMemo(() => {
    const porNombre = new Map<string, typeof visibles>();
    for (const p of visibles) {
      const n = p.categoria?.nombre ?? "Otros";
      const g = porNombre.get(n);
      if (g) g.push(p);
      else porNombre.set(n, [p]);
    }
    const orden = [...categorias, "Otros"];
    return [...porNombre.entries()]
      .sort(([a], [b]) => orden.indexOf(a) - orden.indexOf(b))
      .map(([titulo, items]) => ({ titulo, items }));
  }, [visibles, categorias]);
  const [buscando, setBuscando] = useState(false);

  const total = totalPedido(lineas);
  const items = cantidadPedido(lineas);

  async function enviar() {
    if (lineas.length === 0 || enviando) return;
    setError("");
    setEnviando(true);
    try {
      const items = aItemsDeComanda(lineas);
      await api.crearComanda(mesa.id, {
        items,
        clienteRequestId: intento.actual(huellaDeCobro(items)),
      });
      intento.registrado();
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
    <div className="relative flex h-full min-h-0 flex-col bg-fondo">
      {/* La flecha de atrás está donde cae el pulgar, y el pedido vive sólo en
          este componente: salir lo perdía entero, sin aviso ni forma de
          recuperarlo. Con el pedido vacío no pregunta nada. */}
      <Confirmar
        abierto={confirmarSalida}
        titulo="¿Descartar el pedido?"
        texto={`Tenés ${lineas.length} ${
          lineas.length === 1 ? "ítem" : "ítems"
        } sin enviar a la cocina. Si salís ahora se pierden.`}
        etiquetaOk="Descartar"
        peligroso
        onCancel={() => setConfirmarSalida(false)}
        onOk={() => {
          setConfirmarSalida(false);
          onAtras();
        }}
      />
      <header className="flex items-center gap-3 border-b border-borde bg-white px-4 py-3">
        <button
          onClick={() => (lineas.length > 0 ? setConfirmarSalida(true) : onAtras())}
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
        {/* La búsqueda es una lupa y no un campo fijo: el mesero casi siempre
            elige por categoría, y el campo se comía una fila entera de carta
            (UX-MESEROS §2). */}
        <button
          onClick={() => {
            if (buscando) setBusqueda("");
            setBuscando((v) => !v);
          }}
          aria-label={buscando ? "Cerrar la búsqueda" : "Buscar en la carta"}
          aria-pressed={buscando}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
            buscando
              ? "border-primary-boton bg-primary-50 text-primary-700"
              : "border-borde bg-white text-texto-2 hover:bg-muted"
          }`}
        >
          <Icon name={buscando ? "x" : "search"} size={18} />
        </button>
      </header>

      <div className="border-b border-borde bg-white px-4 pb-2.5 pt-1">
        {buscando && (
          <div className="relative mb-2">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-3">
              <Icon name="search" size={16} />
            </span>
            <input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en la carta…"
              className="w-full rounded-xl border border-borde py-2.5 pl-9 pr-3 text-[15px] outline-none focus:border-primary"
            />
          </div>
        )}
        <div className="sin-barra -mx-4 flex gap-2 overflow-x-auto px-4">
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

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-2">
        {carta.error && <ErrorMsg>{carta.error}</ErrorMsg>}
        {error && <ErrorMsg>{error}</ErrorMsg>}
        {carta.cargando && !carta.datos ? (
          <Cargando />
        ) : visibles.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-texto-3">
            No hay productos que coincidan.
          </p>
        ) : (
          grupos.map((g) => (
            <section key={g.titulo} className="mb-3">
              {/* Con una categoría elegida el título repetiría el chip. */}
              {!categoria && (
                <h2 className="mb-1.5 mt-1 text-[12px] font-extrabold uppercase tracking-wide text-texto-2">
                  {g.titulo}
                </h2>
              )}
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {g.items.map((p) => (
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
            </section>
          ))
        )}
      </div>

      {/* Barra del pedido, fija abajo y de lado a lado. Era una píldora
          flotante que tapaba la fila de abajo y no decía qué hacía
          (UX-MESEROS §2). Enviar se decide en el carrito, que es donde se ven
          las cantidades y las indicaciones — no acá. */}
      {items > 0 && !abierto && (
        <div className="absolute inset-x-0 bottom-0 border-t border-borde bg-white px-3 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setAbierto(true)}
            className="flex h-13 w-full items-center justify-between rounded-2xl bg-primary-boton px-5 text-white hover:bg-primary-boton-hover"
          >
            <span className="text-base font-bold">Revisar y enviar</span>
            <span className="text-base font-extrabold">
              {fmtNum(items)} · {fmtMoney(total)}
            </span>
          </button>
        </div>
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
          ? "border-primary-boton bg-primary-boton text-white"
          : "border-borde bg-white text-texto-2 hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
