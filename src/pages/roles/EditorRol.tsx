import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Campo, ErrorMsg, Input, Modal } from "../../components/ui";
import { apiRoles, mensajeDeError, nombresDelCatalogo } from "../../lib/roles";
import type { Alcance, DominioPermisos, PermisoCatalogo, RolNegocio } from "../../types";
import BitacoraRoles from "./BitacoraRoles";

/**
 * Crear, renombrar y editar los permisos de un rol. El Administrador se abre
 * igual, pero en sólo lectura y con el candado: tiene todo y no se toca.
 *
 * Cada permiso es un renglón con su casilla y, si admite "sólo lo suyo", el
 * alcance. Lo que el plan o el rubro no incluyen no aparece en su dominio ni
 * cuenta; si el rol ya lo trae (las plantillas copian permisos de otros
 * rubros), va aparte y plegado en "No incluidos en tu plan", para poder
 * sacarlo (QA R1 W-02/W-04). Lo que quien edita no tiene se
 * ve apagado y dice por qué (nadie da lo que no tiene; lo dice `otorgable`
 * del catálogo, con el alcance hasta el que llega). Los
 * dominios van plegados: en el celular son 60 renglones, y se abre el tema
 * que se quiere tocar.
 */
export default function EditorRol({
  rol,
  catalogo,
  errorCatalogo,
  onClose,
  onGuardado,
  onBorrar,
}: {
  rol: RolNegocio | null;
  catalogo: DominioPermisos[] | null;
  errorCatalogo?: string;
  onClose: () => void;
  onGuardado: (aviso: string) => void;
  onBorrar: (rol: RolNegocio) => void;
}) {
  const soloLectura = !!rol?.esAdministrador;
  const [nombre, setNombre] = useState(rol?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? "");
  const inicial = useMemo(
    () => new Map<string, Alcance>((rol?.permisos ?? []).map((p) => [p.codigo, p.alcance])),
    [rol],
  );
  const [elegidos, setElegidos] = useState<Map<string, Alcance>>(inicial);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [verBitacora, setVerBitacora] = useState(false);
  const nombres = useMemo(() => nombresDelCatalogo(catalogo), [catalogo]);
  const fueraDelPlan = useMemo(() => noIncluidos(rol, catalogo), [rol, catalogo]);

  const cambiaron = useMemo(() => {
    if (elegidos.size !== inicial.size) return true;
    for (const [c, a] of elegidos) if (inicial.get(c) !== a) return true;
    return false;
  }, [elegidos, inicial]);

  const alternar = (p: PermisoCatalogo, prendido: boolean) =>
    setElegidos((antes) => {
      const nuevo = new Map(antes);
      if (!prendido) nuevo.delete(p.codigo);
      // Al prender, el alcance más amplio que quien edita puede dar.
      else nuevo.set(p.codigo, p.otorgable ?? "GENERAL");
      return nuevo;
    });
  const fijarAlcance = (codigo: string, alcance: Alcance) =>
    setElegidos((antes) => new Map(antes).set(codigo, alcance));

  async function guardar() {
    setError("");
    const limpio = nombre.trim();
    if (!limpio) return setError("Poné el nombre del rol.");
    const permisos = [...elegidos].map(([codigo, alcance]) => ({ codigo, alcance }));
    setGuardando(true);
    try {
      if (!rol) {
        const nuevo = await apiRoles.crear({
          nombre: limpio,
          ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
          permisos,
        });
        onGuardado(`Rol "${nuevo.nombre}" creado.`);
      } else {
        // Sólo lo que cambió: la bitácora distingue renombrar de cambiar
        // permisos, y mandar todo dejaría un "cambió permisos" por un nombre.
        const cambios = {
          ...(limpio !== rol.nombre ? { nombre: limpio } : {}),
          ...(descripcion.trim() !== (rol.descripcion ?? "") ? { descripcion: descripcion.trim() || null } : {}),
          ...(cambiaron ? { permisos } : {}),
        };
        if (Object.keys(cambios).length === 0) return onClose();
        await apiRoles.editar(rol.id, cambios);
        onGuardado(`Rol "${limpio}" guardado.`);
      }
    } catch (e) {
      setError(mensajeDeError(e, { nombres }));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={rol ? rol.nombre : "Nuevo rol"}
      subtitulo={
        soloLectura
          ? "Tiene todos los permisos del plan. No se edita ni se borra."
          : rol
            ? "Los cambios les llegan a todos los que lo tienen, sin volver a entrar."
            : "Elegí qué puede hacer quien tenga este rol."
      }
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-2xl"
      acciones={
        soloLectura ? (
          <Boton variante="ghost" onClick={onClose}>
            Cerrar
          </Boton>
        ) : (
          <>
            {/* El error va en el pie, junto a Guardar, que siempre está a la
                vista: al final del cuerpo quedaba debajo de los dominios y,
                en el celular, Guardar parecía no hacer nada (QA R1 W-01). */}
            {error && (
              <div role="alert" className="basis-full">
                <ErrorMsg>{error}</ErrorMsg>
              </div>
            )}
            {rol && (
              <Boton variante="ghost" icono="trash" onClick={() => onBorrar(rol)} disabled={guardando} className="mr-auto">
                Borrar
              </Boton>
            )}
            <Boton variante="ghost" onClick={onClose} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton icono="save" onClick={guardar} disabled={guardando || !catalogo}>
              {guardando ? "Guardando…" : "Guardar"}
            </Boton>
          </>
        )
      }
    >
      <div className="space-y-4">
        {soloLectura && (
          <p className="flex items-start gap-2 rounded-xl bg-purple-50 px-3.5 py-2.5 text-[13px] text-purple-800">
            <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
            El Administrador es el rol del dueño: tiene siempre todos los permisos que incluye el plan, y el
            negocio no puede quedarse sin nadie que lo tenga. Lo de quien hace el trabajo (repartir, cobrar sus
            mesas, agendar o bloquear lo suyo) no lo lleva: lo cubre con los permisos generales.
          </p>
        )}

        {!soloLectura && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Nombre" hint="Como lo llaman en el negocio: es también el cargo de la gente.">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} autoFocus={!rol} />
            </Campo>
            <Campo label="Descripción" hint="Opcional.">
              <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={200} />
            </Campo>
          </div>
        )}

        {!catalogo ? (
          <ErrorMsg>{errorCatalogo || "No se pudo cargar la lista de permisos."}</ErrorMsg>
        ) : (
          <div className="space-y-2" aria-label="Permisos">
            {catalogo.map((d) => (
              <Dominio
                key={d.dominio}
                dominio={d}
                elegidos={elegidos}
                soloLectura={soloLectura}
                alternar={alternar}
                fijarAlcance={fijarAlcance}
              />
            ))}
            {!soloLectura && fueraDelPlan.length > 0 && (
              <NoIncluidos permisos={fueraDelPlan} elegidos={elegidos} alternar={alternar} fijarAlcance={fijarAlcance} />
            )}
          </div>
        )}

        {rol && (
          <div className="border-t border-borde-soft pt-3">
            <button
              type="button"
              onClick={() => setVerBitacora((v) => !v)}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-texto-2"
              aria-expanded={verBitacora}
            >
              <Icon name={verBitacora ? "chevronDown" : "chevronRight"} size={15} />
              Historial de cambios
            </button>
            {verBitacora && (
              <div className="mt-2">
                <BitacoraRoles rolId={rol.id} compacta nombres={nombres} />
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Los permisos que el rol trae y el negocio no puede usar (su plan, su rubro o
 * una feature apagada no los incluyen): los del catálogo con `disponible`
 * false y los que el catálogo ya ni lista. Para el editor, con su nombre.
 */
function noIncluidos(rol: RolNegocio | null, catalogo: DominioPermisos[] | null): PermisoCatalogo[] {
  if (!rol || rol.esAdministrador || !catalogo) return [];
  const delCatalogo = new Map(catalogo.flatMap((d) => d.permisos).map((p) => [p.codigo, p]));
  return rol.permisos.flatMap((p): PermisoCatalogo[] => {
    const c = delCatalogo.get(p.codigo);
    if (c) return c.disponible ? [] : [c];
    return [
      {
        codigo: p.codigo,
        nombre: p.nombre || p.codigo,
        descripcion: p.dominio ?? "",
        sensible: false,
        admitePropio: false,
        disponible: false,
        otorgable: null,
      },
    ];
  });
}

/**
 * Un dominio (Ventas, Caja, Agenda…): plegado, con cuántos tiene prendidos.
 * Lo que el plan o el rubro no incluyen (o una feature apagada para todos,
 * como la ficha de salud y los consentimientos desde el 07-oct) no se
 * muestra ni cuenta: ofrecerlo apagado invitaba a pedir algo que no existe.
 * Si el rol lo trae, va en "No incluidos en tu plan". Un dominio sin nada que
 * mostrar, tampoco.
 */
function Dominio({
  dominio,
  elegidos,
  soloLectura,
  alternar,
  fijarAlcance,
}: {
  dominio: DominioPermisos;
  elegidos: Map<string, Alcance>;
  soloLectura: boolean;
  alternar: (p: PermisoCatalogo, prendido: boolean) => void;
  fijarAlcance: (codigo: string, alcance: Alcance) => void;
}) {
  const visibles = dominio.permisos.filter((p) => p.disponible);
  // El Administrador se ve con lo que de verdad trae (`GET /roles`): sin los
  // de ejecutor, que no recibe.
  const alcanceDe = (p: PermisoCatalogo) => elegidos.get(p.codigo);
  const prendidos = visibles.filter((p) => alcanceDe(p) !== undefined).length;
  if (visibles.length === 0) return null;
  return (
    <details className="rounded-xl border border-borde-soft">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3.5 py-3">
        <span className="text-sm font-semibold text-texto">{dominio.nombre || dominio.dominio}</span>
        <span className={`text-xs ${prendidos ? "font-semibold text-primary-700" : "text-texto-4"}`}>
          {prendidos} de {visibles.length}
        </span>
      </summary>
      <ul className="divide-y divide-borde-soft border-t border-borde-soft">
        {visibles.map((p) => (
          <RenglonPermiso
            key={p.codigo}
            permiso={p}
            alcance={alcanceDe(p)}
            soloLectura={soloLectura}
            alternar={alternar}
            fijarAlcance={fijarAlcance}
          />
        ))}
      </ul>
    </details>
  );
}

/**
 * Lo que el rol trae y el negocio no puede usar, plegado y al final: no
 * infla los conteos y no se confunde con lo que sí hace. Se puede sacar
 * (sacar no es dar); una vez sacado, no se vuelve a poner.
 */
function NoIncluidos({
  permisos,
  elegidos,
  alternar,
  fijarAlcance,
}: {
  permisos: PermisoCatalogo[];
  elegidos: Map<string, Alcance>;
  alternar: (p: PermisoCatalogo, prendido: boolean) => void;
  fijarAlcance: (codigo: string, alcance: Alcance) => void;
}) {
  const quedan = permisos.filter((p) => elegidos.has(p.codigo)).length;
  return (
    <details className="rounded-xl border border-dashed border-borde">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3.5 py-3">
        <span className="text-sm font-semibold text-texto-3">No incluidos en tu plan</span>
        <span className="text-xs text-texto-4">{quedan}</span>
      </summary>
      <p className="border-t border-borde-soft px-3.5 py-2.5 text-xs text-texto-3">
        El rol los trae, pero tu plan o tu rubro no los incluyen: nadie los puede usar y no cuentan entre sus
        permisos. Podés sacarlos.
      </p>
      <ul className="divide-y divide-borde-soft border-t border-borde-soft">
        {permisos.map((p) => (
          <RenglonPermiso
            key={p.codigo}
            permiso={p}
            alcance={elegidos.get(p.codigo)}
            soloLectura={false}
            alternar={alternar}
            fijarAlcance={fijarAlcance}
            sinMotivo
          />
        ))}
      </ul>
    </details>
  );
}

function RenglonPermiso({
  permiso: p,
  alcance,
  soloLectura,
  alternar,
  fijarAlcance,
  sinMotivo = false,
}: {
  permiso: PermisoCatalogo;
  alcance: Alcance | undefined;
  soloLectura: boolean;
  alternar: (p: PermisoCatalogo, prendido: boolean) => void;
  fijarAlcance: (codigo: string, alcance: Alcance) => void;
  /** El motivo ya lo dice el grupo (los no incluidos en el plan). */
  sinMotivo?: boolean;
}) {
  const prendido = alcance !== undefined;
  const maximo = p.otorgable;
  /**
   * Por qué no se puede prender. Apagar sí se puede siempre (sacar no es dar):
   * un permiso que el rol ya traía y quien edita no tiene se puede quitar, y
   * recién ahí queda apagado con su motivo.
   */
  const motivo = !p.disponible
    ? "Tu plan no lo incluye."
    : maximo === null
      ? "No lo tenés, así que no lo podés dar."
      : null;
  const bloqueado = soloLectura || (!prendido && motivo !== null);
  const id = `permiso-${p.codigo}`;

  return (
    <li className="px-3.5 py-2.5">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          checked={prendido}
          disabled={bloqueado}
          onChange={(e) => alternar(p, e.target.checked)}
        />
        <label htmlFor={id} className={`min-w-0 flex-1 ${bloqueado && !prendido ? "opacity-60" : ""}`}>
          <span className="block text-sm font-medium text-texto">{p.nombre}</span>
          <span className="block text-xs text-texto-3">{p.descripcion}</span>
          {motivo && !soloLectura && !sinMotivo && <span className="mt-0.5 block text-xs text-warning-text">{motivo}</span>}
        </label>
      </div>
      {p.admitePropio && prendido && !soloLectura && (
        <div className="ml-7 mt-2 inline-flex rounded-lg border border-borde p-0.5" role="radiogroup" aria-label={`Alcance de ${p.nombre}`}>
          {(["GENERAL", "PROPIO"] as const).map((a) => {
            // Quien lo tiene sólo sobre lo suyo no puede dar el de todos.
            const sinPoder = a === "GENERAL" && maximo === "PROPIO" && alcance !== "GENERAL";
            return (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={alcance === a}
                disabled={sinPoder}
                title={sinPoder ? "Vos lo tenés sólo sobre lo tuyo." : undefined}
                onClick={() => fijarAlcance(p.codigo, a)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
                  alcance === a ? "bg-primary-boton text-white" : "text-texto-2 hover:bg-muted"
                }`}
              >
                {a === "GENERAL" ? "General" : "Sólo lo suyo"}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}
