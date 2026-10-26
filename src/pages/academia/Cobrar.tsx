import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Boton, Cargando, ErrorMsg, Input, Select, Vacio } from "../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../lib/academia/apiAcademia";
import {
  cuotasIniciales,
  detallesDeCuotas,
  inicialDeLaUrl,
  montoSugerido,
  montoValido,
  pagadorPorDefecto,
  saldoTotal,
  ventaConCuotas,
  type CobroCuotas,
  type InicialCobro,
} from "../../lib/academia/cobroCuotas";
import { fechaCorta, nombreDe } from "../../lib/academia/formato";
import type { AlumnoPorCobrar, CarritoInscripcion, Ref } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { ApiError, api } from "../../lib/api";
import { quedoEnDuda } from "../../lib/cupo";
import { parsearMontoO } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useBloqueoCupo } from "../../lib/useBloqueoCupo";
import { useCoincideMedia } from "../../lib/useCoincideMedia";
import type { PagoInput, Venta } from "../../types";
import AperturaCaja from "../pos/AperturaCaja";
import PantallaCobro from "../pos/PantallaCobro";
import PantallaRecibo from "../pos/PantallaRecibo";
import { huellaDeCobro, useIntentoDeCobro } from "../pos/useIntentoDeCobro";
import {
  Chip,
  claseBotonFila,
  EncabezadoPagina,
  GrillaKpi,
  KpiTarjeta,
  LISTA,
  PaginaAcademia,
  TABLA,
  Tarjeta,
} from "./piezas";

type Fila = Pick<AlumnoPorCobrar, "inscripcionId" | "nombre" | "codigo" | "grupo" | "sede">;

/** "Cobrar a estudiante" cuelga de Cobranza (26-oct): a ella vuelve la pantalla. */
const VOLVER_COBRANZA = { a: "/academia/cobranza", texto: "Cobranza" };

/**
 * El marco de `PaginaAcademia` en escritorio. Va como clases y no como la
 * pieza porque el cobro tiene que ser el MISMO árbol en las dos medidas (ver
 * abajo); sólo se usa con la pantalla ancha (lg), así que no lleva los
 * rellenos del celular.
 */
const PAGINA_ANCHA = "mx-auto w-full max-w-6xl space-y-6 p-8";

/** ¿La sede del grupo es otra que la de la caja? Por id si vino, si no por nombre. */
function esOtraSede(sede: string | Ref | null | undefined, caja: { id: number | null; nombre: string | null } | null): boolean {
  if (!sede || !caja) return false;
  if (typeof sede !== "string" && sede.id) return caja.id != null && sede.id !== caja.id;
  const nombre = nombreDe(sede);
  return !!nombre && !!caja.nombre && nombre.trim().toLowerCase() !== caja.nombre.trim().toLowerCase();
}

/**
 * A1 · Cobrar a estudiante (reunión con Derick, 22-oct), fuera del POS.
 *
 * Una sola pantalla para la recepción: se busca al estudiante, salen sus
 * cuotas pendientes (las vencidas primero) y un monto sugerido que se puede
 * cambiar y se reparte por vencimiento; abajo, el medio de pago del POS
 * (efectivo, QR o mixto: la MISMA `PantallaCobro`) y se confirma una vez.
 *
 * Por dentro es la venta de siempre, con una línea por cuota (`cuotaId`):
 * así la caja, el arqueo, los reportes, la planilla del docente y la
 * anulación siguen igual. Por eso pide la caja abierta (sin ella se ofrece
 * abrirla, como el POS) y usa el mismo `clienteRequestId` del POS para que un
 * reintento no cobre dos veces.
 */
export default function Cobrar() {
  const p = usePalabras();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Se lee al entrar. La dirección queda con el estudiante elegido (QA
  // 23-oct: un F5 lo perdía); lo acordado al inscribir (`monto`) se saca
  // apenas se cobra, para que un F5 no lo vuelva a proponer.
  const [inicial] = useState(() => inicialDeLaUrl(params));
  // `setParams` cambia con cada dirección: por ref, para que `elegir` no
  // cambie al tocar la dirección y no vuelva a disparar la carga inicial.
  const setParamsRef = useRef(setParams);
  setParamsRef.current = setParams;

  const caja = useApi(() => api.cajaActual(), []);
  const formasPago = useApi(() => api.getFormasPago(), []);
  const abierta = caja.datos?.caja ?? null;
  const sedeCaja = abierta ? { id: abierta.almacenId ?? null, nombre: abierta.almacen ?? null } : null;

  const [elegido, setElegido] = useState<{ fila: Fila; carrito: CarritoInscripcion } | null>(null);
  /**
   * Las inscripciones con deuda del mismo estudiante (QA 23-oct): con dos
   * cursos, un selector arriba deja elegir cuál se cobra.
   */
  const [hermanas, setHermanas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);
  const [monto, setMonto] = useState("");
  const [pagadorId, setPagadorId] = useState<number | null>(null);
  const [venta, setVenta] = useState<Venta | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  // La identidad del cobro y el cupo del día: las mismas piezas que usa el
  // POS (ver Pos.tsx), para que un 504 o un corte no terminen en dos ventas.
  const intento = useIntentoDeCobro();
  const enDuda = useRef(false);
  const { verificar, manejarError, registrar } = useBloqueoCupo("VENTA", { refrescarAlMontar: true });
  // En la computadora (desde lg, donde aparece el menú lateral) el detalle va
  // a la izquierda y el cobro fijo a la derecha; en el celular, todo apilado
  // como siempre. Sin `matchMedia` (los tests) responde celular.
  const ancha = useCoincideMedia("(min-width: 1024px)");

  const elegir = useCallback(
    async (fila: Fila, otras?: Fila[]) => {
      setError("");
      setCargando(true);
      try {
        const carrito = await apiAcademia.carrito(fila.inscripcionId);
        // Lo acordado al inscribir vale sólo para la inscripción con la que se entró.
        const acordado = fila.inscripcionId === inicial.inscripcionId ? inicial.monto : undefined;
        setElegido({ fila, carrito });
        if (otras) setHermanas(otras);
        // replaceState: un F5 vuelve a este estudiante sin volver a buscarlo.
        const sede = typeof fila.sede === "string" ? null : fila.sede;
        setParamsRef.current(
          {
            inscripcion: String(fila.inscripcionId),
            ...(acordado != null ? { monto: String(acordado) } : {}),
            ...(sede?.id ? { sede: String(sede.id), sedeNombre: sede.nombre } : {}),
          },
          { replace: true },
        );
        setMonto(String(montoSugerido(carrito, acordado)));
        setPagadorId(pagadorPorDefecto(carrito.pagadores));
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudieron traer sus cuotas");
      } finally {
        setCargando(false);
      }
    },
    [inicial],
  );

  // Con la inscripción en la mano, directo a sus cuotas (una vez).
  useEffect(() => {
    if (inicial.inscripcionId == null) return;
    void elegir({ inscripcionId: inicial.inscripcionId, nombre: "", codigo: null, grupo: "", sede: inicial.sede ?? "" });
  }, [inicial, elegir]);

  const montoNum = Math.round(parsearMontoO(monto, NaN) * 100) / 100;
  const tope = elegido ? saldoTotal(elegido.carrito) : 0;
  const montoOk = montoValido(montoNum, tope);
  const reparto = useMemo(
    () => (elegido ? cuotasIniciales(elegido.carrito, montoOk ? montoNum : undefined) : []),
    [elegido, montoOk, montoNum],
  );

  const sedeGrupo = elegido ? nombreDe(elegido.fila.sede) || null : null;
  const otraSede = elegido ? esOtraSede(elegido.fila.sede, sedeCaja) : false;

  async function confirmar(pagos: PagoInput[]) {
    if (!elegido || !montoOk) return setError("Poné cuánto paga hoy: más que cero y hasta el saldo.");
    const cobro: CobroCuotas = {
      inscripcionId: elegido.fila.inscripcionId,
      alumno: elegido.carrito.alumno,
      pagadores: elegido.carrito.pagadores,
      pagadorId,
      sedeGrupo,
      otraSede,
      lineas: reparto.filter((x) => x.elegida).map((x) => x.linea),
    };
    const detalles = detallesDeCuotas(cobro);
    // En duda (el POST anterior salió y no volvió) se deja ir al servidor: con
    // el mismo id devuelve la venta que ya existía sin consumir otra vez.
    if (!enDuda.current && !verificar()) return;
    setError("");
    setEnviando(true);
    try {
      const creada = await api.crearVenta({
        detalles,
        tipoPedido: "LOCAL",
        pagos,
        // Quien paga (el alumno o su tutor) es el cliente de la venta.
        ...(pagadorId != null ? { clienteId: pagadorId } : {}),
        clienteRequestId: intento.actual(huellaDeCobro(detalles, "LOCAL")),
      });
      intento.registrado();
      enDuda.current = false;
      registrar(creada);
      setVenta(ventaConCuotas(creada, cobro));
      // Lo acordado ya se cobró: un F5 abre el mismo estudiante con lo que debe hoy.
      setParams({ inscripcion: String(elegido.fila.inscripcionId) }, { replace: true });
    } catch (err) {
      enDuda.current = quedoEnDuda(err);
      if (manejarError(err)) return;
      const codigo = err instanceof ApiError ? err.codigo : undefined;
      if (codigo === CODIGOS_ACADEMIA.CUOTA_SALDO || codigo === CODIGOS_ACADEMIA.CUOTA_NO_EXISTE) {
        // Otra caja cobró en el medio: se traen las cuotas con el saldo de hoy.
        await elegir(elegido.fila);
        setError("Las cuotas cambiaron mientras cobrabas (otra caja las cobró). Revisá el monto con el saldo de hoy.");
        return;
      }
      setError(err instanceof Error && err.message ? err.message : "No se pudo registrar el cobro");
    } finally {
      setEnviando(false);
    }
  }

  function otroCobro() {
    setVenta(null);
    setElegido(null);
    setHermanas([]);
    setMonto("");
    setError("");
    setParams({}, { replace: true });
  }

  if (caja.cargando) return <Cargando texto="Buscando tu caja…" />;
  if (caja.error)
    return (
      <div className="p-5">
        <ErrorMsg onReintentar={caja.recargar}>{caja.error}</ErrorMsg>
      </div>
    );

  if (!abierta)
    return (
      <div className="mx-auto w-full max-w-md space-y-2 p-4 pt-6">
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-warning-text/20 bg-warning-bg px-3.5 py-2.5 text-[13px] font-semibold text-warning-text"
        >
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          Para cobrar hace falta la caja abierta: lo que se cobra entra a su arqueo.
        </p>
        <AperturaCaja onAbierta={() => caja.recargar()} sucursalInicial={inicial.sede?.id || null} />
      </div>
    );

  if (venta)
    return (
      <PantallaRecibo
        venta={venta}
        etiquetaNueva={`Cobrar a otro ${p.alumno}`}
        onNuevaVenta={otroCobro}
        onHistorial={() => navigate("/pos?vista=caja")}
      />
    );

  if (cargando) return <Cargando texto="Trayendo sus cuotas…" />;

  if (!elegido)
    return (
      <BuscarEstudiante
        inicial={inicial}
        caja={sedeCaja}
        error={error}
        onElegir={(f, otras) => void elegir(f, otras)}
      />
    );

  const carrito = elegido.carrito;
  const sinCuotas = carrito.lineas.length === 0;
  const subtituloFila = [elegido.fila.codigo, nombreDe(elegido.fila.grupo)].filter(Boolean).join(" · ");
  const restaHoy = montoOk ? Math.round((tope - montoNum) * 100) / 100 : null;

  // Las piezas del detalle van en variables porque se arman distinto según la
  // medida: apiladas dentro del cobro en el celular, en tarjetas a la
  // izquierda en la computadora. Lo que se toca (monto, quién paga, el curso)
  // es lo mismo en las dos.
  const selectorHermanas = hermanas.length > 1 && (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-texto-4">
        Tiene {hermanas.length} cursos con deuda: ¿cuál cobrás?
      </span>
      <Select
        aria-label="Inscripción a cobrar"
        value={elegido.fila.inscripcionId}
        onChange={(e) => {
          const otra = hermanas.find((h) => h.inscripcionId === Number(e.target.value));
          if (otra) void elegir(otra);
        }}
      >
        {hermanas.map((h) => (
          <option key={h.inscripcionId} value={h.inscripcionId}>
            {[nombreDe(h.grupo), nombreDe(h.sede)].filter(Boolean).join(" · ")}
            {"saldo" in h && typeof h.saldo === "number" ? ` · debe ${fmtMoney(h.saldo)}` : ""}
          </option>
        ))}
      </Select>
    </label>
  );

  const avisoOtraSede = otraSede && sedeGrupo && (
    <p role="status" className="flex items-center gap-1.5 text-[13px] font-semibold text-warning-text">
      <Icon name="alert" size={15} />
      Grupo de {sedeGrupo} · se cobra en {abierta.almacen ?? "esta caja"}
    </p>
  );

  const campoMonto = (
    <>
      <label htmlFor="monto-hoy" className="block text-[11px] font-semibold uppercase tracking-wide text-texto-4">
        Paga hoy
      </label>
      <Input
        id="monto-hoy"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={monto}
        onChange={(e) => setMonto(e.target.value)}
        className={`text-lg font-bold ${montoOk || monto === "" ? "" : "border-danger"}`}
      />
      {montoOk ? (
        <p className="text-xs text-texto-3">
          Debe {fmtMoney(tope)} en total
          {montoNum < tope ? ` · quedan ${fmtMoney(Math.round((tope - montoNum) * 100) / 100)} de saldo` : " · queda al día"}
        </p>
      ) : (
        <p className="text-xs text-danger-text">Más que cero y hasta {fmtMoney(tope)}, que es todo lo que debe.</p>
      )}
    </>
  );

  const botonesPagador = (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quién paga">
      {carrito.pagadores.map((x) => (
        <button
          key={x.clienteId}
          type="button"
          role="radio"
          aria-checked={pagadorId === x.clienteId}
          onClick={() => setPagadorId(x.clienteId)}
          className={`inline-flex min-h-11 items-center rounded-full px-4 text-[13px] font-semibold transition-colors sm:min-h-9 ${
            pagadorId === x.clienteId ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
          }`}
        >
          {x.nombre} · {x.rol === "TUTOR" ? "tutor" : p.alumno}
        </button>
      ))}
    </div>
  );

  /** Lo que se cobra hoy de una cuota, o una raya si el monto no llega a ella. */
  const hoyDe = (linea: (typeof reparto)[number]["linea"], elegida: boolean) =>
    montoOk && elegida ? (
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums text-texto">{fmtMoney(linea.monto)}</span>
        {linea.monto < linea.saldo && <span className="block text-[11px] text-texto-3">abono</span>}
      </span>
    ) : (
      <span className="shrink-0 text-xs text-texto-4">—</span>
    );
  const venceDe = (cuotaId: number) => carrito.lineas.find((l) => l.cuotaId === cuotaId)?.vence;

  // Celular: lo de siempre, arriba del total y adentro del área que scrollea
  // del cobro (QA 23-oct lo dejó así y anda).
  const detalleCelular = (
    <div className="space-y-3">
      <div className="card space-y-1 p-4">
        <p className="flex items-center gap-2 text-[15px] font-bold text-texto">
          <Icon name="birrete" size={18} className="shrink-0 text-primary-700" />
          <span className="min-w-0 truncate">{carrito.alumno.nombre}</span>
        </p>
        {subtituloFila && <p className="truncate text-[13px] text-texto-3">{subtituloFila}</p>}
        {selectorHermanas && <div className="pt-2">{selectorHermanas}</div>}
        {avisoOtraSede && <div className="pt-1">{avisoOtraSede}</div>}
      </div>

      {sinCuotas ? (
        <p className="card p-4 text-sm text-texto-3">No tiene cuotas pendientes.</p>
      ) : (
        <>
          <div className="card space-y-2 p-4">{campoMonto}</div>

          <Tarjeta id="t-reparto" titulo="Cómo se reparte" sinRelleno>
            <ul className={LISTA.lista}>
              {reparto.map(({ linea, elegida }) => (
                <li key={linea.cuotaId} className={`flex items-center gap-3 ${LISTA.item}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-texto">{linea.descripcion}</span>
                    <span className={`block text-xs ${linea.vencida ? "font-semibold text-danger-text" : "text-texto-3"}`}>
                      {linea.vencida ? "Vencida" : "Vence"} {fechaCorta(venceDe(linea.cuotaId))} · saldo {fmtMoney(linea.saldo)}
                    </span>
                  </span>
                  {hoyDe(linea, elegida)}
                </li>
              ))}
            </ul>
          </Tarjeta>

          {carrito.pagadores.length > 1 && (
            <div className="card space-y-2.5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Quién paga</p>
              {botonesPagador}
            </div>
          )}
        </>
      )}
    </div>
  );

  // Computadora: el detalle en las tarjetas de academia (las mismas de
  // Cobranza o la ficha), con lo que debe en indicadores y el reparto en tabla.
  const vencidas = carrito.lineas.filter((l) => l.vencida);
  const vencido = Math.round(vencidas.reduce((s, l) => s + l.saldo, 0) * 100) / 100;
  const detalleAncho = (
    <div className="min-w-0 space-y-6">
      <Tarjeta etiqueta={p.Alumno}>
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
            <Icon name="birrete" size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-texto">{carrito.alumno.nombre}</p>
            {subtituloFila && <p className="truncate text-[13px] text-texto-3">{subtituloFila}</p>}
            {sedeGrupo && !subtituloFila && <p className="truncate text-[13px] text-texto-3">{sedeGrupo}</p>}
          </div>
          {otraSede && <Chip tono="ambar">Otra {p.sede}</Chip>}
        </div>
        {(selectorHermanas || avisoOtraSede) && (
          <div className="mt-4 space-y-3 border-t border-borde-soft pt-4">
            {selectorHermanas && <div className="max-w-md">{selectorHermanas}</div>}
            {avisoOtraSede}
          </div>
        )}
      </Tarjeta>

      {sinCuotas ? (
        <Tarjeta>
          <Vacio icono="coins" titulo="No tiene cuotas pendientes" texto="Está al día: no hay nada que cobrarle." />
        </Tarjeta>
      ) : (
        <>
          <GrillaKpi columnas={3}>
            <KpiTarjeta
              etiqueta="Debe en total"
              valor={fmtMoney(tope)}
              pie={carrito.lineas.length === 1 ? "1 cuota pendiente" : `${carrito.lineas.length} cuotas pendientes`}
            />
            <KpiTarjeta
              etiqueta="Vencido"
              valor={fmtMoney(vencido)}
              pie={vencidas.length === 0 ? "nada vencido" : vencidas.length === 1 ? "1 cuota vencida" : `${vencidas.length} cuotas vencidas`}
              tono={vencido > 0 ? "urgente" : "normal"}
            />
            <KpiTarjeta
              etiqueta="Después de hoy"
              valor={restaHoy == null ? "—" : fmtMoney(restaHoy)}
              pie={restaHoy == null ? "falta el monto" : restaHoy <= 0 ? "queda al día" : "de saldo"}
              tono={restaHoy != null && restaHoy <= 0 ? "ok" : "normal"}
            />
          </GrillaKpi>

          <Tarjeta id="t-monto" titulo="Cuánto paga hoy" bajada="Se reparte por vencimiento: primero lo vencido.">
            <div className={`grid gap-x-8 gap-y-5 ${carrito.pagadores.length > 1 ? "md:grid-cols-2" : ""}`}>
              <div className="max-w-sm space-y-2">{campoMonto}</div>
              {carrito.pagadores.length > 1 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Quién paga</p>
                  {botonesPagador}
                </div>
              )}
            </div>
          </Tarjeta>

          <Tarjeta id="t-reparto" titulo="Cómo se reparte" contador={reparto.length} sinRelleno>
            <div className={TABLA.envoltura}>
              <table className={TABLA.tabla}>
                <thead>
                  <tr className={TABLA.encabezado}>
                    <th className={TABLA.th}>Cuota</th>
                    <th className={TABLA.th}>Vencimiento</th>
                    <th className={`${TABLA.th} text-right`}>Saldo</th>
                    <th className={`${TABLA.th} text-right`}>Hoy</th>
                  </tr>
                </thead>
                <tbody>
                  {reparto.map(({ linea, elegida }) => (
                    <tr key={linea.cuotaId} className={TABLA.fila}>
                      <td className={`${TABLA.td} font-semibold text-texto`}>{linea.descripcion}</td>
                      <td className={`${TABLA.td} whitespace-nowrap`}>
                        {linea.vencida ? (
                          <Chip tono="rojo">Vencida {fechaCorta(venceDe(linea.cuotaId))}</Chip>
                        ) : (
                          <span className="text-[13px] text-texto-3">Vence {fechaCorta(venceDe(linea.cuotaId))}</span>
                        )}
                      </td>
                      <td className={`${TABLA.td} ${TABLA.numero} whitespace-nowrap text-texto-2`}>{fmtMoney(linea.saldo)}</td>
                      <td className={`${TABLA.td} ${TABLA.numero} whitespace-nowrap`}>{hoyDe(linea, elegida)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        </>
      )}
    </div>
  );

  // El cobro (`PantallaCobro`, la del POS) queda SIEMPRE en el mismo lugar
  // del árbol: lo que cambia con la medida son las clases de los contenedores
  // y lo que se suma al lado. Así, achicar la ventana a la mitad en medio de
  // un cobro no borra el medio de pago ni el efectivo ya tecleados.
  return (
    <div className={ancha ? PAGINA_ANCHA : "h-full"}>
      {ancha && (
        <EncabezadoPagina
          volver={VOLVER_COBRANZA}
          titulo={`Cobrar a ${p.alumno}`}
          bajada={`Lo que se cobra entra a la caja abierta${abierta.almacen ? ` de ${abierta.almacen}` : ""}.`}
          acciones={
            <Boton variante="ghost" icono="search" onClick={otroCobro}>
              Buscar otro {p.alumno}
            </Boton>
          }
        />
      )}
      <div className={ancha ? "grid grid-cols-[minmax(0,1fr)_400px] items-start gap-6" : "h-full"}>
        {ancha && detalleAncho}
        {/* En la computadora el cobro es un panel fijo que nunca pasa del alto
            de la pantalla: lo que no entra (el QR) scrollea adentro y
            "Confirmar cobro" queda siempre a la vista. El alto descuenta el
            encabezado de la página: así el botón se ve apenas se abre, sin
            tener que bajar. */}
        <aside
          aria-label={ancha ? "Cobro" : undefined}
          className={ancha ? "card sticky top-8 flex max-h-[calc(100dvh-11rem)] flex-col overflow-hidden" : "h-full"}
        >
          <PantallaCobro
            titulo={ancha ? "Cobro" : `Cobrar a ${p.alumno}`}
            subtitulo={carrito.alumno.nombre}
            total={montoOk ? montoNum : 0}
            formasPago={formasPago.datos ?? []}
            onAtras={otroCobro}
            onConfirmar={(pagos) => void confirmar(pagos)}
            enviando={enviando}
            bloqueado={!montoOk || sinCuotas}
            // Cobrando cuotas lo común es el monto justo: vacío, se toma exacto.
            recibidoVacioEsExacto
            error={error}
            encabezado={ancha ? undefined : detalleCelular}
          />
        </aside>
      </div>
    </div>
  );
}

/**
 * El buscador: nombre, CI o código, contra las cuotas pendientes (sin sede: el
 * de otra sede también se cobra acá, con el aviso). Desde Cobranza llega con
 * `?alumno=&q=`: si el buscado aparece, se abre solo.
 *
 * Con el marco de las demás pantallas de academia (26-oct): encabezado con
 * "← Cobranza", el buscador en su tarjeta y los resultados debajo, en filas
 * que en la computadora muestran también lo que debe y la acción.
 */
function BuscarEstudiante({
  inicial,
  caja,
  error: errorAfuera,
  onElegir,
}: {
  inicial: InicialCobro;
  caja: { id: number | null; nombre: string | null } | null;
  error: string;
  /** `otras`: las inscripciones con deuda del mismo estudiante, para elegir entre ellas. */
  onElegir: (f: Fila, otras: Fila[]) => void;
}) {
  const p = usePalabras();
  const [q, setQ] = useState(inicial.q ?? "");
  const [buscado, setBuscado] = useState((inicial.q ?? "").trim());
  const [resultados, setResultados] = useState<AlumnoPorCobrar[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  // El alumno de la dirección se abre una sola vez: al volver, se busca otro.
  const directoUsado = useRef(inicial.inscripcionId != null);

  useEffect(() => {
    const t = setTimeout(() => setBuscado(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (buscado.length < 2) {
      setResultados(null);
      return;
    }
    let vigente = true;
    setBuscando(true);
    setError("");
    apiAcademia
      .cuotasPorCobrar(buscado)
      .then((r) => {
        if (!vigente) return;
        setResultados(r.alumnos);
        const suyas =
          !directoUsado.current && inicial.alumnoId != null ? r.alumnos.filter((a) => a.alumnoId === inicial.alumnoId) : [];
        if (suyas.length) {
          directoUsado.current = true;
          onElegir(suyas[0], suyas);
        }
      })
      .catch((e: unknown) => vigente && setError(e instanceof Error ? e.message : "No se pudo buscar"))
      .finally(() => vigente && setBuscando(false));
    return () => {
      vigente = false;
    };
    // `onElegir` no dispara otra búsqueda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscado]);

  return (
    <PaginaAcademia>
      <EncabezadoPagina
        volver={VOLVER_COBRANZA}
        titulo={`Cobrar a ${p.alumno}`}
        bajada={`Buscá al ${p.alumno} por nombre, CI o código.`}
      />
      <ErrorMsg>{errorAfuera || error}</ErrorMsg>
      <Tarjeta
        etiqueta="Resultados"
        sinRelleno
        barra={
          <div className="py-3">
            <div className="relative max-w-xl">
              <Icon
                name="search"
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-texto-4"
              />
              <Input
                aria-label={`Buscar ${p.alumno}`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, CI o código"
                autoFocus
                className="pl-10"
              />
            </div>
          </div>
        }
      >
        {buscando ? (
          <Cargando texto="Buscando…" />
        ) : resultados && resultados.length === 0 ? (
          <Vacio icono="search" titulo={`Nadie con cuotas pendientes con «${buscado}».`} texto="Probá con otra parte del nombre, el CI o el código." />
        ) : resultados?.length ? (
          <ul className={LISTA.lista}>
            {resultados.map((a) => {
              const otra = esOtraSede(a.sede, caja);
              return (
                <li key={a.inscripcionId}>
                  <button
                    type="button"
                    onClick={() => onElegir(a, resultados.filter((x) => x.alumnoId === a.alumnoId))}
                    className={`group flex min-h-11 w-full items-center gap-3 text-left sm:gap-4 ${LISTA.itemHover}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-texto group-hover:text-primary-700">{a.nombre}</span>
                      <span className="block truncate text-[13px] text-texto-3">
                        {[a.codigo, nombreDe(a.grupo), nombreDe(a.sede)].filter(Boolean).join(" · ")}
                      </span>
                      {otra && (
                        <Chip tono="ambar" className="mt-1">
                          Otra {p.sede}
                        </Chip>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="hidden text-[11px] font-semibold uppercase tracking-wide text-texto-4 md:block">
                        {a.vencido ? "Debe · vencido" : "Debe"}
                      </span>
                      <span className={`block text-sm font-bold tabular-nums md:text-base ${a.vencido ? "text-danger-text" : "text-texto"}`}>
                        {fmtMoney(a.saldo)}
                      </span>
                    </span>
                    {/* En la computadora la fila dice qué hace; en el celular alcanza la flecha.
                        Envuelto: el `inline-flex` del botón le ganaba al `hidden`. */}
                    <span aria-hidden="true" className="hidden md:block">
                      <span className={claseBotonFila("soft")}>
                        <Icon name="dollar" size={15} />
                        Cobrar
                      </span>
                    </span>
                    <Icon name="chevronRight" size={16} className="shrink-0 text-texto-4 md:hidden" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Vacio
            icono="search"
            titulo={`¿A quién le cobrás?`}
            texto={`Escribí al menos dos letras: salen los ${p.alumnos} con cuotas pendientes.`}
          />
        )}
      </Tarjeta>
    </PaginaAcademia>
  );
}
