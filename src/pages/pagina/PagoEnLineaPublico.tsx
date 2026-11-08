import { useEffect, useMemo, useRef, useState } from "react";
import Captcha from "../../publico/Captcha";
import { Icon } from "../../components/Icon";
import { apiAcademiaPublica, ErrorPublico } from "../../lib/academia/apiPublica";
import { prepararFoto } from "../../lib/academia/fotos";
import { fechaCorta } from "../../lib/academia/formato";
import type { EstadoCuentaPublico, OpcionDePago } from "../../lib/academia/tipos";
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
    return (
      <section aria-label="Tu comprobante" className={tarjeta}>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFFBEB] text-[#92400E]">
            <Icon name="clock" size={18} />
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-[#111827]">Recibimos tu comprobante</p>
            <p className="text-[13px] text-[#4B5563]">
              {pago.enRevision.etiqueta} · {bs(pago.enRevision.monto)}. El instituto lo está revisando; apenas lo confirme te avisamos por WhatsApp
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
  const [clave, setClave] = useState<OpcionDePago["clave"]>(pago.opciones[0].clave);
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
              setError("");
            }}
            className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-base font-bold tabular-nums text-[#111827] outline-none sm:max-w-[220px]"
            style={{ borderColor: montoMal ? "#DC2626" : undefined }}
          />
          <span className={`block text-[12px] ${montoMal ? "text-[#B91C1C]" : "text-[#6B7280]"}`}>
            {montoMal || `De ${bs(opcion.monto)} a ${bs(opcion.montoMaximo!)}. Lo que pagues se descuenta de tus cuotas.`}
          </span>
        </label>
      )}

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
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#D1D5DB] bg-[#F9FAFB] text-sm font-semibold text-[#374151] hover:bg-white disabled:opacity-60"
          >
            <Icon name="camara" size={18} />
            {procesando ? "Preparando la foto…" : "Subir foto o captura del comprobante"}
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
          className="flex min-h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold text-white disabled:opacity-60"
          style={{ background: color, boxShadow: "0 2px 6px rgba(15, 23, 42, 0.18)" }}
        >
          {enviando ? "Enviando…" : `Ya pagué ${bs(aPagar)}: enviar comprobante`}
        </button>
        <p className="text-center text-[12px] text-[#6B7280]">El instituto lo revisa y te avisa por WhatsApp. Si el pago no figura, tu deuda sigue igual y podés subir otro.</p>
      </div>
    </section>
  );
}
