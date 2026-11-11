import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Boton, Cargando, ErrorMsg, Vacio } from "../../components/ui";
import { fmtMoney, fmtNum } from "../../lib/format";
import { useAuth } from "../../store/AuthContext";
import type { Categoria, Producto } from "../../types";
import { controlaStock, paraVender } from "../pos/useCarrito";
import CampoBusqueda from "./CampoBusqueda";
import { FormEncargo } from "./FormEncargo";
import { concentracionAparte, conUnidad, puntoVencimiento } from "./medicamento";
import { ChipsCondicion } from "./piezas";
import { pitidoDeError } from "./sonido";
import { useBusquedaProductos } from "./useBusquedaProductos";
import { sePuedeVender, useVentaFarmacia } from "./ventaFarmacia";

/** De a cuántos se traen: cuatro filas de la grilla en un monitor. */
const POR_TANDA = 24;

/**
 * El catálogo del punto de venta de una farmacia: una grilla de tarjetas con
 * chips de categoría, como la maqueta.
 *
 * El campo de búsqueda se queda ACÁ y no salta a Buscar medicamento como en la
 * maqueta: el lector de código de barras escribe en el campo que tenga el foco
 * y manda Enter, y si el primer carácter cambiara de pantalla el resto del
 * código se perdería. Con el campo acá, escanear suma el producto sin tocar
 * nada. La búsqueda avanzada (la tabla con lotes y laboratorios) queda a un
 * toque, al lado de los chips.
 *
 * Todo lo que viene después —el carrito, el cobro, la caja, el recibo— es el
 * mismo de siempre.
 */
export default function CatalogoVenta({
  categorias,
  enCarrito,
  sucursalId = null,
}: {
  categorias: Categoria[];
  /** Cuánto hay de cada producto en la venta, para marcar la tarjeta. */
  enCarrito: Map<number, number>;
  /**
   * La sucursal de la caja. Sin esto el dueño (que no pertenece a ninguna)
   * veía el stock de todo el negocio, depósito incluido: "89 u." con 39 en el
   * estante. Se vende lo que hay en ESTA sucursal.
   */
  sucursalId?: number | null;
}) {
  const venta = useVentaFarmacia();
  const { puede, incluye } = useAuth();
  // Sin `lotes` el plan no tiene Vencimientos: el punto de color ("Vence hoy",
  // "Sin fecha") no tiene de dónde salir ni adónde llevar.
  const conLotes = incluye("lotes");
  const [q, setQ] = useState("");
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  /** El agotado que se está encargando desde su tarjeta, si hay uno. */
  const [encargando, setEncargando] = useState<Producto | null>(null);
  const busqueda = useBusquedaProductos({
    q,
    categoriaId,
    limite: POR_TANDA,
    sucursalId,
    // Sólo lo vendible: un artículo apagado se sigue editando desde el
    // catálogo, pero no tiene por qué aparecer con el cliente esperando.
    soloHabilitados: true,
  });

  function agregar(p: Producto) {
    venta?.agregar(p);
    // Buscando o escaneando, el campo se limpia y recupera el foco: en el
    // mostrador se carga un producto atrás de otro. Tocando la grilla no: en un
    // teléfono el foco abriría el teclado encima de las tarjetas.
    if (q) {
      setQ("");
      campo.current?.focus();
    }
  }

  /**
   * Enter carga el único resultado: es lo que hace que el lector funcione
   * solo. Con más de uno no carga nada — elegir por la persona cuál de tres
   * remedios parecidos va a la venta sería peligroso.
   *
   * El lector manda el Enter apenas termina de escribir el código, antes de
   * que la búsqueda haya preguntado nada: lo que se ve en ese momento es del
   * texto anterior, y decidir con eso dejaba el producto afuera. Entonces, si
   * lo que se ve no es de este texto, se pregunta ya y se decide con esa
   * respuesta. Si mientras tanto se siguió escribiendo, el Enter era para otro
   * texto y no carga nada (`buscarAhora` devuelve null).
   *
   * Cuando el Enter NO agregó, se dice y se oye. Hasta el 11-nov un escaneo de
   * un agotado o de un código con dos coincidencias no hacía nada, en
   * silencio: quien escanea mira el producto y no la pantalla, daba el remedio
   * por cargado y el cliente se iba sin pagarlo (B9). El pitido es para eso;
   * el aviso dice qué pasó. Con un solo resultado se llama SIEMPRE a la venta,
   * que es la que sabe decir "agotado", "lo que queda está vencido" o "no se
   * vende en esta sucursal" (y no lo suma).
   */
  async function alEnter() {
    const texto = q;
    const items =
      busqueda.consulta === texto && !busqueda.cargando
        ? busqueda.items
        : await busqueda.buscarAhora(texto);
    if (!items) return;
    if (items.length === 1 && sePuedeVender(items[0])) {
      agregar(items[0]);
      return;
    }
    if (items.length === 1) venta?.agregar(items[0]);
    else if (items.length > 1) venta?.avisar?.(`Hay ${items.length} coincidencias con "${texto}": elegí en la grilla`);
    // Con 0 la grilla ya dice "No hay nada con …".
    pitidoDeError();
    // El texto se queda (la tarjeta del agotado, con su "Encargar", sigue a la
    // vista) pero seleccionado: el próximo escaneo lo reemplaza en vez de
    // pegarse atrás y dar un código que no existe.
    campo.current?.select();
  }

  const activas = categorias.filter((c) => c.activo !== false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-borde bg-white px-4 py-3">
        <CampoBusqueda
          ref={campo}
          valor={q}
          onChange={setQ}
          onEnter={() => void alEnter()}
          placeholder="Buscá o escaneá: nombre, droga, laboratorio…"
        />
        {/* En el teléfono los chips se deslizan en una fila; desde tablet se
            acomodan en varias, como en la maqueta. */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 md:flex-wrap md:overflow-visible">
          <Chip activo={categoriaId === null} onClick={() => setCategoriaId(null)}>
            Todos
          </Chip>
          {activas.map((c) => (
            <Chip key={c.id} activo={categoriaId === c.id} onClick={() => setCategoriaId(c.id)}>
              {c.nombre}
            </Chip>
          ))}
          {puede("busqueda") && (
            <Link
              to="/buscar"
              className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1.5 text-[13px] font-semibold text-primary-700 hover:underline"
            >
              Búsqueda avanzada
              <Icon name="chevronRight" size={15} />
            </Link>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 lg:pb-4">
        {/* Con error, SÓLO el error. Hasta el 11-nov debajo aparecía también
            "No hay nada con …" (la búsqueda fallida deja la lista vacía), y
            quien atiende leía que el remedio no existía cuando lo que pasaba
            era que no había conexión (B14). */}
        {busqueda.error ? (
          <ErrorMsg onReintentar={busqueda.recargar}>{busqueda.error}</ErrorMsg>
        ) : busqueda.cargando && busqueda.items.length === 0 ? (
          <Cargando texto="Buscando…" />
        ) : busqueda.items.length === 0 ? (
          <Vacio
            icono="search"
            titulo={q ? `No hay nada con "${q}"` : "No hay medicamentos en esta categoría"}
            texto={
              q
                ? "Probá con la droga en vez de la marca, o con menos letras."
                : "Elegí otra categoría, o buscá por nombre."
            }
          />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
              {busqueda.items.map((p) => (
                <TarjetaVenta
                  key={p.id}
                  producto={p}
                  cantidad={enCarrito.get(p.id) ?? 0}
                  conVencimiento={conLotes}
                  onAgregar={() => agregar(p)}
                  onEncargar={puede("encargos") ? () => setEncargando(p) : undefined}
                />
              ))}
            </ul>

            {busqueda.hayMas && (
              <div className="mt-4 flex justify-center">
                <Boton variante="ghost" onClick={busqueda.traerMas} disabled={busqueda.trayendoMas}>
                  {busqueda.trayendoMas
                    ? "Trayendo…"
                    : `Ver más (${busqueda.items.length} de ${busqueda.total})`}
                </Boton>
              </div>
            )}
          </>
        )}
      </div>

      {/* "Hoy no tengo, te lo consigo" es una venta: se anota desde la
          tarjeta, con el cliente enfrente, en vez de ir a Encargos (#17). */}
      {encargando && (
        <FormEncargo
          productoInicial={encargando}
          onClose={() => setEncargando(null)}
          onGuardado={() => {
            venta?.avisar?.(`Encargo anotado: ${encargando.nombre}`);
            setEncargando(null);
          }}
        />
      )}
    </div>
  );
}

function Chip({
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
      aria-pressed={activo}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
        activo
          ? "bg-primary-boton text-white"
          : "border border-borde bg-white text-texto-2 hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Una caja del estante. Arriba lo que la distingue de su vecina (nombre,
 * laboratorio y forma), a la derecha el punto de vencimiento, y abajo lo que
 * se le dice al cliente: cuánto sale y si hay.
 */
function TarjetaVenta({
  producto: p,
  cantidad,
  conVencimiento,
  onAgregar,
  onEncargar,
}: {
  producto: Producto;
  cantidad: number;
  /** El plan tiene `lotes`: sin eso no hay punto de vencimiento. */
  conVencimiento: boolean;
  onAgregar: () => void;
  /** Anotar el encargo de lo que no hay. Sin esto (sin Encargos), no se ofrece. */
  onEncargar?: () => void;
}) {
  const vendible = sePuedeVender(p);
  // Lo que se puede vender: sin las cajas vencidas, que siguen en el estante
  // hasta la baja pero no se cobran.
  const hay = paraVender(p);
  const vencidas = p.stockVencido ?? 0;
  // Como `sePuedeVender`: el combo también se agota (POS-2).
  const agotado = controlaStock(p) && hay <= 0;
  const punto = puntoVencimiento(p);
  const concentracion = concentracionAparte(p);
  const detalle = [p.laboratorio, p.formaFarmaceutica].filter(Boolean).join(" · ");

  return (
    <li className="flex flex-col">
      <button
        onClick={onAgregar}
        disabled={!vendible}
        className={`flex w-full flex-1 flex-col gap-1.5 rounded-2xl border bg-white p-3 text-left transition sm:p-3.5 ${
          cantidad > 0
            ? "border-primary ring-1 ring-primary"
            : "border-borde enabled:hover:border-primary/60 enabled:hover:shadow-md"
        } ${vendible ? "" : "cursor-not-allowed opacity-55"}`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-[13px] font-bold leading-snug text-texto sm:text-sm">
            {p.nombre}
            {concentracion && <span className="font-semibold text-texto-2"> {concentracion}</span>}
          </span>
          {conVencimiento && (
            <span
              aria-label={`Vencimiento: ${punto.texto}`}
              title={punto.texto}
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${punto.color}`}
            />
          )}
        </span>
        <span className="truncate text-xs text-texto-3">
          {detalle || p.principioActivo || p.categoria?.nombre || "Sin ficha cargada"}
        </span>
        {/* Sólo si el dueño la cargó: es opcional. */}
        {p.ubicacion && (
          <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-texto-2">
            <span className="shrink-0 text-primary-700">
              <Icon name="pin" size={12} />
            </span>
            <span className="truncate">{p.ubicacion}</span>
          </span>
        )}
        <span className="flex flex-wrap gap-1 empty:hidden">
          <ChipsCondicion producto={p} />
        </span>
        {/* Las cajas vencidas siguen en el estante: quien atiende tiene que
            saber que están ahí para no entregarlas y apartarlas. */}
        {vencidas > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-danger-text">
            <Icon name="alert" size={11} />
            {conUnidad(vencidas, p.unidadMedida?.nombre)} vencidas: no se venden
          </span>
        )}
        <span className="mt-auto flex items-end justify-between gap-2 pt-1">
          <span className="text-sm font-extrabold text-primary-700 sm:text-[15px]">
            {fmtMoney(p.precio)}
          </span>
          <span
            className={`text-right text-[11px] sm:text-xs ${
              cantidad > 0 ? "font-bold text-primary-700" : agotado ? "font-semibold text-danger-text" : "text-texto-3"
            }`}
          >
            {cantidad > 0
              ? `${fmtNum(cantidad)} en la venta`
              : agotado
                ? vencidas > 0
                  ? "Vencido"
                  : "Agotado"
                : p.disponible === false
                  ? "No se vende acá"
                  : conUnidad(hay, p.unidadMedida?.nombre)}
          </span>
        </span>
      </button>
      {/* HERMANO del botón de la tarjeta, no adentro: el de arriba está
          deshabilitado y un botón adentro de otro no se puede tocar. Sólo con
          lo agotado o vencido: lo que "no se vende acá" no es para encargar. */}
      {agotado && onEncargar && (
        <button
          type="button"
          onClick={onEncargar}
          className="mt-1 inline-flex items-center gap-1 self-end rounded-full px-2 py-1 text-[12px] font-semibold text-primary-700 hover:underline"
        >
          <Icon name="bell" size={13} />
          Encargar
        </button>
      )}
    </li>
  );
}
