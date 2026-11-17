import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { apiIconos, type IconoPropio } from "../lib/apiIconos";
import {
  CATEGORIAS_ICONO,
  SECCION_PROPIOS,
  buscarIconos,
  categoriaInicial,
  iconoPorLlave,
  iconosDeCategoria,
  type ClaveSeccionIcono,
  type IconoArticulo,
} from "../lib/iconosArticulo";
import { srcDeIconoPropio } from "../lib/iconosPropios";
import { normalizar } from "../lib/texto";
import { Buscador } from "./filtros";
import { Icon } from "./Icon";
import SubirIconos, { MAX_POR_TANDA, TIPOS_ICONO } from "./SubirIconos";
import { Confirmar, Modal } from "./ui";

/** Margen para dar por "arriba de todo" una sección (bordes, redondeos). */
const TOLERANCIA_PX = 8;

/**
 * Cuánto se ignoran los eventos de scroll después de tocar una pestaña: el
 * desplazamiento suave pasa por las secciones de en medio y, sin esta pausa,
 * la marca saltaba de pestaña en pestaña hasta llegar.
 */
const PAUSA_TRAS_SALTO_MS = 800;

/** Las secciones en el orden de la lista: «Mis íconos» va arriba de todas. */
const ORDEN_SECCIONES: ClaveSeccionIcono[] = [SECCION_PROPIOS, ...CATEGORIAS_ICONO.map((c) => c.clave)];

/** Mientras hay otro diálogo encima, el Escape y la manija son de ése. */
const nada = () => {};

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

type EstadoPropios =
  | { estado: "cargando" }
  | { estado: "error" }
  | { estado: "listo"; tope: number; iconos: IconoPropio[] };

const mensaje = (e: unknown, defecto: string) => (e instanceof Error && e.message ? e.message : defecto);

/** Un ícono propio como una celda más de la grilla: se busca y se elige por su nombre. */
const comoIcono = (i: IconoPropio): IconoArticulo => ({
  llave: i.llave,
  src: srcDeIconoPropio(i),
  etiqueta: i.nombre,
  categoria: SECCION_PROPIOS,
});

/** Los propios cuyo nombre contiene el texto, con el mismo criterio que `buscarIconos`. */
function buscarPropios(iconos: IconoPropio[], texto: string): IconoPropio[] {
  const comoTexto = (s: string) => normalizar(s.replace(/ /g, " "));
  const aguja = comoTexto(texto.trim());
  if (!aguja) return [];
  return iconos.filter((i) => comoTexto(i.nombre).includes(aguja));
}

/**
 * Elegir el ícono del artículo, como el selector de emojis de WhatsApp:
 * pestañas arriba y TODAS las secciones una tras otra en una sola lista. Abre
 * en la sección del ícono ya puesto o, si no hay, en la del rubro del negocio
 * (ver `categoriaInicial`), pero nunca esconde las demás: una farmacia que
 * vende agua o un minimarket que vende salteñas tienen que encontrarlas sin
 * cambiar nada.
 *
 * Arriba de todas, «Mis íconos» (16-nov): las fotos de productos que subió el
 * negocio. Se traen al abrir; si tardan o fallan, el catálogo se sigue pudiendo
 * elegir igual. Ahí mismo se suben (`SubirIconos`) y se borran.
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
  onIconoBorrado,
}: {
  actual: string | null;
  /** `tipoNegocio` de la sesión: con qué sección abre si no hay ícono puesto. */
  rubro: string | null | undefined;
  onElegir: (llave: string | null) => void;
  onCerrar: () => void;
  /**
   * Se borró un ícono propio: los productos que lo tenían quedaron sin ícono,
   * y si es el que tiene puesto el formulario, también tiene que quedar así.
   */
  onIconoBorrado?: (llave: string) => void;
}) {
  const inicial = categoriaInicial(actual, rubro);
  const [activa, setActiva] = useState<ClaveSeccionIcono>(inicial);
  // Copia de `activa` para el efecto de abajo, que sólo debe correr cuando se
  // entra o se sale de la búsqueda, no cada vez que el scroll marca otra.
  const ultimaActiva = useRef<ClaveSeccionIcono>(inicial);
  const marcar = (clave: ClaveSeccionIcono) => {
    ultimaActiva.current = clave;
    setActiva(clave);
  };
  const [busqueda, setBusqueda] = useState("");
  const buscando = busqueda.trim() !== "";

  // ── Mis íconos ──
  const [propios, setPropios] = useState<EstadoPropios>({ estado: "cargando" });
  /** El último pedido de la lista: una respuesta vieja (o que llega cerrado) no pisa nada. */
  const pedido = useRef(0);
  const cargarPropios = () => {
    const este = ++pedido.current;
    setPropios({ estado: "cargando" });
    apiIconos.listar().then(
      (r) => {
        if (pedido.current === este) setPropios({ estado: "listo", tope: r.tope, iconos: r.iconos });
      },
      () => {
        if (pedido.current === este) setPropios({ estado: "error" });
      },
    );
  };
  // Sólo al abrir: después se actualiza a mano (al subir y al borrar).
  useEffect(() => {
    cargarPropios();
    // Un contador, no un nodo: al cerrar, la respuesta que falte llega vieja.
    const contador = pedido;
    return () => {
      contador.current++;
    };
  }, []);
  const misIconos = propios.estado === "listo" ? propios.iconos : [];
  const libres = propios.estado === "listo" ? Math.max(0, propios.tope - propios.iconos.length) : MAX_POR_TANDA;
  const [administrando, setAdministrando] = useState(false);
  const borrandoVisible = administrando && misIconos.length > 0;
  const [aviso, setAviso] = useState("");
  const [aBorrar, setABorrar] = useState<IconoPropio | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [paraSubir, setParaSubir] = useState<{ archivos: File[]; libres: number } | null>(null);
  const subidosEnTanda = useRef(0);
  const inputArchivos = useRef<HTMLInputElement>(null);

  const resultados = buscando
    ? [...buscarPropios(misIconos, busqueda).map(comoIcono), ...buscarIconos(busqueda)]
    : [];

  const lista = useRef<HTMLDivElement>(null);
  const secciones = useRef<Partial<Record<ClaveSeccionIcono, HTMLElement | null>>>({});
  const pausaHasta = useRef(0);

  /** Tocar una pestaña: se marca ya y la lista se desliza hasta su sección. */
  function irA(clave: ClaveSeccionIcono) {
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

  // «Mis íconos» está arriba y cambia de alto cuando llega la lista (o al
  // subir y borrar). Si se está mirando más abajo (la sección del rubro), lo
  // que se ve no se tiene que correr: se compensa lo que creció o se achicó.
  const altoPropios = useRef<number | null>(null);
  useLayoutEffect(() => {
    const contenedor = lista.current;
    const seccion = secciones.current[SECCION_PROPIOS];
    if (buscando || !contenedor || !seccion) {
      altoPropios.current = null;
      return;
    }
    const alto = seccion.offsetHeight;
    const antes = altoPropios.current;
    altoPropios.current = alto;
    if (antes !== null && alto !== antes && contenedor.scrollTop >= seccion.offsetTop + antes - TOLERANCIA_PX) {
      pausaHasta.current = Date.now() + PAUSA_TRAS_SALTO_MS;
      contenedor.scrollTop += alto - antes;
    }
  }, [propios, buscando, borrandoVisible, aviso]);

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
    let visible: ClaveSeccionIcono = ORDEN_SECCIONES[0];
    for (const clave of ORDEN_SECCIONES) {
      const s = secciones.current[clave];
      if (s && s.offsetTop <= scrollTop + TOLERANCIA_PX) visible = clave;
    }
    marcar(visible);
  }

  /** «Subir»: abre el explorador de archivos, salvo que ya no quede lugar. */
  function tocarSubir() {
    if (propios.estado === "listo" && libres === 0) {
      setAviso(`Llegaste al máximo de ${propios.tope} íconos propios. Borrá alguno para subir otro.`);
      return;
    }
    setAviso("");
    inputArchivos.current?.click();
  }

  function alSubirUno(icono: IconoPropio) {
    subidosEnTanda.current++;
    setPropios((p) =>
      p.estado === "listo" ? { ...p, iconos: [icono, ...p.iconos.filter((i) => i.id !== icono.id)] } : p,
    );
  }

  function alCerrarSubida() {
    setParaSubir(null);
    if (subidosEnTanda.current === 0) return;
    subidosEnTanda.current = 0;
    // Si la lista no había llegado, ahora sí: con los nuevos adentro.
    if (propios.estado !== "listo") cargarPropios();
    setBusqueda("");
    marcar(SECCION_PROPIOS);
    if (lista.current) desplazar(lista.current, 0, false);
  }

  async function borrar() {
    const icono = aBorrar;
    if (!icono) return;
    setBorrando(true);
    try {
      await apiIconos.borrar(icono.id);
      setPropios((p) => (p.estado === "listo" ? { ...p, iconos: p.iconos.filter((i) => i.id !== icono.id) } : p));
      setAviso("");
      onIconoBorrado?.(icono.llave);
    } catch (e) {
      setAviso(mensaje(e, "No se pudo borrar el ícono."));
    } finally {
      setBorrando(false);
      setABorrar(null);
    }
  }

  return (
    <Modal abierto titulo="Elegí un ícono" onClose={paraSubir || aBorrar ? nada : onCerrar} ancho="max-w-lg">
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
            <Pestana nombre="Mis íconos" marcada={activa === SECCION_PROPIOS} onClick={() => irA(SECCION_PROPIOS)}>
              {/* Dibujado y no una foto: las fotos son del negocio y pueden no estar. */}
              <Icon name="camara" size={22} strokeWidth={1.8} className="text-texto-2" />
            </Pestana>
            {CATEGORIAS_ICONO.map((c) => (
              <Pestana key={c.clave} nombre={c.nombre} marcada={c.clave === activa} onClick={() => irA(c.clave)}>
                <img
                  src={iconoPorLlave(c.tab)?.src}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 object-contain"
                />
              </Pestana>
            ))}
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
            <>
              <section
                ref={(el) => {
                  secciones.current[SECCION_PROPIOS] = el;
                }}
                aria-labelledby="iconos-propios"
                data-categoria={SECCION_PROPIOS}
                className="pb-3"
              >
                <div className="flex min-h-7 items-center justify-between gap-2 bg-white pb-1.5 pt-1">
                  <h3 id="iconos-propios" className="text-xs font-bold uppercase tracking-wide text-texto-3">
                    Mis íconos
                  </h3>
                  {misIconos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAdministrando((a) => !a)}
                      aria-pressed={borrandoVisible}
                      className="-my-1 shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {borrandoVisible ? "Listo" : "Administrar"}
                    </button>
                  )}
                </div>
                <EstadoMisIconos
                  propios={propios}
                  borrando={borrandoVisible}
                  aviso={aviso}
                  onReintentar={cargarPropios}
                />
                <GrillaIconos
                  iconos={misIconos.map(comoIcono)}
                  actual={actual}
                  onElegir={onElegir}
                  primera={<CeldaSubir onClick={tocarSubir} />}
                  onQuitar={
                    borrandoVisible
                      ? (llave) => setABorrar(misIconos.find((i) => i.llave === llave) ?? null)
                      : undefined
                  }
                />
              </section>
              {CATEGORIAS_ICONO.map((c) => (
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
              ))}
            </>
          )}
        </div>
      </div>

      <input
        ref={inputArchivos}
        type="file"
        accept={TIPOS_ICONO}
        multiple
        className="hidden"
        aria-label="Elegir fotos para subir como íconos"
        onChange={(e) => {
          const archivos = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!archivos.length) return;
          subidosEnTanda.current = 0;
          setParaSubir({ archivos, libres });
        }}
      />

      {paraSubir && (
        <SubirIconos
          archivos={paraSubir.archivos}
          libres={paraSubir.libres}
          onSubido={alSubirUno}
          onCerrar={alCerrarSubida}
        />
      )}

      <Confirmar
        abierto={aBorrar !== null}
        titulo="¿Borrar este ícono?"
        texto={aBorrar ? textoBorrar(aBorrar) : ""}
        etiquetaOk="Borrar"
        peligroso
        procesando={borrando}
        onCancel={() => setABorrar(null)}
        onOk={() => void borrar()}
      />
    </Modal>
  );
}

/** Lo que dice la confirmación: cuántos productos lo usan y qué les pasa. */
function textoBorrar(i: IconoPropio): string {
  const nombre = `«${i.nombre}»`;
  if (i.enUso <= 0) return `${nombre} no lo usa ningún producto. Se borra para siempre.`;
  return i.enUso === 1
    ? `${nombre} lo usa 1 producto: va a volver a mostrar sus iniciales.`
    : `${nombre} lo usan ${i.enUso} productos: van a volver a mostrar sus iniciales.`;
}

function Pestana({
  nombre,
  marcada,
  onClick,
  children,
}: {
  nombre: string;
  marcada: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={nombre}
      title={nombre}
      aria-current={marcada ? "true" : undefined}
      className={[
        "-mb-px flex min-w-7 flex-1 justify-center border-b-2 px-0.5 pb-1.5 pt-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
        marcada ? "border-primary" : "border-transparent opacity-60 hover:opacity-100",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** La línea de «Mis íconos» según cómo vino la lista: cargando, falló, vacía o un aviso. */
function EstadoMisIconos({
  propios,
  borrando,
  aviso,
  onReintentar,
}: {
  propios: EstadoPropios;
  borrando: boolean;
  aviso: string;
  onReintentar: () => void;
}) {
  let linea: ReactNode = null;
  if (aviso) {
    linea = <span className="text-danger-text">{aviso}</span>;
  } else if (propios.estado === "cargando") {
    linea = (
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary-200 border-t-primary" aria-hidden="true" />
        Cargando tus íconos…
      </span>
    );
  } else if (propios.estado === "error") {
    linea = (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>No pudimos traer tus íconos.</span>
        <button
          type="button"
          onClick={onReintentar}
          className="rounded-lg border border-borde px-2 py-0.5 font-semibold text-texto-2 transition-colors hover:bg-muted"
        >
          Reintentar
        </button>
      </span>
    );
  } else if (propios.iconos.length === 0) {
    linea = "Subí fotos de tus productos y usalas como íconos. Sólo las ve tu negocio.";
  } else if (borrando) {
    linea = "Tocá el que quieras borrar.";
  }
  if (!linea) return null;
  return (
    <div role="status" className="pb-2 text-xs leading-snug text-texto-3">
      {linea}
    </div>
  );
}

/** La primera celda de «Mis íconos»: abre el explorador para subir fotos. */
function CeldaSubir({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full w-full flex-col items-center gap-1 rounded-xl border border-dashed border-primary/50 p-1.5 text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50">
        <Icon name="plus" size={22} />
      </span>
      <span className="text-center text-[11px] font-semibold leading-tight">Subir</span>
    </button>
  );
}

function GrillaIconos({
  iconos,
  actual,
  onElegir,
  primera,
  onQuitar,
}: {
  iconos: IconoArticulo[];
  actual: string | null;
  onElegir: (llave: string) => void;
  /** Una celda antes de los íconos («Subir», en Mis íconos). */
  primera?: ReactNode;
  /** Modo «Administrar»: tocar un ícono lo borra (con confirmación) en vez de elegirlo. */
  onQuitar?: (llave: string) => void;
}) {
  return (
    <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
      {primera && <li>{primera}</li>}
      {iconos.map((ic) => {
        const elegido = actual === ic.llave;
        const propio = ic.categoria === SECCION_PROPIOS;
        return (
          <li key={ic.llave} className={onQuitar ? "relative" : undefined}>
            <button
              type="button"
              onClick={() => (onQuitar ? onQuitar(ic.llave) : onElegir(ic.llave))}
              aria-label={onQuitar ? `Borrar «${ic.etiqueta}»` : ic.etiqueta}
              aria-pressed={onQuitar ? undefined : elegido}
              title={ic.etiqueta}
              className={[
                "flex w-full flex-col items-center gap-1 rounded-xl border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                onQuitar
                  ? "border-danger/40 hover:bg-danger-bg"
                  : elegido
                    ? "border-primary bg-primary-50"
                    : "border-transparent hover:bg-muted",
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
              {/* El nombre de un ícono propio lo escribe el negocio: una palabra
                  larga se parte en vez de salirse de la celda. */}
              <span
                className={`line-clamp-2 text-center text-[11px] font-semibold leading-tight text-texto-2 ${propio ? "w-full [overflow-wrap:anywhere]" : ""}`}
              >
                {ic.etiqueta}
              </span>
            </button>
            {onQuitar && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow-sm"
              >
                <Icon name="close" size={12} strokeWidth={3} />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
