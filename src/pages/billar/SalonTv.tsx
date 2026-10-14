import type { ReactNode } from "react";
import { Icon } from "../../components/Icon";
import { horaDe } from "./calculo";
import { contenidoTarjeta, ESTILO_TV, lineaTarifa, partirHora, textoLibres } from "./SalonTv.datos";
import type { TipoMesa } from "./tipos";
import type { VistaMesa } from "./vista";

/**
 * Las piezas de la pantalla del salón (§7.11), compartidas por la TV con
 * sesión (`/billar/salon`) y la pública (`/tv/billar/:llave`): las dos tienen
 * que verse igual, y una copia se desincroniza al primer arreglo.
 *
 * Pensadas para un televisor mirado desde lejos: desde 1536 px (`2xl`, un
 * televisor Full HD) la letra crece y las tarjetas se ensanchan. Sin montos
 * de nadie: sólo tiempo, estado y las tarifas de la pared.
 */

/** El fondo de toda la TV: el paño del billar. Lo usa también el `Suspense` de la ruta. */
const FONDO = "bg-[#06281D] text-white";

export function MarcoSalon({
  titulo,
  vistas,
  tipos,
  cargado,
  mensaje,
  ahora,
  acciones,
  children,
}: {
  titulo: string;
  vistas: VistaMesa[];
  tipos: TipoMesa[];
  cargado: boolean;
  /** Lo que se lee mientras no hay mesas: "Cargando…" o por qué no llegan. */
  mensaje?: string | null;
  ahora: number;
  /** A la derecha del reloj: "Salir" en la TV con sesión, pantalla completa en la pública. */
  acciones?: ReactNode;
  /** Lo que flota encima (el aviso de sin conexión). */
  children?: ReactNode;
}) {
  const [hora, sufijo] = partirHora(horaDe(ahora));
  return (
    <div className={`flex min-h-dvh flex-col px-5 py-5 sm:px-8 sm:py-6 2xl:px-12 2xl:py-7 ${FONDO}`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-extrabold uppercase tracking-wide sm:text-3xl 2xl:text-5xl">
            {titulo}
          </h1>
          <p className="text-base font-semibold text-emerald-300 sm:text-lg 2xl:mt-1 2xl:text-2xl">
            {textoLibres(cargado, vistas)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-4xl font-extrabold tabular-nums sm:text-5xl 2xl:text-7xl">
            {hora}
            <span className="ml-2 text-xl font-bold sm:text-2xl 2xl:text-3xl">{sufijo}</span>
          </p>
          {acciones}
        </div>
      </header>

      {!cargado && <p className="mt-10 text-center text-lg text-white/70 2xl:text-2xl">{mensaje ?? "Cargando las mesas…"}</p>}
      {/* auto-fit y no auto-fill: con pocas mesas las tarjetas se estiran y
          llenan la tele, en vez de quedar en un rincón con media pantalla
          vacía. */}
      <div className="mt-6 grid flex-1 content-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] sm:gap-5 2xl:mt-7 2xl:gap-6 2xl:[grid-template-columns:repeat(auto-fit,minmax(400px,1fr))]">
        {vistas.map((v) => (
          <TarjetaTv key={v.mesa.id} v={v} />
        ))}
      </div>

      {tipos.length > 0 && (
        <footer className="mt-6 flex flex-wrap gap-x-8 gap-y-2 border-t border-white/10 pt-4 text-[15px] text-white/80 2xl:mt-7 2xl:gap-x-12 2xl:pt-5 2xl:text-xl">
          {tipos.map((t) => {
            const linea = lineaTarifa(t);
            return (
              <p key={t.id}>
                <b className="text-white">{t.nombre}</b> {linea.precios}
                {linea.promo && <b className="text-amber-300"> · {linea.promo}</b>}
              </p>
            );
          })}
        </footer>
      )}
      {children}
    </div>
  );
}

export function TarjetaTv({ v }: { v: VistaMesa }) {
  const estilo = ESTILO_TV[v.estado];
  const { grande, chico, progreso, color } = contenidoTarjeta(v);
  const apagada = v.estado === "fuera";
  return (
    <div
      className={`@container flex min-h-[190px] flex-col rounded-2xl border-2 px-6 py-5 2xl:min-h-[220px] 2xl:rounded-3xl 2xl:px-8 2xl:py-6 ${estilo.caja}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p
          className={`whitespace-nowrap text-[26px] font-extrabold uppercase 2xl:text-[36px] ${apagada ? "text-white/40" : ""}`}
        >
          Mesa {v.mesa.id}
        </p>
        <span
          className={`whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-extrabold uppercase tracking-wide 2xl:px-4 2xl:text-[16px] ${estilo.pill}`}
        >
          {estilo.etiqueta}
        </span>
      </div>
      {/* Por el ancho de la TARJETA (cqw) y no de la pantalla: medido por la
          pantalla, un excedente largo ("+30:14:37") se salía de la tarjeta en
          una tele de 1920 con cuatro columnas. 18 cqw deja entrar nueve
          caracteres. */}
      <p className={`mt-3 text-[clamp(36px,18cqw,120px)] font-extrabold leading-none tabular-nums ${color}`}>
        {grande}
      </p>
      <p className={`mt-2 text-[15px] font-semibold 2xl:mt-3 2xl:text-[21px] ${apagada ? "text-white/40" : "text-white/85"}`}>
        {chico}
      </p>
      {progreso !== null && (
        <div className="mt-auto pt-4">
          <div className="h-2 overflow-hidden rounded-full bg-white/15 2xl:h-3">
            <div
              className={`h-full rounded-full ${v.estado === "vence" ? "bg-amber-400" : "bg-emerald-400"}`}
              style={{ width: `${progreso * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * El sondeo dejó de llegar: flota abajo (no le cambia el alto a la grilla) y
 * se va solo cuando vuelve. Sin esto la TV quedaba congelada con los relojes
 * corriendo y nada avisaba que las mesas podían haber cambiado.
 */
export function AvisoSinConexionTv({ detalle, onReintentar }: { detalle?: string; onReintentar?: () => void }) {
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-950/95 px-4 py-3 text-[14px] text-amber-100 shadow-2xl 2xl:max-w-3xl 2xl:px-6 2xl:py-4 2xl:text-xl"
    >
      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-400" aria-hidden />
      <span className="min-w-0 flex-1">
        <b>Sin conexión con el servidor.</b> Lo que ves puede estar desactualizado: se vuelve a conectar sola.
        {detalle ? <span className="text-amber-200/80"> ({detalle})</span> : null}
      </span>
      {onReintentar && (
        <button type="button" onClick={onReintentar} className="shrink-0 font-bold underline">
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Una pantalla entera con un solo mensaje: la llave anulada, el enlace roto. */
export function MensajeTv({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className={`flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center ${FONDO}`}>
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-white/80 2xl:h-24 2xl:w-24">
        <Icon name="pantalla" size={30} className="2xl:h-11 2xl:w-11" />
      </span>
      <h1 className="max-w-2xl text-2xl font-extrabold sm:text-3xl 2xl:max-w-4xl 2xl:text-5xl">{titulo}</h1>
      {children && <div className="max-w-xl text-base text-white/75 sm:text-lg 2xl:max-w-3xl 2xl:text-2xl">{children}</div>}
    </div>
  );
}
