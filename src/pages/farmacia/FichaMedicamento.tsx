import { useState } from "react";
import HistorialCostos from "../../components/HistorialCostos";
import { Icon } from "../../components/Icon";
import { Badge, Boton, Cargando, Modal } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFecha, fmtMoney, fmtNum } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { Producto } from "../../types";
import {
  COLOR_TRAMO,
  CONDICION,
  concentracionAparte,
  conUnidad,
  detalleDe,
  textoVida,
} from "./medicamento";

/**
 * Las dos piezas del catálogo de una farmacia: la tarjeta de la grilla y la
 * ficha que se abre al tocarla.
 *
 * Viven acá y no en `inventario/Productos.tsx` por lo mismo de siempre: la
 * pantalla de artículos la comparten todos los rubros y la pollería que ya
 * trabaja no tiene por qué enterarse de que existe un vencimiento. Productos
 * elige cuál dibujar según el rubro y nada más.
 *
 * Lo que cambia respecto de la tarjeta común no es estética:
 *
 *  · **no lleva ícono.** En una pollería el dibujo del pollo es lo que el
 *    cajero busca; acá hay 1.842 cajas blancas y lo que distingue una de otra
 *    es el laboratorio, que entra justo en el lugar del ícono;
 *  · **el stock es un punto de color**, no un recuadro. Se recorre la grilla
 *    entera de un vistazo buscando el rojo;
 *  · **la ficha abre por lo que se pregunta**: registro sanitario, código de
 *    barras, en qué almacén está y qué lote se va a vender primero. El precio y
 *    el margen siguen estando, más abajo: son del dueño, no del mostrador.
 */
export function TarjetaMedicamento({
  producto: p,
  stock,
  onClick,
}: {
  producto: Producto;
  /**
   * Cuánto hay. Es el total del negocio salvo que arriba se haya elegido un
   * almacén, y entonces es el de ese: la tarjeta tiene que decir lo mismo que
   * el filtro que está puesto.
   */
  stock: number;
  onClick: () => void;
}) {
  const agotado = stock <= 0;
  const bajo = !agotado && stock <= p.stockMinimo;
  const detalle = detalleDe(p);
  const condicion = CONDICION[p.condicionVenta];

  return (
    <li>
      <button
        onClick={onClick}
        className="card flex h-full w-full flex-col p-4 text-left transition-shadow hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <h3
            className={`min-w-0 flex-1 text-[15px] font-bold ${
              agotado ? "text-texto-3" : "text-texto"
            }`}
          >
            {p.nombre}
          </h3>
          <span className="mt-0.5 shrink-0 text-texto-4">
            <Icon name="chevronRight" size={17} />
          </span>
        </div>

        <p className="mt-0.5 line-clamp-1 text-[13px] text-texto-3">
          {detalle || p.descripcion || "Sin ficha cargada"}
        </p>

        {(p.condicionVenta !== "LIBRE" || p.controlado || !p.habilitado) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {condicion && <Badge tono={condicion.tono}>{condicion.texto}</Badge>}
            {p.controlado && <Badge tono="rojo">Controlado</Badge>}
            {!p.habilitado && <Badge tono="gris">Inactivo</Badge>}
          </div>
        )}

        {/* `mt-auto`: con o sin chips, el pie queda a la misma altura en todas
            las tarjetas de la fila. */}
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-borde-soft pt-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
              Precio
            </p>
            <p
              className={`truncate text-[17px] font-bold ${
                agotado ? "text-texto-3" : "text-texto"
              }`}
            >
              {fmtMoney(p.precio)}
            </p>
          </div>

          <span
            className={`flex shrink-0 items-center gap-1.5 pb-0.5 text-[13px] ${
              agotado ? "text-danger-text" : bajo ? "text-warning-text" : "text-texto-3"
            }`}
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${
                agotado ? "bg-danger" : bajo ? "bg-warning" : "bg-primary"
              }`}
            />
            {agotado ? "Agotado" : conUnidad(stock, p.unidadMedida?.nombre)}
          </span>
        </div>
      </button>
    </li>
  );
}

export function FichaMedicamento({
  producto: p,
  enPapelera,
  onClose,
  onEditar,
  onEliminar,
  onRestaurar,
}: {
  producto: Producto;
  enPapelera: boolean;
  onClose: () => void;
  onEditar: (p: Producto) => void;
  onEliminar: (p: Producto) => void;
  onRestaurar: (p: Producto) => void;
}) {
  const [viendoCostos, setViendoCostos] = useState(false);
  const condicion = CONDICION[p.condicionVenta];
  const concentracion = concentracionAparte(p);
  const margen = p.precio > 0 ? (p.precio - p.costo) / p.precio : 0;

  return (
    <>
      <Modal
        abierto
        titulo={p.nombre}
        onClose={onClose}
        ancho="max-w-2xl"
        encabezado={
          // La franja de color: el nombre es lo primero que se lee y lo que
          // hay que confirmar antes de mirar cualquier número.
          <div className="bg-gradient-to-r from-primary-700 to-primary px-5 pb-5 pt-5 text-white">
            <h2 className="pr-12 text-xl font-bold leading-tight">
              {p.nombre}
              {concentracion && (
                <span className="ml-1.5 font-semibold text-white/85">{concentracion}</span>
              )}
            </h2>
            <p className="mt-0.5 text-[13px] text-white/80">
              {detalleDe(p) || "Sin ficha farmacéutica cargada"}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                {condicion ? condicion.largo : "Libre"}
              </span>
              {p.controlado && (
                <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-danger-text">
                  Controlado
                </span>
              )}
              {!p.habilitado && (
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                  Inactivo
                </span>
              )}
            </div>
          </div>
        }
        acciones={
          enPapelera ? (
            <Boton icono="check" onClick={() => onRestaurar(p)}>
              Restaurar
            </Boton>
          ) : (
            <>
              <Boton variante="ghost" icono="trendingDown" onClick={() => setViendoCostos(true)}>
                Historial de costos
              </Boton>
              <Boton variante="danger" icono="trash" onClick={() => onEliminar(p)}>
                Eliminar
              </Boton>
              <Boton icono="edit" onClick={() => onEditar(p)}>
                Editar
              </Boton>
            </>
          )
        }
      >
        <div className="space-y-5">
          <Seccion titulo="Identificación">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Dato label="Registro sanitario" valor={p.registroSanitario || "—"} />
              <Dato label="Código de barras" valor={p.codBarra || "—"} />
              <Dato label="Precio" valor={fmtMoney(p.precio)} />
              <Dato label="Costo" valor={fmtMoney(p.costo)} />
              <Dato label="Margen" valor={`${Math.round(margen * 100)}%`} />
              <Dato label="Categoría" valor={p.categoria?.nombre ?? "—"} />
            </div>
          </Seccion>

          <StockPorAlmacen producto={p} />

          <LotesFefo producto={p} />

          {p.controlado && (
            <p className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-text">
              <strong>Medicamento controlado.</strong> Su venta se asienta en el libro que
              corresponde.
            </p>
          )}
        </div>
      </Modal>

      {viendoCostos && (
        <HistorialCostos
          productoId={p.id}
          nombre={p.nombre}
          onClose={() => setViendoCostos(false)}
        />
      )}
    </>
  );
}

/**
 * Dónde está la mercadería.
 *
 * Con un solo almacén no se pregunta nada: el total ES el del local, y pedir el
 * detalle sería traerse el catálogo entero para no decir nada nuevo. Con dos o
 * más sí, porque es la duda de todos los días —"no hay" contra "no hay **acá**"—
 * y la que hace que el mostrador diga que no teniendo la caja en el depósito.
 */
function StockPorAlmacen({ producto: p }: { producto: Producto }) {
  // `GET /almacenes` ya viene con los artículos de cada uno y su cantidad (los
  // necesita la pantalla de Almacenes para sus totales), así que el desglose
  // sale de UNA consulta y no de una por almacén. Ojo: sólo lista lo que tiene
  // saldo positivo, o sea que "no está" y "está en cero" se ven igual — que es
  // lo correcto acá.
  const almacenes = useApi(() => api.getAlmacenes(), []);
  const lista = (almacenes.datos ?? []).filter((a) => a.activo);

  return (
    <Seccion titulo="Stock por almacén">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Caja
          etiqueta="Total"
          valor={conUnidad(p.stockTotal, p.unidadMedida?.nombre)}
          destacada
        />
        {/* Con un solo almacén el total YA es el del local: repetirlo al lado
            sería decir dos veces lo mismo. */}
        {lista.length > 1 &&
          lista.map((a) => (
            <Caja
              key={a.id}
              etiqueta={a.nombre}
              valor={conUnidad(
                a.articulos?.find((x) => x.id === p.id)?.stock ?? 0,
                p.unidadMedida?.nombre,
              )}
            />
          ))}
      </div>
      <p className="mt-2 text-xs text-texto-4">
        Stock mínimo: {fmtNum(p.stockMinimo)} · avisa cuando baje de ahí
      </p>
    </Seccion>
  );
}

/**
 * Los lotes con saldo, en el orden en que se van a vender (FEFO: primero el que
 * vence antes). Es el corazón de la ficha: responde "¿qué le estoy por dar a
 * esta persona?" sin ir a Vencimientos.
 */
function LotesFefo({ producto: p }: { producto: Producto }) {
  // Sin la feature el servidor responde 403: la sección no se dibuja, como
  // cualquier otra cosa que el plan no incluye.
  const { incluye } = useAuth();
  const conLotes = incluye("lotes");
  const lotes = useApi(
    () => (conLotes && p.manejaLote ? api.lotesDeProducto(p.id) : Promise.resolve([])),
    [p.id, p.manejaLote, conLotes],
  );

  if (!conLotes) return null;

  if (!p.manejaLote) {
    return (
      <Seccion titulo="Lotes (FEFO)">
        <p className="text-[13px] text-texto-3">
          Este artículo no maneja lotes (no vence).
        </p>
      </Seccion>
    );
  }

  const lista = lotes.datos ?? [];

  return (
    <Seccion titulo="Lotes (FEFO)">
      {lotes.cargando ? (
        <Cargando texto="Buscando lotes…" />
      ) : lista.length === 0 ? (
        <p className="text-[13px] text-texto-3">
          No queda saldo en ningún lote: lo que entre en el próximo ingreso será el
          primero en salir.
        </p>
      ) : (
        <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
          {lista.map((l) => {
            const color = COLOR_TRAMO[l.tramo ?? "LEJOS"];
            return (
              <li key={l.loteId} className="flex items-center gap-3 px-3.5 py-2.5">
                <span
                  aria-hidden
                  className={`h-8 w-1 shrink-0 rounded-full ${color.barra}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-texto">{l.codigo}</p>
                  <p className="truncate text-xs text-texto-3">
                    {l.vencimiento ? fmtFecha(l.vencimiento) : "Sin fecha"}
                    {l.almacen && ` · ${l.almacen.nombre}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${color.fondo} ${color.texto}`}
                >
                  {textoVida(l.diasRestantes)}
                </span>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-bold text-texto">
                    {conUnidad(l.cantidad, p.unidadMedida?.nombre)}
                  </p>
                  {l.costoUnitario !== null && (
                    <p className="text-xs text-texto-3">{fmtMoney(l.costoUnitario)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Seccion>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-texto-4">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-texto-3">{label}</dt>
      <dd className="mt-0.5 truncate text-[15px] font-bold text-texto" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

function Caja({
  etiqueta,
  valor,
  destacada,
}: {
  etiqueta: string;
  valor: string;
  destacada?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 ${
        destacada ? "bg-primary-50 ring-1 ring-primary-100" : "bg-muted"
      }`}
    >
      <p className="truncate text-xs text-texto-3">{etiqueta}</p>
      <p
        className={`mt-0.5 truncate text-lg font-bold ${
          destacada ? "text-primary-700" : "text-texto"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}
