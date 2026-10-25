import { useMemo, useState } from "react";
import { Icon, type NombreIcono } from "../../../components/Icon";
import { Cargando, ErrorMsg, Modal, Vacio } from "../../../components/ui";
import { api } from "../../../lib/api";
import { fmtMoney } from "../../../lib/format";
import { useSucursales } from "../../../lib/useSucursales";
import { useAuth } from "../../../store/AuthContext";
import DialogoMovimiento from "../../pos/DialogoMovimiento";
import { MOTIVO_CENA } from "../../pos/motivosMovimiento";
import { bsResta } from "../../reportes/formato";
import type {
  ActividadApi,
  CajaSupervisionApi,
  EfectivoSupervisionApi,
  MovimientoSupervisionApi,
  SupervisionApi,
} from "../api";
import { fmtHace, horaDe } from "../calculo";
import { ESTADOS } from "../estilos";
import { ChipsMotivo } from "../ModalesMesa";
import { MOTIVOS_PAUSA } from "../ModalesMesa.datos";
import { useAhora } from "../reloj";
import { subColor, subLinea } from "../TarjetaMesaTextos";
import type { Pago } from "../tipos";
import { BotonB, ChipFiltro, Circulo, ErrorAccion, EstadoBadge, Fila, Nota, Rotulo, SelectorSucursal, Tarjeta } from "../ui";
import { cronoDe, nombreMesa, vistaCuenta, vistaDe, type VistaCuenta, type VistaMesa } from "../vista";
import {
  armarSupervision,
  cuando,
  duracion,
  estadoDeCaja,
  filtrarActividad,
  FILTROS_ACTIVIDAD,
  iniciales,
  opcionesDeTurno,
  rangoDeSemana,
  rangoDeTurno,
  reinicioDeSemana,
  resumenSupervision,
  situacionDelTurno,
  textoDiferencia,
  tonoDeActividad,
  type CuentaSup,
  type EstadoCaja,
  type FiltroActividad,
  type MesaSup,
  type QuienSesion,
  type SituacionTurno,
  type TonoActividad,
} from "./Supervision.datos";
import { useSupervision } from "./useSupervision";
import { apiBillar } from "../api";

/** Cuántos renglones de actividad se ven de entrada, y cuántos suma "Ver más". */
const DE_A = 30;
/** Cuántas cajas se ven de entrada en la lista; el resto de la semana, con "Ver más". */
const CAJAS_DE_ENTRADA = 3;

/**
 * Supervisión (21-oct): lo que hace la cajera, en vivo y sin poder tocar
 * nada. Las cajas (quién abrió y a qué hora, quién cerró y a qué hora), las
 * mesas y cuentas abiertas con quién las abrió y cargó, y la actividad con el
 * nombre de cada usuario. Lo único que se puede hacer desde acá es pausar una
 * mesa, sin PIN, cuando la cajera lo pide por teléfono.
 *
 * Lo vendido y la actividad son del TURNO (22-oct): lo que pasó desde que se
 * abrió una caja hasta que se cerró. Un billar abre a la tarde y cierra de
 * madrugada, y cuando abren otra caja la pantalla empieza de cero en vez de
 * mezclar con la anterior. El turno de antes se elige arriba.
 *
 * Los turnos que se pueden elegir son los de la SEMANA (23-oct), de lunes a
 * domingo: la semana se reinicia el lunes a las 13:00 (así el administrador
 * tiene la mañana del lunes para revisar la que cerró) y la nueva no muestra
 * turnos hasta que abren la primera caja.
 *
 * Es del administrador (`billar.admin`). No pide caja propia: es justo la
 * pantalla para quien no atiende.
 */
export default function Supervision() {
  const { datos, error, llegoEn, sucursal, elegirSucursal, elegirTurno, recargar } = useSupervision();
  const ahora = useAhora();
  const suc = useSucursales();
  const [filtro, setFiltro] = useState<FiltroActividad>("todo");
  const [cuantos, setCuantos] = useState(DE_A);
  const [todasLasCajas, setTodasLasCajas] = useState(false);
  const [viendo, setViendo] = useState<{ tipo: "mesa"; numero: number } | { tipo: "cuenta"; id: number } | null>(null);
  const [pausando, setPausando] = useState<{ numero: number; sesionId: number } | null>(null);
  // Movimientos de efectivo (24-oct): el cuadro abierto (con el motivo que arranca elegido) y la cena que se va a anular.
  const { incluye } = useAuth();
  const [registrando, setRegistrando] = useState<{ motivo?: string } | null>(null);
  const [anulando, setAnulando] = useState<MovimientoSupervisionApi | null>(null);

  const armado = useMemo(() => (datos ? armarSupervision(datos) : null), [datos]);
  const contexto = useMemo(
    () => (datos ? { tipos: Object.fromEntries(datos.tipos.map((t) => [t.id, t])), ajustes: { avisos: datos.ajustes.avisos } } : null),
    [datos],
  );
  const mesas = useMemo(
    () => (armado && contexto ? armado.mesas.map((m) => ({ ...m, vista: vistaDe(contexto, m.mesa, ahora) })) : []),
    [armado, contexto, ahora],
  );
  const cuentas = useMemo(
    () => (armado ? armado.cuentas.map((c) => ({ ...c, vista: vistaCuenta(c.cuenta, ahora) })) : []),
    [armado, ahora],
  );
  const resumen = useMemo(
    () => (datos ? resumenSupervision(datos, mesas.map((m) => m.vista), cuentas.map((c) => c.vista)) : null),
    [datos, mesas, cuentas],
  );
  const turno = useMemo(() => (datos ? situacionDelTurno(datos) : null), [datos]);

  if (!datos || !resumen || !turno) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Cabecera titulo="Supervisión" />
        {error ? (
          <div className="p-6">
            <ErrorMsg onReintentar={() => void recargar()}>{error}</ErrorMsg>
          </div>
        ) : (
          <Cargando texto="Cargando lo que pasa en el billar…" />
        )}
      </div>
    );
  }

  const selector =
    suc.elegir ? <SelectorSucursal valor={sucursal ?? datos.sucursal.id} sucursales={suc.sucursales} onElegir={elegirSucursal} /> : undefined;
  const actividad = filtrarActividad(datos.actividad, filtro);
  // Con la semana entera la lista es larga: se ven las últimas y, siempre, la que se está mirando.
  const cajasVisibles = datos.cajas.filter((c, i) => todasLasCajas || i < CAJAS_DE_ENTRADA || c.id === turno.caja?.id);
  const cajasOcultas = datos.cajas.length - cajasVisibles.length;
  const tituloActividad = turno.situacion === "hoy" ? "Actividad de hoy" : "Actividad del turno";
  const mesaViendo = viendo?.tipo === "mesa" ? mesas.find((m) => m.mesa.id === viendo.numero) : undefined;
  const cuentaViendo = viendo?.tipo === "cuenta" ? cuentas.find((c) => c.cuenta.id === viendo.id) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Cabecera
        titulo="Supervisión"
        sucursal={selector ?? <EtiquetaSucursal nombre={datos.sucursal.nombre} />}
        subtitulo={
          <>
            <span
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-full ${error ? "bg-amber-500" : "animate-pulse bg-primary"}`}
            />
            {error ? "Sin conexión: lo que ves puede estar atrasado" : `En vivo · actualizado ${horaDe(llegoEn)}`}
            {turno.situacion === "hoy" && <span className="hidden sm:inline"> · hoy desde las {horaDe(datos.desde)}</span>}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto grid max-w-[1400px] gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* @container: los números de arriba se acomodan al ancho de ESTA columna, no al de la pantalla (con el menú y la actividad al costado, una compu de 1280 deja ~580 px). */}
          <div className="@container min-w-0 space-y-5">
            {error && (
              <Nota tono="ambar" icono="wifiOff">
                <b>Sin conexión con el servidor.</b> {error}{" "}
                <button type="button" onClick={() => void recargar()} className="font-bold underline">
                  Reintentar
                </button>
              </Nota>
            )}

            {turno.caja && (
              <SelectorDeTurno
                datos={datos}
                situacion={turno.situacion}
                caja={turno.caja}
                ahora={ahora}
                onElegir={elegirTurno}
              />
            )}

            <div className="grid grid-cols-2 gap-3 sm:gap-4 @4xl:grid-cols-4">
              <Kpi
                icono="lock"
                tono={resumen.cajasAbiertas ? "verde" : "gris"}
                etiqueta="Cajas abiertas"
                valor={String(resumen.cajasAbiertas)}
                pie={
                  resumen.cajasViejas
                    ? `${resumen.cajasViejas} ${resumen.cajasViejas === 1 ? "viene" : "vienen"} de antes de hoy`
                    : resumen.cajasTotal
                      ? `de ${resumen.cajasTotal} de hoy`
                      : "Nadie abrió todavía"
                }
              />
              <Kpi
                icono="billetera"
                tono="verde"
                etiqueta={turno.situacion === "hoy" ? "Vendido hoy" : "Vendido en el turno"}
                valor={fmtMoney(resumen.vendido)}
                pie={`${resumen.ventas} ${resumen.ventas === 1 ? "venta" : "ventas"}`}
              />
              <Kpi
                icono="bola"
                tono="azul"
                etiqueta="Mesas en juego"
                valor={`${resumen.mesasEnJuego} de ${resumen.mesasTotal}`}
                pie={resumen.pausadas ? `${resumen.pausadas} en pausa` : "Ninguna en pausa"}
              />
              <Kpi
                icono="fileText"
                tono="ambar"
                etiqueta="Por cobrar"
                valor={fmtMoney(resumen.porCobrar)}
                pie={`${resumen.mesasEnJuego} ${resumen.mesasEnJuego === 1 ? "mesa" : "mesas"} y ${resumen.cuentas} ${resumen.cuentas === 1 ? "cuenta" : "cuentas"} abiertas`}
              />
            </div>

            {datos.efectivo && turno.caja && (
              <TarjetaEfectivo
                efectivo={datos.efectivo}
                caja={turno.caja}
                puedeRegistrar={incluye("movimientos_caja")}
                ahora={ahora}
                onRegistrar={(motivo) => setRegistrando({ motivo })}
                onAnular={setAnulando}
              />
            )}

            <Tarjeta
              icono="clock"
              titulo="Cajas"
              extra={datos.semana ? `Semana del ${rangoDeSemana(datos.semana)}` : "Llegada y salida del personal"}
              cuerpo="p-0"
            >
              {datos.cajas.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-texto-3">
                  {datos.semana ? "Nadie abrió caja esta semana todavía. Aparecen acá desde que abran la primera." : "Nadie abrió caja todavía."}
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-borde-soft">
                    {cajasVisibles.map((c) => (
                      <FilaCaja
                        key={c.id}
                        c={c}
                        estado={estadoDeCaja(c, datos.desde)}
                        ahora={ahora}
                        viendo={turno.caja?.id === c.id}
                      />
                    ))}
                  </ul>
                  {datos.cajas.length > CAJAS_DE_ENTRADA && (cajasOcultas > 0 || todasLasCajas) && (
                    <div className="border-t border-borde-soft p-3 text-center">
                      <BotonB onClick={() => setTodasLasCajas((v) => !v)}>
                        {todasLasCajas ? "Mostrar menos" : `Ver ${cajasOcultas} más de la semana`}
                      </BotonB>
                    </div>
                  )}
                  {turno.situacion !== "hoy" && (
                    <p className="border-t border-borde-soft bg-slate-50/70 px-4 py-2.5 text-[12px] text-texto-2 sm:px-5">
                      Vendido hoy en todas las cajas: <b className="tabular-nums text-texto">{fmtMoney(resumen.vendidoHoy)}</b> ·{" "}
                      {resumen.ventasHoy} {resumen.ventasHoy === 1 ? "venta" : "ventas"}
                    </p>
                  )}
                </>
              )}
            </Tarjeta>

            <section aria-label="Mesas" className="space-y-3">
              <Rotulo icono="bola" extra={`${resumen.mesasEnJuego} en juego`}>
                Mesas
              </Rotulo>
              {mesas.length === 0 ? (
                <Vacio icono="bola" titulo="No hay mesas" texto="Las mesas se crean en Mesas de billar." />
              ) : (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(158px,1fr))] sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(228px,1fr))]">
                  {mesas.map((m) => (
                    <TarjetaMesaSup
                      key={m.mesa.id}
                      m={m}
                      ahora={ahora}
                      onVer={() => setViendo({ tipo: "mesa", numero: m.mesa.id })}
                      onPausar={() => m.sesionId != null && setPausando({ numero: m.mesa.id, sesionId: m.sesionId })}
                    />
                  ))}
                </div>
              )}
            </section>

            {cuentas.length > 0 && (
              <section aria-label="Cuentas abiertas" className="space-y-3">
                <Rotulo icono="users" extra={fmtMoney(resumen.totalCuentas)}>
                  Cuentas abiertas
                </Rotulo>
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(158px,1fr))] sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(228px,1fr))]">
                  {cuentas.map((c) => (
                    <TarjetaCuentaSup key={c.cuenta.id} c={c} ahora={ahora} onVer={() => setViendo({ tipo: "cuenta", id: c.cuenta.id })} />
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside aria-label={tituloActividad} className="min-w-0 xl:sticky xl:top-0 xl:self-start">
            <Tarjeta icono="lista" titulo={tituloActividad} extra={`${datos.actividad.length} renglones`} cuerpo="p-0">
              <div className="flex flex-wrap gap-2 border-b border-borde-soft px-4 py-3">
                {FILTROS_ACTIVIDAD.map((f) => (
                  <ChipFiltro
                    key={f.clave}
                    activo={filtro === f.clave}
                    etiqueta={f.etiqueta}
                    onClick={() => {
                      setFiltro(f.clave);
                      setCuantos(DE_A);
                    }}
                  />
                ))}
              </div>
              {actividad.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-texto-3">Todavía no hay movimientos de este tipo.</p>
              ) : (
                <ul className="divide-y divide-borde-soft">
                  {actividad.slice(0, cuantos).map((a) => (
                    <RenglonActividad key={a.id} a={a} ahora={ahora} />
                  ))}
                </ul>
              )}
              {actividad.length > cuantos && (
                <div className="border-t border-borde-soft p-3 text-center">
                  <BotonB onClick={() => setCuantos((n) => n + DE_A)}>Ver más</BotonB>
                </div>
              )}
            </Tarjeta>
          </aside>
        </div>
      </div>

      {mesaViendo?.quien && mesaViendo.vista.cuenta && (
        <DetalleSesion
          titulo={nombreMesa(mesaViendo.mesa)}
          subtitulo={mesaViendo.vista.tipo.nombre}
          vista={mesaViendo.vista}
          sesion={mesaViendo.mesa.sesion!}
          calc={mesaViendo.vista.cuenta}
          quien={mesaViendo.quien}
          ahora={ahora}
          onClose={() => setViendo(null)}
          onPausar={
            mesaViendo.vista.estado !== "pausada" && mesaViendo.sesionId != null
              ? () => {
                  setPausando({ numero: mesaViendo.mesa.id, sesionId: mesaViendo.sesionId! });
                  setViendo(null);
                }
              : undefined
          }
        />
      )}
      {cuentaViendo && (
        <DetalleSesion
          titulo={`Cuenta ${cuentaViendo.cuenta.nombre}`}
          sesion={cuentaViendo.cuenta.sesion}
          calc={cuentaViendo.vista.calc}
          quien={cuentaViendo.quien}
          ahora={ahora}
          onClose={() => setViendo(null)}
        />
      )}
      {registrando && datos.efectivo && turno.caja && (
        <DialogoMovimiento
          cajaId={datos.efectivo.cajaId}
          motivosExtra={[MOTIVO_CENA]}
          motivoInicial={registrando.motivo}
          deQuien={{ nombre: turno.caja.cajero, desde: turno.caja.desde }}
          esperado={datos.efectivo.esperado}
          onClose={() => setRegistrando(null)}
          onGuardado={() => {
            setRegistrando(null);
            void recargar();
          }}
        />
      )}
      {anulando && datos.efectivo && turno.caja && (
        <AnularCena
          cajaId={datos.efectivo.cajaId}
          cajera={turno.caja.cajero}
          movimiento={anulando}
          onClose={() => setAnulando(null)}
          onHecho={() => {
            setAnulando(null);
            void recargar();
          }}
        />
      )}
      {pausando && (
        <PausarDesdeSupervision
          numero={pausando.numero}
          sesionId={pausando.sesionId}
          onClose={() => setPausando(null)}
          onHecho={() => {
            setPausando(null);
            void recargar();
          }}
        />
      )}
    </div>
  );
}

// ── El encabezado ───────────────────────────────────────────────────────────

/**
 * El encabezado de las pantallas del billar sin la caja del que mira: acá no
 * importa si el administrador abrió la suya (`Encabezado` la dice).
 */
function Cabecera({
  titulo,
  sucursal,
  subtitulo,
}: {
  titulo: string;
  sucursal?: React.ReactNode;
  subtitulo?: React.ReactNode;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-borde bg-white px-4 py-3 sm:px-6">
      <div className="min-w-[14rem] flex-1">
        <h1 className="flex items-center gap-2 text-xl font-bold leading-tight text-texto">
          <span className="truncate">{titulo}</span>
          {sucursal}
        </h1>
        {subtitulo && <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-texto-3">{subtitulo}</p>}
      </div>
    </header>
  );
}

function EtiquetaSucursal({ nombre }: { nombre: string }) {
  return <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{nombre}</span>;
}

function Kpi({
  icono,
  tono,
  etiqueta,
  valor,
  pie,
}: {
  icono: NombreIcono;
  tono: "verde" | "ambar" | "azul" | "gris";
  etiqueta: string;
  valor: string;
  pie: string;
}) {
  return (
    <div className="card flex items-center gap-3 px-3.5 py-3 sm:px-4 sm:py-3.5">
      <span className="hidden sm:block">
        <Circulo icono={icono} tono={tono} size={44} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-texto-3 sm:text-[11px]">{etiqueta}</p>
        <p className="text-lg font-extrabold leading-tight tabular-nums text-texto sm:text-[22px]">{valor}</p>
        <p className="truncate text-[11px] text-texto-3 sm:text-[12px]">{pie}</p>
      </div>
    </div>
  );
}

// ── El turno ────────────────────────────────────────────────────────────────

/**
 * Qué turno se está mirando y por qué: lo de abajo (vendido y actividad) es de
 * esa caja, de que se abrió a que se cerró. Por defecto es el de la caja que
 * trabaja ahora; con todas cerradas, cómo terminó la última (hasta que abran
 * otra, y ahí la pantalla empieza de cero); y se puede elegir uno anterior.
 */
function SelectorDeTurno({
  datos,
  situacion,
  caja,
  ahora,
  onElegir,
}: {
  datos: SupervisionApi;
  situacion: SituacionTurno;
  caja: CajaSupervisionApi;
  ahora: number;
  onElegir: (cajaId: number | null) => void;
}) {
  const defectoId = datos.turno?.defectoId ?? null;
  const opciones = opcionesDeTurno(datos);
  return (
    <section aria-label="Turno" className="space-y-2.5">
      <div>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-texto-3">Turno que estás viendo</p>
          {datos.semana && <p className="text-[11px] font-semibold text-texto-3">Semana del {rangoDeSemana(datos.semana)}</p>}
        </div>
        {/* El selector de verdad va transparente encima de lo que se ve: así el
            texto (quién, desde cuándo) se parte en renglones en el celular en
            vez de cortarse con "…". */}
        <div className="relative rounded-xl border border-borde bg-white focus-within:ring-2 focus-within:ring-primary-100 hover:bg-muted">
          <div aria-hidden className="flex min-h-11 items-center gap-2 py-2 pl-3.5 pr-3 text-[14px] font-semibold leading-snug text-texto">
            <span className="min-w-0 flex-1">{opciones.find((o) => o.id === caja.id)?.etiqueta}</span>
            <span className="shrink-0 text-slate-500">
              <Icon name="chevronDown" size={16} />
            </span>
          </div>
          <select
            aria-label="Turno que estás viendo"
            value={caja.id}
            onChange={(ev) => {
              const id = Number(ev.target.value);
              // Elegir el que corresponde ahora es volver a seguirlo solo.
              onElegir(id === defectoId ? null : id);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </div>
        {datos.semana && (
          <p className="mt-1.5 text-[12px] text-texto-3">
            Los turnos de la semana, de lunes a domingo. La semana nueva empieza el {reinicioDeSemana(datos.semana)}.
          </p>
        )}
      </div>
      {situacion === "cerrado" && (
        <Nota tono="azul" icono="lock">
          {/* Quien la cerró, que no siempre es quien la abrió: el administrador
              cierra la caja que la cajera dejó abierta (revisión del 23-oct). */}
          <b>No hay caja abierta.</b> {caja.cerroPor ?? caja.cajero} cerró {caja.hasta != null ? cuando(caja.hasta, ahora) : ""} ({rangoDeTurno(caja, ahora)}). Cuando
          abran la siguiente, esta pantalla empieza de cero.
        </Nota>
      )}
      {situacion === "olvidada" && (
        <Nota tono="ambar" icono="alert">
          <b>La caja de {caja.cajero} sigue abierta desde {cuando(caja.desde, ahora)}.</b> ¿Se olvidaron de cerrarla? Lo de abajo cuenta desde
          que la abrió.
        </Nota>
      )}
      {situacion === "elegido" && (
        <Nota tono="gris" icono="info">
          Estás viendo {caja.abierta ? "otra caja" : "un turno anterior"}, no lo que pasa ahora. Las mesas y cuentas de abajo sí son de ahora.{" "}
          <button type="button" onClick={() => onElegir(null)} className="font-bold underline">
            Volver al turno actual
          </button>
        </Nota>
      )}
    </section>
  );
}

// ── El efectivo de la caja ──────────────────────────────────────────────────

/**
 * Los movimientos de efectivo de la caja del turno (24-oct): el administrador
 * registra acá lo que sale o entra de la caja de la cajera sin ser una venta,
 * como la cena que se le da cada noche. Es el mismo "Movimiento de efectivo"
 * del cierre de caja, pero hecho por el administrador y reflejado en el cierre
 * de ella: la cajera no puede registrarlos. Una cena se anula con la caja
 * abierta; la cerrada ya tiene su arqueo hecho.
 */
function TarjetaEfectivo({
  efectivo,
  caja,
  puedeRegistrar,
  ahora,
  onRegistrar,
  onAnular,
}: {
  efectivo: EfectivoSupervisionApi;
  caja: CajaSupervisionApi;
  puedeRegistrar: boolean;
  ahora: number;
  onRegistrar: (motivo?: string) => void;
  onAnular: (m: MovimientoSupervisionApi) => void;
}) {
  const puedeTocar = puedeRegistrar && efectivo.abierta;
  return (
    <section aria-label="Movimientos de efectivo" className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-borde-soft px-4 py-3.5 sm:px-5">
        <Circulo icono="swap" tono="gris" size={36} />
        <h2 className="min-w-[11rem] flex-1 text-[15px] font-bold text-texto">Movimientos de efectivo</h2>
        <span className="text-[12px] text-texto-3">
          Caja de {caja.cajero} · {efectivo.abierta ? "abierta" : "cerrada"}
        </span>
      </header>

      <div className="space-y-3.5 px-4 py-4 sm:px-5">
        {puedeTocar ? (
          <>
            <p className="text-[13px] leading-relaxed text-texto-2">
              Lo que registrés acá aparece en el cierre de caja de {caja.cajero}. Ella no puede registrar movimientos: sólo vos.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <BotonB icono="swap" onClick={() => onRegistrar()}>
                Registrar movimiento de efectivo
              </BotonB>
              <BotonB variante="violeta" icono="cubiertos" onClick={() => onRegistrar(MOTIVO_CENA.etiqueta)}>
                Cena
              </BotonB>
            </div>
          </>
        ) : !efectivo.abierta ? (
          <Nota tono="gris" icono="lock">
            La caja está cerrada: ya no se pueden registrar ni anular movimientos.
          </Nota>
        ) : null}

        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-texto-3">Registrados en este turno</p>
          {efectivo.movimientos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-borde px-4 py-5 text-center text-[13px] text-texto-3">
              Todavía no se registró ningún movimiento en este turno.
            </p>
          ) : (
            <ul className="divide-y divide-borde-soft border-t border-borde-soft">
              {efectivo.movimientos.map((m) => (
                <FilaMovimiento key={m.id} m={m} ahora={ahora} puedeAnular={puedeTocar} onAnular={() => onAnular(m)} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {efectivo.esperado != null && (
        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-borde-soft bg-slate-50/80 px-4 py-3.5 sm:px-5">
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-[13px] font-bold text-texto">Efectivo que debería haber en la caja</p>
            <p className="text-[12px] text-texto-3">Es lo que {caja.cajero} te tiene que entregar al cerrar.</p>
          </div>
          <span className="text-[22px] font-extrabold tabular-nums text-texto">{fmtMoney(efectivo.esperado)}</span>
        </footer>
      )}
    </section>
  );
}

function FilaMovimiento({
  m,
  ahora,
  puedeAnular,
  onAnular,
}: {
  m: MovimientoSupervisionApi;
  ahora: number;
  puedeAnular: boolean;
  onAnular: () => void;
}) {
  const esAnulacion = m.cena && m.tipo === "INGRESO";
  const titulo = m.cena ? (esAnulacion ? "Cena anulada" : "Cena") : (m.texto ?? (m.tipo === "INGRESO" ? "Entrada de efectivo" : "Salida de efectivo"));
  const verbo = esAnulacion ? "La anuló" : "Registró";
  return (
    <li className="flex items-center gap-3 py-3">
      <Circulo icono={m.cena ? "cubiertos" : "swap"} tono={m.cena ? "violeta" : "gris"} size={36} />
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] font-bold text-texto ${m.anulada ? "text-texto-3 line-through" : ""}`}>
          {titulo}
          {m.anulada && (
            <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-px text-[11px] font-bold uppercase text-texto-2 no-underline">
              Anulada
            </span>
          )}
        </p>
        <p className="text-[12px] text-texto-3">
          {verbo} {m.quien} · {cuando(m.hora, ahora)} · {m.tipo === "INGRESO" ? "entra plata a la caja" : "sale plata de la caja"}
        </p>
      </div>
      <span
        className={`shrink-0 text-[15px] font-extrabold tabular-nums ${m.anulada ? "text-texto-3 line-through" : m.tipo === "INGRESO" ? "text-emerald-700" : "text-rose-700"}`}
      >
        {m.tipo === "INGRESO" ? `+${fmtMoney(m.monto)}` : bsResta(m.monto)}
      </span>
      {m.cena && m.tipo === "EGRESO" && !m.anulada && puedeAnular && (
        <BotonB aria-label={`Anular la cena de ${fmtMoney(m.monto)}`} onClick={onAnular}>
          Anular
        </BotonB>
      )}
    </li>
  );
}

/** Anular una cena: pide confirmar, porque el efectivo esperado de la cajera sube otra vez. */
function AnularCena({
  cajaId,
  cajera,
  movimiento,
  onClose,
  onHecho,
}: {
  cajaId: number;
  cajera: string;
  movimiento: MovimientoSupervisionApi;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const anular = async () => {
    if (enviando) return;
    setEnviando(true);
    setError("");
    try {
      await api.anularCenaCaja(cajaId, movimiento.id);
      onHecho();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "No se pudo anular. Probá de nuevo.");
      setEnviando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo="Anular la cena"
      subtitulo={`Bs ${movimiento.monto.toFixed(2).replace(".", ",")} de la caja de ${cajera}`}
      onClose={onClose}
      ancho="max-w-md"
      acciones={
        <>
          <BotonB onClick={onClose}>No anular</BotonB>
          <BotonB variante="rosa" disabled={enviando} onClick={() => void anular()}>
            {enviando ? "Anulando…" : "Anular la cena"}
          </BotonB>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-texto-2">
        El efectivo que debería haber en la caja de {cajera} vuelve a subir {fmtMoney(movimiento.monto)}. La cena no se borra: queda anulada
        y a tu nombre en la actividad.
      </p>
      <ErrorAccion texto={error} />
    </Modal>
  );
}

// ── Las cajas ───────────────────────────────────────────────────────────────

const BADGE_CAJA: Record<EstadoCaja, { texto: string; clase: string }> = {
  abierta: { texto: "Abierta", clase: "bg-primary-boton text-white" },
  vieja: { texto: "Quedó abierta", clase: "bg-amber-100 text-amber-800" },
  cerrada: { texto: "Cerrada", clase: "bg-slate-100 text-slate-600" },
};

function FilaCaja({ c, estado, ahora, viendo }: { c: CajaSupervisionApi; estado: EstadoCaja; ahora: number; viendo: boolean }) {
  const badge = BADGE_CAJA[estado];
  return (
    <li
      aria-current={viendo ? "true" : undefined}
      className={`border-l-4 px-3 py-3.5 sm:px-4 ${viendo ? "border-l-primary-boton bg-primary-50/40" : "border-l-transparent"}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[13px] font-bold text-primary-700"
        >
          {iniciales(c.cajero)}
        </span>
        <div className="min-w-[10rem] flex-1">
          <p className="truncate text-[15px] font-bold text-texto">{c.cajero}</p>
          <p className="text-[12px] text-texto-3">
            Abrió <b className="font-semibold text-texto-2">{cuando(c.desde, ahora)}</b>
            {c.hasta ? (
              <>
                {" "}
                · cerró <b className="font-semibold text-texto-2">{cuando(c.hasta, ahora)}</b> ({duracion(c.hasta - c.desde)})
                {c.cerroPor && c.cerroPor !== c.cajero && (
                  <>
                    {" "}
                    · la cerró <b className="font-semibold text-texto-2">{c.cerroPor}</b>
                  </>
                )}
              </>
            ) : (
              <> · lleva {duracion(ahora - c.desde)}</>
            )}
          </p>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${badge.clase}`}>
          {badge.texto}
        </span>
      </div>
      <dl className={`mt-3 grid gap-2 text-[12px] ${c.cena ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        <Dato etiqueta="Abrió con" valor={fmtMoney(c.inicial)} />
        <Dato
          etiqueta="Vendió"
          valor={fmtMoney(c.vendido)}
          pie={`${c.ventas} ${c.ventas === 1 ? "venta" : "ventas"}${c.anuladas ? ` · ${c.anuladas} anulada${c.anuladas === 1 ? "" : "s"}` : ""}`}
        />
        {c.cena && <Dato etiqueta="Cena" valor={bsResta(c.cena.monto)} pie={c.cena.por ? `Registró ${c.cena.por}` : undefined} violeta />}
        {c.contado != null ? (
          <Dato
            etiqueta="Contó al cerrar"
            corta="Contó"
            valor={fmtMoney(c.contado)}
            pie={textoDiferencia(c.diferencia ?? 0)}
            alerta={Math.abs(c.diferencia ?? 0) >= 0.005}
          />
        ) : (
          <Dato etiqueta="Cierre" valor="Sigue abierta" />
        )}
      </dl>
      {c.nota && <p className="mt-2 text-[12px] text-texto-3">Nota al cerrar: {c.nota}</p>}
    </li>
  );
}

function Dato({
  etiqueta,
  corta,
  valor,
  pie,
  alerta = false,
  violeta = false,
}: {
  etiqueta: string;
  /** La etiqueta en el celular, donde la larga no entra. */
  corta?: string;
  valor: string;
  pie?: string;
  alerta?: boolean;
  /** La cena del personal va en violeta, como en el resto de las pantallas. */
  violeta?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-lg px-2.5 py-2 ${violeta ? "bg-violet-50 text-violet-800" : "bg-slate-50"}`}>
      <dt className={`truncate text-[10px] font-bold uppercase tracking-wide ${violeta ? "text-violet-800" : "text-texto-3"}`}>
        {corta ? (
          <>
            <span className="sm:hidden">{corta}</span>
            <span className="hidden sm:inline">{etiqueta}</span>
          </>
        ) : (
          etiqueta
        )}
      </dt>
      <dd className={`break-words text-[14px] font-bold leading-tight tabular-nums ${violeta ? "text-violet-800" : "text-texto"}`}>{valor}</dd>
      {pie && (
        <dd className={`break-words text-[11px] leading-tight ${alerta ? "font-semibold text-rose-700" : violeta ? "text-violet-800" : "text-texto-3"}`}>{pie}</dd>
      )}
    </div>
  );
}

// ── Mesas y cuentas ─────────────────────────────────────────────────────────

/** Quién pausó, dicho corto; desde Supervisión no hubo PIN y se aclara. */
function textoPausa(p: NonNullable<QuienSesion["pausadaPor"]>): string {
  if (p.sinPin) return `Pausó ${p.quien} desde Supervisión`;
  return p.autorizo && p.autorizo !== p.quien ? `Pausó ${p.quien} · autorizó ${p.autorizo}` : `Pausó ${p.quien}`;
}

function TarjetaMesaSup({
  m,
  ahora,
  onVer,
  onPausar,
}: {
  m: MesaSup & { vista: VistaMesa };
  ahora: number;
  onVer: () => void;
  onPausar: () => void;
}) {
  const v = m.vista;
  const { mesa, tipo, estado, cuenta } = v;
  const estilo = ESTADOS[estado];
  const s = mesa.sesion;
  const apagada = estado === "fuera";
  const consumos = s ? s.consumos.filter((c) => !c.anulado).reduce((t, c) => t + c.cant, 0) : 0;

  return (
    <article className={`relative flex min-h-[230px] flex-col rounded-2xl border-2 p-3 text-left sm:p-4 ${estilo.tarjeta}`}>
      {estado === "cumplido" && (
        <span aria-hidden className="pointer-events-none absolute -inset-0.5 animate-pulse rounded-2xl ring-4 ring-rose-300" />
      )}
      <div className="min-w-0">
        <button
          type="button"
          onClick={onVer}
          className={`text-[15px] font-extrabold uppercase tracking-wide focus-visible:underline focus-visible:outline-none ${
            apagada ? "text-slate-400" : "text-texto"
          }`}
        >
          {nombreMesa(mesa).split(" · ")[0]}
        </button>
        {mesa.alias && <p className="truncate text-[12px] font-semibold text-texto-2">{mesa.alias}</p>}
        <p className={`text-[12px] ${apagada ? "text-slate-400" : "text-texto-3"}`}>{tipo.nombre}</p>
      </div>
      <EstadoBadge estado={estado} className="mt-2 self-start" />

      {cuenta && s ? (
        <>
          <p className={`mt-2 text-[26px] font-extrabold leading-none tracking-tight tabular-nums sm:text-[30px] ${estilo.crono}`}>
            {cronoDe(v)}
          </p>
          <p className={`mt-1.5 flex items-center gap-1 text-[12px] ${subColor(estado, v.pausaSeg)}`}>{subLinea(v)}</p>
          <div className="my-2.5 border-t border-black/5" />
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-extrabold tabular-nums text-primary-700">{fmtMoney(cuenta.total)}</span>
            {cuenta.pagado > 0 &&
              (cuenta.saldo > 0 ? (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                  FALTA <span className="tabular-nums">{fmtMoney(cuenta.saldo)}</span>
                </span>
              ) : (
                <span className="rounded-md bg-primary-100 px-2 py-0.5 text-[11px] font-bold uppercase text-primary-700">Pagado</span>
              ))}
          </div>
          {m.quien && (
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-texto-2">
              <span className="mt-0.5 shrink-0 text-texto-3">
                <Icon name="user" size={13} />
              </span>
              <span className="min-w-0">
                Abrió <b className="font-semibold">{m.quien.abrio}</b> · {cuando(s.abierta ?? s.start, ahora)}
              </span>
            </p>
          )}
          <p className="mt-0.5 text-[12px] text-texto-3">
            {consumos ? `${consumos} ${consumos === 1 ? "consumo" : "consumos"}` : "Sin consumos"}
          </p>
          {estado === "pausada" && m.quien?.pausadaPor && (
            <p className="mt-1 text-[12px] font-semibold text-amber-800">{textoPausa(m.quien.pausadaPor)}</p>
          )}
          {/* En cards angostas (celular) cada botón toma su renglón; con lugar van lado a lado. */}
          <div className="mt-auto flex flex-wrap gap-2 pt-3">
            <BotonB className="min-w-[7rem] flex-1" onClick={onVer}>
              Detalle
            </BotonB>
            {estado !== "pausada" && (
              <BotonB
                variante="ambar"
                icono="pausa"
                className="min-w-[7rem] flex-1"
                onClick={onPausar}
                aria-label={`Pausar Mesa ${mesa.id}`}
              >
                Pausar
              </BotonB>
            )}
          </div>
        </>
      ) : estado === "libre" ? (
        <p className="mt-3 text-[13px] text-texto-2">Libre hace {fmtHace(ahora - (mesa.libreDesde ?? ahora))}</p>
      ) : estado === "reservada" && mesa.reserva ? (
        <>
          <p className="mt-3 text-[26px] font-extrabold leading-none text-blue-800">{horaDe(mesa.reserva.hora)}</p>
          <p className="mt-1.5 flex items-center gap-1 text-[12px] text-blue-700">
            <Icon name="user" size={12} />
            {mesa.reserva.nombre}
          </p>
        </>
      ) : (
        <p className="mt-3 flex items-center gap-1 text-[12px] text-slate-400">
          <Icon name="llave" size={12} />
          {mesa.fueraMotivo || "Fuera de servicio"}
        </p>
      )}
    </article>
  );
}

function TarjetaCuentaSup({ c, ahora, onVer }: { c: CuentaSup & { vista: VistaCuenta }; ahora: number; onVer: () => void }) {
  const { cuenta, calc } = c.vista;
  const productos = cuenta.sesion.consumos.filter((x) => !x.anulado).reduce((t, x) => t + x.cant, 0);
  return (
    <article className="flex min-h-[170px] flex-col rounded-2xl border-2 border-primary/60 bg-primary-50/70 p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-primary-700">
          <Icon name="users" size={16} />
        </span>
        <div className="min-w-0">
          <button
            type="button"
            onClick={onVer}
            className="block max-w-full truncate text-left text-[15px] font-extrabold uppercase tracking-wide text-texto focus-visible:underline focus-visible:outline-none"
          >
            {cuenta.nombre}
          </button>
          <p className="text-[12px] text-texto-3">Abierta hace {fmtHace(ahora - cuenta.sesion.start)}</p>
        </div>
      </div>
      <div className="my-2.5 border-t border-black/5" />
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-extrabold tabular-nums text-primary-700">{fmtMoney(calc.total)}</span>
        {calc.pagado > 0 &&
          (calc.saldo > 0 ? (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
              FALTA <span className="tabular-nums">{fmtMoney(calc.saldo)}</span>
            </span>
          ) : (
            <span className="rounded-md bg-primary-100 px-2 py-0.5 text-[11px] font-bold uppercase text-primary-700">Pagado</span>
          ))}
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[12px] text-texto-2">
        <span className="mt-0.5 shrink-0 text-texto-3">
          <Icon name="user" size={13} />
        </span>
        <span className="min-w-0">
          Abrió <b className="font-semibold">{c.quien.abrio}</b>
        </span>
      </p>
      <p className="mt-0.5 text-[12px] text-texto-3">
        {productos ? `${productos} ${productos === 1 ? "producto" : "productos"}` : "Sin consumos"}
      </p>
      <div className="mt-auto pt-3">
        <BotonB className="w-full" onClick={onVer}>
          Detalle
        </BotonB>
      </div>
    </article>
  );
}

// ── El detalle de una mesa o cuenta ─────────────────────────────────────────

function DetalleSesion({
  titulo,
  subtitulo,
  vista,
  sesion,
  calc,
  quien,
  ahora,
  onClose,
  onPausar,
}: {
  titulo: string;
  subtitulo?: string;
  vista?: VistaMesa;
  sesion: NonNullable<VistaMesa["mesa"]["sesion"]>;
  calc: { tiempoBs: number; consumosBs: number; total: number; pagado: number; saldo: number };
  quien: QuienSesion;
  ahora: number;
  onClose: () => void;
  onPausar?: () => void;
}) {
  const consumos = sesion.consumos;
  return (
    <Modal
      abierto
      titulo={titulo}
      subtitulo={subtitulo}
      onClose={onClose}
      ancho="max-w-md"
      acciones={
        <>
          <BotonB onClick={onClose}>Cerrar</BotonB>
          {onPausar && (
            <BotonB variante="ambar" icono="pausa" onClick={onPausar}>
              Pausar
            </BotonB>
          )}
        </>
      }
    >
      <div className="space-y-4 text-[13px]">
        {vista && (
          <div className="flex items-center justify-between gap-3">
            <EstadoBadge estado={vista.estado} />
            <span className="text-2xl font-extrabold tabular-nums text-texto">{cronoDe(vista)}</span>
          </div>
        )}
        <div className="space-y-1">
          <Fila etiqueta="Abrió" valor={`${quien.abrio} · ${cuando(sesion.abierta ?? sesion.start, ahora)}`} />
          {sesion.cliente && <Fila etiqueta="Cliente" valor={sesion.cliente} />}
          {vista?.estado === "pausada" && (
            <Fila
              etiqueta="En pausa"
              valor={[sesion.pauseMotivo, quien.pausadaPor && textoPausa(quien.pausadaPor)].filter(Boolean).join(" · ")}
            />
          )}
        </div>
        <div className="space-y-1 border-t border-borde-soft pt-3">
          {vista && <Fila etiqueta="Tiempo" valor={fmtMoney(calc.tiempoBs)} />}
          <Fila etiqueta="Consumos" valor={fmtMoney(calc.consumosBs)} />
          <Fila etiqueta="Total" valor={fmtMoney(calc.total)} fuerte />
          {calc.pagado > 0 && <Fila etiqueta="Ya pagó" valor={fmtMoney(calc.pagado)} />}
          {calc.pagado > 0 && <Fila etiqueta="Falta cobrar" valor={fmtMoney(calc.saldo)} fuerte />}
        </div>

        <div className="space-y-2 border-t border-borde-soft pt-3">
          <Rotulo icono="cart">Consumos</Rotulo>
          {consumos.length === 0 ? (
            <p className="text-texto-3">Todavía no cargaron nada.</p>
          ) : (
            <ul className="space-y-2">
              {consumos.map((c) => {
                const de = quien.consumos.get(c.id);
                return (
                  <li key={c.id} className={c.anulado ? "opacity-60" : ""}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`min-w-0 font-semibold text-texto ${c.anulado ? "line-through" : ""}`}>
                        {c.cant}× {c.nombre}
                      </span>
                      <span className={`tabular-nums text-texto-2 ${c.anulado ? "line-through" : ""}`}>{fmtMoney(c.precio * c.cant)}</span>
                    </div>
                    <p className="text-[12px] text-texto-3">
                      {de ? `Cargó ${de.por}` : "Cargado"} · {cuando(c.hora, ahora)}
                      {c.anulado && <> · anulado{de?.anuladoPor ? ` por ${de.anuladoPor}` : ""}</>}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {sesion.pagos.length > 0 && (
          <div className="space-y-2 border-t border-borde-soft pt-3">
            <Rotulo icono="billetera">Cobros</Rotulo>
            <ul className="space-y-2">
              {sesion.pagos.map((p) => (
                <PagoDe key={p.id} p={p} ahora={ahora} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PagoDe({ p, ahora }: { p: Pago; ahora: number }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-texto">
          {p.nota ?? "Cobro"} · {p.metodo}
        </span>
        <span className="tabular-nums text-texto-2">{fmtMoney(p.monto)}</span>
      </div>
      <p className="text-[12px] text-texto-3">
        {p.cobradoPor ? `Cobró ${p.cobradoPor}` : "Cobrado"} · {cuando(p.hora, ahora)}
      </p>
    </li>
  );
}

// ── Pausar ──────────────────────────────────────────────────────────────────

/**
 * Pausar una mesa desde acá: sólo el motivo, sin PIN ni caja propia. Queda a
 * nombre del administrador y marcada como "desde Supervisión".
 */
function PausarDesdeSupervision({
  numero,
  sesionId,
  onClose,
  onHecho,
}: {
  numero: number;
  sesionId: number;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [motivo, setMotivo] = useState(MOTIVOS_PAUSA[0]);
  const [otro, setOtro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const final = motivo === "Otro" ? otro.trim() : motivo;

  const pausar = async () => {
    if (enviando) return;
    setEnviando(true);
    setError("");
    try {
      await apiBillar.pausarSupervision(sesionId, final);
      onHecho();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "No se pudo pausar. Probá de nuevo.");
      setEnviando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={`Pausar Mesa ${numero}`}
      subtitulo="Se pausa a tu nombre, sin PIN. La cajera la ve pausada y la reanuda ella."
      onClose={onClose}
      ancho="max-w-md"
      acciones={
        <>
          <BotonB onClick={onClose}>Cancelar</BotonB>
          <BotonB variante="ambar" icono="pausa" disabled={final.length < 2 || enviando} onClick={() => void pausar()}>
            {enviando ? "Pausando…" : "Pausar"}
          </BotonB>
        </>
      }
    >
      <p className="mb-2 text-[13px] font-semibold text-texto-2">Motivo</p>
      <ChipsMotivo motivos={MOTIVOS_PAUSA} valor={motivo} onCambiar={setMotivo} />
      {motivo === "Otro" && (
        <input
          autoFocus
          value={otro}
          onChange={(ev) => setOtro(ev.target.value)}
          placeholder="¿Qué pasó?"
          aria-label="Otro motivo"
          maxLength={80}
          className="input mt-3 w-full"
        />
      )}
      <ErrorAccion texto={error} />
    </Modal>
  );
}

// ── La actividad ────────────────────────────────────────────────────────────

const ICONO_ACTIVIDAD: Record<string, NombreIcono> = {
  CAJA_ABIERTA: "lock",
  CAJA_CERRADA: "lock",
  VENTA: "billetera",
  VENTA_ANULADA: "x",
  CONSUMO: "cart",
  PAUSAR: "pausa",
  REANUDAR: "play",
  ABRIR: "bola",
  ABRIR_CUENTA: "users",
  EFECTIVO: "swap",
  EFECTIVO_CENA: "cubiertos",
};

const TONO_ICONO: Record<TonoActividad, string> = {
  normal: "bg-slate-100 text-slate-600",
  ambar: "bg-amber-100 text-amber-700",
  rosa: "bg-rose-100 text-rose-700",
  verde: "bg-primary-50 text-primary-700",
  azul: "bg-blue-100 text-blue-700",
  violeta: "bg-violet-100 text-violet-700",
};

function RenglonActividad({ a, ahora }: { a: ActividadApi; ahora: number }) {
  const tono = tonoDeActividad(a.codigo);
  return (
    <li className="flex gap-3 px-4 py-3 sm:px-5">
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONO_ICONO[tono]}`}>
        <Icon name={ICONO_ACTIVIDAD[a.codigo] ?? "info"} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-texto">
          <b className="font-bold">{a.quien || "Alguien"}</b> · {a.texto}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-texto-3">
          <span className="tabular-nums">{cuando(a.hora, ahora)}</span>
          {a.lugar && <span className="rounded bg-slate-100 px-1.5 py-px font-semibold text-texto-2">{a.lugar}</span>}
          {a.autorizo && <span>Autorizó {a.autorizo}</span>}
          {a.motivo && <span className="min-w-0 truncate">«{a.motivo}»</span>}
        </p>
      </div>
    </li>
  );
}
