import type { CargoRol } from "../personal";
import { normalizar } from "../texto";

/**
 * Los permisos que hacen docente a un cargo, con alcance PROPIO (sólo sus
 * grupos): los del rol Docente de la plantilla de la academia. Copia de
 * `PERMISOS_DE_DOCENTE` del backend (`academia/grupos.service.ts`), que con el
 * mismo criterio arma la lista de docentes de «Abrir grupo». La Coordinación
 * los tiene GENERAL: administra, no dicta.
 */
export const PERMISOS_DE_DOCENTE = ["asistencia.registrar", "notas.registrar"];

/** ¿El cargo es de docente? Por sus permisos, no por cómo se llama. */
export function esCargoDocente(cargo: Pick<CargoRol, "permisos" | "esAdministrador">): boolean {
  return !cargo.esAdministrador && cargo.permisos.some((p) => PERMISOS_DE_DOCENTE.includes(p.codigo) && p.alcance === "PROPIO");
}

/**
 * El cargo con que se da de alta a un docente (alta rápida de «Abrir grupo» y
 * el cargo propuesto en Personal). Revisión del 08-nov: antes se buscaba por el
 * nombre «Docente» y un rol renombrado o creado como «Profesor» hacía fallar el
 * alta rápida. Ahora va por permisos (`esCargoDocente`); entre varios, el que
 * se llama como el docente del instituto (o «Docente»). Si ninguno tiene esos
 * permisos, queda el de antes: el que se llama así.
 */
export function cargoDeDocente<C extends Pick<CargoRol, "nombre" | "permisos" | "esAdministrador">>(
  cargos: C[],
  palabraDocente: string,
): C | undefined {
  const nombres = [normalizar(palabraDocente), "docente"];
  const porNombre = (c: C) => nombres.includes(normalizar(c.nombre));
  const docentes = cargos.filter(esCargoDocente);
  return docentes.find(porNombre) ?? docentes[0] ?? cargos.find(porNombre);
}

// ── Alta y acceso del docente (rediseño de noviembre) ───────────────────────

/** Lo que acepta el backend como usuario (`/^[a-z0-9._-]{3,30}$/`, el de Personal). */
const USUARIO_VALIDO = /^[a-z0-9._-]{3,30}$/;

/**
 * El usuario que se le propone a un docente nuevo: su primer nombre, en
 * minúsculas y sin tildes ni espacios («Lucía Fernández» → «lucia»). Si ese ya
 * lo tiene alguien, con un número («lucia2», «lucia3»…). Con un nombre muy
 * corto («Al Paz») va el nombre entero pegado («alpaz»). El admin lo puede
 * cambiar: es sólo la propuesta, el backend igual rechaza uno repetido.
 */
export function usuarioSugerido(nombre: string, tomados: readonly string[] = []): string {
  const palabras = nombre
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .toLowerCase()
    .split(/\s+/)
    .map((x) => x.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  if (!palabras.length) return "";
  let base = palabras[0];
  if (base.length < 3) base = palabras.join("");
  base = base.slice(0, 28);
  const usados = new Set(tomados.map((t) => t.toLowerCase()));
  if (!usados.has(base)) return base;
  for (let n = 2; ; n++) if (!usados.has(`${base}${n}`)) return `${base}${n}`;
}

/** ¿Tiene la forma de un usuario del alta? */
export function esUsuarioValido(usuario: string): boolean {
  return USUARIO_VALIDO.test(usuario.trim().toLowerCase());
}

/**
 * El WhatsApp de la tarjeta, con los dígitos del medio tapados («+591 704•••86»):
 * la lista de docentes se mira en la recepción, con gente alrededor.
 */
export function telefonoOculto(raw: string | null | undefined): string {
  const digitos = (raw ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  const local = digitos.startsWith("591") && digitos.length >= 11 ? digitos.slice(3) : digitos;
  const tapado = local.length > 5 ? `${local.slice(0, 3)}${"•".repeat(local.length - 5)}${local.slice(-2)}` : local;
  return `+591 ${tapado}`;
}

/**
 * El enlace que le llega al docente: abre el login con el negocio y su usuario
 * ya puestos (`?negocio=` y `?usuario=`, los que lee `aliasDeLaUrl`) y, al
 * entrar, sus clases. Nunca la clave: esa se la da el admin aparte.
 */
export function enlaceAccesoDocente(origen: string, alias: string | null | undefined, usuario: string): string {
  const params = new URLSearchParams();
  if (alias) params.set("negocio", alias);
  params.set("usuario", usuario);
  return `${origen}/academia/mis-clases?${params.toString()}`;
}

/** El mensaje de WhatsApp con el acceso: el enlace y el usuario, sin la clave. */
export function mensajeAccesoDocente(o: { nombre: string; negocio?: string | null; enlace: string; usuario: string }): string {
  const primero = o.nombre.trim().split(/\s+/)[0] || o.nombre;
  const donde = o.negocio ? ` de ${o.negocio}` : "";
  return `Hola ${primero}, ya podés entrar al sistema${donde} para pasar lista y cargar notas desde tu celular: ${o.enlace} · Tu usuario es «${o.usuario}». La contraseña te la paso aparte.`;
}
