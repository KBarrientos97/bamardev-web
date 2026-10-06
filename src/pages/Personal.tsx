import { useMemo, useState } from "react";
import { Buscador, Chips, EncabezadoPagina } from "../components/filtros";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  InputPassword,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../components/ui";
import { api } from "../lib/api";
import { apiPersonal, type CargoRol, type Persona, type PersonaInput } from "../lib/personal";
import { etiquetaRol, tienePermiso } from "../lib/permisos";
import { apiRoles } from "../lib/roles";
import { plural } from "./agenda/config/utilConfig";
import { contiene } from "../lib/texto";
import { useApi } from "../lib/useApi";
import { useAuth } from "../store/AuthContext";
import type { Almacen, RolNegocio } from "../types";
import { Link } from "react-router-dom";

/**
 * Personal (PLAN-ROLES §9.4 y §11): la gente del negocio, entre o no al
 * sistema. Es la puerta de entrada del equipo; Usuarios queda como los
 * accesos.
 *
 * Un barbero sin login es una persona acá y una columna en la agenda: tiene
 * citas, comisión y propinas igual que uno que entra. "Darle acceso" le crea
 * el login (ocupa un lugar del cupo del plan); "Quitar acceso" lo desactiva y
 * la persona sigue. Sólo existe en los negocios con agenda.
 */

type Filtro = "activos" | "con_acceso" | "sin_acceso" | "todos";
const FILTROS = [
  ["activos", "Activos"],
  ["con_acceso", "Con acceso"],
  ["sin_acceso", "Sin acceso"],
  ["todos", "Todos"],
] as const;

const mensaje = (e: unknown, generico = "No se pudo guardar") =>
  e instanceof Error && e.message ? e.message : generico;

export default function Personal() {
  const [filtro, setFiltro] = useState<Filtro>("activos");
  const [buscar, setBuscar] = useState("");
  const [cargo, setCargo] = useState("");
  const [sucursal, setSucursal] = useState("");
  const [editando, setEditando] = useState<Persona | "nueva" | null>(null);
  const [aviso, setAviso] = useAviso();

  const personas = useApi(() => apiPersonal.listar({ incluirInactivos: true }), []);
  // Los cargos son los roles del negocio (PLAN-ROLES-NEGOCIO). Sin la lista
  // (un error) se filtra con los cargos que tiene la gente.
  const cargosRol = useApi(
    () => apiPersonal.cargos().then((c) => (Array.isArray(c) ? c : [])).catch(() => [] as CargoRol[]),
    [],
  );
  const almacenes = useApi(() => api.getSucursales().catch(() => [] as Almacen[]), []);
  const sucursales = (almacenes.datos ?? []).filter((a) => a.activo && a.tipo !== "DEPOSITO");
  const nombreSucursal = (id: number) => sucursales.find((s) => s.id === id)?.nombre ?? `#${id}`;

  const todas = personas.datos ?? [];
  const cargos = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of cargosRol.datos ?? []) m.set(c.id, c.nombre);
    for (const p of todas) if (p.cargoRolId != null && !m.has(p.cargoRolId)) m.set(p.cargoRolId, p.cargo ?? `#${p.cargoRolId}`);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cargosRol.datos, todas]);
  const visibles = todas.filter((p) => {
    if (filtro === "activos" && !p.activo) return false;
    if (filtro === "con_acceso" && !(p.activo && p.conAcceso)) return false;
    if (filtro === "sin_acceso" && !(p.activo && !p.conAcceso)) return false;
    if (cargo && String(p.cargoRolId) !== cargo) return false;
    // Sin sucursal = toda la organización (el dueño): aparece en todas.
    if (sucursal && p.sucursalIds.length > 0 && !p.sucursalIds.includes(Number(sucursal))) return false;
    return !buscar.trim() || contiene(p.nombre, buscar) || contiene(p.cargo ?? "", buscar);
  });
  const activos = todas.filter((p) => p.activo);
  const conAcceso = activos.filter((p) => p.conAcceso).length;

  const alGuardar = (p: Persona, texto: string) => {
    setAviso(texto);
    setEditando((e) => (e === "nueva" || e == null ? null : p));
    personas.recargar();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Personal"
        subtitulo={
          // Mientras carga no hay "0 personas" (QA PER-13).
          personas.datos ? `${activos.length} personas · ${conAcceso} con acceso al sistema` : "Cargando…"
        }
        accion={
          <Boton icono="plus" onClick={() => setEditando("nueva")}>
            Nueva persona
          </Boton>
        }
      />
      <AvisoOk>{aviso}</AvisoOk>
      <div className="flex flex-wrap items-center gap-3">
        <Buscador valor={buscar} onChange={setBuscar} placeholder="Buscar por nombre o cargo…" />
        {cargos.length > 0 && (
          <Select value={cargo} onChange={(e) => setCargo(e.target.value)} aria-label="Cargo" className="w-auto">
            <option value="">Todos los cargos</option>
            {cargos.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </Select>
        )}
        {sucursales.length > 1 && (
          <Select
            value={sucursal}
            onChange={(e) => setSucursal(e.target.value)}
            aria-label="Sucursal"
            className="w-auto"
          >
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        )}
      </div>
      <Chips valor={filtro} opciones={FILTROS} onChange={setFiltro} />

      {personas.cargando && !personas.datos ? (
        <Cargando />
      ) : personas.error ? (
        <ErrorMsg>{personas.error}</ErrorMsg>
      ) : visibles.length === 0 ? (
        <div className="card">
          <Vacio
            icono="users"
            titulo="No hay nadie con ese filtro"
            texto="Cargá a quien trabaja con vos, entre o no al sistema: un barbero sin usuario igual tiene su agenda, su comisión y sus propinas."
          />
        </div>
      ) : (
        <ul className="card divide-y divide-borde-soft" aria-label="Personal">
          {visibles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setEditando(p)}
                className="flex w-full flex-wrap items-start gap-3 px-4 py-3 text-left hover:bg-fondo-2"
                aria-label={`Ver ${p.nombre}`}
              >
                <span
                  className="mt-1 h-3 w-3 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: p.color ?? "#CBD5E1" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-texto">{p.nombre}</span>
                    {p.cargo && <span className="text-[13px] text-texto-3">{p.cargo}</span>}
                    {!p.activo && <Badge>De baja</Badge>}
                    {/* Con la columna apagada no está en la agenda de hoy (QA VER-02). */}
                    {p.profesional &&
                      (p.profesional.activo ? (
                        <Badge tono="morado">En la agenda</Badge>
                      ) : (
                        <Badge>Agenda inactiva</Badge>
                      ))}
                    {p.conAcceso ? (
                      <Badge tono="verde">Con acceso</Badge>
                    ) : p.acceso ? (
                      <Badge tono="amarillo">Acceso quitado</Badge>
                    ) : (
                      <Badge>Sin acceso</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] text-texto-3">
                    {[
                      p.acceso ? `@${p.acceso.username}` : null,
                      p.telefono,
                      sucursales.length > 1
                        ? p.sucursalIds.map(nombreSucursal).join(", ") || "Todas las sucursales"
                        : null,
                      p.zona || p.vehiculo ? [p.zona, p.vehiculo].filter(Boolean).join(" · ") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <FichaPersona
          persona={editando === "nueva" ? null : editando}
          sucursales={sucursales}
          personas={todas}
          cargos={cargosRol.datos ?? []}
          onCargoNuevo={() => cargosRol.recargar()}
          onClose={() => setEditando(null)}
          onGuardado={alGuardar}
        />
      )}
    </div>
  );
}

/** Alta y edición, con las acciones del acceso. */
function FichaPersona({
  persona,
  sucursales,
  personas,
  cargos,
  onCargoNuevo,
  onClose,
  onGuardado,
}: {
  persona: Persona | null;
  sucursales: Almacen[];
  personas: Persona[];
  cargos: CargoRol[];
  onCargoNuevo: () => void;
  onClose: () => void;
  onGuardado: (p: Persona, aviso: string) => void;
}) {
  const { usuario, negocio, puede } = useAuth();
  // Cómo se llama la pestaña de los profesionales en este rubro (QA DIA-17f:
  // el aviso decía "Profesionales" y la pestaña "Manicuristas y espacios").
  const pestanaProfesionales = `${plural(etiquetaRol("PROFESIONAL", negocio))} y espacios`;
  // El % es plata del profesional: lo cambia quien liquida (el backend lo exige).
  const cambiaComision = tienePermiso(usuario, "comisiones.liquidar");

  const [nombre, setNombre] = useState(persona?.nombre ?? "");
  const [cargoRolId, setCargoRolId] = useState<number | null>(persona?.cargoRolId ?? null);
  const [ci, setCi] = useState(persona?.ci ?? "");
  const [telefono, setTelefono] = useState(persona?.telefono ?? "");
  const [fechaIngreso, setFechaIngreso] = useState(persona?.fechaIngreso ?? "");
  const [color, setColor] = useState(persona?.color ?? "");
  const [comision, setComision] = useState(persona?.comisionPct != null ? String(persona.comisionPct) : "");
  const [notas, setNotas] = useState(persona?.notas ?? "");
  const [zona, setZona] = useState(persona?.zona ?? "");
  const [vehiculo, setVehiculo] = useState(persona?.vehiculo ?? "");
  const [sucursalIds, setSucursalIds] = useState<number[]>(
    persona?.sucursalIds ?? (sucursales.length === 1 ? [sucursales[0].id] : []),
  );
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [modo, setModo] = useState<"acceso" | "vincular" | "quitar" | "baja" | null>(null);

  // Zona y vehículo son de quien reparte: su cargo entrega pedidos, o ya los
  // tiene cargados.
  const cargoElegido = cargos.find((c) => c.id === cargoRolId);
  const esRepartidor =
    !!cargoElegido?.permisos?.some((p) => p.codigo === "entregas.realizar") ||
    !!persona?.zona ||
    !!persona?.vehiculo;

  const guardar = async () => {
    setError("");
    if (!nombre.trim()) return setError("Poné el nombre.");
    const com = comision.trim() === "" ? null : Number(comision);
    if (com !== null && (!Number.isFinite(com) || com < 0 || com > 100)) {
      return setError("La comisión va de 0 a 100 %.");
    }
    if (persona && sucursales.length > 1 && !sucursalIds.length) {
      return setError("Elegí al menos una sucursal donde trabaja.");
    }
    const input: PersonaInput = {
      nombre: nombre.trim(),
      cargoRolId,
      ci: ci.trim() || null,
      telefono: telefono.trim() || null,
      fechaIngreso: fechaIngreso || null,
      color: color || null,
      notas: notas.trim() || null,
      ...(esRepartidor ? { zona: zona.trim() || null, vehiculo: vehiculo.trim() || null } : {}),
      ...(cambiaComision && com !== (persona?.comisionPct ?? null) ? { comisionPct: com } : {}),
      ...(sucursalIds.length ? { sucursalIds } : {}),
    };
    setGuardando(true);
    try {
      const p = persona ? await apiPersonal.editar(persona.id, input) : await apiPersonal.crear(input);
      onGuardado(p, `"${p.nombre}" quedó guardado.`);
      if (!persona) onClose();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  const accion = async (fn: () => Promise<Persona>, texto: (p: Persona) => string) => {
    setError("");
    setGuardando(true);
    try {
      const p = await fn();
      setModo(null);
      onGuardado(p, texto(p));
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={persona ? persona.nombre : "Nueva persona"}
      subtitulo={persona ? (persona.cargo ?? undefined) : "Sin acceso al sistema: no ocupa lugar del cupo."}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-2xl"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cerrar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        {persona && (
          <section aria-label="Acceso al sistema" className="rounded-xl border border-borde-soft p-3">
            <p className="text-[13px] font-semibold text-texto-2">Acceso al sistema</p>
            <p className="mt-0.5 text-[13px] text-texto-3">
              {persona.conAcceso
                ? `Entra como @${persona.acceso?.username} (${persona.acceso?.rolNombre ?? persona.acceso?.rol ?? "sin rol"}). Ocupa un lugar del cupo de usuarios.`
                : persona.acceso
                  ? `Se le quitó el acceso (@${persona.acceso.username}). No ocupa cupo.`
                  : "No entra al sistema. Igual puede tener agenda, comisión y propinas."}
              {persona.profesional
                ? ` En la agenda es "${persona.profesional.nombre}"${persona.profesional.activo ? "" : " (columna inactiva)"}.`
                : ""}
            </p>
            {/* QA DIA-16: decía que puede tener agenda y no decía dónde. */}
            {!persona.profesional && persona.activo && puede("agenda_config") && (
              <p className="mt-1 text-[13px] text-texto-3">
                Para darle agenda:{" "}
                <Link
                  to="/configuracion/agenda?pestana=recursos"
                  className="font-semibold text-primary-700 hover:underline"
                >
                  Configuración de agenda › {pestanaProfesionales}
                </Link>{" "}
                y en &quot;¿Quién es?&quot; elegí a {persona.nombre}.
              </p>
            )}
            {persona.activo && (
              <div className="mt-2 flex flex-wrap gap-2">
                {persona.conAcceso ? (
                  <Boton variante="soft" onClick={() => setModo("quitar")}>
                    Quitar acceso
                  </Boton>
                ) : (
                  <Boton variante="soft" onClick={() => setModo("acceso")}>
                    {persona.acceso ? "Devolverle el acceso" : "Darle acceso"}
                  </Boton>
                )}
                {!persona.acceso && (
                  <Boton variante="ghost" onClick={() => setModo("vincular")}>
                    Vincular a un usuario existente
                  </Boton>
                )}
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Nombre">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ana Pérez" />
          </Campo>
          <ElegirCargo
            valor={cargoRolId}
            cargos={cargos}
            onChange={setCargoRolId}
            onCreado={onCargoNuevo}
          />
          <Campo label="Teléfono">
            <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </Campo>
          <Campo label="CI" hint="Opcional.">
            <Input value={ci} onChange={(e) => setCi(e.target.value)} />
          </Campo>
          <Campo label="Fecha de ingreso">
            <Input type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} />
          </Campo>
          <ColorAgenda valor={color} onChange={setColor} />
          {cambiaComision && (
            <Campo label="Comisión base (%)" hint="Si es profesional, la de sus servicios.">
              <Input type="number" value={comision} onChange={(e) => setComision(e.target.value)} placeholder="Opcional" />
            </Campo>
          )}
          {esRepartidor && (
            <>
              <Campo label="Zona">
                <Input value={zona} onChange={(e) => setZona(e.target.value)} />
              </Campo>
              <Campo label="Vehículo">
                <Input value={vehiculo} onChange={(e) => setVehiculo(e.target.value)} />
              </Campo>
            </>
          )}
        </div>
        <Campo label="Notas" hint="Turno, horarios…">
          <Input value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Campo>
        {sucursales.length > 1 && (
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-semibold text-texto-2">Sucursales donde trabaja</legend>
            <div className="flex flex-wrap gap-3">
              {sucursales.map((s) => (
                <label key={s.id} className="inline-flex items-center gap-2 text-sm text-texto-2">
                  <input
                    type="checkbox"
                    checked={sucursalIds.includes(s.id)}
                    onChange={(e) =>
                      setSucursalIds((ids) => (e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id)))
                    }
                  />
                  {s.nombre}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {persona && (
          <div>
            {persona.activo ? (
              <Boton variante="ghost" onClick={() => setModo("baja")}>
                Dar de baja
              </Boton>
            ) : (
              <Boton
                variante="soft"
                onClick={() =>
                  accion(
                    () => apiPersonal.editar(persona.id, { activo: true }),
                    // Volver no le reactiva la columna en la agenda (sus citas
                    // se reprogramaron al darla de baja): se avisa dónde
                    // hacerlo (QA PER-14).
                    (p) =>
                      p.profesional && !p.profesional.activo
                        ? `"${p.nombre}" volvió al equipo. Su columna en la agenda sigue inactiva: reactivala en Configuración de agenda › ${pestanaProfesionales}.`
                        : `"${p.nombre}" volvió al equipo.`,
                  )
                }
              >
                Reactivar
              </Boton>
            )}
          </div>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>

      {persona && modo === "acceso" && (
        <DarAcceso
          persona={persona}
          cargoRolId={cargoRolId}
          sucursales={sucursales}
          onClose={() => setModo(null)}
          onListo={(p) => {
            setModo(null);
            onGuardado(p, `"${p.nombre}" ya puede entrar como @${p.acceso?.username}.`);
          }}
        />
      )}
      {persona && modo === "vincular" && (
        <Vincular
          persona={persona}
          personas={personas}
          onClose={() => setModo(null)}
          onListo={(p) => {
            setModo(null);
            onGuardado(p, `"${p.nombre}" quedó vinculado a @${p.acceso?.username}.`);
          }}
        />
      )}
      {persona && (
        <Confirmar
          abierto={modo === "quitar"}
          titulo="Quitar acceso"
          texto={`${persona.nombre} no va a poder entrar al sistema y libera un lugar del cupo. Sigue en Personal con su agenda, su comisión y sus propinas.`}
          etiquetaOk="Quitar acceso"
          peligroso
          procesando={guardando}
          onCancel={() => setModo(null)}
          onOk={() =>
            accion(() => apiPersonal.quitarAcceso(persona.id), (p) => `"${p.nombre}" ya no entra al sistema.`)
          }
        />
      )}
      {persona && (
        <Confirmar
          abierto={modo === "baja"}
          titulo="Dar de baja"
          texto={`${persona.nombre} deja de trabajar acá: sale de la agenda y pierde el acceso. Lo que ya hizo (citas, comisiones) queda.`}
          etiquetaOk="Dar de baja"
          peligroso
          procesando={guardando}
          onCancel={() => setModo(null)}
          onOk={() =>
            accion(() => apiPersonal.editar(persona.id, { activo: false }), (p) => `"${p.nombre}" quedó de baja.`)
          }
        />
      )}
    </Modal>
  );
}

const NUEVO = "__nuevo";

/**
 * El cargo es un rol del negocio. Quien edita roles puede crear uno en el
 * momento ("Ayudante", "Lavacabezas"): nace sin permisos, que es lo que
 * corresponde a alguien que no entra al sistema; si después se le da acceso,
 * los permisos del rol se eligen en Roles.
 */
function ElegirCargo({
  valor,
  cargos,
  onChange,
  onCreado,
}: {
  valor: number | null;
  cargos: CargoRol[];
  onChange: (id: number | null) => void;
  onCreado: () => void;
}) {
  const { usuario } = useAuth();
  const creaRoles = tienePermiso(usuario, "roles.gestionar");
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  // El cargo actual aunque ya no esté en la lista (un rol borrado).
  const opciones = cargos.filter((c) => !c.esAdministrador || c.id === valor);

  const crear = async () => {
    setError("");
    if (!nombre.trim()) return setError("Poné el nombre del cargo.");
    setEnviando(true);
    try {
      const rol = await apiRoles.crear({ nombre: nombre.trim(), permisos: [] });
      onCreado();
      onChange(rol.id);
      setCreando(false);
      setNombre("");
    } catch (e) {
      setError(mensaje(e, "No se pudo crear el cargo"));
    } finally {
      setEnviando(false);
    }
  };

  if (creando) {
    return (
      <Campo label="Cargo nuevo" error={error || undefined} hint="Se crea como un rol sin permisos: sólo dice qué hace.">
        <div className="flex gap-2">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ayudante" autoFocus />
          <Boton type="button" onClick={crear} disabled={enviando}>
            {enviando ? "…" : "Crear"}
          </Boton>
          <Boton type="button" variante="ghost" onClick={() => setCreando(false)} disabled={enviando}>
            Cancelar
          </Boton>
        </div>
      </Campo>
    );
  }
  return (
    <Campo label="Cargo" hint="Es uno de los roles del negocio.">
      <Select
        value={valor ?? ""}
        aria-label="Cargo"
        onChange={(e) => {
          if (e.target.value === NUEVO) return setCreando(true);
          onChange(e.target.value === "" ? null : Number(e.target.value));
        }}
      >
        <option value="">Sin cargo</option>
        {opciones.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
        {creaRoles && <option value={NUEVO}>+ Crear un cargo nuevo…</option>}
      </Select>
    </Campo>
  );
}

/** El color que se propone al elegir uno (el primero de la agenda). */
const COLOR_SUGERIDO = "#7357B8";

/**
 * Color en la agenda. Lo que se ve es lo que se guarda (QA PER-04): antes el
 * campo mostraba un violeta elegido y se guardaba "sin color", y el
 * `<input type="color">` con el estilo de un texto se dibujaba como una raya.
 */
function ColorAgenda({ valor, onChange }: { valor: string; onChange: (c: string) => void }) {
  return (
    <div role="group" aria-label="Color en la agenda">
      <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">Color en la agenda</span>
      <div className="flex min-h-[42px] flex-wrap items-center gap-2">
        {valor ? (
          <>
            <input
              type="color"
              aria-label="Elegir color"
              value={valor}
              onChange={(e) => onChange(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-borde bg-white p-1"
            />
            <span className="text-[13px] text-texto-3">{valor.toUpperCase()}</span>
            <Boton type="button" variante="ghost" onClick={() => onChange("")}>
              Sin color
            </Boton>
          </>
        ) : (
          <>
            <span className="inline-block h-6 w-6 rounded-full border border-dashed border-texto-4" aria-hidden />
            <span className="text-[13px] text-texto-3">Sin color</span>
            <Boton type="button" variante="soft" onClick={() => onChange(COLOR_SUGERIDO)}>
              Elegir color
            </Boton>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * "Darle acceso": su login, con un rol de los que quien mira puede asignar.
 * Arranca en el de su cargo: el cargo ya dice qué hace, y al darle acceso ese
 * rol le da los permisos.
 */
function DarAcceso({
  persona,
  cargoRolId,
  sucursales,
  onClose,
  onListo,
}: {
  persona: Persona;
  cargoRolId: number | null;
  sucursales: Almacen[];
  onClose: () => void;
  onListo: (p: Persona) => void;
}) {
  const { usuario } = useAuth();
  const reactivar = !!persona.acceso;
  const asignables = useApi(() => apiRoles.asignables(), []);
  // El Administrador no se da desde acá: nace con el negocio.
  const roles: RolNegocio[] = (asignables.datos ?? []).filter((r) => !r.esAdministrador);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("");
  const [sucursalId, setSucursalId] = useState(persona.sucursalIds[0] ? String(persona.sucursalIds[0]) : "");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const rolElegido =
    rol || String(roles.find((r) => r.id === cargoRolId)?.id ?? roles[0]?.id ?? "");
  const eligeSucursal = sucursales.length > 1 && usuario?.sucursalId == null;

  const enviar = async () => {
    setError("");
    if (!reactivar) {
      if (!/^[a-z0-9._-]{3,30}$/.test(username.trim().toLowerCase())) {
        return setError("El usuario lleva 3 a 30 letras, números, punto o guion.");
      }
      if (password.length < 6) return setError("La contraseña necesita al menos 6 caracteres.");
      if (!rolElegido) return setError("Elegí el rol.");
    } else if (password && password.length < 6) {
      return setError("La contraseña necesita al menos 6 caracteres.");
    }
    setEnviando(true);
    try {
      onListo(
        await apiPersonal.darAcceso(
          persona.id,
          reactivar
            ? { ...(password ? { password } : {}) }
            : {
                username: username.trim().toLowerCase(),
                password,
                rolId: Number(rolElegido),
                ...(eligeSucursal && sucursalId ? { sucursalId: Number(sucursalId) } : {}),
              },
        ),
      );
    } catch (e) {
      setError(mensaje(e, "No se pudo dar el acceso"));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={reactivar ? "Devolverle el acceso" : "Darle acceso"}
      subtitulo={`${persona.nombre} va a ocupar un lugar del cupo de usuarios del plan.`}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={enviando}>
            Cancelar
          </Boton>
          <Boton onClick={enviar} disabled={enviando}>
            {enviando ? "Un momento…" : reactivar ? "Devolver acceso" : "Darle acceso"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        {reactivar ? (
          <p className="text-sm text-texto-2">
            Vuelve a entrar como <strong>@{persona.acceso?.username}</strong>. Si no se acuerda la contraseña, poné
            una nueva.
          </p>
        ) : (
          <>
            <Campo label="Usuario">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </Campo>
            <Campo
              label="Rol"
              hint="Lo que va a poder hacer en el sistema."
              error={asignables.error ? "No se pudieron cargar los roles." : undefined}
            >
              <Select value={rolElegido} onChange={(e) => setRol(e.target.value)} aria-label="Rol">
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
            {eligeSucursal && (
              <Campo label="Sucursal" hint="La de sus datos al entrar.">
                <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} aria-label="Sucursal">
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Select>
              </Campo>
            )}
          </>
        )}
        <Campo label={reactivar ? "Contraseña nueva (opcional)" : "Contraseña"}>
          <InputPassword value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Campo>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

/** Lo que una ficha de Personal tiene cargado (lo que se fundiría al vincular). */
function datosDeFicha(p: Persona | undefined): string[] {
  if (!p) return [];
  return [
    p.cargo,
    p.ci ? `CI ${p.ci}` : null,
    p.telefono ? `tel. ${p.telefono}` : null,
    p.comisionPct != null ? `${p.comisionPct} % de comisión` : null,
    p.notas ? "notas" : null,
  ].filter((x): x is string => !!x);
}

/**
 * Vincular a la persona un usuario que ya existe (creado antes en Usuarios).
 *
 * El usuario ya tiene su propia ficha (la crea el alta): al vincularlo, esa
 * ficha se funde en ésta y desaparece (QA PER-06). Se avisa antes y se dice
 * qué datos tiene; un usuario que ya es otro profesional ni se ofrece (su
 * comisión y sus propinas son de esa persona: el backend da 409).
 */
function Vincular({
  persona,
  personas,
  onClose,
  onListo,
}: {
  persona: Persona;
  personas: Persona[];
  onClose: () => void;
  onListo: (p: Persona) => void;
}) {
  const usuarios = useApi(() => api.getUsuarios(), []);
  // Sólo cuentas cuyo rol quien mira podría asignar: con las demás (las de
  // un rol con más permisos que el suyo) el backend da 403.
  const asignables = useApi(() => apiRoles.asignables().catch(() => null), []);
  const fichaDe = new Map(personas.filter((p) => p.usuarioId != null).map((p) => [p.usuarioId!, p]));
  const opciones = (usuarios.datos ?? []).filter(
    (u) =>
      u.activo &&
      !u.esAdministrador &&
      (!asignables.datos || asignables.datos.some((r) => r.id === u.rolId)) &&
      fichaDe.get(u.id)?.recursoId == null,
  );
  const [usuarioId, setUsuarioId] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const elegido = opciones.find((u) => String(u.id) === usuarioId);
  const ficha = elegido ? fichaDe.get(elegido.id) : undefined;
  const datos = datosDeFicha(ficha);

  const enviar = async () => {
    if (!usuarioId) return setError("Elegí el usuario.");
    setEnviando(true);
    setError("");
    try {
      onListo(await apiPersonal.vincular(persona.id, Number(usuarioId)));
    } catch (e) {
      setError(mensaje(e, "No se pudo vincular"));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo="Vincular a un usuario"
      subtitulo={`El usuario pasa a ser el acceso de ${persona.nombre}.`}
      onClose={onClose}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={enviando}>
            Cancelar
          </Boton>
          <Boton onClick={enviar} disabled={enviando}>
            Vincular
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="Usuario" error={usuarios.error ? "No se pudieron cargar los usuarios." : undefined}>
          <Select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} aria-label="Usuario">
            <option value="">Elegí…</option>
            {opciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} (@{u.usuario}){datosDeFicha(fichaDe.get(u.id)).length ? " · tiene ficha propia" : ""}
              </option>
            ))}
          </Select>
        </Campo>
        <p className="text-[13px] text-texto-3">
          Todo usuario tiene su ficha en Personal. Al vincularlo, su ficha se une a la de {persona.nombre}: lo que
          falte acá se toma de allá, y la otra ficha deja de existir. El usuario pasa a llamarse
          &quot;{persona.nombre}&quot;: los datos personales salen de Personal.
        </p>
        {elegido && datos.length > 0 && (
          <p role="alert" className="rounded-xl border border-warning/40 bg-warning-bg px-3 py-2 text-[13px] text-warning-text">
            @{elegido.usuario} ya tiene su ficha &quot;{ficha?.nombre}&quot; con {datos.join(", ")}. Si lo vinculás, esa
            ficha se une a ésta y desaparece; a {persona.nombre} sólo se le completa lo que no tiene.
          </p>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
