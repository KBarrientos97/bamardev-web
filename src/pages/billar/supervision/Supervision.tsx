import { Fragment, useMemo, useState } from "react";
import { Icon, type NombreIcono } from "../../../components/Icon";
import { AvisoOk, Cargando, ErrorMsg, Modal, useAviso, Vacio } from "../../../components/ui";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { useSucursales } from "../../../lib/useSucursales";
import { useAuth } from "../../../store/AuthContext";
import DialogoMovimiento from "../../pos/DialogoMovimiento";
import { MOTIVOS_BILLAR } from "../../pos/motivosMovimiento";
import { bsResta } from "../../reportes/formato";
import type {
  ActividadApi,
  CajaSupervisionApi,
  MovimientoSupervisionApi,
  SupervisionApi,
  VentaApi,
} from "../api";
import { fmtCobrado, fmtHace, horaDe } from "../calculo";
import { ESTADOS } from "../estilos";
import { ChipsMotivo } from "../ModalesMesa";
import { MOTIVOS_PAUSA } from "../ModalesMesa.datos";
import { useAhora } from "../reloj";
import { subColor, subLinea } from "../TarjetaMesaTextos";
import type { Pago } from "../tipos";
import { BotonB, ChipFiltro, Circulo, ErrorAccion, EstadoBadge, Fila, Nota, Rotulo, SelectorSucursal, Tarjeta } from "../ui";
import { cronoDe, nombreMesa, origenDe, textoMetodo, vistaCuenta, vistaDe, type VistaCuenta, type VistaMesa } from "../vista";
import {
  armarSupervision,
  consumosEnCurso,
  cuando,
  desglosePorCobrar,
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
  seVeLoPedido,
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
import { AnularMovimiento, TarjetaEfectivo } from "./EfectivoSupervision";
import { destinoDelMovimiento, type DestinoDelMovimiento } from "./EfectivoSupervision.datos";
import { TarjetaLoQueSalio } from "./LoQueSalio";
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
  const { incluye, usuario } = useAuth();
  // La caja a la que va (y su cajero y su esperado) se fija al ABRIR el cuadro
  // (25-oct). Antes se releía del sondeo de 5 s: si en el cambio de turno una
  // caja cerraba y otra abría con el cuadro abierto, la cena de una cajera
  // entraba en la caja de la otra (una cerraba con faltante y la otra con sobrante).
  const [registrando, setRegistrando] = useState<(DestinoDelMovimiento & { motivo?: string }) | null>(null);
  const [anulando, setAnulando] = useState<{ movimiento: MovimientoSupervisionApi; cajaId: number; cajero: string } | null>(null);
  // El detalle de un renglón de la actividad (25-oct): la mesa, cuenta o venta, o la caja.
  const [verDetalle, setVerDetalle] = useState<Consulta | null>(null);
  const [verCaja, setVerCaja] = useState<number | null>(null);
  const [aviso, setAviso] = useAviso();

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
  // Lo que salió: lo pedido sólo cambia con el sondeo; la cuenta del "Por
  // cobrar" lleva el tiempo de las mesas, así que sigue al reloj como el KPI.
  const enCurso = useMemo(() => (datos ? consumosEnCurso(datos) : []), [datos]);
  const porCobrar = useMemo(
    () => desglosePorCobrar(mesas.map((m) => m.vista), cuentas.map((c) => c.vista)),
    [mesas, cuentas],
  );

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
  /** Abre el detalle de un renglón: su mesa o cuenta, su venta o su caja. Sin ref no hay nada que abrir. */
  const verDe = (a: ActividadApi): (() => void) | undefined => {
    const ref = a.ref;
    if (!ref) return undefined;
    if (ref.caja != null) return () => setVerCaja(ref.caja!);
    if (ref.sesion != null || ref.venta != null) return () => setVerDetalle({ sesion: ref.sesion, venta: ref.venta });
    return undefined;
  };
  // Con la semana entera la lista es larga: se ven las últimas y, siempre, la que se está mirando.
  const cajasVisibles = datos.cajas.filter((c, i) => todasLasCajas || i < CAJAS_DE_ENTRADA || c.id === turno.caja?.id);
  const cajasOcultas = datos.cajas.length - cajasVisibles.length;
  const tituloActividad = turno.situacion === "hoy" ? "Actividad de hoy" : "Actividad del turno";
  // A qué caja iría un movimiento si se abre el cuadro ahora. La tarjeta lo
  // dice: con la caja del administrador a la vista, el cuadro propone la de la
  // cajera, y lo registrado allá no aparece en esta lista.
  const destino =
    datos.efectivo && turno.caja
      ? destinoDelMovimiento(
          { cajaId: datos.efectivo.cajaId, cajero: turno.caja.cajero, desde: turno.caja.desde, esperado: datos.efectivo.esperado },
          datos.cajas,
          usuario?.id,
          datos.desde,
        )
      : null;
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

            {/* Desde el 25-oct el servidor manda lo vendido también sin caja (la
                jornada, como el KPI); sin un turno que mirar la tarjeta no dice
                nada que no diga el "Vendido hoy", y sigue escondida como antes. */}
            {datos.productos && turno.caja && (
              <TarjetaLoQueSalio
                productos={datos.productos}
                enCurso={enCurso}
                porCobrar={porCobrar}
                verEnCurso={seVeLoPedido(turno)}
              />
            )}

            <AvisoOk>{aviso}</AvisoOk>
            {datos.efectivo && turno.caja && destino && (
              <TarjetaEfectivo
                efectivo={datos.efectivo}
                caja={turno.caja}
                puedeRegistrar={incluye("movimientos_caja")}
                esMia={turno.caja.cajeroId != null && turno.caja.cajeroId === usuario?.id}
                vaA={destino.cajaId !== datos.efectivo.cajaId ? destino.deQuien.nombre : null}
                variasAbiertas={(destino.cajas?.length ?? 0) > 1}
                ahora={ahora}
                onRegistrar={(motivo) => setRegistrando({ motivo, ...destino })}
                onAnular={(movimiento) => setAnulando({ movimiento, cajaId: datos.efectivo!.cajaId, cajero: turno.caja!.cajero })}
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
                  {actividad.slice(0, cuantos).map((a, i, lista) => (
                    <Fragment key={a.id}>
                      {/* En una noche movida la lista tiene tope, pero la caja y el
                          efectivo vienen siempre: sin este corte, la apertura de las
                          16:00 quedaba pegada a lo de las 21:00 como si en el medio
                          no hubiera pasado nada. En "Caja" y "Efectivo" están todos. */}
                      {filtro === "todo" && a.fueraDelTope && i > 0 && !lista[i - 1].fueraDelTope && (
                        <li className="bg-slate-50 px-4 py-2.5 text-[12px] leading-snug text-texto-3">
                          Antes de las {horaDe(lista[i - 1].hora)} sólo se ven la caja y el efectivo: lo demás no entra en la lista.
                        </li>
                      )}
                      <RenglonActividad a={a} ahora={ahora} onVer={verDe(a)} />
                    </Fragment>
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
          historial={{ sesion: Number(mesaViendo.mesa.sesion!.id) }}
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
          historial={{ sesion: Number(cuentaViendo.cuenta.sesion.id) }}
          onClose={() => setViendo(null)}
        />
      )}
      {verDetalle && (
        <DetalleDeActividad
          consulta={verDetalle}
          mesas={mesas}
          cuentas={cuentas}
          tipos={contexto?.tipos ?? {}}
          ahora={ahora}
          onClose={() => setVerDetalle(null)}
        />
      )}
      {verCaja != null && datos.cajas.some((c) => c.id === verCaja) && (
        <DetalleCaja c={datos.cajas.find((c) => c.id === verCaja)!} ahora={ahora} onClose={() => setVerCaja(null)} />
      )}
      {registrando && (
        <DialogoMovimiento
          cajaId={registrando.cajaId}
          deQuien={registrando.deQuien}
          // La caja queda fija desde que se abrió el cuadro, pero su esperado
          // sigue al sondeo: una mesa cobrada mientras se escribe lo cambia.
          esperado={datos.efectivo?.cajaId === registrando.cajaId ? datos.efectivo.esperado : registrando.esperado}
          cajas={registrando.cajas}
          motivos={MOTIVOS_BILLAR}
          motivoInicial={registrando.motivo}
          onClose={() => setRegistrando(null)}
          onGuardado={(cajaId) => {
            setRegistrando(null);
            if (cajaId === datos.efectivo?.cajaId) {
              void recargar();
              return;
            }
            // Fue a otra caja que la de la tarjeta (con la caja del
            // administrador a la vista, el cuadro propone la de la cajera): se
            // pasa a su turno, donde se ve y se puede anular. Antes la tarjeta
            // seguía en "Todavía no se registró ningún movimiento" y se volvía
            // a cargar.
            const caja = datos.cajas.find((c) => c.id === cajaId);
            setAviso(`Registrado en la caja de ${caja?.cajero ?? "la otra caja"}: estás viendo su turno.`);
            elegirTurno(cajaId);
          }}
        />
      )}
      {anulando && (
        <AnularMovimiento
          cajaId={anulando.cajaId}
          cajera={anulando.cajero}
          movimiento={anulando.movimiento}
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
  historial,
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
  /** Con esto, abajo va todo lo que se hizo con esta mesa o cuenta (se pide al abrir). */
  historial?: Consulta;
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

        {historial && <Historial consulta={historial} ahora={ahora} />}
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


type Consulta = { sesion?: number; venta?: number };

/**
 * Lo que se hizo con una mesa, cuenta o venta, de lo más viejo a lo más nuevo:
 * quién la abrió, qué consumos cargó y a qué hora, las pausas, los cobros y las
 * anulaciones. Es la lista sola: la pide quien la muestra.
 */
function ListaHistorial({ historial, ahora }: { historial: ActividadApi[]; ahora: number }) {
  if (historial.length === 0) return <p className="text-texto-3">Todavía no hay nada más que contar.</p>;
  return (
    <ol className="space-y-3">
      {historial.map((h) => (
        <li key={h.id} className="flex gap-3">
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONO_ICONO[tonoDeActividad(h.codigo)]}`}>
            <Icon name={ICONO_ACTIVIDAD[h.codigo] ?? "info"} size={13} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="leading-snug text-texto">
              <b className="font-bold">{h.quien || "Alguien"}</b> · {h.texto}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-texto-3">
              <span className="tabular-nums">{cuando(h.hora, ahora)}</span>
              {h.autorizo && <span>Autorizó {h.autorizo}</span>}
              {h.motivo && <span className="min-w-0">«{h.motivo}»</span>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** El historial de una mesa o cuenta que sigue abierta, al pie de su detalle en vivo. */
function Historial({ consulta, ahora }: { consulta: Consulta; ahora: number }) {
  const d = useApi(() => apiBillar.detalleSupervision(consulta), [consulta.sesion, consulta.venta]);
  return (
    <div className="space-y-2 border-t border-borde-soft pt-3">
      <Rotulo icono="lista">Lo que se hizo</Rotulo>
      {d.cargando ? (
        <p className="text-texto-3">Cargando…</p>
      ) : d.error ? (
        <ErrorMsg onReintentar={d.recargar}>{d.error}</ErrorMsg>
      ) : (
        <ListaHistorial historial={d.datos?.historial ?? []} ahora={ahora} />
      )}
    </div>
  );
}

/**
 * El detalle de lo que se tocó en la actividad: una mesa o cuenta que sigue
 * abierta abre su detalle en vivo (con el historial abajo); una ya cobrada, o
 * una venta, abre el ticket con todo lo que se hizo.
 */
function DetalleDeActividad({
  consulta,
  mesas,
  cuentas,
  tipos,
  ahora,
  onClose,
}: {
  consulta: Consulta;
  mesas: (MesaSup & { vista: VistaMesa })[];
  cuentas: (CuentaSup & { vista: VistaCuenta })[];
  tipos: Record<string, { nombre: string }>;
  ahora: number;
  onClose: () => void;
}) {
  const sid = consulta.sesion != null ? Number(consulta.sesion) : null;
  const mesa = sid != null ? mesas.find((m) => m.mesa.sesion != null && Number(m.mesa.sesion.id) === sid) : undefined;
  const cuenta = sid != null ? cuentas.find((c) => Number(c.cuenta.sesion.id) === sid) : undefined;
  if (sid != null && mesa?.quien && mesa.vista.cuenta) {
    return (
      <DetalleSesion
        titulo={nombreMesa(mesa.mesa)}
        subtitulo={mesa.vista.tipo.nombre}
        vista={mesa.vista}
        sesion={mesa.mesa.sesion!}
        calc={mesa.vista.cuenta}
        quien={mesa.quien}
        ahora={ahora}
        onClose={onClose}
        historial={{ sesion: sid }}
      />
    );
  }
  if (sid != null && cuenta) {
    return (
      <DetalleSesion
        titulo={`Cuenta ${cuenta.cuenta.nombre}`}
        sesion={cuenta.cuenta.sesion}
        calc={cuenta.vista.calc}
        quien={cuenta.quien}
        ahora={ahora}
        onClose={onClose}
        historial={{ sesion: sid }}
      />
    );
  }
  return <DetalleCobrado consulta={consulta} tipos={tipos} ahora={ahora} onClose={onClose} />;
}

/** Una venta ya cobrada (o anulada): el ticket y todo lo que se hizo hasta cobrarla. */
function DetalleCobrado({
  consulta,
  tipos,
  ahora,
  onClose,
}: {
  consulta: Consulta;
  tipos: Record<string, { nombre: string }>;
  ahora: number;
  onClose: () => void;
}) {
  const d = useApi(() => apiBillar.detalleSupervision(consulta), [consulta.sesion, consulta.venta]);
  const v = d.datos?.venta ?? null;
  return (
    <Modal
      abierto
      titulo={v ? `Venta ${v.codigo}` : "Detalle"}
      subtitulo={v ? origenDe(v, tipos) : undefined}
      onClose={onClose}
      ancho="max-w-md"
      acciones={<BotonB onClick={onClose}>Cerrar</BotonB>}
    >
      <div className="space-y-4 text-[13px]">
        {d.cargando ? (
          <Cargando texto="Cargando el detalle…" />
        ) : d.error ? (
          <ErrorMsg onReintentar={d.recargar}>{d.error}</ErrorMsg>
        ) : (
          <>
            {v && <TicketDeVenta v={v} ahora={ahora} />}
            <div className={`space-y-2 ${v ? "border-t border-borde-soft pt-3" : ""}`}>
              <Rotulo icono="lista">Lo que se hizo</Rotulo>
              <ListaHistorial historial={d.datos?.historial ?? []} ahora={ahora} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Lo cobrado en una venta del billar: quién, cuánto tiempo, qué consumos y cómo se pagó. */
function TicketDeVenta({ v, ahora }: { v: VentaApi; ahora: number }) {
  const mesa = v.origen === "mesa";
  return (
    <div className="space-y-4">
      {v.anulada && (
        <Nota tono="rosa" icono="alert">
          <b>Venta anulada</b> por {v.anulada.quien} · {cuando(v.anulada.hora, ahora)}
          {v.anulada.motivo ? `: «${v.anulada.motivo}»` : ""}
        </Nota>
      )}
      <div className="space-y-1">
        <Fila etiqueta="Cobró" valor={`${v.cajero} · ${cuando(v.hora, ahora)}`} />
        {v.cliente && <Fila etiqueta="Cliente" valor={v.cliente} />}
        {mesa && <Fila etiqueta="Tiempo cobrado" valor={`${fmtCobrado(v.tiempoMin)} · ${fmtMoney(v.tiempoBs + (v.promo?.descuento ?? 0))}`} />}
        {mesa && v.tiempoPrevioMin ? <Fila etiqueta="En otra mesa" valor={`${fmtCobrado(v.tiempoPrevioMin)} a su tarifa`} /> : null}
        {mesa && v.pausaMin ? <Fila etiqueta="En pausa (no se cobra)" valor={fmtCobrado(v.pausaMin)} /> : null}
        {v.promo && <Fila etiqueta={v.promo.nombre} valor={`−${fmtMoney(v.promo.descuento)}`} />}
      </div>

      {v.items.length > 0 && (
        <div className="space-y-1 border-t border-borde-soft pt-3">
          <Rotulo icono="cart">Consumos</Rotulo>
          {v.items.map((i) => (
            <Fila key={`${i.productoId}-${i.precio}`} etiqueta={`${i.cant}× ${i.nombre}`} valor={fmtMoney(i.precio * i.cant)} />
          ))}
        </div>
      )}

      <div className="space-y-1 border-t border-borde-soft pt-3">
        <Fila etiqueta="Total" valor={fmtMoney(v.total)} fuerte />
        {v.pagos.map((p) => (
          <Fila key={p.id} etiqueta={`Pagó con ${textoMetodo(p)}${p.nota ? ` · ${p.nota}` : ""}`} valor={fmtMoney(p.monto)} />
        ))}
        {v.devuelto ? (
          <>
            {v.devuelto.efectivo > 0.005 && <Fila etiqueta="Devuelto en efectivo" valor={fmtMoney(v.devuelto.efectivo)} />}
            {v.devuelto.otros.map((o) => (
              <Fila key={o.metodo} etiqueta={`Devuelto por ${o.metodo}`} valor={fmtMoney(o.monto)} />
            ))}
          </>
        ) : (
          v.recibido !== undefined && (
            <>
              <Fila etiqueta="Le dieron" valor={fmtMoney(v.recibido)} />
              <Fila etiqueta="Cambio" valor={fmtMoney(v.cambio ?? 0)} />
            </>
          )
        )}
      </div>
    </div>
  );
}

/** Una caja de la semana: quién la abrió y cuándo, con cuánto, cómo la cerró. */
function DetalleCaja({ c, ahora, onClose }: { c: CajaSupervisionApi; ahora: number; onClose: () => void }) {
  return (
    <Modal
      abierto
      titulo={`Caja de ${c.cajero}`}
      subtitulo={c.abierta ? "Abierta" : "Cerrada"}
      onClose={onClose}
      ancho="max-w-md"
      acciones={<BotonB onClick={onClose}>Cerrar</BotonB>}
    >
      <div className="space-y-4 text-[13px]">
        <div className="space-y-1">
          <Fila etiqueta="Abrió" valor={`${c.cajero} · ${cuando(c.desde, ahora)}`} />
          <Fila etiqueta="Abrió con" valor={fmtMoney(c.inicial)} />
          {c.hasta != null ? (
            <Fila etiqueta="Cerró" valor={`${c.cerroPor ?? c.cajero} · ${cuando(c.hasta, ahora)} (${duracion(c.hasta - c.desde)})`} />
          ) : (
            <Fila etiqueta="Lleva" valor={duracion(ahora - c.desde)} />
          )}
        </div>
        <div className="space-y-1 border-t border-borde-soft pt-3">
          <Fila etiqueta="Vendió" valor={`${fmtMoney(c.vendido)} · ${c.ventas} ${c.ventas === 1 ? "venta" : "ventas"}`} />
          {c.anuladas > 0 && <Fila etiqueta="Ventas anuladas" valor={String(c.anuladas)} />}
          {c.cena && <Fila etiqueta="Cena" valor={`${bsResta(c.cena.monto)}${c.cena.por ? ` · ${c.cena.por}` : ""}`} />}
          {c.contado != null && <Fila etiqueta="Contó al cerrar" valor={fmtMoney(c.contado)} />}
          {c.contado != null && <Fila etiqueta="Diferencia" valor={textoDiferencia(c.diferencia ?? 0)} />}
        </div>
        {c.nota && <p className="border-t border-borde-soft pt-3 text-texto-2">Nota al cerrar: {c.nota}</p>}
      </div>
    </Modal>
  );
}

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

/**
 * Un renglón de la actividad. Si tiene de qué ser (`onVer`: una mesa, una cuenta,
 * una venta o una caja), se toca y abre su detalle completo (25-oct).
 */
function RenglonActividad({ a, ahora, onVer }: { a: ActividadApi; ahora: number; onVer?: () => void }) {
  const tono = tonoDeActividad(a.codigo);
  const cuerpo = (
    <>
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
      {onVer && (
        <span className="mt-2 shrink-0 text-texto-4">
          <Icon name="chevronRight" size={16} />
        </span>
      )}
    </>
  );
  return (
    <li>
      {onVer ? (
        <button
          type="button"
          onClick={onVer}
          aria-label={`Ver el detalle: ${a.quien} · ${a.texto}`}
          className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none sm:px-5"
        >
          {cuerpo}
        </button>
      ) : (
        <div className="flex gap-3 px-4 py-3 sm:px-5">{cuerpo}</div>
      )}
    </li>
  );
}
