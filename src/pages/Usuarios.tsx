import { useMemo, useState } from "react";
import { contiene } from "../lib/texto";
import { Icon } from "../components/Icon";
import { Buscador, Chips, EncabezadoPagina } from "../components/filtros";
import PermisosDelRol from "../components/roles/PermisosDelRol";
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
  Kpi,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../components/ui";
import { api } from "../lib/api";
import { fmtFechaHora, iniciales, tiempoRelativo } from "../lib/format";
import { tienePermiso } from "../lib/permisos";
import {
  apiRoles,
  nombresDelCatalogo,
  rolTiene,
  tonoDeRol,
  type NombresPermisos,
} from "../lib/roles";
import { useApi } from "../lib/useApi";
import { useAuth } from "../store/AuthContext";
import type { ActualizarUsuarioInput, CrearUsuarioInput, RolNegocio, Usuario } from "../types";

/**
 * Usuarios: las cuentas de acceso del negocio (PLAN-ROLES-NEGOCIO). Todo sale
 * de los roles del negocio y de los permisos: las tarjetas y los filtros son
 * uno por rol, el detalle muestra los permisos reales del rol, el combo de rol
 * ofrece lo que quien mira puede asignar (`GET /roles/asignables`) y el PIN
 * aparece donde el rol autoriza con PIN. Ningún nombre de rol está escrito acá.
 */

/** El rol de una cuenta, buscado por id en la lista de roles del negocio. */
function rolDe(u: Pick<Usuario, "rolId">, roles: RolNegocio[]): RolNegocio | null {
  return roles.find((r) => r.id === u.rolId) ?? null;
}

/** El nombre del rol de una cuenta: el del negocio, y si no llegó, el código. */
function nombreRol(u: Pick<Usuario, "rolId" | "rolNombre" | "rol">, roles: RolNegocio[]): string {
  return u.rolNombre?.trim() || rolDe(u, roles)?.nombre || u.rol;
}

/**
 * ¿El rol reparte? Zona y vehículo son datos de quien entrega pedidos. El
 * Administrador tiene todos los permisos, pero no por eso es repartidor.
 */
function reparte(rol: RolNegocio | null): boolean {
  return !!rol && !rol.esAdministrador && rol.permisos.some((p) => p.codigo === "entregas.realizar");
}

/**
 * ¿Lleva PIN? El PIN sirve para autorizar lo que hace otro (anular, fiar por
 * encima del límite): lo lleva el rol que tiene `autorizar.pin`, y sólo si el
 * plan incluye la autorización con PIN.
 */
function llevaPin(rol: RolNegocio | null, conPin: boolean): boolean {
  return conPin && rolTiene(rol, "autorizar.pin");
}

type FiltroRol = "todos" | "inactivos" | `rol:${number}`;

export default function Usuarios() {
  const { incluye, usuario: actual } = useAuth();
  // El PIN sólo existe si el plan incluye la autorización con PIN.
  const conPin = incluye("autorizacion_pin");
  const usuarios = useApi(() => api.getUsuarios(), []);
  const roles = useApi(() => apiRoles.listar(), []);
  // Los nombres de los permisos salen del catálogo, que es de quien edita
  // roles. A quien no, no se le pide (sería un 403): se usa lo que traiga el rol.
  const editaRoles = tienePermiso(actual, "roles.gestionar");
  const catalogo = useApi(
    () => (editaRoles ? apiRoles.catalogo().catch(() => null) : Promise.resolve(null)),
    [editaRoles],
  );
  const nombres = useMemo(() => nombresDelCatalogo(catalogo.datos), [catalogo.datos]);
  const listaRoles = useMemo(() => roles.datos ?? [], [roles.datos]);

  const [q, setQ] = useState("");
  const [filtroRol, setFiltroRol] = useState<FiltroRol>("todos");
  const [detalle, setDetalle] = useState<Usuario | null>(null);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [creando, setCreando] = useState(false);
  const [cambiandoPassword, setCambiandoPassword] = useState<Usuario | null>(null);
  const [cambiandoPin, setCambiandoPin] = useState<Usuario | null>(null);
  const [quitandoPin, setQuitandoPin] = useState<Usuario | null>(null);
  const [quitandoPinEnCurso, setQuitandoPinEnCurso] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState<Usuario | null>(null);
  const [cambiandoEstadoEnCurso, setCambiandoEstadoEnCurso] = useState(false);
  const [errorAccion, setErrorAccion] = useState("");
  const [aviso, setAviso] = useAviso();

  const lista = useMemo(() => usuarios.datos ?? [], [usuarios.datos]);

  // Los KPIs cuentan sólo cuentas activas: una cuenta dada de baja no ocupa un
  // puesto y sumarla haría creer que hay más gente operando de la que hay.
  const activosPorRol = useMemo(() => {
    const m = new Map<number, number>();
    for (const u of lista) if (u.activo && u.rolId != null) m.set(u.rolId, (m.get(u.rolId) ?? 0) + 1);
    return m;
  }, [lista]);

  // Un filtro y una tarjeta por cada rol del negocio, en el orden que los
  // manda el backend (el Administrador primero).
  const opcionesRol = useMemo(
    () =>
      [
        ["todos", "Todos"],
        ...listaRoles.map((r) => [`rol:${r.id}`, r.nombre] as const),
        ["inactivos", "Inactivos"],
      ] as readonly (readonly [FiltroRol, string])[],
    [listaRoles],
  );

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return lista.filter((u) => {
      if (texto && !contiene(u.nombre, texto) && !contiene(u.usuario, texto)) return false;
      if (filtroRol === "todos") return true;
      if (filtroRol === "inactivos") return !u.activo;
      return `rol:${u.rolId}` === filtroRol;
    });
  }, [lista, q, filtroRol]);

  const inactivos = lista.filter((u) => !u.activo).length;
  // Con cinco tarjetas van en una fila en pantallas anchas; si no, de a tres.
  const tarjetas = listaRoles.length + 1;

  /** Refresca la lista y deja el detalle mostrando la versión recién guardada. */
  function traerDeVuelta(actualizado: Usuario) {
    setDetalle(actualizado);
    usuarios.recargar();
    roles.recargar();
  }

  /**
   * Quitarle el PIN a alguien es sacarle la autorización: lo vuelve a poner
   * sólo quien asigna los PIN.
   */
  async function quitarPin() {
    if (!quitandoPin || quitandoPinEnCurso) return;
    const sinPin = quitandoPin;
    setErrorAccion("");
    setQuitandoPinEnCurso(true);
    try {
      await api.quitarPin(sinPin.id);
      setDetalle((d) => (d && d.id === sinPin.id ? { ...d, tienePin: false } : d));
      usuarios.recargar();
      setAviso("PIN quitado: ya no autoriza anulaciones.");
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo quitar el PIN");
    } finally {
      setQuitandoPin(null);
      setQuitandoPinEnCurso(false);
    }
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
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Usuarios"
        subtitulo={`${lista.length} ${lista.length === 1 ? "cuenta" : "cuentas"} en el negocio`}
        accion={
          <Boton icono="plus" onClick={() => setCreando(true)}>
            Nuevo
          </Boton>
        }
      />

      <div
        className={`grid grid-cols-2 gap-3 lg:grid-cols-3 ${tarjetas === 5 ? "xl:grid-cols-5" : ""}`}
        aria-label="Cuentas por rol"
      >
        {listaRoles.map((r) => (
          <Kpi
            key={r.id}
            etiqueta={r.nombre}
            valor={String(activosPorRol.get(r.id) ?? 0)}
            icono={r.esAdministrador ? "lock" : "users"}
            tono={tonoDeRol(r, listaRoles)}
          />
        ))}
        <Kpi etiqueta="Inactivos" valor={String(inactivos)} icono="x" tono="gris" />
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Buscador valor={q} onChange={setQ} placeholder="Buscar por nombre o usuario" />
        </div>
        <Chips valor={filtroRol} opciones={opcionesRol} onChange={setFiltroRol} />
      </div>

      <ErrorMsg>{errorAccion || usuarios.error || roles.error}</ErrorMsg>
      <AvisoOk>{aviso}</AvisoOk>

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
            <TarjetaUsuario
              key={u.id}
              usuario={u}
              roles={listaRoles}
              conPin={conPin}
              onClick={() => setDetalle(u)}
            />
          ))}
        </ul>
      )}

      <DetalleUsuario
        usuario={detalle}
        roles={listaRoles}
        nombres={nombres}
        onClose={() => setDetalle(null)}
        onEditar={(u) => {
          setDetalle(null);
          setEditando(u);
        }}
        onPassword={(u) => setCambiandoPassword(u)}
        onPin={(u) => setCambiandoPin(u)}
        onQuitarPin={(u) => setQuitandoPin(u)}
        onEstado={(u) => setCambiandoEstado(u)}
        conPin={conPin}
      />

      <FormUsuario
        abierto={creando || !!editando}
        usuario={editando}
        roles={listaRoles}
        nombres={nombres}
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
        llevaPin={!!cambiandoPin && llevaPin(rolDe(cambiandoPin, listaRoles), conPin)}
        onClose={() => setCambiandoPin(null)}
        onGuardado={() => {
          // El detalle sigue abierto atrás: sin esto seguía diciendo "Asignar
          // PIN" y sin la marca, como si no se hubiera guardado.
          const conPinNuevo = cambiandoPin;
          setDetalle((d) => (d && d.id === conPinNuevo?.id ? { ...d, tienePin: true } : d));
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

      <Confirmar
        abierto={!!quitandoPin}
        titulo="Quitar PIN"
        texto={`¿Quitarle el PIN a "${quitandoPin?.nombre}"? No va a poder autorizar anulaciones ni fiar por encima del límite hasta que le asignes uno nuevo.`}
        etiquetaOk="Quitar PIN"
        peligroso
        procesando={quitandoPinEnCurso}
        onCancel={() => setQuitandoPin(null)}
        onOk={quitarPin}
      />
    </div>
  );
}

function TarjetaUsuario({
  usuario: u,
  roles,
  conPin,
  onClick,
}: {
  usuario: Usuario;
  roles: RolNegocio[];
  conPin: boolean;
  onClick: () => void;
}) {
  const rol = rolDe(u, roles);
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
            {u.tienePin && llevaPin(rol, conPin) && <Badge tono="azul">PIN</Badge>}
            <Icon name="chevronRight" size={17} color="#94A3B8" />
          </div>
        </div>

        <h3 className="mt-3 truncate text-[15px] font-bold text-texto">{u.nombre}</h3>
        <p className="mt-0.5 truncate text-[13px] text-texto-3">@{u.usuario}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Badge tono={tonoDeRol(rol, roles)}>{nombreRol(u, roles)}</Badge>
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
  roles,
  nombres,
  onClose,
  onEditar,
  onPassword,
  onPin,
  onQuitarPin,
  onEstado,
}: {
  usuario: Usuario | null;
  roles: RolNegocio[];
  nombres: NombresPermisos;
  onClose: () => void;
  onEditar: (u: Usuario) => void;
  onPassword: (u: Usuario) => void;
  onPin: (u: Usuario) => void;
  onQuitarPin: (u: Usuario) => void;
  onEstado: (u: Usuario) => void;
  conPin: boolean;
}) {
  const { usuario: actual } = useAuth();
  if (!u) return null;
  const rol = rolDe(u, roles);
  const esYo = actual?.id === u.id;
  const conPinElRol = llevaPin(rol, conPin);
  // Lo asigna, cambia o quita quien tiene `usuarios.asignar_pin`.
  const administraPin = conPinElRol && tienePermiso(actual, "usuarios.asignar_pin");

  return (
    <Modal
      abierto
      titulo="Detalle del usuario"
      subtitulo={esYo ? `${u.nombre} · tu cuenta` : u.nombre}
      onClose={onClose}
      acciones={
        <>
          {/* Nadie se desactiva a sí mismo: se quedaría sin poder entrar a
              revertirlo, y si es el único administrador el negocio queda sin
              acceso. El backend lo impide igual; acá ni se ofrece. */}
          {!esYo && (
            <Boton
              variante={u.activo ? "danger" : "ghost"}
              icono={u.activo ? "x" : "check"}
              onClick={() => onEstado(u)}
            >
              {u.activo ? "Desactivar" : "Activar"}
            </Boton>
          )}
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
              <Badge tono={tonoDeRol(rol, roles)}>{nombreRol(u, roles)}</Badge>
              {!u.activo && <Badge tono="gris">Inactivo</Badge>}
              {conPinElRol && u.tienePin && <Badge tono="azul">PIN</Badge>}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <Dato label="Email" valor={u.email || "—"} />
          <Dato label="Teléfono" valor={u.telefono || "—"} />
          <Dato label="Último acceso" valor={tiempoRelativo(u.ultimoLogin)} />
          <Dato label="Creado" valor={fmtFechaHora(u.creado)} />
          {/* Sólo si está atado a un local. Al de organización no se le muestra
              "—": ver todo no es un dato faltante. */}
          {u.sucursal && <Dato label="Sucursal" valor={u.sucursal} />}
          {(reparte(rol) || u.zona || u.vehiculo) && (
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
          <h4 className="text-[13px] font-bold text-texto">
            Permisos del rol
            <span className="ml-1.5 font-normal text-texto-3">— los define el rol, no la cuenta</span>
          </h4>
          {rol ? (
            <PermisosDelRol
              nombre={rol.nombre}
              permisos={rol.permisos}
              nombres={nombres}
              esAdministrador={rol.esAdministrador}
              plegado={false}
            />
          ) : (
            <p className="mt-2 text-[13px] text-texto-3">No se pudieron cargar los permisos de este rol.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-borde-soft pt-4">
          <Boton variante="ghost" icono="lock" onClick={() => onPassword(u)}>
            Cambiar contraseña
          </Boton>
          {administraPin && (
            <Boton variante="ghost" icono="pin" onClick={() => onPin(u)}>
              {u.tienePin ? "Cambiar PIN" : "Asignar PIN"}
            </Boton>
          )}
          {/* Al Administrador no se le quita: es el que autoriza cuando no
              hay nadie más. */}
          {administraPin && !rol?.esAdministrador && u.tienePin && (
            <Boton variante="ghost" icono="x" onClick={() => onQuitarPin(u)}>
              Quitar PIN
            </Boton>
          )}
        </div>
        {/* A quien lleva PIN y no lo puede asignar se le dice a quién
            pedírselo en vez de esconderle el botón sin explicación. */}
        {conPinElRol && !administraPin && esYo && (
          <p className="text-[13px] text-texto-3">
            Tu PIN de autorización te lo asigna el administrador.
          </p>
        )}
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
  roles,
  nombres,
  onClose,
  onGuardado,
}: {
  abierto: boolean;
  usuario: Usuario | null;
  roles: RolNegocio[];
  nombres: NombresPermisos;
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
      roles={roles}
      nombres={nombres}
      onClose={onClose}
      onGuardado={onGuardado}
    />
  );
}

function FormUsuarioCuerpo({
  usuario,
  roles,
  nombres,
  onClose,
  onGuardado,
}: {
  usuario: Usuario | null;
  roles: RolNegocio[];
  nombres: NombresPermisos;
  onClose: () => void;
  onGuardado: (u: Usuario) => void;
}) {
  const esEdicion = !!usuario;
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { usuario: actual } = useAuth();
  /**
   * Los roles que quien mira puede asignar: el backend no ofrece uno con un
   * permiso que él no tenga, ni el Administrador si él no lo es.
   */
  const asignables = useApi(() => apiRoles.asignables(), []);
  const actualDelUsuario = usuario ? rolDe(usuario, roles) : null;
  const opciones: RolNegocio[] = [
    ...(asignables.datos ?? []),
    // El rol que YA tiene se sigue mostrando aunque no se pueda asignar: si
    // no, editarle el teléfono a un administrador le cambiaría el rol sin
    // querer al guardar.
    ...(actualDelUsuario && !asignables.datos?.some((r) => r.id === actualDelUsuario.id)
      ? [actualDelUsuario]
      : []),
  ];
  const [rolIdElegido, setRolId] = useState<number | null>(usuario?.rolId ?? null);
  // Al crear, el primero que se puede asignar (que nunca es el Administrador
  // salvo que no haya otro).
  const rolId =
    rolIdElegido ?? (opciones.find((r) => !r.esAdministrador) ?? opciones[0])?.id ?? null;
  const rol = opciones.find((r) => r.id === rolId) ?? null;
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [telefono, setTelefono] = useState(usuario?.telefono ?? "");
  const [notas, setNotas] = useState(usuario?.notas ?? "");
  const [zona, setZona] = useState(usuario?.zona ?? "");
  const [vehiculo, setVehiculo] = useState(usuario?.vehiculo ?? "");
  const [sucursalId, setSucursalId] = useState<number | null>(usuario?.sucursalId ?? null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const esRepartidor = reparte(rol);

  const almacenes = useApi(() => api.getAlmacenes(), []);
  // Sólo las sucursales: a un depósito no se le asigna personal de venta.
  const sucursales = (almacenes.datos ?? []).filter(
    (a) => a.tipo !== "DEPOSITO" && (a.activo || a.id === usuario?.sucursalId),
  );
  /**
   * El campo aparece recién con dos o más locales. Con uno solo la respuesta
   * es siempre la misma y preguntarla sería ruido — un negocio de un local no
   * debería enterarse de que existen las sucursales.
   *
   * A un rol que ve todas las sucursales (`sucursales.todas`, el Administrador
   * siempre) tampoco se le pregunta: no pertenece a ninguna.
   */
  const veTodas = rolTiene(rol, "sucursales.todas");
  const mostrarSucursal = sucursales.length > 1 && !veTodas;
  // Y sólo un usuario de organización puede fijarla: el backend rechaza al
  // resto, así que ofrecer el selector sería invitarlo a un 403.
  //
  // `== null` cubre los dos casos a propósito: null (es de organización) y
  // undefined (sesión guardada antes de que el login mandara el campo). Elegir
  // mostrarlo de más es preferible a esconderle la función al dueño hasta que
  // vuelva a entrar; si no le corresponde, el backend responde 403 igual.
  const puedeAsignarSucursal = actual?.sucursalId == null;

  async function guardar() {
    setError("");
    if (!nombre.trim()) return setError("Poné el nombre completo.");
    if (!esEdicion) {
      if (!username.trim()) return setError("Poné un nombre de usuario.");
      if (password.length < 6) return setError("La contraseña necesita al menos 6 caracteres.");
    }
    if (rolId == null) return setError("Elegí el rol.");

    // "Toda la organización" es de quien ve todas las sucursales: un cajero
    // sin sucursal vería el negocio entero y vendería del almacén principal
    // estando parado en otro local. El backend lo rechaza igual; el aviso acá
    // evita que se entere después de llenar todo.
    if (mostrarSucursal && puedeAsignarSucursal && sucursalId == null) {
      return setError("Elegí la sucursal en la que trabaja.");
    }

    setGuardando(true);
    try {
      if (usuario) {
        // Los opcionales viajan SIEMPRE como string (vacío si se borraron):
        // mandar null sería indistinguible de "no tocar este campo" y el dato
        // viejo quedaría pegado para siempre.
        const input: ActualizarUsuarioInput = {
          nombre: nombre.trim(),
          // El rol sólo si cambió: mandarlo igual le pediría al backend
          // asignar uno que quien edita quizás no puede dar.
          ...(rolId !== usuario.rolId ? { rolId } : {}),
          email: email.trim(),
          telefono: telefono.trim(),
          notas: notas.trim(),
          // Zona y vehículo sólo tienen sentido en quien reparte; si dejó de
          // hacerlo se limpian para no arrastrar datos de su rol anterior.
          zona: esRepartidor ? zona.trim() : "",
          vehiculo: esRepartidor ? vehiculo.trim() : "",
          // Sólo si se podía editar: mandarlo cuando el selector no se mostró
          // le borraría la sucursal a alguien por abrirle la ficha y guardar.
          ...(mostrarSucursal && puedeAsignarSucursal ? { sucursalId } : {}),
        };
        onGuardado(await api.actualizarUsuario(usuario.id, input));
      } else {
        const input: CrearUsuarioInput = {
          nombre: nombre.trim(),
          username: username.trim(),
          password,
          rolId,
          // En el alta el email vacío se omite: el DTO de creación valida el
          // formato de cualquier string que llegue, y `""` daba 400 "El email no
          // tiene un formato válido" (QA A-01). Al editar sí viaja vacío, que
          // ahí significa "borralo" y el DTO de update lo tolera.
          ...(email.trim() ? { email: email.trim() } : {}),
          telefono: telefono.trim(),
          notas: notas.trim(),
          ...(esRepartidor ? { zona: zona.trim(), vehiculo: vehiculo.trim() } : {}),
          ...(mostrarSucursal && puedeAsignarSucursal && sucursalId != null
            ? { sucursalId }
            : {}),
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
      cerrarAlClicAfuera={false}
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
              <InputPassword
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Campo>
          </div>
        )}

        <Campo
          label="Rol"
          hint={rol?.descripcion ?? undefined}
          error={asignables.error ? "No se pudieron cargar los roles." : undefined}
        >
          <Select
            value={rolId ?? ""}
            onChange={(e) => setRolId(Number(e.target.value))}
            disabled={!opciones.length}
          >
            {!opciones.length && <option value="">{asignables.cargando ? "Cargando…" : "Sin roles"}</option>}
            {opciones.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </Select>
          {rol && (
            <PermisosDelRol
              nombre={rol.nombre}
              permisos={rol.permisos}
              nombres={nombres}
              esAdministrador={rol.esAdministrador}
            />
          )}
        </Campo>

        {mostrarSucursal && puedeAsignarSucursal && (
          <Campo
            label="Sucursal"
            hint="En qué local trabaja: ahí vende, y ve sólo lo de ahí"
          >
            <Select
              value={sucursalId ?? ""}
              onChange={(e) =>
                setSucursalId(e.target.value === "" ? null : Number(e.target.value))
              }
            >
              {/* Sin opción "toda la organización": eso es de un rol que ve
                  todas, y a ése no se le muestra este campo. Queda un
                  placeholder para no elegir por el usuario en el alta. */}
              <option value="">Elegí una sucursal…</option>
              {sucursales.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                  {a.activo ? "" : " (desactivada)"}
                </option>
              ))}
            </Select>
          </Campo>
        )}

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
  // Un solo ojo para los dos campos: se alternan juntos (ver InputPassword).
  const [verPassword, setVerPassword] = useState(false);
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
          <InputPassword
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            visible={verPassword}
            onCambiarVisible={setVerPassword}
            autoComplete="new-password"
            autoFocus
          />
        </Campo>
        <Campo label="Repetir contraseña">
          <InputPassword
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            visible={verPassword}
            sinOjo
            autoComplete="new-password"
          />
        </Campo>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

function FormPin({
  usuario,
  llevaPin,
  onClose,
  onGuardado,
}: {
  usuario: Usuario | null;
  /** ¿Su rol autoriza con PIN? */
  llevaPin: boolean;
  onClose: () => void;
  onGuardado: () => void;
}) {
  if (!usuario) return null;
  return (
    <FormPinCuerpo
      key={usuario.id}
      usuario={usuario}
      llevaPin={llevaPin}
      onClose={onClose}
      onGuardado={onGuardado}
    />
  );
}

function FormPinCuerpo({
  usuario,
  llevaPin,
  onClose,
  onGuardado,
}: {
  usuario: Usuario;
  llevaPin: boolean;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const rolSinPin = !llevaPin;

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
          El PIN autoriza anular ventas y fiar por encima del límite del cliente. Lo lleva
          quien tiene un rol que autoriza con PIN.
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
              ? `Su rol (${usuario.rolNombre ?? usuario.rol}) no autoriza con PIN: cambiale el rol primero.`
              : "")}
        </ErrorMsg>
      </div>
    </Modal>
  );
}
