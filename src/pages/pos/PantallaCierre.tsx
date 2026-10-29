import { useState } from "react";
import CorteDeCaja from "../../components/CorteDeCaja";
import InputMonto from "../../components/InputMonto";
import { esCero, esPositivo } from "../../lib/dinero";
import { leerMonto, montoParaEditar } from "../../lib/montoTecleado";
import { Icon } from "../../components/Icon";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Modal,
} from "../../components/ui";
import { api, type ApiError } from "../../lib/api";
import { fmtHora, fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { porSubir, useColaOffline } from "../../lib/offline/cola";
import AvisoSinSubir from "../../components/offline/AvisoSinSubir";
import { useAuth } from "../../store/AuthContext";
import { esBelleza, esBillar } from "../../lib/rubro";
import { cuandoCita } from "../../lib/agenda/horaAgenda";
import type {
  Caja,
  CitaParaRevisar,
  MotivoRevisarCita,
  RegistroDeCena,
  ReporteCierreProductos,
  ResumenCaja,
} from "../../types";
import { bsResta } from "../reportes/formato";
import DialogoMovimiento from "./DialogoMovimiento";
import { efectivoDelCierre, type FilaEfectivoCierre } from "./efectivoDelCierre";
import ListaProductosVendidos from "./ListaProductosVendidos";
import { textoProductos, textoUnidades } from "./productosVendidos";
import { turnoDeCaja } from "./turnoDeCaja";

/**
 * La fila del billar en el arqueo, con el signo en el valor. El número es un
 * neto: lo que entró a este cajón de mesas que no son venta de esta caja,
 * menos lo que otra caja cobró de ventas de ésta. El rótulo se elegía por el
 * signo ("…cobrados en otra caja" si era negativo), así que con las dos cosas
 * a la vez nombraba mal todo el monto (prueba profunda, 18-oct). Neutro, como
 * en la app.
 */
const ETIQUETA_ADELANTOS_BILLAR = "Adelantos de billar";

export default function PantallaCierre({
  caja,
  onAtras,
  onCerrada,
  onIrAEntregas,
}: {
  caja: Caja;
  onAtras: () => void;
  onCerrada: (cerrada: Caja) => void;
  /** Recibir la plata de los meseros sin salir del cierre a buscarla. */
  onIrAEntregas?: () => void;
}) {
  const { incluye, rubro, puede } = useAuth();
  const resumen = useApi(() => api.resumenCaja(caja.id), [caja.id]);
  const [contado, setContado] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [movimientoAbierto, setMovimientoAbierto] = useState(false);
  const [viendoProductos, setViendoProductos] = useState(false);
  /**
   * Ventas cobradas sin internet que no subieron (app del iPhone): no están
   * en el resumen del servidor, así que el arqueo saldría con un faltante que
   * no existe. Como Android (`CierreCajaViewModel`), no se cierra hasta
   * subirlas. Las rechazadas no traban: ya no van a llegar.
   */
  const sinSubir = porSubir(useColaOffline()).length;

  const r = resumen.datos;
  /**
   * Lo vendido del turno sale del arqueo (que ya lo trae y sólo pide operar la
   * caja) y no de Reportes: así lo ve también quien cobra sin tener Reportes.
   * El billar desde el 25-oct; el restaurante desde el 28-oct (CAJA-1: el
   * cajero no tenía cómo ver qué salió en su turno, y la app se lo muestra).
   * En belleza NO: QA DIA-10 lo escondió a propósito a la recepción.
   */
  const vendidoDelArqueo = esBillar(rubro) || rubro === "RESTAURANTE";
  /**
   * El campo arranca VACÍO, a propósito.
   *
   * Antes se precargaba con el saldo esperado para "acelerar el arqueo de la
   * mayoría de los turnos, donde la caja cuadra" — pero eso sólo se sabe
   * DESPUÉS de contar. El cajero entraba, veía el número ya puesto y el cartel
   * verde "La caja cuadra" sin haber tocado un billete, y el camino de menor
   * esfuerzo con clientes esperando era confirmar. Todo faltante o sobrante
   * real se volvía invisible, que es exactamente lo que el arqueo existe para
   * detectar.
   *
   * Peor: la precarga desactivaba el propio guard de abajo (`conteoHecho`
   * mira que haya un monto escrito, y el precargado ya lo dejaba lleno).
   *
   * El esperado sigue estando a la vista en el resumen de arriba: sirve para
   * que el cajero verifique después de contar, no antes.
   */
  const esperado = r?.saldoEsperado ?? 0;
  // Se lee como se escribe en Bolivia, "2.258,90" (ver `montoTecleado`). El
  // campo de antes pasaba la coma a punto y leía con Number(): "2.258,90"
  // llegaba como "2.258.90", que no es un número, y "1.000" valía Bs 1 (QA de
  // Kevin, 17-oct). Y antes de eso "150,50" daba NaN, que caía a 0 sin avisar:
  // el conteo quedaba en cero con un faltante enorme que nadie había cometido.
  const contadoNum = leerMonto(contado);

  // La diferencia sólo tiene sentido una vez que se contó: mostrarla en 0
  // antes de teclear haría parecer que la caja ya cuadra. Un monto negativo
  // no se puede escribir: el campo no acepta el signo.
  const conteoHecho = contadoNum !== null;
  const diferencia = Math.round(((contadoNum ?? 0) - esperado) * 100) / 100;

  function cambiarContado(texto: string) {
    setContado(texto);
    // El "Contá el efectivo" de un intento anterior seguía a la vista con el
    // monto ya escrito (QA de Kevin, 17-oct) y se leía como que el número no
    // se había tomado.
    setError("");
  }

  // Billar: con una mesa en juego la caja no cierra (decisión de Kevin,
  // 11-oct-2026). El backend lo rechaza igual (MESAS_ABIERTAS); acá se dice
  // antes de contar la plata, y cuáles son. En los demás rubros no viene. Lo
  // mismo con una cuenta abierta del billar (21-oct).
  const mesasBillar = r?.mesasBillarAbiertas ?? [];
  const cuentasBillar = r?.cuentasBillarAbiertas ?? [];
  const billarAbierto = mesasBillar.length + cuentasBillar.length > 0;

  /**
   * Restaurante (CAJA-12, 28-oct): antes de cerrar se confirma con lo contado
   * contra lo esperado, como la app ("¿Cerrar caja definitivamente?"). Cerrar
   * no tiene vuelta atrás: el turno no acepta más ventas y la diferencia queda
   * guardada, así que es el último momento para ver un faltante antes de que
   * sea un dato. Los demás rubros cierran con un toque, como siempre.
   */
  const pideConfirmacion = rubro === "RESTAURANTE";
  const [confirmando, setConfirmando] = useState(false);

  function pedirCierre() {
    // Lo que impide cerrar (ventas sin subir, el conteo vacío) lo dice el
    // mismo `cerrar`, sin preguntar antes nada que igual no se puede hacer.
    if (!pideConfirmacion || sinSubir > 0 || contadoNum === null) return void cerrar();
    setError("");
    setConfirmando(true);
  }

  const textoConfirmacion = `Contaste ${fmtMoney(contadoNum ?? 0)} y el sistema espera ${fmtMoney(esperado)}: ${
    esCero(diferencia)
      ? "la caja cuadra"
      : diferencia > 0
        ? `sobran ${fmtMoney(diferencia)}`
        : `faltan ${fmtMoney(-diferencia)}`
  }. Después de cerrar no se pueden registrar más ventas en este turno.`;

  async function cerrar() {
    setError("");
    if (sinSubir > 0)
      return setError(
        `No se puede cerrar caja: hay ${sinSubir} ${sinSubir === 1 ? "venta" : "ventas"} sin sincronizar. Esperá a que vuelva la conexión.`,
      );
    if (contadoNum === null) return setError("Contá el efectivo que hay en la caja.");
    setEnviando(true);
    try {
      // Se pasa la caja que devuelve el cierre: es la unica fuente con los
      // montos ya calculados por el backend. Releerla despues no sirve —
      // /caja/actual responde null en cuanto la caja queda cerrada.
      const cerrada = await api.cerrarCaja(caja.id, {
        montoCierre: contadoNum,
        ...(nota.trim() ? { notaCierre: nota.trim() } : {}),
        // Billar (25-oct): el administrador puede registrar o anular algo en
        // esta caja desde Supervisión mientras la cajera cuenta. Sin esto se
        // guardaba otra diferencia de la que ella vio (anulaban una cena, ella
        // contaba 165 contra el 165 de su pantalla y quedaba "faltan Bs 20").
        // Con el esperado que se le mostró, el backend frena el cierre si
        // cambió. Los demás rubros cierran como siempre.
        ...(esBillar(rubro) ? { esperadoVisto: esperado } : {}),
      });
      onCerrada(cerrada);
    } catch (err) {
      if ((err as ApiError | null)?.codigo === "ESPERADO_CAMBIO") {
        // Se trae el arqueo nuevo: el esperado y la diferencia de abajo pasan
        // al número de ahora, y el mensaje dice por qué cambió.
        resumen.recargar();
      }
      setError(err instanceof Error ? err.message : "No se pudo cerrar la caja");
    } finally {
      setEnviando(false);
    }
  }

  // En la PC (26-oct): la barra de lado a lado y dos columnas, el arqueo a la
  // izquierda y el conteo a la derecha, con "Cerrar caja" debajo del conteo.
  // En el celular queda igual.
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex items-center gap-2 border-b border-borde bg-white py-3 px-[max(1rem,calc(50%-16rem+1rem))] lg:px-[max(1.5rem,calc(50%-32rem+1.5rem))]">
        <button
          onClick={onAtras}
          aria-label="Volver"
          className="rounded-lg p-1.5 text-texto-2 hover:bg-muted"
        >
          <Icon name="arrowLeft" size={20} />
        </button>
        <div>
          <h1 className="text-[15px] font-bold text-texto">Cierre de caja</h1>
          <p className="text-xs text-texto-3">
            Abierta desde {fmtHora(caja.fechaApertura)}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 px-[max(1rem,calc(50%-16rem+1rem))] lg:px-[max(1.5rem,calc(50%-32rem+1.5rem))] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-6 lg:content-start lg:items-start lg:space-y-0 lg:py-6">
        {resumen.cargando ? (
          <Cargando texto="Calculando el arqueo…" />
        ) : !r ? (
          <ErrorMsg onReintentar={resumen.recargar}>{resumen.error}</ErrorMsg>
        ) : (
          <>
            <div className="space-y-4">
              <AvisoCitas
                porCobrar={r.citasPorCobrar ?? 0}
                revisar={r.citasCobroRevisar ?? 0}
                cuales={r.citasRevisar}
              />
              {billarAbierto && <AvisoMesasBillar mesas={mesasBillar} cuentas={cuentasBillar} />}
              <section className="card p-4">
                <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-texto-4">
                  Movimiento del turno
                </h2>
                {/* Dos bloques (QA VER-01 / DIA-11): lo que se vendió, que NO se
                    suma, y la cuenta del cajón, cuyas filas SÍ suman el
                    esperado. En el formato de abajo iba todo junto: "Ventas
                    (N)" con el QR y el fiado adentro, y un "Cambio entregado"
                    que restaba sin entrar en la cuenta (el monto de cada pago
                    ya viene sin el vuelto), así que las filas no daban el
                    esperado. Ver `enDosBloques` para qué rubro va en cuál. */}
                {enDosBloques(rubro) ? (
                  <>
                    <FilasVendido r={r} />
                    <h3 className="mb-2 mt-4 border-t border-borde pt-3 text-[12px] font-bold uppercase tracking-wide text-texto-4">
                      Efectivo en caja
                    </h3>
                    <FilasDelCajon r={r} rubro={rubro} onIrAEntregas={onIrAEntregas} />
                  </>
                ) : (
                  <dl className="space-y-1.5 text-sm">
                    <Fila etiqueta="Fondo de apertura" valor={r.montoApertura} />
                    <Fila
                      etiqueta={`Ventas (${r.cantidadVentas})`}
                      valor={r.totalVentas}
                    />
                    {r.porFormaPago.map((f) => (
                      <Fila key={f.nombre} etiqueta={f.nombre} valor={f.monto} sangria />
                    ))}
                    {r.cambioEntregado > 0 && (
                      <Fila etiqueta="Cambio entregado" valor={-r.cambioEntregado} />
                    )}
                    {r.ingresos > 0 && <Fila etiqueta="Ingresos de efectivo" valor={r.ingresos} />}
                    {r.egresos > 0 && <Fila etiqueta="Egresos de efectivo" valor={-r.egresos} />}
                    {r.abonosEfectivo > 0 && (
                      <Fila etiqueta="Abonos de créditos (efectivo)" valor={r.abonosEfectivo} />
                    )}
                    {/* La fila que hace cerrar el arqueo cuando el mesero cobra.
                        Esa plata ya está en las ventas en efectivo, pero en el
                        delantal: el backend la resta del esperado. Sin mostrar la
                        resta, el cajero suma a mano, le da otro número y sale a
                        buscar un faltante que no existe. Y se nombra a quién:
                        "faltan Bs 180" manda a recorrer el salón preguntando. */}
                    {esPositivo(r.enPoderDeMeseros ?? 0) && (
                      <div>
                        <Fila etiqueta="En poder de meseros" valor={-(r.enPoderDeMeseros ?? 0)} />
                        <p className="pl-3 text-[12px] text-texto-4">
                          {(r.meserosPendientes ?? [])
                            .map((m) => `${m.nombre ?? "Mesero"} ${fmtMoney(m.monto)}`)
                            .join(" · ")}
                          {onIrAEntregas && (
                            <>
                              {" · "}
                              <button
                                type="button"
                                onClick={onIrAEntregas}
                                className="font-semibold text-primary-700 underline"
                              >
                                Recibir
                              </button>
                            </>
                          )}
                        </p>
                      </div>
                    )}
                    {/* Billar: el efectivo que se cobró a mesas que siguen
                        abiertas (adelanto, tiempo fijo) está en el cajón pero
                        todavía no es una venta, y el backend lo suma al
                        esperado. Si la mesa la cobró otra caja, es al revés: la
                        venta está acá y el billete en el otro cajón. Sin la fila
                        el esperado no sale de sumar las de arriba. */}
                    {(r.adelantosBillar ?? 0) !== 0 && (
                      <Fila etiqueta={ETIQUETA_ADELANTOS_BILLAR} valor={r.adelantosBillar ?? 0} />
                    )}
                    {/* Un abono cobrado por QR entró al negocio pero NO al cajón:
                        sin esta fila el cajero veía el total de cobros del turno
                        sin poder explicar por qué el efectivo no llegaba. */}
                    {r.abonosPorFormaPago
                      ?.filter(
                        (f) => f.monto > 0 && !f.nombre.toLowerCase().includes("efectivo"),
                      )
                      .map((f) => (
                        <Fila
                          key={f.nombre}
                          etiqueta={`Abonos por ${f.nombre} (no es efectivo)`}
                          valor={f.monto}
                          apagado
                        />
                      ))}
                    {r.creditoOtorgado > 0 && (
                      <Fila
                        etiqueta="Fiado otorgado (no es efectivo)"
                        valor={r.creditoOtorgado}
                        apagado
                      />
                    )}
                    {r.anuladas > 0 && (
                      <div className="flex justify-between pt-1 text-texto-3">
                        <dt>Ventas anuladas</dt>
                        <dd>{r.anuladas}</dd>
                      </div>
                    )}
                  </dl>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-borde pt-3">
                  <span className="text-[13px] font-bold text-texto">
                    Efectivo esperado en caja
                  </span>
                  <span className="text-lg font-extrabold text-texto">
                    {fmtMoney(esperado)}
                  </span>
                </div>
              </section>

              {/* La capacidad ya exige ADMIN o SUPERVISOR: el backend lo pide
                  con RolesGuard y no tiene sentido ofrecerle al cajero un botón
                  que le va a dar 403. */}
              {incluye("movimientos_caja") && (
                <Boton
                  variante="ghost"
                  icono="swap"
                  onClick={() => setMovimientoAbierto(true)}
                  className="w-full"
                >
                  Registrar movimiento de efectivo
                </Boton>
              )}
            </div>

            <section className="card p-4 lg:sticky lg:top-0">
              <Campo
                label="Efectivo contado"
                hint="Contá los billetes y monedas que hay en la caja"
              >
                {/* Lo vendido sale de Reportes (encargado o dueño): a quien no
                    lo puede ver (recepción) el botón le daba "no tenés
                    permiso" y "no se vendió nada" a la vez (QA DIA-10). En el
                    billar y en el restaurante lo ve también quien cobra: sale
                    del arqueo, que ya lo trae y sólo pide operar la caja (QA
                    de Kevin, 25-oct; el restaurante, 28-oct: era el pedido de
                    Omar del 1-sep y la app lo muestra sin mirar permisos). */}
                {(puede("reportes") || (vendidoDelArqueo && r.productos != null)) && (
                  <button
                    type="button"
                    onClick={() => setViendoProductos(true)}
                    className="mb-2 flex w-full items-center gap-2 rounded-xl border border-borde px-3.5 py-2.5 text-left text-[13px] font-semibold text-texto-2 hover:bg-muted"
                  >
                    <Icon name="box" size={17} />
                    {/* "Mostrador" es palabra de restaurante: en un salón se
                        venden servicios (QA B-21). */}
                    <span className="min-w-0 flex-1">
                      {esBelleza(rubro) || esBillar(rubro) ? "Ver lo vendido" : "Ver qué salió del mostrador"}
                      {/* Cuánto, antes de abrirlo, como la app ("Productos
                          vendidos · 12 productos · 40 unidades"). */}
                      {rubro === "RESTAURANTE" && r.productos && r.productos.lineas > 0 && (
                        <span className="block text-[12px] font-normal text-texto-3">
                          {textoProductos(r.productos.lineas)} · {textoUnidades(r.productos.unidades)}
                        </span>
                      )}
                    </span>
                    <Icon name="chevronRight" size={16} />
                  </button>
                )}

                <div className="mb-2">
                  {/* Con lo que dice el campo: si el cajero corrige el monto a
                      mano, el conteo se descarta (ver `CorteDeCaja`). */}
                  <CorteDeCaja
                    titulo="Contar billete por billete"
                    monto={contadoNum}
                    onTotal={(t) => cambiarContado(t > 0 ? montoParaEditar(t) : "")}
                  />
                </div>
                <InputMonto
                  value={contado}
                  onChange={cambiarContado}
                  placeholder="0,00"
                  className="text-lg font-bold"
                />
              </Campo>

              {conteoHecho && (
                <div
                  className={`mt-3 rounded-xl px-4 py-3 text-center ${
                    diferencia === 0
                      ? "bg-primary-50 text-primary-700"
                      : diferencia > 0
                        ? "bg-info-bg text-info-text"
                        : "bg-danger-bg text-danger-text"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    {diferencia === 0
                      ? "La caja cuadra"
                      : diferencia > 0
                        ? "Sobrante"
                        : "Faltante"}
                  </p>
                  <p className="text-2xl font-extrabold">
                    {fmtMoney(Math.abs(diferencia))}
                  </p>
                </div>
              )}

              <div className="mt-3">
                <Campo label="Nota del cierre (opcional)">
                  <Input
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Ej. faltó cambio de Bs 2"
                  />
                </Campo>
              </div>

              <AvisoSinSubir />
              <ErrorMsg>{error}</ErrorMsg>
            </section>
          </>
        )}
      </div>

      <div className="border-t border-borde bg-white py-4 px-[max(1rem,calc(50%-16rem+1rem))] lg:px-[max(1.5rem,calc(50%-32rem+1.5rem))] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-6">
        <Boton
          onClick={pedirCierre}
          disabled={enviando || resumen.cargando || billarAbierto || sinSubir > 0}
          className="w-full py-3 text-base lg:col-start-2"
        >
          {enviando
            ? "Cerrando…"
            : billarAbierto
              ? `Cobrá las ${!cuentasBillar.length ? "mesas" : !mesasBillar.length ? "cuentas" : "mesas y cuentas"} abiertas para cerrar`
              : sinSubir > 0
                ? "Subí las ventas sin internet para cerrar"
                : "Cerrar caja"}
        </Boton>
      </div>

      {viendoProductos && (
        <ProductosDelTurno
          cajaId={caja.id}
          productos={vendidoDelArqueo ? r?.productos : undefined}
          onClose={() => setViendoProductos(false)}
        />
      )}

      <Confirmar
        abierto={confirmando}
        titulo="¿Cerrar la caja?"
        texto={textoConfirmacion}
        etiquetaOk="Sí, cerrar caja"
        peligroso
        procesando={enviando}
        onCancel={() => setConfirmando(false)}
        onOk={async () => {
          // Abierto mientras viaja: el botón queda en "Un momento…" y no
          // admite un segundo toque. Si falla, se cierra y el error queda
          // a la vista debajo del conteo.
          await cerrar();
          setConfirmando(false);
        }}
      />

      {movimientoAbierto && (
        <DialogoMovimiento
          cajaId={caja.id}
          onClose={() => setMovimientoAbierto(false)}
          onGuardado={() => {
            setMovimientoAbierto(false);
            // El movimiento cambia el efectivo esperado: hay que recalcular.
            resumen.recargar();
          }}
        />
      )}
    </div>
  );
}

/**
 * La cena del personal en el arqueo del billar: lo que salió del cajón para la
 * cena de la cajera, con quién lo registró. En violeta, como en Supervisión,
 * para que se vea de dónde sale la diferencia con el efectivo de antes.
 */
function FilaCena({ neta, registros }: { neta: number; registros: RegistroDeCena[] }) {
  const vivas = registros.filter((x) => !x.anulada);
  const ultima = vivas[vivas.length - 1];
  const quien = ultima?.quien ? `${ultima.quien} · ${fmtHora(ultima.fecha)}` : "";
  const detalle =
    vivas.length > 1
      ? `${vivas.length} registros · el último, ${quien}`
      : quien
        ? `Lo registró ${quien}`
        : "";
  return (
    <div className="-mx-1 rounded-xl bg-violet-50 px-3 py-2 text-violet-800">
      <div className="flex items-center justify-between gap-2 font-bold">
        <dt className="flex items-center gap-2">
          <Icon name="cubiertos" size={15} />
          Cena
        </dt>
        <dd>{bsResta(neta)}</dd>
      </div>
      {detalle && <p className="ml-[23px] text-[12px] text-violet-700">{detalle}</p>}
    </div>
  );
}

/**
 * Un movimiento que el administrador registró con motivo en la caja de la
 * cajera (billar, 25-oct): qué fue, quién y a qué hora. Gris y no violeta: el
 * violeta es de la cena, que tiene su reporte.
 */
function FilaConMotivo({ f }: { f: FilaEfectivoCierre }) {
  return (
    <div className="-mx-1 rounded-xl bg-slate-50 px-3 py-2 text-texto-2">
      {/* Sin cortar con "…": en el celular "Pago a proveedor · Distribui…"
          escondía justo a quién se le pagó. */}
      <div className="flex items-start justify-between gap-2 font-semibold">
        <dt className="flex min-w-0 items-start gap-2">
          <Icon name="swap" size={15} className="mt-[3px] shrink-0" />
          <span className="min-w-0 break-words">{f.etiqueta}</span>
        </dt>
        <dd className="shrink-0">{f.valor < 0 ? bsResta(-f.valor) : fmtMoney(f.valor)}</dd>
      </div>
      {f.quien && (
        <p className="ml-[23px] text-[12px] text-texto-3">
          Lo registró {f.quien} · {fmtHora(f.fecha)}
        </p>
      )}
    </div>
  );
}

function Fila({
  etiqueta,
  valor,
  sangria,
  apagado,
}: {
  etiqueta: string;
  valor: number;
  sangria?: boolean;
  apagado?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${sangria ? "pl-3" : ""} ${
        apagado ? "text-texto-4" : "text-texto-2"
      }`}
    >
      <dt className={sangria ? "text-[13px]" : ""}>{etiqueta}</dt>
      <dd className={sangria ? "text-[13px]" : ""}>{fmtMoney(valor)}</dd>
    </div>
  );
}

/**
 * ¿El cierre va en dos bloques (lo vendido aparte, y la cuenta del cajón)?
 *
 * - Belleza (QA VER-01 / DIA-11): las propinas y el cambio confundían el arqueo.
 * - Billar, por ser rubro nuevo y sin clientes: con el formato de siempre, su
 *   QA del 12-oct sumó "Fondo 100 + Efectivo 40 − Cambio 30 + Adelantos 20 =
 *   130" contra un esperado de 160.
 * - Restaurante (CAJA-6, 28-oct): el mismo error. Fondo 100, una venta de 50
 *   en efectivo pagada con 100 y otra de 30 por QR se leía "100 + 80 − 50 =
 *   130" contra un esperado de 150, que era el correcto. Hasta acá quedaba con
 *   el formato de siempre "para Omar", pero Omar no usa la web (sólo la app),
 *   y la app ya muestra sólo las filas que suman el esperado.
 *
 * Farmacia, el instituto y los demás rubros siguen con el formato de siempre:
 * nadie revisó todavía su cierre con este criterio.
 */
function enDosBloques(rubro: string | undefined): boolean {
  return esBelleza(rubro) || esBillar(rubro) || rubro === "RESTAURANTE";
}

/**
 * Lo que se vendió en el turno, por forma de pago, y lo que entró o salió
 * fiado o por QR sin pasar por el cajón. Informativo: estas filas NO suman el
 * esperado. La usan el cierre y su comprobante (`CierreOk`), así el papel dice
 * lo mismo que la pantalla con la que se contó.
 */
function FilasVendido({ r }: { r: ResumenCaja }) {
  const propinasOtras = r.propinasOtras ?? 0;
  return (
    <dl className="space-y-1.5 text-sm">
      <Fila
        etiqueta={`Ventas (${r.cantidadVentas})`}
        valor={r.totalVentas}
      />
      {r.porFormaPago.map((f) => (
        <Fila key={f.nombre} etiqueta={f.nombre} valor={f.monto} sangria />
      ))}
      {/* Un abono cobrado por QR entró al negocio pero NO al cajón:
          sin esta fila el cajero veía el total de cobros del turno
          sin poder explicar por qué el efectivo no llegaba. */}
      {r.abonosPorFormaPago
        ?.filter(
          (f) => f.monto > 0 && !f.nombre.toLowerCase().includes("efectivo"),
        )
        .map((f) => (
          <Fila
            key={f.nombre}
            etiqueta={`Abonos por ${f.nombre} (no es efectivo)`}
            valor={f.monto}
            apagado
          />
        ))}
      {r.creditoOtorgado > 0 && (
        <Fila
          etiqueta="Fiado otorgado (no es efectivo)"
          valor={r.creditoOtorgado}
          apagado
        />
      )}
      {propinasOtras > 0 && (
        <Fila
          etiqueta="Propinas por QR (no pasan por la caja)"
          valor={propinasOtras}
          apagado
        />
      )}
      {r.anuladas > 0 && (
        <div className="flex justify-between pt-1 text-texto-3">
          <dt>Ventas anuladas</dt>
          <dd>{r.anuladas}</dd>
        </div>
      )}
    </dl>
  );
}

/**
 * La cuenta del cajón: cada fila suma o resta, y juntas dan el efectivo
 * esperado (la misma fórmula del backend: apertura + ventas en efectivo +
 * abonos en efectivo + ingresos − egresos − lo de los meseros ± billar). El
 * cierre y su comprobante dibujan estas mismas filas.
 *
 * `onIrAEntregas`: el atajo "Recibir" de la plata de los meseros, sólo en el
 * cierre (en el comprobante ya no hay nada que recibir).
 */
function FilasDelCajon({
  r,
  rubro,
  onIrAEntregas,
}: {
  r: ResumenCaja;
  rubro: string | undefined;
  onIrAEntregas?: () => void;
}) {
  // Belleza (QA DIA-11): las propinas están dentro de ingresos/egresos; se
  // muestran aparte y el resto queda como "otros". Sin propinas (Omar), las
  // filas son las de siempre.
  const propinasEfectivo = r.propinasEfectivo ?? 0;
  const propinasSalidas = r.propinasSalidas ?? 0;
  const hayPropinas = propinasEfectivo > 0 || propinasSalidas > 0;
  // Billar: lo que el administrador registró desde Supervisión (la cena desde
  // el 24-oct; un gasto, un retiro, el sencillo… desde el 25-oct). Ya está
  // dentro de `ingresos`/`egresos`, como las propinas: cada uno sale en su
  // renglón con quién lo registró, y "otros" queda para lo que no tiene
  // motivo. Fuera del billar no hay ninguno y las cuentas son las de siempre.
  const { cenaNeta, otrosIngresos, otrosEgresos, filas: conMotivo } = efectivoDelCierre(r);
  return (
    <dl className="space-y-1.5 text-sm">
      <Fila etiqueta="Fondo de apertura" valor={r.montoApertura} />
      <div>
        <Fila etiqueta="Ventas en efectivo" valor={r.efectivo} />
        {/* El cambio ya está descontado de las ventas: se cuenta
            cómo se llegó, sin restarlo otra vez. */}
        {/* En el billar no: la cajera cuenta el cajón, y "recibido 200 · cambio
            70" sólo la hacía dudar de por qué las ventas en efectivo (130) son
            menos que los billetes que tocó (QA de Kevin, 25-oct). */}
        {r.cambioEntregado > 0 && !esBillar(rubro) && (
          <p className="pl-3 text-[12px] text-texto-4">
            Recibido {fmtMoney(r.efectivo + r.cambioEntregado)} · cambio entregado{" "}
            {fmtMoney(r.cambioEntregado)}
          </p>
        )}
      </div>
      {r.abonosEfectivo > 0 && (
        <Fila etiqueta="Abonos de créditos (efectivo)" valor={r.abonosEfectivo} />
      )}
      {/* Billar: el efectivo que se cobró a mesas que siguen abiertas
          (adelanto, tiempo fijo) está en el cajón pero todavía no es una
          venta, y el backend lo suma al esperado. Si la mesa la cobró otra
          caja, es al revés: la venta está acá y el billete en el otro cajón. */}
      {(r.adelantosBillar ?? 0) !== 0 && (
        <Fila etiqueta={ETIQUETA_ADELANTOS_BILLAR} valor={r.adelantosBillar ?? 0} />
      )}
      {/* La plata de las profesionales, en su fila: está en el cajón
          pero no es del negocio. */}
      {propinasEfectivo > 0 && (
        <Fila etiqueta="Propinas en efectivo" valor={propinasEfectivo} />
      )}
      {propinasSalidas > 0 && (
        <Fila etiqueta="Propinas entregadas" valor={-propinasSalidas} />
      )}
      {otrosIngresos > 0 && (
        <Fila
          etiqueta={hayPropinas ? "Otros ingresos de efectivo" : "Ingresos de efectivo"}
          valor={otrosIngresos}
        />
      )}
      {otrosEgresos > 0 && (
        <Fila
          etiqueta={hayPropinas ? "Otros egresos de efectivo" : "Egresos de efectivo"}
          valor={-otrosEgresos}
        />
      )}
      {cenaNeta > 0 && <FilaCena neta={cenaNeta} registros={r.cenasRegistros ?? []} />}
      {conMotivo.map((f) => (
        <FilaConMotivo key={f.id} f={f} />
      ))}
      {/* La fila que hace cerrar el arqueo cuando el mesero cobra.
          Esa plata ya está en las ventas en efectivo, pero en el
          delantal: el backend la resta del esperado. Sin mostrar la
          resta, el cajero suma a mano, le da otro número y sale a
          buscar un faltante que no existe. Y se nombra a quién:
          "faltan Bs 180" manda a recorrer el salón preguntando. */}
      {esPositivo(r.enPoderDeMeseros ?? 0) && (
        <div>
          <Fila etiqueta="En poder de meseros" valor={-(r.enPoderDeMeseros ?? 0)} />
          <p className="pl-3 text-[12px] text-texto-4">
            {(r.meserosPendientes ?? [])
              .map((m) => `${m.nombre ?? "Mesero"} ${fmtMoney(m.monto)}`)
              .join(" · ")}
            {onIrAEntregas && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={onIrAEntregas}
                  className="font-semibold text-primary-700 underline"
                >
                  Recibir
                </button>
              </>
            )}
          </p>
        </div>
      )}
    </dl>
  );
}

/**
 * Belleza (PLAN-AGENDA-BELLEZA §9.1): "hay 2 citas finalizadas sin cobrar".
 * No frena el cierre —puede ser una cortesía que nadie cerró—, pero se ve
 * antes de contar la plata. Un negocio sin agenda recibe ceros y no ve nada.
 */
/** El motivo de revisar un cobro de cita, en palabras de la cajera. */
const MOTIVO_REVISAR: Record<MotivoRevisarCita, string> = {
  YA_COBRADA: "cobrada dos veces",
  CITA_CERRADA: "cobrada estando cerrada",
  COBRO_INCOMPLETO: "cobrada por menos de lo agendado",
};

/**
 * Las mesas de billar que siguen en juego en el local: la caja no cierra con
 * ellas (decisión de Kevin, 11-oct-2026). Se cobran o se anulan desde el
 * billar, y recién ahí se cierra.
 */
function AvisoMesasBillar({
  mesas,
  cuentas,
}: {
  mesas: { numero: number; alias: string | null }[];
  /** Las cuentas abiertas del billar (sin mesa, 21-oct). */
  cuentas: { nombre: string }[];
}) {
  const nombres = [
    ...mesas.map((m) => (m.alias ? `Mesa ${m.numero} (${m.alias})` : `Mesa ${m.numero}`)),
    ...cuentas.map((c) => `cuenta «${c.nombre}»`),
  ];
  const titulo = !cuentas.length
    ? // "Abierta" y no "en juego": una pausada también frena el cierre, y el
      // tablero la cuenta en "Pausadas" (prueba profunda, 18-oct).
      mesas.length === 1
      ? "Hay 1 mesa de billar abierta"
      : `Hay ${mesas.length} mesas de billar abiertas`
    : !mesas.length
      ? cuentas.length === 1
        ? "Hay 1 cuenta abierta en el billar"
        : `Hay ${cuentas.length} cuentas abiertas en el billar`
      : "Hay mesas y cuentas abiertas en el billar";
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
      <span className="mt-px shrink-0">
        <Icon name="alert" size={17} />
      </span>
      <p>
        <b>{titulo}</b>: {nombres.join(", ")}.{" "}
        {cuentas.length
          ? "La caja no se cierra con mesas ni cuentas abiertas: cobralas (o anulá la que se abrió por error) desde el billar."
          : "La caja no se cierra con mesas abiertas: cobralas (o anulá la que se abrió por error) desde el billar."}
      </p>
    </div>
  );
}

function AvisoCitas({
  porCobrar,
  revisar,
  cuales,
}: {
  porCobrar: number;
  revisar: number;
  /** Cuáles y por qué (QA B-28); sin esto, sólo el conteo de siempre. */
  cuales?: CitaParaRevisar[];
}) {
  if (porCobrar <= 0 && revisar <= 0) return null;
  const lista = cuales?.length ? cuales : null;
  return (
    <section role="alert" className="space-y-1 rounded-2xl border border-warning/40 bg-warning-bg p-4 text-warning-text">
      {porCobrar > 0 && (
        <p className="text-sm font-bold">
          {porCobrar === 1 ? "Hay 1 cita finalizada sin cobrar" : `Hay ${porCobrar} citas finalizadas sin cobrar`}
        </p>
      )}
      {lista ? (
        <>
          <p className="text-sm font-bold">
            {lista.length === 1 ? "1 cobro de cita para revisar:" : `${lista.length} cobros de citas para revisar:`}
          </p>
          <ul className="space-y-0.5 text-[13px]">
            {lista.map((c) => (
              <li key={`${c.id}-${c.motivo}`}>
                <span className="font-semibold">{c.cliente}</span> ({c.codigo}) ·{" "}
                {c.inicio ? `${cuandoCita(c.inicio)} · ` : ""}
                {MOTIVO_REVISAR[c.motivo as MotivoRevisarCita] ?? "para revisar"}
              </li>
            ))}
          </ul>
        </>
      ) : (
        revisar > 0 && (
          <p className="text-sm font-bold">
            {revisar === 1
              ? "1 cita se cobró de más (ya estaba cobrada o cerrada): revisala"
              : `${revisar} citas se cobraron de más (ya estaban cobradas o cerradas): revisalas`}
          </p>
        )
      )}
      <p className="text-[13px]">
        Cobralas desde «Citas por cobrar» del punto de venta, o cerralas sin cargo en la agenda. Un cobro de más se
        corrige anulando esa venta; uno de menos, revisando con quien la cobró.
      </p>
    </section>
  );
}

/**
 * El comprobante del arqueo, al cerrar. Lo comparten el POS y el billar.
 *
 * Restaurante y billar (CAJA-4, 28-oct): el comprobante completo, como el de
 * la app. Decía sólo "Turno de 12:04 a 03:17" (sin fecha: se leía al revés),
 * el fondo, lo contado y la diferencia; el cajero no tiene Reportes, así que
 * no tenía dónde ver con qué esperado se comparó lo que contó ni cuánto entró
 * por cada forma de pago. Ahora lleva el turno fechado en las dos puntas (con
 * el aviso si cruzó la medianoche), lo vendido por forma de pago y las filas
 * del cajón que suman el esperado: las mismas de la pantalla del cierre, del
 * arqueo con el que el backend fijó la diferencia (`caja.resumen`). Las
 * fechas son las de la caja que devolvió el servidor.
 *
 * En el billar sólo SUMA: lo que ya mostraba (el fondo, lo contado, la
 * diferencia y la nota) sigue igual. Los demás rubros ven el de siempre.
 */
export function CierreOk({ caja, onSalir }: { caja: Caja; onSalir: () => void }) {
  const { rubro, usuario } = useAuth();
  if (rubro === "RESTAURANTE" || esBillar(rubro)) {
    return (
      <ComprobanteCompleto
        caja={caja}
        rubro={rubro}
        cajero={usuario?.nombre?.trim() || usuario?.username}
        onSalir={onSalir}
      />
    );
  }
  return <ComprobanteSimple caja={caja} onSalir={onSalir} />;
}

/** "Cuadra" en verde, "Sobrante" en azul y "Faltante" en rojo, como el cierre y Reportes. */
function BadgeDiferencia({ diferencia }: { diferencia: number }) {
  return (
    <Badge tono={esCero(diferencia) ? "verde" : diferencia > 0 ? "azul" : "rojo"}>
      {esCero(diferencia)
        ? "Cuadra"
        : `${diferencia > 0 ? "Sobrante" : "Faltante"} ${fmtMoney(Math.abs(diferencia))}`}
    </Badge>
  );
}

function ComprobanteCompleto({
  caja,
  rubro,
  cajero,
  onSalir,
}: {
  caja: Caja;
  rubro: string | undefined;
  cajero: string | undefined;
  onSalir: () => void;
}) {
  const diferencia = caja.montoDiferencia ?? 0;
  const turno = turnoDeCaja(caja.fechaApertura, caja.fechaCierre);
  // Un backend anterior no manda el arqueo con el cierre: queda lo de siempre
  // (el fondo, lo contado y la diferencia) con el turno fechado.
  const r = caja.resumen;
  const titulo = "mb-2 text-[12px] font-bold uppercase tracking-wide text-texto-4";
  return (
    <div className="flex min-h-full items-center justify-center p-5">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <Icon name="check" size={32} strokeWidth={2.5} />
        </span>
        <h1 className="mt-4 text-xl font-bold text-texto">Caja cerrada</h1>
        <p className="mt-1 text-[13px] text-texto-3">
          {turno ? turno.resumen : `Turno de ${fmtHora(caja.fechaApertura)} a ${fmtHora(caja.fechaCierre)}`}
        </p>
        {turno?.avisoDias && (
          <p
            role="note"
            className="mt-3 rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] font-semibold text-warning-text"
          >
            {turno.avisoDias}
          </p>
        )}

        <div className="card mt-5 space-y-4 p-4 text-left text-sm">
          {turno && (
            <section aria-label="Turno">
              <h2 className={titulo}>Turno</h2>
              <dl className="space-y-1.5">
                <Dato etiqueta="Abrió" valor={turno.abrio} />
                <Dato etiqueta="Cerró" valor={turno.cerro} />
                <Dato etiqueta="Duración" valor={turno.duracion} />
                {cajero && <Dato etiqueta="Cajero" valor={cajero} />}
              </dl>
            </section>
          )}

          {r && (
            <section aria-label="Ventas del turno" className="border-t border-borde pt-3">
              <h2 className={titulo}>Ventas del turno</h2>
              <FilasVendido r={r} />
            </section>
          )}

          <section aria-label="Efectivo en caja" className={turno || r ? "border-t border-borde pt-3" : ""}>
            {r && (
              <>
                <h2 className={titulo}>Efectivo en caja</h2>
                <FilasDelCajon r={r} rubro={rubro} />
              </>
            )}
            <dl className={`space-y-2 ${r ? "mt-2 border-t border-borde pt-2" : ""}`}>
              {r ? (
                <div className="flex justify-between font-bold text-texto">
                  <dt>Efectivo esperado en caja</dt>
                  <dd>{fmtMoney(r.saldoEsperado)}</dd>
                </div>
              ) : (
                <div className="flex justify-between text-texto-2">
                  <dt>Fondo de apertura</dt>
                  <dd>{fmtMoney(caja.montoApertura)}</dd>
                </div>
              )}
              <div className="flex justify-between font-bold text-texto">
                <dt>Efectivo contado</dt>
                <dd>{fmtMoney(caja.montoCierre ?? 0)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-borde pt-2">
                <dt className="text-texto-2">Diferencia</dt>
                <dd>
                  <BadgeDiferencia diferencia={diferencia} />
                </dd>
              </div>
            </dl>
          </section>

          {caja.notaCierre && (
            <p className="border-t border-borde pt-2 text-[13px] italic text-texto-3">
              {caja.notaCierre}
            </p>
          )}
        </div>

        <Boton onClick={onSalir} className="mt-5 w-full">
          Volver
        </Boton>
      </div>
    </div>
  );
}

/** Un dato del turno: la etiqueta a la izquierda y el valor a la derecha. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 text-texto-2">
      <dt>{etiqueta}</dt>
      <dd className="text-right font-semibold text-texto">{valor}</dd>
    </div>
  );
}

/** El comprobante de siempre: el fondo, lo contado, la diferencia y la nota. */
function ComprobanteSimple({ caja, onSalir }: { caja: Caja; onSalir: () => void }) {
  const diferencia = caja.montoDiferencia ?? 0;
  return (
    <div className="flex min-h-full items-center justify-center p-5">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <Icon name="check" size={32} strokeWidth={2.5} />
        </span>
        <h1 className="mt-4 text-xl font-bold text-texto">Caja cerrada</h1>
        <p className="mt-1 text-[13px] text-texto-3">
          Turno de {fmtHora(caja.fechaApertura)} a {fmtHora(caja.fechaCierre)}
        </p>

        <dl className="card mt-5 space-y-2 p-4 text-left text-sm">
          <div className="flex justify-between text-texto-2">
            <dt>Fondo de apertura</dt>
            <dd>{fmtMoney(caja.montoApertura)}</dd>
          </div>
          <div className="flex justify-between font-bold text-texto">
            <dt>Efectivo contado</dt>
            <dd>{fmtMoney(caja.montoCierre ?? 0)}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-borde pt-2">
            <dt className="text-texto-2">Diferencia</dt>
            <dd>
              <Badge tono={diferencia === 0 ? "verde" : diferencia > 0 ? "azul" : "rojo"}>
                {diferencia === 0
                  ? "Cuadra"
                  : `${diferencia > 0 ? "Sobrante" : "Faltante"} ${fmtMoney(Math.abs(diferencia))}`}
              </Badge>
            </dd>
          </div>
          {caja.notaCierre && (
            <p className="border-t border-borde pt-2 text-[13px] italic text-texto-3">
              {caja.notaCierre}
            </p>
          )}
        </dl>

        <Boton onClick={onSalir} className="mt-5 w-full">
          Volver
        </Boton>
      </div>
    </div>
  );
}

/**
 * Lo que salió del mostrador en el turno, agrupado por categoría.
 *
 * El arqueo dice cuánta plata entró; esto dice qué se vendió para que entrara.
 * Va acá y no en Reportes a propósito: el cajero que cierra su turno tiene que
 * poder verlo sin el módulo de reportes, que se vende aparte.
 *
 * Ya viene agrupado y ordenado del backend: no se reordena acá.
 */
export function ProductosDelTurno({
  cajaId,
  productos,
  onClose,
}: {
  cajaId: number;
  /**
   * Lo vendido ya cargado (viene con el arqueo, y lo puede ver quien opera la
   * caja aunque no tenga reportes). Sin esto se pide a los reportes.
   */
  productos?: ReporteCierreProductos;
  onClose: () => void;
}) {
  const remoto = useApi(
    () => (productos ? Promise.resolve(null) : api.reporteCierreProductos(cajaId)),
    [cajaId, productos != null],
  );
  const d = productos ?? remoto.datos;
  const cargando = !productos && remoto.cargando;
  const error = productos ? null : remoto.error;

  /** Una fila por producto, con su categoría, para que la planilla se pueda ordenar. */
  function exportar() {
    if (!d) return;
    const filas = d.categorias.flatMap((c) =>
      c.items.map((i) => ({
        Categoria: c.nombre,
        Producto: i.nombre,
        Cantidad: i.cantidad,
        Precio: i.precio,
        Total: i.total,
      })),
    );
    if (filas.length === 0) return;

    const cols = ["Categoria", "Producto", "Cantidad", "Precio", "Total"];
    const esc = (v: unknown) => {
      const t = v === null || v === undefined ? "" : String(v);
      // Coma decimal para que Excel es-BO sume la columna, y apóstrofe si la
      // celda arranca como fórmula (ver bajarCsv en Reportes).
      const num = typeof v === "number" ? String(v).replace(".", ",") : t;
      const seguro =
        num.length > 0 && "=+@-".includes(num[0]) && !/^-?[\d.,]+$/.test(num)
          ? `'${num}`
          : num;
      return `"${seguro.replace(/"/g, '""')}"`;
    };
    const csv = [
      cols.map(esc).join(";"),
      ...filas.map((f) => cols.map((c) => esc(f[c as keyof typeof f])).join(";")),
    ].join("\r\n");

    const url = URL.createObjectURL(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `productos-turno-${cajaId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      abierto
      titulo="Productos vendidos"
      subtitulo={`Turno #${cajaId}`}
      onClose={onClose}
      acciones={
        d && d.lineas > 0 ? (
          <Boton variante="ghost" icono="download" onClick={exportar}>
            Exportar
          </Boton>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <ErrorMsg>{error}</ErrorMsg>
        {/* Con error, sólo el error: "no se vendió nada" sería falso. */}
        {cargando ? (
          <Cargando />
        ) : error ? null : !d || d.lineas === 0 ? (
          <p className="py-6 text-center text-[13px] text-texto-3">
            En este turno todavía no se vendió nada.
          </p>
        ) : (
          <ListaProductosVendidos d={d} />
        )}
      </div>
    </Modal>
  );
}
