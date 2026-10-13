import { useMemo, useState, type ReactNode } from "react";
import ChipCupo from "../../components/ChipCupo";
import { Chips } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { AvisoOk, Boton, Cargando, ErrorMsg, Select, useAviso } from "../../components/ui";
import { apiAgenda, huecosDelConflicto, mensajeDe } from "../../lib/agenda/apiAgenda";
import { accionesRapidas, vaEnGrilla } from "../../lib/agenda/estadosCita";
import {
  capitalizar,
  diaCorto,
  fechaLarga,
  fechaNegocio,
  horaNegocio,
  sumarDias,
} from "../../lib/agenda/horaAgenda";
import { citaMovida, moverLineas } from "../../lib/agenda/lineasCita";
import { guardarVista, leerVista, useReglasAgenda, type VistaAgenda } from "../../lib/agenda/modoAgenda";
import type { AgendaDia, Cita } from "../../lib/agenda/tiposAgenda";
import { useConsultaPeriodica } from "../../lib/agenda/useConsultaPeriodica";
import { useAncho, useConsultaMedia } from "../../lib/agenda/useEsCelular";
import { useSucursalAgenda } from "../../lib/agenda/useSucursalAgenda";
import { etiquetaRol, gestionaCola, tieneFeature } from "../../lib/permisos";
import { useAuth } from "../../store/AuthContext";
import { Desplegable, Leyenda, PaginadorColumnas, SwitchVista } from "./BarraAgenda";
import ColaEspera from "./ColaEspera";
import DetalleCita from "./DetalleCita";
import GrillaDia from "./GrillaDia";
import NuevaCita, { type PrecargaCita } from "./NuevaCita";
import TarjetaCita from "./TarjetaCita";
import { useAccionRapida } from "./useAccionRapida";
import { useCobrarCita } from "./useCobrarCita";
import CampanaAvisos from "./CampanaAvisos";
// Fase 3 (spa): columnas por espacio y la pose partida en dos bloques.
import { idLineaReal, useSpa, vistaPorEspacio, vistaPorProfesional } from "../../lib/agenda/spa";

/**
 * Lo mínimo que mide una columna de la grilla. Por debajo, el nombre del
 * cliente ya no se lee: en vez de achicar más (o scrollear de costado), se
 * pagina de a los que entran.
 */
const MIN_COLUMNA = 120;
/** La columna de las horas de `GrillaDia`. */
const ANCHO_HORAS = 48;

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
 * A1 · Agenda del día (Main.dc del lienzo), en dos vistas que se eligen arriba
 * y se recuerdan por usuario: **calendario** (columnas por profesional, que
 * ocupan la pantalla) y **lista** (las tarjetas en orden, con sus botones).
 *
 * Reordenada el 12-oct por pedido del dueño: una sola barra compacta, lo
 * secundario en "Filtros", y la grilla nunca scrollea de costado: si no
 * entran todos los profesionales se ven de a N (en el celular, de a uno con
 * un selector).
 *
 * Se vuelve a consultar sola cada 45 s (§9.1), en pausa mientras se arrastra
 * una cita o hay un formulario abierto.
 */
export default function Agenda() {
  const { negocio, usuario } = useAuth();
  const cobrar = useCobrarCita();
  const suc = useSucursalAgenda();
  const [fecha, setFecha] = useState(fechaNegocio());
  const [abierta, setAbierta] = useState<Cita | null>(null);
  const [nueva, setNueva] = useState<PrecargaCita | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [vista, setVista] = useState<VistaAgenda>(() => leerVista(usuario?.id));
  const [desdeColumna, setDesdeColumna] = useState(0);
  const [aviso, setAviso] = useAviso(5000);
  const [errorMover, setErrorMover] = useState("");
  // De a uno en el celular; en el resto, los que entren a lo ancho.
  const angosto = useConsultaMedia("(max-width: 639px)");
  // La cola va al costado sólo si queda lugar para una grilla cómoda.
  const colaAlCostado = useConsultaMedia("(min-width: 1280px)");
  const [refGrilla, anchoGrilla] = useAncho();

  // La cola es de recepción: el profesional no la ve ni anota (el backend le
  // da la cola vacía y 403 al anotar).
  const conCola = tieneFeature(negocio?.features, "cola_walkin") && gestionaCola(usuario);
  const etiquetaProfesional = etiquetaRol("PROFESIONAL", negocio);
  const spa = useSpa();
  const [porEspacio, setPorEspacio] = useState(false);

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
  // La granularidad decide de a cuánto se mueve una cita al arrastrarla (si
  // las reglas no llegan, 15 min); el modo, qué botones lleva cada cita.
  const { reglas, modo, simple } = useReglasAgenda(suc.sucursalId, suc.listo);
  const granularidad = reglas?.granularidadMin || 15;

  const datos = dia.datos;
  const recursos = useMemo(
    () => [...(datos?.recursos ?? [])].sort((a, b) => a.orden - b.orden),
    [datos?.recursos],
  );
  const citas = useMemo(() => datos?.citas ?? [], [datos?.citas]);
  // Fase 3: con `espacios`, la grilla se puede ver por cabina; por
  // profesional, una línea con pose se dibuja en dos bloques y el hueco del
  // medio queda libre (ahí puede ir otra cita suya).
  const hayEspacios = spa.espacios && recursos.some((r) => r.tipo === "ESPACIO");
  const verPorEspacio = porEspacio && hayEspacios;
  const grilla = useMemo(
    () =>
      verPorEspacio ? vistaPorEspacio(recursos, citas) : vistaPorProfesional(recursos, citas, hayEspacios),
    [verPorEspacio, hayEspacios, recursos, citas],
  );
  /** La cita de verdad detrás de un bloque (la grilla puede traer una partida). */
  const original = (c: Cita) => citas.find((x) => x.id === c.id) ?? c;
  const porCobrar = citas.filter((c) => c.estado === "POR_COBRAR");
  const sugeridas = citas.filter((c) => c.noShowSugerido);
  const pendientes = porCobrar.length + sugeridas.length;
  const nombreRecurso = (id: number) => recursos.find((r) => r.id === id)?.nombre ?? "Profesional";

  const rapida = useAccionRapida((c) => dia.setDatos((d) => conCita(d, c)));

  // Las columnas que entran a lo ancho; sin el dato (todavía no se midió),
  // todas.
  const totalColumnas = grilla.recursos.length;
  const porPagina = angosto
    ? 1
    : anchoGrilla > 0
      ? Math.max(1, Math.floor((anchoGrilla - ANCHO_HORAS) / MIN_COLUMNA))
      : totalColumnas;
  const paginado = totalColumnas > porPagina;
  const inicioColumna = paginado ? Math.max(0, Math.min(desdeColumna, totalColumnas - porPagina)) : 0;
  const columnasVisibles = paginado
    ? grilla.recursos.slice(inicioColumna, inicioColumna + porPagina)
    : grilla.recursos;

  const esHoy = fecha === fechaNegocio();
  const [, mes, numDia] = fecha.split("-").map(Number);
  const tituloLargo = capitalizar(`${esHoy ? "Hoy · " : ""}${fechaLarga(fecha)}`);
  const tituloCorto = `${esHoy ? "Hoy · " : ""}${capitalizar(diaCorto(fecha).toLowerCase())} ${numDia}/${mes}`;

  function cambiarVista(v: VistaAgenda) {
    setVista(v);
    guardarVista(usuario?.id, v);
  }

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

  const listaDelDia = [...citas]
    .filter((c) => vaEnGrilla(c.estado) && c.inicio)
    .sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""));

  const hayFiltros = suc.elegir || hayEspacios;
  const filtrosActivos = verPorEspacio ? 1 : 0;

  const barra = (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-borde bg-white px-3 py-2 sm:px-4">
      <h1 className="sr-only">Agenda</h1>
      <div className="flex items-center rounded-xl border border-borde bg-white">
        <button
          type="button"
          aria-label="Día anterior"
          onClick={() => setFecha((f) => sumarDias(f, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted"
        >
          <Icon name="chevronLeft" size={18} />
        </button>
        <span className="px-1 text-sm font-semibold text-texto">
          <span className="sm:hidden">{tituloCorto}</span>
          <span className="hidden sm:inline">{tituloLargo}</span>
        </span>
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
        <button
          type="button"
          onClick={() => setFecha(fechaNegocio())}
          className="h-9 rounded-xl px-2.5 text-[13px] font-semibold text-primary-700 hover:bg-primary-50"
        >
          Hoy
        </button>
      )}
      <SwitchVista vista={vista} onCambiar={cambiarVista} />

      <div className="ml-auto flex items-center gap-2">
        {pendientes > 0 && (
          <Desplegable etiqueta="Pendientes" icono="alert" contador={pendientes} alerta>
            {(cerrar) => (
              <div className="space-y-3">
                {porCobrar.length > 0 && (
                  <section className="space-y-1.5">
                    <h2 className="text-sm font-bold text-texto">
                      {porCobrar.length} {porCobrar.length === 1 ? "cita por cobrar" : "citas por cobrar"}
                    </h2>
                    {porCobrar.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-[13px]">
                        <button
                          type="button"
                          onClick={() => {
                            cerrar();
                            setAbierta(c);
                          }}
                          className="min-w-0 flex-1 truncate text-left text-texto-2 underline-offset-2 hover:underline"
                        >
                          {c.cliente.nombre} · {horaNegocio(c.inicio)}
                        </button>
                        {cobrar && (
                          <button
                            type="button"
                            onClick={() => cobrar(c.id)}
                            className="shrink-0 rounded-lg bg-warning-bg px-2.5 py-1 font-bold text-warning-text hover:brightness-95"
                          >
                            Cobrar
                          </button>
                        )}
                      </div>
                    ))}
                  </section>
                )}
                {sugeridas.length > 0 && (
                  <section className="space-y-1.5">
                    <h2 className="text-sm font-bold text-texto">¿No vinieron?</h2>
                    <p className="text-[12px] text-texto-3">
                      {simple
                        ? "Pasaron 15 minutos de su hora y no se cobraron."
                        : 'Pasaron 15 minutos de su hora y no marcaron "Llegó".'}
                    </p>
                    {sugeridas.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          cerrar();
                          setAbierta(c);
                        }}
                        className="flex w-full items-center justify-between rounded-xl border border-borde-soft px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="font-semibold text-texto">{c.cliente.nombre}</span>
                        <span className="text-texto-3">{horaNegocio(c.inicio)}</span>
                      </button>
                    ))}
                  </section>
                )}
              </div>
            )}
          </Desplegable>
        )}
        <Desplegable
          etiqueta={hayFiltros ? "Filtros" : "Colores"}
          icono={hayFiltros ? "filter" : "info"}
          contador={filtrosActivos}
        >
          {() => (
            <div className="space-y-4">
              {suc.elegir && (
                <label className="block space-y-1.5 text-[13px] font-semibold text-texto-2">
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
              {hayEspacios && (
                <div className="space-y-1.5">
                  <p className="text-[13px] font-semibold text-texto-2">Columnas</p>
                  <Chips
                    valor={verPorEspacio ? "espacio" : "profesional"}
                    opciones={[
                      ["profesional", `Por ${etiquetaProfesional.toLowerCase()}`],
                      ["espacio", "Por espacio"],
                    ]}
                    onChange={(v) => setPorEspacio(v === "espacio")}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <p className="text-[13px] font-semibold text-texto-2">Qué significa cada color</p>
                <Leyenda simple={simple} />
              </div>
            </div>
          )}
        </Desplegable>
        {/* Plan Emprendedor: el contador es el de HOY aunque se mire otro día:
            una cita consume el día en que se agenda, no el de la cita (§2.1). */}
        <ChipCupo unidad="CITA" />
        <CampanaAvisos onAbrirCita={setAbierta} />
        <Boton
          icono="plus"
          aria-label="Nueva cita"
          onClick={() => setNueva({ fecha })}
          disabled={!suc.sucursalId && !datos?.sucursalId}
        >
          <span className="hidden sm:inline">Nueva cita</span>
          <span className="sm:hidden">Nueva</span>
        </Boton>
      </div>
    </header>
  );

  const mensajes = (errorMover || aviso || rapida.error || dia.error) && (
    <div className="space-y-2 px-3 pt-2 sm:px-4">
      <ErrorMsg>{errorMover}</ErrorMsg>
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{rapida.error}</ErrorMsg>
      <ErrorMsg onReintentar={dia.recargar}>{dia.error}</ErrorMsg>
    </div>
  );

  const cola =
    conCola && datos ? (
      <ColaEspera cola={datos.cola} sucursalId={datos.sucursalId ?? suc.sucursalId} recursos={recursos} onCambio={dia.refrescar} />
    ) : null;

  let contenido: ReactNode = null;
  if (dia.cargando && !datos) {
    contenido = (
      <div className="p-4">
        <Cargando texto="Cargando la agenda…" />
      </div>
    );
  } else if (datos && vista === "calendario") {
    contenido = (
      <div className="flex min-h-0 flex-1 gap-3 p-2 sm:p-3">
        <section
          ref={refGrilla}
          aria-label={verPorEspacio ? "Agenda por espacio" : `Agenda por ${etiquetaProfesional.toLowerCase()}`}
          className="card flex min-h-0 min-w-0 flex-1 flex-col overflow-clip"
        >
          {paginado && (
            <PaginadorColumnas
              recursos={grilla.recursos}
              inicio={inicioColumna}
              porPagina={porPagina}
              etiqueta={verPorEspacio ? "Espacio" : etiquetaProfesional}
              onIr={setDesdeColumna}
            />
          )}
          <div className="min-h-0 flex-1">
            <GrillaDia
              fecha={fecha}
              recursos={columnasVisibles}
              citas={grilla.citas}
              bloqueos={datos.bloqueos}
              granularidad={granularidad}
              detalleRecurso={(r) => (r.tipo === "ESPACIO" ? "Espacio" : etiquetaProfesional)}
              // Con una sola persona en la sucursal su nombre arriba no dice
              // nada; de a una (celular), ya lo dice el selector.
              sinCabecera={totalColumnas === 1 || (paginado && porPagina === 1)}
              // Por espacio, tocar un hueco abre la cita sin profesional: la
              // cabina la asigna el backend al elegir el horario.
              onTocarHueco={(recursoId, hora) =>
                setNueva(verPorEspacio ? { fecha, hora } : { fecha, recursoId, hora })
              }
              onAbrirCita={(c) => setAbierta(original(c))}
              onMover={
                verPorEspacio
                  ? undefined
                  : (c, lineaId, delta, destino) => mover(original(c), idLineaReal(lineaId), delta, destino)
              }
              onArrastrando={setArrastrando}
            />
          </div>
        </section>
        {cola && colaAlCostado && <aside className="w-80 shrink-0 overflow-y-auto">{cola}</aside>}
      </div>
    );
  } else if (datos) {
    contenido = (
      <div className="mx-auto flex w-full max-w-5xl items-start gap-4 p-3 sm:p-4">
        <div className="min-w-0 flex-1 space-y-2.5">
          {listaDelDia.length === 0 && <p className="py-8 text-center text-sm text-texto-3">No hay citas este día.</p>}
          {listaDelDia.map((c) => (
            <TarjetaCita
              key={c.id}
              cita={c}
              rapidas={accionesRapidas(c, { ahora: Date.now(), simple })}
              simple={simple}
              mostrarRecurso={recursos.length > 1}
              onAbrir={() => setAbierta(c)}
              onAccion={(a) => rapida.pedir(c, a)}
              onCobrar={cobrar ? () => cobrar(c.id) : undefined}
              ocupado={rapida.ocupadoId === c.id}
            />
          ))}
        </div>
        {cola && colaAlCostado && <aside className="w-80 shrink-0">{cola}</aside>}
      </div>
    );
  }

  return (
    <>
      <div className={vista === "calendario" ? "flex h-full min-h-[520px] flex-col" : ""}>
        {barra}
        {mensajes}
        {contenido}
      </div>
      {/* Sin lugar al costado, la cola va debajo: nunca empuja la grilla de costado. */}
      {cola && !colaAlCostado && <div className="p-3 sm:p-4">{cola}</div>}

      {abierta && (
        <DetalleCita
          cita={abierta}
          sucursal={suc.nombre}
          simple={simple}
          onClose={() => setAbierta(null)}
          onCambio={(c) => dia.setDatos((d) => conCita(d, c))}
        />
      )}
      {nueva && (datos?.sucursalId ?? suc.sucursalId) && (
        <NuevaCita
          sucursalId={(datos?.sucursalId ?? suc.sucursalId) as number}
          precarga={nueva}
          granularidad={granularidad}
          modo={modo}
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
    </>
  );
}
