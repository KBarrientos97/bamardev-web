import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { Buscador, Chips, EncabezadoPagina } from "../../components/filtros";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Modal,
  Vacio,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import type { Categoria } from "../../types";

/**
 * Las categorías vienen en dos sabores: las de venta agrupan el catálogo del
 * POS, y las de insumo agrupan la materia prima. Es la misma tabla con el
 * flag `esInsumo`, pero nunca se mezclan en pantalla porque un cajero busca
 * "Bebidas" y un encargado busca "Carnes y Aves".
 */
type Ambito = "venta" | "insumo";

const AMBITOS = [
  ["venta", "De venta"],
  ["insumo", "De insumo"],
] as const satisfies readonly (readonly [Ambito, string])[];

export default function Categorias() {
  const [ambito, setAmbito] = useState<Ambito>("venta");
  const esInsumo = ambito === "insumo";

  const categorias = useApi(() => api.getCategorias(esInsumo), [esInsumo]);
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [creando, setCreando] = useState(false);
  const [aBorrar, setABorrar] = useState<Categoria | null>(null);
  const [error, setError] = useState("");

  const lista = categorias.datos ?? [];
  const filtradas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    if (!texto) return lista;
    return lista.filter((c) => c.nombre.toLowerCase().includes(texto));
  }, [lista, q]);

  async function borrar() {
    if (!aBorrar) return;
    setError("");
    try {
      await api.eliminarCategoria(aBorrar.id);
      setABorrar(null);
      categorias.recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
      setABorrar(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Categorías"
        subtitulo={`${lista.length} ${esInsumo ? "de materia prima" : "del catálogo de venta"}`}
        accion={
          <Boton icono="plus" onClick={() => setCreando(true)}>
            Nueva
          </Boton>
        }
      />

      <div className="space-y-3">
        <Chips valor={ambito} opciones={AMBITOS} onChange={setAmbito} />
        <Buscador valor={q} onChange={setQ} placeholder="Buscar categoría" />
      </div>

      <ErrorMsg>{error || categorias.error}</ErrorMsg>

      {categorias.cargando ? (
        <Cargando />
      ) : filtradas.length === 0 ? (
        <div className="card">
          <Vacio
            icono="grid"
            titulo={lista.length ? "Sin resultados" : "Todavía no hay categorías"}
            texto={
              lista.length
                ? "Probá con otro texto."
                : esInsumo
                  ? "Agrupá la materia prima para encontrarla más rápido."
                  : "Agrupá los productos para que el POS sea más fácil de usar."
            }
            accion={
              !lista.length && (
                <Boton icono="plus" onClick={() => setCreando(true)}>
                  Nueva categoría
                </Boton>
              )
            }
          />
        </div>
      ) : (
        <ul className="card divide-y divide-borde-soft">
          {filtradas.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                <Icon name={esInsumo ? "sack" : "grid"} size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-texto">{c.nombre}</p>
              </div>
              {!c.activo && <Badge tono="gris">Inactiva</Badge>}
              <button
                onClick={() => setEditando(c)}
                aria-label={`Editar ${c.nombre}`}
                className="rounded-lg p-1.5 text-texto-3 hover:bg-muted hover:text-texto"
              >
                <Icon name="edit" size={16} />
              </button>
              <button
                onClick={() => setABorrar(c)}
                aria-label={`Eliminar ${c.nombre}`}
                className="rounded-lg p-1.5 text-texto-3 hover:bg-danger-bg hover:text-danger-text"
              >
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {(creando || editando) && (
        <FormCategoria
          key={editando?.id ?? "nueva"}
          categoria={editando}
          esInsumo={esInsumo}
          onClose={() => {
            setCreando(false);
            setEditando(null);
          }}
          onGuardado={() => {
            setCreando(false);
            setEditando(null);
            categorias.recargar();
          }}
        />
      )}

      <Confirmar
        abierto={!!aBorrar}
        titulo="Eliminar categoría"
        texto={`¿Eliminar "${aBorrar?.nombre}"? Los artículos que la usan quedan sin categoría.`}
        etiquetaOk="Eliminar"
        peligroso
        onCancel={() => setABorrar(null)}
        onOk={borrar}
      />
    </div>
  );
}

function FormCategoria({
  categoria,
  esInsumo,
  onClose,
  onGuardado,
}: {
  categoria: Categoria | null;
  esInsumo: boolean;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = useState(categoria?.nombre ?? "");
  const [activo, setActivo] = useState(categoria?.activo ?? true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError("");
    if (!nombre.trim()) return setError("Poné un nombre.");

    setGuardando(true);
    try {
      if (categoria) {
        await api.actualizarCategoria(categoria.id, { nombre: nombre.trim(), activo });
      } else {
        // El ámbito no se puede cambiar después: una categoría de venta no
        // pasa a ser de insumo sin dejar huérfanos a los artículos que la usan.
        await api.crearCategoria({ nombre: nombre.trim(), esInsumo });
      }
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={categoria ? "Editar categoría" : "Nueva categoría"}
      subtitulo={esInsumo ? "De materia prima" : "Del catálogo de venta"}
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton icono="save" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="Nombre">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={esInsumo ? "Ej. Carnes y Aves" : "Ej. Bebidas"}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void guardar();
            }}
          />
        </Campo>

        {categoria && (
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="h-4 w-4 rounded border-borde accent-primary"
            />
            <span className="text-sm text-texto-2">
              Activa
              <span className="ml-1 text-texto-4">— si no, no se ofrece al cargar</span>
            </span>
          </label>
        )}

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
