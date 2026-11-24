import { useEffect, useMemo, useRef, useState } from "react";
import Captcha from "../../publico/Captcha";
import { Icon } from "../../components/Icon";
import { apiAcademiaPublica, ErrorPublico } from "../../lib/academia/apiPublica";
import { prepararFoto } from "../../lib/academia/fotos";
import { fechaCorta } from "../../lib/academia/formato";
import type { EstadoCuentaPublico, OpcionDePago, PagoPublico, QrDelBanco } from "../../lib/academia/tipos";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import { siteKeyTurnstile } from "../../lib/turnstile";

const bs = (n: number) => `Bs ${n.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * M5 · Cómo pagar, en la página del estudiante (`/p/<sub>/pagar/<token>`).
 * Según lo que contesta el servidor (`d.pago`):
 *
 *  · un comprobante esperando revisión → «Lo estamos revisando» (no se sube otro);
 *  · una preinscripción con el grupo lleno → «El grupo está lleno, comunicate
 *    con la academia» (sólo el pago cubre el cupo, así que no se ofrece pagar);
 *  · QR del banco (cobro automatizado) → elegir qué, escanear el QR con el monto
 *    exacto y esperar: cuando el banco avisa, el pago se acredita solo;
 *  · QR fijo con algo para pagar → elegir qué (el completo, el primer mes o la
 *    próxima cuota), escanear el QR, subir la foto del comprobante;
 *  · sin QR → «Quedaste preinscrito; pagá en la academia» (o «pagá en el
 *    instituto» si ya está inscrito), diciendo igual cuánto es.
 *
 * El monto **no lo calcula esta pantalla**: viene de `opciones` y al subir sólo
 * se manda cuál se eligió; el servidor lo vuelve a calcular.
 */
export default function PagoEnLineaPublico({
  d,
  sub,
  token,
  color,
  whatsapp,
  onCambio,
}: {
  d: EstadoCuentaPublico;
  sub: string;
  token: string;
  color: string;
  whatsapp: string | null;
  /** Subió el comprobante: la página pide el estado de nuevo. */
  onCambio: () => void;
}) {
  const pago = d.pago;
  const preinscrita = pago.estado === "PREINSCRITA";
  // El QR fijo llega como data URL (cambio #25); una ruta del API, por las dudas.
  const qr = d.qr ? (/^(data:|https?:)/.test(d.qr.imagenUrl) ? d.qr.imagenUrl : urlDeImagen(d.qr.imagenUrl)) : null;

  const tarjeta = "space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm";

  if (pago.enRevision) {
    // Pagó por el QR del banco: la plata ya entró y la academia sólo la aplica.
    const viaBanco = !!pago.enRevision.viaBanco;
    return (
      <section aria-label={viaBanco ? "Tu pago" : "Tu comprobante"} className={tarjeta}>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFFBEB] text-[#92400E]">
            <Icon name="clock" size={18} />
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-[#111827]">{viaBanco ? "Recibimos tu pago" : "Recibimos tu comprobante"}</p>
            <p className="text-[13px] text-[#4B5563]">
              {pago.enRevision.etiqueta} · {bs(pago.enRevision.monto)}.{" "}
              {viaBanco ? "El instituto lo está confirmando" : "El instituto lo está revisando"}; apenas lo confirme te avisamos por WhatsApp
              {preinscrita ? " y tu lugar queda asegurado" : ""}.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (preinscrita && pago.grupoLleno) {
    return (
      <section aria-label="Cómo pagar" className={tarjeta}>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#B91C1C]">
            <Icon name="users" size={18} />
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-[#111827]">El grupo está lleno, comunicate con la academia</p>
            <p className="text-[13px] text-[#4B5563]">
              Sólo el pago asegura un lugar y los lugares ya se ocuparon. Escribinos para ver otro horario o ponerte en lista.
            </p>
          </div>
        </div>
        {whatsapp && <EnlaceWhatsapp url={whatsapp} color={color} />}
      </section>
    );
  }

  if (pago.modo === "AUTOMATIZADO" && pago.opciones.length > 0) {
    return <PagarConQr d={d} sub={sub} token={token} color={color} onCambio={onCambio} />;
  }

  if (pago.modo === "FIJO" && pago.opciones.length > 0 && qr) {
    return <SubirComprobante d={d} sub={sub} token={token} color={color} qr={qr} onCambio={onCambio} />;
  }

  // Sin pago en línea: en la academia. Igual dice cuánto es.
  if (!pago.opciones.length && !preinscrita) return null;
  return (
    <section aria-label="Cómo pagar" className={tarjeta}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F3F4F6] text-[#374151]">
          <Icon name="home" size={18} />
        </span>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-[#111827]">{preinscrita ? "Quedaste preinscrito; pagá en la academia" : "Pagá en el instituto"}</p>
          <p className="text-[13px] text-[#4B5563]">
            En la sede {d.grupo.sede}, en efectivo o con QR. Llevá tu carnet{preinscrita ? ": con tu primer pago queda asegurado tu lugar" : ""}.
          </p>
        </div>
      </div>
      {pago.opciones.length > 0 && (
        <ul className="divide-y divide-[#F1F5F9] rounded-xl border border-[#E5E7EB] px-4 text-sm">
          {pago.opciones.map((o) => (
            <li key={o.clave} className="flex items-baseline justify-between gap-3 py-2.5">
              <span className="text-[#374151]">{o.titulo}</span>
              <span className="font-bold tabular-nums text-[#111827]">{bs(o.monto)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EnlaceWhatsapp({ url, color }: { url: string; color: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white text-sm font-semibold hover:bg-[#F9FAFB]"
      style={{ color }}
    >
      <Icon name="phone" size={16} />
      Escribirle al instituto por WhatsApp
    </a>
  );
}

/**
 * Lo que el estudiante eligió pagar y cuánto: la opción (el servidor ya
 * calculó cada monto) y, en el adelanto, el monto dentro del rango. Lo usan el
 * QR fijo (`SubirComprobante`) y el del banco (`PagarConQr`).
 */
function useOpcionElegida(pago: PagoPublico, inicial?: OpcionDePago["clave"]) {
  const [clave, setClave] = useState<OpcionDePago["clave"]>(inicial ?? pago.opciones[0].clave);
  // Si el servidor ya no ofrece la que estaba elegida (cambió la deuda), la primera.
  const opcion = pago.opciones.find((o) => o.clave === clave) ?? pago.opciones[0];
  // El adelanto lo elige el estudiante (04-nov), como «Otro monto» del
  // mostrador: arranca en el mínimo y el servidor vuelve a mirar el rango.
  const elige = opcion.montoMaximo != null && opcion.montoMaximo > opcion.monto;
  const [elegido, setElegido] = useState("");
  const montoElegido = elige && elegido.trim() !== "" ? Number(elegido.replace(",", ".")) : opcion.monto;
  const montoMal =
    elige && (!Number.isFinite(montoElegido) || montoElegido < opcion.monto || montoElegido > opcion.montoMaximo!)
      ? `Elegí un monto de ${bs(opcion.monto)} a ${bs(opcion.montoMaximo!)}.`
      : "";
  const aPagar = montoMal ? opcion.monto : Math.round(montoElegido * 100) / 100;
  return { opcion, setClave, elige, elegido, setElegido, montoMal, aPagar };
}

/** Las opciones de pago (completo, cuota, adelanto) y, en el adelanto, cuánto. */
function SelectorDeOpcion({
  pago,
  opcion,
  setClave,
  color,
  elige,
  elegido,
  setElegido,
  montoMal,
  onEditar,
}: {
  pago: PagoPublico;
  opcion: OpcionDePago;
  setClave: (c: OpcionDePago["clave"]) => void;
  color: string;
  elige: boolean;
  elegido: string;
  setElegido: (v: string) => void;
  montoMal: string;
  /** El estudiante tocó el monto: la pantalla borra su aviso de error. */
  onEditar: () => void;
}) {
  return (
    <>
      {/* Dos columnas según el ancho de la tarjeta (@container), no el de la pantalla: con `sm:` la página
          de inscripción, angosta en una compu, partía cada opción en ~200 px y el monto se salía del borde
          (Drick, 08-nov). */}
      <div className="@container">
      <div role="radiogroup" aria-label="Qué vas a pagar" className={`grid gap-2 ${pago.opciones.length > 1 ? "@xl:grid-cols-2" : ""}`}>
        {pago.opciones.map((o) => {
          const on = o.clave === opcion.clave;
          return (
            <button
              key={o.clave}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setClave(o.clave)}
              className="flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left"
              style={{ borderColor: on ? color : "#E5E7EB", borderWidth: on ? 2 : 1, background: on ? "#F9FAFB" : "#ffffff" }}
            >
              <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 bg-white" style={{ borderColor: on ? color : "#D1D5DB" }}>
                {on && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-sm font-bold text-[#111827]">{o.titulo}</span>
                  <span className="whitespace-nowrap text-base font-bold tabular-nums text-[#111827]">
                    {o.montoMaximo != null && o.montoMaximo > o.monto ? `desde ${bs(o.monto)}` : bs(o.monto)}
                  </span>
                </span>
                {o.ahorro != null && o.ahorro > 0 && (
                  <span className="mt-1 inline-block rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[12px] font-semibold text-[#047857]">Ahorrás {bs(o.ahorro)}</span>
                )}
                {o.detalle && <span className="block text-[13px] text-[#6B7280]">{o.detalle}</span>}
                {o.vence && <span className="block text-[12px] text-[#6B7280]">Vence el {fechaCorta(o.vence)}</span>}
              </span>
            </button>
          );
        })}
      </div>
      </div>

      {elige && (
        <label className="block space-y-1.5">
          <span className="block text-sm font-bold text-[#111827]">¿Cuánto vas a pagar?</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label="Cuánto vas a pagar"
            value={elegido}
            placeholder={String(opcion.monto)}
            onChange={(e) => {
              setElegido(e.target.value);
              onEditar();
            }}
            className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-base font-bold tabular-nums text-[#111827] outline-none sm:max-w-[220px]"
            style={{ borderColor: montoMal ? "#DC2626" : undefined }}
          />
          <span className={`block text-[12px] ${montoMal ? "text-[#B91C1C]" : "text-[#6B7280]"}`}>
            {montoMal || `De ${bs(opcion.monto)} a ${bs(opcion.montoMaximo!)}. Lo que pagues se descuenta de tus cuotas.`}
          </span>
        </label>
      )}
    </>
  );
}

/** Cada cuánto se pregunta si el banco ya avisó. */
const CONSULTA_MS = 3000;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Pagar con el QR del banco (cobro automatizado, PLAN-QR-AUTOMATICO). El
 * estudiante elige qué paga, el servidor abre un QR con el monto EXACTO y la
 * pantalla espera: cuando el banco avisa, el pago se acredita solo y esta
 * misma pantalla lo dice. No hay comprobante que subir.
 *
 * Un QR abierto se recupera al recargar (`pago.esperando`). Si venció, la
 * consulta lo dice y se puede pedir otro.
 */
function PagarConQr({
  d,
  sub,
  token,
  color,
  onCambio,
}: {
  d: EstadoCuentaPublico;
  sub: string;
  token: string;
  color: string;
  onCambio: () => void;
}) {
  const pago = d.pago;
  const preinscrita = pago.estado === "PREINSCRITA";
  const abierto = pago.esperando ?? null;
  const { opcion, setClave, elige, elegido, setElegido, montoMal, aPagar } = useOpcionElegida(pago, abierto?.opcion);
  const [qr, setQr] = useState<QrDelBanco | null>(
    abierto ? { monto: abierto.monto, etiqueta: abierto.etiqueta, venceEn: abierto.venceEn, imagenQr: abierto.imagenQr } : null,
  );
  const [hecho, setHecho] = useState<{ monto: number; etiqueta: string } | null>(null);
  const [error, setError] = useState("");
  const [generando, setGenerando] = useState(false);
  const siteKey = siteKeyTurnstile();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());

  // La página que nos contiene cambia de función en cada vuelta: se lee desde una
  // referencia para que la consulta no se reinicie con cada render.
  const alCambiar = useRef(onCambio);
  useEffect(() => {
    alCambiar.current = onCambio;
  });

  // La cuenta regresiva: sólo mientras hay un QR a la vista.
  useEffect(() => {
    if (!qr || hecho) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [qr, hecho]);

  // Mientras espera, se le pregunta al servidor si el banco ya avisó.
  useEffect(() => {
    if (!qr || hecho) return;
    let vivo = true;
    const consultar = async () => {
      try {
        const r = await apiAcademiaPublica.estadoQr(sub, token);
        if (!vivo) return;
        if (r.estado === "ACREDITADO") setHecho({ monto: r.monto, etiqueta: r.etiqueta });
        else if (r.estado === "EN_REVISION") alCambiar.current();
        else if (r.estado === "VENCIDO") {
          setQr(null);
          setError("El QR venció sin pagarse. Si todavía querés pagar, generá uno nuevo.");
        }
      } catch {
        /* sin señal un momento: la próxima consulta lo resuelve */
      }
    };
    const id = setInterval(() => void consultar(), CONSULTA_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [qr, hecho, sub, token]);

  async function generar() {
    if (montoMal) return setError(montoMal);
    if (siteKey && !captcha) return setError("Completá la verificación anti-robots.");
    setError("");
    setGenerando(true);
    try {
      setQr(
        await apiAcademiaPublica.pedirQr(sub, token, {
          opcion: opcion.clave,
          ...(elige ? { monto: aPagar } : {}),
          ...(siteKey && captcha ? { captcha } : {}),
        }),
      );
    } catch (e) {
      const codigo = e instanceof ErrorPublico ? e.codigo : undefined;
      setError(e instanceof Error ? e.message : "No se pudo abrir el QR. Probá de nuevo.");
      // Se avisa lo que cambió: la página se actualiza y muestra el estado real.
      if (codigo === "COMPROBANTE_EN_REVISION" || codigo === "OPCION_NO_DISPONIBLE" || codigo === "GRUPO_LLENO") onCambio();
    } finally {
      setGenerando(false);
      // El token de Turnstile es de un solo uso: el backend ya lo gastó.
      if (siteKey) {
        setCaptcha(null);
        setVueltaCaptcha((v) => v + 1);
      }
    }
  }

  async function elegirOtra() {
    try {
      await apiAcademiaPublica.cancelarQr(sub, token);
    } catch {
      /* si no se pudo cerrar, el QR vence solo; el servidor cierra el viejo al pedir otro */
    }
    setQr(null);
    setError("");
  }

  /**
   * «Ver mi estado de cuenta» tras el pago (24-nov: no hacía nada). La tarjeta
   * «¡Pago recibido!» es estado de ESTE componente, que sigue montado mientras
   * quede algo por pagar: sólo pedir el estado de nuevo no la sacaba. Se cierra,
   * se pide el estado actualizado (la cuota ya sumada) y se baja a las cuotas.
   */
  function verMiEstadoDeCuenta() {
    setHecho(null);
    setQr(null);
    setError("");
    onCambio();
    document.getElementById("t-cuenta")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  const tarjeta = "space-y-4 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm";

  if (hecho) {
    return (
      <section aria-label="Pago recibido" className={tarjeta}>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#047857]">
            <Icon name="check" size={18} />
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-[#111827]">¡Pago recibido!</p>
            <p className="text-[13px] text-[#4B5563]">
              {hecho.etiqueta} · {bs(hecho.monto)}. Ya se sumó a tu cuenta{preinscrita ? " y tu lugar quedó asegurado" : ""}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={verMiEstadoDeCuenta}
          className="flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-bold text-white"
          style={{ background: color }}
        >
          Ver mi estado de cuenta
        </button>
      </section>
    );
  }

  if (qr) {
    const restante = new Date(qr.venceEn).getTime() - ahora;
    return (
      <section aria-label="Pagar con QR" className={tarjeta}>
        <div>
          <p className="text-sm font-bold text-[#111827]">
            Pagá {bs(qr.monto)} · {qr.etiqueta}
          </p>
          <p className="text-[13px] text-[#6B7280]">Escaneá el QR con la app de tu banco. El monto ya está puesto: no lo cambies.</p>
        </div>
        <img src={qr.imagenQr} alt={`QR para pagar ${bs(qr.monto)}`} className="mx-auto w-full max-w-[260px] rounded-xl border border-[#E5E7EB]" />
        <p role="status" className="flex items-center justify-center gap-2 text-center text-sm font-semibold text-[#374151]">
          <Icon name="clock" size={16} />
          Esperando tu pago… {restante > 0 ? `vence en ${mmss(restante)}` : "venciendo"}
        </p>
        <a
          href={qr.imagenQr}
          download
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-white py-2.5 text-center text-sm font-semibold hover:bg-[#F9FAFB]"
          style={{ color, borderColor: color }}
        >
          <Icon name="download" size={16} />
          Descargar el QR
        </a>
        <p className="text-center text-[12px] text-[#6B7280]">
          Apenas el banco confirme el pago, esta pantalla lo dice y queda sumado a tu cuenta. No hace falta subir ningún comprobante.
        </p>
        <button type="button" onClick={() => void elegirOtra()} className="mx-auto block text-[13px] font-semibold underline" style={{ color }}>
          Elegir otra cosa para pagar
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Cómo pagar" className={tarjeta}>
      {pago.rechazado && (
        <p role="alert" className="rounded-xl bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] text-[#B91C1C]">
          <strong>No pudimos aplicar tu último pago</strong> ({bs(pago.rechazado.monto)})
          {pago.rechazado.motivo ? `: ${pago.rechazado.motivo}` : ""}. Tu deuda sigue igual.
        </p>
      )}
      <div>
        <p className="text-sm font-bold text-[#111827]">{preinscrita ? "Pagá para asegurar tu lugar" : "¿Qué querés pagar?"}</p>
        {preinscrita && <p className="text-[13px] text-[#6B7280]">Con tu pago quedás inscrito y tu lugar en el grupo queda asegurado.</p>}
      </div>
      <SelectorDeOpcion
        pago={pago}
        opcion={opcion}
        setClave={setClave}
        color={color}
        elige={elige}
        elegido={elegido}
        setElegido={setElegido}
        montoMal={montoMal}
        onEditar={() => setError("")}
      />
      {siteKey && <Captcha key={vueltaCaptcha} siteKey={siteKey} onToken={setCaptcha} />}
      {error && (
        <p role="alert" className="rounded-xl bg-[#FEE2E2] px-3.5 py-2.5 text-sm text-[#B91C1C]">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void generar()}
        disabled={generando}
        className="flex min-h-12 w-full flex-col items-center justify-center rounded-xl px-4 py-2.5 text-center leading-tight text-white disabled:opacity-60"
        style={{ background: color, boxShadow: "0 2px 6px rgba(15, 23, 42, 0.18)" }}
      >
        {generando ? (
          <span className="text-[15px] font-semibold">Abriendo el QR…</span>
        ) : (
          <>
            <span className="text-[16px] font-bold">Pagar con QR</span>
            <span className="mt-0.5 text-[12.5px] font-medium opacity-90">{bs(aPagar)}</span>
          </>
        )}
      </button>
      <p className="text-center text-[12px] text-[#6B7280]">Pagás desde la app de tu banco y se acredita solo, sin subir comprobante.</p>
    </section>
  );
}

function SubirComprobante({
  d,
  sub,
  token,
  color,
  qr,
  onCambio,
}: {
  d: EstadoCuentaPublico;
  sub: string;
  token: string;
  color: string;
  qr: string;
  onCambio: () => void;
}) {
  const pago = d.pago;
  const { opcion, setClave, elige, elegido, setElegido, montoMal, aPagar } = useOpcionElegida(pago);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const siteKey = siteKeyTurnstile();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0);
  const archivo = useRef<HTMLInputElement>(null);
  const vista = useMemo(() => (foto && typeof URL.createObjectURL === "function" ? URL.createObjectURL(foto) : null), [foto]);
  useEffect(
    () => () => {
      if (vista) URL.revokeObjectURL?.(vista);
    },
    [vista],
  );

  async function elegirFoto(f: File | undefined) {
    if (!f) return;
    setError("");
    setProcesando(true);
    try {
      setFoto(await prepararFoto(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la foto");
    } finally {
      setProcesando(false);
    }
  }

  async function enviar() {
    if (montoMal) return setError(montoMal);
    if (!foto) return setError("Subí la foto o la captura de tu comprobante.");
    if (siteKey && !captcha) return setError("Completá la verificación anti-robots.");
    setError("");
    setEnviando(true);
    try {
      await apiAcademiaPublica.subirComprobante(
        sub,
        token,
        { opcion: opcion.clave, ...(elige ? { monto: aPagar } : {}), ...(siteKey && captcha ? { captcha } : {}) },
        foto,
      );
      onCambio();
    } catch (e) {
      const codigo = e instanceof ErrorPublico ? e.codigo : undefined;
      setError(e instanceof Error ? e.message : "No se pudo enviar. Probá de nuevo.");
      // Se avisa lo que cambió: la página se actualiza y muestra el estado real.
      if (codigo === "COMPROBANTE_EN_REVISION" || codigo === "OPCION_NO_DISPONIBLE" || codigo === "GRUPO_LLENO") onCambio();
      // El token de Turnstile es de un solo uso: el backend ya lo gastó.
      if (siteKey) {
        setCaptcha(null);
        setVueltaCaptcha((v) => v + 1);
      }
    } finally {
      setEnviando(false);
    }
  }

  const preinscrita = pago.estado === "PREINSCRITA";
  return (
    <section aria-label="Cómo pagar" className="space-y-4 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      {pago.rechazado && (
        <p role="alert" className="rounded-xl bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] text-[#B91C1C]">
          <strong>No pudimos confirmar tu último comprobante</strong> ({bs(pago.rechazado.monto)})
          {pago.rechazado.motivo ? `: ${pago.rechazado.motivo}` : ""}. Tu deuda sigue igual: podés pagar y subir otro.
        </p>
      )}

      <div>
        <p className="text-sm font-bold text-[#111827]">{preinscrita ? "Pagá para asegurar tu lugar" : "¿Qué querés pagar?"}</p>
        {preinscrita && <p className="text-[13px] text-[#6B7280]">Con tu pago quedás inscrito y tu lugar en el grupo queda asegurado.</p>}
      </div>

      <SelectorDeOpcion
        pago={pago}
        opcion={opcion}
        setClave={setClave}
        color={color}
        elige={elige}
        elegido={elegido}
        setElegido={setElegido}
        montoMal={montoMal}
        onEditar={() => setError("")}
      />

      {/* Con lugar (tablet o compu), el QR a la izquierda y qué hacer a la derecha. */}
      <div className="space-y-3 border-t border-[#F1F5F9] pt-4 sm:flex sm:items-center sm:gap-5 sm:space-y-0">
        <img src={qr} alt={`QR de ${d.instituto.nombre} para pagar`} className="mx-auto w-full max-w-[240px] rounded-xl border border-[#E5E7EB] sm:mx-0 sm:w-[200px] sm:shrink-0" />
        <div className="space-y-3 sm:flex-1">
          <p className="text-center text-sm font-semibold text-[#111827] sm:text-left">Escaneá el QR con la app de tu banco y pagá {bs(aPagar)}</p>
          <p className="text-center text-[12px] text-[#6B7280] sm:text-left">Pagá justo ese monto: es lo que el instituto va a buscar en su cuenta.</p>
          <a
            href={qr}
            download
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-white py-2.5 text-center text-sm font-semibold hover:bg-[#F9FAFB]"
            style={{ color, borderColor: color }}
          >
            <Icon name="download" size={16} />
            Descargar el QR
          </a>
        </div>
      </div>

      <div className="space-y-3 border-t border-[#F1F5F9] pt-4">
        <p className="text-sm font-bold text-[#111827]">Después, subí tu comprobante</p>
        <input ref={archivo} type="file" accept="image/*" aria-label="Foto o captura del comprobante" className="sr-only" onChange={(e) => void elegirFoto(e.target.files?.[0])} />
        {vista ? (
          <figure className="space-y-2">
            <img src={vista} alt="Tu comprobante" className="mx-auto max-h-64 rounded-xl border border-[#E5E7EB] object-contain" />
            <button
              type="button"
              onClick={() => {
                setFoto(null);
                if (archivo.current) archivo.current.value = "";
              }}
              className="mx-auto block text-[13px] font-semibold underline"
              style={{ color }}
            >
              Elegir otra
            </button>
          </figure>
        ) : (
          <button
            type="button"
            disabled={procesando}
            onClick={() => archivo.current?.click()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#D1D5DB] bg-[#F9FAFB] px-4 py-2.5 text-center text-sm font-semibold leading-snug text-[#374151] hover:bg-white disabled:opacity-60"
          >
            <Icon name="camara" size={18} className="shrink-0" />
            {/* Corto (Drick, 08-nov): el largo se partía en dos renglones con el ícono pegado al borde. */}
            {procesando ? "Preparando la foto…" : "Subir foto del comprobante"}
          </button>
        )}
        {siteKey && <Captcha key={vueltaCaptcha} siteKey={siteKey} onToken={setCaptcha} />}
        {error && (
          <p role="alert" className="rounded-xl bg-[#FEE2E2] px-3.5 py-2.5 text-sm text-[#B91C1C]">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={enviando || procesando}
          // El nombre completo para el lector de pantalla: los dos renglones se leerían pegados.
          aria-label={enviando ? undefined : `Ya pagué ${bs(aPagar)}: enviar comprobante`}
          className="flex min-h-12 w-full flex-col items-center justify-center rounded-xl px-4 py-2.5 text-center leading-tight text-white disabled:opacity-60"
          style={{ background: color, boxShadow: "0 2px 6px rgba(15, 23, 42, 0.18)" }}
        >
          {/* En dos renglones (Drick, 08-nov): «Ya pagué Bs 150: enviar comprobante» en uno solo
              llegaba a los bordes del botón en el celular. Primero lo que hace el botón. */}
          {enviando ? (
            <span className="text-[15px] font-semibold">Enviando…</span>
          ) : (
            <>
              <span className="text-[16px] font-bold">Enviar comprobante</span>
              <span className="mt-0.5 text-[12.5px] font-medium opacity-90">Ya pagué {bs(aPagar)}</span>
            </>
          )}
        </button>
        <p className="text-center text-[12px] text-[#6B7280]">El instituto lo revisa y te avisa por WhatsApp. Si el pago no figura, tu deuda sigue igual y podés subir otro.</p>
      </div>
    </section>
  );
}
