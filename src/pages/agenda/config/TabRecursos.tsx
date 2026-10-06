import { useState } from "react";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  ErrorMsg,
  Input,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../../../components/ui";
import { api } from "../../../lib/api";
import { apiConfigAgenda } from "../../../lib/agenda/apiConfigAgenda";
import type { Recurso, RecursoInput, Servicio, TipoRecurso } from "../../../lib/agenda/tiposConfigAgenda";
import { useApi } from "../../../lib/useApi";
import { Casilla, PuntoColor, SelectorVarios } from "./comun";
import { mensajeDe, useNombreProfesional, type Sucursal } from "./utilConfig";

/**
 * Colores sugeridos para las columnas de la agenda. Son datos del negocio (se
 * guardan en el recurso y se ven en la agenda de todos), no parte del tema:
 * por eso van fijos acá y no salen de los tokens de la paleta.
 */
const COLORES = ["#9B2C6B", "#7357B8", "#2563EB", "#0E9F6E", "#D97706", "#DC2626", "#0891B2", "#4A4744"];

/**
 * Profesionales y espacios (cabinas, sillones): lo que se agenda. Un
 * profesional puede tener usuario (entra a "Mi agenda") o no: en una barbería
 * chica los barberos son nombres en una columna y sólo el dueño entra.
 */
export default function TabRecursos({
  recursos,
  servicios,
  sucursales,
  onCambio,
}: {
  recursos: Recurso[];
  servicios: Servicio[];
  sucursales: Sucursal[];
  onCambio: () => void;
}) {
  const nombres = useNombreProfesional();
  const [editando, setEditando] = useState<Recurso | "nuevo" | null>(null);
  const [tipoNuevo, setTipoNuevo] = useState<TipoRecurso>("PROFESIONAL");
  const [aviso, setAviso] = useAviso();

  const ordenados = [...recursos].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
  const profesionales = ordenados.filter((r) => r.tipo === "PROFESIONAL");
  const espacios = ordenados.filter((r) => r.tipo === "ESPACIO");
  const nombreSucursal = (id: number) => sucursales.find((s) => s.id === id)?.nombre ?? `#${id}`;

  const nuevo = (tipo: TipoRecurso) => {
    setTipoNuevo(tipo);
    setEditando("nuevo");
  };

  const lista = (titulo: string, items: Recurso[], tipo: TipoRecurso, vacio: string) => (
    <section className="card" aria-label={titulo}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-borde-soft px-4 py-3">
        <h2 className="text-[15px] font-bold text-texto">
          {titulo} <span className="font-normal text-texto-4">({items.filter((r) => r.activo).length})</span>
        </h2>
        <Boton variante="soft" icono="plus" onClick={() => nuevo(tipo)}>
          {tipo === "PROFESIONAL" ? `Nuevo ${nombres.singular.toLowerCase()}` : "Nuevo espacio"}
        </Boton>
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-texto-3">{vacio}</p>
      ) : (
        <ul className="divide-y divide-borde-soft">
          {items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
              <span className="mt-1">
                <PuntoColor color={r.color} grande />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-texto">{r.nombre}</span>
                  {r.nombrePublico && r.nombrePublico !== r.nombre && (
                    <span className="text-[13px] text-texto-3">“{r.nombrePublico}”</span>
                  )}
                  {!r.activo && <Badge>Inactivo</Badge>}
                  {r.publicadoOnline && <Badge tono="azul">Online</Badge>}
                </div>
                <p className="mt-0.5 text-[13px] text-texto-3">
                  {r.sucursalIds.length ? r.sucursalIds.map(nombreSucursal).join(", ") : "Sin sucursal"}
                  {" · "}
                  {r.servicioIds.length === 1 ? "1 servicio" : `${r.servicioIds.length} servicios`}
                  {r.usuario ? ` · entra como @${r.usuario.username}` : ""}
                </p>
              </div>
              <Boton
                variante="ghost"
                icono="edit"
                onClick={() => setEditando(r)}
                aria-label={`Editar ${r.nombre}`}
                className="shrink-0"
              >
                Editar
              </Boton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      <AvisoOk>{aviso}</AvisoOk>
      {recursos.length === 0 ? (
        <div className="card">
          <Vacio
            icono="users"
            titulo={`Todavía no hay ${nombres.plural.toLowerCase()}`}
            texto="Cada uno es una columna de la agenda. Puede tener usuario para ver su propia agenda, o no."
            accion={
              <Boton icono="plus" onClick={() => nuevo("PROFESIONAL")}>
                Nuevo {nombres.singular.toLowerCase()}
              </Boton>
            }
          />
        </div>
      ) : (
        <>
          {lista(nombres.plural, profesionales, "PROFESIONAL", `No hay ${nombres.plural.toLowerCase()} cargados.`)}
          {lista(
            "Espacios",
            espacios,
            "ESPACIO",
            "Cabinas, sillones o salas que se reservan aparte. Opcional.",
          )}
        </>
      )}

      {editando && (
        <FormRecurso
          recurso={editando === "nuevo" ? null : editando}
          tipoInicial={tipoNuevo}
          recursos={recursos}
          servicios={servicios}
          sucursales={sucursales}
          onClose={() => setEditando(null)}
          onGuardado={(r) => {
            setEditando(null);
            setAviso(`"${r.nombre}" quedó guardado.`);
            onCambio();
          }}
        />
      )}
    </div>
  );
}

function FormRecurso({
  recurso,
  tipoInicial,
  recursos,
  servicios,
  sucursales,
  onClose,
  onGuardado,
}: {
  recurso: Recurso | null;
  tipoInicial: TipoRecurso;
  recursos: Recurso[];
  servicios: Servicio[];
  sucursales: Sucursal[];
  onClose: () => void;
  onGuardado: (r: Recurso) => void;
}) {
  const nombres = useNombreProfesional();
  const usuarios = useApi(() => api.getUsuarios(), []);

  const [tipo, setTipo] = useState<TipoRecurso>(recurso?.tipo ?? tipoInicial);
  const [nombre, setNombre] = useState(recurso?.nombre ?? "");
  const [nombrePublico, setNombrePublico] = useState(recurso?.nombrePublico ?? "");
  const [color, setColor] = useState(
    recurso?.color ?? COLORES[recursos.length % COLORES.length],
  );
  const [telefono, setTelefono] = useState(recurso?.telefono ?? "");
  const [comision, setComision] = useState(recurso?.comisionPct != null ? String(recurso.comisionPct) : "");
  const [usuarioId, setUsuarioId] = useState(recurso?.usuarioId != null ? String(recurso.usuarioId) : "");
  const [publicado, setPublicado] = useState(recurso?.publicadoOnline ?? false);
  const [activo, setActivo] = useState(recurso?.activo ?? true);
  const [orden, setOrden] = useState(String(recurso?.orden ?? recursos.length + 1));
  // Con una sola sucursal no hay nada que elegir: va ahí.
  const [sucursalIds, setSucursalIds] = useState<number[]>(
    recurso?.sucursalIds ?? (sucursales.length === 1 ? [sucursales[0].id] : []),
  );
  const [servicioIds, setServicioIds] = useState<number[]>(recurso?.servicioIds ?? []);
  // Fase 2: duración y precio propios por servicio ("" = los del servicio).
  const [propios, setPropios] = useState<Record<number, { duracion: string; precio: string }>>(() =>
    Object.fromEntries(
      (recurso?.serviciosPropios ?? []).map((p) => [
        p.servicioId,
        { duracion: p.duracionMin == null ? "" : String(p.duracionMin), precio: p.precio == null ? "" : String(p.precio) },
      ]),
    ),
  );
  const [verPropios, setVerPropios] = useState(() =>
    (recurso?.serviciosPropios ?? []).some((p) => p.duracionMin != null || p.precio != null),
  );
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const esProfesional = tipo === "PROFESIONAL";

  // Sólo cuentas con rol PROFESIONAL: es el rol que entra a "Mi agenda". Una
  // cuenta ya vinculada a otro recurso no se ofrece: dos columnas con el mismo
  // usuario le mostrarían a esa persona una agenda que no es sólo la suya.
  const vinculados = new Map(
    recursos.filter((r) => r.usuarioId != null && r.id !== recurso?.id).map((r) => [r.usuarioId!, r.nombre]),
  );
  const cuentas = (usuarios.datos ?? []).filter(
    (u) => u.rol === "PROFESIONAL" && (u.activo || String(u.id) === usuarioId),
  );

  const guardar = async () => {
    const com = comision.trim() === "" ? null : Number(comision);
    const ord = Number(orden);
    if (!nombre.trim()) return setError("Poné el nombre.");
    if (!sucursalIds.length) return setError("Elegí al menos una sucursal donde atiende.");
    if (com !== null && (!Number.isFinite(com) || com < 0 || com > 100)) {
      return setError("La comisión va de 0 a 100 %.");
    }
    if (!Number.isInteger(ord) || ord < 0) return setError("El orden es un número entero, cero o más.");
    const lista = servicioIds.map((id) => {
      const p = propios[id];
      const d = p?.duracion.trim() ? Number(p.duracion) : null;
      const pr = p?.precio.trim() ? Number(p.precio) : null;
      return { servicioId: id, duracionMin: d, precio: pr };
    });
    const malo = lista.find(
      (l) =>
        (l.duracionMin != null && (!Number.isInteger(l.duracionMin) || l.duracionMin < 1)) ||
        (l.precio != null && (!Number.isFinite(l.precio) || l.precio < 0)),
    );
    if (esProfesional && malo) {
      const s = servicios.find((x) => x.id === malo.servicioId);
      return setError(`Revisá la duración o el precio propio de "${s?.nombre ?? "un servicio"}".`);
    }
    // Sólo se manda si hay algo propio (o había y se borró): un salón que no
    // usa precios por profesional guarda como siempre.
    const conPropios =
      esProfesional &&
      (lista.some((l) => l.duracionMin != null || l.precio != null) ||
        (recurso?.serviciosPropios ?? []).some((p) => p.duracionMin != null || p.precio != null));
    const input: RecursoInput = {
      tipo,
      nombre: nombre.trim(),
      nombrePublico: nombrePublico.trim() || null,
      color,
      telefono: telefono.trim() || null,
      comisionPct: esProfesional ? com : null,
      usuarioId: esProfesional && usuarioId ? Number(usuarioId) : null,
      publicadoOnline: publicado,
      activo,
      orden: ord,
      sucursalIds,
      servicioIds,
    };
    setGuardando(true);
    setError("");
    try {
      const r = recurso
        ? await apiConfigAgenda.actualizarRecurso(recurso.id, input)
        : await apiConfigAgenda.crearRecurso(input);
      onGuardado(conPropios ? await apiConfigAgenda.guardarServiciosRecurso(r.id, lista) : r);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  const titulo = recurso
    ? `Editar ${recurso.nombre}`
    : esProfesional
      ? `Nuevo ${nombres.singular.toLowerCase()}`
      : "Nuevo espacio";

  return (
    <Modal
      abierto
      titulo={titulo}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-2xl"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo label="Tipo">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoRecurso)}>
            <option value="PROFESIONAL">{nombres.singular}</option>
            <option value="ESPACIO">Espacio (cabina, sillón, sala)</option>
          </Select>
        </Campo>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Nombre">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={esProfesional ? "Ana" : "Cabina 1"} />
          </Campo>
          <Campo label="Nombre público" hint="Cómo lo ve el cliente al reservar online.">
            <Input value={nombrePublico} onChange={(e) => setNombrePublico(e.target.value)} placeholder="Opcional" />
          </Campo>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Color en la agenda</p>
          <div role="group" aria-label="Color en la agenda" className="flex flex-wrap items-center gap-2">
            {COLORES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color.toLowerCase() === c.toLowerCase()}
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full border border-black/10 transition-transform ${
                  color.toLowerCase() === c.toLowerCase() ? "scale-110 ring-2 ring-texto ring-offset-2" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <label className="ml-1 inline-flex items-center gap-2 text-xs text-texto-3">
              Otro
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-borde bg-white"
              />
            </label>
          </div>
        </div>

        {esProfesional && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo
              label="Usuario vinculado"
              hint={`Con usuario, entra a "Mi agenda" y ve sólo lo suyo. Las cuentas se crean en Usuarios con el rol ${nombres.singular}.`}
              error={usuarios.error ? "No se pudieron cargar los usuarios." : undefined}
            >
              <Select
                value={usuarioId}
                onChange={(e) => setUsuarioId(e.target.value)}
                disabled={usuarios.cargando || !!usuarios.error}
              >
                <option value="">Sin usuario</option>
                {cuentas.map((u) => {
                  const otro = vinculados.get(u.id);
                  return (
                    <option key={u.id} value={u.id} disabled={!!otro}>
                      {u.nombre} (@{u.usuario}){otro ? ` · ya es ${otro}` : ""}
                    </option>
                  );
                })}
              </Select>
            </Campo>
            <Campo label="Teléfono" hint="Opcional, para el equipo.">
              <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </Campo>
            <Campo label="Comisión (%)" hint="Sobre sus servicios. El % por servicio y de productos, en Comisiones.">
              <Input type="number" value={comision} onChange={(e) => setComision(e.target.value)} placeholder="Opcional" />
            </Campo>
            <Campo label="Orden en la agenda" hint="Las columnas van de menor a mayor.">
              <Input type="number" inputMode="numeric" value={orden} onChange={(e) => setOrden(e.target.value)} />
            </Campo>
          </div>
        )}
        {!esProfesional && (
          <Campo label="Orden en la agenda" hint="Las columnas van de menor a mayor.">
            <Input type="number" inputMode="numeric" value={orden} onChange={(e) => setOrden(e.target.value)} />
          </Campo>
        )}

        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Sucursales donde atiende</p>
          <SelectorVarios
            etiqueta="Sucursales donde atiende"
            opciones={sucursales}
            elegidos={sucursalIds}
            onChange={setSucursalIds}
            vacio="No hay sucursales activas."
          />
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">
            {esProfesional ? "Servicios que hace" : "Servicios que se hacen acá"}
          </p>
          <SelectorVarios
            etiqueta="Servicios"
            opciones={servicios
              .filter((s) => s.activo || servicioIds.includes(s.id))
              .map((s) => ({ id: s.id, nombre: s.nombre }))}
            elegidos={servicioIds}
            onChange={setServicioIds}
            vacio="Todavía no hay servicios: cargalos en la pestaña Servicios."
          />
        </div>
        {esProfesional && servicioIds.length > 0 && (
          <div>
            <Casilla
              checked={verPropios}
              onChange={setVerPropios}
              ayuda="Si cobra distinto o tarda distinto que lo de lista. Vacío = lo del servicio."
            >
              Precio y duración propios
            </Casilla>
            {verPropios && (
              <ul className="mt-2 space-y-2" aria-label="Precio y duración propios">
                {servicioIds.map((id) => {
                  const s = servicios.find((x) => x.id === id);
                  if (!s) return null;
                  const p = propios[id] ?? { duracion: "", precio: "" };
                  const cambiar = (campo: "duracion" | "precio", v: string) =>
                    setPropios((prev) => ({ ...prev, [id]: { ...p, [campo]: v } }));
                  return (
                    <li key={id} className="flex flex-wrap items-center gap-2 text-[13px] text-texto-2">
                      <span className="min-w-0 flex-1 basis-40 truncate font-semibold">{s.nombre}</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        aria-label={`Minutos de ${s.nombre}`}
                        value={p.duracion}
                        onChange={(e) => cambiar("duracion", e.target.value)}
                        placeholder={s.duracionMin != null ? `${s.duracionMin} min` : "min"}
                        className="w-24"
                      />
                      <Input
                        type="number"
                        aria-label={`Precio de ${s.nombre}`}
                        value={p.precio}
                        onChange={(e) => cambiar("precio", e.target.value)}
                        placeholder={`Bs ${s.precio}`}
                        className="w-28"
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-1">
          <Casilla checked={activo} onChange={setActivo} ayuda="Inactivo no aparece en la agenda; sus citas no se tocan.">
            Activo
          </Casilla>
          <Casilla checked={publicado} onChange={setPublicado} ayuda="Aparece en tu página de reservas con su nombre público.">
            Se puede elegir al reservar online
          </Casilla>
        </div>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
