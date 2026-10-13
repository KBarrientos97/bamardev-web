import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EncabezadoPagina } from "../../../components/filtros";
import { Icon } from "../../../components/Icon";
import { Cargando, ErrorMsg } from "../../../components/ui";
import { api } from "../../../lib/api";
import { apiConfigAgenda } from "../../../lib/agenda/apiConfigAgenda";
import { modoDe, olvidarModos } from "../../../lib/agenda/modoAgenda";
import type { ModoAgenda } from "../../../lib/agenda/tiposAgenda";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import type { Almacen } from "../../../types";
import type { Recurso, Servicio } from "../../../lib/agenda/tiposConfigAgenda";
import { useNombreProfesional, type Pestana, type Sucursal } from "./utilConfig";
import TabBloqueos from "./TabBloqueos";
import TabExcepciones from "./TabExcepciones";
import TabHorarios from "./TabHorarios";
import TabRecursos from "./TabRecursos";
import TabReservaOnline from "./TabReservaOnline";
import TabServicios from "./TabServicios";
// Fase 3 (spa): cada pestaña sólo aparece con su feature.
import TabConsentimientos from "./TabConsentimientos";
import TabEspacios from "./TabEspacios";
import TabPaquetes from "./TabPaquetes";
import { useSpa } from "../../../lib/agenda/spa";

/**
 * A8 · Configuración de agenda (PLAN-AGENDA-BELLEZA §5.1): todo lo que hay
 * que cargar antes de poder dar una cita. La ven el dueño y el encargado.
 *
 * Servicios, recursos y sucursales se cargan una vez acá arriba porque los
 * usan casi todas las pestañas (un servicio dice quién lo hace; un horario es
 * de un recurso en una sucursal) y así cambiar de pestaña no vuelve a pedir lo
 * mismo. La pestaña va en la URL (`?pestana=`) para que un F5 no te devuelva
 * a Servicios en medio de cargar horarios.
 *
 * Arriba de todo, "¿Cómo trabajás?" (IDEAS/7-AGENDA-SIMPLE): solo/a = modo
 * simple, el defecto; con personal = completo. En simple se ven las pestañas
 * del día a día (Servicios, Horarios, Días libres, Bloqueos) y el resto queda
 * en "Más opciones"; nada se borra ni se apaga.
 */

const PESTANAS_BASE: Pestana[] = ["servicios", "recursos", "horarios", "excepciones", "bloqueos", "reservas"];
/** Lo que el que trabaja solo necesita a mano; lo demás, en "Más opciones". */
const ESENCIALES: Pestana[] = ["servicios", "horarios", "excepciones", "bloqueos"];

export default function ConfigAgenda() {
  const { puede } = useAuth();
  const nombres = useNombreProfesional();
  const spa = useSpa();
  const PESTANAS: Pestana[] = [
    ...PESTANAS_BASE,
    ...(spa.espacios ? (["espacios"] as Pestana[]) : []),
    ...(spa.paquetes ? (["paquetes"] as Pestana[]) : []),
    ...(spa.consentimientos ? (["consentimientos"] as Pestana[]) : []),
  ];
  const [params, setParams] = useSearchParams();
  const pedida = params.get("pestana") as Pestana | null;
  const pestana: Pestana = pedida && PESTANAS.includes(pedida) ? pedida : "servicios";

  const modoGuardado = useApi(
    () =>
      Promise.resolve()
        .then(() => apiConfigAgenda.modoAgenda())
        .catch(() => null),
    [],
  );
  const [modoElegido, setModoElegido] = useState<ModoAgenda | null>(null);
  const [guardandoModo, setGuardandoModo] = useState(false);
  const [errorModo, setErrorModo] = useState("");
  const modo: ModoAgenda = modoElegido ?? modoDe(modoGuardado.datos);
  const simple = modo === "SIMPLE";
  const [masPestanas, setMasPestanas] = useState(false);
  // En simple, lo que no es del día a día va plegado, salvo que se esté
  // mirando (un enlace a ?pestana=recursos no tiene que llevar a la nada).
  const visibles = simple && !masPestanas && !(pedida && PESTANAS.includes(pedida) && !ESENCIALES.includes(pedida))
    ? PESTANAS.filter((p) => ESENCIALES.includes(p))
    : PESTANAS;
  const plegadas = simple ? PESTANAS.filter((p) => !ESENCIALES.includes(p)) : [];

  async function cambiarModo(nuevo: ModoAgenda) {
    if (nuevo === modo || guardandoModo) return;
    const antes = modoElegido;
    setErrorModo("");
    setModoElegido(nuevo);
    setGuardandoModo(true);
    try {
      const r = await apiConfigAgenda.guardarModoAgenda(nuevo);
      setModoElegido(r?.modoAgenda ?? nuevo);
      // La agenda recordaba el modo por sucursal: que lo vuelva a pedir.
      olvidarModos();
    } catch (e) {
      setModoElegido(antes);
      setErrorModo(e instanceof Error && e.message ? e.message : "No se pudo cambiar el modo");
    } finally {
      setGuardandoModo(false);
    }
  }

  const servicios = useApi(() => apiConfigAgenda.servicios(), []);
  const recursos = useApi(() => apiConfigAgenda.recursos(true), []);
  const almacenes = useApi(() => api.getSucursales(), []);

  // Un depósito no atiende a nadie: no tiene agenda.
  const sucursales: Sucursal[] = useMemo(
    () =>
      (almacenes.datos ?? ([] as Almacen[]))
        .filter((a) => a.activo && a.tipo !== "DEPOSITO")
        .map((a) => ({ id: a.id, nombre: a.nombre })),
    [almacenes.datos],
  );

  const etiquetas: Record<Pestana, string> = {
    servicios: "Servicios",
    recursos: `${nombres.plural} y espacios`,
    horarios: "Horarios",
    // En simple se lee como lo que es para el que trabaja solo.
    excepciones: simple ? "Días libres" : "Excepciones",
    bloqueos: "Bloqueos",
    reservas: "Reserva online",
    espacios: "Tipos de espacio",
    paquetes: "Paquetes",
    consentimientos: "Consentimientos",
  };

  const elegir = (p: Pestana) => {
    const nuevos = new URLSearchParams(params);
    nuevos.set("pestana", p);
    setParams(nuevos, { replace: true });
  };

  const cargando = servicios.cargando || recursos.cargando;
  const error = servicios.error || recursos.error;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Configuración de agenda"
        subtitulo="Qué se atiende, quién lo hace y cuándo."
        accion={
          // Las reglas (granularidad, reserva online) viven en la
          // configuración del negocio, con `negocio.configurar`.
          puede("config_negocio") ? (
            <Link
              to="/configuracion/negocio"
              className="inline-flex items-center gap-2 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 transition-colors hover:bg-muted"
            >
              <Icon name="settings" size={17} />
              Reglas del negocio
            </Link>
          ) : undefined
        }
      />

      <ComoTrabajas modo={modo} guardando={guardandoModo} error={errorModo} onCambiar={cambiarModo} />

      {/* Las pestañas bajan de renglón: nada scrollea de costado. */}
      <div role="tablist" aria-label="Secciones de la configuración" className="flex flex-wrap gap-2">
        {visibles.map((p) => (
          <button
            key={p}
            role="tab"
            id={`tab-${p}`}
            aria-selected={pestana === p}
            aria-controls={`panel-${p}`}
            onClick={() => elegir(p)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              pestana === p
                ? "bg-primary-boton text-white"
                : "border border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            {etiquetas[p]}
          </button>
        ))}
        {plegadas.length > 0 && (
          <button
            type="button"
            aria-expanded={visibles.length > ESENCIALES.length}
            onClick={() => {
              const abiertas = visibles.length > ESENCIALES.length;
              setMasPestanas(!abiertas);
              // Al plegar, si se estaba mirando una de las plegadas, a Servicios.
              if (abiertas && !ESENCIALES.includes(pestana)) elegir("servicios");
            }}
            className="shrink-0 rounded-full px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50"
          >
            {visibles.length > ESENCIALES.length ? "Menos opciones" : "Más opciones"}
          </button>
        )}
      </div>

      <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`}>
        {error ? (
          <ErrorMsg
            onReintentar={() => {
              servicios.recargar();
              recursos.recargar();
            }}
          >
            {error}
          </ErrorMsg>
        ) : cargando && (!servicios.datos || !recursos.datos) ? (
          <Cargando />
        ) : (
          <Contenido
            pestana={pestana}
            servicios={servicios.datos ?? []}
            recursos={recursos.datos ?? []}
            sucursales={sucursales}
            recargarServicios={servicios.recargar}
            recargarRecursos={recursos.recargar}
            irA={elegir}
          />
        )}
      </div>
    </div>
  );
}

/**
 * "¿Cómo trabajás?": la llave del modo de la agenda. Se guarda al tocar (es
 * una sola decisión, no un formulario) y vale para todo el negocio.
 */
function ComoTrabajas({
  modo,
  guardando,
  error,
  onCambiar,
}: {
  modo: ModoAgenda;
  guardando: boolean;
  error: string;
  onCambiar: (m: ModoAgenda) => void;
}) {
  const opcion = (m: ModoAgenda, titulo: string, texto: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={modo === m}
      disabled={guardando}
      onClick={() => onCambiar(m)}
      className={`flex-1 basis-56 rounded-xl border p-3 text-left transition-colors disabled:opacity-70 ${
        modo === m ? "border-primary bg-primary-50" : "border-borde bg-white hover:bg-muted"
      }`}
    >
      <span className={`block text-sm font-bold ${modo === m ? "text-primary-700" : "text-texto"}`}>{titulo}</span>
      <span className="mt-0.5 block text-[12px] text-texto-3">{texto}</span>
    </button>
  );
  return (
    <section className="card space-y-2.5 p-4">
      <h2 id="como-trabajas" className="text-sm font-bold text-texto">
        ¿Cómo trabajás?
      </h2>
      <div role="radiogroup" aria-labelledby="como-trabajas" className="flex flex-wrap gap-2">
        {opcion(
          "SIMPLE",
          "Solo/a (simple)",
          "Agendás en tres toques, la cita nace confirmada y se cierra con Cobrar o No vino.",
        )}
        {opcion(
          "COMPLETO",
          "Con personal (completo)",
          "Recepción confirma, marca Llegó, Atender y Finalizar, y ve todas las opciones.",
        )}
      </div>
      <ErrorMsg>{error}</ErrorMsg>
    </section>
  );
}

function Contenido({
  pestana,
  servicios,
  recursos,
  sucursales,
  recargarServicios,
  recargarRecursos,
  irA,
}: {
  pestana: Pestana;
  servicios: Servicio[];
  recursos: Recurso[];
  sucursales: Sucursal[];
  recargarServicios: () => void;
  recargarRecursos: () => void;
  irA: (p: Pestana) => void;
}) {
  // Un servicio dice quién lo hace y un recurso qué servicios hace: es la
  // misma relación vista de los dos lados, así que guardar una recarga ambas.
  const recargarTodo = () => {
    recargarServicios();
    recargarRecursos();
  };

  switch (pestana) {
    case "servicios":
      return <TabServicios servicios={servicios} recursos={recursos} onCambio={recargarTodo} />;
    case "recursos":
      return (
        <TabRecursos
          recursos={recursos}
          servicios={servicios}
          sucursales={sucursales}
          onCambio={recargarTodo}
        />
      );
    case "horarios":
      return <TabHorarios recursos={recursos} sucursales={sucursales} irA={irA} />;
    case "excepciones":
      return <TabExcepciones recursos={recursos} irA={irA} />;
    case "bloqueos":
      return <TabBloqueos recursos={recursos} sucursales={sucursales} />;
    case "reservas":
      return <TabReservaOnline servicios={servicios} recursos={recursos} onCambio={recargarTodo} />;
    case "espacios":
      return <TabEspacios recursos={recursos} irA={irA} />;
    case "paquetes":
      return <TabPaquetes servicios={servicios} />;
    case "consentimientos":
      return <TabConsentimientos />;
  }
}
