import { useId, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { normalizar } from "../../lib/texto";
import { ListaFlotante } from "./CampoSugerido";
import { comoEnLaLista, filtrarSugerencias, partirPrincipios } from "./fichaFarmaceutica";

/**
 * Los principios activos de un medicamento, como fichas.
 *
 * Un remedio puede llevar más de una droga (Clofexan = diclofenaco +
 * paracetamol) y el campo de texto de antes invitaba a cargar una sola, o a
 * escribirlas de cualquier manera: "diclofenaco/paracetamol", "Diclofenaco y
 * Paracetamol". La búsqueda por droga y los equivalentes leen este texto, así
 * que una droga mal separada era un remedio que no aparecía (12-nov, Kevin).
 *
 * Se escribe, se elige el atajo (o Enter / coma para lo que no está en la
 * lista) y queda como ficha; se sigue con la siguiente. Backspace con el campo
 * vacío saca la última. El campo crece en alto a medida que se suman.
 *
 * El rótulo va con `htmlFor` y no envolviendo el campo (como `Campo`): un
 * `<label>` que envuelve se asocia a su PRIMER control, que acá sería la × de
 * la primera ficha, y tocar el rótulo la borraba.
 */
export default function CampoPrincipios({
  etiqueta,
  ayuda,
  valor,
  onChange,
  sugerencias,
  placeholder,
}: {
  etiqueta: string;
  ayuda?: string;
  valor: readonly string[];
  onChange: (principios: string[]) => void;
  sugerencias: readonly string[];
  placeholder?: string;
}) {
  const id = useId();
  const idLista = useId();
  const ancla = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  // Qué agrega Enter. Al escribir se marca la PRIMERA opción: quien atiende
  // escribe "para" + Enter y espera Paracetamol, no una ficha "para" (12-nov,
  // visto en Chrome). Si nada coincide la lista no se ve y Enter agrega lo
  // tecleado tal cual; Esc cierra la lista para eso mismo. -1: nada marcado.
  const [marcado, setMarcado] = useState(-1);

  const opciones = useMemo(
    () => filtrarSugerencias(sugerencias, texto, { excluir: valor }),
    [sugerencias, texto, valor],
  );
  const visible = abierto && opciones.length > 0;

  /** Suma una o varias drogas, sin repetir las que ya son ficha. */
  function agregar(nuevas: string[]) {
    const ya = new Set(valor.map((v) => normalizar(v)));
    const suma: string[] = [];
    for (const n of nuevas) {
      // "losartan" queda "Losartán" si está en la lista: es la misma droga.
      const bien = comoEnLaLista(n, sugerencias);
      const clave = normalizar(bien);
      if (!bien || ya.has(clave)) continue;
      ya.add(clave);
      suma.push(bien);
    }
    if (suma.length) onChange([...valor, ...suma]);
  }

  function elegir(opcion: string) {
    agregar([opcion]);
    setTexto("");
    setMarcado(-1);
    // Cerrada: con el campo vacío la lista sería la base entera de drogas. Se
    // vuelve a abrir con la primera letra de la siguiente.
    setAbierto(false);
    campo.current?.focus();
  }

  function quitar(i: number) {
    onChange(valor.filter((_, j) => j !== i));
    campo.current?.focus();
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-texto-2">
        {etiqueta}
      </label>
      <div
        ref={ancla}
        // Tocar el espacio libre de la caja (entre fichas) lleva al campo,
        // como si la caja entera fuera un solo campo de texto.
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            campo.current?.focus();
          }
        }}
        className="flex min-h-[42px] cursor-text flex-wrap items-center gap-1.5 rounded-xl border border-borde bg-white px-2 py-1.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-100"
      >
        {valor.map((p, i) => (
          <span
            key={p}
            className="inline-flex max-w-full items-center gap-1 rounded-lg bg-primary-50 py-1 pl-2.5 pr-1 text-[13px] font-semibold text-primary-700"
          >
            <span className="truncate">{p}</span>
            <button
              type="button"
              onClick={() => quitar(i)}
              aria-label={`Quitar ${p}`}
              title={`Quitar ${p}`}
              className="shrink-0 rounded-md p-0.5 text-primary-700/70 transition-colors hover:bg-primary-100 hover:text-primary-700"
            >
              <Icon name="close" size={13} />
            </button>
          </span>
        ))}
        <input
          ref={campo}
          id={id}
          value={texto}
          autoComplete="off"
          // Sin fichas, el ejemplo; con fichas, la invitación a la siguiente.
          placeholder={valor.length ? "Agregar otra…" : placeholder}
          role="combobox"
          aria-expanded={visible}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={visible && marcado >= 0 ? `${idLista}-${marcado}` : undefined}
          onChange={(e) => {
            // La coma (y el ";" y el "+") separa: lo de antes queda como
            // ficha y se sigue escribiendo la siguiente. Se mira en el valor
            // y no en la tecla porque el teclado del celular no avisa qué
            // tecla fue, y porque pegar "Paracetamol, Cafeína" tiene que
            // dar dos fichas.
            const v = e.target.value;
            if (/[,;+]/.test(v)) {
              const partes = v.split(/[,;+]/);
              const resto = partes.pop() ?? "";
              agregar(partirPrincipios(partes.join(",")));
              setTexto(resto.trimStart());
            } else {
              setTexto(v);
            }
            setAbierto(true);
            setMarcado(v.trim() ? 0 : -1);
          }}
          // Con el campo vacío no: la lista entera de drogas no ayuda a
          // elegir ninguna. Las flechas sí la abren, para quien quiera
          // recorrerla.
          onClick={() => {
            if (texto.trim()) setAbierto(true);
          }}
          // Lo que quedó escrito sin Enter también es una droga: si no, salir
          // del campo y tocar Guardar la perdía sin avisar.
          onBlur={() => {
            if (texto.trim()) agregar([texto]);
            setTexto("");
            setAbierto(false);
            setMarcado(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              // Cierra la lista y nada más (ver `CampoSugerido`).
              if (visible) {
                e.stopPropagation();
                setAbierto(false);
                setMarcado(-1);
              }
              return;
            }
            if (e.key === "Backspace" && !texto && valor.length) {
              e.preventDefault();
              onChange(valor.slice(0, -1));
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
            if (e.key === "Enter") {
              if (visible && marcado >= 0 && marcado < opciones.length) {
                e.preventDefault();
                elegir(opciones[marcado]);
              } else if (texto.trim()) {
                e.preventDefault();
                elegir(texto);
              }
            }
          }}
          className="min-w-[8rem] flex-1 border-0 bg-transparent px-1.5 py-1 text-sm text-texto outline-none placeholder:text-texto-4"
        />
      </div>
      {ayuda && <span className="mt-1 block text-xs text-texto-4">{ayuda}</span>}
      {visible && (
        <ListaFlotante
          id={idLista}
          ancla={ancla}
          etiqueta="Principios activos"
          opciones={opciones}
          marcado={marcado}
          consulta={texto}
          onMarcar={setMarcado}
          onElegir={elegir}
        />
      )}
    </div>
  );
}
