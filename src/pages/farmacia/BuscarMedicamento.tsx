import { useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Cargando, ErrorMsg, Vacio } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { Producto } from "../../types";
import { paraVender } from "../pos/useCarrito";
import CampoBusqueda from "./CampoBusqueda";
import { FichaMostrador } from "./FichaMedicamento";
import { CONDICION, concentracionAparte, conUnidad, puntoVencimiento } from "./medicamento";
import { Resaltado } from "./piezas";
import { useBusquedaProductos } from "./useBusquedaProductos";
import { sePuedeVender, useVentaFarmacia } from "./ventaFarmacia";

/**
 * Buscar un medicamento: la pantalla que más veces por día se usa en una
 * farmacia. Alguien pregunta desde el otro lado del mostrador "¿tenés algo
 * para la acidez?" o "¿cuánto sale el omeprazol?", y esto tiene que responder
 * antes de que termine la frase.
 *
 *  1. **Busca en el servidor**. Artículos se trae el catálogo entero y filtra
 *     en memoria: con 40 productos está perfecto, con 2.000 no.
 *  2. **Compara**: en una pantalla grande es una tabla, porque lo que se hace
 *     acá es poner lado a lado el paracetamol de BAGÓ y el de IFA —quién tiene
 *     más stock, cuál vence antes, cuál sale menos—. En el teléfono cada fila
 *     es una tarjeta: seis columnas en 375 px no se leen.
 *  3. **Vende**: "Agregar" lo suma a la venta sin salir de acá, y el botón
 *     "Ver venta" lleva al cobro. No se edita ni se borra nada: la ficha es de
 *     consulta.
 *  4. **Muestra lo agotado**, apagado pero visible. Esconderlo haría que el
 *     farmacéutico dijera "no tenemos" cuando la respuesta correcta es "hoy no
 *     tengo, te lo consigo" — que es una venta, y es de donde salen los
 *     encargos. Su ficha se sigue abriendo: puede haber en el depósito.
 */
export default function BuscarMedicamento() {
  const [q, setQ] = useState("");
  const [ficha, setFicha] = useState<Producto | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  // La sucursal de la caja abierta: de ahí sale lo que se vende. Sin esto el
  // dueño (que no pertenece a ninguna) veía el stock del negocio entero —la
  // ranitidina de Equipetrol como si estuviera en su estante— y "Agregar" le
  // ofrecía algo que el cobro iba a rechazar. A quien pertenece a una sucursal
  // el backend ya le da la suya.
  const caja = useApi(() => api.cajaActual().catch(() => null), []);
  const cajaAbierta = caja.datos?.caja ?? null;
  const busqueda = useBusquedaProductos({
    q,
    sucursalId: cajaAbierta?.almacenId ?? null,
    // Se espera a saber de qué sucursal: si no, primero se veía el total del
    // negocio y un instante después el del local.
    activo: !caja.cargando,
  });
  const venta = useVentaFarmacia();
  const { puede } = useAuth();
  // Quien no cobra (un supervisor de inventario) consulta, pero no vende.
  const vende = !!venta && puede("pos");

  const agregar = vende ? (p: Producto) => venta.agregar(p) : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 pb-24 sm:p-5 sm:pb-24">
      <header>
        <h1 className="text-xl font-bold text-texto">Buscar medicamento</h1>
        <p className="text-[13px] text-texto-3">
          Por nombre, droga, laboratorio o código de barras
        </p>
      </header>

      <CampoBusqueda
        ref={campo}
        valor={q}
        onChange={setQ}
        placeholder="Escribí para buscar… (probá «ome», «bagó» o «paracetamol»)"
      />

      <ErrorMsg>{busqueda.error}</ErrorMsg>

      {/* Mientras se averigua la caja la búsqueda está apagada y no carga
          nada: sin mirar la caja, eso se leía "El catálogo está vacío". */}
      {(caja.cargando || busqueda.cargando) && busqueda.items.length === 0 ? (
        <Cargando texto="Buscando…" />
      ) : busqueda.items.length === 0 ? (
        <div className="card">
          <Vacio
            icono="search"
            titulo={q ? `No hay nada con "${q}"` : "El catálogo está vacío"}
            texto={
              q
                ? "Probá con la droga en vez de la marca, o con menos letras."
                : "Cargá el primer medicamento desde el catálogo."
            }
          />
        </div>
      ) : (
        <>
          <p className="text-[13px] text-texto-3">
            {busqueda.items.length < busqueda.total
              ? `${busqueda.items.length} de ${busqueda.total}`
              : `${busqueda.items.length} ${
                  busqueda.items.length === 1 ? "resultado" : "resultados"
                }`}
            {/* Con varias sucursales, de cuál es el stock que se ve. Un
                negocio de un local no recibe el nombre y no ve nada. */}
            {cajaAbierta?.almacen && ` · stock de ${cajaAbierta.almacen}`}
          </p>

          <div className="overflow-hidden rounded-2xl border border-borde bg-white">
            {/* La cabecera sólo tiene sentido cuando las filas son columnas. */}
            <div className={`hidden ${COLUMNAS} border-b border-borde-soft bg-muted/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-texto-4 lg:grid`}>
              <span>Medicamento</span>
              <span>Laboratorio</span>
              <span>Forma</span>
              <span>Stock</span>
              <span>Vencimiento</span>
              <span className="text-right">Precio · acciones</span>
            </div>
            <ul className="divide-y divide-borde-soft">
              {busqueda.items.map((p) => (
                <Fila
                  key={p.id}
                  producto={p}
                  q={q}
                  onFicha={() => setFicha(p)}
                  onAgregar={agregar && (() => agregar(p))}
                />
              ))}
            </ul>
          </div>

          {busqueda.hayMas && (
            <div className="flex justify-center">
              <Boton variante="ghost" onClick={busqueda.traerMas} disabled={busqueda.trayendoMas}>
                {busqueda.trayendoMas ? "Trayendo…" : "Ver más"}
              </Boton>
            </div>
          )}
        </>
      )}

      {ficha && (
        <FichaMostrador
          producto={ficha}
          onClose={() => setFicha(null)}
          // Cambiar una ubicación desde la ficha se tiene que ver en la fila.
          onCambio={busqueda.recargar}
          sucursalActual={cajaAbierta?.almacenId ?? null}
          onAgregar={
            agregar && sePuedeVender(ficha)
              ? () => {
                  agregar(ficha);
                  setFicha(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

/** Las seis columnas de la tabla, las mismas en la cabecera y en cada fila. */
const COLUMNAS =
  "lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_auto] lg:items-center lg:gap-4";

/**
 * Un resultado. En pantalla grande es una fila de la tabla; en el teléfono,
 * una tarjeta con lo mismo en tres renglones. Los datos son los mismos: sólo
 * cambia cómo se acomodan.
 */
function Fila({
  producto: p,
  q,
  onFicha,
  onAgregar,
}: {
  producto: Producto;
  q: string;
  onFicha: () => void;
  /** Sin esto no hay botón "Agregar": quien consulta no siempre vende. */
  onAgregar?: () => void;
}) {
  const vendible = sePuedeVender(p);
  // Lo que se puede vender: sin las cajas vencidas, que siguen en el estante
  // hasta la baja pero no se cobran.
  const hay = paraVender(p);
  const vencidas = p.stockVencido ?? 0;
  const agotado = hay <= 0;
  const bajo = !agotado && hay <= p.stockMinimo;
  const punto = puntoVencimiento(p);
  const concentracion = concentracionAparte(p);
  const condicion = CONDICION[p.condicionVenta];
  const stock = conUnidad(hay, p.unidadMedida?.nombre);
  const sinStock = vencidas > 0 ? "Vencido" : "Agotado";

  const colorStock = agotado ? "text-danger-text" : bajo ? "text-warning-text" : "text-texto";

  return (
    <li className={`px-4 py-3 lg:grid lg:px-5 ${COLUMNAS} ${vendible ? "" : "bg-muted/40"}`}>
      {/* Medicamento: nombre, droga y condición de venta. Tocarlo abre la
          ficha, igual que el botón. */}
      <button onClick={onFicha} className="block w-full min-w-0 text-left">
        <span className={`block truncate text-[15px] font-bold ${vendible ? "text-texto" : "text-texto-3"}`}>
          <Resaltado texto={p.nombre} q={q} />
          {concentracion && <span className="ml-1.5 font-semibold text-texto-2">{concentracion}</span>}
        </span>
        <span className="mt-0.5 block truncate text-xs text-texto-3">
          {p.principioActivo && (
            <>
              <Resaltado texto={p.principioActivo} q={q} />
              {" · "}
            </>
          )}
          {/* En la tabla la condición va escrita, también "Libre": es una
              columna más a comparar. En las tarjetas del POS sólo se marca lo
              que exige receta. Sin el paréntesis de la ficha, que en una fila
              no entra. */}
          <span className={`font-semibold ${condicion ? TEXTO_CONDICION[condicion.tono] : "text-emerald-700"}`}>
            {condicion ? condicion.largo.replace(/ \(.*\)$/, "") : "Libre"}
          </span>
          {p.controlado && <span className="font-semibold text-danger-text"> · Controlado</span>}
          {/* En el teléfono el laboratorio y la forma van en este renglón. */}
          <span className="lg:hidden">
            {[p.laboratorio, p.formaFarmaceutica]
              .filter(Boolean)
              .map((x) => ` · ${x}`)
              .join("")}
          </span>
        </span>
        {/* Dónde ir a buscarlo, si el dueño lo cargó. */}
        {p.ubicacion && (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs font-semibold text-texto-2">
            <span className="shrink-0 text-primary-700">
              <Icon name="pin" size={12} />
            </span>
            <span className="truncate">{p.ubicacion}</span>
          </span>
        )}
        {/* Las cajas vencidas siguen en el estante: que quien atiende no las
            entregue y avise para darlas de baja. */}
        {vencidas > 0 && (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs font-semibold text-danger-text">
            <span className="shrink-0">
              <Icon name="alert" size={12} />
            </span>
            <span className="truncate">
              {conUnidad(vencidas, p.unidadMedida?.nombre)} vencidas: no se venden
            </span>
          </span>
        )}
      </button>

      <span className="hidden truncate text-[13px] text-texto-2 lg:block">
        {p.laboratorio ? <Resaltado texto={p.laboratorio} q={q} /> : "—"}
      </span>
      <span className="hidden truncate text-[13px] text-texto-2 lg:block">
        {p.formaFarmaceutica || "—"}
      </span>
      <span className={`hidden text-[13px] font-bold lg:block ${colorStock}`}>
        {agotado ? sinStock : stock}
      </span>
      <span className="hidden items-center gap-2 text-xs lg:flex">
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${punto.color}`} />
        <span className={punto.urgente ? "font-semibold text-danger-text" : "text-texto-3"}>
          {punto.texto}
        </span>
      </span>

      {/* Precio y acciones. En el teléfono, con el stock y el vencimiento a la
          izquierda para no perderlos. */}
      <div className="mt-2 flex items-center gap-2 lg:mt-0 lg:justify-end">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs lg:hidden">
          <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${punto.color}`} />
          <span className={`truncate ${punto.urgente ? "font-semibold text-danger-text" : "text-texto-3"}`}>
            {punto.corto}
          </span>
          <span className={`shrink-0 font-semibold ${colorStock}`}>
            · {agotado ? sinStock : stock}
          </span>
        </span>
        <span className={`shrink-0 text-[15px] font-extrabold ${vendible ? "text-primary-700" : "text-texto-3"}`}>
          {fmtMoney(p.precio)}
        </span>
        {onAgregar && (
          <button
            onClick={onAgregar}
            disabled={!vendible}
            title={vendible ? "Agregar a la venta" : agotado ? sinStock : "No se puede vender"}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Agregar
          </button>
        )}
        {/* En el teléfono es un ícono: el renglón lleva además el vencimiento
            y el stock, y con la palabra entera no entraban. */}
        <button
          onClick={onFicha}
          aria-label={`Ficha de ${p.nombre}`}
          title="Ficha"
          className="shrink-0 rounded-lg border border-borde bg-white p-1.5 text-xs font-bold text-primary-700 transition hover:border-primary lg:px-3"
        >
          <span className="lg:hidden">
            <Icon name="info" size={16} />
          </span>
          <span className="hidden lg:inline">Ficha</span>
        </button>
      </div>
    </li>
  );
}

/** El color del texto de cada condición, el mismo tono que su chip. */
const TEXTO_CONDICION = {
  azul: "text-info-text",
  amarillo: "text-warning-text",
  rojo: "text-danger-text",
} as const;
