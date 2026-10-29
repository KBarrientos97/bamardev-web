import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero } from "react";
import { Icon, type NombreIcono } from "./Icon";

export interface FotoDelVisor {
  /** La imagen (un blob: de `fotoComoUrl`); sin ella se dice que no cargó. */
  url: string | null | undefined;
  titulo: string;
}

/** Cuánto se puede acercar: 5× alcanza para leer el número de un carnet de 1.280 px. */
const ESCALA_MAX = 5;
/** El paso de los botones y de cada vuelta de la rueda. */
const PASO_ZOOM = 1.25;
/** Lo que se acerca con doble clic. */
const ZOOM_DOBLE_CLIC = 2.5;
/** Cuánto hay que deslizar (px) para pasar de foto. */
const UMBRAL_DESLIZAR = 60;

const limitar = (x: number) => Math.min(ESCALA_MAX, Math.max(1, x));

/**
 * La foto en grande, a pantalla completa (L4, 28-oct): la cara y el carnet de
 * un inscrito se revisan acá, no en la miniatura del panel. Se cierra con la
 * X, con Esc o tocando afuera de la foto; las flechas (o deslizar) pasan entre
 * las fotos; la rueda, el doble clic o el pellizco acercan; "Girar" la rota de
 * a 90° (el carnet suele venir de costado).
 *
 * Va por encima de todo (paneles, hojas y modales: `z-[60]`, el `Modal` es
 * `z-50`) y se adueña de Esc: escucha en la fase de captura y corta el evento,
 * así el panel o el modal de abajo no se cierra junto con el visor y no se
 * pierde lo que se estaba revisando.
 */
export default function VisorFotos({
  fotos,
  inicial = 0,
  titulo,
  onCerrar,
}: {
  fotos: FotoDelVisor[];
  inicial?: number;
  /** Quién es (el nombre del estudiante): va arriba, junto al nombre de la foto. */
  titulo?: string;
  onCerrar: () => void;
}) {
  const total = fotos.length;
  const [indice, setIndice] = useState(() => Math.min(Math.max(0, inicial), Math.max(0, total - 1)));
  const [escala, setEscala] = useState(1);
  const [giro, setGiro] = useState(0);
  const [mover, setMover] = useState({ x: 0, y: 0 });
  /** Lo que se está deslizando (sin zoom), para que la foto acompañe al dedo. */
  const [deslizando, setDeslizando] = useState(0);
  const foto = fotos[indice];

  const alCerrar = useRef(onCerrar);
  alCerrar.current = onCerrar;

  // Cada foto arranca derecha y entera: el zoom y el giro eran de la anterior.
  const irA = useCallback(
    (i: number) => {
      if (total < 2) return;
      setIndice(((i % total) + total) % total);
      setEscala(1);
      setGiro(0);
      setMover({ x: 0, y: 0 });
      setDeslizando(0);
    },
    [total],
  );
  const anterior = useCallback(() => irA(indice - 1), [irA, indice]);
  const siguiente = useCallback(() => irA(indice + 1), [irA, indice]);

  function zoom(factor: number) {
    const nueva = limitar(escala * factor);
    setEscala(nueva);
    // Vuelta al tamaño entero: también al centro.
    if (nueva === 1) setMover({ x: 0, y: 0 });
  }

  // Esc, ← y →: del visor y de nadie más. En captura sobre `window` llega
  // antes que los `keydown` del documento (el de `Modal` y el de `PanelLateral`).
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        alCerrar.current();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopImmediatePropagation();
        anterior();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopImmediatePropagation();
        siguiente();
      }
    };
    window.addEventListener("keydown", alTecla, true);
    return () => window.removeEventListener("keydown", alTecla, true);
  }, [anterior, siguiente]);

  // El foco entra al visor y vuelve a la miniatura al cerrar; la página de
  // atrás no se desplaza mientras está abierto.
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const antes = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    caja.current?.focus({ preventScroll: true });
    const desborde = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = desborde;
      if (antes && antes.isConnected) antes.focus({ preventScroll: true });
    };
  }, []);

  // ── Dedos y mouse: arrastrar, deslizar y pellizcar ──
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ distancia: number; escala: number } | null>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  /** Hubo arrastre: el clic que lo termina no cierra el visor. */
  const arrastro = useRef(false);

  const distancia = () => {
    const [a, b] = [...punteros.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  function alBajar(e: EventoPuntero<HTMLDivElement>) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    arrastro.current = false;
    if (punteros.current.size === 2) {
      gesto.current = { distancia: distancia(), escala };
      inicio.current = null;
    } else {
      inicio.current = { x: e.clientX, y: e.clientY };
    }
  }

  function alMover(e: EventoPuntero<HTMLDivElement>) {
    const antes = punteros.current.get(e.pointerId);
    if (!antes) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.current.size === 2 && gesto.current) {
      arrastro.current = true;
      const d = distancia();
      if (gesto.current.distancia > 0) setEscala(limitar((gesto.current.escala * d) / gesto.current.distancia));
      return;
    }
    if (!inicio.current) return;
    const dx = e.clientX - antes.x;
    const dy = e.clientY - antes.y;
    if (Math.abs(e.clientX - inicio.current.x) > 4 || Math.abs(e.clientY - inicio.current.y) > 4) arrastro.current = true;
    // Con zoom se mueve la foto; sin zoom, el gesto es pasar a la otra.
    if (escala > 1) setMover((m) => ({ x: m.x + dx, y: m.y + dy }));
    else if (total > 1) setDeslizando(e.clientX - inicio.current.x);
  }

  function alSoltar(e: EventoPuntero<HTMLDivElement>) {
    punteros.current.delete(e.pointerId);
    if (punteros.current.size < 2) gesto.current = null;
    const desde = inicio.current;
    inicio.current = null;
    if (desde && escala === 1 && total > 1) {
      const dx = e.clientX - desde.x;
      setDeslizando(0);
      if (dx <= -UMBRAL_DESLIZAR) siguiente();
      else if (dx >= UMBRAL_DESLIZAR) anterior();
    }
    if (escala <= 1) setMover({ x: 0, y: 0 });
  }

  const transform = `translate(${mover.x + deslizando}px, ${mover.y}px) scale(${escala}) rotate(${giro}deg)`;

  return (
    <div
      ref={caja}
      role="dialog"
      aria-modal="true"
      aria-label={titulo ? `${foto?.titulo ?? "Foto"} · ${titulo}` : (foto?.titulo ?? "Foto")}
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex animate-[velo-aparece_.15s_ease-out] flex-col bg-slate-950/95 text-white focus:outline-none motion-reduce:animate-none"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{foto?.titulo}</p>
          <p className="truncate text-xs text-white/70">
            {titulo ? `${titulo} · ` : ""}
            {total > 1 ? `${indice + 1} de ${total}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <BotonVisor etiqueta="Alejar" icono="minus" disabled={escala <= 1} onClick={() => zoom(1 / PASO_ZOOM)} />
          <span className="hidden w-12 text-center text-xs tabular-nums text-white/70 sm:inline" aria-live="polite">
            {Math.round(escala * 100)} %
          </span>
          <BotonVisor etiqueta="Acercar" icono="plus" disabled={escala >= ESCALA_MAX} onClick={() => zoom(PASO_ZOOM)} />
          <BotonVisor etiqueta="Girar" icono="girar" onClick={() => setGiro((g) => (g + 90) % 360)} />
          <BotonVisor etiqueta="Cerrar" icono="close" onClick={onCerrar} />
        </div>
      </header>

      {/* El escenario: tocar afuera de la foto cierra; sobre la foto, los gestos. */}
      <div
        data-testid="visor-escenario"
        className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget && !arrastro.current) onCerrar();
          arrastro.current = false;
        }}
        onWheel={(e) => zoom(e.deltaY < 0 ? PASO_ZOOM : 1 / PASO_ZOOM)}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
      >
        {foto?.url ? (
          <img
            src={foto.url}
            alt={foto.titulo}
            draggable={false}
            onDoubleClick={() => {
              setMover({ x: 0, y: 0 });
              setEscala((x) => (x > 1 ? 1 : ZOOM_DOBLE_CLIC));
            }}
            style={{ transform, transition: punteros.current.size ? "none" : "transform 160ms ease-out" }}
            className={`max-h-full max-w-full object-contain ${escala > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
          />
        ) : (
          <p className="px-6 text-center text-sm text-white/70">Esta foto no se pudo cargar.</p>
        )}

        {total > 1 && (
          <>
            <BotonVisor
              etiqueta="Foto anterior"
              icono="chevronLeft"
              onClick={anterior}
              className="absolute left-2 top-1/2 -translate-y-1/2 sm:left-4"
            />
            <BotonVisor
              etiqueta="Foto siguiente"
              icono="chevronRight"
              onClick={siguiente}
              className="absolute right-2 top-1/2 -translate-y-1/2 sm:right-4"
            />
          </>
        )}
      </div>

      <p className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-center text-[11px] text-white/60">
        Doble clic o pellizco para acercar · arrastrá para mover{total > 1 ? " · deslizá o usá ← → para pasar" : ""}
      </p>
    </div>
  );
}

function BotonVisor({
  etiqueta,
  icono,
  onClick,
  disabled = false,
  className = "",
}: {
  etiqueta: string;
  icono: NombreIcono;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      disabled={disabled}
      // Que el toque no llegue al escenario: ni cierra ni empieza un arrastre.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-35 ${className}`}
    >
      <Icon name={icono} size={20} />
    </button>
  );
}
