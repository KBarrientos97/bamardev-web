import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type NombreIcono } from "../../components/Icon";
import { Cargando, ErrorMsg, Vacio } from "../../components/ui";
import { pct } from "./formato";

/** Lo que devuelve `useApi`, sin `setDatos`. */
export interface EstadoApi<T> {
  datos: T | null;
  cargando: boolean;
  error: string;
  recargar: () => void;
}

/**
 * La carga de un reporte: el spinner, el error con Reintentar o el reporte.
 *
 * Un reporte de plata que falla NO se dibuja en cero: se dice que falló (y
 * con el mensaje del backend, que sabe decir "el período es demasiado largo").
 * Al cambiar el período se sigue viendo el anterior, atenuado, mientras llega
 * el nuevo: un spinner a pantalla completa en cada toque de chip hacía saltar
 * la página entera.
 */
export function Cargador<T>({
  estado,
  vacio,
  children,
}: {
  estado: EstadoApi<T>;
  /** Si el reporte vino vacío, qué decir (título y texto). */
  vacio?: (d: T) => { titulo: string; texto?: string; icono?: NombreIcono } | null;
  children: (d: T) => ReactNode;
}) {
  if (estado.error) return <ErrorMsg onReintentar={estado.recargar}>{estado.error}</ErrorMsg>;
  if (estado.datos == null) return <Cargando texto="Armando el reporte…" />;
  const sinNada = vacio?.(estado.datos);
  if (sinNada) {
    return (
      <div className="card">
        <Vacio icono={sinNada.icono ?? "chart"} titulo={sinNada.titulo} texto={sinNada.texto} />
      </div>
    );
  }
  return (
    <div className={`space-y-4 transition-opacity ${estado.cargando ? "pointer-events-none opacity-60" : ""}`} aria-busy={estado.cargando}>
      {children(estado.datos)}
    </div>
  );
}

/**
 * Las piezas de Reportes: tarjetas, KPIs con su flecha, filas de lista y la
 * nota azul. Todas usan los tokens del tema (`primary-*`), así el reporte de
 * un billar sale en su negro y el de una farmacia en su azul sin tocar nada.
 *
 * Lo único que NO sigue al tema son las flechas: subir es verde y bajar es
 * rojo en todos los negocios. Con el tema negro del billar, una flecha "buena"
 * del color de la marca no se distinguiría de una mala.
 */

export type TonoR = "verde" | "ambar" | "rosa" | "azul" | "morado" | "gris";

/** El cuadradito de color con el ícono: menú de reportes, filas y avisos. */
const TONO_FICHA: Record<TonoR, string> = {
  verde: "bg-primary-50 text-primary-700",
  // Desde el 12-oct todas las fichas van en el color del negocio (el menú de
  // reportes era un arcoíris); sólo rosa, que marca lo que está mal, cambia.
  ambar: "bg-primary-50 text-primary-700",
  rosa: "bg-rose-50 text-rose-600",
  azul: "bg-primary-50 text-primary-700",
  morado: "bg-primary-50 text-primary-700",
  gris: "bg-slate-100 text-slate-500",
};

export function FichaIcono({ icono, tono = "verde", size = 36 }: { icono: NombreIcono; tono?: TonoR; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl ${TONO_FICHA[tono]}`}
      style={{ width: size, height: size }}
    >
      <Icon name={icono} size={Math.round(size * 0.47)} />
    </span>
  );
}

/** Tarjeta con título, bajada y algo a la derecha (una leyenda, un selector). */
export function Tarjeta({
  titulo,
  subtitulo,
  extra,
  children,
  cuerpo = "p-4 sm:p-5",
  className = "",
}: {
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  /** Clases del cuerpo: una lista de filas va sin relleno. */
  cuerpo?: string;
  className?: string;
}) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      {(titulo || extra) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-borde-soft px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {titulo && <h2 className="text-[15px] font-bold text-texto">{titulo}</h2>}
            {subtitulo && <p className="mt-0.5 text-[12px] text-texto-3">{subtitulo}</p>}
          </div>
          {extra && <div className="shrink-0 text-[12px] text-texto-3">{extra}</div>}
        </header>
      )}
      <div className={cuerpo}>{children}</div>
    </section>
  );
}

/**
 * La flecha contra el período anterior: "↗ +13 %", "↘ −6 %", "=".
 *
 * `fraccion` es la variación (0,13 = +13 %); con `puntos` el número ya está en
 * puntos (la ocupación sube "+4 pts", no "+11 %"). `menosEsMejor` da vuelta el
 * color para lo que conviene que baje (descuentos, faltantes): bajar es verde.
 * Null no dibuja nada: sin período anterior con qué comparar no hay flecha.
 */
export function Delta({
  fraccion,
  puntos,
  menosEsMejor = false,
  className = "",
}: {
  fraccion?: number | null;
  puntos?: number | null;
  menosEsMejor?: boolean;
  className?: string;
}) {
  const valor = puntos ?? fraccion;
  if (valor == null || !Number.isFinite(valor)) return null;
  const entero = puntos != null ? Math.round(puntos) : Math.round(valor * 100);
  const base = "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums";
  if (entero === 0) {
    return <span className={`${base} bg-slate-100 text-slate-500 ${className}`}>=</span>;
  }
  const sube = entero > 0;
  const bueno = sube !== menosEsMejor;
  const texto = puntos != null ? `${sube ? "+" : "−"}${Math.abs(entero)} pts` : `${sube ? "+" : "−"}${Math.abs(entero)} %`;
  return (
    <span
      className={`${base} ${bueno ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"} ${className}`}
      title={sube ? "Subió contra el período anterior" : "Bajó contra el período anterior"}
    >
      <Icon name={sube ? "trendingUp" : "trendingDown"} size={12} />
      {texto}
    </span>
  );
}

/** KPI de reporte: rótulo, número, flecha y una línea de contexto. */
export function KpiR({
  etiqueta,
  valor,
  delta,
  pie,
  tono = "normal",
  icono,
}: {
  etiqueta: string;
  valor: ReactNode;
  delta?: ReactNode;
  pie?: ReactNode;
  /** `marca`: el número va en el color del negocio (un ingreso); `alerta`: en rojo. */
  tono?: "normal" | "marca" | "alerta";
  icono?: NombreIcono;
}) {
  const color = tono === "marca" ? "text-primary-700" : tono === "alerta" ? "text-rose-700" : "text-texto";
  return (
    <div className="card min-w-0 p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-texto-3">
        {icono && <Icon name={icono} size={13} />}
        <span className="truncate">{etiqueta}</span>
      </p>
      <p className={`mt-1.5 truncate text-[22px] font-extrabold leading-tight tabular-nums ${color}`}>{valor}</p>
      {(delta || pie) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-texto-3">
          {delta}
          {pie && <span className="min-w-0">{pie}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * La tarjeta grande de color: el número que abre un reporte (las ventas del
 * período, lo que hay por cobrar). `tono` = la marca del negocio o el ámbar de
 * la plata que te deben.
 */
export function Destacado({
  etiqueta,
  valor,
  sufijo,
  children,
  pie,
  tono = "marca",
}: {
  etiqueta: string;
  valor: ReactNode;
  /** Lo que va al lado del número, más chico ("por día"). */
  sufijo?: ReactNode;
  /** Debajo del número: la flecha, la aclaración. */
  children?: ReactNode;
  /** La franja de abajo, separada por una línea (el desglose). */
  pie?: ReactNode;
  tono?: "marca" | "ambar";
}) {
  const fondo =
    tono === "ambar"
      ? "bg-[linear-gradient(135deg,var(--color-barra)_0%,var(--color-primary-boton-activo)_100%)]"
      : "bg-[linear-gradient(135deg,var(--color-primary-boton-activo)_0%,var(--color-primary-boton)_100%)]";
  return (
    <section className={`flex flex-col rounded-[20px] p-5 text-white shadow-sm sm:p-6 ${fondo}`}>
      <p className="text-[12px] font-bold uppercase tracking-wider text-white/85">{etiqueta}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2.5 text-[34px] font-extrabold leading-tight tabular-nums sm:text-[40px]">
        {valor}
        {sufijo && <span className="text-[17px] font-bold text-white/90">{sufijo}</span>}
      </p>
      {children && <div className="mt-2 text-[13px] text-white/85">{children}</div>}
      {pie && <div className="mt-auto border-t border-white/15 pt-4">{pie}</div>}
    </section>
  );
}

/** La flecha sobre fondo de color (dentro de `Destacado`). */
export function DeltaClaro({ fraccion }: { fraccion: number | null }) {
  if (fraccion == null || !Number.isFinite(fraccion)) return null;
  const entero = Math.round(fraccion * 100);
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-[12px] font-bold tabular-nums text-white">
      {entero !== 0 && <Icon name={entero > 0 ? "trendingUp" : "trendingDown"} size={13} />}
      {entero === 0 ? "=" : `${entero > 0 ? "+" : "−"}${Math.abs(entero)} %`}
    </span>
  );
}

/** Una cifra chica del pie de `Destacado`: "Tiempo de mesa · Bs 4.601". */
export function CifraClara({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="min-w-0">
      {/* En dos renglones y no cortado: a 375 px "Consumos en mesa" quedaba "Consumos en…". */}
      <p className="text-[12px] font-semibold leading-tight text-white/75">{etiqueta}</p>
      <p className="mt-0.5 truncate text-[17px] font-bold tabular-nums">{valor}</p>
    </div>
  );
}

/**
 * Un renglón de cuenta: "− Costo de venta ··· −Bs 3.743,20". Lo que resta va
 * en rojo; `fuerte` es un subtotal (con raya arriba) y `total` el resultado.
 */
export function Renglon({
  etiqueta,
  detalle,
  valor,
  resta = false,
  fuerte = false,
  total = false,
  raya = false,
  apagado = false,
  tonoValor,
  onClick,
}: {
  etiqueta: ReactNode;
  /** La línea chica debajo del nombre ("Utilidad bruta · 31,1 %"). */
  detalle?: ReactNode;
  valor: ReactNode;
  resta?: boolean;
  fuerte?: boolean;
  total?: boolean;
  /** Raya de color arriba: el renglón es el resultado de los de arriba. */
  raya?: boolean;
  /** Un monto en cero que resta: va en gris, no en rojo (no se restó nada). */
  apagado?: boolean;
  tonoValor?: "marca" | "rojo" | "normal";
  onClick?: () => void;
}) {
  const colorValor = apagado
    ? "text-texto-4"
    : tonoValor === "marca"
      ? "text-primary-700"
      : tonoValor === "rojo" || resta
        ? "text-rose-700"
        : "text-texto";
  const contenido = (
    <>
      <div className="min-w-0">
        <p className={total ? "text-[16px] font-extrabold text-texto" : fuerte ? "text-[15px] font-bold text-texto" : "text-[13px] text-texto-2"}>
          {etiqueta}
        </p>
        {detalle && <p className="mt-0.5 text-[12px] text-texto-3">{detalle}</p>}
      </div>
      <p
        className={`shrink-0 text-right tabular-nums ${total ? "text-[22px] font-extrabold" : fuerte ? "text-[15px] font-extrabold" : "text-[13px] font-bold"} ${colorValor}`}
      >
        {valor}
      </p>
      {onClick && <Icon name="chevronRight" size={15} color="#94A3B8" />}
    </>
  );
  const clases = `flex w-full items-center justify-between gap-3 text-left ${raya ? "border-t-2 border-primary pt-3 mt-1" : ""} ${
    total || fuerte ? "py-2" : "py-1"
  }`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${clases} rounded-lg hover:bg-muted`}>
      {contenido}
    </button>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}

/** La nota de pie, en el color del negocio: cómo leer el reporte. */
export function Nota({ children, tono = "info" }: { children: ReactNode; tono?: "info" | "ambar" }) {
  const clases =
    tono === "ambar"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-primary-200 bg-primary-50 text-primary-700";
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-[13px] leading-relaxed ${clases}`}>
      <span className="mt-0.5 shrink-0">
        <Icon name={tono === "ambar" ? "alert" : "info"} size={16} />
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Pestañas tipo píldora (General · Detallado · Mensual). El tipo sale de las
 * opciones (`as const`), como en `Chips`: si se infería también del `useState`
 * y su setter, quedaba en `string` y el setter no compilaba.
 */
export function Segmentos<T extends string>({
  valor,
  opciones,
  onChange,
}: {
  valor: NoInfer<T>;
  opciones: readonly (readonly [T, string])[];
  onChange: (v: NoInfer<T>) => void;
}) {
  return (
    <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-slate-100 p-1" role="tablist">
      {opciones.map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={valor === k}
          onClick={() => onChange(k)}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
            valor === k ? "bg-white text-texto shadow-sm" : "text-texto-3 hover:text-texto"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** La etiqueta en mayúsculas de una fila ("VENCIDO", "AGOTADO", "3 DÍAS"). */
export function Chip({ tono = "gris", children }: { tono?: TonoR | "rojo"; children: ReactNode }) {
  const clases: Record<TonoR | "rojo", string> = {
    verde: "bg-primary-50 text-primary-700",
    ambar: "bg-amber-100 text-amber-800",
    rosa: "bg-rose-50 text-rose-700",
    rojo: "bg-rose-100 text-rose-700",
    azul: "bg-primary-50 text-primary-700",
    morado: "bg-primary-100 text-primary-700",
    gris: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide ${clases[tono]}`}>
      {children}
    </span>
  );
}

/**
 * Una fila de lista: ícono, título con su chip, dos líneas de detalle y el
 * monto a la derecha. Con `onClick` o `a` se toca (y lleva la flechita).
 */
export function FilaLista({
  icono,
  tono = "verde",
  inicio,
  titulo,
  chip,
  linea,
  linea2,
  valor,
  valorPie,
  tonoValor = "normal",
  barra,
  onClick,
  a,
  tachado = false,
  ajustar = false,
}: {
  icono?: NombreIcono;
  tono?: TonoR;
  /** En lugar del ícono (el número del ranking, "×2"). */
  inicio?: ReactNode;
  titulo: ReactNode;
  chip?: ReactNode;
  linea?: ReactNode;
  linea2?: ReactNode;
  valor?: ReactNode;
  valorPie?: ReactNode;
  tonoValor?: "normal" | "marca" | "rojo" | "ambar" | "apagado";
  /** Barra fina debajo del texto: la proporción contra el primero. */
  barra?: { fraccion: number; tono?: "marca" | "azul" | "rosa" | "ambar" | "morado" };
  onClick?: () => void;
  a?: string;
  tachado?: boolean;
  /**
   * Los textos bajan de renglón en vez de cortarse con "…". Para cuando lo
   * cortado es justo el dato: en el celular, "Pago a proveedor · Dist…"
   * escondía a quién se le pagó.
   */
  ajustar?: boolean;
}) {
  const corte = ajustar ? "break-words" : "truncate";
  const colorValor = {
    normal: "text-texto",
    marca: "text-primary-700",
    rojo: "text-rose-700",
    ambar: "text-amber-700",
    apagado: "text-texto-4",
  }[tonoValor];
  const colorBarra = {
    marca: "bg-primary",
    azul: "bg-primary",
    rosa: "bg-rose-500",
    ambar: "bg-primary/70",
    morado: "bg-primary/70",
  }[barra?.tono ?? "marca"];
  const cuerpo = (
    <>
      {inicio ?? (icono && <FichaIcono icono={icono} tono={tono} size={40} />)}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={`min-w-0 ${corte} text-[14px] font-bold ${tachado ? "text-texto-4" : "text-texto"}`}>{titulo}</span>
          {chip}
        </div>
        {linea && <p className={`mt-0.5 ${corte} text-[12px] text-texto-3`}>{linea}</p>}
        {linea2 && <p className={`${corte} text-[12px] text-texto-3`}>{linea2}</p>}
        {barra && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div className={`h-full rounded-full ${colorBarra}`} style={{ width: `${Math.max(1, Math.min(1, barra.fraccion) * 100)}%` }} />
          </div>
        )}
      </div>
      {(valor != null || valorPie) && (
        <div className="shrink-0 text-right">
          {valor != null && (
            <p className={`text-[14px] font-extrabold tabular-nums ${tachado ? "text-texto-4 line-through" : colorValor}`}>{valor}</p>
          )}
          {valorPie && <p className="text-[11.5px] text-texto-3">{valorPie}</p>}
        </div>
      )}
      {(onClick || a) && <Icon name="chevronRight" size={16} color="#94A3B8" />}
    </>
  );
  const clases = "flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5";
  if (a) {
    return (
      <Link to={a} className={`${clases} transition-colors hover:bg-muted`}>
        {cuerpo}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${clases} transition-colors hover:bg-muted`}>
        {cuerpo}
      </button>
    );
  }
  return <div className={clases}>{cuerpo}</div>;
}

/** Una lista de `FilaLista` en su tarjeta, con las rayas entre filas. */
export function Lista({ children }: { children: ReactNode }) {
  return <div className="card divide-y divide-borde-soft overflow-hidden">{children}</div>;
}

/** "1", "2"… en un cuadradito: el puesto del ranking. */
export function Puesto({ n, destacado = false }: { n: number; destacado?: boolean }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[14px] font-extrabold tabular-nums ${
        destacado ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-texto-3"
      }`}
    >
      {n}
    </span>
  );
}

/** Barra horizontal con nombre y valor: "Mesa 7 ▓▓▓▓▓▓░░ 36,6 h". */
export function BarraFila({
  etiqueta,
  valor,
  fraccion,
  tono = "marca",
  ancho = "w-24",
}: {
  etiqueta: ReactNode;
  valor: ReactNode;
  fraccion: number;
  tono?: "marca" | "morado" | "azul" | "ambar" | "suave";
  /** Ancho de la columna del nombre. */
  ancho?: string;
}) {
  const color = { marca: "bg-primary", morado: "bg-primary/70", azul: "bg-primary", ambar: "bg-primary/70", suave: "bg-primary/45" }[tono];
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className={`${ancho} shrink-0 truncate font-semibold text-texto`}>{etiqueta}</span>
      <span className="h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(1, fraccion)) * 100}%` }} />
      </span>
      <span className="w-20 shrink-0 text-right font-bold tabular-nums text-texto">{valor}</span>
    </div>
  );
}

/**
 * Barra partida en dos: "Libre 62 % ▓▓▓▓▓░░░ Fijo 38 %", o "Del local / Banco
 * y deudas". Sin total no hay reparto que mostrar y se dibuja vacía.
 */
export function BarraPartida({
  a,
  b,
  etiquetaA,
  etiquetaB,
  tonoB = "morado",
}: {
  a: number;
  b: number;
  etiquetaA: ReactNode;
  etiquetaB: ReactNode;
  tonoB?: "morado" | "ambar" | "rosa";
}) {
  const total = a + b;
  const fa = total > 0 ? a / total : 0;
  const colorB = { morado: "bg-primary/45", ambar: "bg-primary/45", rosa: "bg-rose-500" }[tonoB];
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        {total > 0 && (
          <>
            <span className="h-full bg-primary-boton" style={{ width: `${fa * 100}%` }} />
            <span className={`h-full ${colorB}`} style={{ width: `${(1 - fa) * 100}%` }} />
          </>
        )}
      </div>
      <div className="mt-2 flex justify-between gap-3 text-[12px] text-texto-3">
        <span>
          {etiquetaA}
          {total > 0 && ` ${pct(fa)}`}
        </span>
        <span className="text-right">
          {etiquetaB}
          {total > 0 && ` ${pct(1 - fa)}`}
        </span>
      </div>
    </div>
  );
}

/** Tres cifras lado a lado con rayitas entre ellas (Total · Promedio · Mejor día). */
export function Cifras({ items }: { items: { etiqueta: string; valor: ReactNode; pie?: ReactNode; tono?: "marca" | "rojo" }[] }) {
  return (
    <div className="grid divide-y divide-borde-soft border-b border-borde-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map((c) => (
        <div key={c.etiqueta} className="min-w-0 px-4 py-3 sm:px-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-texto-3">{c.etiqueta}</p>
          <p
            className={`mt-0.5 truncate text-[20px] font-extrabold tabular-nums ${
              c.tono === "marca" ? "text-primary-700" : c.tono === "rojo" ? "text-rose-700" : "text-texto"
            }`}
          >
            {c.valor}
          </p>
          {c.pie && <div className="mt-0.5 text-[12px] text-texto-3">{c.pie}</div>}
        </div>
      ))}
    </div>
  );
}

/** Leyenda de un gráfico de líneas: la llena y la punteada. */
export function Leyenda({ actual, anterior }: { actual: string; anterior?: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-semibold text-texto-2">
      <span className="flex items-center gap-1.5">
        <span className="h-[3px] w-5 rounded-full bg-primary" />
        {actual}
      </span>
      {anterior && (
        <span className="flex items-center gap-1.5">
          <span className="w-5 border-t-2 border-dashed border-slate-400" />
          {anterior}
        </span>
      )}
    </span>
  );
}

/** "ENE" en el lugar del ícono. */
export function Sigla({ texto, apagado }: { texto: string; apagado: boolean }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[11.5px] font-extrabold tracking-wide ${
        apagado ? "bg-slate-100 text-texto-4" : "bg-primary-50 text-primary-700"
      }`}
    >
      {texto}
    </span>
  );
}
