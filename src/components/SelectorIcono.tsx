import { useLayoutEffect, useRef, useState } from "react";
import {
  CATEGORIAS_ICONO,
  buscarIconos,
  categoriaInicial,
  iconoPorLlave,
  iconosDeCategoria,
  type ClaveCategoriaIcono,
  type IconoArticulo,
} from "../lib/iconosArticulo";
import { Buscador } from "./filtros";
import { Icon } from "./Icon";
import { Modal } from "./ui";

/** Margen para dar por "arriba de todo" una sección (bordes, redondeos). */
const TOLERANCIA_PX = 8;

/**
 * Cuánto se ignoran los eventos de scroll después de tocar una pestaña: el
 * desplazamiento suave pasa por las secciones de en medio y, sin esta pausa,
 * la marca saltaba de pestaña en pestaña hasta llegar.
 */
const PAUSA_TRAS_SALTO_MS = 800;

/**
 * Mueve la lista. Sin animación si el sistema pide menos movimiento, y con
 * `scrollTop` directo donde no hay `scrollTo` (jsdom en los tests).
 */
function desplazar(contenedor: HTMLElement, top: number, suave: boolean) {
  const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (suave && !reducido && typeof contenedor.scrollTo === "function") {
    contenedor.scrollTo({ top, behavior: "smooth" });
  } else {
    contenedor.scrollTop = top;
  }
}

/**
 * Elegir el ícono del artículo, como el selector de emojis de WhatsApp:
 * pestañas arriba y TODAS las secciones una tras otra en una sola lista. Abre
 * en la sección del ícono ya puesto o, si no hay, en la del rubro del negocio
 * (ver `categoriaInicial`), pero nunca esconde las demás: una farmacia que
 * vende agua o un minimarket que vende salteñas tienen que encontrarlas sin
 * cambiar nada.
 *
 * Reemplaza a la grilla que era port de `SeleccionarIconoDialog` (Android):
 * las llaves siguen siendo las mismas en las dos plataformas.
 *
 * "Sin ícono" es una opción explícita y no un botón de borrar escondido: es la
 * forma de volver al monograma, y el cajero tiene que poder encontrarla.
 */
export default function SelectorIcono({
  actual,
  rubro,
  onElegir,
  onCerrar,
}: {
  actual: string | null;
  /** `tipoNegocio` de la sesión: con qué sección abre si no hay ícono puesto. */
  rubro: string | null | undefined;
  onElegir: (llave: string | null) => void;
  onCerrar: () => void;
}) {
  const inicial = categoriaInicial(actual, rubro);
  const [activa, setActiva] = useState<ClaveCategoriaIcono>(inicial);
  // Copia de `activa` para el efecto de abajo, que sólo debe correr cuando se
  // entra o se sale de la búsqueda, no cada vez que el scroll marca otra.
  const ultimaActiva = useRef(inicial);
  const marcar = (clave: ClaveCategoriaIcono) => {
    ultimaActiva.current = clave;
    setActiva(clave);
  };
  const [busqueda, setBusqueda] = useState("");
  const buscando = busqueda.trim() !== "";
  const resultados = buscando ? buscarIconos(busqueda) : [];

  const lista = useRef<HTMLDivElement>(null);
  const secciones = useRef<Partial<Record<ClaveCategoriaIcono, HTMLElement | null>>>({});
  const pausaHasta = useRef(0);

  /** Tocar una pestaña: se marca ya y la lista se desliza hasta su sección. */
  function irA(clave: ClaveCategoriaIcono) {
    marcar(clave);
    const contenedor = lista.current;
    const seccion = secciones.current[clave];
    if (!contenedor || !seccion) return;
    pausaHasta.current = Date.now() + PAUSA_TRAS_SALTO_MS;
    desplazar(contenedor, seccion.offsetTop, true);
  }

  // Al abrir, y al borrar la búsqueda, la lista vuelve a la sección marcada
  // sin animación: el usuario no tiene que ver pasar las de otros rubros.
  // Lee sólo refs para no volver a correr cada vez que el scroll marca otra.
  useLayoutEffect(() => {
    if (buscando) return;
    const contenedor = lista.current;
    const seccion = secciones.current[ultimaActiva.current];
    if (!contenedor || !seccion) return;
    pausaHasta.current = Date.now() + PAUSA_TRAS_SALTO_MS;
    desplazar(contenedor, seccion.offsetTop, false);
  }, [buscando]);

  /** Marca sola la pestaña de la sección que está arriba de todo. */
  function alDesplazar() {
    const contenedor = lista.current;
    if (!contenedor || buscando || Date.now() < pausaHasta.current) return;
    const { scrollTop, clientHeight, scrollHeight } = contenedor;
    // Al fondo, la última sección puede ser más corta que la lista y no llegar
    // nunca arriba: si no, su pestaña no se marcaría jamás.
    if (scrollTop + clientHeight >= scrollHeight - 2) {
      marcar(CATEGORIAS_ICONO[CATEGORIAS_ICONO.length - 1].clave);
      return;
    }
    let visible: ClaveCategoriaIcono = CATEGORIAS_ICONO[0].clave;
    for (const c of CATEGORIAS_ICONO) {
      const s = secciones.current[c.clave];
      if (s && s.offsetTop <= scrollTop + TOLERANCIA_PX) visible = c.clave;
    }
    marcar(visible);
  }

  return (
    <Modal abierto titulo="Elegí un ícono" onClose={onCerrar} ancho="max-w-lg">
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onElegir(null)}
          aria-pressed={actual === null}
          className={[
            "flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            actual === null ? "border-primary bg-primary-50" : "border-borde hover:bg-muted",
          ].join(" ")}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-texto-3">
            <Icon name="close" size={18} />
          </span>
          <span className="text-[13px] font-semibold text-texto">
            Sin ícono
            <span className="block text-xs font-normal text-texto-3">
              Se muestran las iniciales del nombre
            </span>
          </span>
        </button>

        <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Buscar ícono…" />

        {!buscando && (
          <nav aria-label="Secciones de íconos" className="flex gap-0.5 overflow-x-auto border-b border-borde-soft">
            {CATEGORIAS_ICONO.map((c) => {
              const marcada = c.clave === activa;
              return (
                <button
                  key={c.clave}
                  type="button"
                  onClick={() => irA(c.clave)}
                  aria-label={c.nombre}
                  title={c.nombre}
                  aria-current={marcada ? "true" : undefined}
                  className={[
                    "-mb-px flex min-w-7 flex-1 justify-center border-b-2 px-0.5 pb-1.5 pt-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                    marcada ? "border-primary" : "border-transparent opacity-60 hover:opacity-100",
                  ].join(" ")}
                >
                  <img
                    src={iconoPorLlave(c.tab)?.src}
                    alt=""
                    width={24}
                    height={24}
                    className="h-6 w-6 object-contain"
                  />
                </button>
              );
            })}
          </nav>
        )}

        {/* `relative`: el `offsetTop` de cada sección se mide contra esta lista,
            que es la que se desplaza (no la hoja entera). El alto deja entrar
            todo lo de arriba en un celular chico sin un segundo scroll. */}
        <div
          ref={lista}
          onScroll={alDesplazar}
          data-testid="lista-iconos"
          className="relative h-[calc(92dvh-20rem)] max-h-[26rem] min-h-[12rem] overflow-y-auto overscroll-contain"
        >
          {buscando ? (
            resultados.length ? (
              <GrillaIconos iconos={resultados} actual={actual} onElegir={onElegir} />
            ) : (
              <p className="py-8 text-center text-sm text-texto-3">
                No hay íconos con «{busqueda.trim()}».
              </p>
            )
          ) : (
            CATEGORIAS_ICONO.map((c) => (
              <section
                key={c.clave}
                ref={(el) => {
                  secciones.current[c.clave] = el;
                }}
                aria-labelledby={`iconos-${c.clave}`}
                data-categoria={c.clave}
                className="pb-3"
              >
                <h3
                  id={`iconos-${c.clave}`}
                  className="bg-white pb-1.5 pt-1 text-xs font-bold uppercase tracking-wide text-texto-3"
                >
                  {c.nombre}
                </h3>
                <GrillaIconos iconos={iconosDeCategoria(c.clave)} actual={actual} onElegir={onElegir} />
              </section>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

function GrillaIconos({
  iconos,
  actual,
  onElegir,
}: {
  iconos: IconoArticulo[];
  actual: string | null;
  onElegir: (llave: string) => void;
}) {
  return (
    <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
      {iconos.map((ic) => {
        const elegido = actual === ic.llave;
        return (
          <li key={ic.llave}>
            <button
              type="button"
              onClick={() => onElegir(ic.llave)}
              aria-label={ic.etiqueta}
              aria-pressed={elegido}
              title={ic.etiqueta}
              className={[
                "flex w-full flex-col items-center gap-1 rounded-xl border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                elegido ? "border-primary bg-primary-50" : "border-transparent hover:bg-muted",
              ].join(" ")}
            >
              {/* `lazy` funciona también dentro de la lista con scroll: de los
                  175 sólo se bajan los que se ven. */}
              <img
                src={ic.src}
                alt=""
                width={44}
                height={44}
                loading="lazy"
                className="h-11 w-11 object-contain"
              />
              <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-texto-2">
                {ic.etiqueta}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
