import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Buscador, Chips, EncabezadoPagina } from "../components/filtros";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Kpi,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../components/ui";
import { api } from "../lib/api";
import { fmtFechaHora, iniciales, tiempoRelativo } from "../lib/format";
import { etiquetaRol } from "../lib/permisos";
import { useApi } from "../lib/useApi";
import { useAuth } from "../store/AuthContext";
import type { ActualizarUsuarioInput, CrearUsuarioInput, Rol, Usuario } from "../types";

/** Roles que se pueden crear desde la app. PLATAFORMA queda afuera a propósito:
 *  es la cuenta del panel de licencias y el backend rechaza asignarla acá. */
const ROLES_APP = ["ADMIN", "SUPERVISOR", "CAJERO", "REPARTIDOR"] as const;
type RolApp = (typeof ROLES_APP)[number];

const TONO_ROL: Record<RolApp, "morado" | "azul" | "verde" | "amarillo"> = {
  ADMIN: "morado",
  SUPERVISOR: "azul",
  CAJERO: "verde",
  REPARTIDOR: "amarillo",
};

/**
 * Qué puede hacer cada rol, copiado de la app Android para que las dos
 * pantallas digan lo mismo. Es informativo: quien manda es el backend
 * (RolesGuard), acá sólo se explica al administrador qué está entregando.
 */
const PERMISOS_ROL: Record<RolApp, string[]> = {
  ADMIN: ["Inventario", "Ventas", "Reportes", "Usuarios", "Anular ventas", "Cierre de caja"],
  SUPERVISOR: ["Ventas", "Reportes", "Anular ventas", "Cierre de caja"],
  CAJERO: ["Ventas", "Caja propia"],
  REPARTIDOR: ["Entregas", "Cobro contra entrega", "Rendición"],
};

/** Sólo ADMIN y SUPERVISOR autorizan anulaciones, así que sólo ellos llevan PIN. */
const ROLES_CON_PIN: Rol[] = ["ADMIN", "SUPERVISOR"];

type FiltroRol = "todos" | RolApp | "inactivos";

const OPC_ROL = [
  ["todos", "Todos"],
  ["ADMIN", "Administradores"],
  ["SUPERVISOR", "Supervisores"],
  ["CAJERO", "Cajeros"],
  ["REPARTIDOR", "Repartidores"],
  ["inactivos", "Inactivos"],
] as const satisfies readonly (readonly [FiltroRol, string])[];

/** El rol del backend puede crecer; lo que no está en la matriz cae en gris. */
function tonoRol(rol: Rol): "morado" | "azul" | "verde" | "amarillo" | "gris" {
  return TONO_ROL[rol as RolApp] ?? "gris";
}

export default function Usuarios() {
  const { incluye } = useAuth();
  // El PIN sólo existe para autorizar anulaciones de venta.
  const conPin = incluye("autorizacion_pin");
  const usuarios = useApi(() => api.getUsuarios(), []);

  const [q, setQ] = useState("");
  const [filtroRol, setFiltroRol] = useState<FiltroRol>("todos");
  const [detalle, setDetalle] = useState<Usuario | null>(null);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [creando, setCreando] = useState(false);
  const [cambiandoPassword, setCambiandoPassword] = useState<Usuario | null>(null);
  const [cambiandoPin, setCambiandoPin] = useState<Usuario | null>(null);
  const [cambiandoEstado, setCambiandoEstado] = useState<Usuario | null>(null);
  const [cambiandoEstadoEnCurso, setCambiandoEstadoEnCurso] = useState(false);
  const [errorAccion, setErrorAccion] = useState("");
  const [aviso, setAviso] = useAviso();

  const lista = usuarios.datos ?? [];

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return lista.filter((u) => {
      if (
        texto &&
        !u.nombre.toLowerCase().includes(texto) &&
        !u.usuario.toLowerCase().includes(texto)
      )
        return false;
      if (filtroRol === "todos") return true;
      if (filtroRol === "inactivos") return !u.activo;
      return u.rol === filtroRol;
    });
  }, [lista, q, filtroRol]);

  // Los KPIs cuentan sólo cuentas activas: una cuenta dada de baja no ocupa un
  // puesto y sumarla haría creer que hay más gente operando de la que hay.
  const conteos = useMemo(() => {
    const base: Record<RolApp, number> = {
      ADMIN: 0,
      SUPERVISOR: 0,
      CAJERO: 0,
      REPARTIDOR: 0,
    };
    for (const u of lista) {
      if (!u.activo) continue;
      if (u.rol in base) base[u.rol as RolApp]++;
    }
    return base;
  }, [lista]);

  const inactivos = lista.filter((u) => !u.activo).length;

  /** Refresca la lista y deja el detalle mostrando la versión recién guardada. */
  function traerDeVuelta(actualizado: Usuario) {
    setDetalle(actualizado);
    usuarios.recargar();
  }

  async function alternarEstado() {
    if (!cambiandoEstado || cambiandoEstadoEnCurso) return;
    setErrorAccion("");
    setCambiandoEstadoEnCurso(true);
    try {
      const res = await api.cambiarEstadoUsuario(cambiandoEstado.id, !cambiandoEstado.activo);
      setCambiandoEstado(null);
      traerDeVuelta(res);
    } catch (err) {
      setCambiandoEstado(null);
      setErrorAccion(err instanceof Error ? err.message : "No se pudo cambiar el estado");
    } finally {
      setCambiandoEstadoEnCurso(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Usuarios"
        subtitulo={`${lista.length} ${lista.length === 1 ? "cuenta" : "cuentas"} en el negocio`}
        accion={
          <Boton icono="plus" onClick={() => setCreando(true)}>
            Nuevo
          </Boton>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi etiqueta="Administradores" valor={String(conteos.ADMIN)} icono="lock" tono="morado" />
        <Kpi etiqueta="Supervisores" valor={String(conteos.SUPERVISOR)} icono="users" tono="azul" />
        <Kpi etiqueta="Cajeros" valor={String(conteos.CAJERO)} icono="cart" tono="verde" />
        <Kpi
          etiqueta="Repartidores"
          valor={String(conteos.REPARTIDOR)}
          icono="truck"
          tono="amarillo"
        />
        <Kpi etiqueta="Inactivos" valor={String(inactivos)} icono="x" tono="gris" />
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Buscador valor={q} onChange={setQ} placeholder="Buscar por nombre o usuario" />
        </div>
        <Chips valor={filtroRol} opciones={OPC_ROL} onChange={setFiltroRol} />
      </div>

      <ErrorMsg>{errorAccion || usuarios.error}</ErrorMsg>
      {aviso && (
        <div className="flex items-start gap-2 rounded-xl bg-primary-50 px-3.5 py-2.5 text-sm text-primary-700">
          <Icon name="check" size={17} />
          <span>{aviso}</span>
        </div>
      )}

      {usuarios.cargando ? (
        <Cargando />
      ) : filtrados.length === 0 ? (
        <div className="card">
          <Vacio
            icono="users"
            titulo={lista.length ? "Sin resultados" : "Todavía no hay usuarios"}
            texto={
              lista.length
                ? "Probá con otro texto o quitá los filtros."
                : "Creá la primera cuenta para tu equipo."
            }
            accion={
              !lista.length && (
                <Boton icono="plus" onClick={() => setCreando(true)}>
                  Nuevo usuario
                </Boton>
              )
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((u) => (
            <TarjetaUsuario key={u.id} usuario={u} onClick={() => setDetalle(u)} />
          ))}
        </ul>
      )}

      <DetalleUsuario
        usuario={detalle}
        onClose={() => setDetalle(null)}
        onEditar={(u) => {
          setDetalle(null);
          setEditando(u);
        }}
        onPassword={(u) => setCambiandoPassword(u)}
        onPin={(u) => setCambiandoPin(u)}
        onEstado={(u) => setCambiandoEstado(u)}
        conPin={conPin}
      />

      <FormUsuario
        abierto={creando || !!editando}
        usuario={editando}
        onClose={() => {
          setCreando(false);
          setEditando(null);
        }}
        onGuardado={(u) => {
          setCreando(false);
          setEditando(null);
          traerDeVuelta(u);
        }}
      />

      <FormPassword
        usuario={cambiandoPassword}
        onClose={() => setCambiandoPassword(null)}
        onGuardado={() => {
          setCambiandoPassword(null);
          setAviso("Contraseña actualizada.");
        }}
      />

      <FormPin
        usuario={cambiandoPin}
        onClose={() => setCambiandoPin(null)}
        onGuardado={() => {
          setCambiandoPin(null);
          setAviso("PIN actualizado.");
          usuarios.recargar();
        }}
      />

      <Confirmar
        abierto={!!cambiandoEstado}
        titulo={cambiandoEstado?.activo ? "Desactivar usuario" : "Activar usuario"}
        texto={
          cambiandoEstado?.activo
            ? `¿Desactivar a "${cambiandoEstado?.nombre}"? No va a poder entrar al sistema hasta que lo reactives.`
            : `¿Activar a "${cambiandoEstado?.nombre}"? Va a poder volver a entrar con su usuario y contraseña.`
        }
        etiquetaOk={cambiandoEstado?.activo ? "Desactivar" : "Activar"}
        peligroso={cambiandoEstado?.activo}
        procesando={cambiandoEstadoEnCurso}
        onCancel={() => setCambiandoEstado(null)}
        onOk={alternarEstado}
      />
    </div>
  );
}

function TarjetaUsuario({ usuario: u, onClick }: { usuario: Usuario; onClick: () => void }) {
  const { incluye } = useAuth();
  const conPin = incluye("autorizacion_pin");

  return (
    <li>
      <button
        onClick={onClick}
        className="card w-full p-4 text-left transition-shadow hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white ${
              u.activo ? "bg-marca" : "bg-slate-400"
            }`}
          >
            {iniciales(u.nombre)}
          </span>
          <div className="flex items-center gap-2">
            {!u.activo && <Badge tono="gris">Inactivo</Badge>}
            {conPin && u.tienePin && <Badge tono="azul">PIN</Badge>}
            <Icon name="chevronRight" size={17} color="#94A3B8" />
          </div>
        </div>

        <h3 className="mt-3 truncate text-[15px] font-bold text-texto">{u.nombre}</h3>
        <p className="mt-0.5 truncate text-[13px] text-texto-3">@{u.usuario}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Badge tono={tonoRol(u.rol)}>{etiquetaRol(u.rol)}</Badge>
          <span className="flex items-center gap-1 truncate text-xs text-texto-4">
            <Icon name="clock" size={13} />
            {tiempoRelativo(u.ultimoLogin)}
          </span>
        </div>
      </button>
    </li>
  );
}

function DetalleUsuario({
  conPin,
  usuario: u,
  onClose,
  onEditar,
  onPassword,
  onPin,
  onEstado,
}: {
  usuario: Usuario | null;
  onClose: () => void;
  onEditar: (u: Usuario) => void;
  onPassword: (u: Usuario) => void;
  onPin: (u: Usuario) => void;
  onEstado: (u: Usuario) => void;
  conPin: boolean;
}) {
  if (!u) return null;
  const permisos = PERMISOS_ROL[u.rol as RolApp] ?? [];
  const esRepartidor = u.rol === "REPARTIDOR";

  return (
    <Modal
      abierto
      titulo="Detalle del usuario"
      subtitulo={u.nombre}
      onClose={onClose}
      acciones={
        <>
          <Boton
            variante={u.activo ? "danger" : "ghost"}
            icono={u.activo ? "x" : "check"}
            onClick={() => onEstado(u)}
          >
            {u.activo ? "Desactivar" : "Activar"}
          </Boton>
          <Boton icono="edit" onClick={() => onEditar(u)}>
            Editar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-primary-50 p-4">
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white ${
              u.activo ? "bg-marca" : "bg-slate-400"
            }`}
          >
            {iniciales(u.nombre)}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-texto">{u.nombre}</h3>
            <p className="text-[13px] text-texto-3">@{u.usuario}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tono={tonoRol(u.rol)}>{etiquetaRol(u.rol)}</Badge>
              {!u.activo && <Badge tono="gris">Inactivo</Badge>}
              {conPin && u.tienePin && <Badge tono="azul">PIN</Badge>}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <Dato label="Email" valor={u.email || "—"} />
          <Dato label="Teléfono" valor={u.telefono || "—"} />
          <Dato label="Último acceso" valor={tiempoRelativo(u.ultimoLogin)} />
          <Dato label="Creado" valor={fmtFechaHora(u.creado)} />
          {esRepartidor && (
            <>
              <Dato label="Zona" valor={u.zona || "—"} />
              <Dato label="Vehículo" valor={u.vehiculo || "—"} />
            </>
          )}
        </dl>

        {u.notas && (
          <div className="rounded-xl bg-muted p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
              Notas
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-texto-2">{u.notas}</dd>
          </div>
        )}

        <div>
          <h4 className="mb-2 text-[13px] font-bold text-texto">
            Permisos del rol
            <span className="ml-1.5 font-normal text-texto-3">— los define el rol, no la cuenta</span>
          </h4>
          {permisos.length === 0 ? (
            <p className="text-[13px] text-texto-3">Este rol no se administra desde acá.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {permisos.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-[13px] text-texto-2"
                >
                  <Icon name="check" size={14} color="#059669" />
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-borde-soft pt-4">
          <Boton variante="ghost" icono="lock" onClick={() => onPassword(u)}>
            Cambiar contraseña
          </Boton>
          {/* El PIN sólo sirve para autorizar anulaciones: sin esa capacidad
              no habría nada que autorizar con él. */}
          {conPin && (
            <Boton variante="ghost" icono="pin" onClick={() => onPin(u)}>
              {u.tienePin ? "Cambiar PIN" : "Asignar PIN"}
            </Boton>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-bold text-texto">{valor}</dd>
    </div>
  );
}

function FormUsuario({
  abierto,
  usuario,
  onClose,
  onGuardado,
}: {
  abierto: boolean;
  usuario: Usuario | null;
  onClose: () => void;
  onGuardado: (u: Usuario) => void;
}) {
  // La clave remonta el formulario al cambiar de cuenta: así los estados
  // internos arrancan siempre desde el usuario que se está editando.
  if (!abierto) return null;
  return (
    <FormUsuarioCuerpo
      key={usuario?.id ?? "nuevo"}
      usuario={usuario}
      onClose={onClose}
      onGuardado={onGuardado}
    />
  );
}

function FormUsuarioCuerpo({
  usuario,
  onClose,
  onGuardado,
}: {
  usuario: Usuario | null;
  onClose: () => void;
  onGuardado: (u: Usuario) => void;
}) {
  const esEdicion = !!usuario;
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<RolApp>((usuario?.rol as RolApp) ?? "CAJERO");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [telefono, setTelefono] = useState(usuario?.telefono ?? "");
  const [notas, setNotas] = useState(usuario?.notas ?? "");
  const [zona, setZona] = useState(usuario?.zona ?? "");
  const [vehiculo, setVehiculo] = useState(usuario?.vehiculo ?? "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const esRepartidor = rol === "REPARTIDOR";

  async function guardar() {
    setError("");
    if (!nombre.trim()) return setError("Poné el nombre completo.");
    if (!esEdicion) {
      if (!username.trim()) return setError("Poné un nombre de usuario.");
      if (password.length < 6) return setError("La contraseña necesita al menos 6 caracteres.");
    }

    setGuardando(true);
    try {
      if (usuario) {
        // Los opcionales viajan SIEMPRE como string (vacío si se borraron):
        // mandar null sería indistinguible de "no tocar este campo" y el dato
        // viejo quedaría pegado para siempre.
        const input: ActualizarUsuarioInput = {
          nombre: nombre.trim(),
          rol,
          email: email.trim(),
          telefono: telefono.trim(),
          notas: notas.trim(),
          // Zona y vehículo sólo tienen sentido en un repartidor; si dejó de
          // serlo se limpian para no arrastrar datos de su rol anterior.
          zona: esRepartidor ? zona.trim() : "",
          vehiculo: esRepartidor ? vehiculo.trim() : "",
        };
        onGuardado(await api.actualizarUsuario(usuario.id, input));
      } else {
        const input: CrearUsuarioInput = {
          nombre: nombre.trim(),
          username: username.trim(),
          password,
          rol,
          email: email.trim(),
          telefono: telefono.trim(),
          notas: notas.trim(),
          ...(esRepartidor ? { zona: zona.trim(), vehiculo: vehiculo.trim() } : {}),
        };
        onGuardado(await api.crearUsuario(input));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={esEdicion ? "Editar usuario" : "Nuevo usuario"}
      subtitulo={esEdicion ? usuario.nombre : "Cargá los datos de la cuenta"}
      onClose={onClose}
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
      <div className="space-y-4">
        <Campo label="Nombre completo">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </Campo>

        {!esEdicion && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Usuario" hint="Con esto entra al sistema">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
              />
            </Campo>
            <Campo label="Contraseña" hint="Mínimo 6 caracteres">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Campo>
          </div>
        )}

        <Campo label="Rol" hint={PERMISOS_ROL[rol].join(" · ")}>
          <Select value={rol} onChange={(e) => setRol(e.target.value as RolApp)}>
            {ROLES_APP.map((r) => (
              <option key={r} value={r}>
                {etiquetaRol(r)}
              </option>
            ))}
          </Select>
        </Campo>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <Campo label="Teléfono">
            <Input
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </Campo>
        </div>

        {esRepartidor && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Zona" hint="Barrio o sector que cubre">
              <Input value={zona} onChange={(e) => setZona(e.target.value)} />
            </Campo>
            <Campo label="Vehículo" hint="Ej. moto, bici">
              <Input value={vehiculo} onChange={(e) => setVehiculo(e.target.value)} />
            </Campo>
          </div>
        )}

        <Campo label="Notas">
          <Input value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Campo>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

function FormPassword({
  usuario,
  onClose,
  onGuardado,
}: {
  usuario: Usuario | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  if (!usuario) return null;
  return <FormPasswordCuerpo key={usuario.id} usuario={usuario} onClose={onClose} onGuardado={onGuardado} />;
}

function FormPasswordCuerpo({
  usuario,
  onClose,
  onGuardado,
}: {
  usuario: Usuario;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [password, setPassword] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError("");
    if (password.length < 6) return setError("La contraseña necesita al menos 6 caracteres.");
    if (password !== repetir) return setError("Las dos contraseñas no coinciden.");

    setGuardando(true);
    try {
      await api.cambiarPassword(usuario.id, password);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Cambiar contraseña"
      subtitulo={`${usuario.nombre} · @${usuario.usuario}`}
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
      <div className="space-y-4">
        <Campo label="Nueva contraseña" hint="Mínimo 6 caracteres">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </Campo>
        <Campo label="Repetir contraseña">
          <Input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </Campo>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

function FormPin({
  usuario,
  onClose,
  onGuardado,
}: {
  usuario: Usuario | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  if (!usuario) return null;
  return <FormPinCuerpo key={usuario.id} usuario={usuario} onClose={onClose} onGuardado={onGuardado} />;
}

function FormPinCuerpo({
  usuario,
  onClose,
  onGuardado,
}: {
  usuario: Usuario;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const rolSinPin = !ROLES_CON_PIN.includes(usuario.rol);

  async function guardar() {
    setError("");
    if (!/^\d{4,6}$/.test(pin)) return setError("El PIN son 4 a 6 dígitos, sin letras.");

    setGuardando(true);
    try {
      await api.cambiarPin(usuario.id, pin);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el PIN");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={usuario.tienePin ? "Cambiar PIN" : "Asignar PIN"}
      subtitulo={`${usuario.nombre} · @${usuario.usuario}`}
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton icono="save" onClick={guardar} disabled={guardando || rolSinPin}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-xl bg-info-bg px-3.5 py-2.5 text-[13px] text-info-text">
          El PIN autoriza anulaciones de venta y movimientos de caja. Sólo lo pueden tener
          administradores y supervisores: al resto el backend le rechaza el cambio.
        </p>

        <Campo label="PIN" hint="4 a 6 dígitos">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            disabled={rolSinPin}
            autoFocus
          />
        </Campo>

        <ErrorMsg>
          {error ||
            (rolSinPin
              ? `Un ${etiquetaRol(usuario.rol).toLowerCase()} no lleva PIN: cambiale el rol primero.`
              : "")}
        </ErrorMsg>
      </div>
    </Modal>
  );
}
