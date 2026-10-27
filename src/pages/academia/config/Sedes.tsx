import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import MenuMas, { type AccionMenu } from "../../../components/MenuMas";
import PanelLateral from "../../../components/PanelLateral";
import { AvisoOk, Boton, Campo, Cargando, ErrorMsg, Input, useAviso, Vacio } from "../../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../../lib/academia/apiAcademia";
import { conteosDeSede, datosQueFaltan } from "../../../lib/academia/sedes";
import type { Sede } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { useConsultaMedia } from "../../../lib/agenda/useEsCelular";
import { ApiError } from "../../../lib/api";
import { tienePermiso } from "../../../lib/permisos";
import { avisarPrimerosPasos } from "../../../lib/academia/primerosPasos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { BotonFila, Chip, EncabezadoPagina, PaginaAcademia, TABLA, Tarjeta } from "../piezas";
import Aulas from "./Aulas";
import SedeFranjas from "./SedeFranjas";

/**
 * Las sedes del instituto (C4): reemplaza, para la academia, a la pantalla de
 * Almacenes del inventario, que hablaba de stock, depósitos y precios por
 * sucursal. Una sede acá es un lugar donde se dan clases: nombre, dirección,
 * teléfono, horario de atención (lo muestra la página de inscripción), sus
 * aulas y sus franjas horarias.
 *
 * Con varias sedes: lista (tarjetas en el celular, tabla en escritorio) y el
 * detalle de cada una en un panel. Con UNA sola, la lista sería una fila
 * sola y ruido: la sede se muestra entera, con sus franjas y sus aulas a la
 * vista, y «Nueva sede» sigue disponible si el plan lo permite.
 *
 * Enlaces que llegan acá: `?sede=ID` abre esa sede y `&ver=franjas|aulas|editar`
 * lleva a la sección (los pasos de «Primeros pasos» y «Cargar aulas»).
 */

type Ver = "franjas" | "aulas" | "editar";

const verDeLaUrl = (v: string | null): Ver | null => (v === "franjas" || v === "aulas" || v === "editar" ? v : null);

export default function Sedes() {
  const { usuario } = useAuth();
  const p = usePalabras();
  const configura = tienePermiso(usuario, "academia.configurar");
  // Abrir una sede cuesta plata (ocupa un lugar del plan): sólo quien administra todas.
  const [soloOrganizacion, setSoloOrganizacion] = useState(false);
  const puedeCrear = configura && usuario?.sucursalId == null && !soloOrganizacion;
  const celular = useConsultaMedia("(max-width: 767px)");

  const lista = useApi(() => apiAcademia.sedes(), []);
  const sedes = lista.datos ?? [];

  const [params, setParams] = useSearchParams();
  const sedeUrl = Number(params.get("sede")) || null;
  const verUrl = verDeLaUrl(params.get("ver"));
  const [abierta, setAbierta] = useState<number | null>(null);
  const [ver, setVer] = useState<Ver | null>(null);
  // Cada enlace de «Primeros pasos» es un pedido nuevo de ir a una sección, aunque
  // sea la misma de antes: sin la señal, no se volvía a bajar (ronda 1, W2).
  const [senal, setSenal] = useState(0);
  const [edicion, setEdicion] = useState<{ sede: Sede | null } | null>(null);
  const [aviso, setAviso] = useAviso();

  // Cada enlace se consume al llegar, ya cargada la lista, y la URL queda limpia.
  // Se mira en cada cambio de la URL —no sólo al entrar—: los pasos de «Primeros
  // pasos» también están dentro de esta pantalla y navegan a ella misma (W2).
  useEffect(() => {
    if (!lista.datos || (!sedeUrl && !verUrl)) return;
    const destino = lista.datos.find((s) => s.id === sedeUrl) ?? (lista.datos.length === 1 ? lista.datos[0] : null);
    if (destino && verUrl === "editar" && configura) setEdicion({ sede: destino });
    else if (destino) {
      if (lista.datos.length > 1) setAbierta(destino.id);
      setVer(verUrl);
      setSenal((n) => n + 1);
    }
    setParams({}, { replace: true });
  }, [lista.datos, sedeUrl, verUrl, configura, setParams]);

  const unaSola = sedes.length === 1;
  const detalle = sedes.find((s) => s.id === abierta) ?? null;

  const nueva = puedeCrear && (
    <Boton icono="plus" onClick={() => setEdicion({ sede: null })}>
      Nueva {p.sede}
    </Boton>
  );

  const accionesDe = (s: Sede): AccionMenu[] => [
    { clave: "abrir", etiqueta: "Franjas y aulas", icono: "clock", onClick: () => setAbierta(s.id) },
    ...(configura ? [{ clave: "editar", etiqueta: "Editar datos", icono: "edit" as const, onClick: () => setEdicion({ sede: s }) }] : []),
  ];

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        titulo={p.Sedes}
        bajada={`Dónde das clases: sus datos, sus horarios (franjas) y sus aulas.`}
        acciones={sedes.length > 0 ? nueva : undefined}
      />

      <AvisoOk>{aviso}</AvisoOk>

      {lista.error && !lista.datos ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : !lista.datos ? (
        <Cargando />
      ) : sedes.length === 0 ? (
        <Tarjeta etiqueta={p.Sedes}>
          <Vacio
            icono="home"
            titulo={`Todavía no hay ${p.sedes}`}
            texto={`Cargá la primera con su dirección y su horario de atención.`}
            accion={nueva || undefined}
          />
        </Tarjeta>
      ) : unaSola ? (
        <ContenidoSede
          sede={sedes[0]}
          configura={configura}
          ver={ver}
          senal={senal}
          onEditar={() => setEdicion({ sede: sedes[0] })}
          onCambio={lista.recargar}
        />
      ) : celular ? (
        <ul className="space-y-3" aria-label={p.Sedes}>
          {sedes.map((s) => (
            <li key={s.id} className="card flex items-start gap-2 p-4">
              <button type="button" onClick={() => setAbierta(s.id)} className="min-w-0 flex-1 text-left" aria-label={`Abrir ${s.nombre}`}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-bold text-texto">{s.nombre}</span>
                  {s.esPrincipal && <Chip tono="marca">Principal</Chip>}
                </span>
                <span className="mt-1 block text-[13px] text-texto-3">{s.direccion || "Sin dirección cargada"}</span>
                {s.telefono && <span className="block text-[13px] text-texto-3">{s.telefono}</span>}
                {s.horarioAtencion && <span className="block text-[13px] text-texto-3">{s.horarioAtencion}</span>}
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {conteosDeSede(s).map((c) => (
                    <Chip key={c}>{c}</Chip>
                  ))}
                </span>
              </button>
              <MenuMas etiqueta={`Más acciones de ${s.nombre}`} titulo={s.nombre} acciones={accionesDe(s)} />
            </li>
          ))}
        </ul>
      ) : (
        <Tarjeta etiqueta={p.Sedes} sinRelleno>
          <div className={TABLA.envoltura}>
            <table className={`${TABLA.tabla} min-w-[720px]`}>
              <thead>
                <tr className={TABLA.encabezado}>
                  <th className={TABLA.th}>{p.Sede}</th>
                  <th className={TABLA.th}>Dirección</th>
                  <th className={TABLA.th}>Teléfono</th>
                  <th className={TABLA.th}>Horario de atención</th>
                  <th className={TABLA.th}>Resumen</th>
                  <th className={TABLA.th}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sedes.map((s) => (
                  <tr key={s.id} className={TABLA.fila}>
                    <td className={TABLA.td}>
                      <button type="button" onClick={() => setAbierta(s.id)} className="text-left font-semibold text-texto hover:text-primary-700" aria-label={`Abrir ${s.nombre}`}>
                        {s.nombre}
                      </button>
                      {s.esPrincipal && <Chip tono="marca" className="ml-2">Principal</Chip>}
                    </td>
                    <td className={`${TABLA.td} text-texto-2`}>{s.direccion || <span className="text-texto-4">—</span>}</td>
                    <td className={`${TABLA.td} text-texto-2`}>{s.telefono || <span className="text-texto-4">—</span>}</td>
                    <td className={`${TABLA.td} text-texto-2`}>{s.horarioAtencion || <span className="text-texto-4">—</span>}</td>
                    <td className={TABLA.td}>
                      <span className="flex flex-wrap gap-1.5">
                        {conteosDeSede(s).map((c) => (
                          <Chip key={c}>{c}</Chip>
                        ))}
                      </span>
                    </td>
                    <td className={`${TABLA.td} text-right`}>
                      <MenuMas etiqueta={`Más acciones de ${s.nombre}`} titulo={s.nombre} acciones={accionesDe(s)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      {detalle && !unaSola && (
        <PanelLateral
          abierto
          titulo={detalle.nombre}
          subtitulo={`Datos, franjas y aulas de esta ${p.sede}`}
          // Adentro se editan las franjas y se abre el aula: un toque afuera no tiene que tirar lo tipeado (ronda 1, W4).
          cerrarAlClicAfuera={false}
          onClose={() => {
            setAbierta(null);
            setVer(null);
            // Los conteos de la lista (aulas, franjas) pueden haber cambiado adentro.
            lista.recargar();
          }}
        >
          <ContenidoSede sede={detalle} configura={configura} ver={ver} senal={senal} onEditar={() => setEdicion({ sede: detalle })} onCambio={lista.recargar} />
        </PanelLateral>
      )}

      {edicion && (
        <PanelSede
          key={edicion.sede?.id ?? "nueva"}
          sede={edicion.sede}
          onCerrar={() => setEdicion(null)}
          onSoloOrganizacion={() => {
            setSoloOrganizacion(true);
            setEdicion(null);
          }}
          onNoExiste={() => {
            setEdicion(null);
            lista.recargar();
          }}
          onGuardada={(s, esNueva) => {
            setEdicion(null);
            setAviso(esNueva ? `${s.nombre} quedó creada. Cargale las franjas y las aulas.` : `${s.nombre} se guardó.`);
            lista.recargar();
            if (esNueva) {
              setVer("franjas");
              setAbierta(s.id);
            }
          }}
        />
      )}
    </div>
  );
}

/** Los datos de la sede, sus franjas y sus aulas: se apilan igual en el panel y en la página de una sola sede. */
function ContenidoSede({
  sede,
  configura,
  ver,
  senal,
  onEditar,
  onCambio,
}: {
  sede: Sede;
  configura: boolean;
  ver: Ver | null;
  /** Sube con cada pedido de ir a `ver`, para volver a bajar a la misma sección. */
  senal: number;
  onEditar: () => void;
  onCambio: () => void;
}) {
  const p = usePalabras();
  const franjasRef = useRef<HTMLDivElement>(null);
  const aulasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ver === "franjas" ? franjasRef.current : ver === "aulas" ? aulasRef.current : null;
    el?.scrollIntoView?.({ block: "start" });
  }, [ver, senal, sede.id]);

  const falta = datosQueFaltan(sede);
  return (
    <div className="space-y-5">
      <Tarjeta
        titulo={sede.nombre}
        id={`t-sede-${sede.id}`}
        acciones={
          configura && (
            <BotonFila variante="ghost" icono="edit" onClick={onEditar}>
              Editar datos
            </BotonFila>
          )
        }
      >
        <dl className="space-y-2.5 text-sm">
          <Dato icono="pin" etiqueta="Dirección" valor={sede.direccion} />
          <Dato icono="phone" etiqueta="Teléfono" valor={sede.telefono} />
          <Dato icono="clock" etiqueta="Horario de atención" valor={sede.horarioAtencion} />
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {conteosDeSede(sede).map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
          {sede.esPrincipal && <Chip tono="marca">Principal</Chip>}
        </div>
        {configura && falta.length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-3">
            <Icon name="info" size={16} />
            <span>
              Te falta cargar {falta.join(", ").replace(/, ([^,]*)$/, " y $1")}: lo ve la gente en tu página de inscripción.
            </span>
          </p>
        )}
      </Tarjeta>

      <div ref={franjasRef}>
        <SedeFranjas sedeId={sede.id} puedeEditar={configura} onCambio={onCambio} />
      </div>
      <div ref={aulasRef} aria-label={`Aulas de esta ${p.sede}`}>
        <Aulas sedeId={sede.id} onCambio={onCambio} />
      </div>
    </div>
  );
}

function Dato({ icono, etiqueta, valor }: { icono: "pin" | "phone" | "clock"; etiqueta: string; valor: string | null }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-texto-4">
        <Icon name={icono} size={16} />
      </span>
      <div className="min-w-0">
        <dt className="text-[12px] font-semibold uppercase tracking-wide text-texto-4">{etiqueta}</dt>
        <dd className={valor ? "text-texto" : "text-texto-4"}>{valor || "Sin cargar"}</dd>
      </div>
    </div>
  );
}

/** Nueva sede o editar los datos de una. */
function PanelSede({
  sede,
  onCerrar,
  onGuardada,
  onSoloOrganizacion,
  onNoExiste,
}: {
  sede: Sede | null;
  onCerrar: () => void;
  onGuardada: (s: Sede, nueva: boolean) => void;
  onSoloOrganizacion: () => void;
  onNoExiste: () => void;
}) {
  const p = usePalabras();
  const [nombre, setNombre] = useState(sede?.nombre ?? "");
  const [direccion, setDireccion] = useState(sede?.direccion ?? "");
  const [telefono, setTelefono] = useState(sede?.telefono ?? "");
  const [horario, setHorario] = useState(sede?.horarioAtencion ?? "");
  const [errorNombre, setErrorNombre] = useState("");
  const [error, setError] = useState("");
  const [cupo, setCupo] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const limpio = nombre.trim();
    setError("");
    setCupo("");
    if (!limpio) return setErrorNombre(`Ponele un nombre a la ${p.sede}.`);
    setErrorNombre("");
    setGuardando(true);
    try {
      const r = sede
        ? await apiAcademia.editarSede(sede.id, {
            nombre: limpio,
            direccion: direccion.trim() || null,
            telefono: telefono.trim() || null,
            horarioAtencion: horario.trim() || null,
          })
        : await apiAcademia.crearSede({
            nombre: limpio,
            ...(direccion.trim() ? { direccion: direccion.trim() } : {}),
            ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
            ...(horario.trim() ? { horarioAtencion: horario.trim() } : {}),
          });
      onGuardada(r, !sede);
      // «Primeros pasos» (la sede con sus datos) se marca sola sin salir de acá (ronda 2, R3).
      avisarPrimerosPasos();
    } catch (e) {
      const codigo = e instanceof ApiError ? e.codigo : undefined;
      if (codigo === CODIGOS_ACADEMIA.SEDE_REPETIDA) {
        setErrorNombre(`Ya tenés una ${p.sede} con ese nombre.`);
      } else if (codigo === CODIGOS_ACADEMIA.CUPO_SEDES) {
        // El mensaje del backend ya dice cómo ampliar el plan: se muestra tal cual.
        setCupo(e instanceof Error ? e.message : "Tu plan no incluye más sedes.");
      } else if (codigo === CODIGOS_ACADEMIA.SEDE_SOLO_ORGANIZACION) {
        onSoloOrganizacion();
      } else if (codigo === CODIGOS_ACADEMIA.SEDE_NO_EXISTE) {
        onNoExiste();
      } else {
        setError(e instanceof Error ? e.message : `No se pudo guardar la ${p.sede}`);
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <PanelLateral
      abierto
      titulo={sede ? `Editar ${p.sede}` : `Nueva ${p.sede}`}
      subtitulo={sede?.nombre}
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : sede ? "Guardar" : `Crear ${p.sede}`}
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
        <Campo label="Nombre" error={errorNombre}>
          <Input value={nombre} maxLength={60} autoFocus onChange={(e) => setNombre(e.target.value)} placeholder="Sede Central" />
        </Campo>
        <Campo label="Dirección">
          <Input value={direccion} maxLength={200} onChange={(e) => setDireccion(e.target.value)} placeholder="Av. Blanco Galindo km 3, frente a la plaza" />
        </Campo>
        <Campo label="Teléfono">
          <Input value={telefono} maxLength={40} inputMode="tel" onChange={(e) => setTelefono(e.target.value)} placeholder="4 4000000" />
        </Campo>
        <Campo label="Horario de atención" hint="Lo ve la gente en tu página de inscripción.">
          <Input value={horario} maxLength={120} onChange={(e) => setHorario(e.target.value)} placeholder="Lun a Vie 8:00–20:00, Sáb 8:00–13:00" />
        </Campo>
        {cupo && (
          <div role="alert" className="flex items-start gap-2 rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm text-warning-text">
            <Icon name="info" size={17} />
            <span>{cupo}</span>
          </div>
        )}
        <ErrorMsg>{error}</ErrorMsg>
        {/* El botón de guardar está afuera del formulario (en el pie del panel): sin uno
            propio, Enter en un campo no enviaba nada (ronda 1, W8). */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </PanelLateral>
  );
}

/** La pantalla de la pestaña «Sedes» de la Configuración del instituto. */
export function SedesConfig() {
  return (
    <PaginaAcademia ancho="max-w-5xl">
      <Sedes />
    </PaginaAcademia>
  );
}
