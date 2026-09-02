import type { ReactNode } from "react";
import { Icon } from "./Icon";

/** Fila de chips de filtro, como los del diseño. */
export function Chips<T extends string>({
  valor,
  opciones,
  onChange,
}: {
  valor: NoInfer<T>;
  opciones: readonly (readonly [T, string])[];
  onChange: (v: NoInfer<T>) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
            valor === k
              ? "bg-primary text-white"
              : "border border-borde bg-white text-texto-2 hover:bg-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Buscador({
  valor,
  onChange,
  placeholder = "Buscar…",
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex-1">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-4">
        <Icon name="search" size={17} />
      </span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-borde bg-white py-2.5 pl-10 pr-9 text-sm outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100"
      />
      {valor && (
        <button
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2.5 text-texto-4 hover:bg-muted"
        >
          <Icon name="close" size={15} />
        </button>
      )}
    </div>
  );
}

/** Encabezado de página con título, conteo y acción principal. */
export function EncabezadoPagina({
  titulo,
  subtitulo,
  accion,
}: {
  titulo: string;
  subtitulo?: string;
  accion?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold text-texto">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-[13px] text-texto-3">{subtitulo}</p>}
      </div>
      {accion && <div className="shrink-0">{accion}</div>}
    </header>
  );
}
