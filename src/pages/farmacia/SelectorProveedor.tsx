import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import { contiene, normalizar } from "../../lib/texto";
import { useApi } from "../../lib/useApi";

export interface ProveedorElegido {
  id: number;
  nombre: string;
}

/** Cuántos se sugieren a la vez: más, y la lista tapa el formulario. */
const MAX_SUGERENCIAS = 8;

/**
 * El proveedor del ingreso: se elige de la lista, o se crea ahí mismo.
 *
 * Antes era un texto suelto, y "Droguería INTI", "drogueria inti" e "INTI"
 * eran tres proveedores distintos a la hora de saber cuánto se le compró a
 * cada uno. Ahora se escribe, aparece el que ya existe (sin importar
 * mayúsculas ni tildes) y se toca; si no está, "+ Crear «…»" lo da de alta
 * sin salir del ingreso, con el camión esperando.
 *
 * Lo que se escribió y no se eligió queda en `texto`: el formulario no guarda
 * hasta que se elija o se cree, para no volver al texto suelto por la puerta
 * de atrás.
 */
export default function SelectorProveedor({
  valor,
  texto,
  onElegir,
  onTexto,
}: {
  valor: ProveedorElegido | null;
  /** Lo tecleado sin elegir (o el proveedor viejo, de antes de la lista). */
  texto: string;
  onElegir: (p: ProveedorElegido | null) => void;
  onTexto: (t: string) => void;
}) {
  const lista = useApi(() => api.proveedores(), []);
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");

  const q = texto.trim();
  const sugeridos = useMemo(() => {
    const todos = lista.datos ?? [];
    return (q ? todos.filter((p) => contiene(p.nombre, q)) : todos).slice(0, MAX_SUGERENCIAS);
  }, [lista.datos, q]);
  // Si ya existe con ese nombre (sin mayúsculas ni tildes), no se ofrece crearlo.
  const existe = (lista.datos ?? []).some((p) => normalizar(p.nombre) === normalizar(q));
  const puedeCrear = q.length >= 2 && !existe;
  const opciones = sugeridos.length + (puedeCrear ? 1 : 0);

  function elegir(p: ProveedorElegido) {
    onElegir(p);
    onTexto("");
    setAbierto(false);
    setError("");
  }

  async function crear() {
    if (creando) return;
    setCreando(true);
    setError("");
    try {
      const nuevo = await api.crearProveedor({ nombre: q });
      lista.recargar();
      elegir({ id: nuevo.id, nombre: nuevo.nombre });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el proveedor");
    } finally {
      setCreando(false);
    }
  }

  if (valor) {
    return (
      <div className="flex min-h-[42px] items-center justify-between gap-2 rounded-xl border border-primary bg-primary-50 px-3.5 py-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-texto">
          <span className="shrink-0 text-primary-700">
            <Icon name="truck" size={16} />
          </span>
          <span className="truncate" title={valor.nombre}>
            {valor.nombre}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            onElegir(null);
            setAbierto(true);
          }}
          aria-label={`Cambiar el proveedor ${valor.nombre}`}
          className="shrink-0 rounded-lg p-1 text-texto-3 hover:bg-white hover:text-texto"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={texto}
        onChange={(e) => {
          onTexto(e.target.value);
          setAbierto(true);
          setMarcado(0);
        }}
        onFocus={() => setAbierto(true)}
        // Un momento antes de cerrar: si no, el toque en la opción no llega.
        onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (!abierto || opciones === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setMarcado((m) => (m + 1) % opciones);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setMarcado((m) => (m - 1 + opciones) % opciones);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (marcado < sugeridos.length) elegir(sugeridos[marcado]);
            else void crear();
          } else if (e.key === "Escape") {
            setAbierto(false);
          }
        }}
        role="combobox"
        aria-expanded={abierto && opciones > 0}
        aria-controls="proveedores-sugeridos"
        aria-autocomplete="list"
        aria-label="Proveedor"
        placeholder="Buscá la droguería o escribí una nueva"
        className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100 ${
          q ? "border-warning" : "border-borde"
        }`}
      />
      {q && !abierto && (
        <span className="mt-1 block text-xs text-warning-text">
          Elegilo de la lista o crealo, para que sus compras se sumen juntas.
        </span>
      )}
      {error && <span className="mt-1 block text-xs text-danger-text">{error}</span>}

      {abierto && opciones > 0 && (
        <ul
          id="proveedores-sugeridos"
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-borde bg-white py-1 shadow-lg"
        >
          {sugeridos.map((p, i) => (
            <li key={p.id} role="option" aria-selected={marcado === i}>
              <button
                type="button"
                // mousedown y no click: se adelanta al blur del campo.
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir({ id: p.id, nombre: p.nombre });
                }}
                className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm ${
                  marcado === i ? "bg-primary-50 text-texto" : "text-texto-2 hover:bg-muted"
                }`}
              >
                <span className="truncate font-semibold">{p.nombre}</span>
                {p.nit && <span className="shrink-0 text-xs text-texto-4">NIT {p.nit}</span>}
              </button>
            </li>
          ))}
          {puedeCrear && (
            <li role="option" aria-selected={marcado === sugeridos.length}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void crear();
                }}
                disabled={creando}
                className={`flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm font-semibold text-primary-700 ${
                  marcado === sugeridos.length ? "bg-primary-50" : "hover:bg-muted"
                }`}
              >
                <Icon name="plus" size={15} />
                {creando ? "Creando…" : `Crear «${q}»`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
