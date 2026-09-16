import { forwardRef, useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton } from "../../components/ui";

/**
 * El campo de búsqueda del mostrador. Es el mismo en la pantalla de consulta y
 * en el punto de venta, y tiene tres cosas que no tiene un buscador común:
 *
 *  · **arranca con el foco puesto.** El lector de código de barras escribe como
 *    un teclado: si el foco no está acá, el escaneo se pierde;
 *  · es **más grande** que los otros campos de la app. Es la única entrada de
 *    la pantalla y se usa sin levantar la vista del mostrador;
 *  · el botón "Escanear" no pide cámara ni permisos — devuelve el foco al campo
 *    y explica que el lector ya escribe solo. Prometer un escáner que no existe
 *    sería peor que no tener el botón.
 */
const CampoBusqueda = forwardRef<
  HTMLInputElement,
  {
    valor: string;
    onChange: (v: string) => void;
    placeholder?: string;
    /** Se dispara con Enter: el lector lo manda al terminar de escribir. */
    onEnter?: () => void;
  }
>(function CampoBusqueda(
  { valor, onChange, placeholder = "Paracetamol, BAGÓ, 7501…", onEnter },
  ref,
) {
  const propio = useRef<HTMLInputElement>(null);
  const [pista, setPista] = useState(false);

  const enfocar = () => {
    const el = (ref && typeof ref !== "function" ? ref.current : null) ?? propio.current;
    el?.focus();
  };

  useEffect(enfocar, [ref]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-texto-4">
            <Icon name="search" size={20} />
          </span>
          <input
            ref={ref ?? propio}
            value={valor}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onEnter) {
                e.preventDefault();
                onEnter();
              }
            }}
            placeholder={placeholder}
            className="w-full rounded-2xl border border-borde bg-white py-3.5 pl-12 pr-10 text-base outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100"
          />
          {valor && (
            <button
              onClick={() => {
                onChange("");
                enfocar();
              }}
              aria-label="Limpiar"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-texto-4 hover:bg-muted hover:text-texto-2"
            >
              <Icon name="close" size={17} />
            </button>
          )}
        </div>
        <Boton
          variante="ghost"
          icono="barcode"
          onClick={() => {
            enfocar();
            setPista(true);
          }}
        >
          Escanear
        </Boton>
      </div>

      {pista && (
        <p className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] text-primary-700">
          Pasá el producto por el lector: escribe solo, como un teclado. El campo ya está
          listo para recibirlo.
        </p>
      )}
    </div>
  );
});

export default CampoBusqueda;
