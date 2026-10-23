import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type NombreIcono } from "../../components/Icon";
import { ErrorMsg, Vacio } from "../../components/ui";
import type { Cuota, EstadoPagoMateria, EstadoPagoModulo, SemaforoPago } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { fueraDeAlcance, nombreCuota, textoCuota, textoEstadoPago, textoSemaforo } from "../../lib/academia/vista";

/**
 * Piezas de las pantallas del instituto. Primero eran la versión limpia de
 * PLAN-ACADEMIAS §5 (todo sobre el fondo, sin marcos); el dueño la probó y
 * no le cerró (20-oct): "no se ven los cards, es todo fondo y letras, la
 * información parece regada". Desde entonces cada bloque va en su tarjeta
 * blanca, los indicadores son tarjetas, los estados son chips de color y las
 * acciones de fila son botones de verdad. Las piezas de acá arriba son ese
 * marco: todas las pantallas de academia lo usan para verse iguales.
 */

/* ───────────────────────── Marco de página ───────────────────────── */

/**
 * El contenedor de cada pantalla: centrado, con ancho máximo y la misma
 * separación entre tarjetas. `conBarraAbajo` deja lugar a la barra fija de
 * acciones del celular.
 */
export function PaginaAcademia({
  children,
  ancho = "max-w-6xl",
  conBarraAbajo = false,
  className = "",
}: {
  children: ReactNode;
  ancho?: string;
  conBarraAbajo?: boolean;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full ${ancho} space-y-5 p-4 sm:p-6 lg:space-y-6 lg:p-8 ${conBarraAbajo ? "pb-28 md:pb-8" : ""} ${className}`}>
      {children}
    </div>
  );
}

/**
 * El encabezado de la pantalla, fuera de las tarjetas: migas o volver
 * arriba, título con su bajada a la izquierda y la acción principal a la
 * derecha.
 */
export function EncabezadoPagina({
  titulo,
  sobre,
  bajada,
  acciones,
  volver,
  children,
}: {
  titulo: ReactNode;
  /** La línea chica de arriba del título (la fecha, la sede, las migas). */
  sobre?: ReactNode;
  bajada?: ReactNode;
  acciones?: ReactNode;
  /** "← Calendario": a dónde vuelve la pantalla. */
  volver?: { a: string; texto: string };
  /** Lo que va debajo de la bajada (el estado de la caja, chips). */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-1">
        {volver && (
          <Link
            to={volver.a}
            className="mb-1 inline-flex items-center gap-1 rounded-lg text-[13px] font-semibold text-texto-3 hover:text-primary-700"
          >
            <Icon name="chevronLeft" size={15} />
            {volver.texto}
          </Link>
        )}
        {sobre && <div className="text-[13px] text-texto-3">{sobre}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-texto">{titulo}</h1>
        {bajada && <div className="text-sm text-texto-3">{bajada}</div>}
        {children}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

/**
 * Un bloque de contenido en su tarjeta blanca: título (y contador) a la
 * izquierda, acciones secundarias a la derecha, una línea suave y el
 * contenido. `sinRelleno` es para las tablas y listas que van de borde a
 * borde (las filas ponen su propio padding). `barra` va entre el encabezado
 * y el contenido: los filtros o las pestañas de lo que muestra la tarjeta.
 */
export function Tarjeta({
  titulo,
  contador,
  bajada,
  acciones,
  barra,
  pie,
  sinRelleno = false,
  children,
  className = "",
  id,
  etiqueta,
}: {
  titulo?: ReactNode;
  contador?: ReactNode;
  bajada?: ReactNode;
  acciones?: ReactNode;
  barra?: ReactNode;
  pie?: ReactNode;
  sinRelleno?: boolean;
  children?: ReactNode;
  className?: string;
  /** El id del título, para el `aria-labelledby` de la sección. */
  id?: string;
  /** El nombre de la sección cuando no tiene título visible. */
  etiqueta?: string;
}) {
  const conEncabezado = titulo != null || acciones != null;
  return (
    <section
      aria-labelledby={titulo != null && id ? id : undefined}
      aria-label={titulo == null ? etiqueta : undefined}
      className={`card min-w-0 overflow-hidden ${className}`}
    >
      {conEncabezado && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-borde-soft px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {titulo != null && (
              <h2 id={id} className="text-[15px] font-bold text-texto">
                {titulo}
                {contador != null && (
                  <>
                    {" "}
                    <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-texto-3">
                      {contador}
                    </span>
                  </>
                )}
              </h2>
            )}
            {bajada && <p className="mt-0.5 text-[13px] text-texto-3">{bajada}</p>}
          </div>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </div>
      )}
      {barra && <div className="border-b border-borde-soft px-4 sm:px-5">{barra}</div>}
      <div className={sinRelleno ? "" : "p-4 sm:p-5"}>{children}</div>
      {pie && <div className="border-t border-borde-soft bg-muted px-4 py-3 sm:px-5">{pie}</div>}
    </section>
  );
}

/* ───────────────────────── Indicadores ───────────────────────── */

/** La grilla de indicadores: 2 por fila en el celular, hasta 4 en escritorio. */
export function GrillaKpi({ children, columnas = 4 }: { children: ReactNode; columnas?: 2 | 3 | 4 }) {
  const lg = columnas === 2 ? "" : columnas === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${lg}`}>{children}</div>;
}

const TONO_KPI = {
  normal: "text-texto",
  urgente: "text-danger-text",
  ambar: "text-warning-text",
  ok: "text-primary-700",
} as const;

/**
 * Un indicador en su tarjeta: etiqueta chica, número grande y un pie. Si es
 * filtro (`onClick`) la tarjeta es un botón y la elegida lleva el anillo del
 * color del negocio.
 */
export function KpiTarjeta({
  etiqueta,
  valor,
  pie,
  tono = "normal",
  icono,
  onClick,
  seleccionado,
  etiquetaAria,
}: {
  etiqueta: ReactNode;
  valor: ReactNode;
  pie?: ReactNode;
  tono?: keyof typeof TONO_KPI;
  icono?: NombreIcono;
  onClick?: () => void;
  seleccionado?: boolean;
  etiquetaAria?: string;
}) {
  const contenido = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{etiqueta}</span>
        {icono && (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <Icon name={icono} size={15} />
          </span>
        )}
      </span>
      <span className={`mt-1.5 block truncate text-xl font-bold tabular-nums tracking-tight sm:text-2xl ${TONO_KPI[tono]}`}>{valor}</span>
      {pie && <span className="mt-0.5 block text-xs text-texto-3">{pie}</span>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={seleccionado}
        aria-label={etiquetaAria}
        className={`card min-w-0 p-4 text-left transition-[box-shadow,border-color] hover:border-primary-200 hover:shadow-md ${
          seleccionado ? "border-primary ring-2 ring-primary-100" : ""
        }`}
      >
        {contenido}
      </button>
    );
  }
  return <div className="card min-w-0 p-4">{contenido}</div>;
}

/* ───────────────────────── Tablas ───────────────────────── */

/**
 * Las clases de las tablas dentro de su tarjeta: encabezado gris en
 * mayúsculas, filas con divisor y hover, números a la derecha. Van como
 * clases (no como componente) porque cada tabla arma sus columnas.
 */
export const TABLA = {
  /** El que hace scroll lateral DENTRO de la tarjeta, nunca la página. */
  envoltura: "overflow-x-auto",
  tabla: "w-full text-sm",
  encabezado: "bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-texto-4",
  th: "px-4 py-2.5 font-semibold first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5",
  fila: "border-t border-borde-soft transition-colors hover:bg-muted",
  td: "px-4 py-3 align-middle first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5",
  numero: "text-right tabular-nums",
} as const;

/** Una lista con divisores dentro de su tarjeta (`sinRelleno`). */
export const LISTA = {
  lista: "divide-y divide-borde-soft",
  item: "px-4 py-3 sm:px-5",
  itemHover: "px-4 py-3 transition-colors hover:bg-muted sm:px-5",
} as const;

/* ───────────────────────── Botones ───────────────────────── */

type VarianteFila = "soft" | "ghost" | "primary";

const CLASE_FILA: Record<VarianteFila, string> = {
  soft: "bg-primary-50 text-primary-700 hover:bg-primary-100",
  ghost: "border border-borde bg-white text-texto-2 hover:border-primary-200 hover:bg-muted",
  primary: "bg-primary-boton text-white hover:bg-primary-boton-hover",
};

/** Las clases de un botón chico de fila, para un `<Link>` o un `<a>` propio. */
export function claseBotonFila(variante: VarianteFila = "soft") {
  return `inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 ${CLASE_FILA[variante]}`;
}

/**
 * La acción de una fila ("Cobrar", "Ver", "Enviar QR", "Marcar llegada"):
 * un botón chico que se ve como botón. Con `a` es un enlace con la misma
 * cara.
 */
export function BotonFila({
  variante = "soft",
  icono,
  a,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteFila; icono?: NombreIcono; a?: string }) {
  const cuerpo = (
    <>
      {icono && <Icon name={icono} size={15} />}
      {children}
    </>
  );
  if (a) {
    return (
      <Link to={a} className={`${claseBotonFila(variante)} ${className}`} aria-label={props["aria-label"]} title={props.title}>
        {cuerpo}
      </Link>
    );
  }
  return (
    <button type="button" {...props} className={`${claseBotonFila(variante)} ${className}`}>
      {cuerpo}
    </button>
  );
}

/** Las clases de un botón de ícono (⋯, cerrar, flechas): borde, fondo blanco y hover. */
export const CLASE_BOTON_ICONO =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-borde bg-white text-texto-2 transition-colors hover:border-primary-200 hover:bg-muted hover:text-texto disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9";

export function BotonIcono({
  icono,
  etiqueta,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icono: NombreIcono; etiqueta: string }) {
  return (
    <button type="button" aria-label={etiqueta} title={etiqueta} {...props} className={`${CLASE_BOTON_ICONO} ${className}`}>
      <Icon name={icono} size={17} />
    </button>
  );
}

/* ───────────────────────── Chips ───────────────────────── */

export type TonoChip = "verde" | "ambar" | "rojo" | "gris" | "azul" | "marca";

const CLASE_CHIP: Record<TonoChip, string> = {
  verde: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  ambar: "bg-warning-bg text-warning-text ring-warning-text/15",
  rojo: "bg-danger-bg text-danger-text ring-danger-text/15",
  gris: "bg-slate-100 text-texto-3 ring-slate-400/15",
  azul: "bg-info-bg text-info-text ring-info-text/15",
  marca: "bg-primary-50 text-primary-700 ring-primary-200/60",
};

const PUNTO_CHIP: Record<TonoChip, string> = {
  verde: "bg-emerald-500",
  ambar: "bg-warning-text",
  rojo: "bg-danger",
  gris: "bg-slate-400",
  azul: "bg-info-text",
  marca: "bg-primary",
};

/** Un estado con color: "Pagado", "Vencida", "Por revisar"… */
export function Chip({ tono = "gris", children, className = "" }: { tono?: TonoChip; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${CLASE_CHIP[tono]} ${className}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PUNTO_CHIP[tono]}`} />
      {children}
    </span>
  );
}

/**
 * Los chips de filtro ("Todas · Pendientes · Observadas"): el elegido en el
 * color del negocio, los otros blancos con borde.
 */
export function ChipsFiltro<T extends string>({
  etiqueta,
  opciones,
  valor,
  onChange,
}: {
  etiqueta: string;
  opciones: { clave: T; label: ReactNode; n?: number | null }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-2">
      {opciones.map((o) => {
        const activo = o.clave === valor;
        return (
          <button
            key={o.clave}
            type="button"
            aria-pressed={activo}
            onClick={() => onChange(o.clave)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors sm:min-h-9 ${
              activo ? "border-primary bg-primary-50 text-primary-700" : "border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            {o.label}
            {o.n != null && <span className="tabular-nums text-texto-4">{o.n}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Paneles ───────────────────────── */

/** Una sección de un panel lateral o un modal: título chico y su contenido, con línea arriba. */
export function SeccionPanel({ titulo, acciones, children }: { titulo: ReactNode; acciones?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-borde-soft py-4 first:border-t-0 first:pt-0">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{titulo}</h3>
        {acciones}
      </div>
      {children}
    </section>
  );
}

/** El resumen de un panel o un modal: un bloque gris redondeado arriba de todo. */
export function ResumenPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-muted px-4 py-3.5 ${className}`}>{children}</div>;
}

/**
 * "Todos 28 · Deben 5 · Al día 22": los indicadores SON los filtros, con la
 * línea debajo del elegido. El número de lo urgente va en rojo suave.
 */
export function FiltrosConteo<T extends string>({
  etiqueta,
  opciones,
  valor,
  onChange,
  derecha,
  enTarjeta = false,
}: {
  etiqueta: string;
  opciones: { clave: T; label: string; n?: number | null; urgente?: boolean }[];
  valor: T;
  onChange: (v: T) => void;
  /** Lo que va del otro lado de la línea (las pestañas de la pantalla). */
  derecha?: ReactNode;
  /**
   * Va en la `barra` de una `Tarjeta`, que ya pone la línea de abajo: sin
   * la propia, para que no queden dos.
   */
  enTarjeta?: boolean;
}) {
  // En el celular las pestañas no entran: el carril se corre hasta la activa
  // para que no quede cortada ("Sin p…", QA 23-oct). Sólo se mueve el carril,
  // nunca la página.
  const carril = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = carril.current;
    const t = c?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!c || !t) return;
    const margen = 16;
    if (t.offsetLeft < c.scrollLeft) c.scrollLeft = Math.max(0, t.offsetLeft - margen);
    else if (t.offsetLeft + t.offsetWidth > c.scrollLeft + c.clientWidth) {
      c.scrollLeft = t.offsetLeft + t.offsetWidth - c.clientWidth + margen;
    }
  }, [valor]);
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 ${enTarjeta ? "" : "border-b border-borde-soft"}`}>
      {/* scroll-lateral-ok: pestañas de filtro, el patrón aceptado (PLAN-TABLAS-MOVIL §2.6). */}
      <div
        ref={carril}
        role="tablist"
        aria-label={etiqueta}
        className="relative -mb-px flex max-w-full gap-5 overflow-x-auto scroll-px-4 [scrollbar-width:none]"
      >
        {opciones.map((o) => {
          const activo = o.clave === valor;
          return (
            <button
              key={o.clave}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => onChange(o.clave)}
              className={`shrink-0 whitespace-nowrap border-b-2 pb-3 pt-2.5 text-sm transition-colors ${
                activo ? "border-primary font-semibold text-texto" : "border-transparent text-texto-3 hover:text-texto-2"
              }`}
            >
              {o.label}
              {o.n != null && " "}
              {o.n != null && (
                <span className={`ml-1 tabular-nums ${o.urgente && o.n > 0 ? "text-danger-text" : "text-texto-4"}`}>
                  {o.n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {derecha}
    </div>
  );
}

const ESTILO_PAGO: Record<EstadoPagoMateria, string> = {
  PAGADA: "border-primary bg-primary",
  PARCIAL: "border-warning-text bg-[linear-gradient(90deg,var(--color-warning-text)_50%,#fff_50%)]",
  PENDIENTE: "border-slate-300 bg-white",
  VENCIDA: "border-danger bg-danger",
  NA: "border-slate-100 bg-slate-100",
};

const TEXTO_PAGO: Record<EstadoPagoMateria, string> = {
  PAGADA: "pagado",
  PARCIAL: "abono",
  PENDIENTE: "pendiente",
  VENCIDA: "vencido",
  NA: "no corresponde",
};

/**
 * El pago de cada materia en una barrita: ● pagado · ◐ abono · ○ pendiente ·
 * ! vencido. Sólo la plata: la nota va en su pestaña, nunca en la misma celda.
 */
export function PuntosPago({ pagos }: { pagos: { materiaOrden: number; estado: EstadoPagoMateria; detalle?: string }[] }) {
  const orden = [...pagos].sort((a, b) => a.materiaOrden - b.materiaOrden);
  const texto = orden.map((p) => `M${p.materiaOrden}: ${p.detalle || TEXTO_PAGO[p.estado]}`).join(", ");
  return (
    <span className="flex gap-1.5" role="img" aria-label={texto} title={texto}>
      {orden.map((p) => (
        <span key={p.materiaOrden} className={`h-2.5 w-5 rounded-[3px] border-[1.5px] ${ESTILO_PAGO[p.estado]}`} />
      ))}
    </span>
  );
}

/** Etiqueta chica arriba, valor abajo: la grilla de datos de la tarjeta móvil. */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{etiqueta}</dt>
      <dd className="truncate text-sm text-texto-2">{children}</dd>
    </div>
  );
}

/**
 * Un interruptor de sí o no, con su texto al lado. `bloqueado` lo deja a la
 * vista pero sin tocar: lo que el instituto todavía tiene que confirmar
 * (la retención, los atrasos) o lo que es regla fija (las 3 fotos).
 */
export function Interruptor({
  activo,
  onCambiar,
  etiqueta,
  detalle,
  bloqueado = false,
}: {
  activo: boolean;
  onCambiar?: (v: boolean) => void;
  etiqueta: string;
  detalle?: ReactNode;
  bloqueado?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm text-texto">{etiqueta}</span>
        {detalle && <span className="mt-0.5 block text-[13px] text-texto-3">{detalle}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={etiqueta}
        disabled={bloqueado}
        onClick={() => onCambiar?.(!activo)}
        className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: activo ? "var(--color-primary-boton)" : "#CBD5E1" }}
      >
        <span
          aria-hidden="true"
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150"
          style={{ left: activo ? 18 : 2 }}
        />
      </button>
    </div>
  );
}

/**
 * Una sección de los ajustes: el título y para qué sirve a la izquierda, lo
 * que se toca a la derecha. En el celular, uno debajo del otro.
 */
export function SeccionAjuste({ id, titulo, bajada, children }: { id: string; titulo: string; bajada?: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="card grid gap-4 p-4 sm:p-6 md:grid-cols-[minmax(200px,260px)_minmax(0,1fr)] md:gap-8"
    >
      <div>
        <h2 id={id} className="text-base font-bold text-texto">
          {titulo}
        </h2>
        {bajada && <p className="mt-1 text-[13px] text-texto-3">{bajada}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** El estado de cuenta corto del panel: un renglón por cuota. */
export function EstadoDeCuenta({ cuotas }: { cuotas: Cuota[] }) {
  if (!cuotas.length) return <p className="text-sm text-texto-3">Sin cuotas.</p>;
  return (
    <ul className="space-y-2.5">
      {cuotas.map((c) => {
        const t = textoCuota(c);
        return (
          <li key={c.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className={c.estado === "ANULADA" ? "text-texto-4 line-through" : "text-texto"}>{nombreCuota(c)}</span>
            <span
              className={`text-right tabular-nums ${t.urgente ? "font-semibold text-danger-text" : t.apagado ? "text-texto-3" : "text-texto-2"}`}
            >
              {t.texto}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const TONO_PAGO = {
  normal: "text-texto-2",
  ambar: "font-semibold text-warning-text",
  rojo: "font-semibold text-danger-text",
  gris: "text-texto-4",
} as const;

const CHIP_PAGO: Record<"normal" | "ambar" | "rojo", TonoChip> = { normal: "verde", ambar: "ambar", rojo: "rojo" };

/** "Pagado · Abonó · Sin pagar": el estado del módulo actual, en chip de color (D6). */
export function EstadoPagoTexto({ estado }: { estado: EstadoPagoModulo | null | undefined }) {
  const t = textoEstadoPago(estado);
  if (t.tono === "gris") return <span className={`text-sm ${TONO_PAGO.gris}`}>{t.texto}</span>;
  return <Chip tono={CHIP_PAGO[t.tono]}>{t.texto}</Chip>;
}

/**
 * B7: el semáforo del docente. Rojo o amarillo con su frase y nada más: ni
 * montos ni "pagado". Sin deuda vencida, una raya. Es sólo para mirar: no
 * bloquea la lista ni las notas (RM 0008/2016 art. 41).
 */
export function SemaforoTexto({ semaforo }: { semaforo: SemaforoPago | undefined }) {
  const t = textoSemaforo(semaforo ?? null);
  if (t.tono === "gris") {
    return (
      <span className={`text-sm ${TONO_PAGO.gris}`} title={t.largo} aria-label={t.largo}>
        {t.corto}
      </span>
    );
  }
  return (
    <span title={t.largo} aria-label={t.largo}>
      <Chip tono={t.tono}>{t.corto}</Chip>
    </span>
  );
}

/**
 * Lo de pago de un estudiante en una vista que también ve el docente: con el
 * semáforo (B7) si el que mira es el docente y la respuesta lo trae; si no,
 * "Pagado / Abonó / Sin pagar" como siempre (el admin y la recepción no
 * cambian).
 */
export function PagoDelModulo({
  estado,
  semaforo,
  conSemaforo,
}: {
  estado: EstadoPagoModulo | null | undefined;
  semaforo?: SemaforoPago;
  conSemaforo: boolean;
}) {
  return conSemaforo ? <SemaforoTexto semaforo={semaforo} /> : <EstadoPagoTexto estado={estado} />;
}

/**
 * El error al abrir un grupo o un estudiante (QA ronda 2, N-3). Si es por
 * alcance (otra sede, o del docente algo que no es suyo) no hay "Reintentar"
 * que valga: se dice qué pasa y se ofrece volver. Cualquier otro error (la
 * red, el servidor) sigue con su "Reintentar".
 */
export function ErrorDeCarga({
  falla,
  mensaje,
  onReintentar,
  que,
  volver,
}: {
  falla: unknown;
  mensaje: string;
  onReintentar: () => void;
  /** "este grupo", "este estudiante": lo que no se encontró. */
  que: string;
  volver: { a: string; texto: string };
}) {
  const p = usePalabras();
  const alcance = fueraDeAlcance(falla);
  const enlace = (
    <Link to={volver.a} className="text-sm font-semibold text-primary-700 hover:underline">
      {volver.texto}
    </Link>
  );
  if (alcance === "OTRA_SEDE") return <Vacio icono="lock" titulo={`Es de otra ${p.sede}`} texto={mensaje} accion={enlace} />;
  if (alcance === "NO_EXISTE") {
    return <Vacio icono="search" titulo={`No encontramos ${que}`} texto="Puede que ya no exista o que no esté a tu cargo." accion={enlace} />;
  }
  return <ErrorMsg onReintentar={onReintentar}>{mensaje}</ErrorMsg>;
}
