import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type NombreIcono } from "../../../components/Icon";
import { leerDosis, type EscalonesDeLaSemana } from "../../../lib/nutricion/seguimiento/formato";
import type { DosisAnotada, Equivalencias, UnidadDosis } from "../../../lib/nutricion/seguimiento/tipos";

/**
 * Las piezas chicas del seguimiento: la dosis como se lee en toda la sección
 * (lo anotado y, en gris, sus equivalencias), los
 * chips de los avisos de pago, las franjas y los botones de un toque. El marco
 * (tarjetas, encabezado, tablas) es el de la Academia, como en la Evaluación.
 */

/**
 * «17 UI» y, al lado o debajo en gris, «≈ 5,1 mg · 0,17 ml». Cada equivalencia
 * baja de renglón entera. Con los escalones de su semana, la dosis de un
 * escalón va con sus valores y sin «≈» («8 UI», «2,5 mg · 0,08 ml»; §7.4).
 */
export function Dosis({
  dosis,
  escalones,
  apilada = false,
  className = "",
}: {
  dosis: Pick<DosisAnotada, "dosis" | "unidadDosis"> & Partial<Equivalencias>;
  escalones?: EscalonesDeLaSemana | null;
  /** Las equivalencias debajo (en la tabla y las tarjetas) en vez de al lado. */
  apilada?: boolean;
  className?: string;
}) {
  const { anotado, equivalencias, aprox } = leerDosis(dosis, escalones);
  return (
    <span className={`${apilada ? "block" : "inline-flex flex-wrap items-baseline gap-x-2"} tabular-nums ${className}`}>
      <span className="whitespace-nowrap font-semibold text-texto">{anotado}</span>
      {equivalencias.length > 0 && <Equivalentes partes={equivalencias} aprox={aprox} className={apilada ? "mt-0.5 block text-[12px]" : "text-[13px]"} />}
    </span>
  );
}

/**
 * «≈ 5,1 mg · 0,17 ml», en gris; cada parte entera. Las de un escalón, sin «≈»
 * (`aprox` en falso, §7.4). Si no entran en un renglón, baja una parte entera
 * y sin el «·» colgando (`ConPuntos`): en la tarjeta del teléfono se salían del borde.
 */
export function Equivalentes({ partes, aprox = true, className = "" }: { partes: string[]; aprox?: boolean; className?: string }) {
  if (!partes.length) return null;
  return (
    <span className={`text-texto-3 ${className}`}>
      <ConPuntos partes={partes.map((p, i) => (i === 0 && aprox ? `≈ ${p}` : p))} />
    </span>
  );
}

/**
 * Partes separadas por «·» que, si no entran en un renglón, bajan enteras y sin
 * el «·» colgando al final ni al principio: el «·» va dibujado delante de cada
 * parte y el de la que empieza un renglón queda fuera de la vista (margen
 * negativo y recorte). Para el lector de pantalla y al copiar, el separador va
 * escrito y oculto. Con `partir`, una parte más larga que el renglón se parte
 * adentro (un nombre de producto de 80 letras) en vez de salirse.
 */
export function ConPuntos({ partes, partir = false }: { partes: ReactNode[]; partir?: boolean }) {
  return (
    <span className="block overflow-hidden">
      <span className="-ml-[0.9em] flex flex-wrap">
        {partes.map((x, i) => (
          <span
            key={i}
            className={`relative pl-[0.9em] before:absolute before:left-0 before:w-[0.9em] before:text-center before:content-['·'] ${
              partir ? "min-w-0 break-words" : "whitespace-nowrap"
            }`}
          >
            {i > 0 && <span className="sr-only"> · </span>}
            {x}
          </span>
        ))}
      </span>
    </span>
  );
}

/** «Falta pagar» (alerta; «Falta pagar · 2» si debe dos meses) o «Toca pago» (amarillo: le toca la próxima). */
export function ChipPago({ debe, tocaPago }: { debe: number; tocaPago: boolean }) {
  if (debe > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-semibold text-danger-text ring-1 ring-inset ring-danger-text/15">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-danger" />
        Falta pagar{debe > 1 ? ` · ${debe}` : ""}
      </span>
    );
  }
  if (!tocaPago) return null;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
      Toca pago
    </span>
  );
}

/** El amarillo del casillero de pago del papel. */
export const AMARILLO = "bg-yellow-50 ring-1 ring-inset ring-yellow-300/70";

/** Una franja de aviso, bien visible: de alerta (falta un pago) o amarilla (le toca la próxima). */
export function Franja({ tono, icono, children, accion }: { tono: "alerta" | "amarilla"; icono?: NombreIcono; children: ReactNode; accion?: ReactNode }) {
  const clase =
    tono === "alerta" ? "border-danger/30 bg-danger-suave text-danger-text" : "border-yellow-300 bg-yellow-50 text-yellow-900";
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3 ${clase}`}>
      <span className="flex min-w-0 flex-1 items-start gap-2.5 text-sm font-semibold">
        <Icon name={icono ?? (tono === "alerta" ? "alert" : "bell")} size={18} className="mt-px shrink-0" />
        <span className="min-w-0">{children}</span>
      </span>
      {accion}
    </div>
  );
}

/**
 * Un botón de un toque que ESCRIBE en un campo (los escalones de la dosis,
 * «Igual que la anterior», los motivos, «Usar»): alto de dedo, nunca viene
 * marcado y no se parte en dos renglones.
 */
export function BotonToque({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-borde bg-white px-3 text-[13px] font-semibold text-texto-2 tabular-nums transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-10 ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Un botón del catálogo (los tratamientos de la lista del negocio, §9.2): ESCRIBE
 * el nombre, nunca viene marcado. Con muchos, bajan de renglón enteros; uno más
 * largo que el renglón (un nombre propio de 80 letras) se parte adentro en vez
 * de salirse.
 */
export function BotonSugerencia({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <BotonToque {...props} className={`max-w-full whitespace-normal! break-words py-1.5 ${className}`} />;
}

/**
 * «+ Agregar», discreto, al final de los botones del catálogo (§9.2): abre la
 * ventana «Tratamientos» ya en «Agregar tratamiento». Sólo para quien puede
 * cambiar la lista (`ajustes.puedeCambiarlos`).
 */
export function BotonAgregarALaLista(props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <BotonToque {...props} aria-label="Agregar un tratamiento a la lista" title="Agregar un tratamiento a la lista" className="border-dashed text-texto-3!">
      <Icon name="plus" size={15} strokeWidth={2.4} className="shrink-0" />
      Agregar
    </BotonToque>
  );
}

/** Tres botones grandes para elegir en qué se anota la dosis: «UI» · «mg» · «ml», ninguno marcado al abrir. */
export function BotonesUnidad({
  valor,
  onElegir,
  unidades,
  invalido = false,
}: {
  valor: UnidadDosis | "";
  onElegir: (u: UnidadDosis) => void;
  unidades: UnidadDosis[];
  invalido?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="¿En qué anotás la dosis?" className="grid grid-cols-3 gap-2">
      {unidades.map((u) => {
        const marcado = valor === u;
        return (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={marcado}
            onClick={() => onElegir(u)}
            className={`min-h-12 rounded-xl border-2 px-4 text-[15px] font-semibold transition-colors ${
              marcado
                ? "border-primary bg-primary-50 text-primary-700"
                : `${invalido ? "border-danger/60" : "border-borde"} bg-white text-texto-2 hover:border-primary-200 hover:bg-muted`
            }`}
          >
            {u}
          </button>
        );
      })}
    </div>
  );
}
