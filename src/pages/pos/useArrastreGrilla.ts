import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Arrastrar para reordenar la grilla del POS, equivalente al ItemTouchHelper
 * de Android: se levanta una card y se la lleva a su lugar.
 *
 * Va con Pointer Events y no con HTML5 drag-and-drop porque éste no existe en
 * táctil, y la web se usa igual en la tablet del mostrador que en la PC del
 * dueño. Un mismo handler cubre mouse, dedo y lápiz.
 *
 * Lo importante para un POS: un toque para agregar un producto nunca puede ser
 * un arrastre, o la grilla se movería sola en pleno cobro. Cada puntero tiene
 * su forma de "levantar" la card:
 * - **Mouse:** apretar y mover unos píxeles, como cualquier arrastre en una PC.
 *   Hasta el 28-oct pedía además mantener apretado medio segundo, y apretar y
 *   mover enseguida —lo natural con un mouse— no hacía nada: en la PC parecía
 *   que la web no tenía la función que sí tiene la app.
 * - **Dedo y lápiz:** mantener presionado, como en Android. Moverse antes es un
 *   scroll de la grilla y la card no se levanta.
 */

/**
 * Cuánto hay que mantener presionado antes de que la card "se despegue".
 *
 * Es el mismo gesto que en Android, donde `ItemTouchHelper` arranca con el
 * long-press (500 ms del sistema). Con el mouse también vale, pero no hace
 * falta esperar: alcanza con moverlo.
 */
const MS_MANTENER = 500;
/**
 * Lo que tiene que correrse el puntero para que cuente como movimiento. Con el
 * dedo, antes del long-press, es un scroll y se cancela; con el mouse levanta
 * la card. Por debajo de esto es el pulso de un click.
 */
const UMBRAL_PX = 8;
/**
 * Después de soltar una card el navegador igual dispara el click sobre ella, y
 * ese click agregaba el producto al carrito: reacomodar la grilla cargaba una
 * venta. Este es el rato en que un click se ignora después de soltar.
 */
const MS_IGNORAR_CLIC = 400;

/** Atributo con el id de cada card: así se sabe qué card está debajo del puntero. */
const ATRIBUTO = "data-arrastre-id";

/**
 * Con la card levantada cerca del borde de la grilla, la grilla se desplaza
 * sola, como el RecyclerView de Android. Sin esto, llevar un producto de la
 * última fila a la primera en la tablet obligaba a soltarlo, scrollear y volver
 * a levantarlo: con la card levantada el dedo no puede scrollear.
 */
const BORDE_PX = 56;
/** Lo más que se desplaza por cuadro, para que no salte de golpe al fondo. */
const MAX_PX_POR_CUADRO = 18;

interface Opciones {
  /** Ids en el orden en que se ven ahora (la lista ya filtrada). */
  ids: number[];
  /** Aplica el nuevo orden de los visibles. Lo llama al soltar. */
  onReordenar: (idsVisibles: number[]) => void;
  /** Permite apagar el arrastre (por ejemplo, mientras hay un modal abierto). */
  activo?: boolean;
  /**
   * El elemento que scrollea la grilla. Se desplaza solo al llevar la card a
   * su borde, y es el único lugar donde el dedo queda frenado mientras se
   * arrastra: el resto de la pantalla scrollea como siempre.
   */
  contenedor?: React.RefObject<HTMLElement | null>;
}

/**
 * Cuánto desplazar la grilla en este cuadro según dónde está el puntero: hacia
 * arriba (negativo) en el borde de arriba, hacia abajo en el de abajo, y más
 * rápido cuanto más adentro del borde. 0 lejos de los bordes.
 */
export function desplazamientoAutomatico(y: number, arriba: number, abajo: number): number {
  if (y < arriba + BORDE_PX) return -Math.min(MAX_PX_POR_CUADRO, Math.ceil((arriba + BORDE_PX - y) / 3));
  if (y > abajo - BORDE_PX) return Math.min(MAX_PX_POR_CUADRO, Math.ceil((y - (abajo - BORDE_PX)) / 3));
  return 0;
}

export interface Arrastre {
  /** Props que van en cada card, en el mismo orden que `ids`. */
  props: (id: number) => {
    onPointerDown: (e: React.PointerEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onDragStart: (e: React.DragEvent) => void;
    style: React.CSSProperties;
    "data-arrastrando": boolean;
    "data-arrastre-id": number;
  };
  /** Id de la card levantada, o null. Sirve para el estilo del hueco. */
  arrastrando: number | null;
  /** Orden en pantalla mientras dura el arrastre (los ids reacomodados). */
  orden: number[];
  /**
   * Si el click que acaba de llegar es el final de un arrastre y no un toque.
   * Se pregunta en el momento del click: un valor del render ya llega tarde,
   * porque al soltar el estado vuelve a "sin arrastre" antes que el click.
   */
  ignorarClic: () => boolean;
}

/**
 * Lleva `actual` al lugar que ocupa `destino`, corriendo los del medio. Null si
 * no cambia nada (es la misma card, o alguna no está en la lista).
 */
export function moverEnLista(lista: number[], actual: number, destino: number): number[] | null {
  if (actual === destino) return null;
  const desde = lista.indexOf(actual);
  const hasta = lista.indexOf(destino);
  if (desde < 0 || hasta < 0) return null;
  const nuevo = [...lista];
  nuevo.splice(hasta, 0, nuevo.splice(desde, 1)[0]);
  return nuevo;
}

/** La card que está debajo del puntero, o null si no hay ninguna. */
function cardBajo(x: number, y: number): number | null {
  // `elementFromPoint` y no `pointerenter`: con el dedo el navegador captura el
  // puntero en la card donde arrancó el toque, y las demás nunca se enteran de
  // que el dedo pasó por encima. Así la card no se movía en la tablet.
  const el = document.elementFromPoint?.(x, y)?.closest(`[${ATRIBUTO}]`);
  if (!el) return null;
  const id = Number(el.getAttribute(ATRIBUTO));
  return Number.isInteger(id) ? id : null;
}

export function useArrastreGrilla({ ids, onReordenar, activo = true, contenedor }: Opciones): Arrastre {
  // Orden "en vuelo": sólo existe mientras se arrastra. Fuera de eso mandan los
  // ids que llegan por props, así que un cambio de filtro se refleja al toque.
  const [orden, setOrden] = useState<number[] | null>(null);
  const [arrastrando, setArrastrando] = useState<number | null>(null);

  const timer = useRef<number | null>(null);
  /** El gesto en curso: dónde arrancó, sobre qué card y con qué puntero. */
  const gesto = useRef<{ x: number; y: number; id: number; tipo: string } | null>(null);
  /** Dónde está el puntero ahora: el desplazamiento automático lo necesita aunque no se mueva. */
  const puntero = useRef<{ x: number; y: number } | null>(null);
  /** El cuadro pedido para el desplazamiento automático, para poder cancelarlo. */
  const cuadro = useRef<number | null>(null);
  // En refs y no en estado: los usan los listeners de window, que se registran
  // una sola vez y verían valores viejos si dependieran del render.
  const ordenRef = useRef<number[] | null>(null);
  const arrastrandoRef = useRef<number | null>(null);
  const soltadoEn = useRef(Number.NEGATIVE_INFINITY);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const onReordenarRef = useRef(onReordenar);
  onReordenarRef.current = onReordenar;
  const contenedorRef = useRef(contenedor);
  contenedorRef.current = contenedor;

  const limpiarTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const pararDesplazamiento = () => {
    if (cuadro.current !== null) {
      cancelAnimationFrame(cuadro.current);
      cuadro.current = null;
    }
  };

  /** Mueve la card levantada al lugar de la que esté debajo del puntero. */
  const reacomodar = (x: number, y: number) => {
    const actual = arrastrandoRef.current;
    const destino = cardBajo(x, y);
    if (actual === null || destino === null) return;
    const nuevo = moverEnLista(ordenRef.current ?? idsRef.current, actual, destino);
    if (nuevo) {
      ordenRef.current = nuevo;
      setOrden(nuevo);
    }
  };

  // Un cuadro del desplazamiento automático. Se vuelve a pedir mientras dure el
  // arrastre: con el dedo quieto en el borde, la grilla sigue bajando.
  const desplazar = useRef<() => void>(() => {});
  desplazar.current = () => {
    cuadro.current = null;
    if (arrastrandoRef.current === null) return;
    const el = contenedorRef.current?.current;
    const p = puntero.current;
    if (el && p) {
      const r = el.getBoundingClientRect();
      const dy = desplazamientoAutomatico(p.y, r.top, r.bottom);
      if (dy !== 0) {
        const antes = el.scrollTop;
        el.scrollTop = antes + dy;
        // El dedo no se movió, pero lo que tiene debajo sí.
        if (el.scrollTop !== antes) reacomodar(p.x, p.y);
      }
    }
    cuadro.current = requestAnimationFrame(() => desplazar.current());
  };

  const empezar = useCallback((id: number) => {
    limpiarTimer();
    arrastrandoRef.current = id;
    ordenRef.current = idsRef.current;
    setArrastrando(id);
    setOrden(idsRef.current);
    if (contenedorRef.current?.current && typeof requestAnimationFrame === "function") {
      pararDesplazamiento();
      cuadro.current = requestAnimationFrame(() => desplazar.current());
    }
  }, []);

  /** Vuelve todo a "sin arrastre", sin guardar nada. */
  const descartar = useCallback(() => {
    limpiarTimer();
    pararDesplazamiento();
    gesto.current = null;
    puntero.current = null;
    ordenRef.current = null;
    arrastrandoRef.current = null;
    setArrastrando(null);
    setOrden(null);
  }, []);

  const terminar = useCallback(() => {
    const final = ordenRef.current;
    const habia = arrastrandoRef.current !== null;
    descartar();
    // Sólo se guarda si de verdad hubo un arrastre: un tap no puede reescribir
    // el orden del cajero.
    if (habia) {
      soltadoEn.current = performance.now();
      if (final) onReordenarRef.current(final);
    }
  }, [descartar]);

  useEffect(() => {
    const alMover = (ev: PointerEvent) => {
      const g = gesto.current;
      if (!g) return;
      if (arrastrandoRef.current === null) {
        const lejos = Math.abs(ev.clientX - g.x) > UMBRAL_PX || Math.abs(ev.clientY - g.y) > UMBRAL_PX;
        if (!lejos) return;
        if (g.tipo !== "mouse") {
          // El dedo se movió antes del long-press: era un scroll de la grilla.
          limpiarTimer();
          gesto.current = null;
          return;
        }
        empezar(g.id);
      }
      puntero.current = { x: ev.clientX, y: ev.clientY };
      reacomodar(ev.clientX, ev.clientY);
    };
    // Soltar fuera de la grilla (o que el navegador se quede con el gesto)
    // tiene que terminar el arrastre igual; si no, la card queda pegada al
    // puntero.
    const alSoltar = () => {
      if (arrastrandoRef.current !== null) terminar();
      else {
        limpiarTimer();
        gesto.current = null;
      }
    };
    // Con la card levantada el dedo la lleva a su lugar y la grilla no se
    // desplaza a mano (la desplaza el borde, ver `desplazar`). Tiene que ser un
    // listener no pasivo: uno pasivo no puede frenar el scroll, y el navegador
    // cortaba el arrastre para desplazar. Va en la grilla y no en window: uno no
    // pasivo en window hace esperar a cada scroll con el dedo de toda la
    // pantalla, y en una tablet barata eso se nota.
    const alDeslizar = (ev: Event) => {
      if (arrastrandoRef.current !== null && ev.cancelable) ev.preventDefault();
    };
    // Sin contenedor pasado, window (como antes). Con contenedor pasado pero
    // sin montar (la farmacia dibuja su propio catálogo y no la grilla), nada:
    // caer en window dejaba justo el listener no pasivo que el párrafo de
    // arriba evita, en toda la pantalla de venta.
    const c = contenedorRef.current;
    const zonaTactil: HTMLElement | Window | null = c ? c.current : window;
    const alTeclear = (e: KeyboardEvent) => {
      // Escape descarta: se vuelve al orden que había sin guardar nada.
      if (e.key === "Escape" && arrastrandoRef.current !== null) descartar();
    };
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
    window.addEventListener("pointercancel", alSoltar);
    zonaTactil?.addEventListener("touchmove", alDeslizar, { passive: false });
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("pointercancel", alSoltar);
      zonaTactil?.removeEventListener("touchmove", alDeslizar);
      window.removeEventListener("keydown", alTeclear);
      limpiarTimer();
      pararDesplazamiento();
    };
    // `reacomodar` sólo usa refs y el setter del estado: no hace falta volver
    // a registrar los listeners en cada render.
  }, [empezar, terminar, descartar]);

  const onPointerDown = useCallback(
    (id: number) => (e: React.PointerEvent) => {
      if (!activo) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      limpiarTimer();
      gesto.current = { x: e.clientX, y: e.clientY, id, tipo: e.pointerType };
      puntero.current = { x: e.clientX, y: e.clientY };
      // Mantener presionado: el gesto del dedo. Con el mouse también levanta
      // la card, aunque ahí alcanza con moverlo (ver `alMover`).
      timer.current = window.setTimeout(() => {
        if (gesto.current?.id === id) empezar(id);
      }, MS_MANTENER);
    },
    [activo, empezar],
  );

  // El long-press del celular abre el menú del sistema (copiar, guardar la
  // imagen) y el mouse arrastra la imagen del ícono con el drag nativo, que
  // cancela los pointer events: ninguno de los dos tiene sentido en una card.
  const noMenu = useCallback((e: React.MouseEvent) => e.preventDefault(), []);
  const noArrastreNativo = useCallback((e: React.DragEvent) => e.preventDefault(), []);

  const props = useCallback(
    (id: number) => ({
      onPointerDown: onPointerDown(id),
      onContextMenu: noMenu,
      onDragStart: noArrastreNativo,
      style: {
        // La card levantada se agranda un poco, igual que en Android: sin eso
        // no se ve que "agarró".
        transform: arrastrando === id ? "scale(1.05)" : undefined,
        opacity: arrastrando !== null && arrastrando !== id ? 0.75 : undefined,
        zIndex: arrastrando === id ? 20 : undefined,
        // Mientras se arrastra, el navegador no debe interpretar el gesto como
        // scroll ni selección de texto.
        touchAction: arrastrando !== null ? ("none" as const) : undefined,
        cursor: arrastrando === id ? ("grabbing" as const) : undefined,
        // Mantener presionado no selecciona el nombre del producto ni abre el
        // globo de "copiar" de iOS.
        userSelect: "none" as const,
        WebkitUserSelect: "none" as const,
        WebkitTouchCallout: "none" as const,
        transition: "transform 120ms, opacity 120ms",
      } satisfies React.CSSProperties,
      "data-arrastrando": arrastrando === id,
      [ATRIBUTO]: id,
    }),
    [arrastrando, onPointerDown, noMenu, noArrastreNativo],
  );

  const ignorarClic = useCallback(
    () => arrastrandoRef.current !== null || performance.now() - soltadoEn.current < MS_IGNORAR_CLIC,
    [],
  );

  return { props, arrastrando, orden: orden ?? ids, ignorarClic };
}
