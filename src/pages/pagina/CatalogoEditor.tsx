import { useEffect, useRef, useState, type PointerEvent as EventoPuntero } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Campo, Confirmar, ErrorMsg, Input, Modal } from "../../components/ui";
import { apiPagina, urlDeImagen } from "../../lib/pagina/apiPagina";
import { ICONO_BOTON, type Paleta } from "../../lib/pagina/aspecto";
import {
  formatoPrecio,
  MAX_DESCRIPCION_ITEM,
  MAX_TITULO_CATALOGO,
  MAX_TITULO_ITEM,
  moverA,
  TITULO_CATALOGO,
  validarItem,
  type ErroresItem,
} from "../../lib/pagina/catalogo";
import { prepararImagen } from "../../lib/pagina/imagen";
import type { ItemCatalogoEditor, ItemCatalogoInput } from "../../lib/pagina/tipos";
import Seccion from "./Seccion";
import { Trazo } from "./VistaPagina";

/**
 * El catálogo en "Mi página" (08-oct): una galería general de fotos con
 * título y precio opcional, para cualquier rubro.
 *
 * Pedido del dueño de BamarDev: la pantalla limpia. A la vista sólo la grilla
 * (cada tarjeta, su foto, su título y su precio) y UN botón "Agregar"; tocar
 * una tarjeta abre el popup con todo lo demás. El orden se cambia arrastrando
 * (en el celular, desde el asa ⠿, para no pelear con el scroll) o con "Mover
 * antes / después" en el popup, que es lo que se usa con el teclado.
 *
 * Los ítems se guardan al toque, como los enlaces. Sólo el título de la
 * sección va al borrador de la página y se guarda con "Guardar cambios".
 */

const mensaje = (e: unknown, defecto = "No se pudo guardar") => (e instanceof Error ? e.message : defecto);

/** El orden local tal como lo va a guardar el backend (1, 2, 3…). */
const conOrden = (lista: ItemCatalogoEditor[]) => lista.map((x, i) => ({ ...x, orden: i + 1 }));

/**
 * El contenedor que scrollea (en la app, el `<main>`; si no hay, la ventana):
 * al arrastrar hacia un borde, la grilla se corre sola.
 */
function contenedorScroll(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === "auto" || overflowY === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

interface Arrastre {
  id: number;
  /** Dónde se agarró la tarjeta, para que siga al dedo sin saltar. */
  dx: number;
  dy: number;
  ancho: number;
  alto: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  movido: boolean;
  orden: number[];
  scroll: HTMLElement | null;
  cuadro: number | null;
}

export interface PropsCatalogo {
  items: ItemCatalogoEditor[];
  tope: number;
  /** El título del borrador ("" = sin título propio). */
  titulo: string;
  onTitulo: (t: string) => void;
  /** Cambia la lista partiendo de la última (no de la que vio este render). */
  onItems: (cambio: (actuales: ItemCatalogoEditor[]) => ItemCatalogoEditor[]) => void;
  c: Paleta;
  onAviso: (t: string) => void;
}

export default function CatalogoEditor({ items, tope, titulo, onTitulo, onItems, c, onAviso }: PropsCatalogo) {
  const [editor, setEditor] = useState<{ item: ItemCatalogoEditor | null } | null>(null);
  const [aQuitar, setAQuitar] = useState<ItemCatalogoEditor | null>(null);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState("");
  // Durante el arrastre: el orden en vivo y la tarjeta que sigue al puntero.
  const [vivo, setVivo] = useState<number[] | null>(null);
  const [fantasma, setFantasma] = useState<{ id: number; x: number; y: number; ancho: number; alto: number } | null>(null);
  const celdas = useRef(new Map<number, HTMLLIElement>());
  const arrastre = useRef<Arrastre | null>(null);
  const suprimirClic = useRef(false);
  const ultimoOrden = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const limpiar = useRef<(() => void) | null>(null);

  // Si el editor se desmonta a mitad de un arrastre, no quedan listeners colgados.
  useEffect(() => () => limpiar.current?.(), []);

  const lleno = items.length >= tope;
  const porId = new Map(items.map((x) => [x.id, x]));
  const lista = (vivo ?? items.map((x) => x.id)).map((id) => porId.get(id)).filter((x): x is ItemCatalogoEditor => !!x);

  /**
   * Optimista: el orden nuevo se ve al instante y se guarda atrás. Si falla,
   * vuelve el de antes. Sólo la última respuesta manda: con varios toques
   * seguidos, una vieja no pisa a la nueva.
   */
  const reordenar = async (ids: number[]): Promise<string | null> => {
    const antes = itemsRef.current;
    const mio = ++ultimoOrden.current;
    onItems((actuales) => {
      const m = new Map(actuales.map((x) => [x.id, x]));
      return conOrden(ids.map((id) => m.get(id)).filter((x): x is ItemCatalogoEditor => !!x));
    });
    try {
      const guardados = await apiPagina.ordenarCatalogo(ids);
      if (mio === ultimoOrden.current) onItems(() => guardados);
      return null;
    } catch (err) {
      if (mio === ultimoOrden.current) onItems(() => antes);
      return mensaje(err, "No se pudo cambiar el orden");
    }
  };

  const mover = async (id: number, delta: number): Promise<string | null> => {
    const ids = itemsRef.current.map((x) => x.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return null;
    return reordenar(moverA(ids, id, j));
  };

  // ── Arrastre con puntero (mouse, dedo y lápiz) ──

  /** Si el puntero está sobre otra tarjeta, la arrastrada pasa a su lugar. */
  const ubicar = () => {
    const a = arrastre.current;
    if (!a) return;
    for (const [id, el] of celdas.current) {
      if (id === a.id) continue;
      const r = el.getBoundingClientRect();
      if (a.x >= r.left && a.x <= r.right && a.y >= r.top && a.y <= r.bottom) {
        const destino = a.orden.indexOf(id);
        if (destino < 0) return;
        a.orden = moverA(a.orden, a.id, destino);
        setVivo(a.orden);
        return;
      }
    }
  };

  /** Cerca del borde de arriba o de abajo, la pantalla se corre sola. */
  const correrSola = () => {
    const a = arrastre.current;
    if (!a) return;
    const borde = a.scroll ? a.scroll.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const margen = 64;
    const paso = a.y < borde.top + margen ? -14 : a.y > borde.bottom - margen ? 14 : 0;
    if (paso) {
      if (a.scroll) a.scroll.scrollTop += paso;
      else window.scrollBy(0, paso);
      ubicar();
    }
    a.cuadro = requestAnimationFrame(correrSola);
  };

  const empezar = (e: EventoPuntero<HTMLElement>, id: number, desdeAsa: boolean) => {
    // Con el dedo sólo desde el asa: arrastrar la tarjeta es scrollear la página.
    if (!desdeAsa && e.pointerType !== "mouse") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (arrastre.current) return;
    const celda = celdas.current.get(id);
    if (!celda) return;
    if (desdeAsa) {
      e.preventDefault();
      e.stopPropagation();
      // El dedo queda atado al asa aunque salga de ella. Si el puntero ya no
      // está activo el navegador tira; el arrastre igual anda con la ventana.
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* sigue sin captura */
      }
    }
    const r = celda.getBoundingClientRect();
    arrastre.current = {
      id,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      ancho: r.width,
      alto: r.height,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      movido: false,
      orden: itemsRef.current.map((x) => x.id),
      scroll: contenedorScroll(celda),
      cuadro: null,
    };

    const alMover = (ev: PointerEvent) => {
      const a = arrastre.current;
      if (!a || ev.pointerId !== e.pointerId) return;
      a.x = ev.clientX;
      a.y = ev.clientY;
      if (!a.movido) {
        // Un temblor al tocar no es un arrastre: sigue siendo un toque.
        if (Math.hypot(a.x - a.x0, a.y - a.y0) < 6) return;
        a.movido = true;
        setVivo(a.orden);
        a.cuadro = requestAnimationFrame(correrSola);
      }
      ubicar();
      setFantasma({ id: a.id, x: a.x - a.dx, y: a.y - a.dy, ancho: a.ancho, alto: a.alto });
    };
    const terminar = (guardar: boolean) => {
      limpiar.current?.();
      const a = arrastre.current;
      arrastre.current = null;
      setFantasma(null);
      setVivo(null);
      if (!a?.movido) return;
      // El clic que sigue al soltar no tiene que abrir el popup.
      suprimirClic.current = true;
      setTimeout(() => (suprimirClic.current = false), 0);
      const antes = itemsRef.current.map((x) => x.id);
      if (!guardar || a.orden.join() === antes.join()) return;
      setError("");
      void reordenar(a.orden).then((m) => m && setError(m));
    };
    const alSoltar = (ev: PointerEvent) => ev.pointerId === e.pointerId && terminar(true);
    const alCancelar = (ev: PointerEvent) => ev.pointerId === e.pointerId && terminar(false);
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
    window.addEventListener("pointercancel", alCancelar);
    limpiar.current = () => {
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("pointercancel", alCancelar);
      const cuadro = arrastre.current?.cuadro;
      if (cuadro != null) cancelAnimationFrame(cuadro);
      limpiar.current = null;
    };
  };

  const abrir = (item: ItemCatalogoEditor | null) => {
    if (suprimirClic.current) return;
    setError("");
    setEditor({ item });
  };

  const agregar = (
    <Boton icono="plus" onClick={() => abrir(null)} disabled={lleno} title={lleno ? `Llegaste al máximo de ${tope}` : undefined}>
      Agregar
    </Boton>
  );
  const arrastrado = fantasma ? porId.get(fantasma.id) : undefined;

  return (
    <Seccion
      titulo="Catálogo"
      extra={
        items.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-texto-3" aria-label={`${items.length} de ${tope} lugares usados`}>
              {items.length} de {tope}
            </span>
            {agregar}
          </div>
        )
      }
    >
      <ErrorMsg>{error}</ErrorMsg>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: c.tinte }}>
            <Trazo d={ICONO_BOTON.foto} color={c.oscuro} size={24} />
          </span>
          <p className="max-w-xs text-sm text-texto-2">Mostrá lo que hacés o vendés, con foto y precio.</p>
          {agregar}
        </div>
      ) : (
        <>
          <Campo label="Título de la sección (opcional)">
            <Input
              aria-label="Título de la sección"
              value={titulo}
              onChange={(ev) => onTitulo(ev.target.value)}
              placeholder={`${TITULO_CATALOGO} · ej.: Nuestros trabajos, Menú`}
              maxLength={MAX_TITULO_CATALOGO}
            />
          </Campo>
          <ul className="grid select-none grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Ítems del catálogo">
            {lista.map((x) => (
              <li
                key={x.id}
                ref={(el) => {
                  if (el) celdas.current.set(x.id, el);
                  else celdas.current.delete(x.id);
                }}
                className="relative"
                onPointerDown={(ev) => empezar(ev, x.id, false)}
              >
                {fantasma?.id === x.id ? (
                  // Donde va a caer: un hueco con el color de la página.
                  <div
                    className="rounded-xl border-2 border-dashed"
                    style={{ height: fantasma.alto, borderColor: c.acento, background: c.tinte }}
                    aria-hidden="true"
                  />
                ) : (
                  <Tarjeta item={x} c={c} onAbrir={() => abrir(x)} />
                )}
                {fantasma?.id !== x.id && (
                  <span
                    aria-hidden="true"
                    title="Arrastrá para cambiar el orden"
                    onPointerDown={(ev) => empezar(ev, x.id, true)}
                    className="absolute right-1.5 top-1.5 flex h-9 w-9 cursor-grab touch-none items-center justify-center rounded-full bg-white/95 text-lg leading-none text-texto-2 shadow-md active:cursor-grabbing"
                    style={{ WebkitTouchCallout: "none" }}
                  >
                    ⠿
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-texto-4">Tocá una foto para editarla. Para ordenarlas, arrastralas desde ⠿.</p>
        </>
      )}

      {fantasma && arrastrado && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rotate-2 opacity-95 shadow-2xl"
          style={{ left: fantasma.x, top: fantasma.y, width: fantasma.ancho, height: fantasma.alto }}
        >
          <Tarjeta item={arrastrado} c={c} />
        </div>
      )}

      {editor && (
        <EditorItem
          item={editor.item}
          lista={items}
          c={c}
          onCerrar={() => setEditor(null)}
          onGuardado={(it, nuevo) =>
            onItems((actuales) => (nuevo ? [...actuales, it] : actuales.map((x) => (x.id === it.id ? it : x))))
          }
          onAviso={onAviso}
          onMover={mover}
          onQuitar={(it) => {
            setEditor(null);
            setAQuitar(it);
          }}
        />
      )}
      <Confirmar
        abierto={aQuitar !== null}
        titulo="Quitar del catálogo"
        texto={`¿Quitar «${aQuitar?.titulo ?? ""}» de tu catálogo? Se borra con su foto.`}
        etiquetaOk="Quitar"
        peligroso
        procesando={quitando}
        onCancel={() => setAQuitar(null)}
        onOk={async () => {
          const it = aQuitar;
          if (!it) return;
          setQuitando(true);
          setError("");
          try {
            await apiPagina.borrarItemCatalogo(it.id);
            onItems((actuales) => conOrden(actuales.filter((x) => x.id !== it.id)));
            onAviso("Quitado del catálogo");
          } catch (err) {
            setError(mensaje(err, "No se pudo quitar"));
          } finally {
            setQuitando(false);
            setAQuitar(null);
          }
        }}
      />
    </Seccion>
  );
}

/** La tarjeta de la grilla: foto, título y precio. Tocarla abre el popup. */
function Tarjeta({ item, c, onAbrir }: { item: ItemCatalogoEditor; c: Paleta; onAbrir?: () => void }) {
  const foto = urlDeImagen(item.fotoUrl);
  const precio = formatoPrecio(item.precio, item.precioDesde);
  return (
    <button
      type="button"
      aria-label={`Editar ${item.titulo}${item.visible ? "" : " (oculto)"}`}
      onClick={onAbrir}
      tabIndex={onAbrir ? undefined : -1}
      className={`flex w-full flex-col overflow-hidden rounded-xl border border-borde bg-white text-left transition-shadow hover:shadow-md ${item.visible ? "" : "opacity-60"}`}
    >
      <span className="relative block aspect-square w-full overflow-hidden" style={{ background: c.tinte }}>
        {foto ? (
          <img src={foto} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-4xl font-bold" style={{ color: c.oscuro }}>
            {item.titulo.trim().charAt(0).toUpperCase()}
          </span>
        )}
        {!item.visible && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-slate-800/85 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            Oculto
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <span className="truncate text-sm font-semibold text-texto">{item.titulo}</span>
        {precio && (
          <span className="text-[13px] font-semibold" style={{ color: c.oscuro }}>
            {precio}
          </span>
        )}
      </span>
    </button>
  );
}

/** La foto elegida y achicada, que se sube recién con "Guardar". */
type FotoNueva = { blob: Blob; url: string | null };

/**
 * El popup de un ítem: alta o edición. Todo se manda con "Guardar" (también
 * la foto: elegir una y cancelar no cambia nada). Al agregar con foto, primero
 * se crea el ítem y después se sube la foto; si la foto falla, el ítem queda
 * creado y el popup sigue abierto, ya editándolo, para reintentar sin
 * duplicarlo.
 */
function EditorItem({
  item,
  lista,
  c,
  onCerrar,
  onGuardado,
  onAviso,
  onMover,
  onQuitar,
}: {
  item: ItemCatalogoEditor | null;
  lista: ItemCatalogoEditor[];
  c: Paleta;
  onCerrar: () => void;
  onGuardado: (item: ItemCatalogoEditor, nuevo: boolean) => void;
  onAviso: (t: string) => void;
  onMover: (id: number, delta: number) => Promise<string | null>;
  onQuitar: (item: ItemCatalogoEditor) => void;
}) {
  const [actual, setActual] = useState(item);
  const [tituloItem, setTituloItem] = useState(item?.titulo ?? "");
  // 50.5 se muestra 50.50, como se escribe un precio.
  const [precio, setPrecio] = useState(
    item?.precio == null ? "" : Number.isInteger(item.precio) ? String(item.precio) : item.precio.toFixed(2),
  );
  const [desde, setDesde] = useState(item?.precioDesde ?? false);
  const [descripcion, setDescripcion] = useState(item?.descripcion ?? "");
  const [visible, setVisible] = useState(item?.visible ?? true);
  const [foto, setFoto] = useState<FotoNueva | null>(null);
  const [quitarFoto, setQuitarFoto] = useState(false);
  const [errores, setErrores] = useState<ErroresItem>({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [moviendo, setMoviendo] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // La vista previa local de la foto se libera al cambiarla o al cerrar.
  useEffect(() => {
    const url = foto?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [foto]);

  const elegir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setPreparando(true);
    setError("");
    try {
      const blob = await prepararImagen(archivo, "catalogo");
      const url = typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : null;
      setFoto({ blob, url });
      setQuitarFoto(false);
    } catch (e) {
      setError(mensaje(e, "No se pudo leer la foto"));
    } finally {
      setPreparando(false);
      if (input.current) input.current.value = "";
    }
  };

  const guardar = async () => {
    const v = validarItem({ titulo: tituloItem, precio, descripcion });
    setErrores(v.errores);
    if (Object.keys(v.errores).length > 0) return;
    const datos = {
      titulo: tituloItem.trim(),
      descripcion: descripcion.trim() || null,
      precio: v.precio,
      precioDesde: v.precio != null && desde,
      visible,
    };
    setGuardando(true);
    setError("");
    const esAlta = !actual;
    let it = actual;
    try {
      if (!it) {
        const alta: ItemCatalogoInput = {
          titulo: datos.titulo,
          precio: datos.precio,
          precioDesde: datos.precioDesde,
          visible: datos.visible,
        };
        if (datos.descripcion) alta.descripcion = datos.descripcion;
        it = await apiPagina.crearItemCatalogo(alta);
        setActual(it);
        onGuardado(it, true);
      } else {
        // Sólo lo que cambió (PATCH parcial).
        const cambios: Partial<ItemCatalogoInput> = {};
        if (datos.titulo !== it.titulo) cambios.titulo = datos.titulo;
        if (datos.descripcion !== (it.descripcion ?? null)) cambios.descripcion = datos.descripcion;
        if (datos.precio !== it.precio) cambios.precio = datos.precio;
        if (datos.precioDesde !== it.precioDesde) cambios.precioDesde = datos.precioDesde;
        if (datos.visible !== it.visible) cambios.visible = datos.visible;
        if (Object.keys(cambios).length > 0) {
          it = await apiPagina.editarItemCatalogo(it.id, cambios);
          setActual(it);
          onGuardado(it, false);
        }
      }
    } catch (e) {
      setError(mensaje(e));
      setGuardando(false);
      return;
    }
    try {
      if (foto) {
        it = await apiPagina.subirFotoCatalogo(it.id, foto.blob);
        setFoto(null);
        setActual(it);
        onGuardado(it, false);
      } else if (quitarFoto && it.fotoUrl) {
        it = await apiPagina.borrarFotoCatalogo(it.id);
        setQuitarFoto(false);
        setActual(it);
        onGuardado(it, false);
      }
    } catch (e) {
      setError(
        esAlta
          ? `Se agregó al catálogo, pero la foto no se pudo subir: ${mensaje(e)}. Probá de nuevo con «Guardar».`
          : `La foto no se pudo guardar: ${mensaje(e)}`,
      );
      setGuardando(false);
      return;
    }
    setGuardando(false);
    onAviso(esAlta ? "Agregado al catálogo" : "Cambios guardados");
    onCerrar();
  };

  const mover = async (delta: number) => {
    if (!actual) return;
    setMoviendo(true);
    setError("");
    const m = await onMover(actual.id, delta);
    setMoviendo(false);
    if (m) setError(m);
  };

  const fotoActual = foto ? foto.url : quitarFoto ? null : urlDeImagen(actual?.fotoUrl ?? null);
  const hayFoto = !!foto || (!quitarFoto && !!actual?.fotoUrl);
  const indice = actual ? lista.findIndex((x) => x.id === actual.id) : -1;
  const ocupado = guardando || preparando;

  return (
    <Modal
      abierto
      titulo={actual ? "Editar" : "Agregar al catálogo"}
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          {actual && (
            <Boton variante="ghost" className="mr-auto !text-danger-text" onClick={() => onQuitar(actual)} disabled={ocupado}>
              Quitar del catálogo
            </Boton>
          )}
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={() => void guardar()} disabled={ocupado}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorMsg>{error}</ErrorMsg>

        <div className="space-y-2">
          <div
            className="mx-auto flex aspect-square w-full max-w-[260px] items-center justify-center overflow-hidden rounded-xl"
            style={{ background: c.tinte }}
          >
            {fotoActual ? (
              <img src={fotoActual} alt="Foto del ítem" className="h-full w-full object-contain" />
            ) : hayFoto ? (
              // Elegida pero sin vista previa (el navegador no la puede mostrar): igual se sube.
              <span className="text-sm font-semibold" style={{ color: c.oscuro }}>
                Foto lista para subir
              </span>
            ) : (
              <span className="flex flex-col items-center gap-1.5 text-sm" style={{ color: c.oscuro }}>
                <Trazo d={ICONO_BOTON.foto} color={c.oscuro} size={32} />
                Sin foto
              </span>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Boton variante="ghost" icono="camara" className="!px-3 !py-1.5 text-[13px]" onClick={() => input.current?.click()} disabled={ocupado}>
              {preparando ? "Preparando…" : hayFoto ? "Cambiar foto" : "Subir foto"}
            </Boton>
            {hayFoto && (
              <Boton
                variante="ghost"
                className="!px-3 !py-1.5 text-[13px]"
                disabled={ocupado}
                onClick={() => {
                  setFoto(null);
                  setQuitarFoto(true);
                }}
              >
                Quitar foto
              </Boton>
            )}
          </div>
          <p className="text-center text-xs text-texto-3">
            Si en la foto se reconoce a una persona, pedile permiso antes de publicarla.
          </p>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Elegir foto"
            onChange={(e) => void elegir(e.target.files?.[0])}
          />
        </div>

        <Campo label="Título" error={errores.titulo}>
          <Input
            aria-label="Título"
            value={tituloItem}
            onChange={(e) => setTituloItem(e.target.value)}
            maxLength={MAX_TITULO_ITEM}
            placeholder="Ej.: Uñas acrílicas, Corte clásico, Pollo entero"
          />
        </Campo>

        <div className="grid items-start gap-3 sm:grid-cols-2">
          <Campo label="Precio (opcional)" error={errores.precio} hint={errores.precio ? undefined : "Vacío: no se muestra precio."}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm font-semibold text-texto-3">
                Bs
              </span>
              <Input
                aria-label="Precio"
                type="number"
                className="pl-10"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="80"
              />
            </div>
          </Campo>
          <label className={`flex items-center gap-2.5 text-sm sm:mt-8 ${precio.trim() ? "text-texto-2" : "text-texto-4"}`}>
            <input
              type="checkbox"
              className="h-[18px] w-[18px]"
              style={{ accentColor: c.acento }}
              checked={desde && !!precio.trim()}
              disabled={!precio.trim()}
              onChange={(e) => setDesde(e.target.checked)}
            />
            <span>
              Es precio desde
              <span className="block text-xs text-texto-4">
                Se ve «{formatoPrecio(validarItem({ titulo: "x", precio, descripcion: "" }).precio ?? 80, true)}»
              </span>
            </span>
          </label>
        </div>

        <Campo
          label="Descripción (opcional)"
          error={errores.descripcion}
          hint={`${descripcion.length} de ${MAX_DESCRIPCION_ITEM} caracteres`}
        >
          <textarea
            aria-label="Descripción"
            rows={2}
            maxLength={MAX_DESCRIPCION_ITEM}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full resize-y rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
            placeholder="Qué incluye, cuánto dura, tamaños…"
          />
        </Campo>

        <label className="flex items-center gap-2.5 text-sm text-texto-2">
          <input
            type="checkbox"
            className="h-[18px] w-[18px]"
            style={{ accentColor: c.acento }}
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          Mostrar en mi página
        </label>

        {actual && lista.length > 1 && indice >= 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted px-3 py-2">
            <span className="mr-auto text-[13px] text-texto-3">
              Lugar {indice + 1} de {lista.length}
            </span>
            <Boton
              variante="ghost"
              className="!px-3 !py-1.5 text-[13px]"
              disabled={moviendo || indice === 0}
              onClick={() => void mover(-1)}
            >
              <Icon name="chevronLeft" size={15} />
              Mover antes
            </Boton>
            <Boton
              variante="ghost"
              className="!px-3 !py-1.5 text-[13px]"
              disabled={moviendo || indice === lista.length - 1}
              onClick={() => void mover(1)}
            >
              Mover después
              <Icon name="chevronRight" size={15} />
            </Boton>
          </div>
        )}
      </div>
    </Modal>
  );
}
