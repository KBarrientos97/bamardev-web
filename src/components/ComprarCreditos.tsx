import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiMonedero } from "../lib/apiMonedero";
import { fmtCreditos, palabraUnidad, tituloAgotado } from "../lib/cupo";
import { EVENTO_HOJA_CUPO, type PedidoHojaCupo } from "../lib/hojaCupo";
import { useCupo } from "../store/useCupo";
import type { CompraCreditosVista, PaqueteCreditosVista, PaquetesCreditos, UnidadCupo } from "../types";
import { Icon } from "./Icon";
import { Boton, Cargando, ErrorMsg, Modal } from "./ui";

/** Cada cuánto se pregunta si el pago entró: el mismo que `PagarLicencia`. */
export const SONDEO_MS = 5000;
/**
 * Cuántas veces se pregunta sola antes de esperar al botón "Ya pagué". Igual
 * que en la licencia: no es por el tope del endpoint, es para no dejar un
 * intervalo golpeando el servidor si alguien se olvida la hoja abierta.
 */
export const SONDEOS_ANTES_DE_PAUSAR = 60;

/** Los paquetes siempre están en bolivianos (el contrato fija `BOB`). */
function bs(monto: number): string {
  return `Bs ${monto.toLocaleString("es-BO", {
    minimumFractionDigits: monto % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Situaciones de la licencia en las que no se compra nada (D24). El backend
 * igual lo corta (`jwt.strategy` responde 403 en todo); esto evita ofrecer un
 * botón que va a rebotar y cerrar la sesión.
 */
const SIN_COMPRA = ["suspendida", "vencida"];

/**
 * La hoja "Comprar créditos (QR)" del Plan Emprendedor (§5.1): paquetes, QR,
 * sondeo hasta que el banco confirme y "Listo: +50 créditos".
 *
 * Se abre de dos maneras: tocando el chip (para comprar cuando uno quiere) o
 * porque una venta o una cita no tenían lugar (`agotado`): ahí el título dice
 * por qué. Al cerrarse, lo que el cajero estaba haciendo sigue ahí —el carrito,
 * el formulario de la cita— para reintentar con el saldo nuevo.
 */
export default function ComprarCreditos({
  unidad = "VENTA",
  agotado = false,
  onClose,
}: {
  unidad?: UnidadCupo;
  agotado?: boolean;
  onClose: () => void;
}) {
  const { cupo, actualizarCupo, refrescarCupo, licencia } = useCupo();
  const bloqueada = !!licencia && SIN_COMPRA.includes(licencia.situacion);

  const [catalogo, setCatalogo] = useState<PaquetesCreditos | null>(null);
  const [cargando, setCargando] = useState(!bloqueada);
  const [error, setError] = useState("");
  const [paquete, setPaquete] = useState<PaqueteCreditosVista | null>(null);
  const [compra, setCompra] = useState<CompraCreditosVista | null>(null);
  const [generando, setGenerando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const sondeos = useRef(0);
  /** La última consulta rebotó con 429: el tope sigue, no hay que reanudar. */
  const limitado = useRef(false);
  const pagada = compra?.estado === "PAGADA";

  const cargar = useCallback(async () => {
    setError("");
    setCargando(true);
    try {
      setCatalogo(await apiMonedero.paquetesCreditos());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron traer los paquetes");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!bloqueada) void cargar();
  }, [bloqueada, cargar]);

  /**
   * El pago entró: el saldo nuevo se aplica en el acto con lo que trae la
   * compra, y después se pide el contador entero para que el chip y el
   * bloqueo queden al día.
   */
  const acreditada = useCallback(
    (r: CompraCreditosVista) => {
      if (cupo) actualizarCupo({ ...cupo, creditos: { ...cupo.creditos, saldo: r.saldo } });
      refrescarCupo();
    },
    [cupo, actualizarCupo, refrescarCupo],
  );

  const generar = useCallback(
    async (p: PaqueteCreditosVista) => {
      setError("");
      setGenerando(true);
      setPaquete(p);
      try {
        // Viaja el paquete, nunca el monto: lo copia el backend del catálogo.
        const r = await apiMonedero.comprarCreditos(p.id);
        setCompra(r);
        sondeos.current = 0;
        setPausado(false);
        if (r.estado === "PAGADA") acreditada(r);
      } catch (e) {
        // PLAN_SIN_CREDITOS, QR_NO_HABILITADO, PAQUETE_NO_EXISTE: el backend
        // manda el texto listo para mostrar.
        setError(e instanceof Error ? e.message : "No se pudo generar el QR");
      } finally {
        setGenerando(false);
      }
    },
    [acreditada],
  );

  const consultar = useCallback(
    async (id: number) => {
      limitado.current = false;
      try {
        const r = await apiMonedero.compraCreditos(id);
        setCompra((previa) => (previa ? { ...previa, ...r, qr: r.qr ?? previa.qr } : r));
        if (r.estado === "PAGADA") acreditada(r);
        return r.estado;
      } catch (e) {
        // 429: se agotó el tope del endpoint. Seguir preguntando lo empeora.
        if ((e as { status?: number })?.status === 429) {
          limitado.current = true;
          setPausado(true);
        }
        // Otro fallo suelto no se muestra: sería un cartel parpadeando cada
        // cinco segundos mientras el dueño escanea.
        return null;
      }
    },
    [acreditada],
  );

  const qrVencido = compra?.qr ? new Date(compra.qr.venceEn).getTime() <= Date.now() : false;
  const esperando = !!compra && compra.estado === "PENDIENTE" && !qrVencido;

  // El sondeo, igual que la licencia: se corta al pagar, al vencer el QR, a
  // las 60 consultas y al cerrar la hoja.
  useEffect(() => {
    if (!compra || !esperando || pausado) return;
    const id = window.setInterval(() => {
      sondeos.current += 1;
      if (sondeos.current >= SONDEOS_ANTES_DE_PAUSAR) {
        setPausado(true);
        return;
      }
      void consultar(compra.id);
    }, SONDEO_MS);
    return () => window.clearInterval(id);
  }, [compra, esperando, pausado, consultar]);

  const verificar = async () => {
    if (!compra) return;
    setVerificando(true);
    const estado = await consultar(compra.id);
    setVerificando(false);
    if (estado && estado !== "PAGADA") {
      setError("El banco todavía no informó el pago. Si ya pagaste, esperá unos segundos.");
    } else {
      setError("");
    }
    // Volver a mirar reanuda el sondeo: el dueño sigue en la pantalla. Salvo
    // que esta consulta también haya rebotado con 429: reanudar ahí era
    // seguir golpeando un endpoint que ya dijo basta.
    if (limitado.current) return;
    sondeos.current = 0;
    setPausado(false);
  };

  // Escape cierra SÓLO la hoja. Se escucha en captura sobre `window` y no se
  // deja seguir: la nueva cita también cierra con Escape, y sin esto se
  // cerraba junto con la hoja y se perdía todo lo cargado.
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", alTecla, true);
    return () => window.removeEventListener("keydown", alTecla, true);
  }, [onClose]);

  const saldo = cupo?.creditos.saldo ?? catalogo?.saldo ?? 0;
  const recordatorio =
    compra?.recordatorioLicencia ??
    catalogo?.recordatorioLicencia ??
    // Si el backend todavía no lo manda, el mensaje de la licencia en gracia
    // dice lo mismo (D24: se puede comprar, pero que no se olvide la cuota).
    (licencia && (licencia.situacion === "en_gracia" || licencia.situacion === "por_vencer")
      ? licencia.mensaje || null
      : null);
  const costo = unidad === "VENTA" ? (cupo?.creditosPorVenta ?? 1) : (cupo?.creditosPorCita ?? 2);
  const seguir = unidad === "VENTA" ? "Seguir vendiendo" : "Seguir agendando";

  const titulo = agotado ? tituloAgotado(cupo, unidad) : "Comprar créditos";
  const subtitulo = agotado
    ? `Te ${saldo === 1 ? "queda" : "quedan"} ${fmtCreditos(saldo)} ${saldo === 1 ? "crédito" : "créditos"}, y cada ${palabraUnidad(unidad, 1)} fuera del cupo usa ${costo}.`
    : `Tu saldo: ${fmtCreditos(saldo)} ${saldo === 1 ? "crédito" : "créditos"}`;

  return createPortal(
    // Sin cerrar al clic afuera: la hoja se abre desde un clic en Cobrar, y el
    // segundo clic de un doble clic caía en el fondo y la cerraba en el acto
    // (y un clic suelto mientras se escanea perdía el QR en pantalla). Se
    // cierra con la X, con Escape o con «Seguir vendiendo».
    <Modal
      abierto
      titulo={titulo}
      subtitulo={subtitulo}
      onClose={onClose}
      ancho="max-w-md"
      cerrarAlClicAfuera={false}
    >
      <div className="space-y-4">
        {bloqueada ? (
          <p role="alert" className="rounded-xl bg-danger-bg px-3.5 py-3 text-sm text-danger-text">
            {licencia?.situacion === "suspendida"
              ? "La licencia del negocio está suspendida: no se pueden comprar créditos hasta que se reactive."
              : "La licencia del negocio venció: primero hay que pagar la mensualidad."}
          </p>
        ) : pagada && compra ? (
          <Exito creditos={compra.creditos} saldo={compra.saldo} seguir={seguir} onClose={onClose} />
        ) : (
          <>
            {recordatorio && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] font-semibold text-warning-text"
              >
                <Icon name="alert" size={17} />
                <span className="flex-1">{recordatorio}</span>
              </p>
            )}
            {/* §5: dos meses seguidos gastando de más en créditos, se le
                sugiere el Básico. Sólo se sugiere: el plan no cambia solo. */}
            {cupo?.sugerirBasico && !compra && (
              <p className="flex items-start gap-2 rounded-xl bg-info-bg px-3.5 py-2.5 text-[13px] text-info-text">
                <Icon name="info" size={17} />
                <span className="flex-1">
                  Con lo que venís gastando en créditos te conviene el plan Básico, sin límite por día. Pedíselo a
                  BamarDev cuando quieras.
                </span>
              </p>
            )}
            {error && <ErrorMsg>{error}</ErrorMsg>}
            {compra ? (
              <VistaQr
                compra={compra}
                vencido={qrVencido}
                pausado={pausado}
                generando={generando}
                verificando={verificando}
                onVerificar={verificar}
                onOtroQr={() => paquete && void generar(paquete)}
                onCambiar={() => {
                  setCompra(null);
                  setError("");
                }}
              />
            ) : cargando ? (
              <Cargando texto="Buscando los paquetes…" />
            ) : catalogo && !catalogo.puedeComprar ? (
              <p className="rounded-xl bg-muted px-3.5 py-3 text-sm text-texto-2">
                {catalogo.motivo ?? "Por ahora no se pueden comprar créditos."}
              </p>
            ) : catalogo ? (
              <ListaPaquetes paquetes={catalogo.paquetes} generando={generando ? paquete?.id ?? null : null} onElegir={generar} />
            ) : (
              <Boton variante="ghost" className="w-full" onClick={() => void cargar()}>
                Reintentar
              </Boton>
            )}
          </>
        )}
      </div>
    </Modal>,
    document.body,
  );
}

/**
 * Los paquetes en tres columnas (§5): cuántos créditos, cuánto cuestan y
 * cuántas ventas o citas pagan. La tercera es la que se entiende: "50
 * créditos" no le dice nada a quien vende; "50 ventas o 25 citas", sí.
 */
function ListaPaquetes({
  paquetes,
  generando,
  onElegir,
}: {
  paquetes: PaqueteCreditosVista[];
  generando: number | null;
  onElegir: (p: PaqueteCreditosVista) => void;
}) {
  if (!paquetes.length)
    return <p className="rounded-xl bg-muted px-3.5 py-3 text-sm text-texto-2">No hay paquetes a la venta ahora.</p>;
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-texto-3">Elegí un paquete y pagalo con el QR de tu banco.</p>
      <ul className="space-y-2">
        {paquetes.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={generando !== null}
              onClick={() => onElegir(p)}
              aria-label={`${p.creditos} créditos por ${bs(p.precio)}`}
              className="grid w-full grid-cols-3 items-center gap-2 rounded-xl border border-borde bg-white px-3.5 py-3 text-left transition-colors enabled:hover:border-primary enabled:hover:bg-primary-50 disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block text-sm font-bold text-texto">{p.creditos} créditos</span>
                {p.nombre && <span className="block truncate text-[11px] font-semibold text-primary-700">{p.nombre}</span>}
              </span>
              <span className="text-center text-sm font-extrabold tracking-tight text-texto">
                {generando === p.id ? "Generando…" : bs(p.precio)}
              </span>
              <span className="text-right text-[12px] leading-tight text-texto-3">
                {p.alcanzaVentas} {palabraUnidad("VENTA", p.alcanzaVentas)} o {p.alcanzaCitas}{" "}
                {palabraUnidad("CITA", p.alcanzaCitas)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VistaQr({
  compra,
  vencido,
  pausado,
  generando,
  verificando,
  onVerificar,
  onOtroQr,
  onCambiar,
}: {
  compra: CompraCreditosVista;
  vencido: boolean;
  pausado: boolean;
  generando: boolean;
  verificando: boolean;
  onVerificar: () => void;
  onOtroQr: () => void;
  onCambiar: () => void;
}) {
  const cerrada = compra.estado === "ANULADA" || compra.estado === "VENCIDA";
  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-[13px] text-texto-3">Total a pagar</p>
        <p className="text-3xl font-extrabold tracking-tight text-texto">{bs(compra.monto)}</p>
        <p className="mt-0.5 text-[13px] text-texto-3">{compra.creditos} créditos</p>
      </div>
      {vencido || cerrada ? (
        <div className="space-y-3 text-center">
          <p className="text-[13px] text-texto-2">Este QR ya venció. Generá uno nuevo para pagar.</p>
          <Boton className="w-full" disabled={generando} onClick={onOtroQr}>
            {generando ? "Generando…" : "Generar otro QR"}
          </Boton>
        </div>
      ) : (
        <>
          {compra.qr?.imagenQr ? (
            <img
              src={compra.qr.imagenQr}
              alt="Código QR para pagar los créditos"
              className="mx-auto w-full max-w-[240px] rounded-xl border border-borde bg-white p-3"
            />
          ) : (
            <p className="rounded-xl bg-muted p-4 text-center text-[13px] text-texto-3">
              El QR ya se había generado. Si lo perdiste, elegí el paquete de nuevo.
            </p>
          )}
          {/* El texto sigue al estado real del sondeo, como en la licencia. */}
          <p className="text-center text-[13px] leading-snug text-texto-3">
            {pausado
              ? "Escaneá el QR desde la app de tu banco. Cuando termines, tocá «Ya pagué» para confirmarlo."
              : "Escaneá el QR desde la app de tu banco. Cuando el pago entre, esta hoja se actualiza sola."}
          </p>
          <Boton variante="ghost" className="w-full" disabled={verificando} onClick={onVerificar}>
            {verificando ? "Verificando…" : "Ya pagué, verificar"}
          </Boton>
        </>
      )}
      <button
        type="button"
        onClick={onCambiar}
        className="w-full text-center text-[13px] font-semibold text-primary-700 hover:text-primary"
      >
        Elegir otro paquete
      </button>
    </div>
  );
}

function Exito({
  creditos,
  saldo,
  seguir,
  onClose,
}: {
  creditos: number;
  saldo: number;
  seguir: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 py-2 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <Icon name="check" size={30} strokeWidth={2.4} />
      </div>
      <div>
        <h3 className="text-lg font-bold text-texto">Listo: +{creditos} créditos</h3>
        <p className="mt-1 text-[13px] text-texto-3">Tu saldo ahora es de {fmtCreditos(saldo)} créditos.</p>
      </div>
      <Boton className="w-full" onClick={onClose}>
        {seguir}
      </Boton>
    </div>
  );
}

/**
 * Quien dibuja la hoja cuando alguien la pide con `abrirHojaCupo` (ver
 * `lib/hojaCupo.ts`). Va montado siempre en el Layout y en Mi agenda; sin
 * pedido no dibuja nada, así que en un negocio sin cupo no hay diferencia
 * alguna en la pantalla.
 */
export function HojaCupoHost() {
  const [pedido, setPedido] = useState<(PedidoHojaCupo & { n: number; abierta: boolean }) | null>(null);
  useEffect(() => {
    const abrir = (e: Event) => {
      const detalle = (e as CustomEvent<PedidoHojaCupo>).detail ?? {};
      // Cada pedido arranca limpio (`key`): una compra a medio pagar de antes
      // no tiene que aparecer en la hoja de un bloqueo nuevo. Pero con la
      // hoja ABIERTA un pedido nuevo (Enter o doble clic en Cobrar, que
      // sigue con el foco) no la reinicia: se perdía el QR que se estaba
      // por pagar. Sólo se actualiza el motivo.
      setPedido((previo) =>
        previo?.abierta ? { ...previo, ...detalle } : { ...detalle, n: (previo?.n ?? 0) + 1, abierta: true },
      );
    };
    window.addEventListener(EVENTO_HOJA_CUPO, abrir);
    return () => window.removeEventListener(EVENTO_HOJA_CUPO, abrir);
  }, []);
  // Se conserva `n` al cerrar: el próximo pedido monta una hoja nueva.
  const cerrar = useCallback(() => setPedido((previo) => (previo ? { ...previo, abierta: false } : previo)), []);
  if (!pedido?.abierta) return null;
  return <ComprarCreditos key={pedido.n} unidad={pedido.unidad} agotado={pedido.agotado} onClose={cerrar} />;
}

