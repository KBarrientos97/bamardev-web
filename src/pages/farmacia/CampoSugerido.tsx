import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/Icon";
import { Input } from "../../components/ui";
import { normalizar, posicionDe } from "../../lib/texto";
import { comoEnLaLista, filtrarSugerencias } from "./fichaFarmaceutica";

/**
 * Un campo de texto libre con atajos: se escribe, aparece lo que coincide y se
 * toca (o se elige con ↑ ↓ y Enter). Lo que no está en la lista se escribe y
 * se guarda igual.
 *
 * Reemplaza al `<datalist>` de la forma farmacéutica y el laboratorio (12-nov,
 * Kevin): Chrome lo dibuja como una lista negra suelta, con otra letra y sin
 * filtrar sin tildes ("capsula" no encontraba "Cápsula"). Éste tiene el trazo
 * de los demás menús de la app.
 */
export default function CampoSugerido({
  id,
  valor,
  onChange,
  sugerencias,
  placeholder,
  maxLength,
  etiquetaLista = "Sugerencias",
}: {
  id?: string;
  valor: string;
  onChange: (valor: string) => void;
  sugerencias: readonly string[];
  placeholder?: string;
  maxLength?: number;
  /** El nombre de la lista para el lector de pantalla ("Laboratorios"). */
  etiquetaLista?: string;
}) {
  const idLista = useId();
  const ancla = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  // -1: nada marcado. Enter con nada marcado deja lo escrito, que es el texto
  // libre; si arrancara en la primera opción, escribir "Jarabe pediátrico" y
  // dar Enter lo cambiaba por "Jarabe" sin que nadie lo pidiera.
  const [marcado, setMarcado] = useState(-1);

  const opciones = useMemo(() => filtrarSugerencias(sugerencias, valor), [sugerencias, valor]);
  const visible = abierto && opciones.length > 0;

  function cerrar() {
    setAbierto(false);
    setMarcado(-1);
  }

  function elegir(opcion: string) {
    onChange(opcion);
    cerrar();
  }

  /**
   * Lo escrito que ES una sugerencia con otra escritura ("bago", "BAGO") toma
   * la de la lista al salir del campo o con Enter: el datalist dejaba cargar el
   * mismo laboratorio de tres maneras, y así se separaba en los reportes.
   */
  function asentar() {
    const bien = comoEnLaLista(valor, sugerencias);
    // Sólo si coincidió con una: lo que no está en la lista no se toca.
    if (bien !== valor && sugerencias.includes(bien)) onChange(bien);
  }

  return (
    <div ref={ancla} className="relative">
      <Input
        id={id}
        value={valor}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        role="combobox"
        aria-expanded={visible}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={visible && marcado >= 0 ? `${idLista}-${marcado}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          setAbierto(true);
          // La primera opción queda marcada: "in" + Enter es INTI, como en
          // las fichas de principios (12-nov). Si nada coincide la lista no
          // se ve y Enter deja lo escrito.
          setMarcado(e.target.value.trim() ? 0 : -1);
        }}
        // Se abre al tocarlo, al escribir o con la flecha; NO al recibir el
        // foco (ver `ElegirArticulo`): el foco también llega solo, y una lista
        // que aparece en ese momento tapa el campo de abajo justo donde iba el
        // clic siguiente.
        onClick={() => setAbierto(true)}
        // Las opciones frenan el mousedown (ver `ListaFlotante`), así que un
        // blur es un clic o un Tab FUERA de la lista: cierra.
        onBlur={() => {
          asentar();
          cerrar();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            // Con la lista abierta, Escape cierra la lista y nada más: si
            // llegaba al modal, cerraba el alta con todo lo cargado.
            if (visible) {
              e.stopPropagation();
              cerrar();
            }
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!visible) {
              setAbierto(true);
              return;
            }
            const n = opciones.length;
            setMarcado((m) =>
              e.key === "ArrowDown" ? (m + 1) % n : m <= 0 ? n - 1 : m - 1,
            );
            return;
          }
          if (e.key === "Enter" && visible) {
            e.preventDefault();
            if (marcado >= 0 && marcado < opciones.length) elegir(opciones[marcado]);
            else {
              asentar();
              cerrar();
            }
          }
        }}
      />
      {visible && (
        <ListaFlotante
          id={idLista}
          ancla={ancla}
          etiqueta={etiquetaLista}
          opciones={opciones}
          marcado={marcado}
          consulta={valor}
          actual={valor}
          onMarcar={setMarcado}
          onElegir={elegir}
        />
      )}
    </div>
  );
}

/** Más alto, y la lista tapa medio formulario. Ocho renglones y medio. */
const ALTO_MAX = 240;

/**
 * Dónde va la lista: pegada debajo del campo o, si abajo no entra, encima.
 *
 * Se dibuja suelta (en el panel del diálogo o en el cuerpo de la página) y no
 * adentro del campo: el cuerpo del modal se desplaza y recorta, y una lista
 * colgada del campo quedaba cortada o había que desplazar el formulario para
 * ver las opciones (el mismo problema que tuvo `ElegirArticulo`). Va al panel
 * del diálogo y no al `<body>` para quedar DENTRO del `aria-modal`: afuera, un
 * lector de pantalla puede no leer las opciones.
 *
 * El panel del modal tiene `will-change: transform`, así que es el marco de
 * todo lo que lleva adentro: ahí la posición se mide desde el panel. En el
 * cuerpo, desde la pantalla.
 */
function lugarDe(campo: HTMLElement, marco: HTMLElement | null): CSSProperties {
  const r = campo.getBoundingClientRect();
  const m = marco?.getBoundingClientRect() ?? {
    top: 0,
    left: 0,
    bottom: window.innerHeight,
  };
  const abajo = m.bottom - r.bottom - 8;
  const arriba = r.top - m.top - 8;
  const haciaArriba = abajo < 160 && arriba > abajo;
  const alto = Math.max(120, Math.min(ALTO_MAX, haciaArriba ? arriba : abajo));
  return {
    position: marco ? "absolute" : "fixed",
    left: r.left - m.left,
    width: r.width,
    maxHeight: alto,
    ...(haciaArriba ? { bottom: m.bottom - r.top + 4 } : { top: r.bottom - m.top + 4 }),
  };
}

function mismoLugar(a: CSSProperties, b: CSSProperties): boolean {
  return (["position", "left", "width", "maxHeight", "top", "bottom"] as const).every(
    (k) => a[k] === b[k],
  );
}

/**
 * La lista desplegable de los atajos. La usan este campo y el de los
 * principios activos (`CampoPrincipios`), para que las dos se vean y se
 * manejen igual.
 *
 * El `mousedown` se frena en toda la lista: así tocar una opción (o la barra
 * de desplazamiento) no le saca el foco al campo, y el campo puede cerrar la
 * lista en su `blur` sin esperar un tiempo a ver si el toque era adentro.
 */
export function ListaFlotante({
  id,
  ancla,
  etiqueta,
  opciones,
  marcado,
  consulta,
  actual,
  onMarcar,
  onElegir,
}: {
  id: string;
  ancla: RefObject<HTMLElement | null>;
  etiqueta: string;
  opciones: readonly string[];
  marcado: number;
  /** Lo tecleado, para resaltarlo en cada opción. */
  consulta: string;
  /** El valor del campo: la opción que es igual lleva el tilde. */
  actual?: string;
  onMarcar: (i: number) => void;
  onElegir: (opcion: string) => void;
}) {
  const [marco, setMarco] = useState<HTMLElement | null>(null);
  const [lugar, setLugar] = useState<CSSProperties | null>(null);
  const medir = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const campo = ancla.current;
    if (!campo) return;
    const dialogo = campo.closest<HTMLElement>('[role="dialog"]');
    setMarco(dialogo ?? document.body);
    medir.current = () => {
      const nuevo = lugarDe(campo, dialogo);
      // Sin esto, medir en cada dibujo (abajo) volvería a dibujar para siempre.
      setLugar((antes) => (antes && mismoLugar(antes, nuevo) ? antes : nuevo));
    };
    medir.current();
    const alMover = () => medir.current();
    // `capture`: el que se desplaza es el cuerpo del modal, no la ventana, y
    // ese evento no sube. Sin esto la lista se quedaba quieta y el campo se
    // iba.
    window.addEventListener("scroll", alMover, true);
    window.addEventListener("resize", alMover);
    return () => {
      window.removeEventListener("scroll", alMover, true);
      window.removeEventListener("resize", alMover);
    };
  }, [ancla]);

  // En cada dibujo: el campo de los principios crece al sumar una ficha y la
  // lista tiene que bajar con él, sin que nada se haya desplazado.
  useLayoutEffect(() => medir.current());

  // Con las flechas, el marcado tiene que quedar a la vista aunque la lista se
  // desplace. jsdom no tiene scrollIntoView: de ahí el `?.`.
  useEffect(() => {
    if (marcado >= 0) document.getElementById(`${id}-${marcado}`)?.scrollIntoView?.({ block: "nearest" });
  }, [id, marcado]);

  if (!marco || !lugar) return null;
  const elegido = actual ? normalizar(actual.trim()) : "";

  return createPortal(
    <ul
      id={id}
      role="listbox"
      aria-label={etiqueta}
      style={lugar}
      onMouseDown={(e) => e.preventDefault()}
      className="z-30 overflow-y-auto rounded-xl border border-borde bg-white py-1 shadow-lg"
    >
      {opciones.map((o, i) => {
        const esActual = !!elegido && normalizar(o) === elegido;
        return (
          <li
            key={o}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === marcado}
            onMouseMove={() => i !== marcado && onMarcar(i)}
            onClick={() => onElegir(o)}
            className={`flex cursor-pointer items-center gap-2 px-3.5 py-2 text-sm ${
              i === marcado ? "bg-primary-50 text-primary-700" : "text-texto-2"
            }`}
          >
            <span className="min-w-0 flex-1 truncate">
              <Resaltado texto={o} q={consulta} />
            </span>
            {esActual && (
              <span className="shrink-0 text-primary-700">
                <Icon name="check" size={15} />
              </span>
            )}
          </li>
        );
      })}
    </ul>,
    marco,
  );
}

/**
 * Lo tecleado en negrita adentro de la opción, sin tildes de por medio:
 * "capsula" marca "Cápsula" entera. `posicionDe` devuelve los índices del
 * texto ORIGINAL, que es lo que hace que la marca no se corra con las tildes.
 */
function Resaltado({ texto, q }: { texto: string; q: string }) {
  const donde = posicionDe(texto, q);
  if (!donde) return <>{texto}</>;
  const [desde, hasta] = donde;
  return (
    <>
      {texto.slice(0, desde)}
      <strong className="font-bold text-texto">{texto.slice(desde, hasta)}</strong>
      {texto.slice(hasta)}
    </>
  );
}
