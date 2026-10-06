import { useState } from "react";
import { Icon } from "../../../components/Icon";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Input,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../../../components/ui";
import { api } from "../../../lib/api";
import { apiConfigAgenda } from "../../../lib/agenda/apiConfigAgenda";
import type { CitaAfectada, Recurso, Servicio } from "../../../lib/agenda/tiposConfigAgenda";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { AvisoCitasAfectadas, Casilla, PuntoColor, SelectorVarios } from "./comun";
import { mensajeDe, nombreRecurso } from "./utilConfig";
// Fase 3 (spa): espacio que ocupa y tiempo de pose.
import CamposSpaServicio from "./CamposSpaServicio";
import { aCambiosSpa, valoresIniciales } from "../../../lib/agenda/servicioSpa";
import { apiSpa } from "../../../lib/agenda/apiSpa";
import { useSpa } from "../../../lib/agenda/spa";

/**
 * Servicios de la agenda: cuánto dura cada uno, el margen después, si se
 * reserva online y quién lo hace.
 *
 * Un servicio ES un artículo tipo SERVICIO del catálogo: el nombre y el precio
 * se cambian en Artículos, como cualquier otro, y acá sólo lo que es de la
 * agenda. Crear uno desde acá sí pide nombre y precio, porque crea el artículo.
 */
export default function TabServicios({
  servicios,
  recursos,
  onCambio,
}: {
  servicios: Servicio[];
  recursos: Recurso[];
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState<Servicio | null>(null);
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useAviso();
  // Las citas que quedaron con un servicio recién desactivado (§7.3, QA
  // S2-03): se listan para reprogramarlas.
  const [afectadas, setAfectadas] = useState<{ nombre: string; citas: CitaAfectada[] } | null>(null);

  const activos = servicios.filter((s) => s.activo);
  const sinDuracion = activos.filter((s) => !s.duracionMin);
  const nombreDe = (id: number) => recursos.find((x) => x.id === id) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-texto-3">
          {activos.length} {activos.length === 1 ? "servicio" : "servicios"}
        </p>
        <Boton icono="plus" onClick={() => setCreando(true)}>
          Nuevo servicio
        </Boton>
      </div>

      <AvisoOk>{aviso}</AvisoOk>
      {afectadas && (
        <AvisoCitasAfectadas
          citas={afectadas.citas}
          donde={`con "${afectadas.nombre}", que quedó desactivado`}
          onCerrar={() => setAfectadas(null)}
        />
      )}

      {/* Sin duración la agenda no sabe cuánto ocupa: el servicio no aparece
          al dar una cita. Pasa con los servicios que ya estaban en el
          catálogo antes de la agenda. */}
      {sinDuracion.length > 0 && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm text-warning-text"
        >
          <Icon name="alert" size={17} />
          <span>
            {sinDuracion.length === 1
              ? "1 servicio no tiene duración"
              : `${sinDuracion.length} servicios no tienen duración`}
            : no se pueden agendar hasta que le cargues cuánto dura (
            {sinDuracion.map((s) => s.nombre).join(", ")}).
          </span>
        </div>
      )}

      {servicios.length === 0 ? (
        <div className="card">
          <Vacio
            icono="clock"
            titulo="Todavía no hay servicios"
            texto="Cargá lo que se atiende: corte, color, manicura… con cuánto dura cada uno."
            accion={
              <Boton icono="plus" onClick={() => setCreando(true)}>
                Nuevo servicio
              </Boton>
            }
          />
        </div>
      ) : (
        <ul className="card divide-y divide-borde-soft">
          {servicios.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-texto">{s.nombre}</span>
                  {!s.activo && <Badge>Inactivo</Badge>}
                  {s.activo && !s.duracionMin && <Badge tono="amarillo">Sin duración</Badge>}
                  {s.reservableOnline && <Badge tono="azul">Online</Badge>}
                  {s.requiereEspacioTipoId != null && <Badge tono="verde">Con espacio</Badge>}
                  {s.poseInicioMin != null && <Badge tono="verde">Con pose</Badge>}
                </div>
                <p className="mt-0.5 text-[13px] text-texto-3">
                  {s.categoria ?? "Sin categoría"} · {fmtMoney(s.precio)}
                  {s.duracionMin ? ` · ${s.duracionMin} min` : ""}
                  {s.bufferMin ? ` + ${s.bufferMin} min de margen` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-texto-3">
                  {s.recursoIds.length === 0 ? (
                    <span className="text-texto-4">Nadie lo hace todavía</span>
                  ) : (
                    s.recursoIds.map((id) => {
                      const r = nombreDe(id);
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"
                        >
                          {r && <PuntoColor color={r.color} />}
                          {r ? r.nombre : `#${id}`}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
              <Boton
                variante="ghost"
                icono="edit"
                onClick={() => setEditando(s)}
                aria-label={`Editar ${s.nombre}`}
                className="shrink-0"
              >
                Editar
              </Boton>
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <FormServicio
          servicio={editando}
          recursos={recursos}
          onClose={() => setEditando(null)}
          onGuardado={(s) => {
            setEditando(null);
            setAviso(`"${s.nombre}" quedó guardado.`);
            setAfectadas(s.citasAfectadas?.length ? { nombre: s.nombre, citas: s.citasAfectadas } : null);
            onCambio();
          }}
        />
      )}
      {creando && (
        <NuevoServicio
          onClose={() => setCreando(false)}
          onCreado={(s) => {
            setCreando(false);
            onCambio();
            // Recién creado nadie lo hace: se abre para elegir quién, que es
            // lo que falta para poder agendarlo.
            setEditando(s);
          }}
        />
      )}
    </div>
  );
}

/** Entero ≥ min, o null si no lo es. */
function entero(v: string, min: number): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min ? n : null;
}

function FormServicio({
  servicio,
  recursos,
  onClose,
  onGuardado,
}: {
  servicio: Servicio;
  recursos: Recurso[];
  onClose: () => void;
  onGuardado: (s: Servicio) => void;
}) {
  const [duracion, setDuracion] = useState(servicio.duracionMin ? String(servicio.duracionMin) : "");
  const [buffer, setBuffer] = useState(servicio.bufferMin ? String(servicio.bufferMin) : "");
  const [online, setOnline] = useState(servicio.reservableOnline);
  const [activo, setActivo] = useState(servicio.activo);
  const [recursoIds, setRecursoIds] = useState<number[]>(servicio.recursoIds);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const spa = useSpa();
  const [valoresSpa, setValoresSpa] = useState(() => valoresIniciales(servicio));
  const tiposEspacio = useApi(
    () => (spa.espacios ? apiSpa.tiposEspacio() : Promise.resolve([])),
    [spa.espacios],
  );

  // Los inactivos no se ofrecen, pero si ya lo hacían se siguen viendo: si no,
  // guardar los sacaría sin que nadie lo haya pedido.
  const opciones = recursos
    .filter((r) => r.activo || servicio.recursoIds.includes(r.id))
    .map((r) => ({ id: r.id, nombre: nombreRecurso(r), color: r.color }));

  const dur = entero(duracion, 1);
  const buf = buffer.trim() === "" ? 0 : entero(buffer, 0);
  const errorDuracion = duracion && dur === null ? "Minutos enteros, mayor que cero." : "";
  const errorBuffer = buffer && buf === null ? "Minutos enteros, cero o más." : "";

  const guardar = async () => {
    if (dur === null) {
      setError("Cargá cuánto dura el servicio, en minutos.");
      return;
    }
    if (buf === null) return;
    const deSpa = aCambiosSpa(valoresSpa, dur, spa.espacios, valoresIniciales(servicio));
    if ("error" in deSpa) {
      setError(deSpa.error);
      return;
    }
    setGuardando(true);
    setError("");
    try {
      const s = await apiConfigAgenda.actualizarServicio(servicio.id, {
        duracionMin: dur,
        bufferMin: buf,
        reservableOnline: online,
        recursoIds,
        ...deSpa.cambios,
        // Sólo si cambia: desactivarlo devuelve las citas que lo tienen.
        ...(activo !== servicio.activo ? { activo } : {}),
      });
      onGuardado(s);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={servicio.nombre}
      subtitulo={`${servicio.categoria ?? "Sin categoría"} · ${fmtMoney(servicio.precio)}`}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando || !!errorDuracion || !!errorBuffer}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Duración (min)" error={errorDuracion}>
            <Input type="number" inputMode="numeric" value={duracion} onChange={(e) => setDuracion(e.target.value)} />
          </Campo>
          <Campo label="Margen después (min)" hint="Limpiar, preparar." error={errorBuffer}>
            <Input type="number" inputMode="numeric" value={buffer} onChange={(e) => setBuffer(e.target.value)} placeholder="0" />
          </Campo>
        </div>
        <Casilla checked={online} onChange={setOnline} ayuda="Aparece en tu página de reservas.">
          Se puede reservar online
        </Casilla>
        <Casilla
          checked={activo}
          onChange={setActivo}
          ayuda="Desactivado no se agenda ni se vende; las citas que ya lo tienen no se tocan y se listan para reprogramarlas."
        >
          Activo
        </Casilla>
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Quién lo hace</p>
          <SelectorVarios
            etiqueta="Quién lo hace"
            opciones={opciones}
            elegidos={recursoIds}
            onChange={setRecursoIds}
            vacio="Todavía no hay profesionales cargados."
          />
        </div>
        <CamposSpaServicio
          valores={valoresSpa}
          onChange={setValoresSpa}
          tipos={tiposEspacio.datos ?? []}
          conEspacios={spa.espacios}
        />
        <p className="text-xs text-texto-4">
          El nombre y el precio se cambian en Artículos, como cualquier otro.
        </p>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

function NuevoServicio({
  onClose,
  onCreado,
}: {
  onClose: () => void;
  onCreado: (s: Servicio) => void;
}) {
  const categorias = useApi(() => api.getCategorias(false), []);
  const [nombre, setNombre] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [precio, setPrecio] = useState("");
  const [duracion, setDuracion] = useState("");
  const [buffer, setBuffer] = useState("");
  const [online, setOnline] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const p = Number(precio);
    const dur = entero(duracion, 1);
    const buf = buffer.trim() === "" ? 0 : entero(buffer, 0);
    if (!nombre.trim()) return setError("Poné el nombre del servicio.");
    if (precio.trim() === "" || !Number.isFinite(p) || p < 0) return setError("El precio tiene que ser un número, cero o más.");
    if (dur === null) return setError("La duración va en minutos enteros, mayor que cero.");
    if (buf === null) return setError("El margen va en minutos enteros, cero o más.");
    setGuardando(true);
    setError("");
    try {
      const s = await apiConfigAgenda.crearServicio({
        nombre: nombre.trim(),
        categoriaId: categoriaId ? Number(categoriaId) : null,
        precio: p,
        duracionMin: dur,
        bufferMin: buf,
        reservableOnline: online,
      });
      onCreado(s);
    } catch (e) {
      setError(mensajeDe(e, "No se pudo crear el servicio"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo="Nuevo servicio"
      subtitulo="Se crea también en el catálogo, como artículo de servicio."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Creando…" : "Crear"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Corte de dama" autoFocus />
        </Campo>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Categoría">
            {categorias.cargando ? (
              <Cargando />
            ) : (
              <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">Sin categoría</option>
                {(categorias.datos ?? [])
                  .filter((c) => c.activo)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </Select>
            )}
          </Campo>
          <Campo label="Precio">
            <Input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0.00" />
          </Campo>
          <Campo label="Duración (min)">
            <Input type="number" inputMode="numeric" value={duracion} onChange={(e) => setDuracion(e.target.value)} placeholder="45" />
          </Campo>
          <Campo label="Margen después (min)">
            <Input type="number" inputMode="numeric" value={buffer} onChange={(e) => setBuffer(e.target.value)} placeholder="0" />
          </Campo>
        </div>
        <Casilla checked={online} onChange={setOnline} ayuda="Aparece en tu página de reservas.">
          Se puede reservar online
        </Casilla>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
