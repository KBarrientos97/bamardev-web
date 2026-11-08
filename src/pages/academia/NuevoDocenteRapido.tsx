import { useState } from "react";
import { Boton, Campo, ErrorMsg, Input, InputPassword, Select } from "../../components/ui";
import { cargoDeDocente, esUsuarioValido, usuarioSugerido } from "../../lib/academia/docentes";
import type { Docente } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { api } from "../../lib/api";
import { apiPersonal } from "../../lib/personal";
import { mensajeDeError } from "../../lib/roles";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { Interruptor, ResumenPanel } from "./piezas";

/** Lo que se cargó en el alta, para ofrecer mandarle el acceso por WhatsApp (pantalla Docentes). */
export interface AltaDocente {
  telefono: string | null;
  /** El usuario con el que entra; null si quedó sin acceso. */
  username: string | null;
}

/**
 * C9 (auditoría 26-oct): dar de alta a un docente sin salir de «Abrir grupo».
 *
 * Antes eran dos pasos en otra pantalla (Personal: crear con el cargo Docente y
 * su sede, y después «Darle acceso») y, con el instituto vacío, el módulo sólo
 * ofrecía «Elegir después». Acá van en un solo gesto: nombre, WhatsApp, la sede
 * del grupo (fija) y, si se quiere, usuario y clave. Son DOS llamadas del
 * backend (`POST /personal` y `POST /personal/:id/acceso`, la misma de
 * Personal): si la segunda falla, el docente ya existe, queda elegido igual
 * y el aviso dice cómo darle el acceso después, en vez de perder lo cargado.
 *
 * Desde el rediseño de noviembre también es el «+ Nuevo docente» de la
 * pantalla Docentes: ahí no hay grupo, así que la sede se elige (si hay más de
 * una). El usuario se propone con el nombre («Lucía Fernández» → «lucia», con
 * un número si ya existe) y se puede cambiar; la clave la sigue poniendo el
 * admin.
 */
export function NuevoDocenteRapido({
  modulo,
  sede,
  onCreado,
  onCerrar,
}: {
  /** El módulo para el que se da de alta (sólo para el título); sin él, «Nuevo docente». */
  modulo?: string;
  /** La sede del grupo: el docente trabaja ahí. Sin ella, se elige entre las del negocio. */
  sede?: { id: number; nombre: string };
  /** `aviso`: lo que quedó a medias (el acceso). */
  onCreado: (docente: Docente, aviso?: string, alta?: AltaDocente) => void;
  onCerrar: () => void;
}) {
  const p = usePalabras();
  const { usuario } = useAuth();
  // El cargo es un rol del negocio (PLAN-ROLES-NEGOCIO): el del docente, por
  // sus permisos (un «Profesor» también sirve, revisión del 08-nov).
  const cargos = useApi(() => apiPersonal.cargos(), []);
  const cargo = cargoDeDocente(cargos.datos ?? [], p.Docente);
  // Los usuarios que ya existen, para no proponer uno tomado. Si no se pueden
  // leer, se propone igual: el backend rechaza el repetido.
  const gente = useApi(async () => apiPersonal.listar({ incluirInactivos: true }), []);
  const tomados = (gente.datos ?? []).flatMap((x) => (x.acceso?.username ? [x.acceso.username] : []));
  // Sin la sede del grupo, las del negocio (las mismas que ofrece Personal).
  const almacenes = useApi(async () => (sede ? null : api.getSucursales()), [sede == null]);
  const sedes = sede ? [sede] : (almacenes.datos ?? []).filter((a) => a.activo && a.tipo !== "DEPOSITO");

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [sedeElegida, setSedeElegida] = useState("");
  const [conAcceso, setConAcceso] = useState(false);
  /** El usuario escrito a mano; mientras sea null, sigue al nombre. */
  const [usernameEscrito, setUsernameEscrito] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const username = usernameEscrito ?? usuarioSugerido(nombre, tomados);
  const laSede = sede ?? sedes.find((s) => String(s.id) === sedeElegida) ?? (sedes.length === 1 ? sedes[0] : undefined);

  async function guardar() {
    setError("");
    if (!nombre.trim()) return setError("Poné el nombre.");
    if (!laSede && sedes.length > 1) return setError(`Elegí la ${p.sede} donde trabaja.`);
    if (conAcceso) {
      if (!esUsuarioValido(username)) {
        return setError("El usuario lleva 3 a 30 letras, números, punto o guion.");
      }
      if (password.length < 6) return setError("La contraseña necesita al menos 6 caracteres.");
    }
    if (!cargo) {
      return setError(
        cargos.error
          ? "No se pudieron cargar los cargos. Probá de nuevo."
          : `No hay un cargo de ${p.docente} en Roles (uno que pase lista o cargue notas de lo suyo): crealo y volvé a intentar.`,
      );
    }
    setGuardando(true);
    let persona;
    try {
      persona = await apiPersonal.crear({
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        cargoRolId: cargo.id,
        ...(laSede ? { sucursalIds: [laSede.id] } : {}),
      });
    } catch (e) {
      setGuardando(false);
      return setError(mensajeDeError(e, { generico: "No se pudo guardar" }));
    }
    const docente: Docente = {
      personalId: persona.id,
      nombre: persona.nombre,
      sedes: laSede ? [{ id: laSede.id, nombre: laSede.nombre }] : [],
      pctDocente: null,
      retencionPct: null,
      tieneLogin: false,
    };
    const tel = telefono.trim() || null;
    if (!conAcceso) {
      setGuardando(false);
      return onCreado(docente, undefined, { telefono: tel, username: null });
    }
    const user = username.trim().toLowerCase();
    try {
      await apiPersonal.darAcceso(persona.id, {
        username: user,
        password,
        rolId: cargo.id,
        // Quien es de una sede ya la lleva; la dirección elige la del grupo.
        ...(usuario?.sucursalId == null && laSede ? { sucursalId: laSede.id } : {}),
      });
      setGuardando(false);
      onCreado({ ...docente, tieneLogin: true }, undefined, { telefono: tel, username: user });
    } catch (e) {
      setGuardando(false);
      onCreado(
        docente,
        `«${persona.nombre}» quedó guardado, pero sin acceso: ${mensajeDeError(e, { generico: "no se pudo dar el acceso" })} Se lo das desde Personal → Darle acceso.`,
        { telefono: tel, username: null },
      );
    }
  }

  return (
    <ResumenPanel className="mt-3 space-y-3">
      <p className="text-sm font-semibold text-texto">
        Nuevo {p.docente}
        {modulo ? ` · ${modulo}` : ""}
      </p>
      <Campo label="Nombre y apellido">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" autoFocus />
      </Campo>
      <Campo label="WhatsApp" hint="Opcional. Para mandarle el acceso.">
        <Input type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="off" />
      </Campo>
      {sede ? (
        <p className="text-[13px] text-texto-3">
          {p.Sede}: <b className="text-texto-2">{sede.nombre}</b>, la del grupo.
        </p>
      ) : (
        sedes.length > 1 && (
          <Campo label={p.Sede}>
            <Select value={sedeElegida} onChange={(e) => setSedeElegida(e.target.value)}>
              <option value="">Elegí la {p.sede}…</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        )
      )}
      <div className="-my-2">
        <Interruptor
          activo={conAcceso}
          onCambiar={setConAcceso}
          etiqueta="Que pueda entrar al sistema (pasar lista y notas)"
          detalle="Desde su celular. Ocupa un lugar del cupo de usuarios."
        />
      </div>
      {conAcceso && (
        <div className="space-y-1.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Usuario">
              <Input value={username} onChange={(e) => setUsernameEscrito(e.target.value)} autoComplete="off" autoCapitalize="none" />
            </Campo>
            <Campo label="Contraseña">
              <InputPassword value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </Campo>
          </div>
          <p className="text-xs text-texto-4">El usuario sale del nombre y lo podés cambiar. La contraseña la ponés vos y se la pasás aparte.</p>
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
