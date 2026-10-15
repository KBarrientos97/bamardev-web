import { useEffect, useRef, useState } from "react";
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

/**
 * El menú "⋯" (PLAN-ACADEMIAS §5, versión limpia): una acción principal por
 * pantalla y el resto acá. En escritorio es un desplegable bajo el botón; en
 * el celular, una hoja inferior con renglones altos, fáciles de tocar.
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
  const celular = useConsultaMedia("(max-width: 767px)");
  const caja = useRef<HTMLDivElement>(null);

  // Un clic afuera o Escape lo cierran (el de escritorio; la hoja se cierra sola).
  useEffect(() => {
    if (!abierto || celular) return;
    const afuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto, celular]);

  if (!acciones.length) return null;

  const hacer = (a: AccionMenu) => {
    if (a.deshabilitada) return;
    setAbierto(false);
    a.onClick();
  };

  return (
    <div ref={caja} className={`relative ${className}`}>
      <button
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

      {abierto && !celular && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-30 w-64 overflow-hidden rounded-xl border border-borde bg-white p-1.5 shadow-xl"
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
        </div>
      )}
    </div>
  );
}
