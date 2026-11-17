import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { contiene } from "../../lib/texto";
import { esFarmacia } from "../../lib/rubro";
import CatalogoVenta from "../farmacia/CatalogoVenta";
import { useLotesDelCarrito } from "../farmacia/lotesVenta";
import { ChipsCondicion } from "../farmacia/piezas";
import { concentracionAparte, pideConfirmacion } from "../farmacia/medicamento";
import { CantidadVenta, LoteEnLaVenta, RecetaEnLaVenta } from "../farmacia/RenglonVenta";
import { useVentaFarmacia, type VentaFarmacia } from "../farmacia/ventaFarmacia";
import { Icon } from "../../components/Icon";
import IconoProducto from "../../components/IconoProducto";
import { Badge, Boton, Confirmar, Input, Modal, Vacio } from "../../components/ui";
import { fmtCantidad, fmtMoney, fmtNum } from "../../lib/format";
import { colorDePlataforma } from "../../lib/pedidosPlataforma/marca";
import { NOMBRE_PLATAFORMA, type Plataforma } from "../../lib/pedidosPlataforma/tipos";
import { useAuth } from "../../store/AuthContext";
import type { Categoria, Consumo, FormaPago, LotesDelArticulo, PagoInput, Producto } from "../../types";
import type { PropinaInput } from "../../lib/belleza/apiExtras";
import type { ProfesionalCobro } from "./belleza/ExtrasCobro";
import PantallaCobro from "./PantallaCobro";
import { aplicarOrden, guardarOrden, leerOrden, reordenarVisibles } from "./ordenPos";
import { claveDeLinea, controlaStock, topeStock, type Carrito, type ClaveLinea, type LineaCarrito } from "./useCarrito";
import { gruposDelProducto, textoIncluye } from "../../lib/agregados/calculo";
import type { CatalogoAgregados } from "../../lib/agregados/tipos";
import HojaAgregados from "./HojaAgregados";
import type { ProfesionalDeLinea } from "../../lib/agenda/ventaDirecta";
import { useArrastreGrilla } from "./useArrastreGrilla";
import { useAgotadosHoy } from "../../lib/menuDigital/useAgotadosHoy";
import { tienePermiso } from "../../lib/permisos";
import HojaPausa, { textoVenderPausado } from "./HojaPausa";
import { usePausados } from "./usePausados";
import { configPosDe, normalizarConfigPos, ordenarCategorias } from "../../lib/configPos";
import { useCoincideMedia } from "../../lib/useCoincideMedia";
import VistaColumnas from "./VistaColumnas";

const TODAS = "__todas__";
/** El chip «Pausados (N)»: filtra la grilla a los pausados para reactivarlos de un toque. */
const PAUSADOS = "__pausados__";

const idDe = (p: Producto) => p.id;

export default function PantallaVenta({
  productos,
  categorias,
  carrito,
  onCobrar,
  cabecera,
  sucursalId,
  descuentos,
  bloqueoCobro,
  profesionales,
  lineasExtra,
  plataformas,
  modificacion,
  catalogoAgregados,
  cobro,
}: {
  productos: Producto[];
  categorias: Categoria[];
  carrito: Carrito;
  onCobrar: () => void;
  /**
   * El cobro en la misma pantalla (Configuración › Punto de venta, 16-nov):
   * en la columna del carrito, donde va «Cobrar», el medio de pago, el
   * efectivo y «Confirmar cobro». Lo arma el POS sólo cuando vale (el ajuste,
   * pantalla ancha, ni cita ni mesa); sin esto, «Cobrar» lleva a la pantalla de
   * cobro, como siempre.
   */
  cobro?: CobroEnLaVenta;
  /**
   * Se está modificando una venta ya cobrada (`ModificarVenta`, 15-nov): el
   * carrito es el de esa venta y el pie no dice "Cobrar" sino lo que pasa con
   * la diferencia. Sin esto —vender, que es lo de siempre— nada cambia.
   */
  modificacion?: ModoModificacion;
  /**
   * Por qué todavía no se puede cobrar (el botón queda apagado y se dice). Hoy
   * sólo lo usa el paquete de sesiones sin cliente (QA S2-07); sin esto el
   * POS es el de siempre.
   */
  bloqueoCobro?: string | null;
  cabecera?: React.ReactNode;
  /** La sucursal de la caja: de ahí salen el stock y la ubicación (farmacia). */
  sucursalId?: number | null;
  /**
   * Cupones y promociones (PLAN-CRM-Y-PROMOCIONES): el total neto y los
   * renglones de descuento. Sin esto —todo negocio sin `promociones`— el
   * carrito es el de siempre.
   */
  descuentos?: ExtraDescuentos;
  /**
   * Belleza con agenda (QA PER-07b): quién atendió cada línea, dicho en la
   * línea y cambiable ahí. Sin esto —Omar, la farmacia, cobrar una cita— el
   * carrito es el de siempre.
   */
  profesionales?: ProfesionalesDelCarrito;
  /**
   * Renglones que no son productos del catálogo y van arriba en el carrito:
   * las cuotas de un instituto (E9), que viajan aparte porque comparten el
   * producto de su carrera. Su monto ya viene sumado en `carrito`. Sin esto
   * —todos los demás rubros— el carrito es el de siempre.
   */
  lineasExtra?: React.ReactNode;
  /**
   * Pedidos de Yango y PedidosYa (PLAN-PEDIDOS-PLATAFORMA §5): un botón por
   * cada plataforma que este usuario puede cargar, junto a «Cobrar». Sin esto
   * —casi todos los negocios— el carrito es el de siempre.
   */
  plataformas?: { disponibles: Plataforma[]; onElegir: (p: Plataforma) => void };
  /**
   * Los toppings del local (PLAN-AGREGADOS §7.4): con ellos, un producto que
   * lleva grupo dice «Incluye 2 toppings» y al tocarlo abre su hoja. Sin esto
   * —el ajuste apagado, que es casi todo negocio— el POS es el de siempre.
   */
  catalogoAgregados?: CatalogoAgregados | null;
}) {
  const { negocio, usuario, rubro } = useAuth();
  /**
   * Cómo se ve el catálogo (Configuración › Punto de venta, 16-nov). Lo de
   * fábrica es el POS de siempre. Modificar una venta ya cobrada no lo toma: es
   * otra tarea, con su propio pie, y se hace como siempre. La farmacia tampoco
   * (`configPosDe` ya le da lo de fábrica: arma su catálogo aparte).
   */
  const conAjustes = !modificacion;
  const config = useMemo(
    () => (conAjustes ? configPosDe(negocio) : normalizarConfigPos(null)),
    [conAjustes, negocio],
  );
  // La lista en columnas es para pantalla grande: en el celular se trabaja con
  // las tarjetas de siempre (con su arrastre), diga lo que diga el ajuste.
  const pantallaParaColumnas = useCoincideMedia("(min-width: 768px)");
  const enColumnas = config.vista === "COLUMNAS" && pantallaParaColumnas;
  /** Las categorías en el orden del dueño: el de los chips y el de las columnas. */
  const categoriasPos = useMemo(
    () => ordenarCategorias(categorias, config.ordenCategorias),
    [categorias, config.ordenCategorias],
  );
  /**
   * Se está registrando el cobro incrustado: el catálogo y el carrito quedan
   * quietos hasta que vuelva. La venta ya salió con lo que había; un producto
   * tocado en ese momento entraba al carrito y se perdía al vaciarse después
   * del cobro, sin que nadie lo cobrara. (Como pantalla aparte no pasa: el
   * catálogo no está a la vista mientras se cobra.)
   */
  const quieto = !!cobro?.enviando && !modificacion && !esFarmacia(rubro);
  const [q, setQ] = useState("");
  const [catElegida, setCat] = useState<string>(TODAS);
  // Sin la fila de chips no hay cómo elegir otra cosa que «Todos»: si el ajuste
  // se apagó con una categoría elegida, no queda filtrando a escondidas.
  const cat = config.filtros ? catElegida : TODAS;
  // En móvil el carrito es una hoja que se abre; en escritorio es una columna
  // siempre visible, así que este estado sólo pesa abajo de lg.
  const [carritoAbierto, setCarritoAbierto] = useState(false);

  // Orden en que ESTE cajero acomodó la grilla. Se lee una vez al abrir el POS
  // y se reescribe cada vez que suelta una card (igual que en Android).
  const alias = negocio?.alias;
  const username = usuario?.username;
  const [orden, setOrden] = useState<number[]>(() => leerOrden(alias, username));

  // Si cambia el usuario (otro cajero entra en la misma máquina) hay que releer:
  // el orden es de cada uno.
  useEffect(() => {
    setOrden(leerOrden(alias, username));
  }, [alias, username]);

  /** El catálogo del backend, ya en el orden del cajero. */
  const ordenados = useMemo(
    () => aplicarOrden(productos, orden, idDe),
    [productos, orden],
  );

  /**
   * Lo PAUSADO en el local de la caja (PLAN-ELGANADERO-16NOV §4.1): no se pide
   * por la página y acá sale en gris. Pausar y reactivar piden `productos.pausar`.
   */
  const pausados = usePausados(sucursalId, !esFarmacia(rubro));
  const puedePausar = tienePermiso(usuario, "productos.pausar") && !esFarmacia(rubro);
  const [hojaPausa, setHojaPausa] = useState<Producto | null>(null);
  const [venderPausado, setVenderPausado] = useState<Producto | null>(null);
  const cantidadPausados = useMemo(
    () => ordenados.filter((p) => p.habilitado && pausados.ids.has(p.id)).length,
    [ordenados, pausados.ids],
  );
  // Sin pausados no hay qué filtrar: se vuelve a «Todos» (se reactivó el último).
  useEffect(() => {
    if (cat === PAUSADOS && cantidadPausados === 0) setCat(TODAS);
  }, [cat, cantidadPausados]);

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return ordenados.filter((p) => {
      if (!p.habilitado) return false;
      if (cat === PAUSADOS) {
        if (!pausados.ids.has(p.id)) return false;
      } else if (cat !== TODAS && String(p.categoria?.id ?? "") !== cat) return false;
      if (!texto) return true;
      // Ignora tildes: el cajero teclea "cafe" y el catálogo dice "Café".
      return (
        contiene(p.nombre, texto) ||
        contiene(p.codBarra, texto) ||
        contiene(p.categoria?.nombre, texto)
      );
    });
  }, [ordenados, q, cat, pausados.ids]);

  /**
   * Guarda el orden que quedó en pantalla tras soltar una card.
   *
   * La grilla puede estar filtrada, así que sólo se reasignan las posiciones
   * que ya ocupaban los visibles: mover algo dentro de "Pollos" no reacomoda el
   * resto del catálogo. Si el catálogo se recargó mientras se arrastraba,
   * `reordenarVisibles` devuelve null y no se guarda nada — el próximo
   * movimiento lo deja bien.
   */
  const alReordenar = useCallback(
    (idsVisibles: number[]) => {
      const reordenado = reordenarVisibles(ordenados, idsVisibles, idDe);
      if (!reordenado) return;
      const nuevo = reordenado.map(idDe);
      setOrden(nuevo);
      guardarOrden(alias, username, nuevo);
    },
    [ordenados, alias, username],
  );

  const idsFiltrados = useMemo(() => filtrados.map(idDe), [filtrados]);
  /** Lo que scrollea la grilla: se desplaza sola al llevar una card a su borde. */
  const grillaRef = useRef<HTMLDivElement>(null);
  const arrastre = useArrastreGrilla({
    ids: idsFiltrados,
    onReordenar: alReordenar,
    // Con el carrito abierto en móvil la grilla está tapada: no hay nada que
    // arrastrar y el gesto sólo estorbaría al scroll de la hoja. En la vista
    // en columnas tampoco: el orden de las columnas es el del dueño y dentro de
    // cada una manda el que el cajero armó en las tarjetas, así que ahí no se
    // arrastra nada.
    activo: !carritoAbierto && !enColumnas,
    contenedor: grillaRef,
  });

  /** Lo que se pinta: durante el arrastre manda el orden en vuelo. */
  /** Cuánto hay de cada producto en el carrito: lo lee la grilla. */
  const enCarrito = useMemo(() => {
    // Suma: el mismo vaso puede estar en dos líneas con toppings distintos.
    const m = new Map<number, number>();
    for (const l of carrito.lineas) m.set(l.producto.id, (m.get(l.producto.id) ?? 0) + l.cantidad);
    return m;
  }, [carrito.lineas]);

  /**
   * La hoja de toppings: el producto que se está armando y, si se edita una
   * línea del carrito, su clave y lo que ya tenía elegido.
   */
  const [hojaAgregados, setHojaAgregados] = useState<{
    producto: Producto;
    clave?: ClaveLinea;
    inicial?: LineaCarrito["agregados"];
  } | null>(null);
  /** Suma el producto al carrito: con grupo de toppings abre su hoja, sin él entra directo. */
  const pedirAgregar = (p: Producto) => {
    if (quieto) return;
    if (gruposDelProducto(catalogoAgregados, p.id).length > 0) setHojaAgregados({ producto: p });
    else carrito.agregar(p);
  };
  /**
   * Tocar un producto, en la tarjeta o en la fila de las columnas. Un pausado
   * no está en la página pero la caja lo puede tener: pregunta antes de
   * agregarlo. Ya en el carrito (ya dijo que sí) los toques siguientes suman
   * sin volver a preguntar.
   */
  const tocarProducto = (p: Producto) => {
    if (quieto) return;
    if (pausados.ids.has(p.id) && (enCarrito.get(p.id) ?? 0) === 0) setVenderPausado(p);
    else pedirAgregar(p);
  };
  /** El «−» de la tarjeta baja la última línea de ese producto (puede haber varias con toppings). */
  const quitarUna = (p: Producto) => {
    if (quieto) return;
    const suyas = carrito.lineas.filter((l) => l.producto.id === p.id);
    const ultima = suyas[suyas.length - 1];
    if (ultima) carrito.setCantidad(claveDeLinea(ultima), ultima.cantidad - 1);
  };
  /** Lo marcado agotado hoy en el Menú digital EN ESTE LOCAL (vacío sin ese extra). */
  const agotadosHoy = useAgotadosHoy(sucursalId);

  const visibles = useMemo(() => {
    const porId = new Map(filtrados.map((p) => [p.id, p]));
    return arrastre.orden.map((id) => porId.get(id)).filter((p): p is Producto => !!p);
  }, [filtrados, arrastre.orden]);

  /**
   * Notas de línea escritas y todavía sin confirmar, por producto.
   *
   * La nota pasa al carrito con Enter, con el ✓ o al salir del campo; hasta
   * entonces vive en la fila. Cobrar desmonta esta pantalla, y quien escribía
   * "sin cebolla" y tocaba Cobrar directo mandaba la venta sin la nota y sin
   * ningún aviso (BUG-pos-venta-1); en el celular pasaba lo mismo al cerrar la
   * hoja del carrito. Salir del campo ya la guarda, pero no se apuesta a eso:
   * antes de cobrar o de cerrar la hoja se guarda lo que haya quedado escrito,
   * como `confirmarNotasAbiertas` en la app.
   *
   * Un ref y no estado: es lo tecleado letra por letra y no hay nada que
   * redibujar por eso.
   */
  const notasAbiertas = useRef(new Map<ClaveLinea, string>());
  const confirmarNotasAbiertas = () => {
    for (const [id, nota] of notasAbiertas.current) carrito.setNota(id, nota.trim());
    notasAbiertas.current.clear();
  };
  const cerrarCarrito = () => {
    confirmarNotasAbiertas();
    setCarritoAbierto(false);
  };

  /**
   * Confirmar el cobro incrustado con una nota todavía en el campo («sin
   * cebolla» tecleado y, sin salir, Confirmar): guardar la nota es un cambio
   * de estado del carrito, y la venta que se mandara en ese mismo toque se
   * armaría con las líneas de antes, sin la nota. Como pantalla aparte no pasa
   * porque Cobrar cambia de pantalla y se confirma en otro toque. Así que se
   * guarda la nota y el cobro sale recién en el próximo dibujo, con el carrito
   * ya al día (y con el mismo `cobrar` de siempre, que es el que hace valer la
   * idempotencia).
   */
  // Lo que se pasó a «Confirmar» tal cual (con o sin el `extra` de las
  // propinas), para que el POS lo reciba igual que sin la nota.
  const [cobroPendiente, setCobroPendiente] = useState<Parameters<CobroEnLaVenta["onConfirmar"]> | null>(null);
  useEffect(() => {
    if (!cobroPendiente || !cobro) return;
    setCobroPendiente(null);
    cobro.onConfirmar(...cobroPendiente);
  }, [cobroPendiente, cobro]);
  // Ni modificando una venta (su pie dice qué pasa con la diferencia) ni en la
  // farmacia (la receta se pide al tocar «Cobrar»): ahí, «Cobrar» de siempre
  // aunque llegue el cobro. El POS ya no lo manda en esos casos; esto lo asegura.
  const cobroDelCarrito: CobroEnLaVenta | undefined =
    cobro && !modificacion && !esFarmacia(rubro)
      ? {
          ...cobro,
          onConfirmar: (...lo) => {
            if (notasAbiertas.current.size === 0) return cobro.onConfirmar(...lo);
            confirmarNotasAbiertas();
            setCobroPendiente(lo);
          },
          // El fiado se arma en su pantalla, después: alcanza con guardar la nota antes de ir.
          onCredito: cobro.onCredito
            ? (extra) => {
                confirmarNotasAbiertas();
                cobro.onCredito?.(extra);
              }
            : undefined,
        }
      : undefined;

  /**
   * El carrito: en la columna de la derecha (desde lg) y en la hoja del
   * celular. El cobro incrustado va sólo en la columna: en la hoja nunca
   * corresponde (es pantalla angosta), y así un carrito que quedó abierto al
   * agrandar la ventana no dibuja un segundo cobro escondido.
   */
  const panelCarrito = (conCobro: boolean) => (
    <PanelCarrito
      cobro={conCobro ? cobroDelCarrito : undefined}
      quieto={conCobro && quieto}
      carrito={carrito}
      sucursalId={sucursalId}
      descuentos={descuentos}
      bloqueoCobro={bloqueoCobro}
      profesionales={profesionales}
      lineasExtra={lineasExtra}
      modificacion={modificacion}
      notasAbiertas={notasAbiertas}
      onEditarAgregados={
        catalogoAgregados?.activo
          ? (l) => setHojaAgregados({ producto: l.producto, clave: claveDeLinea(l), inicial: l.agregados })
          : undefined
      }
      plataformas={
        plataformas && plataformas.disponibles.length > 0
          ? {
              disponibles: plataformas.disponibles,
              // Igual que cobrar: la nota que se estaba escribiendo se confirma
              // antes de salir del carrito.
              onElegir: (p) => {
                if (quieto) return;
                confirmarNotasAbiertas();
                setCarritoAbierto(false);
                plataformas.onElegir(p);
              },
            }
          : undefined
      }
      onCobrar={() => {
        confirmarNotasAbiertas();
        setCarritoAbierto(false);
        onCobrar();
      }}
      onCerrar={cerrarCarrito}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Columna del catálogo */}
      {/* Quieto mientras se registra el cobro incrustado (ver `quieto`): sin
          toques ni foco. Se nota recién si tarda (el apagado arranca a los
          200 ms), así un cobro rápido no hace parpadear la pantalla. */}
      <div
        inert={quieto}
        aria-busy={quieto || undefined}
        className={`flex min-h-0 min-w-0 flex-1 flex-col${quieto ? " opacity-80 transition-opacity delay-200 duration-200" : ""}`}
      >
        {cabecera}

        {/* En una farmacia el catálogo se pide al servidor de a tandas y por
            categoría (son 2.000 cajas, no 40 productos), y agregar pasa por la
            venta de la farmacia, que pregunta por la receta. El carrito y todo
            lo que sigue no cambian. */}
        {esFarmacia(rubro) ? (
          <CatalogoVenta
            categorias={categorias}
            enCarrito={enCarrito}
            sucursalId={sucursalId}
          />
        ) : (
          <>
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

          {/* Sin los filtros (Configuración › Punto de venta) no hay fila de
              chips: se ven todos y se busca con el buscador. */}
          {config.filtros && (
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            <ChipCat activo={cat === TODAS} onClick={() => setCat(TODAS)}>
              Todos
            </ChipCat>
            {categoriasPos.map((c) => (
              <ChipCat
                key={c.id}
                activo={cat === String(c.id)}
                onClick={() => setCat(String(c.id))}
              >
                {c.nombre}
              </ChipCat>
            ))}
            {cantidadPausados > 0 && (
              <ChipCat activo={cat === PAUSADOS} onClick={() => setCat(PAUSADOS)}>
                Pausados ({cantidadPausados})
              </ChipCat>
            )}
          </div>
          )}
        </div>

        <div ref={grillaRef} className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 lg:pb-4">
          {filtrados.length === 0 ? (
            <Vacio
              icono="search"
              titulo="Sin productos"
              texto={
                q ? "Probá con otro texto." : cat === PAUSADOS ? "No hay productos pausados." : "No hay productos en esta categoría."
              }
            />
          ) : enColumnas ? (
            <VistaColumnas
              productos={filtrados}
              categorias={categoriasPos}
              enCarrito={enCarrito}
              conIcono={config.iconos}
              agotadosHoy={agotadosHoy}
              pausados={pausados.ids}
              incluyeDe={(id) => textoIncluyeDe(catalogoAgregados, id)}
              onAgregar={tocarProducto}
              onQuitar={quitarUna}
              onMenu={puedePausar ? setHojaPausa : undefined}
            />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibles.map((p) => (
                <TarjetaVenta
                  key={p.id}
                  producto={p}
                  cantidad={enCarrito.get(p.id) ?? 0}
                  onAgregar={() => tocarProducto(p)}
                  onQuitar={() => quitarUna(p)}
                  incluye={textoIncluyeDe(catalogoAgregados, p.id)}
                  arrastre={arrastre.props(p.id)}
                  // Un tap que terminó siendo arrastre no debe agregar al
                  // carrito: cobrar de más es peor que tener que tocar de nuevo.
                  ignorarClic={arrastre.ignorarClic}
                  agotadoHoy={agotadosHoy.has(p.id)}
                  pausado={pausados.ids.has(p.id)}
                  onMenu={puedePausar ? () => setHojaPausa(p) : undefined}
                  conIcono={config.iconos}
                />
              ))}
            </ul>
          )}
        </div>
          </>
        )}
      </div>

      {/* Carrito: columna fija desde lg, igual que la app en tablet horizontal */}
      <aside className="hidden w-[380px] shrink-0 border-l border-borde bg-white lg:flex lg:flex-col xl:w-[420px]">
        {panelCarrito(true)}
      </aside>

      {/* Móvil y tablet vertical: píldora flotante + hoja inferior.
          Es una píldora centrada y no una barra de lado a lado: la barra
          ocupaba el ancho entero aunque hubiera un solo ítem, y tapaba la
          última fila de productos. Sólo aparece cuando hay algo cargado. */}
      {(carrito.lineas.length > 0 || !!lineasExtra) && (
        <button
          onClick={() => setCarritoAbierto(true)}
          className="fixed bottom-4 left-1/2 z-30 flex h-14 -translate-x-1/2 items-center gap-3 rounded-full bg-primary px-6 text-white shadow-xl shadow-primary/30 lg:hidden"
        >
          <Icon name="cart" size={22} />
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-bold">
            {fmtNum(carrito.unidades)}
          </span>
          <span className="text-lg font-extrabold">
            {fmtMoney(descuentos?.total ?? carrito.total)}
          </span>
        </button>
      )}

      {hojaPausa && (
        <HojaPausa
          producto={hojaPausa}
          pausado={pausados.ids.has(hojaPausa.id)}
          sucursal={pausados.sucursal}
          sucursalId={sucursalId}
          onClose={() => setHojaPausa(null)}
          onCambio={(estaPausado) => {
            pausados.marcar(hojaPausa.id, estaPausado);
            pausados.recargar();
          }}
        />
      )}
      <Confirmar
        abierto={venderPausado != null}
        titulo="Producto pausado"
        texto={venderPausado ? textoVenderPausado(venderPausado.nombre, pausados.sucursal) : ""}
        etiquetaOk="Sí, venderlo"
        onCancel={() => setVenderPausado(null)}
        onOk={() => {
          if (venderPausado) pedirAgregar(venderPausado);
          setVenderPausado(null);
        }}
      />

      {hojaAgregados && catalogoAgregados && (
        <HojaAgregados
          producto={hojaAgregados.producto}
          catalogo={catalogoAgregados}
          inicial={hojaAgregados.clave !== undefined ? (hojaAgregados.inicial ?? []) : undefined}
          onClose={() => setHojaAgregados(null)}
          onConfirmar={(elegidos) => {
            if (hojaAgregados.clave !== undefined) carrito.setAgregados(hojaAgregados.clave, elegidos);
            else carrito.agregar(hojaAgregados.producto, elegidos);
            setHojaAgregados(null);
          }}
        />
      )}

      {carritoAbierto && (
        <div className="fixed inset-0 z-40 flex items-end lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={cerrarCarrito}
          />
          <div className="relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl">
            {panelCarrito(false)}
          </div>
        </div>
      )}
    </div>
  );
}

/** El rótulo de la tarjeta: «Incluye 2 toppings», con todos los grupos si el producto lleva más de uno. */
function textoIncluyeDe(catalogo: CatalogoAgregados | null | undefined, productoId: number): string | undefined {
  const grupos = gruposDelProducto(catalogo, productoId);
  if (grupos.length === 0) return undefined;
  return grupos.map((g) => textoIncluye(g.grupo.nombre, g.incluidos)).join(" · ");
}

/**
 * Las clases de los tres lugares de «Pausado» en la tarjeta (ver `TarjetaVenta`),
 * por el ancho útil de la tarjeta. Con el «⋯»: la etiqueta de siempre desde
 * 146 px; la pastilla en la fila desde 126 (ícono 40 + 6 + pastilla 56 + aire
 * hasta los puntos del «⋯»); debajo del nombre, menos. Sin el «⋯», desde 118 y 102.
 * Escritas enteras: Tailwind sólo genera las clases que ve en el código.
 */
const PAUSADO_CON_MENU = {
  arriba: "hidden @min-[146px]:inline-flex",
  chica: "mr-auto hidden @min-[126px]:inline-flex @min-[146px]:hidden",
  abajo: "mt-1 flex @min-[126px]:hidden",
};
const PAUSADO_SIN_MENU = {
  arriba: "hidden @min-[118px]:inline-flex",
  chica: "mr-auto hidden @min-[102px]:inline-flex @min-[118px]:hidden",
  abajo: "mt-1 flex @min-[102px]:hidden",
};

/** «Pausado» chico, como en la lista en columnas (`VistaColumnas`). */
function PastillaPausado() {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-200 px-1.5 py-px text-[11px] font-bold text-texto-3">
      Pausado
    </span>
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
          ? "bg-primary-boton text-white"
          : "border border-borde bg-white text-texto-2 hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function TarjetaVenta({
  producto: p,
  cantidad,
  onAgregar,
  onQuitar,
  arrastre,
  ignorarClic,
  agotadoHoy = false,
  pausado = false,
  onMenu,
  incluye,
  conIcono = true,
}: {
  producto: Producto;
  /** Cuánto hay de este producto en el carrito. 0 = no está. */
  cantidad: number;
  /**
   * El ícono del producto (Configuración › Punto de venta). Sin él, la tarjeta
   * es nombre y precio. De fábrica va, como siempre.
   */
  conIcono?: boolean;
  /** «Incluye 2 toppings»: el producto lleva un grupo de agregados y al tocarlo abre su hoja. */
  incluye?: string;
  /** Marcado "agotado hoy" en el Menú digital: no se ofrece aunque no tenga stock que contar. */
  agotadoHoy?: boolean;
  /**
   * Pausado en este local (§4.1): sale en gris con «Pausado», pero se puede
   * vender (la caja pregunta antes). No es lo mismo que agotado: éste sí se bloquea.
   */
  pausado?: boolean;
  /** El «⋯» que abre la hoja de pausar o reactivar; sólo con `productos.pausar`. */
  onMenu?: () => void;
  onAgregar: () => void;
  onQuitar: () => void;
  /** Handlers y estilo del reordenamiento (ver useArrastreGrilla). */
  arrastre: ReturnType<
    ReturnType<typeof useArrastreGrilla>["props"]
  >;
  /**
   * El click es el final de un arrastre: no cuenta como "agregar". Se pregunta
   * al hacer click y no al dibujar, porque al soltar la card el arrastre ya
   * terminó cuando llega el click.
   */
  ignorarClic: () => boolean;
}) {
  // Sólo el elaborado no se agota: se prepara al momento. El combo tiene su
  // propio stock (los que armó el local) y se agota como un producto; antes
  // se ofrecía siempre y el cobro rebotaba al confirmar (POS-2).
  const controla = controlaStock(p);
  // Un elaborado sí se agota cuando el encargado lo marca en el Menú digital
  // (se terminó el pollo): la TV ya lo muestra tachado.
  const agotado = (controla && p.stockTotal <= 0) || agotadoHoy;
  const enCarrito = cantidad > 0;
  // El "+" se apaga al llegar a lo que hay (POS-10). El carrito ya ignoraba el
  // toque, pero en silencio: el cajero tocaba y no pasaba nada, sin saber por
  // qué. Es el mismo tope del carrito, como en la app.
  const alTope = cantidad >= topeStock(p);
  // La fila de arriba lleva el ícono y lo que dice el stock. Sin ícono y sin
  // nada que decir (un elaborado que se vende normal), no queda un renglón vacío.
  const conFila = conIcono || agotado || pausado || controla;
  /**
   * Dónde va «Pausado» según el ancho de la tarjeta (17-nov). En la angosta
   * (1366 con el menú abierto) quedaba pegado al «⋯», y en 1024 se salía de
   * la tarjeta. Se mide la tarjeta (`@container`, su ancho útil):
   * - con lugar, la etiqueta de siempre, arriba a la derecha;
   * - si no entra, una pastilla chica en la misma fila, pegada al ícono, con
   *   aire hasta el «⋯» (así la tarjeta no crece);
   * - si tampoco entra (1024), la pastilla debajo del nombre, como en la
   *   lista en columnas.
   * Sin el «⋯» (sin permiso de pausar) hay más lugar en la fila.
   */
  const lugarPausado = onMenu ? PAUSADO_CON_MENU : PAUSADO_SIN_MENU;

  return (
    <li
      onPointerDown={arrastre.onPointerDown}
      onContextMenu={arrastre.onContextMenu}
      onDragStart={arrastre.onDragStart}
      style={arrastre.style}
      data-arrastre-id={arrastre["data-arrastre-id"]}
      className={arrastre["data-arrastrando"] ? "shadow-xl" : undefined}
    >
      {/* Tres estados, como en la app: normal, en el carrito (borde verde y
          fondo verde claro, con el stepper debajo) y agotado. Ver el producto
          elegido sin abrir el carrito es lo que evita cargarlo dos veces. */}
      <div
        className={[
          "@container relative flex h-full flex-col rounded-2xl border p-3 transition-shadow",
          enCarrito
            ? "border-primary bg-primary-50 shadow-sm"
            : pausado
              ? "border-borde bg-slate-100 hover:shadow-md"
              : "border-borde bg-white hover:shadow-md",
          agotado ? "opacity-50" : "",
          pausado && !agotado ? "opacity-60 grayscale" : "",
        ].join(" ")}
      >
        <button
          onClick={() => {
            if (!ignorarClic()) onAgregar();
          }}
          disabled={agotado}
          className="flex flex-1 flex-col text-left"
        >
          {conFila && (
          // Sin ícono, lo del stock queda arriba a la derecha, como con él.
          <div className={`flex items-start ${conIcono ? "justify-between" : "justify-end"} gap-1.5${onMenu ? " pr-7" : ""}`}>
            {conIcono && (
              <IconoProducto
                nombre={p.nombre}
                icono={p.icono}
                categoria={p.categoria?.nombre}
                size={40}
              />
            )}
            {/* Como en la app: el que vende ve cuánto queda antes de
                ofrecerlo, no recién cuando se agota. Antes el número sólo
                aparecía bajo el mínimo, y un "1" suelto no decía de qué era. */}
            {agotado && <Badge tono="rojo">Agotado</Badge>}
            {/* Pausado y agotado a la vez: gana «Agotado», que sí frena la venta. */}
            {pausado && !agotado && (
              <>
                <span className={lugarPausado.chica}>
                  <PastillaPausado />
                </span>
                <span className={lugarPausado.arriba}>
                  <Badge tono="gris">Pausado</Badge>
                </span>
              </>
            )}
            {/* Un span y no <Badge>: Badge fuerza mayúsculas, y "72 DISP."
                se leía como una sigla. Mismo tamaño y colores que el badge. */}
            {!agotado && controla && (
              <span
                className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                  p.stockTotal <= p.stockMinimo
                    ? "bg-warning-bg text-warning-text"
                    : "bg-primary-50 text-primary-700"
                }`}
              >
                {fmtCantidad(p.stockTotal)} disp.
              </span>
            )}
          </div>
          )}
          {/* Tres renglones y no dos: en la compu (4 columnas) «Arroz con leche
              con dulce de leche – Mediano» quedaba «…con dulce de leche –…» y
              la cajera no distinguía el tamaño, sólo por el precio (13-nov).
              Con `text-balance` (16-nov) los renglones se reparten parejo: la
              letra del tamaño ya no queda sola abajo («Leche condensada / M»
              pasa a «Leche / condensada M»). No suma renglones ni cambia el
              alto; donde el navegador no lo sabe hacer, queda como antes. */}
          {/* Sin la fila de arriba el nombre encabeza la tarjeta: deja lugar al «⋯». */}
          <h3
            className={`${conFila ? "mt-2" : onMenu ? "pr-7" : ""} line-clamp-3 text-balance text-[13px] font-bold leading-snug text-texto`.trim()}
          >
            {p.nombre}
          </h3>
          {/* En la tarjeta más angosta «Pausado» no entra arriba: va acá (ver `lugarPausado`). */}
          {pausado && !agotado && (
            <span className={lugarPausado.abajo}>
              <PastillaPausado />
            </span>
          )}
          {/* PLAN-AGREGADOS §6 #2: lo que trae el producto se dice a la vista,
              antes de tocarlo. */}
          {incluye && <p className="mt-1 text-[11px] font-bold text-primary-700">{incluye}</p>}
          <p className="mt-auto pt-2 text-[15px] font-extrabold text-primary-700">
            {fmtMoney(p.precio)}
          </p>
        </button>

        {onMenu && (
          <button
            type="button"
            onClick={() => {
              if (!ignorarClic()) onMenu();
            }}
            // Sin esto, tocar el «⋯» empezaría el arrastre de la card.
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={pausado ? `Reactivar ${p.nombre}` : `Pausar ${p.nombre}`}
            title={pausado ? "Reactivar" : "Pausar en esta sucursal"}
            className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full text-texto-3 hover:bg-muted hover:text-texto"
          >
            <Icon name="more" size={18} />
          </button>
        )}

        {enCarrito && (
          <div className="mt-2 flex h-9 items-center justify-between rounded-full border border-primary bg-white px-1">
            <button
              // Soltar una card arrastrada encima del − o el + no cambia la
              // cantidad: el mismo click que en el cuerpo de la card.
              onClick={() => {
                if (!ignorarClic()) onQuitar();
              }}
              aria-label={cantidad === 1 ? "Quitar del pedido" : "Uno menos"}
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                // En la última unidad el "−" se vuelve tacho: avisa que el
                // próximo toque saca el producto, no que lo baja a cero.
                cantidad === 1
                  ? "text-[#DC2626] hover:bg-[#FEF2F2]"
                  : "text-texto-2 hover:bg-muted"
              }`}
            >
              <Icon name={cantidad === 1 ? "trash" : "minus"} size={15} />
            </button>
            <span className="text-sm font-bold text-texto">{fmtNum(cantidad)}</span>
            <button
              onClick={() => {
                if (!ignorarClic()) onAgregar();
              }}
              disabled={alTope}
              aria-label="Uno más"
              title={alTope ? "No hay más disponibles" : undefined}
              className="flex h-9 w-9 items-center justify-center rounded-full text-primary-700 hover:bg-primary-50 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Icon name="plus" size={15} />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/** Lo que suma el POS cuando el negocio tiene promociones. */
/** El profesional de cada línea del carrito (belleza con agenda, QA PER-07b). */
export interface ProfesionalesDelCarrito {
  /** El de la línea y sus opciones; null = la línea no lleva (o no se muestra). */
  de: (l: LineaCarrito) => ProfesionalDeLinea | null;
  onCambiar: (productoId: number, recursoId: number | null) => void;
}

/** Lo que cambia en el carrito cuando se modifica una venta ya cobrada. */
export interface ModoModificacion {
  /** El título del carrito: "Cambio de V-000012". */
  titulo: string;
  /** Debajo del total: lo que ya pagó y la diferencia a cobrar o devolver. */
  resumen: React.ReactNode;
  /** El botón: "Devolver Bs 3,00 · Continuar", "Cobrar Bs 4,00 de diferencia"… */
  etiqueta: string;
  /** Por qué todavía no se puede seguir ("Todavía no cambiaste nada"). */
  bloqueo?: string | null;
  /** Lo que dice el carrito vacío: dejar la venta sin nada es anularla. */
  vacio: string;
}

/**
 * El cobro en la misma pantalla de la venta: lo mismo que el POS le pasa a la
 * pantalla de cobro de siempre, para dibujarlo en el carrito.
 */
export interface CobroEnLaVenta {
  /** Lo que se cobra: el mismo total que tendría la pantalla de cobro. */
  total: number;
  formasPago: FormaPago[];
  /** Belleza (propinas); en el restaurante, nadie. */
  profesionales?: ProfesionalCobro[];
  onConfirmar: (pagos: PagoInput[], extra?: { propinas?: PropinaInput[]; propinaMesa?: number }) => void;
  /** «Vender a crédito (fiado)», con las mismas condiciones de siempre; sin esto, no se ofrece. */
  onCredito?: (extra?: { propinas?: PropinaInput[] }) => void;
  enviando: boolean;
  error: string;
}

export interface ExtraDescuentos {
  /** El total a cobrar (el neto que devolvió la cotización). */
  total: number;
  /** Renglones de descuento y el campo del cupón, entre subtotal y total. */
  nodo: React.ReactNode;
  /** Mientras se recalcula, no se cobra: el total todavía puede cambiar. */
  bloqueado?: boolean;
}

function PanelCarrito({
  sucursalId,
  descuentos,
  bloqueoCobro,
  profesionales,
  lineasExtra,
  modificacion,
  notasAbiertas,
  onEditarAgregados,
  plataformas,
  onCobrar,
  onCerrar,
  cobro,
  quieto = false,
  carrito: carritoRecibido,
}: {
  /** El cobro incrustado en vez de «Cobrar» (ver `PantallaVenta`). */
  cobro?: CobroEnLaVenta;
  /** Se está registrando el cobro incrustado: las líneas no se tocan (ver `PantallaVenta`). */
  quieto?: boolean;
  carrito: Carrito;
  sucursalId?: number | null;
  descuentos?: ExtraDescuentos;
  bloqueoCobro?: string | null;
  profesionales?: ProfesionalesDelCarrito;
  lineasExtra?: React.ReactNode;
  modificacion?: ModoModificacion;
  /** Lo escrito en las notas sin confirmar: ver PantallaVenta. */
  notasAbiertas: RefObject<Map<ClaveLinea, string>>;
  /** Tocar los toppings de una línea reabre su hoja. Sin esto, la línea no se edita. */
  onEditarAgregados?: (l: LineaCarrito) => void;
  plataformas?: { disponibles: Plataforma[]; onElegir: (p: Plataforma) => void };
  onCobrar: () => void;
  onCerrar: () => void;
}) {
  // Quieto, el carrito no cambia aunque llegue un toque: `inert` ya los frena
  // en el navegador, y esto los frena igual donde `inert` no existe.
  const carrito = useMemo(() => (quieto ? carritoQuieto(carritoRecibido) : carritoRecibido), [quieto, carritoRecibido]);
  const total = descuentos?.total ?? carrito.total;
  const { incluye, rubro } = useAuth();
  // Sin la capacidad la comanda no distingue destino: todo sale para llevar,
  // que es el valor por defecto con el que nacen las líneas.
  const conMesaLlevar = incluye("mesa_llevar");
  // Farmacia: la cantidad se escribe y cada renglón dice de qué lote sale.
  // En un restaurante `venta` es null y el carrito queda como siempre, sin
  // pedir lotes.
  const venta = useVentaFarmacia();
  const conLotes = esFarmacia(rubro) && incluye("lotes");
  const ids = useMemo(() => carrito.lineas.map((l) => l.producto.id), [carrito.lineas]);
  const lotes = useLotesDelCarrito(ids, sucursalId, conLotes);
  // Un controlado sin receta no se cobra: el servidor la rechazaría. Cobrar
  // abre sus datos en vez de avanzar, con el papel todavía en la mano.
  const sinReceta = venta
    ? carrito.lineas.find(
        (l) => pideConfirmacion(l.producto) && !venta.recetas.has(l.producto.id),
      )
    : undefined;
  // Con sólo cuotas (sin productos) también hay algo que cobrar.
  const vacio = carrito.lineas.length === 0 && !lineasExtra;
  // Vaciar es destructivo y el botón está al lado del de cerrar: un toque
  // impreciso borraba una venta de quince ítems con el cliente enfrente.
  const [vaciando, setVaciando] = useState(false);
  const botonesPlataformas =
    plataformas &&
    plataformas.disponibles.map((p) => (
      <Boton
        key={p}
        variante="ghost"
        onClick={() => {
          if (!quieto) plataformas.onElegir(p);
        }}
        disabled={descuentos?.bloqueado || !!bloqueoCobro}
        className="min-w-0 flex-1 px-2"
        // El tono de la plataforma (paleta única, §10.4): borde y texto; el nombre va siempre.
        style={{ color: colorDePlataforma(p), borderColor: colorDePlataforma(p) }}
      >
        <span aria-hidden="true">🛵</span> {NOMBRE_PLATAFORMA[p]}
      </Boton>
    ));

  return (
    <>
      <Confirmar
        abierto={vaciando}
        titulo="¿Vaciar la venta?"
        texto={`Se van a quitar ${carrito.unidades} ${
          carrito.unidades === 1 ? "ítem" : "ítems"
        } y hay que cargarlos de nuevo.`}
        etiquetaOk="Vaciar"
        peligroso
        onCancel={() => setVaciando(false)}
        onOk={() => {
          carrito.vaciar();
          setVaciando(false);
        }}
      />
      <div
        inert={quieto}
        aria-busy={quieto || undefined}
        className="flex items-center justify-between border-b border-borde-soft px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Icon name="cart" size={19} />
          <h2 className="text-[15px] font-bold text-texto">
            {modificacion?.titulo ?? "Venta"}
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
              onClick={() => setVaciando(true)}
              title="Vaciar la venta"
              aria-label="Vaciar la venta"
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
            texto={
              modificacion
                ? modificacion.vacio
                : esFarmacia(rubro)
                  ? "Buscá o tocá un medicamento para agregarlo a la venta."
                  : "Tocá un producto para agregarlo a la venta."
            }
          />
        </div>
      ) : (
        <>
          {/* Atajo para marcar toda la comanda de una: lo más común es que
              todo el pedido sea para el mismo destino. */}
          {conMesaLlevar && (
            <div inert={quieto} className="flex gap-2 border-b border-borde-soft px-4 py-2.5">
              <BotonConsumoTodo carrito={carrito} consumo="MESA" />
              <BotonConsumoTodo carrito={carrito} consumo="LLEVAR" />
            </div>
          )}

          {lineasExtra}
          {/* Lo único que scrollea. Con el cobro abajo, con un mínimo: el
              medio de pago o el QR no pueden dejar las líneas sin lugar. */}
          <ul
            inert={quieto}
            aria-busy={quieto || undefined}
            className={`${cobro ? "min-h-28" : "min-h-0"} flex-1 divide-y divide-borde-soft overflow-y-auto`}
          >
            {carrito.lineas.map((l) => (
              <FilaCarrito
                key={claveDeLinea(l)}
                linea={l}
                carrito={carrito}
                notasAbiertas={notasAbiertas}
                onEditarAgregados={onEditarAgregados ? () => onEditarAgregados(l) : undefined}
                conMesaLlevar={conMesaLlevar}
                venta={venta}
                profesional={profesionales?.de(l) ?? null}
                onProfesional={(id) => profesionales?.onCambiar(l.producto.id, id)}
                lotes={
                  conLotes && l.producto.manejaLote
                    ? lotes?.get(l.producto.id)
                    : null
                }
              />
            ))}
          </ul>

          <div className={`${cobro ? "shrink-0 " : ""}border-t border-borde-soft px-4 py-3`}>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between text-texto-2">
                <dt>
                  {carrito.unidades} {carrito.unidades === 1 ? "unidad" : "unidades"}
                </dt>
                <dd>{fmtMoney(carrito.subtotal)}</dd>
              </div>
              {descuentos?.nodo}
              <div className="flex justify-between border-t border-borde-soft pt-1.5 text-base font-extrabold text-texto">
                <dt>{modificacion ? "Total nuevo" : "Total"}</dt>
                <dd>{fmtMoney(total)}</dd>
              </div>
              {modificacion?.resumen}
            </dl>

            {cobro ? (
              // Con el cobro en la misma pantalla no hay «Cobrar»: lo que sigue
              // es el cobro mismo. Lo que lo frena se dice igual, acá.
              bloqueoCobro && (
                <p role="status" className="mt-1.5 text-center text-[12px] font-semibold text-warning-text">
                  {bloqueoCobro}
                </p>
              )
            ) : (
              <>
            <Boton
              onClick={() => {
                if (venta && sinReceta) venta.pedirReceta(sinReceta.producto);
                else onCobrar();
              }}
              disabled={descuentos?.bloqueado || !!bloqueoCobro || !!modificacion?.bloqueo}
              className="mt-3 w-full"
            >
              {modificacion ? modificacion.etiqueta : `Cobrar ${fmtMoney(total)}`}
            </Boton>
            {(bloqueoCobro || modificacion?.bloqueo) && (
              <p role="status" className="mt-1.5 text-center text-[12px] font-semibold text-warning-text">
                {bloqueoCobro || modificacion?.bloqueo}
              </p>
            )}
            {/* Pedidos de Yango / PedidosYa: no se cobran, así que van como
                alternativa a «Cobrar», más discretos. Un paquete sin cliente
                (`bloqueoCobro`) tampoco se registra como pedido. */}
            {botonesPlataformas && <div className="mt-2 flex gap-2">{botonesPlataformas}</div>}
              </>
            )}
          </div>

          {/* El cobro en la misma pantalla (16-nov): el medio de pago, el
              efectivo y «Confirmar cobro», con el fiado debajo; y después, como
              alternativa a cobrar, los pedidos de las apps de delivery. */}
          {cobro && (
            <PantallaCobro
              incrustado
              total={cobro.total}
              formasPago={cobro.formasPago}
              profesionales={cobro.profesionales}
              onAtras={() => {}}
              onConfirmar={cobro.onConfirmar}
              onCredito={cobro.onCredito}
              // Lo mismo que apagaba «Cobrar»: la cotización en vuelo, el paquete sin cliente.
              bloqueado={!!descuentos?.bloqueado || !!bloqueoCobro}
              enviando={cobro.enviando}
              error={cobro.error}
            />
          )}
          {cobro && botonesPlataformas && (
            <div inert={quieto} className="flex shrink-0 gap-2 px-4 pb-3">
              {botonesPlataformas}
            </div>
          )}
        </>
      )}
    </>
  );
}

const nada = () => {};

/** El mismo carrito, que se lee igual pero no cambia: mientras se registra el cobro incrustado. */
function carritoQuieto(c: Carrito): Carrito {
  return {
    ...c,
    agregar: nada,
    setAgregados: nada,
    setCantidad: nada,
    setNota: nada,
    setEnMesa: nada,
    setConsumo: nada,
    setConsumoTodo: nada,
    quitar: nada,
    vaciar: nada,
  };
}

/** Cuántas unidades de ESTE producto hay en las otras líneas del carrito (con otros toppings). */
function enOtrasLineas(carrito: Carrito, l: LineaCarrito): number {
  let n = 0;
  for (const o of carrito.lineas) if (o !== l && o.producto.id === l.producto.id) n += o.cantidad;
  return n;
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
          ? "bg-primary-boton text-white"
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
  notasAbiertas,
  onEditarAgregados,
  conMesaLlevar,
  venta,
  profesional,
  onProfesional,
  lotes,
}: {
  linea: LineaCarrito;
  carrito: Carrito;
  notasAbiertas: RefObject<Map<ClaveLinea, string>>;
  /** Tocar los toppings de la línea la reabre en su hoja; ausente = no se edita. */
  onEditarAgregados?: () => void;
  conMesaLlevar: boolean;
  /** La venta de la farmacia; null en un restaurante. */
  venta: VentaFarmacia | null;
  /** Quién atendió la línea (belleza con agenda); null en los demás. */
  profesional: ProfesionalDeLinea | null;
  onProfesional: (recursoId: number | null) => void;
  /** null = este renglón no lleva lote; undefined = todavía no se sabe. */
  lotes: LotesDelArticulo | null | undefined;
}) {
  const [editandoNota, setEditandoNota] = useState(false);
  const [nota, setNota] = useState(l.nota);
  const [splitAbierto, setSplitAbierto] = useState(false);
  // La clave de la línea (producto + toppings): dos vasos iguales con toppings
  // distintos son líneas distintas y cada una guarda su nota y su cantidad.
  const id: ClaveLinea = claveDeLinea(l);
  const extra = l.vista?.extraPorUnidad ?? 0;
  const precioUnidad = l.producto.precio + extra;

  // El campo arranca siempre en la nota guardada: ahora salir del campo la
  // guarda, y un borrador viejo pisaría la nota con lo de antes.
  const abrirNota = () => {
    setNota(l.nota);
    setEditandoNota(true);
  };
  /** Pasa lo escrito al carrito, sin cerrar el campo. */
  const guardarNota = () => {
    const texto = nota.trim();
    if (texto !== l.nota) carrito.setNota(id, texto);
    notasAbiertas.current.delete(id);
  };
  /** Enter o el ✓: se guarda y el campo se cierra. */
  const confirmarNota = () => {
    guardarNota();
    setEditandoNota(false);
  };
  // La fila que se va (la línea se quitó) no deja su borrador atrás: si el
  // producto vuelve al carrito, Cobrar le pegaría la nota vieja.
  useEffect(() => {
    const abiertas = notasAbiertas.current;
    return () => {
      abiertas.delete(id);
    };
  }, [notasAbiertas, id]);

  const partida = l.enMesa > 0 && l.enMesa < l.cantidad;
  const todaMesa = l.enMesa === l.cantidad;
  const concentracion = venta ? concentracionAparte(l.producto) : null;

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          {/* Hasta dos renglones y no «…»: en el carrito «Arroz con leche con
              leche condensada – Mediano» quedaba «Arroz con leche con leche c…»
              y la cajera no sabía qué tamaño estaba cobrando (13-nov). */}
          <p className="line-clamp-2 text-[13px] font-bold text-texto">
            {l.producto.nombre}
            {/* En una farmacia, la concentración si el nombre no la trae: quien
                entrega tiene que saber si es el de 1 mg o el de 5 mg. En un
                restaurante `venta` es null y no se dibuja nada. */}
            {concentracion && (
              <span className="ml-1 font-semibold text-texto-2">{concentracion}</span>
            )}
          </p>
          <p className="truncate text-xs text-texto-3">
            {fmtMoney(precioUnidad)} c/u
            {/* QA PER-07b: con "Por servicio" cada línea puede ser de alguien
                distinto; se dice acá, discreto, y se cambia tocándolo. */}
            {profesional && (
              <>
                {" · "}
                <ProfesionalEnLinea
                  nombreLinea={l.producto.nombre}
                  profesional={profesional}
                  onCambiar={onProfesional}
                />
              </>
            )}
          </p>
          {/* La receta se muestra también acá, no sólo al agregar: entre que se
              carga el carrito y se cobra puede cambiar de manos, y quien
              entrega tiene que ver qué papel hay que pedir. Sólo aparece en lo
              que de verdad lo exige; un artículo de venta libre no dibuja nada
              y en restaurante no se dibuja nunca. */}
          <span className="mt-1 flex flex-wrap items-center gap-1.5 empty:mt-0">
            <ChipsCondicion producto={l.producto} />
          </span>
        </div>

        {venta ? (
          <CantidadVenta
            nombre={l.producto.nombre}
            cantidad={l.cantidad}
            fijar={(n) => venta.fijarCantidad(l.producto, n)}
          />
        ) : (
        <div className="flex items-center gap-1 rounded-lg border border-borde">
          <button
            onClick={() => carrito.setCantidad(id, l.cantidad - 1)}
            aria-label="Quitar una unidad"
            className="p-2.5 text-texto-2 hover:bg-muted"
          >
            <Icon name={l.cantidad === 1 ? "trash" : "minus"} size={16} />
          </button>
          <span className="min-w-6 text-center text-[13px] font-bold">{l.cantidad}</span>
          <button
            onClick={() => carrito.setCantidad(id, l.cantidad + 1)}
            // Apagado en el tope, igual que el "+" de la card (POS-10). El tope
            // es del producto: lo que ya hay en otras líneas con otros toppings cuenta.
            disabled={enOtrasLineas(carrito, l) + l.cantidad >= topeStock(l.producto)}
            aria-label="Agregar una unidad"
            className="p-2.5 text-texto-2 hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
        )}

        <span className="min-w-20 shrink-0 text-right text-[13px] font-bold text-texto">
          {fmtMoney(precioUnidad * l.cantidad)}
        </span>
      </div>

      {/* Los toppings debajo del vaso, como en el recibo: los incluidos lo
          dicen y los extras llevan su precio. Tocarlos reabre la hoja. */}
      {l.vista && l.vista.hijas.length > 0 && (
        <button
          type="button"
          onClick={onEditarAgregados}
          disabled={!onEditarAgregados}
          aria-label={`Cambiar los toppings de ${l.producto.nombre}`}
          className="mt-1.5 block w-full rounded-lg px-1 text-left enabled:hover:bg-muted"
        >
          {l.vista.hijas.map((h) => (
            <span key={`${h.productoId}-${h.incluido}`} className="flex justify-between gap-2 text-xs text-texto-3">
              <span className="min-w-0 truncate">
                + {h.cantidad > 1 ? `${h.cantidad} × ` : ""}
                {h.nombre}
              </span>
              <span className="shrink-0 font-semibold">{h.incluido ? "incluido" : fmtMoney(h.subtotal)}</span>
            </span>
          ))}
        </button>
      )}

      {/* A todo el ancho: al lado del contador no entraba y cada lote ocupaba
          dos renglones. */}
      {lotes !== null && (
        <LoteEnLaVenta lotes={lotes?.lotes} vencidas={lotes?.vencidas} cantidad={l.cantidad} />
      )}
      {venta && pideConfirmacion(l.producto) && (
        <RecetaEnLaVenta
          receta={venta.recetas.get(l.producto.id)}
          onEditar={() => venta.pedirReceta(l.producto)}
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* Con una sola unidad no hay nada que partir: alcanza el toggle. */}
        {conMesaLlevar &&
          (l.cantidad === 1 ? (
            <button
              onClick={() => carrito.setConsumo(id, todaMesa ? "LLEVAR" : "MESA")}
              className={`rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${
                todaMesa ? "bg-primary-100 text-primary-700" : "bg-slate-100 text-texto-3"
              }`}
            >
              {todaMesa ? "Mesa" : "Llevar"}
            </button>
          ) : (
            <button
              onClick={() => setSplitAbierto(true)}
              className={`rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${
                partida
                  ? "bg-primary-50 text-primary-700"
                  : todaMesa
                    ? "bg-primary-100 text-primary-700"
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
              onClick={abrirNota}
              className="flex items-center gap-1 rounded-lg bg-warning-bg px-2 py-1 text-[11px] font-semibold text-warning-text"
            >
              <Icon name="alert" size={11} /> {l.nota}
            </button>
          ) : (
            <button
              onClick={abrirNota}
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
            onChange={(e) => {
              setNota(e.target.value);
              notasAbiertas.current.set(id, e.target.value);
            }}
            // Salir del campo también la guarda: antes sólo Enter y el ✓, y lo
            // escrito se perdía al tocar Cobrar (BUG-pos-venta-1). Guarda pero
            // NO cierra: cerrarlo achica la lista justo mientras el dedo baja
            // sobre otro botón (el "+" de esta línea, la de abajo), y ese toque
            // se perdería porque el botón se corre de lugar.
            onBlur={guardarNota}
            placeholder="Ej. sin cebolla"
            aria-label={`Nota de ${l.producto.nombre}`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarNota();
            }}
            className="py-1.5 text-[13px]"
          />
          <Boton
            variante="soft"
            onClick={confirmarNota}
            aria-label="Guardar la nota"
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
          carrito.setEnMesa(id, enMesa);
          setSplitAbierto(false);
        }}
      />
      )}
    </li>
  );
}

/**
 * El profesional de una línea del carrito: se lee como texto ("· Marco") y es
 * un select nativo por debajo, así cambiarlo es un toque y el teclado y el
 * lector de pantalla lo entienden sin nada extra.
 */
function ProfesionalEnLinea({
  nombreLinea,
  profesional,
  onCambiar,
}: {
  nombreLinea: string;
  profesional: ProfesionalDeLinea;
  onCambiar: (recursoId: number | null) => void;
}) {
  const sinNadie = profesional.actual == null;
  return (
    <select
      aria-label={`Quién atendió ${nombreLinea}`}
      title="Cambiar quién lo atendió"
      value={profesional.actual == null ? "" : String(profesional.actual)}
      onChange={(e) => onCambiar(e.target.value === "" ? null : Number(e.target.value))}
      className={`max-w-[9rem] cursor-pointer appearance-none truncate rounded bg-transparent p-0 text-xs underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        sinNadie ? "text-texto-4" : "font-semibold text-texto-2"
      }`}
    >
      <option value="">sin asignar</option>
      {profesional.opciones.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
        </option>
      ))}
    </select>
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
