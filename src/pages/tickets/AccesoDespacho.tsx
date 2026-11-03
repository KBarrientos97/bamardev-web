import { useEffect, useState } from "react";
import { AvisoOk, Badge, Boton, Campo, Confirmar, ErrorMsg, Input, InputPassword, Modal, Select, useAviso } from "../../components/ui";
import { api } from "../../lib/api";
import { apiAccesosDespacho, type AccesoDespacho as Acceso } from "../../lib/apiAccesosDespacho";
import { tiempoRelativo } from "../../lib/format";
import { svgDeQr, textoEnlace } from "../../lib/pagina/qr";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { Tarjeta } from "./piezas";

/**
 * Despacho en otro equipo (extra `tickets_pedido`, Kevin 29-oct): la cuenta
 * con la que la tablet de la cocina —o cualquier equipo— entra SÓLO a
 * Despacho.
 *
 * Quien despacha no siempre es la cajera, y darle un usuario de verdad
 * gastaba un lugar del plan para alguien que sólo marca pedidos. Esta cuenta
 * entra por el login de siempre pero sólo ve Despacho, y no ocupa lugar. Uno
 * por local: varios equipos pueden usarlo a la vez.
 *
 * Vive acá, al lado del enlace de la TV, y no en Usuarios: es una pieza del
 * despacho, no una persona del equipo, y en Usuarios entorpecía (Kevin). El
 * QR abre el login con el negocio y el usuario ya puestos: en la tablet sólo
 * se escribe la contraseña.
 */
export default function AccesoDespacho() {
  const { usuario: actor, negocio } = useAuth();
  const accesos = useApi(() => apiAccesosDespacho.listar(), []);
  const almacenes = useApi(() => api.getAlmacenes(), []);
  const [creando, setCreando] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState<Acceso | null>(null);
  const [apagando, setApagando] = useState<Acceso | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso();

  const lista = accesos.datos ?? [];
  // Sólo las sucursales activas: un depósito no despacha pedidos.
  const locales = (almacenes.datos ?? []).filter((a) => a.tipo !== "DEPOSITO" && a.activo);
  const conAcceso = new Set(lista.map((a) => a.sucursalId));
  // Quien es de un local lo crea sólo para el suyo (el servidor igual lo fuerza).
  const sinAcceso = locales.filter(
    (l) => !conAcceso.has(l.id) && (actor?.sucursalId == null || l.id === actor.sucursalId),
  );
  // Sin la lista de locales (todavía cargando, o un error), uno solo.
  const puedeCrear = !accesos.cargando && (locales.length ? sinAcceso.length > 0 : lista.length === 0);
  const variosLocales = locales.length > 1;

  async function cambiarEstado(a: Acceso, activo: boolean) {
    setError("");
    setEnCurso(true);
    try {
      await apiAccesosDespacho.cambiarEstado(a.id, activo);
      setApagando(null);
      setAviso(activo ? "Acceso prendido: ya se puede entrar." : "Acceso apagado: los equipos que estaban adentro salieron.");
      accesos.recargar();
    } catch (err) {
      setApagando(null);
      setError(err instanceof Error ? err.message : "No se pudo cambiar el acceso");
    } finally {
      setEnCurso(false);
    }
  }

  return (
    <Tarjeta titulo="Despacho en otro equipo">
      <p className="text-[13px] text-texto-2">
        Para la tablet de la cocina o quien entrega los pedidos: entra sólo a Despacho.{" "}
        <b className="font-semibold text-texto">No ocupa lugar de usuario.</b>
      </p>

      <ErrorMsg>{error || accesos.error}</ErrorMsg>
      <AvisoOk>{aviso}</AvisoOk>

      {lista.map((a) => (
        <FichaAcceso
          key={a.id}
          acceso={a}
          enlace={enlaceDespacho(window.location.origin, negocio?.alias, a.usuario)}
          local={variosLocales ? a.sucursal : null}
          enCurso={enCurso}
          onClave={() => setCambiandoClave(a)}
          onApagar={() => setApagando(a)}
          onPrender={() => void cambiarEstado(a, true)}
        />
      ))}

      {puedeCrear && (
        <Boton
          icono="plus"
          variante={lista.length ? "ghost" : "primary"}
          className="mt-3 w-full"
          onClick={() => setCreando(true)}
        >
          {lista.length ? "Para otro local" : "Crear acceso"}
        </Boton>
      )}

      {creando && (
        <FormCrear
          locales={variosLocales ? sinAcceso : []}
          onClose={() => setCreando(false)}
          onCreado={() => {
            setCreando(false);
            setAviso("Acceso creado: escaneá el QR con la tablet y entrá con la contraseña.");
            accesos.recargar();
          }}
        />
      )}
      {cambiandoClave && (
        <FormClave
          acceso={cambiandoClave}
          onClose={() => setCambiandoClave(null)}
          onGuardado={() => {
            setCambiandoClave(null);
            setAviso("Contraseña cambiada: los equipos que estaban adentro tienen que entrar con la nueva.");
          }}
        />
      )}
      <Confirmar
        abierto={!!apagando}
        titulo="Apagar el acceso de despacho"
        texto={`"${apagando?.usuario}" no va a poder entrar, y los equipos que estaban adentro salen ahora. Lo podés prender cuando quieras.`}
        etiquetaOk="Apagar"
        peligroso
        procesando={enCurso}
        onCancel={() => setApagando(null)}
        onOk={() => apagando && void cambiarEstado(apagando, false)}
      />
    </Tarjeta>
  );
}

/**
 * El enlace del QR: Despacho, con el negocio y el usuario para el login
 * (`?negocio=` y `?usuario=`, ver `aliasDeLaUrl`). Sin el alias en la sesión,
 * sólo el usuario: el negocio se escribe a mano.
 */
function enlaceDespacho(origen: string, alias: string | undefined, usuario: string): string {
  const params = new URLSearchParams();
  if (alias) params.set("negocio", alias);
  params.set("usuario", usuario);
  return `${origen}/despacho?${params.toString()}`;
}

function FichaAcceso({
  acceso: a,
  enlace,
  local,
  enCurso,
  onClave,
  onApagar,
  onPrender,
}: {
  acceso: Acceso;
  enlace: string;
  /** El local, sólo si el negocio tiene varios. */
  local: string | null;
  enCurso: boolean;
  onClave: () => void;
  onApagar: () => void;
  onPrender: () => void;
}) {
  const [svg, setSvg] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    svgDeQr(enlace)
      .then((s) => vivo && setSvg(s))
      .catch(() => vivo && setSvg(""));
    return () => {
      vivo = false;
    };
  }, [enlace]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setError("No se pudo copiar: seleccioná el enlace y copialo a mano.");
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-borde p-3">
      {local && <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-texto-3">{local}</p>}
      <div className="flex gap-3">
        <div
          className={`h-24 w-24 shrink-0 rounded-lg bg-white p-1.5 ring-1 ring-borde ${a.activo ? "" : "opacity-40"}`}
          role="img"
          aria-label="QR para entrar a Despacho"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-texto">
            @{a.usuario}
            {!a.activo && <Badge tono="gris">Apagado</Badge>}
          </p>
          <p className="mt-0.5 text-[12px] text-texto-3">
            {a.ultimoLogin ? `Último ingreso ${tiempoRelativo(a.ultimoLogin).toLowerCase()}` : "Todavía no entró"}
          </p>
          <p className="mt-1.5 text-[12px] leading-snug text-texto-3">
            Escaneá el QR con la tablet: abre el login con el negocio y el usuario puestos. Sólo falta la contraseña.
          </p>
        </div>
      </div>
      <p className="mt-2 break-all rounded-lg bg-muted px-2.5 py-2 font-mono text-[12px] text-texto-2">
        {textoEnlace(enlace)}
      </p>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Boton variante="ghost" icono={copiado ? "check" : "copiar"} onClick={() => void copiar()}>
          {copiado ? "Copiado" : "Copiar enlace"}
        </Boton>
        <Boton variante="ghost" icono="key" onClick={onClave}>
          Contraseña
        </Boton>
      </div>
      <button
        type="button"
        disabled={enCurso}
        onClick={a.activo ? onApagar : onPrender}
        className="mt-2 text-[12px] font-semibold text-texto-3 underline-offset-2 hover:text-texto hover:underline"
      >
        {a.activo ? "Apagar el acceso" : "Prender el acceso"}
      </button>
    </div>
  );
}

/** Usuario y contraseña con las reglas del alta de usuarios; el local, sólo con varios. */
function FormCrear({
  locales,
  onClose,
  onCreado,
}: {
  locales: { id: number; nombre: string }[];
  onClose: () => void;
  onCreado: (a: Acceso) => void;
}) {
  const [usuario, setUsuario] = useState("despacho");
  const [password, setPassword] = useState("");
  const [repetir, setRepetir] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [sucursalId, setSucursalId] = useState<number | null>(locales.length === 1 ? locales[0].id : null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError("");
    const limpio = usuario.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(limpio)) {
      return setError("El usuario necesita al menos 3 caracteres: letras, números, punto, guion o guion bajo.");
    }
    if (password.length < 6) return setError("La contraseña necesita al menos 6 caracteres.");
    if (password !== repetir) return setError("Las dos contraseñas no coinciden.");
    if (locales.length > 1 && sucursalId == null) return setError("Elegí el local que despacha.");

    setGuardando(true);
    try {
      const creado = await apiAccesosDespacho.crear({
        username: limpio,
        password,
        ...(sucursalId != null ? { sucursalId } : {}),
      });
      onCreado(creado);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el acceso");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Crear acceso de despacho"
      subtitulo="Entra sólo a Despacho y no ocupa lugar de usuario"
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton icono="save" onClick={guardar} disabled={guardando}>
            {guardando ? "Creando…" : "Crear"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo label="Usuario" hint="Con éste se entra en el equipo de despacho">
          <Input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="off" autoFocus />
        </Campo>
        <Campo label="Contraseña" hint="Mínimo 6 caracteres">
          <InputPassword
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            visible={verPassword}
            onCambiarVisible={setVerPassword}
            autoComplete="new-password"
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
        {locales.length > 1 && (
          <Campo label="Local" hint="Despacho ve los pedidos de este local">
            <Select
              value={sucursalId ?? ""}
              onChange={(e) => setSucursalId(e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">Elegí un local…</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

function FormClave({ acceso, onClose, onGuardado }: { acceso: Acceso; onClose: () => void; onGuardado: () => void }) {
  const [password, setPassword] = useState("");
  const [repetir, setRepetir] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError("");
    if (password.length < 6) return setError("La contraseña necesita al menos 6 caracteres.");
    if (password !== repetir) return setError("Las dos contraseñas no coinciden.");
    setGuardando(true);
    try {
      await apiAccesosDespacho.cambiarPassword(acceso.id, password);
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
      subtitulo={`Acceso de despacho · @${acceso.usuario}`}
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
        <Campo label="Nueva contraseña" hint="Los equipos que estaban adentro salen y entran con ésta">
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
