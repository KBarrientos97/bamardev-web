import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Cargando, ErrorMsg, Input, Select } from "../../components/ui";
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
import type { PagoInput, Venta } from "../../types";
import AperturaCaja from "../pos/AperturaCaja";
import PantallaCobro from "../pos/PantallaCobro";
import PantallaRecibo from "../pos/PantallaRecibo";
import { huellaDeCobro, useIntentoDeCobro } from "../pos/useIntentoDeCobro";
import { Chip, LISTA, Tarjeta } from "./piezas";

type Fila = Pick<AlumnoPorCobrar, "inscripcionId" | "nombre" | "codigo" | "grupo" | "sede">;

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
  return (
    <PantallaCobro
      titulo={`Cobrar a ${p.alumno}`}
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
      encabezado={
        <div className="space-y-3">
          <div className="card space-y-1 p-4">
            <p className="flex items-center gap-2 text-[15px] font-bold text-texto">
              <Icon name="birrete" size={18} className="shrink-0 text-primary-700" />
              <span className="min-w-0 truncate">{carrito.alumno.nombre}</span>
            </p>
            {(elegido.fila.codigo || nombreDe(elegido.fila.grupo)) && (
              <p className="truncate text-[13px] text-texto-3">
                {[elegido.fila.codigo, nombreDe(elegido.fila.grupo)].filter(Boolean).join(" · ")}
              </p>
            )}
            {hermanas.length > 1 && (
              <label className="block pt-2">
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
            )}
            {otraSede && sedeGrupo && (
              <p role="status" className="flex items-center gap-1.5 pt-1 text-[13px] font-semibold text-warning-text">
                <Icon name="alert" size={15} />
                Grupo de {sedeGrupo} · se cobra en {abierta.almacen ?? "esta caja"}
              </p>
            )}
          </div>

          {sinCuotas ? (
            <p className="card p-4 text-sm text-texto-3">No tiene cuotas pendientes.</p>
          ) : (
            <>
              <div className="card space-y-2 p-4">
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
              </div>

              <Tarjeta id="t-reparto" titulo="Cómo se reparte" sinRelleno>
                <ul className={LISTA.lista}>
                  {reparto.map(({ linea, elegida }) => {
                    const vence = carrito.lineas.find((l) => l.cuotaId === linea.cuotaId)?.vence;
                    return (
                      <li key={linea.cuotaId} className={`flex items-center gap-3 ${LISTA.item}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-texto">{linea.descripcion}</span>
                          <span className={`block text-xs ${linea.vencida ? "font-semibold text-danger-text" : "text-texto-3"}`}>
                            {linea.vencida ? "Vencida" : "Vence"} {fechaCorta(vence)} · saldo {fmtMoney(linea.saldo)}
                          </span>
                        </span>
                        {montoOk && elegida ? (
                          <span className="shrink-0 text-right">
                            <span className="block text-sm font-bold tabular-nums text-texto">{fmtMoney(linea.monto)}</span>
                            {linea.monto < linea.saldo && <span className="block text-[11px] text-texto-3">abono</span>}
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs text-texto-4">—</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Tarjeta>

              {carrito.pagadores.length > 1 && (
                <div className="card space-y-2.5 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Quién paga</p>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quién paga">
                    {carrito.pagadores.map((x) => (
                      <button
                        key={x.clienteId}
                        type="button"
                        role="radio"
                        aria-checked={pagadorId === x.clienteId}
                        onClick={() => setPagadorId(x.clienteId)}
                        className={`inline-flex min-h-11 items-center rounded-full px-4 text-[13px] font-semibold transition-colors sm:min-h-9 ${
                          pagadorId === x.clienteId
                            ? "bg-primary-boton text-white"
                            : "border border-borde bg-white text-texto-2 hover:bg-muted"
                        }`}
                      >
                        {x.nombre} · {x.rol === "TUTOR" ? "tutor" : p.alumno}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      }
    />
  );
}

/**
 * El buscador: nombre, CI o código, contra las cuotas pendientes (sin sede: el
 * de otra sede también se cobra acá, con el aviso). Desde Cobranza llega con
 * `?alumno=&q=`: si el buscado aparece, se abre solo.
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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col">
      <div className="border-b border-borde bg-white px-4 py-3">
        <h1 className="text-[15px] font-bold text-texto">Cobrar a {p.alumno}</h1>
        <p className="truncate text-xs text-texto-3">Buscá al {p.alumno} por nombre, CI o código.</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <ErrorMsg>{errorAfuera || error}</ErrorMsg>
        <Input
          aria-label={`Buscar ${p.alumno}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre, CI o código"
          autoFocus
        />
        {buscando && <Cargando texto="Buscando…" />}
        {resultados && !buscando && resultados.length === 0 && (
          <p className="text-sm text-texto-3">Nadie con cuotas pendientes con «{buscado}».</p>
        )}
        {!!resultados?.length && (
          <Tarjeta etiqueta="Resultados" sinRelleno>
            <ul className={LISTA.lista}>
              {resultados.map((a) => (
                <li key={a.inscripcionId}>
                  <button
                    type="button"
                    onClick={() => onElegir(a, resultados.filter((x) => x.alumnoId === a.alumnoId))}
                    className={`flex min-h-11 w-full items-center gap-3 text-left ${LISTA.itemHover}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-texto">{a.nombre}</span>
                      <span className="block truncate text-[13px] text-texto-3">
                        {[a.codigo, nombreDe(a.grupo), nombreDe(a.sede)].filter(Boolean).join(" · ")}
                      </span>
                      {esOtraSede(a.sede, caja) && (
                        <Chip tono="ambar" className="mt-1">
                          Otra {p.sede}
                        </Chip>
                      )}
                    </span>
                    <span className={`shrink-0 text-sm font-bold tabular-nums ${a.vencido ? "text-danger-text" : "text-texto"}`}>
                      {fmtMoney(a.saldo)}
                    </span>
                    <Icon name="chevronRight" size={16} className="shrink-0 text-texto-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}
      </div>
    </div>
  );
}
