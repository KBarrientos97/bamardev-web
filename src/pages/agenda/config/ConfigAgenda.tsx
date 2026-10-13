import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EncabezadoPagina, FILA_DESLIZABLE } from "../../../components/filtros";
import { Icon, type NombreIcono } from "../../../components/Icon";
import { Cargando, ErrorMsg } from "../../../components/ui";
import { api } from "../../../lib/api";
import { apiConfigAgenda } from "../../../lib/agenda/apiConfigAgenda";
import { modoDe, olvidarModos } from "../../../lib/agenda/modoAgenda";
import type { ModoAgenda } from "../../../lib/agenda/tiposAgenda";
import { tieneFeature } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import type { Almacen } from "../../../types";
import type { Recurso, Servicio } from "../../../lib/agenda/tiposConfigAgenda";
import { useNombreProfesional, type Pestana, type Sucursal } from "./utilConfig";
import { HistorialReglas, ReglasInternas, ReglasOnline } from "./ReglasNegocio";
import TabBloqueos from "./TabBloqueos";
import TabExcepciones from "./TabExcepciones";
import TabHorarios from "./TabHorarios";
import TabRecursos from "./TabRecursos";
import TabReservaOnline from "./TabReservaOnline";
import TabServicios from "./TabServicios";
// Fase 3 (spa): cada sección sólo aparece con su feature.
import TabConsentimientos from "./TabConsentimientos";
import TabEspacios from "./TabEspacios";
import TabPaquetes from "./TabPaquetes";
import { useSpa } from "../../../lib/agenda/spa";

/**
 * A8 + A11 · Configuración de la agenda (PLAN-AGENDA-BELLEZA §5.1 y §8.9):
 * todo lo que hay que cargar antes de poder dar una cita y las reglas con que
 * se dan, en una sola pantalla.
 *
 * Eran nueve pestañas sueltas más una pantalla aparte de "Configuración del
 * negocio", y al dueño le resultaba un laberinto. Ahora son cinco temas
 * (Servicios · Equipo y horarios · Días libres · Reserva online · Reglas);
 * cada uno junta las pestañas de antes como secciones. En la compu el menú de
 * temas va a la izquierda con una línea que dice qué hay adentro; en el
 * celular y la tablet arriba, bajando de renglón (nada scrollea de costado).
 *
 * La URL sigue siendo `?pestana=`: acepta el tema (`equipo`) o la sección de
 * siempre (`horarios`, `reservas`…), así los enlaces viejos siguen llevando al
 * mismo lugar y un F5 no te devuelve a Servicios en medio de cargar horarios.
 *
 * Servicios, recursos y sucursales se cargan una vez acá arriba porque los
 * usan casi todas las secciones (un servicio dice quién lo hace; un horario es
 * de un recurso en una sucursal) y así cambiar de tema no vuelve a pedir lo
 * mismo.
 *
 * Permisos: lo de la agenda pide `agenda_config` (el dueño y el encargado);
 * las reglas del negocio, `config_negocio` (sólo el dueño). Quien no tiene
 * las reglas no las ve, ni en "Reserva online" ni en "Reglas".
 *
 * "¿Cómo trabajás?" (IDEAS/7-AGENDA-SIMPLE) vive en Reglas; arriba queda sólo
 * un chip que dice el modo y lleva ahí. En simple el tema del equipo se llama
 * "Horario" y muestra sólo eso (el equipo, a un toque), y la reserva online
 * se pliega en "Más opciones" salvo que el negocio la tenga contratada.
 */

/** Los cinco temas: lo que se ve en el menú. */
export type Tema = "servicios" | "equipo" | "dias" | "online" | "reglas";
const TEMAS: Tema[] = ["servicios", "equipo", "dias", "online", "reglas"];

/** A qué tema pertenece cada sección de antes (y cada enlace viejo). */
const TEMA_DE: Record<Pestana, Tema> = {
  servicios: "servicios",
  paquetes: "servicios",
  consentimientos: "servicios",
  recursos: "equipo",
  espacios: "equipo",
  horarios: "equipo",
  excepciones: "dias",
  bloqueos: "dias",
  reservas: "online",
};

const ICONO: Record<Tema, NombreIcono> = {
  servicios: "tag",
  equipo: "users",
  dias: "calendar",
  online: "pantalla",
  reglas: "perillas",
};

const esTema = (x: string | null): x is Tema => !!x && (TEMAS as string[]).includes(x);
const esPestana = (x: string | null): x is Pestana => !!x && x in TEMA_DE;

export default function ConfigAgenda() {
  const { puede, negocio } = useAuth();
  const nombres = useNombreProfesional();
  const spa = useSpa();
  // Lo de la agenda y las reglas del dueño son permisos distintos (permisos.ts).
  const veAgenda = puede("agenda_config");
  const veReglas = puede("config_negocio");

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

  /** Las secciones de cada tema, ya filtradas por las features del spa. */
  const secciones: Record<Tema, Pestana[]> = {
    servicios: [
      "servicios",
      ...(spa.paquetes ? (["paquetes"] as Pestana[]) : []),
      ...(spa.consentimientos ? (["consentimientos"] as Pestana[]) : []),
    ],
    equipo: ["recursos", ...(spa.espacios ? (["espacios"] as Pestana[]) : []), "horarios"],
    dias: ["excepciones", "bloqueos"],
    online: ["reservas"],
    reglas: [],
  };
  // El que trabaja solo entra a su horario; el equipo queda a un toque.
  const seccionPorDefecto = (t: Tema): Pestana | null =>
    t === "equipo" && simple ? "horarios" : (secciones[t][0] ?? null);

  // Qué temas puede ver: la agenda con `agenda_config`; Reserva online y
  // Reglas también con sólo las reglas (entra por /configuracion/negocio).
  const permitidos = TEMAS.filter((t) =>
    t === "online" || t === "reglas" ? veAgenda || veReglas : veAgenda,
  );

  const [params, setParams] = useSearchParams();
  const pedida = params.get("pestana");
  // `?pestana=` acepta el tema o una sección de antes. Una sección de una
  // feature que el negocio no tiene no lleva a la nada: cae al primer tema.
  const pedidaValida: Pestana | null =
    esPestana(pedida) && Object.values(secciones).some((s) => s.includes(pedida)) ? pedida : null;
  const temaPedido: Tema | null = esTema(pedida) ? pedida : pedidaValida ? TEMA_DE[pedidaValida] : null;
  // Sin pedir nada se entra a Servicios; quien sólo tiene las reglas, a Reglas.
  const tema: Tema =
    temaPedido && permitidos.includes(temaPedido) ? temaPedido : veAgenda ? "servicios" : "reglas";
  const seccion: Pestana | null =
    pedidaValida && TEMA_DE[pedidaValida] === tema ? pedidaValida : seccionPorDefecto(tema);

  // En simple, la reserva online va plegada salvo que el negocio la tenga
  // contratada (entonces es del día a día) o que se la esté mirando.
  const [masOpciones, setMasOpciones] = useState(false);
  const plegarOnline = veAgenda && simple && !tieneFeature(negocio?.features, "reserva_online");
  const visibles = permitidos.filter((t) => t !== "online" || !plegarOnline || masOpciones || tema === "online");

  const elegir = (p: Tema | Pestana) => {
    const nuevos = new URLSearchParams(params);
    nuevos.set("pestana", p);
    setParams(nuevos, { replace: true });
  };

  // El chip del modo lleva a Reglas y deja a la vista "¿Cómo trabajás?".
  const [verModo, setVerModo] = useState(0);
  useEffect(() => {
    if (!verModo) return;
    const el = document.getElementById("como-trabajas");
    el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [verModo]);

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

  // Sin `agenda_config` no se piden: el backend contestaría 403 y no hacen falta.
  const servicios = useApi(
    () => (veAgenda ? apiConfigAgenda.servicios() : Promise.resolve([] as Servicio[])),
    [veAgenda],
  );
  const recursos = useApi(
    () => (veAgenda ? apiConfigAgenda.recursos(true) : Promise.resolve([] as Recurso[])),
    [veAgenda],
  );
  const almacenes = useApi(() => (veAgenda ? api.getSucursales() : Promise.resolve([] as Almacen[])), [veAgenda]);

  // Un depósito no atiende a nadie: no tiene agenda.
  const sucursales: Sucursal[] = useMemo(
    () =>
      (almacenes.datos ?? ([] as Almacen[]))
        .filter((a) => a.activo && a.tipo !== "DEPOSITO")
        .map((a) => ({ id: a.id, nombre: a.nombre })),
    [almacenes.datos],
  );

  // Cada vez que se guardan reglas, el historial se vuelve a pedir.
  const [versionHistorial, setVersionHistorial] = useState(0);
  const alGuardarReglas = () => setVersionHistorial((v) => v + 1);

  const temaInfo: Record<Tema, { etiqueta: string; descripcion: string }> = {
    servicios: {
      etiqueta: "Servicios",
      // Nombra sólo lo que el negocio tiene del spa.
      descripcion:
        spa.paquetes && spa.consentimientos
          ? "Qué ofrecés, paquetes y lo que se firma."
          : spa.paquetes
            ? "Qué ofrecés y los paquetes de sesiones."
            : spa.consentimientos
              ? "Qué ofrecés y lo que se firma antes."
              : "Qué ofrecés, cuánto dura y cuánto cuesta.",
    },
    equipo: simple
      ? { etiqueta: "Horario", descripcion: "Los días y horas en que atendés." }
      : { etiqueta: "Equipo y horarios", descripcion: "Quién atiende y en qué horario." },
    dias: { etiqueta: "Días libres", descripcion: "Feriados, vacaciones y horas bloqueadas." },
    online: { etiqueta: "Reserva online", descripcion: "Tu enlace para que te reserven solos." },
    reglas: { etiqueta: "Reglas", descripcion: "Cómo trabajás y cómo se arma la agenda." },
  };

  const seccionInfo: Record<Pestana, { etiqueta: string; descripcion: string }> = {
    servicios: { etiqueta: "Servicios", descripcion: "Qué ofrecés, cuánto dura, cuánto cuesta y quién lo hace." },
    paquetes: { etiqueta: "Paquetes", descripcion: "Sesiones que se venden juntas y se van usando." },
    consentimientos: { etiqueta: "Consentimientos", descripcion: "Lo que el cliente firma antes de ciertos servicios." },
    recursos: {
      etiqueta: `${nombres.plural} y espacios`,
      descripcion: "Quién atiende, en qué sucursal y qué servicios hace.",
    },
    espacios: { etiqueta: "Tipos de espacio", descripcion: "Las cabinas o salas que pide cada servicio." },
    horarios: { etiqueta: "Horarios", descripcion: "La semana tipo de cada uno, por sucursal." },
    // En simple se lee como lo que es para el que trabaja solo.
    excepciones: simple
      ? { etiqueta: "Días cerrados", descripcion: "Un día que no atendés o que atendés en otro horario." }
      : { etiqueta: "Excepciones", descripcion: "Un día puntual en que alguien no trabaja o cambia su horario." },
    bloqueos: { etiqueta: "Bloqueos", descripcion: "Vacaciones, un curso o un feriado: horas en que no se agenda." },
    reservas: { etiqueta: "Reserva online", descripcion: "" },
  };

  const necesitaDatos = tema !== "reglas";
  const cargando = servicios.cargando || recursos.cargando;
  const error = servicios.error || recursos.error;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Configuración de la agenda"
        subtitulo="Qué se atiende, quién lo hace, cuándo y con qué reglas."
        accion={
          veAgenda ? (
            <ChipModo
              simple={simple}
              onClick={() => {
                elegir("reglas");
                setVerModo((v) => v + 1);
              }}
            />
          ) : undefined
        }
      />

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <nav aria-label="Temas de la configuración" className="lg:card lg:sticky lg:top-4 lg:p-2">
          <div
            role="tablist"
            aria-label="Temas de la configuración"
            // En el celular, una fila que se desliza: partidos en renglones
            // los temas ocupaban tres antes de llegar a lo que se configura.
            className={`flex flex-wrap gap-2 lg:flex-col lg:gap-1 ${FILA_DESLIZABLE}`}
          >
            {visibles.map((t) => {
              const activo = tema === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  id={`tab-${t}`}
                  aria-label={temaInfo[t].etiqueta}
                  aria-describedby={`desc-${t}`}
                  aria-selected={activo}
                  aria-controls={`panel-${t}`}
                  onClick={() => elegir(t)}
                  className={`relative inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors lg:flex lg:w-full lg:items-start lg:gap-3 lg:rounded-xl lg:border-transparent lg:px-3 lg:py-2.5 lg:text-left ${
                    activo
                      ? "border-transparent bg-primary-boton text-white lg:bg-primary-50 lg:text-primary-700 lg:before:absolute lg:before:inset-y-2 lg:before:left-0 lg:before:w-1 lg:before:rounded-full lg:before:bg-primary"
                      : "border-borde bg-white text-texto-2 hover:bg-muted lg:bg-transparent"
                  }`}
                >
                  <Icon name={t === "equipo" && simple ? "clock" : ICONO[t]} size={17} className="shrink-0 lg:mt-0.5" />
                  <span className="min-w-0">
                    <span className="block">{temaInfo[t].etiqueta}</span>
                    <span
                      id={`desc-${t}`}
                      className={`hidden text-xs font-normal lg:block ${activo ? "text-primary-700" : "text-texto-3"}`}
                    >
                      {temaInfo[t].descripcion}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {plegarOnline && (
            <button
              type="button"
              aria-expanded={visibles.includes("online")}
              onClick={() => {
                const abiertas = visibles.includes("online");
                setMasOpciones(!abiertas);
                // Al plegar, si se estaba mirando la plegada, al primer tema.
                if (abiertas && tema === "online") elegir("servicios");
              }}
              className="mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold text-primary-700 hover:bg-primary-50 lg:w-full"
            >
              <Icon name={visibles.includes("online") ? "chevronDown" : "masH"} size={15} />
              {visibles.includes("online") ? "Menos opciones" : "Más opciones"}
            </button>
          )}
        </nav>

        <div
          role="tabpanel"
          id={`panel-${tema}`}
          aria-labelledby={`tab-${tema}`}
          className="mt-4 min-w-0 space-y-4 lg:mt-0"
        >
          {necesitaDatos && veAgenda && error ? (
            <ErrorMsg
              onReintentar={() => {
                servicios.recargar();
                recursos.recargar();
              }}
            >
              {error}
            </ErrorMsg>
          ) : necesitaDatos && veAgenda && cargando && (!servicios.datos || !recursos.datos) ? (
            <Cargando />
          ) : (
            <ContenidoTema
              tema={tema}
              seccion={seccion}
              secciones={secciones[tema]}
              seccionInfo={seccionInfo}
              simple={simple}
              veAgenda={veAgenda}
              veReglas={veReglas}
              servicios={servicios.datos ?? []}
              recursos={recursos.datos ?? []}
              sucursales={sucursales}
              recargarServicios={servicios.recargar}
              recargarRecursos={recursos.recargar}
              irA={elegir}
              modo={modo}
              guardandoModo={guardandoModo}
              errorModo={errorModo}
              onCambiarModo={cambiarModo}
              versionHistorial={versionHistorial}
              onReglasGuardadas={alGuardarReglas}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** "Modo: Solo/a · Cambiar": dice cómo está la agenda y lleva a cambiarlo. */
function ChipModo({ simple, onClick }: { simple: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Los trozos van en spans separados por el gap: sin esto el lector los leía pegados.
      aria-label={`Modo: ${simple ? "Solo/a" : "Con personal"} · Cambiar`}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-[13px] text-primary-700 transition-colors hover:bg-primary-100"
    >
      <Icon name={simple ? "user" : "users"} size={15} />
      <span>
        Modo: <strong className="font-bold">{simple ? "Solo/a" : "Con personal"}</strong>
      </span>
      <span aria-hidden>·</span>
      <span className="font-semibold underline">Cambiar</span>
    </button>
  );
}

/**
 * El control de las secciones de un tema: botones que se prenden, del tamaño
 * de un dedo, que bajan de renglón si no entran.
 */
function SubSecciones({
  etiqueta,
  opciones,
  actual,
  info,
  onElegir,
}: {
  etiqueta: string;
  opciones: Pestana[];
  actual: Pestana;
  info: Record<Pestana, { etiqueta: string; descripcion: string }>;
  onElegir: (p: Pestana) => void;
}) {
  return (
    <div className="space-y-1.5">
      {opciones.length > 1 && (
        <div role="group" aria-label={etiqueta} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-borde bg-muted p-1">
          {opciones.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={actual === p}
              onClick={() => onElegir(p)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                actual === p ? "bg-white text-primary-700 shadow-sm" : "text-texto-3 hover:text-texto"
              }`}
            >
              {info[p].etiqueta}
            </button>
          ))}
        </div>
      )}
      {info[actual].descripcion && <p className="text-[13px] text-texto-3">{info[actual].descripcion}</p>}
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
    <section className="card space-y-2.5 p-4 sm:p-5" aria-labelledby="como-trabajas">
      <div>
        <h2 id="como-trabajas" className="text-[15px] font-bold text-texto">
          ¿Cómo trabajás?
        </h2>
        <p className="mt-0.5 text-[13px] text-texto-3">
          Vale para todo el negocio. Cambialo cuando quieras: no se borra nada.
        </p>
      </div>
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

function ContenidoTema({
  tema,
  seccion,
  secciones,
  seccionInfo,
  simple,
  veAgenda,
  veReglas,
  servicios,
  recursos,
  sucursales,
  recargarServicios,
  recargarRecursos,
  irA,
  modo,
  guardandoModo,
  errorModo,
  onCambiarModo,
  versionHistorial,
  onReglasGuardadas,
}: {
  tema: Tema;
  seccion: Pestana | null;
  secciones: Pestana[];
  seccionInfo: Record<Pestana, { etiqueta: string; descripcion: string }>;
  simple: boolean;
  veAgenda: boolean;
  veReglas: boolean;
  servicios: Servicio[];
  recursos: Recurso[];
  sucursales: Sucursal[];
  recargarServicios: () => void;
  recargarRecursos: () => void;
  irA: (p: Tema | Pestana) => void;
  modo: ModoAgenda;
  guardandoModo: boolean;
  errorModo: string;
  onCambiarModo: (m: ModoAgenda) => void;
  versionHistorial: number;
  onReglasGuardadas: () => void;
}) {
  // Un servicio dice quién lo hace y un recurso qué servicios hace: es la
  // misma relación vista de los dos lados, así que guardar una recarga ambas.
  const recargarTodo = () => {
    recargarServicios();
    recargarRecursos();
  };

  const seccionDe = (p: Pestana) => {
    switch (p) {
      case "servicios":
        return <TabServicios servicios={servicios} recursos={recursos} onCambio={recargarTodo} />;
      case "recursos":
        return <TabRecursos recursos={recursos} servicios={servicios} sucursales={sucursales} onCambio={recargarTodo} />;
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
  };

  const conSecciones = (etiqueta: string) =>
    seccion && (
      <>
        <SubSecciones etiqueta={etiqueta} opciones={secciones} actual={seccion} info={seccionInfo} onElegir={irA} />
        {/* La clave: cambiar de sección arranca la otra de cero, como antes al cambiar de pestaña. */}
        <div key={seccion}>{seccionDe(seccion)}</div>
      </>
    );

  switch (tema) {
    case "servicios":
      return conSecciones("Secciones de servicios");
    case "dias":
      return conSecciones("Secciones de días libres");
    case "equipo": {
      if (!seccion) return null;
      if (!simple) return conSecciones("Secciones del equipo");
      // En simple el tema es "Horario": el equipo existe (aunque sea uno
      // solo), pero no es lo que se viene a tocar todos los días.
      if (seccion === "horarios") {
        return (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-texto-3">{seccionInfo.horarios.descripcion}</p>
              <button
                type="button"
                onClick={() => irA("recursos")}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-primary-700 hover:bg-primary-50"
              >
                <Icon name="users" size={15} />
                Ver equipo
              </button>
            </div>
            <div key="horarios">{seccionDe("horarios")}</div>
          </>
        );
      }
      return (
        <>
          <button
            type="button"
            onClick={() => irA("horarios")}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-primary-700 hover:bg-primary-50"
          >
            <Icon name="arrowLeft" size={15} />
            Volver al horario
          </button>
          <SubSecciones
            etiqueta="Secciones del equipo"
            opciones={secciones.filter((p) => p !== "horarios")}
            actual={seccion}
            info={seccionInfo}
            onElegir={irA}
          />
          <div key={seccion}>{seccionDe(seccion)}</div>
        </>
      );
    }
    case "online":
      return (
        <>
          {veAgenda && seccionDe("reservas")}
          {veReglas && <ReglasOnline onGuardado={onReglasGuardadas} />}
        </>
      );
    case "reglas":
      return (
        <>
          {veAgenda && (
            <ComoTrabajas modo={modo} guardando={guardandoModo} error={errorModo} onCambiar={onCambiarModo} />
          )}
          {veReglas ? (
            <>
              <ReglasInternas onGuardado={onReglasGuardadas} />
              <HistorialReglas version={versionHistorial} />
            </>
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] text-primary-700">
              <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
              <span>Las demás reglas de la agenda (cada cuánto empiezan los turnos, el margen entre citas, cómo se confirman las reservas online) las decide el dueño.</span>
            </p>
          )}
        </>
      );
  }
}
