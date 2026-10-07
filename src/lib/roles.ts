import { ApiError, request } from "./api";
import type {
  Alcance,
  DominioPermisos,
  EventoRol,
  PermisoDeRol,
  PermisoDeRolVista,
  RolInput,
  RolNegocio,
} from "../types";

/**
 * Roles del negocio (PLAN-ROLES-NEGOCIO §8): cada negocio crea, renombra,
 * edita y borra los suyos. Contrato de `/roles` del backend.
 */

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const apiRoles = {
  /** Los roles activos, con cuántos usuarios y personas los tienen. */
  listar: () => request<RolNegocio[]>("/roles"),
  /** Los que quien está mirando puede asignar (nunca más de lo que él tiene). */
  asignables: () => request<RolNegocio[]>("/roles/asignables"),
  /** Todos los permisos, por dominio, con lo que el plan incluye y hasta dónde el actor los puede dar. */
  catalogo: () => request<DominioPermisos[]>("/roles/catalogo"),
  crear: (input: RolInput & { nombre: string }) =>
    request<RolNegocio>("/roles", { method: "POST", body: json(input) }),
  editar: (id: number, input: RolInput) =>
    request<RolNegocio>(`/roles/${id}`, { method: "PATCH", body: json(input) }),
  /** Borrado lógico. Con usuarios o personal, `reasignarA` es obligatorio (409 si falta). */
  borrar: (id: number, reasignarA?: number) =>
    request<unknown>(`/roles/${id}`, {
      method: "DELETE",
      body: json(reasignarA != null ? { reasignarA } : {}),
    }),
  bitacora: () => request<EventoRol[]>("/roles/bitacora"),
  bitacoraDe: (id: number) => request<EventoRol[]>(`/roles/${id}/bitacora`),
};

/**
 * Los permisos "de ejecutor": el trabajo de una persona (repartir lo suyo,
 * cobrar sus mesas, agendar o bloquear lo suyo). El Administrador no los
 * recibe: los cubre con la versión general, y con ellos la web lo trataría
 * como repartidor o mesero (`cubiertoPor` en catalogo.ts del backend).
 */
export const PERMISOS_DE_EJECUTOR = [
  "entregas.realizar",
  "salon.cobrar_mesero",
  "agenda.crear_propias",
  "agenda.bloquear_propias",
];

/**
 * ¿El negocio puede usar este permiso? (plan + rubro + feature, lo calcula el
 * backend). Sin el campo, sí: así lee igual un backend anterior al 07-oct y
 * `/personal/cargos`, que no lo manda.
 */
export function esDisponible(p: { disponible?: boolean }): boolean {
  return p.disponible !== false;
}

/**
 * Lo que el rol de verdad permite en ESTE negocio (QA R1 W-02/W-03): las
 * plantillas por rubro pueden traer permisos de otras verticales (la agenda o
 * las mesas en una ferretería), que el rol guarda pero nadie usa. Todo lo que
 * cuenta o dice "qué puede hacer" sale de acá, no de `permisos` crudo.
 */
export function permisosEfectivos<P extends { disponible?: boolean }>(rol: { permisos: P[] }): P[] {
  return rol.permisos.filter(esDisponible);
}

/** Cuántos permisos efectivos tiene: el número del backend, o contados acá. */
export function cantidadPermisos(rol: Pick<RolNegocio, "permisos" | "permisosDisponibles">): number {
  return rol.permisosDisponibles ?? permisosEfectivos(rol).length;
}

/**
 * ¿Quien tenga este rol entra y no ve nada? (QA R1 W-10). El Administrador
 * nunca: tiene todo lo del plan.
 */
export function rolSinPermisos(rol: Pick<RolNegocio, "esAdministrador" | "permisos" | "permisosDisponibles"> | null | undefined): boolean {
  return !!rol && !rol.esAdministrador && cantidadPermisos(rol) === 0;
}

/** Aviso al dar un rol sin permisos: entra, no ve nada y ocupa cupo. */
export const AVISO_ROL_SIN_PERMISOS = "Este rol no tiene permisos: la persona no va a ver nada.";

/**
 * ¿El rol trae este permiso, y el negocio lo puede usar? El Administrador,
 * todos menos los de ejecutor.
 */
export function rolTiene(rol: Pick<RolNegocio, "esAdministrador" | "permisos"> | null | undefined, codigo: string) {
  if (!rol) return false;
  if (rol.esAdministrador) return !PERMISOS_DE_EJECUTOR.includes(codigo);
  return permisosEfectivos(rol).some((p) => p.codigo === codigo);
}

/**
 * ¿Quien tenga este rol ve sólo su agenda? (el profesional, se llame como se
 * llame): `agenda.ver` sólo sobre lo suyo y sin gestionar la de todos.
 */
export function veSoloSuAgendaRol(rol: RolNegocio | null | undefined): boolean {
  if (!rol || rol.esAdministrador) return false;
  const ver = permisosEfectivos(rol).find((p) => p.codigo === "agenda.ver");
  return ver?.alcance === "PROPIO" && !rolTiene(rol, "agenda.gestionar");
}

/** Nombre y dominio de cada permiso, sacados del catálogo. */
export type NombresPermisos = Map<string, { nombre: string; dominio: string }>;

export function nombresDelCatalogo(catalogo: DominioPermisos[] | null | undefined): NombresPermisos {
  const mapa: NombresPermisos = new Map();
  for (const d of catalogo ?? []) {
    for (const p of d.permisos) mapa.set(p.codigo, { nombre: p.nombre, dominio: d.nombre || d.dominio });
  }
  return mapa;
}

/** Un permiso de rol con o sin su nombre (los de `/personal/cargos` vienen sin). */
type PermisoConNombre = PermisoDeRol & Partial<Pick<PermisoDeRolVista, "nombre" | "dominio">>;

/**
 * Los permisos de un rol agrupados por dominio, con su nombre. El nombre sale
 * del propio permiso (`GET /roles` lo manda), si no del catálogo, y como
 * último recurso del código ("ventas.vender"): mejor un código que un renglón
 * vacío.
 */
export function agruparPorDominio(
  permisos: PermisoConNombre[],
  nombres: NombresPermisos,
): { dominio: string; permisos: (PermisoDeRol & { nombre: string })[] }[] {
  const grupos = new Map<string, (PermisoDeRol & { nombre: string })[]>();
  for (const p of permisos) {
    const delCatalogo = nombres.get(p.codigo);
    const dominio = p.dominio ?? delCatalogo?.dominio ?? "Otros";
    const nombre = p.nombre ?? delCatalogo?.nombre ?? p.codigo;
    grupos.set(dominio, [...(grupos.get(dominio) ?? []), { ...p, nombre }]);
  }
  return [...grupos.entries()].map(([dominio, lista]) => ({ dominio, permisos: lista }));
}

/** "1 permiso", "Sin permisos", "12 permisos": lo que el rol de verdad permite. */
export function textoCantidadPermisos(rol: Pick<RolNegocio, "esAdministrador" | "permisos" | "permisosDisponibles">): string {
  if (rol.esAdministrador) return "Todos los permisos";
  const n = cantidadPermisos(rol);
  return n === 0 ? "Sin permisos" : plural(n, "permiso", "permisos");
}

/** Texto de la cantidad de gente de un rol: "3 usuarios · 1 en personal". */
export function resumenGente(rol: Pick<RolNegocio, "usuarios" | "personal">): string {
  const partes = [plural(rol.usuarios, "usuario", "usuarios")];
  // Las personas sin login (el ayudante con el rol como cargo) cuentan aparte:
  // también hay que reasignarlas antes de borrar el rol.
  if (rol.personal > 0) partes.push(`${rol.personal} en personal`);
  return partes.join(" · ");
}

/**
 * Tonos para las etiquetas de rol. El Administrador va siempre en morado (el
 * mismo que tenía el ADMIN); el resto, por su lugar en la lista, así un mismo
 * rol tiene el mismo color en la tarjeta y en el filtro.
 */
const TONOS = ["azul", "verde", "amarillo", "gris"] as const;
export type TonoRol = "morado" | (typeof TONOS)[number];

export function tonoDeRol(rol: Pick<RolNegocio, "id" | "esAdministrador"> | null | undefined, roles: RolNegocio[]): TonoRol {
  if (!rol) return "gris";
  if (rol.esAdministrador) return "morado";
  const resto = roles.filter((r) => !r.esAdministrador);
  const i = resto.findIndex((r) => r.id === rol.id);
  return i < 0 ? "gris" : TONOS[i % TONOS.length];
}

const ALCANCE_TEXTO: Record<Alcance, string> = { GENERAL: "general", PROPIO: "sólo lo suyo" };

/**
 * Quién hizo un cambio, como se lee en la bitácora (QA R1 W-06). Lo que hizo
 * la migración o el alta (`origen: SISTEMA`, sin autor) es del "Sistema", no
 * de "Alguien": el dueño tiene que saber que no lo tocó nadie de su equipo.
 * Sin `origen` (backend viejo), un evento sin autor también es del sistema.
 */
export function autorDelEvento(e: Pick<EventoRol, "origen" | "porSoporte" | "autor">): string {
  if (e.origen === "SISTEMA") return "Sistema";
  if (e.origen === "SOPORTE" || e.porSoporte) return "Soporte de BamarDev";
  if (e.autor?.nombre) return e.autor.nombre;
  return e.origen === "NEGOCIO" ? "Alguien del equipo" : "Sistema";
}

/** Una descripción en la bitácora: entre comillas, o "sin descripción". */
const textoDescripcion = (d: string | null | undefined) => (d?.trim() ? `«${d.trim()}»` : "sin descripción");

/**
 * El detalle de un evento de la bitácora, en renglones legibles. El backend
 * lo guarda como objeto (§8.1); los permisos se nombran con el catálogo si
 * está a mano, si no por su código. Un detalle viejo en texto sale tal cual.
 */
export function renglonesDetalle(
  evento: Pick<EventoRol, "detalle" | "motivo"> & Partial<Pick<EventoRol, "accion">>,
  nombres: NombresPermisos,
): string[] {
  const d = evento.detalle as EventoRol["detalle"] | string;
  const nombre = (codigo: string) => nombres.get(codigo)?.nombre ?? codigo;
  const lista = (ps: PermisoDeRol[]) =>
    ps.map((p) => (p.alcance === "PROPIO" ? `${nombre(p.codigo)} (sólo lo suyo)` : nombre(p.codigo))).join(", ");
  const renglones: string[] = [];
  if (typeof d === "string") {
    if (d.trim()) renglones.push(d);
  } else if (d && evento.accion === "DESCRIPCION") {
    // `{ de, a }` acá son descripciones, no nombres: cualquiera puede ser null.
    renglones.push(`${textoDescripcion(d.de)} → ${textoDescripcion(d.a)}`);
  } else if (d) {
    if (d.de != null && d.a != null) renglones.push(`${d.de} → ${d.a}`);
    // Los eventos viejos traían la descripción dentro del RENOMBRAR.
    if (d.descripcion) {
      renglones.push(`Descripción: ${textoDescripcion(d.descripcion.de)} → ${textoDescripcion(d.descripcion.a)}`);
    }
    if (d.agregados?.length) renglones.push(`Agregó: ${lista(d.agregados)}`);
    if (d.quitados?.length) renglones.push(`Quitó: ${lista(d.quitados)}`);
    for (const c of d.cambiados ?? []) {
      renglones.push(`${nombre(c.codigo)}: ${ALCANCE_TEXTO[c.de]} → ${ALCANCE_TEXTO[c.a]}`);
    }
    if (d.reasignadoA) renglones.push(`Su gente pasó a ${d.reasignadoA.nombre}`);
  }
  if (evento.motivo?.trim()) renglones.push(`Motivo: ${evento.motivo.trim()}`);
  return renglones;
}

/**
 * Los rechazos del backend, en palabras del dueño (contrato §8). Sirve para
 * la pantalla de Roles y para todo lo que asigna un rol (Usuarios, Personal).
 * `nombres` (del catálogo) nombra los permisos de PERMISO_NO_OTORGABLE; sin
 * él, queda el mensaje del backend, que ya los nombra.
 */
export function mensajeDeError(
  e: unknown,
  opciones: { nombres?: NombresPermisos; generico?: string } = {},
): string {
  const generico = opciones.generico ?? "No se pudo guardar";
  if (e instanceof ApiError) {
    const d = e.detalle;
    switch (e.codigo) {
      case "NOMBRE_REPETIDO":
        return "Ya hay un rol con ese nombre.";
      case "PERMISO_NO_OTORGABLE": {
        const codigos = Array.isArray(d.permisos) ? (d.permisos as unknown[]).map(String) : [];
        const conNombre = codigos.map((c) => opciones.nombres?.get(c)?.nombre).filter(Boolean);
        if (codigos.length && conNombre.length === codigos.length) {
          return `No podés dar lo que no tenés: ${conNombre.join(", ")}.`;
        }
        return e.message || "Hay permisos que no tenés: no los podés dar.";
      }
      case "ROL_BLOQUEADO":
        return "El Administrador no se edita ni se borra.";
      case "REASIGNAR_REQUERIDO": {
        const usuarios = Number(d.usuarios) || 0;
        const personal = Number(d.personal) || 0;
        const partes = [
          usuarios ? plural(usuarios, "usuario", "usuarios") : "",
          personal ? plural(personal, "persona", "personas") + " de Personal" : "",
        ].filter(Boolean);
        return partes.length
          ? `El rol lo tienen ${partes.join(" y ")}: elegí a qué rol pasan.`
          : "El rol tiene gente: elegí a qué rol pasarla.";
      }
      // Al asignar o reasignar un rol con más permisos que los de quien lo hace.
      case "ROL_NO_ASIGNABLE":
        return "No podés asignar ese rol: tiene permisos que vos no tenés.";
      // El rol se borró mientras el formulario estaba abierto.
      case "ROL_INVALIDO":
        return "Ese rol ya no existe. Recargá la página y elegí otro.";
    }
  }
  return e instanceof Error && e.message ? e.message : generico;
}
