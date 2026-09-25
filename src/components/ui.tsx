import { useCallback, useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Icon, type NombreIcono } from "./Icon";

// Piezas de UI compartidas, con el trazo del diseño: verde esmeralda, bordes
// suaves y radios generosos.

type Variante = "primary" | "ghost" | "danger" | "soft";

const VARIANTES: Record<Variante, string> = {
  // `primary-boton` y no `primary`: el color de marca no da contraste para
  // texto blanco (el verde son 2.54:1, con 4.5 de mínimo legible) y el botón
  // se lavaba en pantallas baratas y a pleno sol. Ver index.css.
  primary:
    "bg-primary-boton text-white hover:bg-primary-boton-hover active:bg-primary-boton-activo disabled:bg-slate-300",
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

/**
 * Campo de texto de la app.
 *
 * **`type="number"` no se le pasa al navegador.** Con un campo numérico el
 * navegador decide qué hacer con la coma según SU idioma: en uno en inglés,
 * "50,50" quedaba como `5050` antes de que la pantalla lo viera, y un abono de
 * Bs 50,50 se registraba como Bs 5.050 (lo frenaba sólo si el saldo era menor).
 * Pasaba en el cobro, el arqueo, la apertura, los abonos, los precios…
 *
 * Así que un campo numérico se dibuja como texto con teclado numérico
 * (`inputMode`), y la coma se convierte en punto al teclear: el valor que le
 * llega a la pantalla es siempre `50.50`, que entienden igual `parsearMonto` y
 * `Number()`.
 */
export function Input({
  className = "",
  type,
  inputMode,
  onChange,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const numerico = type === "number";
  return (
    <input
      {...props}
      type={numerico ? "text" : type}
      inputMode={numerico ? (inputMode ?? "decimal") : inputMode}
      onChange={(e) => {
        if (numerico && e.target.value.includes(",")) {
          e.target.value = e.target.value.replace(/,/g, ".");
        }
        onChange?.(e);
      }}
      className={`w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100 disabled:bg-muted ${className}`}
    />
  );
}

/**
 * Campo de contraseña con el ojito para ver lo tipeado, igual que en la app.
 *
 * Por defecto cada campo maneja su propio ojo. Con `visible` y
 * `onCambiarVisible` lo maneja el padre, para "Cambiar contraseña": la nueva y
 * la repetida se muestran juntas, porque ver una sola no sirve para
 * compararlas. `sinOjo` deja el campo siguiendo al otro sin dibujar un segundo
 * botón.
 *
 * El `pr-11` le reserva lugar al ojo: sin eso, una contraseña larga se mete
 * abajo del ícono.
 */
export function InputPassword({
  visible,
  onCambiarVisible,
  sinOjo = false,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  visible?: boolean;
  onCambiarVisible?: (visible: boolean) => void;
  sinOjo?: boolean;
}) {
  const [visiblePropio, setVisiblePropio] = useState(false);
  const mostrando = visible ?? visiblePropio;
  const alternar = () => {
    if (onCambiarVisible) onCambiarVisible(!mostrando);
    else setVisiblePropio(!mostrando);
  };

  return (
    <div className="relative">
      <Input
        {...props}
        type={mostrando ? "text" : "password"}
        className={`${sinOjo ? "" : "pr-11"} ${className}`}
      />
      {!sinOjo && (
        <button
          type="button"
          onClick={alternar}
          // Sin esto, el clic le saca el foco al campo y el que tipeaba tiene
          // que volver a tocarlo para seguir escribiendo.
          onMouseDown={(e) => e.preventDefault()}
          aria-label={mostrando ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={mostrando}
          title={mostrando ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-texto-4 transition-colors hover:text-texto-2 focus-visible:text-primary focus-visible:outline-none"
        >
          {/* El ícono muestra lo que va a pasar al tocarlo, como en Chrome. */}
          <Icon name={mostrando ? "ojoTachado" : "ojo"} size={18} />
        </button>
      )}
    </div>
  );
}

/**
 * Desplegable.
 *
 * La flecha nativa no se usa: cada navegador dibuja la suya —en Chrome de
 * Windows, un triangulito gris pegado al borde— y al lado de un campo
 * redondeado se leia como un detalle suelto, sobre todo en un select ancho,
 * donde queda a media pantalla del texto. Con `appearance-none` se apaga y se
 * dibuja el chevron del sistema de iconos, separado del borde y del mismo gris
 * que el resto de los campos.
 *
 * El `pr-10` es parte del arreglo, no decoracion: sin ese lugar reservado, una
 * opcion larga se mete abajo de la flecha.
 */
export function Select({
  className = "",
  children,
  ...props
}: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`w-full cursor-pointer appearance-none rounded-xl border border-borde bg-white py-2.5 pl-3.5 pr-10 text-sm text-texto outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary-100 ${className}`}
      >
        {children}
      </select>
      {/* pointer-events-none: el click tiene que abrir el desplegable, no morir
          en el icono. */}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <Icon name="chevronDown" size={16} color="#94A3B8" />
      </span>
    </div>
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

/**
 * Un aviso que NO es un error: algo salió bien, o salió distinto de lo pedido
 * pero está resuelto.
 *
 * Existe porque el bloque estaba copiado inline en tres pantallas y las demás,
 * al no tenerlo a mano, mandaban sus avisos por `ErrorMsg` — que es rojo y con
 * ícono de alerta. Así, "el artículo ya tenía ventas, se archivó en vez de
 * borrarse" (una operación exitosa) se leía como una falla.
 */
export function AvisoOk({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl bg-primary-50 px-3.5 py-2.5 text-sm text-primary-700">
      <Icon name="check" size={17} />
      <span>{children}</span>
    </div>
  );
}

/**
 * Un error, con salida.
 *
 * `onReintentar` dibuja el botón: sin él, una pantalla que falla al cargar
 * queda en un cartel rojo y NADA más. El caso que lo motiva es el POS cuando
 * parpadea el wifi del local (el escenario que `api.ts` anticipa): el cajero
 * se quedaba sin forma de seguir salvo F5 — y en una tablet en modo kiosco, ni
 * eso. `useApi` ya devolvía `recargar()`; no lo cableaba nadie.
 */
export function ErrorMsg({
  children,
  onReintentar,
}: {
  children: ReactNode;
  onReintentar?: () => void;
}) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger-text">
      <Icon name="alert" size={17} />
      <span className="flex-1">{children}</span>
      {onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="shrink-0 rounded-lg border border-danger-text/30 px-2.5 py-1 text-xs font-semibold text-danger-text transition-colors hover:bg-danger-text/10"
        >
          Reintentar
        </button>
      )}
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
  cerrarAlClicAfuera = true,
}: {
  abierto: boolean;
  titulo: string;
  subtitulo?: string;
  onClose: () => void;
  children: ReactNode;
  acciones?: ReactNode;
  ancho?: string;
  /**
   * `false` en los modales con formulario: un clic al costado borraba todo lo
   * tecleado. El peor caso era el alta de producto —nombre, precio, costo,
   * categoría, ícono y la receta entera de un combo— que al reabrir arrancaba
   * limpio. Se cierra con la X o con Cancelar, que es deliberado.
   */
  cerrarAlClicAfuera?: boolean;
}) {
  // Escape cierra, como cualquier diálogo. No lo hacía: el `role="dialog"` es
  // un div, no un `<dialog>` nativo, así que el navegador no lo maneja solo.
  useEffect(() => {
    if (!abierto) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [abierto, onClose]);

  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (cerrarAlClicAfuera && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`flex max-h-[92dvh] w-full ${ancho} flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-borde-soft px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-texto">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-[13px] text-texto-3">{subtitulo}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-2.5 text-texto-3 transition-colors hover:bg-muted"
          >
            <Icon name="close" size={19} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {acciones && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-borde-soft bg-muted px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
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
  procesando,
  onCancel,
  onOk,
}: {
  abierto: boolean;
  titulo: string;
  texto: string;
  etiquetaOk?: string;
  peligroso?: boolean;
  /**
   * Mientras la operación está en vuelo el diálogo sigue abierto: sin esto el
   * botón admite un segundo toque y la acción se ejecuta dos veces. En
   * aprobar un movimiento eso significa mover el stock por duplicado.
   */
  procesando?: boolean;
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
          <Boton variante="ghost" onClick={onCancel} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton
            variante={peligroso ? "danger" : "primary"}
            onClick={onOk}
            disabled={procesando}
          >
            {procesando ? "Un momento…" : etiquetaOk}
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
      <p className="mt-2 truncate text-xl font-bold tracking-tight text-texto sm:text-2xl">{valor}</p>
      {pie && <p className="mt-0.5 text-xs text-texto-3">{pie}</p>}
    </div>
  );
}

/**
 * Aviso de éxito que se borra solo. Sin esto el cartel quedaba en pantalla
 * indefinidamente: media hora después seguía diciendo "Abono de Bs 200
 * registrado", lo que invitaba a creer que el intento nuevo era el que había
 * funcionado.
 */
export function useAviso(ms = 6000) {
  const [aviso, setAvisoState] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setAviso = useCallback(
    (texto: string) => {
      if (timer.current) clearTimeout(timer.current);
      setAvisoState(texto);
      if (texto) timer.current = setTimeout(() => setAvisoState(""), ms);
    },
    [ms],
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return [aviso, setAviso] as const;
}
