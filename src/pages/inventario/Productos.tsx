import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { contiene } from "../../lib/texto";
import { Icon } from "../../components/Icon";
import HistorialCostos from "../../components/HistorialCostos";
import IconoProducto from "../../components/IconoProducto";
import { Buscador, Chips, EncabezadoPagina } from "../../components/filtros";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Modal,
  Select,
  Vacio,
} from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney, fmtNum } from "../../lib/format";
import { ICONOS_ARTICULO, iconoPorLlave } from "../../lib/iconosArticulo";
import { esFarmacia, termino } from "../../lib/rubro";
import { FichaMedicamento, TarjetaMedicamento } from "../farmacia/FichaMedicamento";
import { useBusquedaProductos } from "../farmacia/useBusquedaProductos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type {
  Categoria,
  CondicionVenta,
  Producto,
  ProductoInput,
  TipoProducto,
  UnidadMedida,
} from "../../types";

/**
 * Los tres tipos del backend, con la etiqueta que usa la app Android.
 * Sólo ALMACENABLE controla stock: un elaborado se prepara al vender y un
 * combo descuenta sus ingredientes, así que a ninguno se le lleva inventario
 * propio.
 */
const TIPOS: Record<TipoProducto, { label: string; tono: "gris" | "verde" | "morado"; conStock: boolean }> = {
  ALMACENABLE: { label: "Producto", tono: "gris", conStock: true },
  SERVICIO: { label: "Elaborado", tono: "verde", conStock: false },
  // El combo SÍ lleva stock: es el que el local decide ofrecer hoy, y no se
  // mueve por Movimientos como el resto. Editar el artículo es su única vía de
  // carga, así que el campo también aparece al editar (a diferencia de un
  // producto, donde el stock inicial sólo tiene sentido al crear).
  COMPUESTO: { label: "Combo", tono: "morado", conStock: true },
};

/**
 * Condición de venta, con la palabra que usa el mostrador y su color.
 *
 * El verde (`primary`) no se usa acá a propósito: es el color de la marca y en
 * farmacia además significa "stock sano". Venta libre no necesita señal — lo
 * que tiene que saltar a la vista es lo que exige receta.
 */
const CONDICIONES: Record<
  CondicionVenta,
  { label: string; corto: string; tono: "gris" | "azul" | "amarillo" | "rojo" }
> = {
  LIBRE: { label: "Venta libre", corto: "Libre", tono: "gris" },
  RECETA_MEDICA: { label: "Receta médica", corto: "Receta", tono: "azul" },
  RECETA_ARCHIVADA: {
    label: "Receta archivada (psicotrópico)",
    corto: "Receta archivada",
    tono: "amarillo",
  },
  RECETA_VALORADA: {
    label: "Receta valorada (estupefaciente)",
    corto: "Receta valorada",
    tono: "rojo",
  },
};

type FiltroStock = "todos" | "activos" | "bajo" | "sin" | "papelera";
type FiltroTipo = "todos" | TipoProducto;

const OPC_STOCK = [
  ["todos", "Todos"],
  ["activos", "Activos"],
  ["bajo", "Bajo stock"],
  ["sin", "Sin stock"],
  ["papelera", "Dados de baja"],
] as const satisfies readonly (readonly [FiltroStock, string])[];

const OPC_TIPO = [
  ["todos", "Todos los tipos"],
  ["ALMACENABLE", "Producto"],
  ["SERVICIO", "Elaborado"],
  ["COMPUESTO", "Combo"],
] as const satisfies readonly (readonly [FiltroTipo, string])[];

export default function Productos() {
  const { incluye, rubro } = useAuth();
  const [filtroStock, setFiltroStock] = useState<FiltroStock>("todos");
  // La papelera es otra lista del backend, no un filtro sobre la que ya está:
  // los dados de baja no vienen en el catálogo normal.
  const enPapelera = filtroStock === "papelera";
  /**
   * Cómo consigue la pantalla lo que muestra. Sólo en farmacia hay dos formas,
   * y la elige el chip de stock:
   *
   *  · **buscando en el servidor** ("Todos" y "Activos"): se pide de a 30 con
   *    lo que coincide y nada más. Es lo que se hace todo el día —encontrar un
   *    medicamento— y es la única forma que aguanta 1.842 artículos;
   *  · **trayendo el catálogo entero** ("Bajo stock", "Sin stock", "Dados de
   *    baja"): son preguntas sobre TODO el inventario, así que no hay página
   *    que alcance. Se usan de vez en cuando y ahí la espera se banca.
   *
   * El resto de los rubros usa siempre la segunda, que es la de siempre.
   */
  const buscaEnServidor =
    esFarmacia(rubro) && (filtroStock === "todos" || filtroStock === "activos");

  const productos = useApi(
    () => (buscaEnServidor ? Promise.resolve([]) : api.getProductos(enPapelera)),
    [enPapelera, buscaEnServidor],
  );
  const categorias = useApi(() => api.getCategorias(false), []);
  const unidades = useApi(() => api.getUnidades(), []);
  /**
   * Sólo farmacia: el catálogo deja mirarse almacén por almacén.
   *
   * `GET /almacenes` ya trae los artículos de cada uno con su cantidad, así que
   * el filtro no cuesta una consulta por producto. En los demás rubros no se
   * pide nada: la pantalla queda exactamente como está.
   */
  const almacenes = useApi(
    () => (esFarmacia(rubro) ? api.getAlmacenes() : Promise.resolve([])),
    [rubro],
  );
  /** "" = todos los almacenes sumados, que es como se vio siempre. */
  const [almacenId, setAlmacenId] = useState("");

  const [q, setQ] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [detalle, setDetalle] = useState<Producto | null>(null);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [creando, setCreando] = useState(false);
  const [aBorrar, setABorrar] = useState<Producto | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorAccion, setErrorAccion] = useState("");

  /**
   * La búsqueda contra el servidor. El hook espera a que dejes de teclear,
   * descarta las respuestas que se cruzan y pagina — la misma mecánica de
   * "Buscar medicamento", que es donde se probó primero.
   */
  const busqueda = useBusquedaProductos({
    q,
    limite: 30,
    soloHabilitados: filtroStock === "activos",
    activo: buscaEnServidor,
  });

  /**
   * La red de seguridad de las tildes.
   *
   * El servidor busca con ILIKE, que ignora mayúsculas pero **no tildes**:
   * "losartan" no encuentra "Losartán" y "acido" no encuentra "Ácido
   * acetilsalicílico". Nadie teclea las tildes con un cliente esperando, así
   * que decir "no hay nada" ahí sería mentir.
   *
   * Cuando el servidor vuelve con cero, y sólo entonces, se trae el catálogo y
   * se busca en memoria con `contiene`, que sí las ignora. Se paga una consulta
   * en el caso raro para no pagarla nunca en el común, y se cachea mientras la
   * búsqueda siga sin dar resultados (tecleando más letras no se vuelve a
   * pedir).
   *
   * Lo correcto de verdad es que el servidor no distinga tildes (`unaccent` de
   * Postgres o una columna normalizada con índice). Mientras tanto, esto.
   */
  const servidorSinNada =
    buscaEnServidor && !!q.trim() && !busqueda.cargando && busqueda.total === 0;

  // Se trae UNA vez y queda. Sin esto, escribir "l-o-s-a-r-t-a-n" pedía el
  // catálogo entero en cada letra que no encontraba nada.
  const [catalogoTildes, setCatalogoTildes] = useState<Producto[] | null>(null);
  useEffect(() => {
    if (!servidorSinNada || catalogoTildes) return;
    let vivo = true;
    api
      .getProductos(false)
      .then((datos) => {
        if (vivo) setCatalogoTildes(datos);
      })
      // Si falla, la pantalla dice "no hay nada": es lo que ya decía el
      // servidor. No hay nada que avisar que la persona pueda arreglar.
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [servidorSinNada, catalogoTildes]);

  const porTildes = useMemo(() => {
    if (!servidorSinNada || !catalogoTildes) return [];
    return catalogoTildes.filter(
      (p) =>
        contiene(p.nombre, q) ||
        contiene(p.principioActivo, q) ||
        contiene(p.laboratorio, q) ||
        contiene(p.descripcion, q) ||
        contiene(p.codBarra, q),
    );
  }, [servidorSinNada, catalogoTildes, q]);

  const lista = productos.datos ?? [];

  // El chip de Combo se ofrece si el plan los incluye o si ya hay alguno
  // cargado de antes: filtrar por un tipo que no existe no le sirve a nadie.
  const opcionesTipo = useMemo(
    () =>
      incluye("combos") || lista.some((p) => p.tipoProducto === "COMPUESTO")
        ? OPC_TIPO
        : OPC_TIPO.filter(([k]) => k !== "COMPUESTO"),
    [incluye, lista],
  );

  const almacenesActivos = (almacenes.datos ?? []).filter((a) => a.activo);
  const almacenElegido = almacenesActivos.find((a) => String(a.id) === almacenId);

  /**
   * Cuánto hay del artículo, según el filtro puesto. Sin almacén elegido es el
   * total de siempre — que es lo único que ve un rubro que no sea farmacia,
   * porque ahí el selector no existe y `almacenId` nunca deja de estar vacío.
   */
  const stockDe = useMemo<(p: Producto) => number>(() => {
    if (!almacenElegido) return (p: Producto) => p.stockTotal;
    const porProducto = new Map<number, number>(
      (almacenElegido.articulos ?? []).map((a) => [a.id, a.stock]),
    );
    // Un almacén sólo lista lo que tiene saldo: lo que no está, está en cero.
    return (p: Producto) => porProducto.get(p.id) ?? 0;
  }, [almacenElegido]);

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return lista.filter((p) => {
      if (
        texto &&
        !contiene(p.nombre, texto) &&
        !contiene(p.descripcion, texto) &&
        !contiene(p.codBarra, texto)
      )
        return false;
      if (filtroTipo !== "todos" && p.tipoProducto !== filtroTipo) return false;

      const conStock = TIPOS[p.tipoProducto].conStock;
      if (filtroStock === "activos") return p.habilitado;
      // "Bajo stock" y "Sin stock" se leen contra el almacén elegido: con el
      // depósito puesto, "sin stock" es lo que hay que reponer AHÍ, aunque en
      // el mostrador sobre. Sin almacén elegido, `stockDe` es el total y el
      // filtro se comporta como siempre.
      const stock = stockDe(p);
      // Elaborados y combos no llevan stock: quedan fuera de esos filtros.
      if (filtroStock === "bajo")
        return conStock && stock > 0 && stock <= p.stockMinimo;
      if (filtroStock === "sin") return conStock && stock <= 0;
      // En papelera no hay sub-filtro: la lista ya viene filtrada del backend.
      return true;
    });
  }, [lista, q, filtroStock, filtroTipo, stockDe]);

  /**
   * Lo que se dibuja. En modo servidor ya viene filtrado y paginado de allá; en
   * modo catálogo es el filtrado en memoria de siempre.
   */
  const aMostrar = buscaEnServidor
    ? busqueda.items.length > 0
      ? busqueda.items
      : porTildes
    : filtrados;
  const cargando = buscaEnServidor
    ? busqueda.cargando || (servidorSinNada && !catalogoTildes)
    : productos.cargando;
  const errorCarga = buscaEnServidor ? busqueda.error : productos.error;
  /** Si hay algo cargado, para distinguir "no hay nada" de "no coincide". */
  const hayCatalogo = buscaEnServidor ? busqueda.total > 0 || !!q : lista.length > 0;

  function recargar() {
    if (buscaEnServidor) busqueda.recargar();
    else productos.recargar();
  }

  /** Devuelve al catálogo un artículo dado de baja. */
  async function restaurar(p: Producto) {
    setErrorAccion("");
    try {
      await api.restaurarProducto(p.id);
      setDetalle(null);
      recargar();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo restaurar");
    }
  }

  async function borrar() {
    if (!aBorrar || borrando) return;
    setErrorAccion("");
    setBorrando(true);
    try {
      const res = await api.eliminarProducto(aBorrar.id);
      setABorrar(null);
      setDetalle(null);
      recargar();
      if (res.archivado) {
        setErrorAccion(
          `El ${termino(rubro, "articulo")} ya tenía ventas o movimientos, así que se archivó en vez de borrarse.`,
        );
      }
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-5">
      <EncabezadoPagina
        titulo={termino(rubro, "articulos")}
        subtitulo={
          enPapelera
            ? `${lista.length} dados de baja`
            : // El catálogo muestra el stock SUMADO de todos los almacenes y el
              // formulario de movimientos el de UNO solo, así que el mismo
              // producto dice 60 acá y 0 allá. Los dos números son ciertos; sin
              // esta aclaración parece un error del sistema y alguien sale a
              // buscar una caja que sí está, pero en el otro almacén.
              `${
                buscaEnServidor && q
                  ? // Con el respaldo por tildes el total del servidor es 0 y
                    // el "de N" no diría nada: se muestra lo que se encontró.
                    busqueda.total > 0
                    ? `${aMostrar.length} de ${busqueda.total}`
                    : `${aMostrar.length} ${aMostrar.length === 1 ? "resultado" : "resultados"}`
                  : `${buscaEnServidor ? busqueda.total : lista.length} en el catálogo`
              }${
                !esFarmacia(rubro)
                  ? ""
                  : almacenElegido
                    ? ` · stock en ${almacenElegido.nombre}`
                    : " · stock total, sumando todos los almacenes"
              }`
        }
        // En la papelera no se ofrece "Nuevo": el alta cae en el catálogo y el
        // producto recién creado desaparecería de la lista que estás mirando.
        accion={
          !enPapelera && (
            <Boton icono="plus" onClick={() => setCreando(true)}>
              Nuevo
            </Boton>
          )
        }
      />

      <div className="space-y-3">
        <div className="flex gap-2">
          <Buscador
            valor={q}
            onChange={setQ}
            placeholder={
              esFarmacia(rubro)
                ? "Buscar por nombre, principio activo, laboratorio o código"
                : "Buscar por nombre, descripción o código"
            }
          />
        </div>
        {/* Con un solo almacén no hay nada que elegir: el total YA es el de
            ese local y el selector sería un chip que no hace nada. */}
        {esFarmacia(rubro) && almacenesActivos.length > 1 && (
          <Chips
            valor={almacenId}
            opciones={[
              ["", "Todos los almacenes"],
              ...almacenesActivos.map((a) => [String(a.id), a.nombre] as const),
            ]}
            onChange={setAlmacenId}
          />
        )}
        <Chips valor={filtroStock} opciones={OPC_STOCK} onChange={setFiltroStock} />
        {/* Producto / Elaborado / Combo no existe en una farmacia: no hay nada
            que se prepare al vender, así que el chip filtraba una sola opción
            contra sí misma. Y en modo servidor sólo podría filtrar la tanda que
            está en pantalla, que es peor que no estar. */}
        {!esFarmacia(rubro) && (
          <Chips valor={filtroTipo} opciones={opcionesTipo} onChange={setFiltroTipo} />
        )}
      </div>

      <ErrorMsg>{errorAccion || errorCarga}</ErrorMsg>

      {/* Sólo la búsqueda del servidor deja la tanda anterior a la vista
          mientras llega la nueva, para que la lista no parpadee con cada letra.
          Traer el catálogo es otra lista entera: pasar de "Todos" a "Dados de
          baja" dejaba los activos bajo ese chip, con el botón de Restaurar. */}
      {cargando && (!buscaEnServidor || aMostrar.length === 0) ? (
        <Cargando texto={buscaEnServidor && q ? "Buscando…" : "Cargando…"} />
      ) : aMostrar.length === 0 ? (
        <div className="card">
          <Vacio
            icono={buscaEnServidor && q ? "search" : "archive"}
            // Nombrar lo que se buscó es de farmacia. Los demás rubros dicen lo
            // de siempre (ver Productos.test.tsx): la pantalla es compartida.
            titulo={
              esFarmacia(rubro) && q
                ? `No hay nada con "${q}"`
                : hayCatalogo
                  ? "Sin resultados"
                  : `Todavía no hay ${termino(rubro, "articulos").toLowerCase()}`
            }
            texto={
              esFarmacia(rubro) && q
                ? // En farmacia la búsqueda mira también la droga y el
                  // laboratorio, así que la pista sirve de verdad.
                  buscaEnServidor
                  ? "Probá con la droga en vez de la marca, o con menos letras."
                  : "Probá con otro texto o quitá los filtros."
                : hayCatalogo
                  ? "Probá con otro texto o quitá los filtros."
                  : "Cargá el primer producto de tu catálogo."
            }
            accion={
              !hayCatalogo && (
                <Boton icono="plus" onClick={() => setCreando(true)}>
                  Nuevo {termino(rubro, "articulo")}
                </Boton>
              )
            }
          />
        </div>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {aMostrar.map((p) =>
              // La tarjeta de una farmacia no lleva ícono y pone el vencimiento
              // por delante del precio; ver `FichaMedicamento.tsx`. Cualquier otro
              // rubro sigue con la de siempre, sin enterarse.
              esFarmacia(rubro) ? (
                <TarjetaMedicamento
                  key={p.id}
                  producto={p}
                  stock={stockDe(p)}
                  onClick={() => setDetalle(p)}
                />
              ) : (
                <TarjetaProducto key={p.id} producto={p} onClick={() => setDetalle(p)} />
              ),
            )}
          </ul>

          {/* Traer la tanda siguiente. Sólo en modo servidor: en el otro ya
              está todo en pantalla. */}
          {buscaEnServidor && busqueda.hayMas && (
            <button
              onClick={busqueda.traerMas}
              disabled={busqueda.trayendoMas}
              className="w-full rounded-xl border border-dashed border-borde py-3 text-[13px] font-semibold text-texto-2 hover:bg-muted disabled:opacity-60"
            >
              {busqueda.trayendoMas
                ? "Trayendo…"
                : `Ver más (${aMostrar.length} de ${busqueda.total})`}
            </button>
          )}
        </>
      )}

      {detalle && esFarmacia(rubro) ? (
        <FichaMedicamento
          producto={detalle}
          enPapelera={enPapelera}
          onClose={() => setDetalle(null)}
          onEditar={(p) => {
            setDetalle(null);
            setEditando(p);
          }}
          onEliminar={(p) => setABorrar(p)}
          onRestaurar={restaurar}
        />
      ) : (
        <DetalleProducto
          producto={detalle}
          enPapelera={enPapelera}
          onClose={() => setDetalle(null)}
          onEditar={(p) => {
            setDetalle(null);
            setEditando(p);
          }}
          onEliminar={(p) => setABorrar(p)}
          onRestaurar={restaurar}
        />
      )}

      <FormProducto
        abierto={creando || !!editando}
        producto={editando}
        categorias={categorias.datos ?? []}
        unidades={unidades.datos ?? []}
        productos={lista}
        onClose={() => {
          setCreando(false);
          setEditando(null);
        }}
        onGuardado={() => {
          setCreando(false);
          setEditando(null);
          recargar();
        }}
      />

      <Confirmar
        abierto={!!aBorrar}
        titulo={`Eliminar ${termino(rubro, "articulo")}`}
        texto={`¿Eliminar "${aBorrar?.nombre}"? Si ya tiene ventas o movimientos se archivará en vez de borrarse.`}
        etiquetaOk="Eliminar"
        peligroso
        procesando={borrando}
        onCancel={() => setABorrar(null)}
        onOk={borrar}
      />
    </div>
  );
}

function TarjetaProducto({ producto: p, onClick }: { producto: Producto; onClick: () => void }) {
  const { rubro } = useAuth();
  const tipo = TIPOS[p.tipoProducto];
  const sinStock = tipo.conStock && p.stockTotal <= 0;
  const bajoStock = tipo.conStock && p.stockTotal > 0 && p.stockTotal <= p.stockMinimo;
  // En una farmacia el laboratorio y la forma distinguen dos artículos que se
  // llaman casi igual ("Paracetamol 500 BAGÓ" vs "… IFA"). Es más útil ahí que
  // la descripción, que casi nadie carga.
  const ficha = esFarmacia(rubro)
    ? [p.laboratorio, p.formaFarmaceutica].filter(Boolean).join(" · ")
    : "";
  const condicion = esFarmacia(rubro) ? CONDICIONES[p.condicionVenta] : null;

  return (
    <li>
      <button
        onClick={onClick}
        className="card w-full p-4 text-left transition-shadow hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <IconoProducto
            nombre={p.nombre}
            icono={p.icono}
            categoria={p.categoria?.nombre}
            size={44}
          />
          <div className="flex items-center gap-2">
            {sinStock && <Badge tono="rojo">Sin stock</Badge>}
            {bajoStock && <Badge tono="amarillo">Bajo stock</Badge>}
            {!p.habilitado && <Badge tono="gris">Inactivo</Badge>}
            <Icon name="chevronRight" size={17} color="#94A3B8" />
          </div>
        </div>

        <h3 className="mt-3 truncate text-[15px] font-bold text-texto">{p.nombre}</h3>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-texto-3">
          {ficha || p.descripcion || "Sin descripción"}
        </p>
        {condicion && (p.condicionVenta !== "LIBRE" || p.controlado) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {p.condicionVenta !== "LIBRE" && (
              <Badge tono={condicion.tono}>{condicion.corto}</Badge>
            )}
            {p.controlado && <Badge tono="rojo">Controlado</Badge>}
          </div>
        )}

        <div
          className={`mt-3 grid gap-2 rounded-xl bg-muted p-2.5 ${
            tipo.conStock ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {tipo.conStock && (
            <div>
              <p className="text-[11px] font-semibold uppercase text-texto-4">Stock</p>
              <p className="text-sm font-bold text-texto">
                {fmtNum(p.stockTotal)} {p.unidadMedida?.nombre ?? ""}
              </p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase text-texto-4">Precio</p>
            <p className="text-sm font-bold text-texto">{fmtMoney(p.precio)}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <Badge tono={tipo.tono}>{tipo.label}</Badge>
          <span className="flex items-center gap-1 text-xs text-texto-4">
            {p.categoria?.nombre ?? "Sin categoría"}
          </span>
        </div>
      </button>
    </li>
  );
}

function DetalleProducto({
  producto: p,
  enPapelera,
  onClose,
  onEditar,
  onEliminar,
  onRestaurar,
}: {
  producto: Producto | null;
  /** En la papelera el artículo no se edita: se restaura o se deja. */
  enPapelera: boolean;
  onClose: () => void;
  onEditar: (p: Producto) => void;
  onEliminar: (p: Producto) => void;
  onRestaurar: (p: Producto) => void;
}) {
  const { rubro } = useAuth();
  const [viendoCostos, setViendoCostos] = useState(false);
  if (!p) return null;
  const tipo = TIPOS[p.tipoProducto];
  const margen = p.precio > 0 ? (p.precio - p.costo) / p.precio : 0;

  return (
    <Modal
      abierto
      titulo={`Detalle del ${termino(rubro, "articulo")}`}
      subtitulo={p.nombre}
      onClose={onClose}
      acciones={
        enPapelera ? (
          <Boton icono="check" onClick={() => onRestaurar(p)}>
            Restaurar
          </Boton>
        ) : (
          <>
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
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setViendoCostos(true)}
          className="flex w-full items-center gap-2 rounded-xl border border-borde px-3.5 py-2.5 text-left text-[13px] font-semibold text-texto-2 hover:bg-muted"
        >
          <Icon name="trendingDown" size={17} />
          <span className="flex-1">Historial de costos</span>
          <Icon name="chevronRight" size={16} />
        </button>

        {viendoCostos && (
          <HistorialCostos
            productoId={p.id}
            nombre={p.nombre}
            onClose={() => setViendoCostos(false)}
          />
        )}

        <div className="flex items-center gap-3 rounded-xl bg-primary-50 p-4">
          <IconoProducto
            nombre={p.nombre}
            icono={p.icono}
            categoria={p.categoria?.nombre}
            size={56}
            className="rounded-2xl"
          />
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-texto">{p.nombre}</h3>
            <p className="text-[13px] text-texto-3">{p.descripcion || "Sin descripción"}</p>
            <Badge tono={tipo.tono} className="mt-1.5">
              {tipo.label}
            </Badge>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <Dato label="Precio de venta" valor={fmtMoney(p.precio)} />
          <Dato label="Costo" valor={fmtMoney(p.costo)} />
          <Dato label="Margen" valor={`${Math.round(margen * 100)}%`} />
          <Dato label="Categoría" valor={p.categoria?.nombre ?? "—"} />
          {tipo.conStock && (
            <>
              <Dato
                label="Stock actual"
                valor={`${fmtNum(p.stockTotal)} ${p.unidadMedida?.nombre ?? ""}`}
              />
              <Dato label="Stock mínimo" valor={fmtNum(p.stockMinimo)} />
            </>
          )}
          <Dato label="Unidad" valor={p.unidadMedida?.nombre ?? "—"} />
          <Dato label="Código de barras" valor={p.codBarra || "—"} />
        </dl>

        {esFarmacia(rubro) && (
          <div>
            <h4 className="mb-2 text-[13px] font-bold text-texto">
              Ficha farmacéutica
              {p.manejaLote && (
                <span className="ml-1.5 font-normal text-texto-3">
                  — se controla por lote y vencimiento
                </span>
              )}
            </h4>
            <dl className="grid grid-cols-2 gap-3">
              <Dato label="Principio activo" valor={p.principioActivo || "—"} />
              <Dato label="Concentración" valor={p.concentracion || "—"} />
              <Dato label="Forma" valor={p.formaFarmaceutica || "—"} />
              <Dato label="Laboratorio" valor={p.laboratorio || "—"} />
              <Dato label="Registro sanitario" valor={p.registroSanitario || "—"} />
              <Dato label="Condición de venta" valor={CONDICIONES[p.condicionVenta].label} />
            </dl>
            {p.controlado && (
              <p className="mt-2.5 rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-text">
                <strong>Medicamento controlado.</strong> Su venta se asienta en el libro
                que corresponde.
              </p>
            )}
          </div>
        )}

        {p.tipoProducto === "COMPUESTO" && (
          <div>
            <h4 className="mb-2 text-[13px] font-bold text-texto">
              Receta del combo
              <span className="ml-1.5 font-normal text-texto-3">
                — se descuenta al vender
              </span>
            </h4>
            {p.componentes.length === 0 ? (
              <p className="text-[13px] text-texto-3">Sin ingredientes cargados.</p>
            ) : (
              <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
                {p.componentes.map((c) => (
                  <li
                    key={c.ingredienteId}
                    className="flex items-center justify-between px-3.5 py-2.5"
                  >
                    <span className="text-[13px] text-texto">{c.nombre ?? `#${c.ingredienteId}`}</span>
                    <span className="text-[13px] font-bold text-texto">
                      {fmtNum(c.cantidad, 3)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-bold text-texto">{valor}</dd>
    </div>
  );
}

/**
 * Separador de bloque del formulario de farmacia. El alta de un medicamento
 * tiene dos partes que no se parecen —lo que se cobra y lo que dice el envase—
 * y sin un corte entre las dos son dieciséis campos seguidos.
 */
function Titulo({ children }: { children: ReactNode }) {
  return (
    <h4 className="border-b border-borde-soft pb-1.5 text-[11px] font-bold uppercase tracking-wide text-primary-700">
      {children}
    </h4>
  );
}

/**
 * Interruptor de sí/no.
 *
 * Es un checkbox por dentro (el teclado y el lector de pantalla lo ven como lo
 * que es); lo que cambia es que se lee encendido o apagado desde lejos. Vale la
 * pena en estos dos: "maneja lote" decide si el ingreso pide vencimiento, y
 * "controlado" si la venta se asienta en el libro del SEDES. Un tilde de 16 px
 * es poco para dos decisiones de ese peso.
 */
function Interruptor({
  titulo,
  ayuda,
  activo,
  onChange,
  peligroso,
}: {
  titulo: string;
  ayuda: string;
  activo: boolean;
  onChange: (v: boolean) => void;
  /** Lo enciende en rojo: no es una preferencia, es una obligación legal. */
  peligroso?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
        activo
          ? peligroso
            ? "border-danger/40 bg-danger-bg/40"
            : "border-primary/40 bg-primary-50/60"
          : "border-borde bg-white"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-texto">{titulo}</span>
        <span className="block text-xs text-texto-3">{ayuda}</span>
      </span>
      <input
        type="checkbox"
        checked={activo}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-100 ${
          activo ? (peligroso ? "bg-danger" : "bg-primary-boton") : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            activo ? "left-[1.375rem]" : "left-0.5"
          }`}
        />
      </span>
    </label>
  );
}

interface LineaCombo {
  ingredienteId: number;
  nombre: string;
  cantidad: number;
}

function FormProducto({
  abierto,
  producto,
  categorias,
  unidades,
  productos,
  onClose,
  onGuardado,
}: {
  abierto: boolean;
  producto: Producto | null;
  categorias: Categoria[];
  unidades: UnidadMedida[];
  productos: Producto[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  // La clave remonta el formulario al cambiar de artículo: así los estados
  // internos arrancan siempre desde el producto que se está editando.
  if (!abierto) return null;
  return (
    <FormProductoCuerpo
      key={producto?.id ?? "nuevo"}
      producto={producto}
      categorias={categorias}
      unidades={unidades}
      productos={productos}
      onClose={onClose}
      onGuardado={onGuardado}
    />
  );
}

function FormProductoCuerpo({
  producto,
  categorias,
  unidades,
  productos,
  onClose,
  onGuardado,
}: {
  producto: Producto | null;
  categorias: Categoria[];
  unidades: UnidadMedida[];
  productos: Producto[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const esEdicion = !!producto;
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? "");
  const [codBarra, setCodBarra] = useState(producto?.codBarra ?? "");
  const [tipo, setTipo] = useState<TipoProducto>(producto?.tipoProducto ?? "ALMACENABLE");
  const [precio, setPrecio] = useState(String(producto?.precio ?? ""));
  const [costo, setCosto] = useState(String(producto?.costo ?? ""));
  const [stockMinimo, setStockMinimo] = useState(String(producto?.stockMinimo ?? ""));
  const [stockInicial, setStockInicial] = useState(
    // Sólo el combo trae su stock cargado: es un dato que se corrige, no que se
    // suma. Y sólo si es > 0, para que un 0 heredado no parezca ya completado.
    producto?.tipoProducto === "COMPUESTO" && producto.stockTotal > 0
      ? String(producto.stockTotal)
      : "",
  );
  const [categoriaId, setCategoriaId] = useState(String(producto?.categoria?.id ?? ""));
  const [unidadId, setUnidadId] = useState(String(producto?.unidadMedida?.id ?? ""));
  const [habilitado, setHabilitado] = useState(producto?.habilitado ?? true);
  // Se arrastra siempre, aunque el form no lo toque: si no viajara en el PATCH,
  // cambiar el precio desde la web le borraria el icono puesto en la app.
  const [icono, setIcono] = useState<string | null>(producto?.icono ?? null);
  const [eligiendoIcono, setEligiendoIcono] = useState(false);
  const [componentes, setComponentes] = useState<LineaCombo[]>(
    () =>
      producto?.componentes.map((c) => ({
        ingredienteId: c.ingredienteId,
        nombre: c.nombre ?? `#${c.ingredienteId}`,
        cantidad: c.cantidad,
      })) ?? [],
  );
  // Ficha farmacéutica. Se carga siempre desde el producto (aunque el rubro no
  // la muestre) para que editar un artículo desde otro rubro no la borre.
  const [principioActivo, setPrincipioActivo] = useState(producto?.principioActivo ?? "");
  const [concentracion, setConcentracion] = useState(producto?.concentracion ?? "");
  const [formaFarmaceutica, setFormaFarmaceutica] = useState(
    producto?.formaFarmaceutica ?? "",
  );
  const [laboratorio, setLaboratorio] = useState(producto?.laboratorio ?? "");
  const [registroSanitario, setRegistroSanitario] = useState(
    producto?.registroSanitario ?? "",
  );
  const [condicionVenta, setCondicionVenta] = useState<CondicionVenta>(
    producto?.condicionVenta ?? "LIBRE",
  );
  const [manejaLote, setManejaLote] = useState(producto?.manejaLote ?? false);
  const [controlado, setControlado] = useState(producto?.controlado ?? false);

  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const { incluye, rubro } = useAuth();
  const conFicha = esFarmacia(rubro);

  /**
   * Laboratorios y formas que ya se usaron, para sugerir mientras se escribe.
   * Son texto libre a propósito (no hay tabla que administrar), y esto evita
   * que el mismo laboratorio termine cargado de tres maneras distintas.
   */
  const sugerencias = useMemo(() => {
    const unicos = (valores: (string | null)[]) =>
      [...new Set(valores.filter((v): v is string => !!v?.trim()))].sort();
    return {
      laboratorios: unicos(productos.map((p) => p.laboratorio)),
      formas: unicos(productos.map((p) => p.formaFarmaceutica)),
    };
  }, [productos]);
  // Sin la capacidad el negocio no arma combos: el tipo ni se ofrece. Un
  // producto que YA es combo se sigue pudiendo editar (el dato existe y
  // esconderlo lo convertiría en otra cosa al guardar).
  const conCombos = incluye("combos");
  const tiposDisponibles = (Object.keys(TIPOS) as TipoProducto[]).filter(
    (t) => t !== "COMPUESTO" || conCombos || producto?.tipoProducto === "COMPUESTO",
  );

  const esCombo = tipo === "COMPUESTO";
  const conStock = TIPOS[tipo].conStock;

  // Un combo no puede llevarse a sí mismo ni repetir un ingrediente.
  const candidatos = productos.filter(
    (p) => p.id !== producto?.id && !componentes.some((c) => c.ingredienteId === p.id),
  );

  function agregarComponente(id: number) {
    const p = productos.find((x) => x.id === id);
    if (!p) return;
    setComponentes((cs) => [...cs, { ingredienteId: p.id, nombre: p.nombre, cantidad: 1 }]);
  }

  async function guardar() {
    setError("");

    if (!nombre.trim()) return setError("Poné un nombre.");
    const precioNum = Number(precio);
    if (!Number.isFinite(precioNum) || precioNum < 0)
      return setError("El precio tiene que ser un número válido.");
    if (!unidadId) return setError("Elegí una unidad de medida.");
    // El backend rechaza un combo sin receta: sin ingredientes no sabría qué
    // descontar al venderlo.
    if (esCombo && componentes.length === 0)
      return setError("Un combo necesita al menos un ingrediente en su receta.");
    const sinCantidad = componentes.find((c) => !(c.cantidad > 0));
    if (sinCantidad)
      return setError(`Poné cuánto lleva "${sinCantidad.nombre}" en la receta.`);

    const input: ProductoInput = {
      nombre: nombre.trim(),
      precio: precioNum,
      unidadMedidaId: Number(unidadId),
      tipoProducto: tipo,
      costo: costo === "" ? 0 : Number(costo),
      stockMinimo: stockMinimo === "" ? 0 : Number(stockMinimo),
      descripcion: descripcion.trim(),
      // Un código vacío se omite en vez de mandarse como "": el índice único
      // del backend considera "" un valor, así que el segundo producto sin
      // código chocaba con un 409 que no decía qué campo lo causaba.
      ...(codBarra.trim() ? { codBarra: codBarra.trim() } : {}),
      habilitado,
      // Viaja siempre, también vacío: es lo que permite QUITAR el ícono. Y va
      // aunque el usuario no lo haya tocado, con el valor que ya tenía, para
      // que editar el precio desde la web no borre lo elegido en la app.
      icono: icono ?? "",
      ...(categoriaId ? { categoriaId: Number(categoriaId) } : {}),
      ...(esCombo
        ? {
            componentes: componentes.map((c) => ({
              ingredienteId: c.ingredienteId,
              cantidad: c.cantidad,
            })),
          }
        : {}),
      // En un producto el stock inicial sólo tiene sentido al crear: después se
      // mueve con entradas y salidas. En un COMBO es al revés — no pasa por
      // Movimientos, así que editar el artículo es la única forma de decir
      // cuántos hay hoy, y el campo tiene que viajar también al editar.
      ...((esCombo || !esEdicion) && conStock && stockInicial !== ""
        ? { stockInicial: Number(stockInicial) }
        : {}),
      // La ficha viaja sólo donde el formulario la muestra. En otro rubro los
      // campos ni se dibujan, y mandarlos vacíos borraría lo que alguien haya
      // cargado desde una farmacia con el mismo catálogo.
      ...(conFicha
        ? {
            principioActivo: principioActivo.trim(),
            concentracion: concentracion.trim(),
            formaFarmaceutica: formaFarmaceutica.trim(),
            laboratorio: laboratorio.trim(),
            registroSanitario: registroSanitario.trim(),
            condicionVenta,
            manejaLote,
            controlado,
          }
        : {}),
    };

    setGuardando(true);
    try {
      if (producto) await api.actualizarProducto(producto.id, input);
      else await api.crearProducto(input);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={`${esEdicion ? "Editar" : "Nuevo"} ${termino(rubro, "articulo")}`}
      subtitulo={
        esEdicion
          ? producto.nombre
          : conFicha
            ? "Datos generales y ficha farmacéutica"
            : "Cargá los datos del producto"
      }
      onClose={onClose}
      /* Más ancho SÓLO en farmacia: acá el formulario son dos bloques con
         catorce campos, y a 512 px las columnas quedan tan angostas que
         "Registro sanitario" no entra en su propia etiqueta. El de los demás
         rubros tiene la mitad de campos y se queda como estaba. */
      ancho={conFicha ? "max-w-2xl" : undefined}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton icono="save" onClick={guardar} disabled={guardando}>
            {guardando
              ? "Guardando…"
              : conFicha
                ? `Guardar ${termino(rubro, "articulo")}`
                : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        {conFicha ? (
          // En una farmacia el nombre comercial y la concentración se leen
          // juntos —"Paracetamol" a secas no identifica nada— y la descripción
          // libre no se usa: la reemplaza la ficha farmacéutica de abajo. El
          // valor que ya tuviera igual viaja al guardar, así que editar desde
          // acá no le borra nada a nadie.
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nombre comercial">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
            </Campo>
            <Campo label="Concentración">
              <Input
                value={concentracion}
                onChange={(e) => setConcentracion(e.target.value)}
                placeholder="500 mg"
              />
            </Campo>
          </div>
        ) : (
          <>
            <Campo label="Nombre">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
            </Campo>

            <Campo label="Descripción">
              <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </Campo>
          </>
        )}

        {conFicha && <Titulo>Datos de venta e inventario</Titulo>}

        {/* Tres columnas en farmacia y dos en el resto: el formulario del rubro
            ya es largo (le sigue la ficha farmacéutica entera) y "qué es y a
            cuánto sale" es una sola decisión. Los campos son los MISMOS: lo
            único que cambia es cómo se acomodan. */}
        <div className={`grid gap-3 ${conFicha ? "sm:grid-cols-3" : ""}`}>
          <Campo
            label="Tipo"
            hint={
              esCombo
                ? "El combo descuenta los ingredientes de su receta al venderse."
                : conStock
                  ? "Se le lleva stock en los almacenes."
                  : "Se prepara al vender: no lleva stock propio."
            }
          >
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoProducto)}>
              {tiposDisponibles.map((t) => (
                <option key={t} value={t}>
                  {TIPOS[t].label}
                </option>
              ))}
            </Select>
          </Campo>

          {conFicha && (
            <>
              <Campo label="Precio de venta">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                />
              </Campo>
              <Campo label="Costo">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={costo}
                  onChange={(e) => setCosto(e.target.value)}
                />
              </Campo>
            </>
          )}
        </div>

        {!conFicha && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Precio de venta">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
              />
            </Campo>
            <Campo label="Costo">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
              />
            </Campo>
          </div>
        )}

        <div className={`grid gap-3 ${conFicha && conStock ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <Campo label="Categoría">
            <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label={conFicha ? "Unidad" : "Unidad de medida"}>
            <Select value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
              <option value="">Elegí una</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </Select>
          </Campo>
          {conFicha && conStock && (
            <Campo label="Stock mínimo" hint="Avisa cuando baje de acá">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={stockMinimo}
                onChange={(e) => setStockMinimo(e.target.value)}
              />
            </Campo>
          )}
        </div>

        {conStock && (
          <div className={`grid gap-3 ${conFicha ? "" : "sm:grid-cols-2"}`}>
            {!conFicha && (
              <Campo label="Stock mínimo" hint="Avisa cuando baje de acá">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={stockMinimo}
                  onChange={(e) => setStockMinimo(e.target.value)}
                />
              </Campo>
            )}
            {(esCombo || !esEdicion) && (
              <Campo
                label={esCombo ? "Stock del combo" : "Stock inicial"}
                hint={
                  esCombo
                    ? "Cuántos hay para vender hoy"
                    : conFicha
                      ? "Se carga como una entrada en Movimientos"
                      : "Se carga como entrada"
                }
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={stockInicial}
                  onChange={(e) => setStockInicial(e.target.value)}
                />
              </Campo>
            )}
          </div>
        )}

        {!conFicha && (
          <Campo label="Código de barras">
            <Input value={codBarra} onChange={(e) => setCodBarra(e.target.value)} />
          </Campo>
        )}

        {conFicha && (
          <>
            <Titulo>Ficha farmacéutica</Titulo>
            <p className="-mt-2 text-xs text-texto-3">
              Todo opcional: un pañal o una mamadera no la necesitan.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Principio activo" hint="La droga: por acá lo buscan">
                <Input
                  value={principioActivo}
                  onChange={(e) => setPrincipioActivo(e.target.value)}
                  placeholder="Paracetamol"
                />
              </Campo>
              <Campo label="Forma farmacéutica">
                <Input
                  list="formas-farmaceuticas"
                  value={formaFarmaceutica}
                  onChange={(e) => setFormaFarmaceutica(e.target.value)}
                  placeholder="Comprimido"
                />
                <datalist id="formas-farmaceuticas">
                  {sugerencias.formas.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </Campo>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Laboratorio">
                <Input
                  list="laboratorios"
                  value={laboratorio}
                  onChange={(e) => setLaboratorio(e.target.value)}
                  placeholder="BAGÓ"
                />
                <datalist id="laboratorios">
                  {sugerencias.laboratorios.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </Campo>
              <Campo label="Registro sanitario" hint="Lo pide el inspector">
                <Input
                  value={registroSanitario}
                  onChange={(e) => setRegistroSanitario(e.target.value)}
                  placeholder="II-12345/2024"
                />
              </Campo>
            </div>

            {/* Cuatro chips y no un desplegable: son cuatro, se leen de un
                vistazo y el color ya significa algo en el resto de la app. Con
                un select hay que abrirlo para saber qué está elegido. */}
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">
                Condición de venta
              </span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(CONDICIONES) as CondicionVenta[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCondicionVenta(c)}
                    aria-pressed={condicionVenta === c}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                      condicionVenta === c
                        ? "bg-primary-boton text-white"
                        : "border border-borde bg-white text-texto-2 hover:bg-muted"
                    }`}
                  >
                    {CONDICIONES[c].corto}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Interruptor
                titulo="Maneja lote y vencimiento"
                ayuda="Pide lote y fecha al ingresar"
                activo={manejaLote}
                onChange={setManejaLote}
              />
              <Interruptor
                titulo="Medicamento controlado"
                ayuda="Psicotrópico o estupefaciente: va al libro"
                activo={controlado}
                onChange={setControlado}
                peligroso
              />
            </div>

            <Campo label="Código de barras">
              <div className="flex gap-2">
                <Input
                  value={codBarra}
                  onChange={(e) => setCodBarra(e.target.value)}
                  className="flex-1"
                />
                {/* No pide cámara ni permisos: devuelve el foco al campo. El
                    lector USB del mostrador escribe como un teclado, así que
                    "escanear" es literalmente eso. Ver `CampoBusqueda`. */}
                <Boton
                  variante="ghost"
                  icono="barcode"
                  type="button"
                  onClick={(e) => {
                    const campo = (e.currentTarget.previousElementSibling ??
                      null) as HTMLInputElement | null;
                    campo?.focus();
                  }}
                >
                  Escanear
                </Boton>
              </div>
            </Campo>
          </>
        )}

        {/* El ícono no se ofrece en una farmacia: su punto de venta entra por
            el buscador y no por una grilla, así que ese dibujo no se ve en
            ningún lado y elegirlo sería trabajo para nada. El valor que ya
            tuviera igual viaja en el guardado, para no pisar lo que alguien
            haya elegido desde otro rubro o desde la app. */}
        {!conFicha && (
          <Campo
            label="Ícono"
            hint="Es lo que ve el cajero en el punto de venta. Sin ícono se muestran las iniciales."
          >
            <button
              type="button"
              onClick={() => setEligiendoIcono(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-borde bg-white p-2.5 text-left hover:bg-muted"
            >
              <IconoProducto
                nombre={nombre || "?"}
                icono={icono}
                categoria={categorias.find((c) => String(c.id) === categoriaId)?.nombre}
                size={44}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-texto">
                  {iconoPorLlave(icono)?.etiqueta ?? "Sin ícono"}
                </span>
                <span className="block text-xs text-texto-3">Tocá para elegir</span>
              </span>
              <Icon name="chevronRight" size={18} />
            </button>
          </Campo>
        )}

        {eligiendoIcono && (
          <SelectorIcono
            actual={icono}
            onElegir={(llave) => {
              setIcono(llave);
              setEligiendoIcono(false);
            }}
            onCerrar={() => setEligiendoIcono(false)}
          />
        )}

        {esCombo && (
          <div className="rounded-xl border border-borde p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[13px] font-bold text-texto">Receta del combo</h4>
              <span className="text-xs text-texto-3">
                {componentes.length} {componentes.length === 1 ? "ingrediente" : "ingredientes"}
              </span>
            </div>

            {componentes.length === 0 ? (
              <p className="py-2 text-[13px] text-texto-3">
                Agregá los productos que consume este combo.
              </p>
            ) : (
              <ul className="mb-3 space-y-2">
                {componentes.map((c, i) => (
                  <li key={c.ingredienteId} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-texto">
                      {c.nombre}
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      min="0.001"
                      value={String(c.cantidad)}
                      onChange={(e) =>
                        setComponentes((cs) =>
                          cs.map((x, j) =>
                            j === i ? { ...x, cantidad: Number(e.target.value) } : x,
                          ),
                        )
                      }
                      className="w-24"
                    />
                    <button
                      onClick={() => setComponentes((cs) => cs.filter((_, j) => j !== i))}
                      aria-label={`Quitar ${c.nombre}`}
                      className="rounded-lg p-1.5 text-danger-text hover:bg-danger-bg"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Select
              value=""
              onChange={(e) => e.target.value && agregarComponente(Number(e.target.value))}
            >
              <option value="">+ Agregar ingrediente…</option>
              {candidatos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>
        )}

        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={habilitado}
            onChange={(e) => setHabilitado(e.target.checked)}
            className="h-4 w-4 rounded border-borde accent-primary"
          />
          <span className="text-sm text-texto-2">
            Habilitado
            <span className="ml-1 text-texto-4">— si no, no aparece en el punto de venta</span>
          </span>
        </label>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

/**
 * Grilla para elegir el ícono del artículo. Port de `SeleccionarIconoDialog`
 * (Android): las mismas imágenes y las mismas llaves, para que el catálogo se
 * vea igual en la tablet y en la web.
 *
 * "Sin ícono" es una opción explícita y no un botón de borrar escondido: es la
 * forma de volver al monograma, y el cajero tiene que poder encontrarla.
 */
function SelectorIcono({
  actual,
  onElegir,
  onCerrar,
}: {
  actual: string | null;
  onElegir: (llave: string | null) => void;
  onCerrar: () => void;
}) {
  return (
    <Modal abierto titulo="Elegí un ícono" onClose={onCerrar} ancho="max-w-lg">
      <div className="space-y-3 p-4">
        <button
          type="button"
          onClick={() => onElegir(null)}
          className={[
            "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
            actual === null
              ? "border-primary bg-primary-50"
              : "border-borde hover:bg-muted",
          ].join(" ")}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-texto-3">
            <Icon name="close" size={18} />
          </span>
          <span className="text-[13px] font-semibold text-texto">
            Sin ícono
            <span className="block text-xs font-normal text-texto-3">
              Se muestran las iniciales del nombre
            </span>
          </span>
        </button>

        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {ICONOS_ARTICULO.map((ic) => (
            <li key={ic.llave}>
              <button
                type="button"
                onClick={() => onElegir(ic.llave)}
                title={ic.etiqueta}
                className={[
                  "flex w-full flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-colors",
                  actual === ic.llave
                    ? "border-primary bg-primary-50"
                    : "border-borde hover:bg-muted",
                ].join(" ")}
              >
                <img
                  src={ic.src}
                  alt=""
                  width={52}
                  height={52}
                  loading="lazy"
                  className="h-[52px] w-[52px] object-contain"
                />
                <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-texto-2">
                  {ic.etiqueta}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
