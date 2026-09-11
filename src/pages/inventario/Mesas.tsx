import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import {
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Input,
  Modal,
  Select,
  Vacio,
} from "../../components/ui";
import { api } from "../../lib/api";
import { contiene } from "../../lib/texto";
import { useApi } from "../../lib/useApi";
import type { Mesa } from "../../types/salon";

/**
 * Las mesas del salón, del lado del dueño.
 *
 * El mesero no crea mesas: sólo abre las que se registren acá y anota cuántas
 * personas se sientan. Una mesa fuera de servicio desaparece de su panel — es
 * la forma de sacar de la vista la que tiene una silla rota o se está
 * pintando, sin borrarla y perder su historial.
 */
export default function Mesas() {
  const mesas = useApi(() => api.getMesas(), []);
  const zonas = useApi(() => api.getZonas(), []);

  const [q, setQ] = useState("");
  const [zona, setZona] = useState<string | null>(null);
  const [editando, setEditando] = useState<Mesa | null>(null);
  const [creando, setCreando] = useState(false);

  const lista = useMemo(() => mesas.datos ?? [], [mesas.datos]);

  const visibles = useMemo(
    () =>
      lista.filter((m) => {
        if (zona && m.zonaCodigo !== zona) return false;
        if (q && !contiene(m.nombre, q) && !contiene(m.codigo, q)) return false;
        return true;
      }),
    [lista, zona, q],
  );

  const enServicio = lista.filter((m) => m.activa).length;
  const lugares = lista.filter((m) => m.activa).reduce((a, m) => a + m.capacidad, 0);

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-texto">Mesas</h1>
          <p className="text-[13px] text-texto-3">
            {enServicio} en servicio · {lugares} lugares
          </p>
        </div>
        <Boton icono="plus" onClick={() => setCreando(true)}>
          Nueva
        </Boton>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#93C5FD] bg-[#EFF6FF] px-3.5 py-3 text-[13px] text-[#2563EB]">
        <Icon name="info" size={16} />
        <div>
          <p className="font-bold">Las mesas se registran acá</p>
          <p className="mt-0.5">
            El mesero no crea mesas: sólo abre las que registres y anota cuántas personas
            se sientan. Una mesa fuera de servicio desaparece de su panel.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Kpi valor={enServicio} etiqueta="En servicio" color="text-primary" />
        <Kpi valor={lugares} etiqueta="Lugares" color="text-[#2563EB]" />
        <Kpi valor={(zonas.datos ?? []).length} etiqueta="Zonas" color="text-texto" />
      </div>

      <div className="relative mt-3">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-3">
          <Icon name="search" size={16} />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar mesa por nombre o código"
          className="w-full rounded-xl border border-borde bg-white py-2.5 pl-9 pr-3 text-[15px] outline-none focus:border-primary"
        />
      </div>

      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip activo={zona === null} onClick={() => setZona(null)}>
          Todas
        </Chip>
        {(zonas.datos ?? []).map((z) => (
          <Chip key={z.id} activo={zona === z.codigo} onClick={() => setZona(z.codigo)}>
            {z.nombre}
          </Chip>
        ))}
      </div>

      {mesas.error && <ErrorMsg>{mesas.error}</ErrorMsg>}
      {mesas.cargando && !mesas.datos ? (
        <Cargando />
      ) : visibles.length === 0 ? (
        <Vacio
          titulo={q || zona ? "Sin resultados" : "Todavía no hay mesas"}
          texto={
            q || zona
              ? "No hay mesas que coincidan con la búsqueda."
              : 'Tocá "Nueva" para cargar la primera.'
          }
        />
      ) : (
        <div className="mt-3 space-y-2">
          {visibles.map((m) => (
            <button
              key={m.id}
              onClick={() => setEditando(m)}
              className="card flex w-full items-start gap-3 p-3.5 text-left transition-shadow hover:shadow-md"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                <Icon name="grid" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-texto">{m.nombre}</p>
                <p className="truncate text-[13px] text-texto-3">{m.zonaNombre}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Dato etiqueta="Capacidad" valor={`${m.capacidad} personas`} />
                  <Dato etiqueta="Zona" valor={m.zonaNombre} />
                </div>
                <p className="mt-2 flex items-center justify-between gap-2 border-t border-borde-soft pt-2 text-xs">
                  <span className={m.activa ? "text-texto-3" : "text-[#D97706]"}>
                    {m.activa ? "Disponible para el mesero" : "Oculta en el panel de meseros"}
                  </span>
                  <span className="font-bold text-texto-3">{m.codigo}</span>
                </p>
              </div>
              <Icon name="chevronRight" size={16} />
            </button>
          ))}
        </div>
      )}

      {(creando || editando) && (
        <FormMesa
          mesa={editando}
          zonas={zonas.datos ?? []}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
          onGuardado={() => {
            setCreando(false);
            setEditando(null);
            mesas.recargar();
          }}
        />
      )}
    </div>
  );
}

function FormMesa({
  mesa,
  zonas,
  onCerrar,
  onGuardado,
}: {
  mesa: Mesa | null;
  zonas: { id: number; nombre: string }[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [codigo, setCodigo] = useState(mesa?.codigo ?? "");
  const [nombre, setNombre] = useState(mesa?.nombre ?? "");
  const [zonaId, setZonaId] = useState(mesa?.zonaId ?? zonas[0]?.id ?? 0);
  const [capacidad, setCapacidad] = useState(String(mesa?.capacidad ?? 4));
  const [nota, setNota] = useState(mesa?.notaMesa ?? "");
  const [activa, setActiva] = useState(mesa?.activa ?? true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function guardar() {
    if (guardando) return;
    setError("");
    if (!codigo.trim()) return setError("Poné el código que está pegado en la mesa.");
    const cap = Number(capacidad);
    if (!Number.isFinite(cap) || cap < 1) return setError("La capacidad es al menos 1.");

    setGuardando(true);
    try {
      const input = {
        codigo: codigo.trim(),
        ...(nombre.trim() ? { nombre: nombre.trim() } : {}),
        zonaId,
        capacidad: cap,
        ...(nota.trim() ? { notaMesa: nota.trim() } : {}),
        activa,
      };
      if (mesa) await api.actualizarMesa(mesa.id, input);
      else await api.crearMesa(input);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={mesa ? "Detalle de la Mesa" : "Nueva mesa"}
      subtitulo="Datos que usa el panel de meseros"
      onClose={onCerrar}
      ancho="max-w-md"
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton icono="save" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="Código">
          {/* Es el que está pegado en la mesa: con eso la canta el mesero. */}
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase().slice(0, 10))}
            placeholder="M1"
          />
        </Campo>
        <Campo label="Nombre (opcional)">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Mesa M1"
          />
        </Campo>
        <Campo label="Zona">
          <Select value={zonaId} onChange={(e) => setZonaId(Number(e.target.value))}>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo label="Capacidad">
          <Input
            type="number"
            value={capacidad}
            onChange={(e) => setCapacidad(e.target.value)}
          />
        </Campo>
        <Campo label="Nota (opcional)">
          {/* La aclaración fija del dueño: "junto a la ventana". La ve el
              mesero al abrir la mesa. */}
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, 120))}
            placeholder="Ej: al lado de la parrilla"
          />
        </Campo>
        <label className="flex items-center gap-2 text-[15px] text-texto-2">
          <input
            type="checkbox"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
            className="h-4 w-4"
          />
          En servicio — si no, desaparece del panel del mesero
        </label>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

function Kpi({
  valor,
  etiqueta,
  color,
}: {
  valor: number;
  etiqueta: string;
  color: string;
}) {
  return (
    <div className="card px-3 py-2.5 text-center">
      <p className={`text-xl font-extrabold ${color}`}>{valor}</p>
      <p className="truncate text-[11px] text-texto-3">{etiqueta}</p>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-lg bg-muted px-2.5 py-1.5">
      <p className="text-[10px] text-texto-3">{etiqueta}</p>
      <p className="truncate text-[13px] font-bold text-texto">{valor}</p>
    </div>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
        activo
          ? "border-primary-boton bg-primary-boton text-white"
          : "border-borde bg-white text-texto-2 hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
