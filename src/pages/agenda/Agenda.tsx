import { useMemo, useState } from "react";
import { Chips } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { AvisoOk, Boton, Cargando, ErrorMsg, Select, useAviso } from "../../components/ui";
import { apiAgenda, huecosDelConflicto, mensajeDe } from "../../lib/agenda/apiAgenda";
import { accionesRapidas, vaEnGrilla } from "../../lib/agenda/estadosCita";
import {
  capitalizar,
  fechaLarga,
  fechaNegocio,
  horaNegocio,
  sumarDias,
} from "../../lib/agenda/horaAgenda";
import { citaMovida, moverLineas } from "../../lib/agenda/lineasCita";
import type { AgendaDia, Cita } from "../../lib/agenda/tiposAgenda";
import { useConsultaPeriodica } from "../../lib/agenda/useConsultaPeriodica";
import { useEsCelular } from "../../lib/agenda/useEsCelular";
import { useSucursalAgenda } from "../../lib/agenda/useSucursalAgenda";
import { etiquetaRol, tieneFeature } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import ColaEspera from "./ColaEspera";
import DetalleCita from "./DetalleCita";
import GrillaDia from "./GrillaDia";
import NuevaCita, { type PrecargaCita } from "./NuevaCita";
import TarjetaCita from "./TarjetaCita";
import { useAccionRapida } from "./useAccionRapida";
import { useCobrarCita } from "./useCobrarCita";
import CampanaAvisos from "./CampanaAvisos";

/** Reemplaza (o agrega) una cita en la agenda del día y la saca de la cola si dejó de estar. */
function conCita(d: AgendaDia | null, c: Cita): AgendaDia | null {
  if (!d) return d;
  const enGrilla = c.estado !== "EN_COLA";
  const citas = d.citas.some((x) => x.id === c.id)
    ? d.citas.map((x) => (x.id === c.id ? c : x))
    : enGrilla
      ? [...d.citas, c]
      : d.citas;
  const cola = enGrilla ? d.cola.filter((x) => x.id !== c.id) : d.cola.map((x) => (x.id === c.id ? c : x));
  return { ...d, citas, cola };
}

/**
 * A1 · Agenda del día (Main.dc del lienzo): columnas por profesional, la cola
 * al costado, y en el celular un profesional por vez o la lista.
 *
 * Se vuelve a consultar sola cada 45 s (§9.1), en pausa mientras se arrastra
 * una cita o hay un formulario abierto.
 */
export default function Agenda() {
  const { negocio } = useAuth();
  const cobrar = useCobrarCita();
  const suc = useSucursalAgenda();
  const esCelular = useEsCelular();
  const [fecha, setFecha] = useState(fechaNegocio());
  const [abierta, setAbierta] = useState<Cita | null>(null);
  const [nueva, setNueva] = useState<PrecargaCita | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [vistaCel, setVistaCel] = useState<"grilla" | "lista">("grilla");
  const [recursoCel, setRecursoCel] = useState<number | null>(null);
  const [aviso, setAviso] = useAviso(5000);
  const [errorMover, setErrorMover] = useState("");

  const conCola = tieneFeature(negocio?.features, "cola_walkin");
  const etiquetaProfesional = etiquetaRol("PROFESIONAL", negocio);

  const dia = useConsultaPeriodica(
    () =>
      suc.listo
        ? apiAgenda.dia(fecha, suc.sucursalId)
        : new Promise<AgendaDia>(() => {
            /* espera a saber la sucursal */
          }),
    [fecha, suc.sucursalId, suc.listo],
    { pausado: arrastrando || nueva !== null || abierta !== null },
  );
  // La granularidad decide de a cuánto se mueve una cita al arrastrarla. Si
  // las reglas no llegan, 15 min (el defecto del rubro).
  const reglas = useApi(
    () => (suc.listo ? apiAgenda.reglas(suc.sucursalId) : Promise.resolve(null)),
    [suc.sucursalId, suc.listo],
  );
  const granularidad = reglas.datos?.granularidadMin || 15;

  const datos = dia.datos;
  const recursos = useMemo(
    () => [...(datos?.recursos ?? [])].sort((a, b) => a.orden - b.orden),
    [datos?.recursos],
  );
  const citas = useMemo(() => datos?.citas ?? [], [datos?.citas]);
  const porCobrar = citas.filter((c) => c.estado === "POR_COBRAR");
  const sugeridas = citas.filter((c) => c.noShowSugerido);
  const nombreRecurso = (id: number) => recursos.find((r) => r.id === id)?.nombre ?? "Profesional";

  const rapida = useAccionRapida((c) => dia.setDatos((d) => conCita(d, c)));

  const esHoy = fecha === fechaNegocio();
  const titulo = `${esHoy ? "Hoy · " : ""}${esHoy ? fechaLarga(fecha) : capitalizar(fechaLarga(fecha))}`;

  async function mover(cita: Cita, lineaId: number, deltaMin: number, destino: number) {
    setErrorMover("");
    const lineas = moverLineas(cita, lineaId, deltaMin, destino);
    // Se pinta en el lugar nuevo ya: esperar al backend con la cita "pegada"
    // al mouse se siente roto. Si dice que no, vuelve a donde estaba.
    dia.setDatos((d) => conCita(d, citaMovida(cita, lineas, nombreRecurso)));
    try {
      const movida = await apiAgenda.moverCita(cita.id, { lineas });
      dia.setDatos((d) => conCita(d, movida));
      setAviso(`${cita.cliente.nombre}: ahora a las ${horaNegocio(movida.inicio)} con ${movida.lineas[0]?.recurso ?? ""}`);
    } catch (e) {
      dia.setDatos((d) => conCita(d, cita));
      setErrorMover(
        huecosDelConflicto(e)
          ? "Ese horario se acaba de ocupar: la cita volvió a su lugar."
          : `No se pudo mover: ${mensajeDe(e)}`,
      );
    }
  }

  const recursosCel = recursoCel != null ? recursos.filter((r) => r.id === recursoCel) : recursos.slice(0, 1);
  const listaDelDia = [...citas]
    .filter((c) => vaEnGrilla(c.estado) && c.inicio)
    .sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""));

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-xl font-bold text-texto sm:text-2xl">Agenda</h1>
        <div className="flex items-center gap-1 rounded-xl border border-borde bg-white p-1">
          <button
            type="button"
            aria-label="Día anterior"
            onClick={() => setFecha((f) => sumarDias(f, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted"
          >
            <Icon name="chevronLeft" size={18} />
          </button>
          <span className="px-2 text-sm font-semibold text-texto">{capitalizar(titulo)}</span>
          <button
            type="button"
            aria-label="Día siguiente"
            onClick={() => setFecha((f) => sumarDias(f, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted"
          >
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
        {!esHoy && (
          <Boton variante="ghost" onClick={() => setFecha(fechaNegocio())}>
            Hoy
          </Boton>
        )}
        {suc.elegir && (
          <label className="flex items-center gap-2 text-sm text-texto-2">
            Sucursal
            <Select
              value={suc.sucursalId ?? ""}
              onChange={(e) => suc.setSucursalId(Number(e.target.value))}
              aria-label="Sucursal"
            >
              {suc.sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </label>
        )}
        <CampanaAvisos onAbrirCita={setAbierta} />
        <Boton icono="plus" onClick={() => setNueva({ fecha })} disabled={!suc.sucursalId && !datos?.sucursalId}>
          Nueva cita
        </Boton>
      </header>

      {!esCelular && <Leyenda />}

      <ErrorMsg>{errorMover}</ErrorMsg>
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{rapida.error}</ErrorMsg>
      <ErrorMsg onReintentar={dia.recargar}>{dia.error}</ErrorMsg>

      {dia.cargando && !datos ? (
        <Cargando texto="Cargando la agenda…" />
      ) : datos ? (
        esCelular ? (
          <div className="space-y-3">
            <Chips
              valor={vistaCel}
              opciones={[
                ["grilla", `Por ${etiquetaProfesional.toLowerCase()}`],
                ["lista", "Lista"],
              ]}
              onChange={setVistaCel}
            />
            {vistaCel === "grilla" ? (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {recursos.map((r) => {
                    const activo = (recursosCel[0]?.id ?? null) === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={activo}
                        onClick={() => setRecursoCel(r.id)}
                        className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                          activo ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2"
                        }`}
                      >
                        {r.nombre}
                      </button>
                    );
                  })}
                </div>
                <section className="card overflow-hidden">
                  <GrillaDia
                    fecha={fecha}
                    recursos={recursosCel}
                    citas={citas}
                    bloqueos={datos.bloqueos}
                    granularidad={granularidad}
                    detalleRecurso={(r) => (r.tipo === "ESPACIO" ? "Espacio" : etiquetaProfesional)}
                    onTocarHueco={(recursoId, hora) => setNueva({ fecha, recursoId, hora })}
                    onAbrirCita={setAbierta}
                  />
                </section>
              </>
            ) : (
              <div className="space-y-2.5">
                {listaDelDia.length === 0 && <p className="py-8 text-center text-sm text-texto-3">No hay citas este día.</p>}
                {listaDelDia.map((c) => (
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
            {conCola && (
              <ColaEspera cola={datos.cola} sucursalId={datos.sucursalId ?? suc.sucursalId} recursos={recursos} onCambio={dia.refrescar} />
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-4">
            <section aria-label={`Agenda por ${etiquetaProfesional.toLowerCase()}`} className="card min-w-0 flex-[999_1_560px] overflow-hidden">
              <GrillaDia
                fecha={fecha}
                recursos={recursos}
                citas={citas}
                bloqueos={datos.bloqueos}
                granularidad={granularidad}
                detalleRecurso={(r) => (r.tipo === "ESPACIO" ? "Espacio" : etiquetaProfesional)}
                onTocarHueco={(recursoId, hora) => setNueva({ fecha, recursoId, hora })}
                onAbrirCita={setAbierta}
                onMover={mover}
                onArrastrando={setArrastrando}
              />
            </section>
            <aside className="flex flex-[1_1_300px] flex-col gap-4">
              {conCola && (
                <ColaEspera cola={datos.cola} sucursalId={datos.sucursalId ?? suc.sucursalId} recursos={recursos} onCambio={dia.refrescar} />
              )}
              {porCobrar.length > 0 && (
                <section className="flex items-start gap-2.5 rounded-2xl border border-warning/40 bg-warning-bg p-4 text-warning-text">
                  <Icon name="alert" size={20} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-bold">
                      {porCobrar.length} {porCobrar.length === 1 ? "cita por cobrar" : "citas por cobrar"}
                    </p>
                    {porCobrar.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-[13px]">
                        <button type="button" onClick={() => setAbierta(c)} className="min-w-0 flex-1 truncate text-left underline-offset-2 hover:underline">
                          {c.cliente.nombre} · {horaNegocio(c.inicio)}
                        </button>
                        {cobrar && (
                          <button
                            type="button"
                            onClick={() => cobrar(c.id)}
                            className="shrink-0 rounded-lg bg-white/70 px-2.5 py-1 font-bold hover:bg-white"
                          >
                            Cobrar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {sugeridas.length > 0 && (
                <section className="card space-y-2 p-4">
                  <h2 className="text-sm font-bold text-texto">¿No vinieron?</h2>
                  <p className="text-[12px] text-texto-3">Pasaron 15 minutos de su hora y no marcaron "Llegó".</p>
                  {sugeridas.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setAbierta(c)}
                      className="flex w-full items-center justify-between rounded-xl border border-borde-soft px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="font-semibold text-texto">{c.cliente.nombre}</span>
                      <span className="text-texto-3">{horaNegocio(c.inicio)}</span>
                    </button>
                  ))}
                </section>
              )}
            </aside>
          </div>
        )
      ) : null}

      {abierta && (
        <DetalleCita
          cita={abierta}
          sucursal={suc.nombre}
          onClose={() => setAbierta(null)}
          onCambio={(c) => dia.setDatos((d) => conCita(d, c))}
        />
      )}
      {nueva && (datos?.sucursalId ?? suc.sucursalId) && (
        <NuevaCita
          sucursalId={(datos?.sucursalId ?? suc.sucursalId) as number}
          precarga={nueva}
          granularidad={granularidad}
          onClose={() => setNueva(null)}
          onCreada={(c) => {
            setNueva(null);
            dia.setDatos((d) => conCita(d, c));
            setAviso(`Cita agendada: ${c.cliente.nombre} a las ${horaNegocio(c.inicio)}`);
            dia.refrescar();
          }}
        />
      )}
      {rapida.dialogo}
    </div>
  );
}

/** Qué quiere decir cada color, como en el lienzo. */
function Leyenda() {
  const item = (clases: string, texto: string, estilo?: React.CSSProperties) => (
    <span className="flex items-center gap-1.5 rounded-full border border-borde bg-white px-2.5 py-1">
      <span className={`h-2.5 w-2.5 rounded-[3px] border ${clases}`} style={estilo} />
      {texto}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-2 text-[12px] text-texto-2">
      {item("bg-primary-50 border-primary", "Reservada / confirmada")}
      {item("bg-info-bg border-info-text", "Llegó")}
      {item("bg-primary-boton border-primary-boton", "En atención")}
      {item("bg-warning-bg border-warning-text", "Por cobrar")}
      {item("bg-white border-dashed border-primary", "Solicitud online")}
      {item("border-borde", "Bloqueo", {
        backgroundImage: "repeating-linear-gradient(135deg, var(--color-borde-soft) 0 3px, var(--color-borde) 3px 6px)",
      })}
    </div>
  );
}
