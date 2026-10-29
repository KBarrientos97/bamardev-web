import type { ReactNode } from "react";
import { Icon, type NombreIcono } from "../../components/Icon";

/** Piezas chicas de Tickets y pedidos: la tarjeta de sección, el sí/no y el segmentado. */

export function Tarjeta({ titulo, children, accion }: { titulo?: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="card p-4">
      {(titulo || accion) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {titulo && <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-texto-3">{titulo}</h2>}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

export function SiNo({
  activo,
  onCambiar,
  etiqueta,
  detalle,
}: {
  activo: boolean;
  onCambiar: (v: boolean) => void;
  etiqueta: string;
  detalle?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-texto">{etiqueta}</span>
        {detalle && <span className="mt-0.5 block text-[12px] text-texto-3">{detalle}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={etiqueta}
        onClick={() => onCambiar(!activo)}
        className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors"
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

export function Segmentado<T extends string | number>({
  opciones,
  valor,
  onCambiar,
  etiqueta,
}: {
  opciones: { valor: T; texto: string }[];
  valor: T;
  onCambiar: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex rounded-xl bg-muted p-1">
      {opciones.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          onClick={() => onCambiar(o.valor)}
          className={`min-w-11 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            o.valor === valor ? "bg-white text-primary-700 shadow-sm" : "text-texto-3 hover:text-texto"
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/** Las pestañas de arriba a la derecha: Pedidos · Diseño de la pantalla · Sonido y voz. */
export function PestanasTickets<T extends string>({
  opciones,
  valor,
  onCambiar,
}: {
  opciones: { valor: T; texto: string; icono: NombreIcono }[];
  valor: T;
  onCambiar: (v: T) => void;
}) {
  return (
    <div role="tablist" aria-label="Tickets y pedidos" className="flex gap-1 overflow-x-auto overflow-y-hidden rounded-xl bg-muted p-1">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="tab"
          aria-selected={o.valor === valor}
          onClick={() => onCambiar(o.valor)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${
            o.valor === valor ? "bg-white text-primary-700 shadow-sm" : "text-texto-3 hover:text-texto"
          }`}
        >
          <Icon name={o.icono} size={15} />
          {o.texto}
        </button>
      ))}
    </div>
  );
}
