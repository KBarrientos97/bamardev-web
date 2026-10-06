import { useMemo, useState } from "react";
import { contiene } from "../lib/texto";
import { Icon } from "../components/Icon";
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
  Kpi,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../components/ui";
import { api } from "../lib/api";
import { fmtFechaHora, iniciales, tiempoRelativo } from "../lib/format";
import {
  etiquetaRol,
  ofreceRol,
  rolesAsignables as calcularRolesAsignables,
  type RolApp,
} from "../lib/permisos";
import { useApi } from "../lib/useApi";
import { useAuth } from "../store/AuthContext";
import type {
  ActualizarUsuarioInput,
  CrearUsuarioInput,
  PermisoDeRol,
  Rol,
  RolOfrecido,
  Usuario,
} from "../types";

// `ROLES_APP` y quién asigna qué viven en permisos.ts: se prueban sin montar
// la pantalla, y el rol PROFESIONAL depende del perfil del rubro.

const TONO_ROL: Record<RolApp, "morado" | "azul" | "verde" | "amarillo" | "gris"> = {
  ADMIN: "morado",
  SUPERVISOR: "azul",
  CAJERO: "verde",
  // Gris, como se veía hasta ahora: los demás tonos ya dicen otra cosa (el rojo
  // es vencido y el ámbar es el repartidor).
  MESERO: "gris",
  REPARTIDOR: "amarillo",
  // El color del negocio: en un salón el profesional es el centro del trabajo.
  PROFESIONAL: "verde",
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
  // "No maneja dinero" va a propósito, como en Android: es la diferencia con el
  // cajero y lo que el dueño tiene que saber antes de darle la cuenta a alguien.
  MESERO: ["Salón y mesas", "Tomar pedidos", "Mandar la cuenta a caja", "No maneja dinero"],
  REPARTIDOR: ["Entregas", "Cobro contra entrega", "Rendición"],
  // Desde PLAN-ROLES R3 el backend se lo hace cumplir: sólo lo suyo, sin
  // cobrar ni configurar. Lo fino (teléfono, agendar) son reglas del negocio.
  PROFESIONAL: ["Ve su agenda y sus clientes", "No cobra"],
};

/**
 * Sólo ADMIN y SUPERVISOR autorizan (anular una venta, fiar por encima del
 * límite), así que sólo ellos llevan PIN, y se lo asigna el ADMIN. Al resto ni
 * se le ofrece: a un mesero se le mostraba "Asignar PIN" y el backend lo
 * rechazaba.
 */
const ROLES_CON_PIN: Rol[] = ["ADMIN", "SUPERVISOR"];

/**
 * Lo que el rol NO hace: va con una cruz neutra y no con la tilde verde, que
 * se leía "✓ No cobra" (QA B-28). El "No maneja dinero" del mesero queda con
 * su tilde de siempre a propósito: es pantalla de Omar y no se toca en un
 * arreglo de belleza.
 */
const NEGACIONES = new Set(["No cobra"]);

type FiltroRol = "todos" | RolApp | "inactivos";

const OPC_ROL = [
  ["todos", "Todos"],
  ["ADMIN", "Administradores"],
  ["SUPERVISOR", "Supervisores"],
  ["CAJERO", "Cajeros"],
  ["MESERO", "Meseros"],
  ["REPARTIDOR", "Repartidores"],
  ["PROFESIONAL", "Profesionales"],
  ["inactivos", "Inactivos"],
] as const satisfies readonly (readonly [FiltroRol, string])[];

/**
 * Plural de una etiqueta del rubro ("Barbero" → "Barberos") para los filtros y
 * las tarjetas. Sólo para las que vienen del perfil: las de siempre ya tienen
 * su plural escrito en `OPC_ROL`. "Recepción" queda igual: es un puesto, no
 * una persona, y "Recepciones" se leería como otra cosa.
 */
function pluralizar(etiqueta: string): string {
  if (/ión$/i.test(etiqueta)) return etiqueta;
  if (/[aeiouáéó]$/i.test(etiqueta)) return `${etiqueta}s`;
  return `${etiqueta}es`;
}

/** El rol del backend puede crecer; lo que no está en la matriz cae en gris. */
function tonoRol(rol: Rol): "morado" | "azul" | "verde" | "amarillo" | "gris" {
  return TONO_ROL[rol as RolApp] ?? "gris";
}

export default function Usuarios() {
  const { incluye, puede, negocio } = useAuth();
  // El PIN sólo existe para autorizar anulaciones de venta.
  const conPin = incluye("autorizacion_pin");
  // Los meseros se cuentan y se filtran sólo donde hay salón: en una farmacia,
  // o en un plan sin mesas, la tarjeta y el filtro dirían siempre cero.
  const conSalon = puede("salon");
  // Lo mismo con el profesional: sólo donde el perfil del rubro lo ofrece.
  const conProfesional = ofreceRol(negocio?.perfil, "PROFESIONAL");
  /**
   * El plural que se muestra en filtros y tarjetas. Si el rubro le pone otro
   * nombre al rol (en un salón el cajero es "Recepción"), se usa ése; si no,
   * el de siempre.
   */
  const pluralRol = (rol: RolApp, deSiempre: string) => {
    const etiqueta = etiquetaRol(rol, negocio);
    return etiqueta === etiquetaRol(rol) ? deSiempre : pluralizar(etiqueta);
  };
  /**
   * ¿Se cuenta y se filtra este rol? Los que el rubro no ofrece no aparecen: en
   * una peluquería no hay repartidores (QA B-20), igual que el selector del
   * alta. El ADMIN siempre, porque existe en todo negocio aunque no se asigne
   * desde acá. Sin `rolesOfrecidos` en el perfil (restaurante, farmacia) son
   * los de siempre.
   */
  const muestraRol = (rol: RolApp) =>
    rol === "ADMIN" ||
    (ofreceRol(negocio?.perfil, rol) && (rol !== "MESERO" || conSalon));
  const opcionesRol = OPC_ROL.filter(
    ([valor]) => valor === "todos" || valor === "inactivos" || muestraRol(valor),
  ).map(([valor, texto]) =>
    valor === "todos" || valor === "inactivos"
      ? ([valor, texto] as const)
      : ([valor, pluralRol(valor, texto)] as const),
  );
  const usuarios = useApi(() => api.getUsuarios(), []);

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

  const lista = usuarios.datos ?? [];

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return lista.filter((u) => {
      if (
        texto &&
        !contiene(u.nombre, texto) &&
        !contiene(u.usuario, texto)
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
      MESERO: 0,
      REPARTIDOR: 0,
      PROFESIONAL: 0,
    };
    for (const u of lista) {
      if (!u.activo) continue;
      if (u.rol in base) base[u.rol as RolApp]++;
    }
    return base;
  }, [lista]);

  const inactivos = lista.filter((u) => !u.activo).length;
  // Con cinco tarjetas van en una fila en pantallas anchas; con seis (salón, o
  // profesionales y repartidores) van en dos filas de tres. Restaurante con
  // salón y farmacia quedan como antes (seis y cinco).
  const tarjetas =
    2 +
    (["SUPERVISOR", "CAJERO", "MESERO", "REPARTIDOR"] as RolApp[]).filter(muestraRol).length +
    (conProfesional ? 1 : 0);

  /** Refresca la lista y deja el detalle mostrando la versión recién guardada. */
  function traerDeVuelta(actualizado: Usuario) {
    setDetalle(actualizado);
    usuarios.recargar();
  }

  /**
   * Quitarle el PIN a un supervisor es sacarle la autorización: como el PIN lo
   * asigna sólo el administrador, él no puede volver a ponérselo.
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

      {/* Con meseros son seis tarjetas, y seis en una fila no entran: a 1280 px
          "ADMINISTRADORES" se montaba sobre su ícono. Van en dos filas de tres;
          con cinco (farmacia, o un salón sin repartidores) en una fila. */}
      <div
        className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${tarjetas === 5 ? "xl:grid-cols-5" : ""}`}
      >
        {/* El ADMIN con la etiqueta del rubro: en belleza es el "Dueño" (B-19). */}
        <Kpi
          etiqueta={pluralRol("ADMIN", "Administradores")}
          valor={String(conteos.ADMIN)}
          icono="lock"
          tono="morado"
        />
        {muestraRol("SUPERVISOR") && (
          <Kpi etiqueta="Supervisores" valor={String(conteos.SUPERVISOR)} icono="users" tono="azul" />
        )}
        {muestraRol("CAJERO") && (
          <Kpi
            etiqueta={pluralRol("CAJERO", "Cajeros")}
            valor={String(conteos.CAJERO)}
            icono="cart"
            tono="verde"
          />
        )}
        {conProfesional && (
          <Kpi
            etiqueta={pluralRol("PROFESIONAL", "Profesionales")}
            valor={String(conteos.PROFESIONAL)}
            icono="calendar"
            tono="verde"
          />
        )}
        {muestraRol("MESERO") && (
          <Kpi etiqueta="Meseros" valor={String(conteos.MESERO)} icono="grid" tono="gris" />
        )}
        {muestraRol("REPARTIDOR") && (
          <Kpi
            etiqueta="Repartidores"
            valor={String(conteos.REPARTIDOR)}
            icono="truck"
            tono="amarillo"
          />
        )}
        <Kpi etiqueta="Inactivos" valor={String(inactivos)} icono="x" tono="gris" />
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Buscador valor={q} onChange={setQ} placeholder="Buscar por nombre o usuario" />
        </div>
        <Chips valor={filtroRol} opciones={opcionesRol} onChange={setFiltroRol} />
      </div>

      <ErrorMsg>{errorAccion || usuarios.error}</ErrorMsg>
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
        onQuitarPin={(u) => setQuitandoPin(u)}
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

function TarjetaUsuario({ usuario: u, onClick }: { usuario: Usuario; onClick: () => void }) {
  const { incluye, negocio } = useAuth();
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
            {conPin && u.tienePin && ROLES_CON_PIN.includes(u.rol) && (
              <Badge tono="azul">PIN</Badge>
            )}
            <Icon name="chevronRight" size={17} color="#94A3B8" />
          </div>
        </div>

        <h3 className="mt-3 truncate text-[15px] font-bold text-texto">{u.nombre}</h3>
        <p className="mt-0.5 truncate text-[13px] text-texto-3">@{u.usuario}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Badge tono={tonoRol(u.rol)}>{etiquetaRol(u.rol, negocio)}</Badge>
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
  onQuitarPin,
  onEstado,
}: {
  usuario: Usuario | null;
  onClose: () => void;
  onEditar: (u: Usuario) => void;
  onPassword: (u: Usuario) => void;
  onPin: (u: Usuario) => void;
  onQuitarPin: (u: Usuario) => void;
  onEstado: (u: Usuario) => void;
  conPin: boolean;
}) {
  const { usuario: actual, negocio } = useAuth();
  if (!u) return null;
  const permisos = PERMISOS_ROL[u.rol as RolApp] ?? [];
  const esRepartidor = u.rol === "REPARTIDOR";
  const esYo = actual?.id === u.id;
  // El PIN sólo sirve para autorizar: sin esa capacidad en el plan no hay nada
  // que autorizar con él. Lo llevan administradores y supervisores, y lo
  // asigna, cambia o quita sólo el administrador.
  const llevaPin = conPin && ROLES_CON_PIN.includes(u.rol);
  const administraPin = llevaPin && actual?.rol === "ADMIN";

  return (
    <Modal
      abierto
      titulo="Detalle del usuario"
      subtitulo={esYo ? `${u.nombre} · tu cuenta` : u.nombre}
      onClose={onClose}
      acciones={
        <>
          {/* Nadie se desactiva a sí mismo: se quedaría sin poder entrar a
              revertirlo, y si es el único ADMIN el negocio queda sin acceso. El
              backend lo impide igual; acá ni se ofrece. */}
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
              <Badge tono={tonoRol(u.rol)}>{etiquetaRol(u.rol, negocio)}</Badge>
              {!u.activo && <Badge tono="gris">Inactivo</Badge>}
              {llevaPin && u.tienePin && <Badge tono="azul">PIN</Badge>}
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
                  {NEGACIONES.has(p) ? (
                    <Icon name="x" size={14} className="text-texto-4" />
                  ) : (
                    <Icon name="check" size={14} color="#059669" />
                  )}
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
          {administraPin && (
            <Boton variante="ghost" icono="pin" onClick={() => onPin(u)}>
              {u.tienePin ? "Cambiar PIN" : "Asignar PIN"}
            </Boton>
          )}
          {administraPin && u.rol === "SUPERVISOR" && u.tienePin && (
            <Boton variante="ghost" icono="x" onClick={() => onQuitarPin(u)}>
              Quitar PIN
            </Boton>
          )}
        </div>
        {/* El supervisor ya no se pone el PIN: se le dice a quién pedírselo en
            vez de esconderle el botón sin explicación. */}
        {llevaPin && !administraPin && esYo && (
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

/**
 * La línea de ayuda debajo del rol. Para los roles de siempre, la de siempre
 * (la misma que la app Android); para uno que la web no tiene escrito (el
 * profesional, o uno nuevo), la descripción que manda el backend.
 */
function resumenRol(rol: RolApp, ofrecido: RolOfrecido | null): string {
  const deSiempre = rol === "PROFESIONAL" ? undefined : PERMISOS_ROL[rol];
  if (deSiempre) return deSiempre.join(" · ");
  return ofrecido?.descripcion ?? "";
}

/**
 * "Qué puede hacer este rol" (PLAN-ROLES §11): los permisos que el backend
 * resolvió para ESTE negocio (ya cruzados con el plan), agrupados por tema.
 * Plegado: está para el que quiere el detalle antes de entregar una cuenta.
 */
function PermisosDelRol({ rol }: { rol: RolOfrecido }) {
  const porDominio = new Map<string, PermisoDeRol[]>();
  for (const p of rol.permisos) {
    porDominio.set(p.dominio, [...(porDominio.get(p.dominio) ?? []), p]);
  }
  return (
    <details className="mt-2 text-xs text-texto-3">
      <summary className="cursor-pointer select-none">
        Qué puede hacer {rol.etiqueta.toLowerCase()}
      </summary>
      <ul className="mt-2 space-y-1">
        {[...porDominio.entries()].map(([dominio, permisos]) => (
          <li key={dominio}>
            <span className="font-medium">{dominio}:</span>{" "}
            {permisos
              .map((p) => (p.alcance === "PROPIO" ? `${p.nombre} (sólo lo suyo)` : p.nombre))
              .join(" · ")}
          </li>
        ))}
      </ul>
    </details>
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
  const { usuario: actual, puede, negocio } = useAuth();
  // El mesero sólo se ofrece donde hay salón: en una farmacia, o con un plan
  // sin mesas, no tendría ninguna pantalla a la que entrar. El profesional,
  // sólo donde el perfil del rubro lo trae (ver `rolesAsignables`).
  const conSalon = puede("salon");
  /**
   * Los roles que el backend dice que este usuario puede asignar en este
   * negocio, con la etiqueta del rubro y sus permisos (PLAN-ROLES §8.2). Si
   * el backend todavía no tiene el endpoint (o falla), la lista de siempre.
   */
  const ofrecidos = useApi(() => api.getRolesOfrecidos().catch(() => null), []);
  const delBackend = ofrecidos.datos ?? null;
  const rolesAsignables: RolApp[] = delBackend
    ? [
        ...delBackend.map((r) => r.codigo as RolApp),
        // El rol que YA tiene se sigue mostrando: si no, editarle el teléfono
        // a un admin le cambiaría el rol sin querer al guardar.
        ...(usuario && !delBackend.some((r) => r.codigo === usuario.rol)
          ? [usuario.rol as RolApp]
          : []),
      ]
    : calcularRolesAsignables({
        rolActual: actual?.rol,
        rolDelUsuario: usuario?.rol,
        conSalon,
        perfil: negocio?.perfil,
      });
  const ofrecido = delBackend?.find((r) => r.codigo === rol) ?? null;
  const etiquetaDe = (r: RolApp) =>
    delBackend?.find((o) => o.codigo === r)?.etiqueta ?? etiquetaRol(r, negocio);
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [telefono, setTelefono] = useState(usuario?.telefono ?? "");
  const [notas, setNotas] = useState(usuario?.notas ?? "");
  const [zona, setZona] = useState(usuario?.zona ?? "");
  const [vehiculo, setVehiculo] = useState(usuario?.vehiculo ?? "");
  const [sucursalId, setSucursalId] = useState<number | null>(usuario?.sucursalId ?? null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const esRepartidor = rol === "REPARTIDOR";

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
   * Al ADMIN tampoco se le pregunta: es el único que ve toda la organización,
   * y por eso no pertenece a ninguna sucursal.
   */
  const esAdmin = rol === "ADMIN";
  const mostrarSucursal = sucursales.length > 1 && !esAdmin;
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

    // "Toda la organización" es del administrador y de nadie más: un cajero sin
    // sucursal vería el negocio entero y vendería del almacén principal estando
    // parado en otro local. El backend lo rechaza igual; el aviso acá evita que
    // se entere después de llenar todo.
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
          rol,
          email: email.trim(),
          telefono: telefono.trim(),
          notas: notas.trim(),
          // Zona y vehículo sólo tienen sentido en un repartidor; si dejó de
          // serlo se limpian para no arrastrar datos de su rol anterior.
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
          rol,
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

        {/* `?? []`: un rol que la web todavía no conoce deja la ayuda vacía en
            vez de tirar la pantalla, que es lo que pasaba con el mesero. */}
        <Campo label="Rol" hint={resumenRol(rol, ofrecido)}>
          <Select value={rol} onChange={(e) => setRol(e.target.value as RolApp)}>
            {rolesAsignables.map((r) => (
              <option key={r} value={r}>
                {etiquetaDe(r)}
              </option>
            ))}
          </Select>
          {ofrecido && ofrecido.permisos.length > 0 && <PermisosDelRol rol={ofrecido} />}
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
              {/* Sin opción "toda la organización": eso es del administrador, y
                  al administrador no se le muestra este campo. Queda un
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
          El PIN autoriza anular ventas y fiar por encima del límite del cliente. Sólo lo
          tienen administradores y supervisores, y lo asigna el administrador.
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
