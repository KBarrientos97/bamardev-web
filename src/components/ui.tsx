import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Icon, type NombreIcono } from "./Icon";

// Piezas de UI compartidas, con el trazo del diseño: verde esmeralda, bordes
// suaves y radios generosos.

type Variante = "primary" | "ghost" | "danger" | "soft";

const VARIANTES: Record<Variante, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-600 active:bg-primary-700 disabled:bg-slate-300",
  soft: "bg-primary-50 text-primary-700 hover:bg-primary-100 disabled:opacity-50",
  ghost:
    "bg-white text-texto-2 border border-borde hover:bg-muted disabled:opacity-50",
  danger: "bg-danger text-white hover:brightness-95 disabled:opacity-50",
};

export function Boton({
  variante = "primary",
  icono,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  icono?: NombreIcono;
}) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTES[variante]} ${className}`}
    >
      {icono && <Icon name={icono} size={17} />}
      {children}
    </button>
  );
}

export function Campo({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-danger-text">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-texto-4">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100 disabled:bg-muted ${className}`}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary-100 ${className}`}
    >
      {children}
    </select>
  );
}

type Tono = "verde" | "amarillo" | "rojo" | "azul" | "gris" | "morado";

const TONOS: Record<Tono, string> = {
  verde: "bg-primary-50 text-primary-700",
  amarillo: "bg-warning-bg text-warning-text",
  rojo: "bg-danger-bg text-danger-text",
  azul: "bg-info-bg text-info-text",
  gris: "bg-slate-100 text-texto-3",
  morado: "bg-purple-100 text-purple-700",
};

export function Badge({
  tono = "gris",
  children,
  className = "",
}: {
  tono?: Tono;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TONOS[tono]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Cartel de "no hay nada acá", con icono y una acción opcional. */
export function Vacio({
  icono = "box",
  titulo,
  texto,
  accion,
}: {
  icono?: NombreIcono;
  titulo: string;
  texto?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
        <Icon name={icono} size={26} />
      </div>
      <h3 className="text-[15px] font-bold text-texto">{titulo}</h3>
      {texto && <p className="mt-1 max-w-xs text-sm text-texto-3">{texto}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm text-texto-3">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-200 border-t-primary" />
      {texto}
    </div>
  );
}

export function ErrorMsg({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger-text">
      <Icon name="alert" size={17} />
      <span>{children}</span>
    </div>
  );
}

/** Diálogo centrado. El foco lo maneja el navegador con el <dialog> nativo. */
export function Modal({
  abierto,
  titulo,
  subtitulo,
  onClose,
  children,
  acciones,
  ancho = "max-w-lg",
}: {
  abierto: boolean;
  titulo: string;
  subtitulo?: string;
  onClose: () => void;
  children: ReactNode;
  acciones?: ReactNode;
  ancho?: string;
}) {
  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`flex max-h-[92vh] w-full ${ancho} flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-borde-soft px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-texto">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-[13px] text-texto-3">{subtitulo}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-texto-3 transition-colors hover:bg-muted"
          >
            <Icon name="close" size={19} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {acciones && (
          <div className="flex justify-end gap-2 border-t border-borde-soft bg-muted px-5 py-3.5">
            {acciones}
          </div>
        )}
      </div>
    </div>
  );
}

/** Confirmación breve: usada para anular, eliminar y cerrar turno. */
export function Confirmar({
  abierto,
  titulo,
  texto,
  etiquetaOk = "Confirmar",
  peligroso,
  onCancel,
  onOk,
}: {
  abierto: boolean;
  titulo: string;
  texto: string;
  etiquetaOk?: string;
  peligroso?: boolean;
  onCancel: () => void;
  onOk: () => void;
}) {
  return (
    <Modal
      abierto={abierto}
      titulo={titulo}
      onClose={onCancel}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onCancel}>
            Cancelar
          </Boton>
          <Boton variante={peligroso ? "danger" : "primary"} onClick={onOk}>
            {etiquetaOk}
          </Boton>
        </>
      }
    >
      <p className="text-sm text-texto-2">{texto}</p>
    </Modal>
  );
}

/** KPI de dashboard y reportes. */
export function Kpi({
  etiqueta,
  valor,
  icono,
  tono = "verde",
  pie,
}: {
  etiqueta: string;
  valor: string;
  icono?: NombreIcono;
  tono?: Tono;
  pie?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-texto-4">
          {etiqueta}
        </span>
        {icono && (
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONOS[tono]}`}
          >
            <Icon name={icono} size={16} />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-texto">{valor}</p>
      {pie && <p className="mt-0.5 text-xs text-texto-3">{pie}</p>}
    </div>
  );
}
