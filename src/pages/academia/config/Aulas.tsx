import { useMemo, useState } from "react";
import { Icon } from "../../../components/Icon";
import MenuMas, { type AccionMenu } from "../../../components/MenuMas";
import PanelLateral from "../../../components/PanelLateral";
import { AvisoOk, Boton, Campo, Cargando, ErrorMsg, Input, Modal, Select, useAviso, Vacio } from "../../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../../lib/academia/apiAcademia";
import type { Aula, Ref } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { ApiError } from "../../../lib/api";
import { tienePermiso } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useSucursales } from "../../../lib/useSucursales";
import { useAuth } from "../../../store/AuthContext";
import { Chip, LISTA, Tarjeta } from "../piezas";

/**
 * Las aulas de cada sede (BACK-5, pedido del dueño del 26-oct): hasta ahora el
 * aula de un grupo era un texto que se tipeaba a mano en cada uno, sin lista
 * ni validación. Ahora se cargan una vez acá y el grupo las elige de una lista
 * (NuevoGrupo y Grupo).
 *
 * Es un componente suelto —sin página ni pestaña a su alrededor—: la
 * pantalla de Sedes lo monta dentro de cada sede con `sedeId` (WEB-8); sin él
 * muestra todas las que ve el usuario (con un selector si son varias). Ya no
 * hay una pestaña «Aulas» aparte. Cargar y modificar pide `academia.configurar`.
 */
export default function Aulas({ sedeId = null, onCambio }: { sedeId?: number | null; onCambio?: () => void }) {
  const { usuario } = useAuth();
  const p = usePalabras();
  const configura = tienePermiso(usuario, "academia.configurar");
  const { sucursales } = useSucursales();

  const [filtroSede, setFiltroSede] = useState<number | null>(null);
  const sedeVista = sedeId ?? filtroSede;
  const datos = useApi(() => apiAcademia.aulas({ sede: sedeVista }), [sedeVista]);
  const aulas = datos.datos ?? [];

  const [panel, setPanel] = useState<{ aula: Aula | null; sedePorDefecto: number | null } | null>(null);
  const [aviso, setAviso] = useAviso();
  const [error, setError] = useState("");
  const [haciendo, setHaciendo] = useState<number | null>(null);
  const [aEliminar, setAEliminar] = useState<Aula | null>(null);
  const [enUso, setEnUso] = useState<{ aula: Aula; mensaje: string } | null>(null);

  // Las sedes que se muestran: la pedida, las del negocio (quien es de la
  // organización) o la propia (quien está atado a una sede; el backend ya le
  // recorta las aulas). Una sede que sólo aparece en las aulas se suma igual.
  const sedes: Ref[] = useMemo(() => {
    const base: Ref[] = sucursales.map((s) => ({ id: s.id, nombre: s.nombre }));
    if (!base.length && usuario?.sucursalId != null) base.push({ id: usuario.sucursalId, nombre: usuario.sucursal ?? p.Sede });
    for (const a of datos.datos ?? []) if (!base.some((s) => s.id === a.sede.id)) base.push(a.sede);
    if (sedeId != null) {
      return base.some((s) => s.id === sedeId) ? base.filter((s) => s.id === sedeId) : [{ id: sedeId, nombre: p.Sede }];
    }
    return filtroSede != null ? base.filter((s) => s.id === filtroSede) : base;
  }, [sucursales, usuario?.sucursalId, usuario?.sucursal, datos.datos, sedeId, filtroSede, p.Sede]);
  // El selector, sólo si hay de dónde elegir: quien está atado a una sede no
  // tiene lista de sedes (el backend ya le recorta las aulas).
  const variasSedes = sedeId == null && sucursales.length > 1;

  const sedeNueva = sedeId ?? filtroSede ?? (sedes.length === 1 ? sedes[0].id : null);

  async function cambiarActiva(a: Aula, activa: boolean) {
    setHaciendo(a.id);
    setError("");
    try {
      await apiAcademia.editarAula(a.id, { activa });
      setAviso(activa ? `${a.nombre} volvió a estar disponible.` : `${a.nombre} quedó de baja: los grupos que ya la usan la conservan, pero no se ofrece para grupos nuevos.`);
      datos.recargar();
      // La sede de arriba cuenta las aulas: su número también cambió (ronda 1, W7).
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el aula");
    } finally {
      setHaciendo(null);
    }
  }

  async function eliminar(a: Aula) {
    setHaciendo(a.id);
    setError("");
    try {
      const r = await apiAcademia.borrarAula(a.id);
      setAEliminar(null);
      setAviso(
        r.gruposDesvinculados > 0
          ? `${a.nombre} eliminada. ${r.gruposDesvinculados} ${r.gruposDesvinculados === 1 ? "grupo quedó" : "grupos quedaron"} sin aula.`
          : `${a.nombre} eliminada.`,
      );
      datos.recargar();
      onCambio?.();
    } catch (e) {
      setAEliminar(null);
      if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.AULA_EN_USO) {
        setEnUso({ aula: a, mensaje: e.message });
      } else {
        setError(e instanceof Error ? e.message : "No se pudo eliminar el aula");
      }
    } finally {
      setHaciendo(null);
    }
  }

  const accionesDe = (a: Aula): AccionMenu[] => [
    { clave: "editar", etiqueta: "Editar", icono: "edit", onClick: () => setPanel({ aula: a, sedePorDefecto: a.almacenId }) },
    a.activa
      ? { clave: "baja", etiqueta: "Dar de baja", icono: "pausa", onClick: () => void cambiarActiva(a, false) }
      : { clave: "alta", etiqueta: "Reactivar", icono: "check", onClick: () => void cambiarActiva(a, true) },
    { clave: "eliminar", etiqueta: "Eliminar", icono: "trash", peligrosa: true, separar: true, onClick: () => setAEliminar(a) },
  ];

  const nuevaAula = configura && (
    <Boton icono="plus" onClick={() => setPanel({ aula: null, sedePorDefecto: sedeNueva })}>
      Nueva aula
    </Boton>
  );

  return (
    <div className="space-y-4">
      {(variasSedes || (configura && aulas.length > 0)) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          {variasSedes ? (
            <label className="block min-w-48">
              <span className="sr-only">Ver las aulas de</span>
              <Select value={filtroSede ?? ""} onChange={(e) => setFiltroSede(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Todas las {p.sedes}</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
            </label>
          ) : (
            <span />
          )}
          {aulas.length > 0 && nuevaAula}
        </div>
      )}

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      {datos.error && !datos.datos ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : !datos.datos ? (
        <Cargando />
      ) : aulas.length === 0 && sedeVista == null ? (
        <Tarjeta etiqueta="Aulas">
          <Vacio
            icono="home"
            titulo="Todavía no cargaste aulas"
            texto="Agregá la primera para elegirla al abrir un grupo."
            accion={nuevaAula || undefined}
          />
        </Tarjeta>
      ) : (
        sedes.map((s) => {
          const deLaSede = aulas.filter((a) => a.sede.id === s.id);
          return (
            <Tarjeta
              key={s.id}
              id={`t-aulas-${s.id}`}
              titulo={sedeId == null ? s.nombre : "Aulas"}
              contador={deLaSede.length}
              sinRelleno
            >
              {deLaSede.length === 0 ? (
                <p className="px-4 py-4 text-sm text-texto-3 sm:px-5">
                  Esta {p.sede} todavía no tiene aulas.
                  {configura && (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={() => setPanel({ aula: null, sedePorDefecto: s.id })}
                        className="font-semibold text-primary-700 hover:underline"
                      >
                        Agregar la primera
                      </button>
                    </>
                  )}
                </p>
              ) : (
                <ul className={LISTA.lista}>
                  {deLaSede.map((a) => (
                    <li key={a.id} className={`flex items-center justify-between gap-3 ${LISTA.item} ${a.activa ? "" : "opacity-70"}`}>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-texto">{a.nombre}</span>
                          <Chip tono={a.activa ? "verde" : "gris"}>{a.activa ? "Activa" : "De baja"}</Chip>
                        </span>
                        <span className="mt-0.5 block text-[13px] text-texto-3">
                          {a.capacidad != null ? `Capacidad ${a.capacidad}` : "Sin capacidad cargada"} ·{" "}
                          {a.enUso === 0 ? "Ningún grupo la usa" : `${a.enUso} ${a.enUso === 1 ? "grupo la usa" : "grupos la usan"}`}
                        </span>
                      </span>
                      {configura && (
                        <span className={haciendo === a.id ? "pointer-events-none opacity-50" : ""}>
                          <MenuMas etiqueta={`Más acciones de ${a.nombre}`} titulo={a.nombre} acciones={accionesDe(a)} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          );
        })
      )}

      {panel && (
        <PanelAula
          key={panel.aula?.id ?? "nueva"}
          aula={panel.aula}
          sedes={sedes.length ? sedes : sucursales.map((s) => ({ id: s.id, nombre: s.nombre }))}
          sedePorDefecto={panel.sedePorDefecto}
          onCerrar={() => setPanel(null)}
          onGuardada={(a, nueva) => {
            setPanel(null);
            setAviso(nueva ? `${a.nombre} quedó cargada.` : `${a.nombre} se guardó.`);
            datos.recargar();
            onCambio?.();
          }}
        />
      )}

      <Modal
        abierto={!!aEliminar}
        titulo="Eliminar el aula"
        ancho="max-w-sm"
        onClose={() => setAEliminar(null)}
        acciones={
          <>
            <Boton variante="ghost" onClick={() => setAEliminar(null)} disabled={haciendo != null}>
              Cancelar
            </Boton>
            <Boton variante="danger" onClick={() => aEliminar && void eliminar(aEliminar)} disabled={haciendo != null}>
              {haciendo != null ? "Un momento…" : "Eliminar"}
            </Boton>
          </>
        }
      >
        <p className="text-sm text-texto-2">
          ¿Eliminás <b>{aEliminar?.nombre}</b>? Si ningún grupo la usa, se borra. Si la usan, te ofrecemos darla de baja.
        </p>
      </Modal>

      <Modal
        abierto={!!enUso}
        titulo="El aula está en uso"
        ancho="max-w-sm"
        onClose={() => setEnUso(null)}
        acciones={
          <>
            <Boton variante="ghost" onClick={() => setEnUso(null)}>
              Dejarla como está
            </Boton>
            {enUso?.aula.activa && (
              <Boton
                onClick={() => {
                  const a = enUso.aula;
                  setEnUso(null);
                  void cambiarActiva(a, false);
                }}
              >
                Dar de baja
              </Boton>
            )}
          </>
        }
      >
        <div className="flex items-start gap-2 text-sm text-texto-2">
          <Icon name="info" size={17} />
          <p>{enUso?.mensaje}</p>
        </div>
      </Modal>
    </div>
  );
}

/** Nueva aula o editar una: nombre, capacidad opcional y, al crear, la sede. */
function PanelAula({
  aula,
  sedes,
  sedePorDefecto,
  onCerrar,
  onGuardada,
}: {
  aula: Aula | null;
  sedes: Ref[];
  sedePorDefecto: number | null;
  onCerrar: () => void;
  onGuardada: (a: Aula, nueva: boolean) => void;
}) {
  const p = usePalabras();
  const [nombre, setNombre] = useState(aula?.nombre ?? "");
  const [capacidad, setCapacidad] = useState(aula?.capacidad != null ? String(aula.capacidad) : "");
  const [almacenId, setAlmacenId] = useState<number | null>(aula?.almacenId ?? sedePorDefecto ?? (sedes.length === 1 ? sedes[0].id : null));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    // Enter vuelve a entrar acá mientras se guarda: sin esto salían dos POST (ronda 2, B4).
    if (guardando) return;
    const limpio = nombre.trim();
    if (!limpio) return setError("Ponele un nombre al aula.");
    if (limpio.length > 40) return setError("El nombre puede tener hasta 40 letras.");
    let cap: number | null = null;
    if (capacidad.trim() !== "") {
      cap = Number(capacidad);
      if (!Number.isInteger(cap) || cap < 1 || cap > 1000) return setError("La capacidad es un número entre 1 y 1000, o la dejás vacía.");
    }
    if (!aula && almacenId == null) return setError(`Elegí la ${p.sede}.`);
    setError("");
    setGuardando(true);
    try {
      const r = aula
        ? await apiAcademia.editarAula(aula.id, { nombre: limpio, capacidad: cap })
        : await apiAcademia.crearAula({ almacenId: almacenId!, nombre: limpio, ...(cap != null ? { capacidad: cap } : {}) });
      onGuardada(r, !aula);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el aula");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <PanelLateral
      abierto
      titulo={aula ? "Editar aula" : "Nueva aula"}
      subtitulo={aula ? aula.sede.nombre : undefined}
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : aula ? "Guardar" : "Agregar aula"}
          </Boton>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        {!aula && sedes.length > 1 && (
          <Campo label={p.Sede}>
            <Select value={almacenId ?? ""} onChange={(e) => setAlmacenId(e.target.value ? Number(e.target.value) : null)}>
              {almacenId == null && <option value="">Elegí…</option>}
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        )}
        <Campo label="Nombre">
          <Input value={nombre} maxLength={40} autoFocus onChange={(e) => setNombre(e.target.value)} placeholder="Aula 1" />
        </Campo>
        <Campo label="Capacidad (opcional)" hint="Cuántos estudiantes entran sentados.">
          <Input type="number" inputMode="numeric" value={capacidad} onChange={(e) => setCapacidad(e.target.value)} placeholder="25" />
        </Campo>
        <ErrorMsg>{error}</ErrorMsg>
        {/* El botón de guardar está afuera del formulario (en el pie del panel): sin uno
            propio, Enter en un campo no enviaba nada (ronda 1, W8). */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} disabled={guardando} />
      </form>
    </PanelLateral>
  );
}
