import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Arrastrar para reordenar la grilla del POS, equivalente al ItemTouchHelper
 * de Android: se mantiene presionada una card y se la lleva a su lugar.
 *
 * Va con Pointer Events y no con HTML5 drag-and-drop porque éste no existe en
 * táctil, y la web se usa igual en la tablet del mostrador que en la PC del
 * dueño. Un mismo handler cubre mouse, dedo y lápiz.
 *
 * Lo importante para un POS: el arrastre arranca recién después de mantener
 * presionado (o de recorrer unos píxeles con el mouse). Si empezara al primer
 * contacto, cada tap para agregar un producto sería un arrastre en potencia y
 * la grilla se movería sola en pleno cobro.
 */

/**
 * Cuánto hay que mantener presionado antes de que la card "se despegue".
 *
 * Es el mismo gesto que en Android, donde `ItemTouchHelper` arranca sólo con
 * long-press (500 ms del sistema) y un tap normal nunca dispara el arrastre.
 * Acá se aplica igual al mouse y al dedo: en un POS, un click que reacomoda la
 * grilla sin querer es peor que uno que tarda medio segundo en hacerlo.
 */
const MS_MANTENER = 500;
/**
 * Si el puntero se corre más que esto ANTES de que corra el timer, no era un
 * long-press: era un scroll (dedo) o un click con pulso (mouse). Se cancela.
 */
const UMBRAL_PX = 8;

interface Opciones {
  /** Ids en el orden en que se ven ahora (la lista ya filtrada). */
  ids: number[];
  /** Aplica el nuevo orden de los visibles. Lo llama al soltar. */
  onReordenar: (idsVisibles: number[]) => void;
  /** Permite apagar el arrastre (por ejemplo, mientras hay un modal abierto). */
  activo?: boolean;
}

export interface Arrastre {
  /** Props que van en cada card, en el mismo orden que `ids`. */
  props: (id: number) => {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerEnter: () => void;
    style: React.CSSProperties;
    "data-arrastrando": boolean;
  };
  /** Id de la card levantada, o null. Sirve para el estilo del hueco. */
  arrastrando: number | null;
  /** Orden en pantalla mientras dura el arrastre (los ids reacomodados). */
  orden: number[];
}

export function useArrastreGrilla({ ids, onReordenar, activo = true }: Opciones): Arrastre {
  // Orden "en vuelo": sólo existe mientras se arrastra. Fuera de eso mandan los
  // ids que llegan por props, así que un cambio de filtro se refleja al toque.
  const [orden, setOrden] = useState<number[] | null>(null);
  const [arrastrando, setArrastrando] = useState<number | null>(null);

  const timer = useRef<number | null>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  // En refs y no en estado: los usan los listeners de window, que se registran
  // una sola vez y verían valores viejos si dependieran del render.
  const ordenRef = useRef<number[] | null>(null);
  const arrastrandoRef = useRef<number | null>(null);

  const limpiarTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const terminar = useCallback(() => {
    limpiarTimer();
    inicio.current = null;
    const final = ordenRef.current;
    const habia = arrastrandoRef.current !== null;
    ordenRef.current = null;
    arrastrandoRef.current = null;
    setArrastrando(null);
    setOrden(null);
    // Sólo se guarda si de verdad hubo un arrastre: un tap no puede reescribir
    // el orden del cajero.
    if (habia && final) onReordenar(final);
  }, [onReordenar]);

  // Soltar fuera de la grilla (o cancelar con Escape) tiene que terminar el
  // arrastre igual; si no, la card queda pegada al puntero.
  useEffect(() => {
    const alSoltar = () => {
      if (arrastrandoRef.current !== null) terminar();
      else {
        limpiarTimer();
        inicio.current = null;
      }
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape" && arrastrandoRef.current !== null) {
        // Escape descarta: se vuelve al orden que había sin guardar nada.
        limpiarTimer();
        inicio.current = null;
        ordenRef.current = null;
        arrastrandoRef.current = null;
        setArrastrando(null);
        setOrden(null);
      }
    };
    window.addEventListener("pointerup", alSoltar);
    window.addEventListener("pointercancel", alSoltar);
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("pointercancel", alSoltar);
      window.removeEventListener("keydown", alTeclear);
      limpiarTimer();
    };
  }, [terminar]);

  const onPointerDown = useCallback(
    (id: number) => (e: React.PointerEvent) => {
      if (!activo || e.button !== 0) return;
      inicio.current = { x: e.clientX, y: e.clientY };

      // Mantener presionado, con mouse o con dedo. Igual que Android: hasta que
      // no corre este timer, el gesto sigue siendo un tap y agrega al carrito.
      timer.current = window.setTimeout(() => {
        limpiarTimer();
        arrastrandoRef.current = id;
        ordenRef.current = ids;
        setArrastrando(id);
        setOrden(ids);
      }, MS_MANTENER);

      // Moverse antes de tiempo cancela: el cajero estaba scrolleando la
      // grilla, no levantando una card.
      const alMover = (ev: PointerEvent) => {
        if (!inicio.current || arrastrandoRef.current !== null) return;
        const dx = Math.abs(ev.clientX - inicio.current.x);
        const dy = Math.abs(ev.clientY - inicio.current.y);
        if (dx > UMBRAL_PX || dy > UMBRAL_PX) limpiarTimer();
      };
      window.addEventListener("pointermove", alMover);
      window.addEventListener(
        "pointerup",
        () => window.removeEventListener("pointermove", alMover),
        { once: true },
      );
    },
    [activo, ids],
  );

  /** El puntero entró en otra card: se intercambia con la que se arrastra. */
  const onPointerEnter = useCallback(
    (id: number) => () => {
      const actual = arrastrandoRef.current;
      const lista = ordenRef.current;
      if (actual === null || !lista || id === actual) return;

      const desde = lista.indexOf(actual);
      const hasta = lista.indexOf(id);
      if (desde < 0 || hasta < 0) return;

      const nuevo = [...lista];
      nuevo.splice(hasta, 0, nuevo.splice(desde, 1)[0]);
      ordenRef.current = nuevo;
      setOrden(nuevo);
    },
    [],
  );

  const props = useCallback(
    (id: number) => ({
      onPointerDown: onPointerDown(id),
      onPointerEnter: onPointerEnter(id),
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
        transition: "transform 120ms, opacity 120ms",
      } satisfies React.CSSProperties,
      "data-arrastrando": arrastrando === id,
    }),
    [arrastrando, onPointerDown, onPointerEnter],
  );

  return { props, arrastrando, orden: orden ?? ids };
}
