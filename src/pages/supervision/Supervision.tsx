import { Fragment, useMemo, useState } from "react";
import { Desplegable } from "../../components/Desplegable";
import { Icon, type NombreIcono } from "../../components/Icon";
import { Cargando, ErrorMsg, Vacio } from "../../components/ui";
import { esPositivo } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import { tienePermiso } from "../../lib/permisos";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";
import { BotonB, ChipFiltro, Circulo, Nota, SelectorSucursal, Tarjeta } from "../billar/ui";
import { DialogoAnular, type VentaParaAnular } from "../pos/DialogoAnular";
import type { Actividad, CajaSupervision, SupervisionRestaurante, VentaSupervision } from "./api";
import { Bloques, type Pestana } from "./Bloques";
import {
  COLOR_DIFERENCIA,
  columnasDeKpis,
  cuando,
  duracion,
  equipoDeCaja,
  estadoDeCaja,
  filtrarActividad,
  FILTROS_ACTIVIDAD,
  haceCuanto,
  iconoDeActividad,
  iniciales,
  opcionesDeTurno,
  ordenarActividad,
  plural,
  rangoDeSemana,
  rangoDeTurno,
  reinicioDeSemana,
  resumenCajeros,
  resumenPorMedio,
  situacionDelTurno,
  textoDiferencia,
  textoPorCobrar,
  tonoDeActividad,
  tonoDiferencia,
  type EstadoCaja,
  type EstadoEquipo,
  type FiltroActividad,
  type FilaCajero,
  type SituacionTurno,
  type TonoActividad,
  type TonoDiferencia,
} from "./Supervision.datos";
import { useSupervision } from "./useSupervision";

/** Cuántos renglones de actividad se ven de entrada, y cuántos suma "Ver más". */
const DE_A = 30;
/** Cuántas cajas se ven de entrada en la lista; el resto de la semana, con "Ver más". */
const CAJAS_DE_ENTRADA = 3;

/**
 * Lo que el diálogo de anular necesita, sacado de la venta de la Supervisión:
 * los pagos con el nombre del medio (por ahí sabe cuánto vuelve por QR y
 * cuánto sale del cajón), el comprobante y el total.
 */
function paraAnular(v: VentaSupervision): VentaParaAnular {
  return { id: v.id, comprobante: v.comprobante, total: v.total, pagos: v.pagos.map((p) => ({ formaPago: p.medio, monto: p.monto })) };
}

/**
 * Supervisión del local (12-nov): lo que hacen los cajeros del restaurante
 * (o de cualquier negocio de mostrador), en vivo. Es la hermana de las
 * Supervisiones del billar y de la farmacia y toma de ellas la estructura: el
 * turno es la caja (de que abre a que cierra), los turnos que se eligen son
 * los de la semana, y la actividad lleva el nombre de quien hizo cada cosa.
 *
 * Lo propio de ésta:
 * - **Cajeros**: quién tiene caja abierta y quién no, y el estado del equipo
 *   de cada caja (en línea o sin señal, ventas sin subir). Android vende sin
 *   internet y sube después: sin esto, una caja sin ventas en la última hora
 *   se leía igual si no entró nadie o si el celular se quedó sin datos.
 * - **Pedidos** en camino, que no están en lo vendido.
 * - **Anular** con PIN y motivo, el mismo diálogo del Historial: el dueño que
 *   ve un error desde acá no tiene que pedirle al cajero que lo haga.
 *
 * Es del dueño y del encargado (`caja.ver_todas`), nunca del cajero. Anular
 * pide además `ventas.anular` (y el backend, el PIN).
 */
export default function Supervision() {
  const { datos, error, llegoEn, ahora, sucursal, elegirSucursal, elegirTurno, recargar } = useSupervision();
  const { usuario } = useAuth();
  const suc = useSucursales();
  const [filtro, setFiltro] = useState<FiltroActividad>("todo");
  const [cuantos, setCuantos] = useState(DE_A);
  const [todasLasCajas, setTodasLasCajas] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("ventas");
  const [ventaAbierta, setVentaAbierta] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [anulando, setAnulando] = useState<VentaSupervision | null>(null);

  const turno = useMemo(() => (datos ? situacionDelTurno(datos, ahora) : null), [datos, ahora]);
  const porMedio = useMemo(() => (datos ? resumenPorMedio(datos.turno.porMedio) : null), [datos]);
  const cajeros = useMemo(() => (datos ? resumenCajeros(datos, ahora) : []), [datos, ahora]);
  const actividad = useMemo(() => (datos ? filtrarActividad(ordenarActividad(datos.actividad), filtro) : []), [datos, filtro]);

  if (!datos || !turno || !porMedio) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Cabecera titulo="Supervisión" />
        {error ? (
          <div className="p-6">
            <ErrorMsg onReintentar={() => void recargar()}>{error}</ErrorMsg>
          </div>
        ) : (
          <Cargando texto="Cargando lo que pasa en el local…" />
        )}
      </div>
    );
  }

  // Como el Historial: el botón se ofrece con el permiso, y el PIN se pide
  // siempre en el diálogo. Sin el permiso no se muestra (el servidor lo
  // rechazaría y el dueño se quedaría con un botón que no hace nada).
  const puedeAnular = tienePermiso(usuario, "ventas.anular");
  const selector = suc.elegir ? (
    <SelectorSucursal valor={sucursal ?? datos.sucursal.id} sucursales={suc.sucursales} onElegir={elegirSucursal} />
  ) : undefined;
  const t = datos.turno;
  const sinCaja = turno.situacion === "sinCaja";
  // Con la semana entera la lista es larga: se ven las últimas y, siempre, la que se está mirando.
  const cajasOrdenadas = [...datos.cajas].sort((a, b) => b.desde - a.desde);
  const cajasVisibles = cajasOrdenadas.filter((c, i) => todasLasCajas || i < CAJAS_DE_ENTRADA || c.id === turno.caja?.id);
  const cajasOcultas = datos.cajas.length - cajasVisibles.length;
  const tituloActividad = sinCaja ? "Actividad de hoy" : "Actividad del turno";
  const enElTurno = sinCaja ? "hoy" : "en el turno";
  const conCaja = cajeros.filter((c) => c.abierta).length;

  /** Abre una venta de la actividad en el bloque de Ventas (si todavía está en la lista). */
  const abrirVenta = (id: number) => {
    setPestana("ventas");
    // Con algo escrito en el buscador la venta podía quedar filtrada: se abría
    // "algo" que no se veía en ningún lado.
    setBusqueda("");
    setVentaAbierta(id);
    // Después de pintar: el renglón puede estar en otra pestaña y todavía no existir.
    setTimeout(() => document.getElementById(`venta-${id}`)?.scrollIntoView?.({ block: "center", behavior: "smooth" }), 0);
  };
  const verDe = (a: Actividad): (() => void) | undefined => {
    const venta = a.ref?.venta;
    if (venta == null || !datos.ventas.some((v) => v.id === venta)) return undefined;
    return () => abrirVenta(venta);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Cabecera
        titulo="Supervisión"
        sucursal={selector ?? <EtiquetaSucursal nombre={datos.sucursal.nombre} />}
        subtitulo={
          <>
            <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${error ? "bg-amber-500" : "animate-pulse bg-primary"}`} />
            {error ? "Sin conexión: lo que ves puede estar atrasado" : `En vivo · actualizado ${haceCuanto(ahora - llegoEn)}`}
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

            {sinCaja ? (
              <div className="card">
                <Vacio
                  icono="lock"
                  titulo="Nadie abrió caja esta semana todavía"
                  texto="Cuando un cajero abra la caja, acá se ve lo que hace, en vivo. Abajo, lo de hoy que no necesita caja."
                />
              </div>
            ) : (
              turno.caja && <SelectorDeTurno datos={datos} situacion={turno.situacion} caja={turno.caja} ahora={ahora} onElegir={elegirTurno} />
            )}

            {/* Los números del turno: de a dos en el celular y, con lugar, según
                cuántas tarjetas haya (ver `columnasDeKpis`). Fijo en cuatro, un
                turno sin fiado ni pedidos dejaba dos tarjetas y medio renglón vacío. */}
            <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${columnasDeKpis(2 + Number(esPositivo(t.fiado)) + Number(esPositivo(t.descuentos)) + Number(t.pedidos.enCamino > 0))}`}>
              <Kpi icono="billetera" tono="verde" etiqueta={sinCaja ? "Vendido hoy" : "Vendido en el turno"} valor={fmtMoney(t.vendido)} pie={plural(t.ventas, "venta", "ventas")} />
              <Kpi
                icono="x"
                tono={t.anuladas ? "rosa" : "gris"}
                etiqueta="Anulado"
                valor={fmtMoney(t.anulado)}
                pie={t.anuladas ? plural(t.anuladas, "venta anulada", "ventas anuladas") : "Ninguna anulada"}
              />
              {/* Fiado, descuentos y pedidos sólo si los hubo: un "Bs 0,00" ahí se lee como un dato y no lo es. */}
              {esPositivo(t.fiado) && <Kpi icono="fileText" tono="ambar" etiqueta="Fiado" valor={fmtMoney(t.fiado)} pie={`quedó a crédito ${enElTurno}`} />}
              {esPositivo(t.descuentos) && <Kpi icono="percent" tono="azul" etiqueta="Descuentos" valor={fmtMoney(t.descuentos)} pie="sobre lo vendido" />}
              {/* Lo que salió y no se cobró todavía: no está en lo vendido, entra cuando se entregue. */}
              {t.pedidos.enCamino > 0 && (
                <Kpi
                  icono="truck"
                  tono="azul"
                  etiqueta="Pedidos en camino"
                  valor={String(t.pedidos.enCamino)}
                  pie={textoPorCobrar(t.pedidos)}
                />
              )}
            </div>

            <Tarjeta icono="coins" titulo="Cobrado por medio" extra={porMedio.mixtas ? plural(porMedio.mixtas, "venta mixta", "ventas mixtas") : undefined} cuerpo="px-4 py-3 sm:px-5">
              <dl className={`grid gap-2 text-[12px] ${columnas(porMedio.medios.length)}`}>
                {porMedio.medios.map((m) => (
                  <Dato key={m.clave} etiqueta={m.nombre} valor={fmtMoney(m.monto)} pie={plural(m.cobros, "cobro", "cobros")} />
                ))}
              </dl>
              {porMedio.mixtas > 0 && (
                <p className="mt-2 text-[12px] text-texto-3">Una venta pagada con dos medios cuenta en los dos: la suma de cobros no es la de ventas.</p>
              )}
            </Tarjeta>

            {cajeros.length > 0 && (
              <Tarjeta icono="users" titulo="Cajeros" extra={`${conCaja} con caja abierta de ${cajeros.length}`} cuerpo="p-0">
                <ul className="divide-y divide-borde-soft">
                  {cajeros.map((c) => (
                    <FilaDeCajero key={c.id} c={c} />
                  ))}
                </ul>
              </Tarjeta>
            )}

            {turno.caja && <TarjetaCajaDelTurno c={turno.caja} ahora={ahora} />}

            {datos.cajas.length > 0 && (
              <Tarjeta icono="clock" titulo="Cajas de la semana" extra={`Semana del ${rangoDeSemana(datos.semana)}`} cuerpo="p-0">
                <ul className="divide-y divide-borde-soft">
                  {cajasVisibles.map((c) => (
                    <FilaCaja
                      key={c.id}
                      c={c}
                      estado={estadoDeCaja(c, ahora)}
                      ahora={ahora}
                      viendo={turno.caja?.id === c.id}
                      onVer={() => elegirTurno(c.id === t.defectoId ? null : c.id)}
                    />
                  ))}
                </ul>
                {datos.cajas.length > CAJAS_DE_ENTRADA && (cajasOcultas > 0 || todasLasCajas) && (
                  <div className="border-t border-borde-soft p-3 text-center">
                    <BotonB onClick={() => setTodasLasCajas((v) => !v)}>{todasLasCajas ? "Mostrar menos" : `Ver ${cajasOcultas} más de la semana`}</BotonB>
                  </div>
                )}
              </Tarjeta>
            )}

            <Bloques
              datos={datos}
              ahora={ahora}
              pestana={pestana}
              onPestana={(p) => {
                setPestana(p);
                setVentaAbierta(null);
              }}
              ventaAbierta={ventaAbierta}
              onVenta={setVentaAbierta}
              busqueda={busqueda}
              onBusqueda={setBusqueda}
              onAnular={puedeAnular ? setAnulando : undefined}
            />
          </div>

          <aside aria-label={tituloActividad} className="min-w-0 xl:sticky xl:top-0 xl:self-start">
            <Tarjeta icono="lista" titulo={tituloActividad} extra={plural(datos.actividad.length, "renglón", "renglones")} cuerpo="p-0">
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
                      {/* En un turno movido la lista tiene tope, pero la caja y el efectivo
                          vienen siempre: sin este corte, la apertura de las 12:00 quedaba
                          pegada a lo de las 20:00 como si en el medio no hubiera pasado nada. */}
                      {filtro === "todo" && a.fueraDelTope && i > 0 && !lista[i - 1].fueraDelTope && (
                        <li className="bg-slate-50 px-4 py-2.5 text-[12px] leading-snug text-texto-3">
                          Antes de las {cuando(lista[i - 1].hora, ahora)} la lista no está completa: sólo se ven la caja y el efectivo.
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

      {anulando && (
        <DialogoAnular
          venta={paraAnular(anulando)}
          // La respuesta ya trae los renglones de la venta: no hay cuotas que
          // adivinar (y el instituto, el único que cobra cuotas, no tiene esta pantalla).
          detalleCompleto
          // Lo mismo que el Historial: quien autoriza con PIN se autoriza a sí
          // mismo; el resto necesita el usuario y el PIN de un encargado.
          pideUsuario={!tienePermiso(usuario, "autorizar.pin")}
          onClose={() => setAnulando(null)}
          onAnulada={() => {
            setAnulando(null);
            // Sin esperar el sondeo: la venta tiene que verse anulada ya, no en cinco segundos.
            void recargar();
          }}
        />
      )}
    </div>
  );
}

// ── El encabezado ───────────────────────────────────────────────────────────

/** El encabezado sin caja propia: acá no importa si el dueño abrió la suya. */
function Cabecera({ titulo, sucursal, subtitulo }: { titulo: string; sucursal?: React.ReactNode; subtitulo?: React.ReactNode }) {
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
  tono: "verde" | "ambar" | "azul" | "gris" | "rosa" | "violeta";
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
 * Qué turno se está mirando y por qué: lo de abajo es de esa caja, de que se
 * abrió a que se cerró. Por defecto es el de la caja que trabaja ahora; con
 * todas cerradas, cómo terminó la última (hasta que abran otra, y ahí la
 * pantalla empieza de cero); y se puede elegir uno anterior.
 */
function SelectorDeTurno({
  datos,
  situacion,
  caja,
  ahora,
  onElegir,
}: {
  datos: SupervisionRestaurante;
  situacion: SituacionTurno;
  caja: CajaSupervision;
  ahora: number;
  onElegir: (cajaId: number | null) => void;
}) {
  const defectoId = datos.turno.defectoId;
  const opciones = opcionesDeTurno(datos, ahora);
  return (
    <section aria-label="Turno" className="space-y-2.5">
      <div>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-texto-3">Turno que estás viendo</p>
          <p className="text-[11px] font-semibold text-texto-3">Semana del {rangoDeSemana(datos.semana)}</p>
        </div>
        {/* La lista es la de la app (`Desplegable`, 13-nov), no un `<select>`
            nativo: en el celular abría el diálogo del sistema. El texto (quién,
            desde cuándo) se parte en renglones en el celular en vez de cortarse
            con "…", en el botón y en la lista. */}
        <Desplegable
          etiqueta="Turno que estás viendo"
          valor={caja.id}
          opciones={opciones}
          onElegir={(id) => {
            // Elegir el que corresponde ahora es volver a seguirlo solo.
            onElegir(id === defectoId ? null : id);
          }}
          ancho="boton"
          className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-borde bg-white py-2 pl-3.5 pr-3 text-left text-[14px] font-semibold leading-snug text-texto outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary-100"
        >
          <span className="min-w-0 flex-1">{opciones.find((o) => o.id === caja.id)?.etiqueta}</span>
        </Desplegable>
        <p className="mt-1.5 text-[12px] text-texto-3">
          Los turnos de la semana, de lunes a domingo. La semana nueva empieza el {reinicioDeSemana(datos.semana)}.
        </p>
      </div>
      {situacion === "cerrado" && (
        <Nota tono="azul" icono="lock">
          {/* Quien la cerró, que no siempre es quien la abrió: el encargado cierra la caja que el cajero dejó abierta. */}
          <b>No hay caja abierta.</b> {caja.cerroPor ?? caja.cajero} cerró {caja.hasta != null ? cuando(caja.hasta, ahora) : ""} ({rangoDeTurno(caja, ahora)}). Esta pantalla
          empieza de cero cuando abran la siguiente.
        </Nota>
      )}
      {situacion === "olvidada" && (
        <Nota tono="ambar" icono="alert">
          <b>La caja de {caja.cajero} sigue abierta desde {cuando(caja.desde, ahora)}.</b> ¿Se olvidaron de cerrarla? Lo de abajo cuenta desde que la abrió.
        </Nota>
      )}
      {situacion === "elegido" && (
        <Nota tono="gris" icono="info">
          Estás viendo {caja.abierta ? "otra caja" : "un turno anterior"}, no lo que pasa ahora.{" "}
          <button type="button" onClick={() => onElegir(null)} className="font-bold underline">
            Volver al turno actual
          </button>
        </Nota>
      )}
    </section>
  );
}

// ── Los cajeros y su equipo ─────────────────────────────────────────────────

/**
 * El estado del equipo, en una línea: verde en línea y ámbar sin señal, con
 * el ícono además del color (quien no distingue el verde del ámbar lee igual
 * que el celular no está mandando).
 */
function LineaDeEquipo({ e }: { e: EstadoEquipo }) {
  const verde = e.tono === "verde";
  return (
    <p className={`mt-0.5 flex items-start gap-1.5 text-[12px] font-semibold ${verde ? "text-primary-700" : "text-amber-800"}`}>
      {verde ? (
        <span aria-hidden className="mt-[5px] h-2 w-2 shrink-0 rounded-full bg-primary" />
      ) : (
        <span aria-hidden className="mt-px shrink-0">
          <Icon name="wifiOff" size={13} />
        </span>
      )}
      <span className="min-w-0 break-words">{e.texto}</span>
    </p>
  );
}

/**
 * Un cajero: quién es, si tiene caja abierta (desde cuándo, con cuánto, qué
 * vendió) o cuándo hizo algo por última vez, y cómo está su equipo. Lo
 * primero que el dueño pregunta por teléfono es "¿quién está en caja?", y lo
 * segundo, "¿por qué no veo ventas?".
 */
function FilaDeCajero({ c }: { c: FilaCajero }) {
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Avatar nombre={c.nombre} apagado={!c.abierta} />
        <div className="min-w-[10rem] flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-[14px] font-bold text-texto">{c.nombre}</span>
            {c.rol && <span className="text-[11px] font-semibold text-texto-3">{c.rol}</span>}
          </p>
          <p className="text-[12px] text-texto-3">{c.linea}</p>
          {c.equipo && <LineaDeEquipo e={c.equipo} />}
        </div>
        {c.abierta && (
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            {c.olvidada && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">Quedó abierta</span>}
            <span className="text-[13px] font-bold tabular-nums text-texto">{fmtMoney(c.vendido)}</span>
            <span className="text-[11px] text-texto-3">
              {plural(c.ventas, "venta", "ventas")}
              {c.inicial != null && <> · inicial {fmtMoney(c.inicial)}</>}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

// ── Las cajas ───────────────────────────────────────────────────────────────

const BADGE_CAJA: Record<EstadoCaja, { texto: string; clase: string }> = {
  abierta: { texto: "Abierta", clase: "bg-primary-boton text-white" },
  vieja: { texto: "Quedó abierta", clase: "bg-amber-100 text-amber-800" },
  cerrada: { texto: "Cerrada", clase: "bg-slate-100 text-slate-600" },
};


/** Las columnas de una fila de datos: 4 bajan a 2 × 2 en el celular. */
function columnas(n: number): string {
  if (n >= 4) return "grid-cols-2 sm:grid-cols-4";
  return n === 3 ? "grid-cols-3" : "grid-cols-2";
}

/** "Abrió 12:02 · lleva 3 h 12 min" o "Abrió ayer 12:02 · cerró 03:10 (15 h 8 min) · la cerró Marta". */
function LineaDeCaja({ c, ahora }: { c: CajaSupervision; ahora: number }) {
  return (
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
  );
}

/** Las iniciales; en gris quien no tiene caja abierta, para que se lea de un vistazo quién está. */
function Avatar({ nombre, apagado = false }: { nombre: string; apagado?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${apagado ? "bg-slate-100 text-slate-500" : "bg-primary-50 text-primary-700"}`}
    >
      {iniciales(nombre)}
    </span>
  );
}

/**
 * La caja del turno que se mira, en grande: quién la abrió, con cuánto, y si
 * cerró, quién, cuánto contó y cómo quedó el arqueo. Abierta, además, cómo
 * está el equipo que la trabaja.
 */
function TarjetaCajaDelTurno({ c, ahora }: { c: CajaSupervision; ahora: number }) {
  const estado = estadoDeCaja(c, ahora);
  const badge = BADGE_CAJA[estado];
  const equipo = equipoDeCaja(c, ahora);
  return (
    <Tarjeta icono="lock" titulo="Caja del turno" extra={rangoDeTurno(c, ahora)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Avatar nombre={c.cajero} />
        <div className="min-w-[10rem] flex-1">
          <p className="truncate text-[15px] font-bold text-texto">{c.cajero}</p>
          <LineaDeCaja c={c} ahora={ahora} />
          {equipo && <LineaDeEquipo e={equipo} />}
        </div>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${badge.clase}`}>{badge.texto}</span>
      </div>
      <dl className={`mt-3 grid gap-2 text-[12px] ${columnas(3)}`}>
        <Dato etiqueta="Cambio inicial" corta="Cambio" valor={fmtMoney(c.inicial)} />
        <Dato
          etiqueta="Vendió"
          valor={fmtMoney(c.vendido)}
          pie={`${plural(c.ventas, "venta", "ventas")}${c.anuladas ? ` · ${plural(c.anuladas, "anulada", "anuladas")}` : ""}`}
        />
        {c.contado != null ? (
          <Dato etiqueta="Efectivo contado" corta="Contado" valor={fmtMoney(c.contado)} pie={textoDiferencia(c.diferencia ?? 0)} tono={tonoDiferencia(c.diferencia ?? 0)} />
        ) : (
          <Dato etiqueta="Cierre" valor={estado === "vieja" ? "Quedó abierta" : "Sigue abierta"} />
        )}
      </dl>
    </Tarjeta>
  );
}

/**
 * Una caja de la lista de la semana, corta: quién, cuándo y cómo quedó. Se
 * toca para pasar a mirar su turno (lo mismo que elegirlo arriba).
 */
function FilaCaja({ c, estado, ahora, viendo, onVer }: { c: CajaSupervision; estado: EstadoCaja; ahora: number; viendo: boolean; onVer: () => void }) {
  const badge = BADGE_CAJA[estado];
  const dif = c.contado != null ? tonoDiferencia(c.diferencia ?? 0) : null;
  return (
    <li aria-current={viendo ? "true" : undefined} className={`border-l-4 ${viendo ? "border-l-primary-boton bg-primary-50/40" : "border-l-transparent"}`}>
      {/* Un botón con nombre propio: adentro hay montos, y el nombre dice cuándo abrió (el mismo cajero tiene una caja por día). */}
      <button
        type="button"
        onClick={onVer}
        aria-label={`Ver el turno de la caja de ${c.cajero}, abrió ${cuando(c.desde, ahora)}${c.abierta ? ", sigue abierta" : ""}`}
        className="block w-full px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none sm:px-4"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Avatar nombre={c.cajero} />
          <div className="min-w-[10rem] flex-1">
            <p className="truncate text-[14px] font-bold text-texto">{c.cajero}</p>
            <LineaDeCaja c={c} ahora={ahora} />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${badge.clase}`}>{badge.texto}</span>
            <span className="text-[13px] font-bold tabular-nums text-texto">{fmtMoney(c.vendido)}</span>
            <span className="text-[11px] text-texto-3">
              {plural(c.ventas, "venta", "ventas")}
              {c.anuladas ? ` · ${plural(c.anuladas, "anulada", "anuladas")}` : ""}
            </span>
            {dif && <span className={`text-[11px] font-semibold ${COLOR_DIFERENCIA[dif]}`}>{textoDiferencia(c.diferencia ?? 0)}</span>}
          </div>
        </div>
      </button>
    </li>
  );
}

function Dato({
  etiqueta,
  corta,
  valor,
  pie,
  tono,
}: {
  etiqueta: string;
  /** La etiqueta en el celular, donde la larga no entra. */
  corta?: string;
  valor: string;
  pie?: string;
  /** El pie de la diferencia del arqueo: cuadró gris, sobran verde, faltan rojo. */
  tono?: TonoDiferencia;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-2.5 py-2">
      <dt className="text-[10px] font-bold uppercase leading-tight tracking-wide text-texto-3">
        {corta ? (
          <>
            <span className="sm:hidden">{corta}</span>
            <span className="hidden sm:inline">{etiqueta}</span>
          </>
        ) : (
          etiqueta
        )}
      </dt>
      <dd className="break-words text-[14px] font-bold leading-tight tabular-nums text-texto">{valor}</dd>
      {pie && <dd className={`break-words text-[11px] leading-tight ${tono ? `font-semibold ${COLOR_DIFERENCIA[tono]}` : "text-texto-3"}`}>{pie}</dd>}
    </div>
  );
}

// ── La actividad ────────────────────────────────────────────────────────────

const TONO_ICONO: Record<TonoActividad, string> = {
  normal: "bg-slate-100 text-slate-600",
  ambar: "bg-amber-100 text-amber-700",
  rosa: "bg-rose-100 text-rose-700",
  verde: "bg-primary-50 text-primary-700",
  azul: "bg-blue-100 text-blue-700",
};

function IconoDeActividad({ codigo }: { codigo: string }) {
  return (
    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONO_ICONO[tonoDeActividad(codigo)]}`}>
      <Icon name={iconoDeActividad(codigo)} size={15} />
    </span>
  );
}

/** Un renglón de la actividad. Si es de una venta que está en la lista (`onVer`), se toca y la abre en el bloque de Ventas. */
function RenglonActividad({ a, ahora, onVer }: { a: Actividad; ahora: number; onVer?: () => void }) {
  const cuerpo = (
    <>
      <IconoDeActividad codigo={a.codigo} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-texto">
          <b className="font-bold">{a.quien || "Alguien"}</b> · {a.texto}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-texto-3">
          <span className="tabular-nums">{cuando(a.hora, ahora)}</span>
          {a.lugar && <span className="rounded bg-slate-100 px-1.5 py-px font-semibold text-texto-2">{a.lugar}</span>}
          {a.autorizo && <span>Autorizó {a.autorizo}</span>}
          {a.motivo && <span className="min-w-0 break-words">«{a.motivo}»</span>}
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
          aria-label={`Ver la venta: ${a.quien} · ${a.texto}`}
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
