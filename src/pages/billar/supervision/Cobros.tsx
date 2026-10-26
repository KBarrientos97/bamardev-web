import { useState } from "react";
import { Icon, type NombreIcono } from "../../../components/Icon";
import { fmtMoney } from "../../../lib/format";
import type { CobroApi } from "../api";
import {
  agruparPorJornada,
  etiquetaDia,
  horaCorta,
  lugarDeCobro,
  parteDe,
  qrConNombre,
  resumenVendido,
  textoConcepto,
  tipoDeMedio,
  type TipoMedio,
} from "./Cobros.datos";

/**
 * Las piezas de los cobros (26-oct): cómo se ve un medio y un renglón por
 * cobro. Las usan el detalle de una caja, el detalle de una venta y "Cobrado
 * por QR" de Reportes, así el QR se reconoce igual en las tres.
 *
 * Los colores son los de Métodos de pago (efectivo verde #10B981, QR violeta
 * #8B5CF6), y SÓLO en el ícono o en un punto: en Supervisión el violeta de
 * fondo es la cena del personal, y una caja de QR pintada así se confundía con
 * ella.
 */

const ICONO_MEDIO: Record<TipoMedio, NombreIcono> = {
  efectivo: "billetera",
  qr: "qr",
  fiado: "clock",
  otro: "tarjetas",
};

const COLOR_ICONO: Record<TipoMedio, string> = {
  efectivo: "text-emerald-600",
  qr: "text-violet-600",
  fiado: "text-amber-600",
  otro: "text-slate-500",
};

const COLOR_PUNTO: Record<TipoMedio, string> = {
  efectivo: "bg-emerald-500",
  qr: "bg-violet-500",
  fiado: "bg-amber-500",
  otro: "bg-slate-400",
};

/** El medio en un círculo gris, con su ícono en su color: el de cada renglón de cobro. */
export function IconoMedio({ medio, size = 32 }: { medio: string; size?: number }) {
  const t = tipoDeMedio(medio);
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-slate-100 ${COLOR_ICONO[t]}`}
      style={{ width: size, height: size }}
    >
      <Icon name={ICONO_MEDIO[t]} size={Math.round(size * 0.5)} />
    </span>
  );
}

/** El ícono del medio, chico y en su color, para ir pegado a un rótulo ("EN EFECTIVO", "POR QR"). */
export function MarcaMedio({ medio, size = 13 }: { medio: string; size?: number }) {
  const t = tipoDeMedio(medio);
  return (
    <span aria-hidden className={`inline-flex shrink-0 ${COLOR_ICONO[t]}`}>
      <Icon name={ICONO_MEDIO[t]} size={size} strokeWidth={2.4} />
    </span>
  );
}

/** El punto de color de un medio, el de la dona de Métodos de pago. */
export function PuntoMedio({ medio }: { medio: string }) {
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${COLOR_PUNTO[tipoDeMedio(medio)]}`} />;
}

/**
 * Un cobro: la hora, el comprobante y de dónde es arriba; lo que se vendió
 * abajo (el dato que Miguel no encontraba: "No me sale de qué producto"); el
 * monto a la derecha. Si es de una venta se toca y abre su detalle. Lo cobrado
 * a una mesa que sigue abierta todavía no tiene venta: no se abre.
 */
export function FilaCobro({
  c,
  onAbrir,
  omitirPor,
}: {
  c: CobroApi;
  onAbrir?: (ventaId: number) => void;
  /** Quién no hace falta nombrar (la cajera de la caja que se mira): se nombra sólo a otro. */
  omitirPor?: string;
}) {
  const lugar = lugarDeCobro(c);
  const vendido = c.venta ? resumenVendido(c.venta) : "";
  const concepto = textoConcepto(c.concepto);
  const parte = parteDe(c);
  const otro = c.por && c.por !== omitirPor ? c.por : null;
  // Con dos QR, el detalle de la caja los junta en "Cobrado por QR": cada renglón dice cuál fue.
  const qr = qrConNombre(c.medio);
  const abrible = onAbrir && c.venta;
  const cuerpo = (
    <>
      <IconoMedio medio={c.medio} />
      <div className="min-w-0 flex-1">
        <p className="break-words text-[13px] font-semibold leading-snug text-texto">
          <span className="tabular-nums">{horaCorta(c.hora)}</span>
          {/* El comprobante entero: se cortaba en el guion ("V-" / "000014"). */}
          {c.venta && (
            <>
              {" "}
              · <span className="whitespace-nowrap">{c.venta.codigo}</span>
            </>
          )}
          {lugar && <> · {lugar}</>}
        </p>
        {vendido && <p className="break-words text-[12px] leading-snug text-texto-2">{vendido}</p>}
        {(concepto || qr || parte || otro) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-texto-3">
            {concepto && (
              <span className="rounded bg-slate-100 px-1.5 py-px text-[11px] font-bold uppercase tracking-wide text-texto-2">{concepto}</span>
            )}
            {qr && <span className="font-semibold text-texto-2">{qr}</span>}
            {parte && <span>{parte}</span>}
            {otro && <span>cobró {otro}</span>}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[14px] font-extrabold tabular-nums text-texto">{fmtMoney(c.monto)}</span>
      {abrible && (
        <span className="mt-0.5 shrink-0 text-texto-4">
          <Icon name="chevronRight" size={16} />
        </span>
      )}
    </>
  );
  return (
    <li>
      {abrible ? (
        <button
          type="button"
          onClick={() => onAbrir(c.venta!.id)}
          className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
        >
          {cuerpo}
        </button>
      ) : (
        <div className="flex items-start gap-3 px-2 py-2.5">{cuerpo}</div>
      )}
    </li>
  );
}

/**
 * Una lista de cobros. Con `limite`, los primeros y un botón para el resto:
 * una noche movida tiene sesenta cobros en efectivo y empujaban el QR, que es
 * lo que se concilia, fuera de la vista.
 */
export function ListaCobros({
  cobros,
  onAbrir,
  omitirPor,
  limite,
  vacio,
}: {
  cobros: CobroApi[];
  onAbrir?: (ventaId: number) => void;
  omitirPor?: string;
  limite?: number;
  /** Qué decir si no hay ninguno: "nada por QR" también es un dato para el banco. */
  vacio?: string;
}) {
  const [todos, setTodos] = useState(false);
  if (cobros.length === 0) return vacio ? <p className="px-2 py-2 text-[13px] text-texto-3">{vacio}</p> : null;
  // Si sobra uno solo se muestra: el botón ocuparía el mismo renglón.
  const corta = limite != null && cobros.length > limite + 1 && !todos;
  return (
    <div>
      <ul className="divide-y divide-borde-soft">
        {(corta ? cobros.slice(0, limite) : cobros).map((c) => (
          <FilaCobro key={c.id} c={c} onAbrir={onAbrir} omitirPor={omitirPor} />
        ))}
      </ul>
      {limite != null && cobros.length > limite + 1 && (
        <button
          type="button"
          aria-expanded={todos}
          onClick={() => setTodos((v) => !v)}
          className="mt-1 inline-flex min-h-10 items-center gap-1.5 px-2 text-[13px] font-semibold text-primary-700 hover:underline"
        >
          <Icon name={todos ? "arrowUp" : "chevronDown"} size={15} />
          {todos ? "Ver menos" : `Ver los ${cobros.length} cobros`}
        </button>
      )}
    </div>
  );
}

/**
 * Los cobros de un período, por día de la jornada, con lo cobrado cada día: así
 * se pone al lado del extracto del banco. `incompleto`: hay más páginas por
 * pedir, y el último día puede seguir en la siguiente.
 */
export function CobrosPorDia({
  cobros,
  corteMin,
  onAbrir,
  incompleto = false,
}: {
  cobros: CobroApi[];
  corteMin?: number;
  onAbrir?: (ventaId: number) => void;
  incompleto?: boolean;
}) {
  const dias = agruparPorJornada(cobros, corteMin);
  return (
    <div className="space-y-4">
      {dias.map((d, i) => (
        <div key={d.dia} role="group" aria-label={etiquetaDia(d.dia)}>
          <h4 className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-borde-soft px-2 pb-1.5 text-[12px] font-bold uppercase tracking-wider text-texto-3">
            <span>{etiquetaDia(d.dia)}</span>
            <span className="tabular-nums normal-case tracking-normal">
              <b className="text-texto">{fmtMoney(d.total)}</b> · {d.cobros.length} {d.cobros.length === 1 ? "cobro" : "cobros"}
            </span>
          </h4>
          {incompleto && i === dias.length - 1 && (
            <p className="px-2 pt-1.5 text-[12px] text-texto-3">Puede haber más cobros de este día: tocá «Ver más» abajo.</p>
          )}
          <ul className="divide-y divide-borde-soft">
            {d.cobros.map((c) => (
              <FilaCobro key={c.id} c={c} onAbrir={onAbrir} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
