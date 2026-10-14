import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../components/Icon";
import { Select } from "../../components/ui";
import type { VistaAgenda } from "../../lib/agenda/modoAgenda";

/**
 * Las piezas de la barra de la agenda. Pedido del dueño (12-oct): "hay mucho
 * filtro en agenda cuando es compleja; ordená los elementos". Todo va en UNA
 * fila compacta (fecha · vista · Nueva cita) y lo secundario —sucursal, por
 * espacio, colores, pendientes— adentro de un desplegable, no en filas de
 * chips apiladas.
 */

/** Calendario (la grilla del día) o lista (las tarjetas, en orden). */
export function SwitchVista({ vista, onCambiar }: { vista: VistaAgenda; onCambiar: (v: VistaAgenda) => void }) {
  const opcion = (v: VistaAgenda, texto: string, icono: string) => (
    <button
      type="button"
      aria-pressed={vista === v}
      aria-label={texto}
      title={texto}
      onClick={() => onCambiar(v)}
      className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-colors ${
        vista === v ? "bg-primary-50 text-primary-700" : "text-texto-2 hover:bg-muted"
      }`}
    >
      <Icon name={icono} size={16} />
      <span className="hidden sm:inline">{texto}</span>
    </button>
  );
  return (
    <div role="group" aria-label="Vista de la agenda" className="flex items-center rounded-xl border border-borde bg-white p-0.5">
      {opcion("calendario", "Calendario", "calendar")}
      {opcion("lista", "Lista", "lista")}
    </div>
  );
}

/**
 * Un botón que abre un panel chico debajo. El panel va `fixed` y acomodado a
 * la pantalla: en un celular el botón puede quedar a la izquierda y un panel
 * colgado de su borde se saldría de costado.
 */
export function Desplegable({
  etiqueta,
  icono,
  contador,
  alerta = false,
  children,
}: {
  etiqueta: string;
  icono: string;
  /** Un número al lado (filtros activos, pendientes). 0 o nada = sin número. */
  contador?: number;
  alerta?: boolean;
  children: (cerrar: () => void) => ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);
  const boton = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    const r = boton.current.getBoundingClientRect();
    const vw = window.innerWidth || 1024;
    const width = Math.min(340, vw - 32);
    setPos({ top: r.bottom + 6, left: Math.max(16, Math.min(r.right - width, vw - width - 16)), width });
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    // Con otra medida de ventana el panel quedaría lejos de su botón.
    const cerrar = () => setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="relative">
      <button
        ref={boton}
        type="button"
        aria-expanded={abierto}
        aria-label={etiqueta}
        title={etiqueta}
        onClick={() => setAbierto((v) => !v)}
        className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[13px] font-semibold transition-colors ${
          alerta
            ? "border-warning/40 bg-warning-bg text-warning-text hover:brightness-95"
            : abierto
              ? "border-primary bg-primary-50 text-primary-700"
              : "border-borde bg-white text-texto-2 hover:bg-muted"
        }`}
      >
        <Icon name={icono} size={16} />
        <span className="hidden md:inline">{etiqueta}</span>
        {!!contador && (
          <span
            className={`min-w-5 rounded-full px-1.5 text-[11px] font-bold ${
              alerta ? "bg-white/70" : "bg-primary-boton text-white"
            }`}
          >
            {contador}
          </span>
        )}
      </button>
      {abierto && (
        <div
          role="dialog"
          aria-label={etiqueta}
          className="fixed z-50 max-h-[70dvh] overflow-y-auto rounded-2xl border border-borde bg-white p-3.5 shadow-xl"
          style={pos ?? { top: 64, right: 16, width: 320 }}
        >
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  );
}

/**
 * Cuando no entran todos los profesionales a lo ancho, se ven de a N con
 * flechas y un selector para saltar a uno. En el celular N = 1: se elige a
 * quién mirar, sin deslizar nada.
 */
export function PaginadorColumnas({
  recursos,
  inicio,
  porPagina,
  etiqueta,
  onIr,
}: {
  recursos: { id: number; nombre: string }[];
  inicio: number;
  porPagina: number;
  /** "Barbero", "Estilista"… */
  etiqueta: string;
  onIr: (inicio: number) => void;
}) {
  const total = recursos.length;
  const fin = Math.min(total, inicio + porPagina);
  const flecha = (dir: -1 | 1) => {
    const destino = dir < 0 ? inicio - porPagina : inicio + porPagina;
    const apagada = dir < 0 ? inicio <= 0 : fin >= total;
    return (
      <button
        type="button"
        aria-label={dir < 0 ? "Anteriores" : "Siguientes"}
        disabled={apagada}
        onClick={() => onIr(Math.max(0, Math.min(destino, total - porPagina)))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-texto-2 hover:bg-muted disabled:opacity-30"
      >
        <Icon name={dir < 0 ? "chevronLeft" : "chevronRight"} size={18} />
      </button>
    );
  };
  return (
    <div className="flex items-center gap-1.5 border-b border-borde-soft px-1.5 py-1.5">
      {flecha(-1)}
      <div className="min-w-0 flex-1">
        <Select
          aria-label={`Ver ${etiqueta.toLowerCase()}`}
          value={recursos[inicio]?.id ?? ""}
          onChange={(e) => {
            const i = recursos.findIndex((r) => r.id === Number(e.target.value));
            if (i < 0) return;
            // Si pide uno, arranca por él (los siguientes, al lado).
            onIr(Math.max(0, Math.min(i, total - porPagina)));
          }}
          className="py-1.5"
        >
          {recursos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </Select>
      </div>
      <span className="shrink-0 text-[12px] text-texto-3">
        {porPagina === 1 ? `${inicio + 1} de ${total}` : `${inicio + 1}–${fin} de ${total}`}
      </span>
      {flecha(1)}
    </div>
  );
}

/** Qué quiere decir cada color, como en el lienzo. En modo simple, sólo lo que se ve ahí. */
export function Leyenda({ simple = false }: { simple?: boolean }) {
  const item = (clases: string, texto: string, estilo?: React.CSSProperties) => (
    <span className="flex items-center gap-1.5 rounded-full border border-borde bg-white px-2.5 py-1">
      <span className={`h-2.5 w-2.5 rounded-[3px] border ${clases}`} style={estilo} />
      {texto}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-2 text-[12px] text-texto-2">
      {item("bg-primary-50 border-primary", simple ? "Agendada" : "Reservada / confirmada")}
      {!simple && item("bg-info-bg border-info-text", "Llegó")}
      {!simple && item("bg-primary-boton border-primary-boton", "En atención")}
      {item("bg-warning-bg border-warning-text", "Por cobrar")}
      {item("bg-white border-dashed border-primary", "Solicitud online")}
      {item("border-borde", "Bloqueo", {
        backgroundImage: "repeating-linear-gradient(135deg, var(--color-borde-soft) 0 3px, var(--color-borde) 3px 6px)",
      })}
    </div>
  );
}
