import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../components/Icon";
import IconoProducto from "../../components/IconoProducto";
import { Badge, Boton, Campo, ErrorMsg, Input, Modal } from "../../components/ui";
import { apiPagina, urlDeImagen, type FotoDeProducto } from "../../lib/pagina/apiPagina";
import type { Paleta } from "../../lib/pagina/aspecto";
import { formatoPrecio, MAX_TITULO_CATALOGO, moverA, TITULO_CATALOGO } from "../../lib/pagina/catalogo";
import { prepararFotoPlato } from "../../lib/pagina/imagen";
import {
  categoriasDe,
  claveCategoria,
  mismoOrden,
  moverUno,
  nombreCategoria,
  ordenAlfabetico,
  ordenPorCategoria,
  puedeDeshacer,
  rangoInicialCategorias,
  type DentroDeCategoria,
  type OrdenDeshacible,
} from "../../lib/pagina/ordenCatalogo";
import type {
  ImagenCatalogo,
  ModoCatalogo,
  OrdenBuscador,
  ProductoFijado,
  ProductoParaPagina,
} from "../../lib/pagina/tipos";
import Seccion from "./Seccion";

/**
 * El catálogo de la página en modo "Mis productos" (pedido del dueño, 13-oct):
 * en vez de armar la galería a mano, el dueño elige productos de su sistema y
 * la página los muestra con el nombre y el precio que tengan HOY (si cambia
 * el precio en el sistema, cambia en la página). Uno u otro: el modo se elige
 * arriba de la sección.
 *
 * Como la galería, cada cambio de la lista se guarda al toque (fijar, quitar,
 * ordenar, y la foto de un producto); el modo, la imagen de cada producto y el
 * título de la sección van al borrador de la página y se guardan con
 * "Guardar cambios".
 *
 * 16-nov: «Marcar todo» y el orden por categoría en el selector, la
 * herramienta «Ordenar» (A–Z o por categoría, con «Deshacer») y la foto de
 * cada producto. Las flechas y la ✕ de cada producto quedan SIEMPRE: ordenar
 * reacomoda la lista una vez y después se sigue afinando a mano.
 */

const mensaje = (e: unknown, defecto = "No se pudo guardar") => (e instanceof Error ? e.message : defecto);

/** Una tarjeta de opción (radio grande), como las del modo. */
function OpcionTarjeta({
  nombre,
  titulo,
  texto,
  elegida,
  deshabilitada = false,
  onElegir,
  c,
}: {
  nombre: string;
  titulo: string;
  texto: string;
  elegida: boolean;
  deshabilitada?: boolean;
  onElegir: () => void;
  c: Paleta;
}) {
  return (
    // `border-borde`: sin un color, el borde de Tailwind 4 es el del texto y la
    // opción sin elegir salía con un marco casi negro, más marcado que la
    // elegida (prueba de punta a punta, 16-nov). La elegida lo pisa con el acento.
    <label
      className={`flex min-w-0 items-start gap-2.5 rounded-xl border border-borde px-3 py-2.5 text-sm ${
        deshabilitada ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
      style={{ borderColor: elegida ? c.acento : undefined, background: elegida ? c.tinte : undefined }}
    >
      <input
        type="radio"
        name={nombre}
        className="mt-0.5 h-[18px] w-[18px] shrink-0"
        style={{ accentColor: c.acento }}
        checked={elegida}
        disabled={deshabilitada}
        onChange={onElegir}
      />
      <span className="min-w-0">
        <span className="block font-semibold text-texto">{titulo}</span>
        <span className="block text-xs text-texto-3">{texto}</span>
      </span>
    </label>
  );
}

/** El selector de modo: dos opciones grandes, una sola elegida. */
export function SelectorModoCatalogo({
  modo,
  onModo,
  hayProductos,
  c,
}: {
  modo: ModoCatalogo;
  onModo: (m: ModoCatalogo) => void;
  /** Sin productos a la venta "Mis productos" no se puede elegir. */
  hayProductos: boolean;
  c: Paleta;
}) {
  const opciones: { clave: ModoCatalogo; titulo: string; texto: string; deshabilitada: boolean }[] = [
    {
      clave: "MANUAL",
      titulo: "Armado a mano",
      texto: "Fotos, títulos y precios que cargás acá.",
      deshabilitada: false,
    },
    {
      clave: "PRODUCTOS",
      titulo: "Mis productos",
      texto: hayProductos
        ? "Elegís productos de tu sistema; el precio se actualiza solo."
        : "Todavía no tenés productos a la venta.",
      deshabilitada: !hayProductos && modo !== "PRODUCTOS",
    },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-[13px] font-semibold text-texto-2">¿Qué muestra tu catálogo?</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {opciones.map((o) => (
          <OpcionTarjeta
            key={o.clave}
            nombre="modo-catalogo"
            titulo={o.titulo}
            texto={o.texto}
            elegida={modo === o.clave}
            deshabilitada={o.deshabilitada}
            onElegir={() => onModo(o.clave)}
            c={c}
          />
        ))}
      </div>
      <p className="text-xs text-texto-4">Se muestra uno u otro. El que no elegís no se borra: queda guardado para cuando vuelvas.</p>
    </fieldset>
  );
}

/** «Imagen de cada producto» (16-nov): el ícono de siempre o la foto del producto. */
export function SelectorImagenCatalogo({
  imagen,
  onImagen,
  c,
}: {
  imagen: ImagenCatalogo;
  onImagen: (v: ImagenCatalogo) => void;
  c: Paleta;
}) {
  const opciones: { clave: ImagenCatalogo; titulo: string; texto: string }[] = [
    { clave: "ICONO", titulo: "Ícono", texto: "El ícono que tiene cada producto en tu sistema." },
    { clave: "FOTO", titulo: "Foto", texto: "La foto del producto; los que no tengan, muestran su ícono." },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-[13px] font-semibold text-texto-2">Imagen de cada producto</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {opciones.map((o) => (
          <OpcionTarjeta
            key={o.clave}
            nombre="imagen-catalogo"
            titulo={o.titulo}
            texto={o.texto}
            elegida={imagen === o.clave}
            onElegir={() => onImagen(o.clave)}
            c={c}
          />
        ))}
      </div>
    </fieldset>
  );
}

export interface PropsProductos {
  fijados: ProductoFijado[];
  tope: number;
  titulo: string;
  onTitulo: (t: string) => void;
  /** La lista guardada que devolvió el backend (o la de antes, si falló). */
  onFijados: (lista: ProductoFijado[]) => void;
  /** El selector de modo, arriba de todo. */
  selector: ReactNode;
  c: Paleta;
  /** Cómo llama el rubro a un local: «sede» en el instituto (Lista 2 #9). */
  sucursal?: string;
  onAviso: (t: string) => void;
  /** «Imagen de cada producto» (16-nov). Sin `onImagen` no se ofrece (= ícono). */
  imagen?: ImagenCatalogo;
  onImagen?: (v: ImagenCatalogo) => void;
  /** El negocio tiene menú digital: la aclaración de la foto lo nombra. */
  conMenuDigital?: boolean;
}

export default function CatalogoProductosEditor({
  fijados,
  tope,
  titulo,
  onTitulo,
  onFijados,
  selector,
  c,
  sucursal = "sucursal",
  onAviso,
  imagen = "ICONO",
  onImagen,
  conMenuDigital = false,
}: PropsProductos) {
  const [elegir, setElegir] = useState(false);
  const [ordenar, setOrdenar] = useState(false);
  // El último «Ordenar» aplicado, para «Deshacer» (vale hasta el próximo cambio de la lista).
  const [deshacer, setDeshacer] = useState<OrdenDeshacible | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const ultimo = useRef(0);
  // La lista de este momento, para lo que termina después (una foto que se sube).
  const actuales = useRef(fijados);
  actuales.current = fijados;
  const lista = [...fijados].sort((a, b) => a.orden - b.orden);
  const ids = lista.map((p) => p.id);
  const ocultos = lista.filter((p) => !p.vendible).length;
  const conFoto = imagen === "FOTO";

  /**
   * Optimista: la lista nueva se ve al instante y se guarda atrás. Si falla,
   * vuelve la de antes. Sólo la última respuesta manda.
   */
  const guardar = async (nuevos: number[], aviso?: string): Promise<boolean> => {
    const antes = fijados;
    const mio = ++ultimo.current;
    const porId = new Map(fijados.map((p) => [p.id, p]));
    onFijados(
      nuevos
        .map((id, i) => {
          const p = porId.get(id);
          return p ? { ...p, orden: i + 1 } : null;
        })
        .filter((p): p is ProductoFijado => !!p),
    );
    setError("");
    setGuardando(true);
    try {
      const guardados = await apiPagina.fijarProductosCatalogo(nuevos);
      if (mio === ultimo.current) onFijados(guardados);
      if (aviso) onAviso(aviso);
      return true;
    } catch (e) {
      if (mio === ultimo.current) onFijados(antes);
      setError(mensaje(e));
      return false;
    } finally {
      if (mio === ultimo.current) setGuardando(false);
    }
  };

  /** Cualquier otro cambio de la lista (flechas, quitar, elegir): «Deshacer» deja de valer. */
  const cambiarLista = (nuevos: number[], aviso?: string) => {
    setDeshacer(null);
    return guardar(nuevos, aviso);
  };

  const aplicarOrden = async (nuevos: number[]) => {
    const antes = ids;
    setOrdenar(false);
    if (mismoOrden(nuevos, antes)) return;
    setDeshacer({ antes, despues: nuevos });
    if (!(await guardar(nuevos, "Lista ordenada"))) setDeshacer(null);
  };

  const volverAtras = async () => {
    if (!puedeDeshacer(deshacer, ids)) return;
    if (await guardar(deshacer.antes, "Volvió el orden de antes")) setDeshacer(null);
  };

  /** La foto nueva (o ninguna) de un producto, en la lista de ahora. */
  const ponerFoto = (productoId: number, datos: FotoDeProducto) =>
    onFijados(
      actuales.current.map((p) => (p.id === productoId ? { ...p, foto: datos.foto, fotoSinFondo: datos.fotoSinFondo } : p)),
    );

  const elegirBoton = (
    <Boton icono="plus" onClick={() => setElegir(true)}>
      Elegir productos
    </Boton>
  );
  const conDeshacer = puedeDeshacer(deshacer, ids);

  return (
    <Seccion
      titulo="Catálogo"
      extra={
        lista.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-texto-3" aria-label={`${lista.length} de ${tope} lugares usados`}>
              {lista.length} de {tope}
            </span>
            {elegirBoton}
          </div>
        )
      }
    >
      {selector}
      <ErrorMsg>{error}</ErrorMsg>
      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: c.tinte, color: c.oscuro }}>
            <Icon name="package" size={24} />
          </span>
          <p className="max-w-xs text-sm text-texto-2">Elegí qué productos de tu sistema se ven en tu página, con su precio de hoy.</p>
          {elegirBoton}
        </div>
      ) : (
        <>
          <Campo label="Título de la sección (opcional)">
            <Input
              aria-label="Título de la sección"
              value={titulo}
              onChange={(ev) => onTitulo(ev.target.value)}
              placeholder={`${TITULO_CATALOGO} · ej.: Nuestro menú, Productos`}
              maxLength={MAX_TITULO_CATALOGO}
            />
          </Campo>
          {onImagen && <SelectorImagenCatalogo imagen={imagen} onImagen={onImagen} c={c} />}
          <div className="space-y-2">
            {/* «Ordenar» acomoda la lista de una vez; las flechas de cada producto siguen ahí. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-texto-2">Orden en tu página</span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {conDeshacer && (
                  <Boton variante="ghost" className="!px-3 !py-1.5 text-[13px]" disabled={guardando} onClick={() => void volverAtras()}>
                    Deshacer
                  </Boton>
                )}
                <Boton
                  variante="ghost"
                  icono="lista"
                  className="!px-3 !py-1.5 text-[13px]"
                  disabled={guardando || lista.length < 2}
                  onClick={() => setOrdenar(true)}
                >
                  Ordenar
                </Boton>
              </span>
            </div>
            {conFoto && (
              <p className="text-xs text-texto-3">
                Tocá la imagen de un producto para subir o cambiar su foto; se guarda al toque.
                {conMenuDigital && " Es la foto del producto: si la cambiás acá, también cambia en tu menú digital."}
              </p>
            )}
            <ol className="divide-y divide-borde overflow-hidden rounded-xl border border-borde" aria-label="Productos en tu página">
              {lista.map((p, i) => (
                <FilaFijado
                  key={p.id}
                  p={p}
                  primero={i === 0}
                  ultimo={i === lista.length - 1}
                  guardando={guardando}
                  conFoto={conFoto}
                  c={c}
                  onSubir={() => void cambiarLista(moverA(ids, p.id, i - 1))}
                  onBajar={() => void cambiarLista(moverA(ids, p.id, i + 1))}
                  onQuitar={() => void cambiarLista(ids.filter((x) => x !== p.id), "Quitado de tu página")}
                  onFoto={(datos) => ponerFoto(p.id, datos)}
                  onError={setError}
                  onAviso={onAviso}
                />
              ))}
            </ol>
          </div>
          <p className="text-xs text-texto-4">
            {conFoto ? "El nombre, el precio, el ícono y la foto" : "El nombre, el precio y el ícono"} salen de tu sistema:
            si los cambiás allá, cambian acá. Si una {sucursal} tiene su propio precio o no ofrece un producto, tu página
            lo respeta.
            {ocultos > 0 &&
              ` ${ocultos === 1 ? "Uno está inactivo o dado de baja" : `${ocultos} están inactivos o dados de baja`}: no se ve${ocultos === 1 ? "" : "n"} hasta que lo${ocultos === 1 ? "" : "s"} reactives.`}
          </p>
        </>
      )}

      {elegir && (
        <SelectorProductos
          fijados={ids}
          noVendibles={lista.filter((p) => !p.vendible).map((p) => p.id)}
          tope={tope}
          c={c}
          onCerrar={() => setElegir(false)}
          onGuardar={async (nuevos) => {
            const ok = await cambiarLista(nuevos, "Productos guardados");
            if (ok) setElegir(false);
            return ok;
          }}
        />
      )}
      {ordenar && <OrdenarProductos lista={lista} c={c} onCerrar={() => setOrdenar(false)} onAplicar={(nuevos) => void aplicarOrden(nuevos)} />}
    </Seccion>
  );
}

/**
 * La imagen chica del producto en la lista: con «Foto», su foto (sin fondo,
 * entera sobre el tinte de la página; con fondo, llenando el cuadro); sin foto,
 * o si no carga, su ícono de siempre.
 */
function MiniaturaFijado({ p, lado, c }: { p: ProductoFijado; lado: number; c: Paleta }) {
  const src = urlDeImagen(p.foto ?? null);
  const [fallo, setFallo] = useState<string | null>(null);
  if (src && fallo !== src) {
    return p.fotoSinFondo ? (
      <span className="flex shrink-0 items-center justify-center rounded-xl" style={{ width: lado, height: lado, background: c.tinte }}>
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setFallo(src)}
          className="block object-contain"
          style={{ width: Math.round(lado * 0.9), height: Math.round(lado * 0.9) }}
        />
      </span>
    ) : (
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setFallo(src)}
        className="block shrink-0 rounded-xl object-cover"
        style={{ width: lado, height: lado }}
      />
    );
  }
  return <IconoProducto nombre={p.nombre} icono={p.icono} categoria={p.categoria} size={lado} />;
}

/**
 * Un producto fijado: su imagen, nombre y precio, y las flechas y la ✕ de
 * siempre. Con «Foto», la imagen es un botón para subir o cambiar la foto (la
 * misma del menú digital, se guarda al toque), con «Quitar foto» y el aviso de
 * si se le sacó el fondo, para poder deshacerlo sin elegir el archivo de nuevo
 * (como en el menú digital).
 */
function FilaFijado({
  p,
  primero,
  ultimo: esUltimo,
  guardando,
  conFoto,
  c,
  onSubir,
  onBajar,
  onQuitar,
  onFoto,
  onError,
  onAviso,
}: {
  p: ProductoFijado;
  primero: boolean;
  ultimo: boolean;
  guardando: boolean;
  conFoto: boolean;
  c: Paleta;
  onSubir: () => void;
  onBajar: () => void;
  onQuitar: () => void;
  onFoto: (datos: FotoDeProducto) => void;
  onError: (m: string) => void;
  onAviso: (t: string) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  // El último archivo elegido y qué se hizo con su fondo: con eso se puede
  // volver a subirlo con o sin fondo sin pedirle que lo elija otra vez.
  const [archivoElegido, setArchivoElegido] = useState<File | null>(null);
  const [fondo, setFondo] = useState<"quitado" | "con-fondo" | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const subir = async (f: File | undefined, sacarFondo = true) => {
    if (!f) return;
    setSubiendo(true);
    onError("");
    try {
      const preparada = await prepararFotoPlato(f, sacarFondo);
      onFoto(await apiPagina.subirFotoProducto(p.id, preparada.blob));
      setArchivoElegido(f);
      setFondo(preparada.fondoQuitado ? "quitado" : sacarFondo ? null : "con-fondo");
      onAviso("Foto guardada");
    } catch (e) {
      onError(mensaje(e, "No se pudo subir la foto"));
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  };
  const quitar = async () => {
    setSubiendo(true);
    onError("");
    try {
      onFoto(await apiPagina.quitarFotoProducto(p.id));
      setArchivoElegido(null);
      setFondo(null);
      onAviso("Foto quitada");
    } catch (e) {
      onError(mensaje(e, "No se pudo quitar la foto"));
    } finally {
      setSubiendo(false);
    }
  };

  const enlace = "font-semibold underline-offset-2 hover:underline disabled:opacity-50";
  const conAviso = conFoto && !!archivoElegido && fondo !== null;
  return (
    <li className={`px-3 py-2.5 ${p.vendible ? "" : "bg-muted"}`}>
      <div className="flex items-center gap-3">
        {conFoto ? (
          <button
            type="button"
            onClick={() => archivo.current?.click()}
            disabled={subiendo}
            aria-label={p.foto ? `Cambiar la foto de ${p.nombre}` : `Subir una foto de ${p.nombre}`}
            title={p.foto ? "Cambiar foto" : "Subir foto"}
            className={`relative shrink-0 rounded-xl ${p.vendible ? "" : "opacity-50"}`}
          >
            <MiniaturaFijado p={p} lado={40} c={c} />
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-texto text-white shadow">
              <Icon name={subiendo ? "relojArena" : "camara"} size={11} />
            </span>
          </button>
        ) : (
          <span className={p.vendible ? "" : "opacity-50"}>
            <IconoProducto nombre={p.nombre} icono={p.icono} categoria={p.categoria} size={40} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          {/* En dos renglones y no cortado en uno: en el celular, con las tres
              flechas al lado, quedaba «Coca Cola p…» y no se sabía cuál era
              (prueba de punta a punta, 16-nov). */}
          <span
            className={`line-clamp-2 text-sm font-semibold leading-snug [overflow-wrap:anywhere] ${p.vendible ? "text-texto" : "text-texto-3"}`}
          >
            {p.nombre}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-texto-3">
            <span style={{ color: p.vendible ? c.oscuro : undefined }} className="font-semibold">
              {formatoPrecio(p.precio) ?? "Sin precio"}
            </span>
            {p.categoria && <span className="truncate">{p.categoria}</span>}
            {!p.vendible && <Badge tono="amarillo">No se muestra</Badge>}
          </span>
        </span>
        {/* En el celular, 32 de ancho (no 36): la fila va dentro de la tarjeta
            y al nombre le quedaban 88 px. El alto sigue siendo de 36 para el dedo. */}
        <span className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            aria-label={`Subir ${p.nombre}`}
            title="Mover antes"
            disabled={guardando || primero}
            onClick={onSubir}
            className="flex h-9 w-8 items-center justify-center rounded-lg text-texto-2 hover:bg-muted disabled:opacity-30 sm:w-9"
          >
            <Icon name="arrowUp" size={17} />
          </button>
          <button
            type="button"
            aria-label={`Bajar ${p.nombre}`}
            title="Mover después"
            disabled={guardando || esUltimo}
            onClick={onBajar}
            className="flex h-9 w-8 items-center justify-center rounded-lg text-texto-2 hover:bg-muted disabled:opacity-30 sm:w-9"
          >
            <Icon name="arrowDown" size={17} />
          </button>
          <button
            type="button"
            aria-label={`Quitar ${p.nombre} de la página`}
            title="Quitar de la página"
            disabled={guardando}
            onClick={onQuitar}
            className="flex h-9 w-8 items-center justify-center rounded-lg text-texto-2 hover:bg-muted hover:text-danger-text disabled:opacity-30 sm:w-9"
          >
            <Icon name="x" size={17} />
          </button>
        </span>
      </div>
      {conFoto && (p.foto || conAviso) && (
        // Debajo del nombre, a todo el ancho que queda: en el celular no se aprieta con las flechas.
        <div className="mt-1 space-y-0.5 pl-[52px] text-[12px] text-texto-2">
          {/* Lo de sacarle el fondo se dice y se puede deshacer: la varita a veces
              se come el borde de un producto blanco sobre blanco. */}
          {conAviso && fondo === "quitado" && (
            <p>
              Le sacamos el fondo: en tu página sale sólo el producto.{" "}
              <button
                type="button"
                disabled={subiendo}
                onClick={() => void subir(archivoElegido ?? undefined, false)}
                className={`${enlace} text-primary-700`}
              >
                Dejarlo con su fondo
              </button>
            </p>
          )}
          {conAviso && fondo === "con-fondo" && (
            <p>
              Quedó con su fondo.{" "}
              <button
                type="button"
                disabled={subiendo}
                onClick={() => void subir(archivoElegido ?? undefined, true)}
                className={`${enlace} text-primary-700`}
              >
                Sacarle el fondo
              </button>
            </p>
          )}
          {p.foto && (
            <button type="button" disabled={subiendo} onClick={() => void quitar()} className={`${enlace} text-texto-3`}>
              Quitar foto
            </button>
          )}
        </div>
      )}
      {conFoto && (
        <input
          ref={archivo}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          aria-label={`Elegir la foto de ${p.nombre}`}
          onChange={(e) => void subir(e.target.files?.[0])}
        />
      )}
    </li>
  );
}

type FormaOrden = "alfabetico" | "categoria";

/**
 * «Ordenar» (16-nov): reacomoda toda la lista de una vez, A–Z o por categoría
 * (con las categorías en el orden que elija el dueño), y se guarda como
 * cualquier otro cambio de orden. Después se sigue con las flechas.
 */
function OrdenarProductos({
  lista,
  c,
  onCerrar,
  onAplicar,
}: {
  lista: ProductoFijado[];
  c: Paleta;
  onCerrar: () => void;
  onAplicar: (ids: number[]) => void;
}) {
  const categorias = categoriasDe(lista);
  const [forma, setForma] = useState<FormaOrden>(categorias.length > 1 ? "categoria" : "alfabetico");
  const [orden, setOrden] = useState<(string | null)[]>(() => rangoInicialCategorias(lista));
  const [dentro, setDentro] = useState<DentroDeCategoria>("actual");
  const porClave = new Map(categorias.map((x) => [x.clave, x]));
  // Si la lista cambió con la ventana abierta, las categorías nuevas van al final.
  const enOrden = [...orden.filter((k) => porClave.has(k)), ...categorias.map((x) => x.clave).filter((k) => !orden.includes(k))];
  const ids = lista.map((p) => p.id);
  const resultado = forma === "alfabetico" ? ordenAlfabetico(lista) : ordenPorCategoria(lista, enOrden, dentro);
  const igual = mismoOrden(resultado, ids);

  return (
    <Modal
      abierto
      titulo="Ordenar productos"
      subtitulo="Acomodá toda la lista de una vez."
      onClose={onCerrar}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton disabled={igual} onClick={() => onAplicar(resultado)}>
            Aplicar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="sr-only">Cómo ordenar</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <OpcionTarjeta
              nombre="forma-orden"
              titulo="Alfabético (A–Z)"
              texto="Por nombre, de la A a la Z."
              elegida={forma === "alfabetico"}
              onElegir={() => setForma("alfabetico")}
              c={c}
            />
            <OpcionTarjeta
              nombre="forma-orden"
              titulo="Por categoría"
              texto="Juntos los de cada categoría, en el orden que elijas."
              elegida={forma === "categoria"}
              onElegir={() => setForma("categoria")}
              c={c}
            />
          </div>
        </fieldset>

        {forma === "categoria" && (
          <>
            <div className="space-y-1.5">
              <p className="text-[13px] font-semibold text-texto-2">¿Qué categoría va primero?</p>
              <ol className="divide-y divide-borde overflow-hidden rounded-xl border border-borde" aria-label="Orden de las categorías">
                {enOrden.map((clave, i) => {
                  const cat = porClave.get(clave)!;
                  return (
                    <li key={clave ?? "\u0000sin"} className="flex items-center gap-2 px-3 py-2">
                      <span className="w-5 shrink-0 text-right text-xs font-semibold text-texto-4">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block break-words text-sm font-semibold ${clave === null ? "text-texto-3" : "text-texto"}`}>
                          {cat.nombre}
                        </span>
                        <span className="block text-xs text-texto-3">
                          {cat.cantidad === 1 ? "1 producto" : `${cat.cantidad} productos`}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Subir la categoría ${cat.nombre}`}
                          title="Antes"
                          disabled={i === 0}
                          onClick={() => setOrden(moverUno(enOrden, i, -1))}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted disabled:opacity-30"
                        >
                          <Icon name="arrowUp" size={17} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Bajar la categoría ${cat.nombre}`}
                          title="Después"
                          disabled={i === enOrden.length - 1}
                          onClick={() => setOrden(moverUno(enOrden, i, 1))}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted disabled:opacity-30"
                        >
                          <Icon name="arrowDown" size={17} />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold text-texto-2">Dentro de cada categoría</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {(
                  [
                    ["actual", "Como están ahora"],
                    ["alfabetico", "A–Z"],
                  ] as const
                ).map(([valor, texto]) => (
                  <label key={valor} className="flex cursor-pointer items-center gap-2 text-sm text-texto">
                    <input
                      type="radio"
                      name="dentro-categoria"
                      className="h-[18px] w-[18px] shrink-0"
                      style={{ accentColor: c.acento }}
                      checked={dentro === valor}
                      onChange={() => setDentro(valor)}
                    />
                    {texto}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        <div className="space-y-1">
          <p className="text-xs text-texto-4">Después podés seguir acomodando con las flechas.</p>
          {igual && <p className="text-xs text-texto-3">La lista ya está en este orden.</p>}
        </div>
      </div>
    </Modal>
  );
}

/** Cuánto espera el buscador después de la última tecla. */
const ESPERA_BUSQUEDA_MS = 250;
/** El backend no da más de 100 por pedido (`limite`). */
const LIMITE_BACKEND = 100;
/** Para «Desmarcar» con una búsqueda enorme: más que esto no se trae. */
const MAX_IDS = 1000;
/** El orden de la lista del selector, recordado en este navegador. */
const CLAVE_ORDEN = "bamardev.pagina.ordenSelector";

function leerOrden(): OrdenBuscador {
  try {
    return localStorage.getItem(CLAVE_ORDEN) === "nombre" ? "nombre" : "categoria";
  } catch {
    return "categoria";
  }
}

function recordarOrden(orden: OrdenBuscador) {
  try {
    localStorage.setItem(CLAVE_ORDEN, orden);
  } catch {
    // Sin storage (navegación privada): vale para esta vez.
  }
}

/**
 * El popup para elegir productos: buscador (en el backend, paginado: una
 * farmacia tiene miles) y una casilla por producto. Lo nuevo se suma al final
 * de la lista; lo que se destilda, se quita. Se guarda todo junto.
 *
 * 16-nov: «Marcar todo» (todos, o los que coinciden con la búsqueda, hasta el
 * tope) y la lista por categoría con un título por cada una, o A–Z.
 */
function SelectorProductos({
  fijados,
  noVendibles,
  tope,
  c,
  onCerrar,
  onGuardar,
}: {
  fijados: number[];
  /** Fijados que hoy no se venden: no aparecen en la lista, y «Desmarcar todos» no los toca. */
  noVendibles: number[];
  tope: number;
  c: Paleta;
  onCerrar: () => void;
  onGuardar: (ids: number[]) => Promise<boolean>;
}) {
  const [elegidos, setElegidos] = useState<number[]>(fijados);
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<OrdenBuscador>(leerOrden);
  const [resultados, setResultados] = useState<ProductoParaPagina[]>([]);
  const [total, setTotal] = useState(0);
  // Lo que de verdad muestra la lista: con qué búsqueda y orden se pidió, y si vino agrupada.
  const [mostrado, setMostrado] = useState<{ q: string; orden: OrdenBuscador; agrupado: boolean }>({
    q: "",
    orden,
    agrupado: false,
  });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [avisoTope, setAvisoTope] = useState("");
  // Todos los ids de una búsqueda, cuando se conocen enteros (para el estado de «Marcar todo»).
  const [todosIds, setTodosIds] = useState<{ clave: string; ids: number[] } | null>(null);
  const pedido = useRef(0);
  const elegidosAhora = useRef(elegidos);
  elegidosAhora.current = elegidos;

  const traer = async (texto: string, desde: number) => {
    const mio = ++pedido.current;
    setCargando(true);
    setError("");
    try {
      const r = await apiPagina.buscarProductosCatalogo(texto, desde, { orden });
      if (mio !== pedido.current) return;
      setResultados((antes) => (desde === 0 ? r.items : [...antes, ...r.items]));
      setTotal(r.total);
      // Un backend anterior no dice el orden: por nombre, sin títulos.
      setMostrado({ q: texto.trim(), orden, agrupado: r.orden === "categoria" });
    } catch (e) {
      if (mio === pedido.current) setError(mensaje(e, "No se pudieron traer tus productos"));
    } finally {
      if (mio === pedido.current) setCargando(false);
    }
  };

  // Una búsqueda por pausa al teclear, no una por tecla; y otra al cambiar el orden.
  useEffect(() => {
    const t = setTimeout(() => void traer(q, 0), q ? ESPERA_BUSQUEDA_MS : 0);
    return () => clearTimeout(t);
    // `traer` es nueva en cada render: lo que manda es la búsqueda y el orden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, orden]);

  /** Los ids de una búsqueda en el orden de la lista, de a 100, hasta `hasta` (o hasta que no haya más). */
  const traerIds = async (texto: string, ordenLista: OrdenBuscador, hasta: number) => {
    const ids: number[] = [];
    let totalBusqueda = Number.POSITIVE_INFINITY;
    while (ids.length < Math.min(hasta, totalBusqueda, MAX_IDS)) {
      const r = await apiPagina.buscarProductosCatalogo(texto, ids.length, {
        limite: Math.min(LIMITE_BACKEND, hasta - ids.length),
        orden: ordenLista,
      });
      totalBusqueda = r.total;
      ids.push(...r.items.map((p) => p.id));
      if (r.items.length === 0) break;
    }
    return { ids, total: Math.min(totalBusqueda, Number.MAX_SAFE_INTEGER) };
  };

  const lleno = elegidos.length >= tope;
  const alternar = (id: number) => {
    setAvisoTope("");
    setElegidos((antes) => (antes.includes(id) ? antes.filter((x) => x !== id) : antes.length >= tope ? antes : [...antes, id]));
  };
  const cambio = elegidos.length !== fijados.length || elegidos.some((id, i) => id !== fijados[i]);

  // «Marcar todo»: sobre lo que muestra la lista (la búsqueda ya aplicada).
  const claveMostrada = `${mostrado.orden}|${mostrado.q}`;
  const idsMostrados = resultados.map((p) => p.id);
  const conocidos: number[] | null =
    resultados.length >= total ? idsMostrados : todosIds?.clave === claveMostrada ? todosIds.ids : null;
  const elegidosSet = new Set(elegidos);
  const marcadosAca = (conocidos ?? idsMostrados).filter((id) => elegidosSet.has(id)).length;
  const todosMarcados = !!conocidos && conocidos.length > 0 && marcadosAca === conocidos.length;
  const algunos = marcadosAca > 0 && !todosMarcados;
  // Lleno, ya no se puede sumar: tocarla desmarca (si no, no habría cómo salir).
  const desmarcar = todosMarcados || (lleno && marcadosAca > 0);
  const cuales = mostrado.q ? (total === 1 ? "el que coincide" : `los ${total} que coinciden`) : "todos";
  const etiquetaTodo = `${desmarcar ? "Desmarcar" : "Marcar"} ${cuales}`;

  const alternarTodo = async () => {
    const texto = mostrado.q;
    const ordenLista = mostrado.orden;
    const clave = claveMostrada;
    setError("");
    setAvisoTope("");
    setMarcando(true);
    try {
      if (desmarcar) {
        let fuera: Set<number> | null = conocidos ? new Set(conocidos) : null;
        if (!fuera && texto) {
          const r = await traerIds(texto, ordenLista, total);
          if (r.ids.length >= r.total) setTodosIds({ clave, ids: r.ids });
          fuera = new Set(r.ids);
        }
        // Sin búsqueda son todos los productos a la venta: quedan sólo los que hoy no se venden.
        setElegidos((antes) => (fuera ? antes.filter((id) => !fuera.has(id)) : antes.filter((id) => noVendibles.includes(id))));
        return;
      }
      const r = conocidos ? { ids: conocidos, total: conocidos.length } : await traerIds(texto, ordenLista, tope);
      if (!conocidos && r.ids.length >= r.total) setTodosIds({ clave, ids: r.ids });
      const antes = elegidosAhora.current;
      const ya = new Set(antes);
      const nuevos = r.ids.filter((id) => !ya.has(id));
      const suman = nuevos.slice(0, Math.max(0, tope - antes.length));
      if (suman.length > 0) setElegidos([...antes, ...suman]);
      if (suman.length > 0 && (suman.length < nuevos.length || r.ids.length < r.total)) {
        setAvisoTope(`${suman.length === 1 ? "Se marcó 1" : `Se marcaron ${suman.length}`}: llegaste al máximo de ${tope}.`);
      }
    } catch (e) {
      setError(mensaje(e, "No se pudieron traer tus productos"));
    } finally {
      setMarcando(false);
    }
  };

  const opcionesOrden: { valor: OrdenBuscador; texto: string }[] = [
    { valor: "categoria", texto: "Por categoría" },
    { valor: "nombre", texto: "A–Z" },
  ];

  return (
    <Modal
      abierto
      titulo="Elegir productos"
      subtitulo={`${elegidos.length} de ${tope} elegidos`}
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            disabled={guardando || !cambio}
            onClick={async () => {
              setGuardando(true);
              const ok = await onGuardar(elegidos);
              if (!ok) setGuardando(false);
            }}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-texto-4">
            <Icon name="search" size={17} />
          </span>
          <Input
            aria-label="Buscar productos"
            type="search"
            className="pl-10"
            placeholder="Buscar por nombre"
            value={q}
            onChange={(e) => {
              setAvisoTope("");
              setQ(e.target.value);
            }}
            autoFocus
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-texto-3">Orden:</span>
          <div role="radiogroup" aria-label="Orden de la lista" className="inline-flex rounded-lg bg-muted p-0.5">
            {opcionesOrden.map((o) => {
              const elegida = orden === o.valor;
              return (
                <button
                  key={o.valor}
                  type="button"
                  role="radio"
                  aria-checked={elegida}
                  onClick={() => {
                    if (elegida) return;
                    setOrden(o.valor);
                    recordarOrden(o.valor);
                  }}
                  className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                    elegida ? "bg-white font-semibold text-texto shadow-sm" : "text-texto-3 hover:text-texto-2"
                  }`}
                >
                  {o.texto}
                </button>
              );
            })}
          </div>
        </div>
        <ErrorMsg>{error}</ErrorMsg>
        {avisoTope ? (
          <p className="text-xs text-warning-text">{avisoTope}</p>
        ) : (
          lleno && <p className="text-xs text-warning-text">Llegaste al máximo de {tope}. Quitá alguno para sumar otro.</p>
        )}
        <div className="overflow-hidden rounded-xl border border-borde">
          {resultados.length > 0 && (
            <label
              className={`flex items-center gap-3 border-b border-borde bg-muted px-3 py-2.5 ${
                marcando || (!desmarcar && lleno) ? "opacity-60" : "cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                ref={(el) => {
                  if (el) el.indeterminate = algunos;
                }}
                className="h-[18px] w-[18px] shrink-0"
                style={{ accentColor: c.acento }}
                checked={todosMarcados}
                disabled={marcando || guardando || total === 0 || (!desmarcar && lleno)}
                onChange={() => void alternarTodo()}
              />
              <span className="min-w-0 flex-1 text-sm font-semibold text-texto">{etiquetaTodo}</span>
              {marcando && <span className="shrink-0 text-xs text-texto-3">Un momento…</span>}
            </label>
          )}
          <ul className="max-h-[50vh] divide-y divide-borde overflow-y-auto" aria-label="Tus productos">
            {resultados.map((p, i) => {
              const marcado = elegidosSet.has(p.id);
              const categoria = claveCategoria(p.categoria);
              const titulo = mostrado.agrupado && (i === 0 || claveCategoria(resultados[i - 1].categoria) !== categoria);
              return (
                <Fragment key={p.id}>
                  {titulo && (
                    <li role="presentation" className="sticky top-0 z-[1] bg-white px-3 pb-1.5 pt-2.5">
                      <h3 className="break-words text-[11px] font-bold uppercase tracking-wide text-texto-3">
                        {nombreCategoria(categoria)}
                      </h3>
                    </li>
                  )}
                  <li>
                    <label className={`flex items-center gap-3 px-3 py-2.5 ${!marcado && lleno ? "opacity-50" : "cursor-pointer hover:bg-muted"}`}>
                      <input
                        type="checkbox"
                        className="h-[18px] w-[18px] shrink-0"
                        style={{ accentColor: c.acento }}
                        checked={marcado}
                        disabled={!marcado && lleno}
                        onChange={() => alternar(p.id)}
                        aria-label={p.nombre}
                      />
                      <IconoProducto nombre={p.nombre} icono={p.icono} categoria={p.categoria} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-texto">{p.nombre}</span>
                        {/* Con títulos por categoría, repetirla en cada uno sobra. */}
                        {p.categoria && !mostrado.agrupado && <span className="block truncate text-xs text-texto-3">{p.categoria}</span>}
                      </span>
                      <span className="shrink-0 text-sm font-semibold" style={{ color: c.oscuro }}>
                        {formatoPrecio(p.precio) ?? <span className="text-xs font-normal text-texto-4">Sin precio</span>}
                      </span>
                    </label>
                  </li>
                </Fragment>
              );
            })}
            {!cargando && resultados.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-texto-3">
                {q.trim() ? `No hay productos a la venta que se llamen «${q.trim()}».` : "No tenés productos a la venta."}
              </li>
            )}
            {cargando && <li className="px-3 py-4 text-center text-sm text-texto-3">Buscando…</li>}
          </ul>
        </div>
        {!cargando && resultados.length < total && (
          <div className="flex justify-center">
            <Boton variante="ghost" className="!px-3 !py-1.5 text-[13px]" onClick={() => void traer(q, resultados.length)}>
              Ver más ({total - resultados.length})
            </Boton>
          </div>
        )}
        <p className="text-xs text-texto-4">Sólo aparecen los productos a la venta: ni insumos ni los dados de baja.</p>
      </div>
    </Modal>
  );
}
