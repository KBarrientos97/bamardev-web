import type { ReactNode } from "react";
import { Icon, type NombreIcono } from "../../../components/Icon";
import { Input } from "../../../components/ui";
import { Circulo } from "../ui";

/** Piezas chicas de Mesas de billar. */

/** Una casilla con su texto, tocable entera (44 px en táctil). */
export function Casilla({
  marcada,
  onCambiar,
  children,
  ayuda,
  deshabilitada,
}: {
  marcada: boolean;
  onCambiar: (v: boolean) => void;
  children: ReactNode;
  ayuda?: ReactNode;
  deshabilitada?: boolean;
}) {
  return (
    <label
      className={`flex min-h-11 items-center gap-3 text-sm text-texto ${deshabilitada ? "opacity-60" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        className="h-5 w-5 shrink-0 accent-primary"
        checked={marcada}
        disabled={deshabilitada}
        onChange={(e) => onCambiar(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block">{children}</span>
        {ayuda && <span className="block text-xs text-texto-4">{ayuda}</span>}
      </span>
    </label>
  );
}

/** Un número con su unidad adentro, a la derecha: "30 min", "3 h", "10 %". */
export function CampoSufijo({
  valor,
  onCambiar,
  sufijo,
  etiqueta,
  error,
  className = "",
  inputMode = "numeric",
  disabled,
}: {
  valor: string;
  onCambiar: (t: string) => void;
  sufijo: string;
  etiqueta: string;
  error?: string;
  className?: string;
  inputMode?: "numeric" | "decimal";
  disabled?: boolean;
}) {
  return (
    <div className={`relative ${className}`}>
      <Input
        aria-label={etiqueta}
        aria-invalid={!!error || undefined}
        inputMode={inputMode}
        value={valor}
        disabled={disabled}
        onChange={(e) => onCambiar(e.target.value)}
        className={`pr-12 tabular-nums ${error ? "ring-1 ring-rose-300" : ""}`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-texto-4">
        {sufijo}
      </span>
    </div>
  );
}

/** El texto rojo debajo de un campo. */
export function ErrorCampo({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="mt-1 text-xs font-semibold text-rose-700">{children}</p>;
}

/** El rótulo de un campo, con la parte opcional en gris y el «?» de su ayuda (ver `ayudas.tsx`). */
export function Etiqueta({ children, opcional, ayuda }: { children: ReactNode; opcional?: boolean; ayuda?: ReactNode }) {
  return (
    <p className="mb-1.5 text-[13px] font-semibold text-texto-2">
      {children}
      {opcional && <span className="font-normal text-texto-4"> (opcional)</span>}
      {ayuda}
    </p>
  );
}

export type Pestana = "mesas" | "tarifas";

const PESTANAS: { valor: Pestana; texto: string; icono: NombreIcono }[] = [
  { valor: "mesas", texto: "Mesas", icono: "numeral" },
  { valor: "tarifas", texto: "Tarifas y paquetes", icono: "perillas" },
];

/** Las dos pestañas, subrayadas. Un punto ámbar si las tarifas tienen cambios sin guardar. */
export function Pestanas({
  valor,
  onCambiar,
  sinGuardar,
}: {
  valor: Pestana;
  onCambiar: (p: Pestana) => void;
  sinGuardar: boolean;
}) {
  return (
    // overflow-y-hidden: overflow-x-auto vuelve "auto" también el eje Y, el
    // -mb-px de las pestañas lo desborda 1 px, y en Windows eso dibujaba una
    // barra vertical de 10 px que además se comía la rueda del mouse (prueba
    // profunda, 18-oct).
    <div role="tablist" aria-label="Mesas de billar" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-borde">
      {PESTANAS.map((p) => {
        const activa = p.valor === valor;
        return (
          <button
            key={p.valor}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => onCambiar(p.valor)}
            className={`-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors ${
              activa ? "border-primary-boton text-primary-700" : "border-transparent text-texto-3 hover:text-texto"
            }`}
          >
            <Icon name={p.icono} size={16} />
            {p.texto}
            {p.valor === "tarifas" && sinGuardar && (
              <span className="h-2 w-2 rounded-full bg-amber-500" title="Cambios sin guardar" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Un número del encabezado: ícono, rótulo y valor. */
export function Cifra({
  icono,
  tono,
  etiqueta,
  valor,
}: {
  icono: NombreIcono;
  tono: "verde" | "gris" | "azul";
  etiqueta: string;
  valor: ReactNode;
}) {
  return (
    <div className="card flex items-center gap-4 px-3.5 py-3 sm:px-5 sm:py-4">
      <span className="hidden sm:block">
        <Circulo icono={icono} tono={tono} size={44} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-texto-3 sm:text-[11px]">{etiqueta}</p>
        <p className="text-xl font-extrabold leading-tight tabular-nums text-texto sm:text-2xl">{valor}</p>
      </div>
    </div>
  );
}
