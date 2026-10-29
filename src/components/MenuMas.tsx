import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConsultaMedia } from "../lib/agenda/useEsCelular";
import { Icon, type NombreIcono } from "./Icon";
import { Modal } from "./ui";

export interface AccionMenu {
  clave: string;
  etiqueta: string;
  icono?: NombreIcono;
  onClick: () => void;
  /** Un dato chico a la derecha ("faltan 2"), en ámbar. */
  detalle?: string;
  deshabilitada?: boolean;
  peligrosa?: boolean;
  /** Una línea fina antes de esta acción, para separar grupos. */
  separar?: boolean;
}

/** Lo que separa el desplegable del botón, y de los bordes de la pantalla. */
const SEPARACION = 6;
const MARGEN = 8;

/** Dónde se dibuja el desplegable: pegado al botón, abajo o arriba. */
interface Posicion {
  right: number;
  top?: number;
  bottom?: number;
  lado: "abajo" | "arriba";
}

/**
 * El menú "⋯" (PLAN-ACADEMIAS §5, versión limpia): una acción principal por
 * pantalla y el resto acá. En escritorio es un desplegable junto al botón; en
 * el celular, una hoja inferior con renglones altos, fáciles de tocar.
 *
 * L8 (28-oct): el desplegable se dibuja en el `body` con posición fija según
 * el botón. Antes iba adentro del botón con `absolute` y la `Tarjeta`
 * (`overflow-hidden`, que redondea las esquinas en toda la academia) lo
 * cortaba: en Inscripciones online "WhatsApp" se veía a medias y "Descartar"
 * no se veía. Abre hacia arriba si abajo no entra, y se cierra al hacer scroll
 * o cambiar el tamaño de la ventana (fijo, se quedaría flotando lejos de su
 * botón).
 */
export default function MenuMas({
  etiqueta,
  acciones,
  titulo,
  className = "",
}: {
  /** Para el lector de pantalla: "Más acciones del grupo". */
  etiqueta: string;
  acciones: AccionMenu[];
  /** El título de la hoja en el celular. */
  titulo?: string;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<Posicion | null>(null);
  const celular = useConsultaMedia("(max-width: 767px)");
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const desplegable = abierto && !celular;

  // Se mide antes de pintar: el menú sale primero invisible y acá se ubica con
  // su alto real (cambia con la cantidad de acciones).
  useLayoutEffect(() => {
    if (!desplegable) return;
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const alto = menu.current?.offsetHeight ?? 0;
    const abajo = window.innerHeight - r.bottom;
    const haciaArriba = abajo < alto + SEPARACION + MARGEN && r.top > abajo;
    const right = Math.max(MARGEN, window.innerWidth - r.right);
    setPos(
      haciaArriba
        ? { right, bottom: window.innerHeight - r.top + SEPARACION, lado: "arriba" }
        : { right, top: r.bottom + SEPARACION, lado: "abajo" },
    );
  }, [desplegable]);

  // Un clic afuera, Escape, un scroll o un cambio de tamaño lo cierran (el de
  // escritorio; la hoja se cierra sola). "Afuera" es fuera del botón Y del
  // menú: el menú vive en el `body`, y sin mirarlo el mousedown sobre una
  // opción cerraba el menú antes del clic y la opción no se ejecutaba.
  useEffect(() => {
    if (!desplegable) return;
    const adentro = (n: EventTarget | null) => n instanceof Node && (!!caja.current?.contains(n) || !!menu.current?.contains(n));
    const afuera = (e: MouseEvent) => {
      if (!adentro(e.target)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbierto(false);
      boton.current?.focus();
    };
    const mover = (e: Event) => {
      if (!adentro(e.target)) setAbierto(false);
    };
    const cerrar = () => setAbierto(false);
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", tecla);
    // En captura: el scroll de la app es el del <main>, que no burbujea hasta window.
    window.addEventListener("scroll", mover, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", mover, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [desplegable]);

  if (!acciones.length) return null;

  const hacer = (a: AccionMenu) => {
    if (a.deshabilitada) return;
    setAbierto(false);
    a.onClick();
  };

  return (
    <div ref={caja} className={`relative ${className}`}>
      <button
        ref={boton}
        type="button"
        aria-label={etiqueta}
        aria-haspopup={celular ? "dialog" : "menu"}
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-borde bg-white text-texto-2 transition-colors hover:bg-muted"
      >
        <Icon name="masH" size={20} />
      </button>

      {abierto && celular && (
        <Modal abierto titulo={titulo ?? etiqueta} onClose={() => setAbierto(false)} ancho="max-w-md">
          <div className="-mx-5 -my-4 py-1">
            {acciones.map((a) => (
              <div key={a.clave}>
                {a.separar && <div className="mx-5 my-1 h-px bg-borde-soft" />}
                <button
                  type="button"
                  disabled={a.deshabilitada}
                  onClick={() => hacer(a)}
                  className={`flex min-h-12 w-full items-center gap-3 px-5 text-left text-[15px] font-semibold active:bg-muted disabled:opacity-50 ${
                    a.peligrosa ? "text-danger-text" : "text-texto-2"
                  }`}
                >
                  {a.icono && <Icon name={a.icono} size={18} />}
                  <span className="flex-1">{a.etiqueta}</span>
                  {a.detalle && <span className="text-xs text-warning-text">{a.detalle}</span>}
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {desplegable &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={etiqueta}
            data-lado={pos?.lado}
            style={
              pos
                ? { position: "fixed", right: pos.right, top: pos.top, bottom: pos.bottom }
                : // La primera pasada, para medirlo: en su lugar pero sin verse.
                  { position: "fixed", top: 0, right: MARGEN, visibility: "hidden" }
            }
            className="z-[55] max-h-[calc(100dvh-16px)] w-64 overflow-y-auto rounded-xl border border-borde bg-white p-1.5 shadow-xl"
          >
            {acciones.map((a) => (
              <div key={a.clave}>
                {a.separar && <div className="my-1 h-px bg-borde-soft" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={a.deshabilitada}
                  onClick={() => hacer(a)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 ${
                    a.peligrosa ? "text-danger-text" : "text-texto"
                  }`}
                >
                  {a.icono && <Icon name={a.icono} size={16} />}
                  <span className="flex-1">{a.etiqueta}</span>
                  {a.detalle && <span className="text-xs text-warning-text">{a.detalle}</span>}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
