import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ChipCupo from "../../components/ChipCupo";
import { Chips } from "../../components/filtros";
import { AvisoOk, Boton, Cargando, ErrorMsg, Select, Vacio, useAviso } from "../../components/ui";
import { apiAgenda } from "../../lib/agenda/apiAgenda";
import { accionesRapidas } from "../../lib/agenda/estadosCita";
import { capitalizar, fechaLarga, fechaNegocio, horaNegocio } from "../../lib/agenda/horaAgenda";
import type { AgendaHoy, Cita, ContadoresHoy, EstadoCita } from "../../lib/agenda/tiposAgenda";
import { useConsultaPeriodica } from "../../lib/agenda/useConsultaPeriodica";
import { useSucursalAgenda } from "../../lib/agenda/useSucursalAgenda";
import { gestionaCola, tieneFeature } from "../../lib/permisos";
import { useAuth } from "../../store/AuthContext";
import ColaEspera from "./ColaEspera";
import DetalleCita from "./DetalleCita";
import NuevaCita from "./NuevaCita";
import TarjetaCita from "./TarjetaCita";
import { useAccionRapida } from "./useAccionRapida";
import { useCobrarCita } from "./useCobrarCita";
import CampanaAvisos from "./CampanaAvisos";

type Filtro = "todas" | "confirmar" | "cobrar" | "online" | "noshow";

/** Lo que ya pasó no estorba en la lista de recepción: se ve en la agenda. */
const FUERA_DE_HOY: EstadoCita[] = ["CANCELADA", "RECHAZADA", "EXPIRADA", "ABANDONADA", "EN_COLA"];

function filtrar(citas: Cita[], f: Filtro): Cita[] {
  switch (f) {
    case "confirmar":
      return citas.filter((c) => c.estado === "RESERVADA" || c.estado === "SOLICITADA");
    case "cobrar":
      return citas.filter((c) => c.estado === "POR_COBRAR");
    case "online":
      return citas.filter((c) => c.origen === "ONLINE");
    case "noshow":
      return citas.filter((c) => c.noShowSugerido);
    default:
      return citas;
  }
}

/**
 * Los contadores de arriba, con la misma cuenta que hace el backend en
 * `GET /agenda/hoy`. Las solicitudes online son de cualquier día y no salen
 * de esta lista: se dejan como vinieron.
 */
function contadoresDe(citas: Cita[], cola: Cita[], previos?: ContadoresHoy): ContadoresHoy {
  const cuenta = (estados: EstadoCita[]) => citas.filter((c) => estados.includes(c.estado)).length;
  return {
    porConfirmar: cuenta(["RESERVADA", "SOLICITADA"]),
    enEspera: cuenta(["EN_ESPERA"]) + cola.length,
    enAtencion: cuenta(["EN_ATENCION"]),
    porCobrar: cuenta(["POR_COBRAR"]),
    noShowSugeridos: citas.filter((c) => c.noShowSugerido).length,
    ...(previos?.solicitudes !== undefined ? { solicitudes: previos.solicitudes } : {}),
  };
}

function conCita(d: AgendaHoy | null, c: Cita): AgendaHoy | null {
  if (!d) return d;
  const citas = d.citas.some((x) => x.id === c.id) ? d.citas.map((x) => (x.id === c.id ? c : x)) : [...d.citas, c];
  const cola = d.cola.filter((x) => x.id !== c.id || c.estado === "EN_COLA");
  // Las tarjetas se recalculan junto con la lista (QA M-10): si no, "Llegaron"
  // y "Por confirmar" quedaban desfasados hasta la siguiente consulta.
  return { ...d, citas, cola, contadores: contadoresDe(citas, cola, d.contadores) };
}

/**
 * A3 · Hoy (Hoy.dc del lienzo): la lista de recepción, en orden, con los
 * botones del momento —Llegó · Atender · Finalizar · No vino · Cobrar—.
 * "Cobrar" abre el POS con la cita cargada. Con la feature `cola_walkin`
 * suma la pestaña de la cola (A6).
 */
export default function Hoy() {
  const { negocio, puede, usuario } = useAuth();
  const suc = useSucursalAgenda();
  const [pestana, setPestana] = useState<"citas" | "cola">("citas");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [abierta, setAbierta] = useState<Cita | null>(null);
  const [nueva, setNueva] = useState(false);
  const [aviso, setAviso] = useAviso(5000);
  // La cola es de recepción: el profesional no la ve ni anota (el backend le
  // da la cola vacía y 403 al anotar).
  const conCola = tieneFeature(negocio?.features, "cola_walkin") && gestionaCola(usuario);

  const hoy = useConsultaPeriodica(
    () =>
      suc.listo
        ? apiAgenda.hoy(suc.sucursalId)
        : new Promise<AgendaHoy>(() => {
            /* espera a saber la sucursal */
          }),
    [suc.sucursalId, suc.listo],
    { pausado: nueva || abierta !== null },
  );
  const rapida = useAccionRapida((c) => hoy.setDatos((d) => conCita(d, c)));
  const cobrar = useCobrarCita();

  const citas = useMemo(
    () =>
      (hoy.datos?.citas ?? [])
        .filter((c) => !FUERA_DE_HOY.includes(c.estado))
        .sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? "")),
    [hoy.datos?.citas],
  );
  const cola = hoy.datos?.cola ?? [];
  const k = hoy.datos?.contadores;
  const visibles = filtrar(citas, filtro);
  const cuenta = (f: Filtro) => filtrar(citas, f).length;

  const opciones: (readonly [Filtro, string])[] = [
    ["todas", `Todas · ${citas.length}`],
    ["confirmar", `Por confirmar · ${cuenta("confirmar")}`],
    ["cobrar", `Por cobrar · ${cuenta("cobrar")}`],
    ["online", `Online · ${cuenta("online")}`],
  ];
  if (cuenta("noshow") > 0) opciones.push(["noshow", `No llegaron · ${cuenta("noshow")}`]);

  const sucursalId = suc.sucursalId;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-texto">Hoy</h1>
          <p className="text-[13px] text-texto-3">
            {capitalizar(fechaLarga(fechaNegocio()))}
            {suc.nombre ? ` · ${suc.nombre}` : ""}
          </p>
        </div>
        {suc.elegir && (
          <Select
            aria-label="Sucursal"
            value={suc.sucursalId ?? ""}
            onChange={(e) => suc.setSucursalId(Number(e.target.value))}
          >
            {suc.sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        )}
        {/* Plan Emprendedor: "Citas hoy 12/25 · Créditos 240". Sin cupo no existe. */}
        <ChipCupo unidad="CITA" />
        <CampanaAvisos onAbrirCita={(c) => setAbierta(c)} />
        <Boton icono="plus" onClick={() => setNueva(true)} disabled={!sucursalId}>
          Nueva cita
        </Boton>
      </header>

      {k && (
        <dl className="grid grid-cols-4 gap-2">
          <Contador etiqueta="Llegaron" valor={k.enEspera} />
          <Contador etiqueta="En atención" valor={k.enAtencion} />
          <Contador etiqueta="Por cobrar" valor={k.porCobrar} alerta={k.porCobrar > 0} />
          <Contador etiqueta="Por confirmar" valor={k.porConfirmar} />
        </dl>
      )}

      {/* A9: lo que entró por la página de reservas y espera respuesta. */}
      {!!k?.solicitudes && puede("solicitudes") && (
        <Link
          to="/solicitudes"
          className="flex items-center justify-between gap-2 rounded-xl bg-info-bg px-4 py-3 text-sm font-semibold text-info-text"
        >
          {k.solicitudes === 1 ? "1 solicitud online por aprobar" : `${k.solicitudes} solicitudes online por aprobar`}
          <span aria-hidden>→</span>
        </Link>
      )}

      {conCola && (
        <div role="tablist" className="flex gap-1 rounded-xl border border-borde bg-white p-1">
          {(
            [
              ["citas", `Citas · ${citas.length}`],
              ["cola", `Cola · ${cola.length}`],
            ] as const
          ).map(([id, texto]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={pestana === id}
              onClick={() => setPestana(id)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                pestana === id ? "bg-primary-50 text-primary-700" : "text-texto-2 hover:bg-muted"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
      )}

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{rapida.error}</ErrorMsg>
      <ErrorMsg onReintentar={hoy.recargar}>{hoy.error}</ErrorMsg>

      {hoy.cargando && !hoy.datos ? (
        <Cargando texto="Cargando el día…" />
      ) : pestana === "cola" && conCola ? (
        <ColaEspera cola={cola} sucursalId={sucursalId} onCambio={hoy.refrescar} />
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto px-1">
            <Chips valor={filtro} opciones={opciones} onChange={setFiltro} />
          </div>
          {visibles.length === 0 ? (
            <Vacio
              icono="calendar"
              titulo={filtro === "todas" ? "No hay citas para hoy" : "Nada en este filtro"}
              texto={filtro === "todas" ? "Agendá la primera con «Nueva cita»." : undefined}
            />
          ) : (
            <div className="space-y-2.5">
              {visibles.map((c) => (
                <TarjetaCita
                  key={c.id}
                  cita={c}
                  rapidas={accionesRapidas(c, { ahora: Date.now() })}
                  onAbrir={() => setAbierta(c)}
                  onAccion={(a) => rapida.pedir(c, a)}
                  onCobrar={cobrar ? () => cobrar(c.id) : undefined}
                  ocupado={rapida.ocupadoId === c.id}
                />
              ))}
            </div>
          )}
        </>
      )}

      {abierta && (
        <DetalleCita
          cita={abierta}
          sucursal={suc.nombre}
          onClose={() => setAbierta(null)}
          onCambio={(c) => hoy.setDatos((d) => conCita(d, c))}
        />
      )}
      {nueva && sucursalId && (
        <NuevaCita
          sucursalId={sucursalId}
          onClose={() => setNueva(false)}
          onCreada={(c) => {
            setNueva(false);
            setAviso(`Cita agendada: ${c.cliente.nombre} a las ${horaNegocio(c.inicio)}`);
            hoy.refrescar();
          }}
        />
      )}
      {rapida.dialogo}
    </div>
  );
}

function Contador({ etiqueta, valor, alerta = false }: { etiqueta: string; valor: number; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border px-2.5 py-1.5 sm:px-3 sm:py-2 ${alerta ? "border-warning/40 bg-warning-bg" : "border-borde bg-white"}`}>
      <dt className={`truncate text-[10px] font-semibold uppercase tracking-wide sm:text-[11px] ${alerta ? "text-warning-text" : "text-texto-3"}`}>
        {etiqueta}
      </dt>
      <dd className={`text-base font-bold sm:text-lg ${alerta ? "text-warning-text" : "text-texto"}`}>{valor}</dd>
    </div>
  );
}
