import { useState } from "react";
import { Boton, Campo, ErrorMsg, Input, InputPassword } from "../../components/ui";
import type { Docente } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { apiPersonal } from "../../lib/personal";
import { mensajeDeError } from "../../lib/roles";
import { normalizar } from "../../lib/texto";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { Interruptor, ResumenPanel } from "./piezas";

/**
 * C9 (auditoría 26-oct): dar de alta a un docente sin salir de «Abrir grupo».
 *
 * Antes eran dos pasos en otra pantalla (Personal: crear con el cargo Docente y
 * su sede, y después «Darle acceso») y, con el instituto vacío, el módulo sólo
 * ofrecía «Elegir después». Acá van en un solo gesto: nombre, teléfono, la sede
 * del grupo (fija) y, si se quiere, usuario y clave. Son DOS llamadas del
 * backend (`POST /personal` y `POST /personal/:id/acceso`, la misma de
 * Personal): si la segunda falla, el docente ya existe, queda elegido igual
 * y el aviso dice cómo darle el acceso después, en vez de perder lo cargado.
 */
export function NuevoDocenteRapido({
  modulo,
  sede,
  onCreado,
  onCerrar,
}: {
  /** El módulo para el que se da de alta (sólo para el título). */
  modulo: string;
  /** La sede del grupo: el docente trabaja ahí. */
  sede: { id: number; nombre: string };
  /** `aviso`: lo que quedó a medias (el acceso). */
  onCreado: (docente: Docente, aviso?: string) => void;
  onCerrar: () => void;
}) {
  const p = usePalabras();
  const { usuario } = useAuth();
  // El cargo es un rol del negocio (PLAN-ROLES-NEGOCIO): se busca el del docente.
  const cargos = useApi(() => apiPersonal.cargos(), []);
  const cargo = (cargos.datos ?? []).find((c) => [normalizar(p.Docente), "docente"].includes(normalizar(c.nombre)));

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [conAcceso, setConAcceso] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError("");
    if (!nombre.trim()) return setError("Poné el nombre.");
    if (conAcceso) {
      if (!/^[a-z0-9._-]{3,30}$/.test(username.trim().toLowerCase())) {
        return setError("El usuario lleva 3 a 30 letras, números, punto o guion.");
      }
      if (password.length < 6) return setError("La contraseña necesita al menos 6 caracteres.");
    }
    if (!cargo) {
      return setError(
        cargos.error
          ? "No se pudieron cargar los cargos. Probá de nuevo."
          : `No hay un cargo «${p.Docente}» en Roles: crealo y volvé a intentar.`,
      );
    }
    setGuardando(true);
    let persona;
    try {
      persona = await apiPersonal.crear({
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        cargoRolId: cargo.id,
        sucursalIds: [sede.id],
      });
    } catch (e) {
      setGuardando(false);
      return setError(mensajeDeError(e, { generico: "No se pudo guardar" }));
    }
    const docente: Docente = {
      personalId: persona.id,
      nombre: persona.nombre,
      sedes: [{ id: sede.id, nombre: sede.nombre }],
      pctDocente: null,
      retencionPct: null,
      tieneLogin: false,
    };
    if (!conAcceso) {
      setGuardando(false);
      return onCreado(docente);
    }
    try {
      await apiPersonal.darAcceso(persona.id, {
        username: username.trim().toLowerCase(),
        password,
        rolId: cargo.id,
        // Quien es de una sede ya la lleva; la dirección elige la del grupo.
        ...(usuario?.sucursalId == null ? { sucursalId: sede.id } : {}),
      });
      setGuardando(false);
      onCreado({ ...docente, tieneLogin: true });
    } catch (e) {
      setGuardando(false);
      onCreado(
        docente,
        `«${persona.nombre}» quedó guardado, pero sin acceso: ${mensajeDeError(e, { generico: "no se pudo dar el acceso" })} Se lo das desde Personal → Darle acceso.`,
      );
    }
  }

  return (
    <ResumenPanel className="mt-3 space-y-3">
      <p className="text-sm font-semibold text-texto">
        Nuevo {p.docente} · {modulo}
      </p>
      <Campo label="Nombre">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" autoFocus />
      </Campo>
      <Campo label="Teléfono" hint="Opcional.">
        <Input type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="off" />
      </Campo>
      <p className="text-[13px] text-texto-3">
        {p.Sede}: <b className="text-texto-2">{sede.nombre}</b>, la del grupo.
      </p>
      <div className="-my-2">
        <Interruptor
          activo={conAcceso}
          onCambiar={setConAcceso}
          etiqueta="Darle acceso al sistema"
          detalle="Para que pase lista y cargue notas desde su celular. Ocupa un lugar del cupo de usuarios."
        />
      </div>
      {conAcceso && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Usuario">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
          </Campo>
          <Campo label="Contraseña">
            <InputPassword value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Campo>
        </div>
      )}
      <ErrorMsg>{error}</ErrorMsg>
      <div className="flex flex-wrap gap-2">
        <Boton onClick={() => void guardar()} disabled={guardando || cargos.cargando}>
          {guardando ? "Guardando…" : `Guardar ${p.docente}`}
        </Boton>
        <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </Boton>
      </div>
    </ResumenPanel>
  );
}
