import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Captcha from "../../publico/Captcha";
import { apiAcademiaPublica } from "../../lib/academia/apiPublica";
import { limitesFechaNacimiento } from "../../lib/academia/formato";
import type { InscripcionDeMiCuenta } from "../../lib/academia/tipos";
import { paleta } from "../../lib/pagina/aspecto";
import { urlPaginaDe } from "../../lib/pagina/rutas";
import { usePaginaPublica } from "../../lib/pagina/usePaginaPublica";
import { siteKeyTurnstile } from "../../lib/turnstile";
import { Icon } from "../../components/Icon";
import { NoDisponible } from "./PaginaPublica";
import { MarcaBamarDev } from "./VistaPagina";

const INPUT =
  "w-full rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-base text-[#111827] outline-none focus:border-[#6B7280]";

/**
 * M5 · Pagar mi inscripción (`/p/<sub>/mi-cuenta`): el estudiante entra con su
 * carnet y su fecha de nacimiento (sin cuenta, sin contraseña) y la página lo
 * lleva al mismo estado de cuenta del enlace que manda la recepción
 * (`/pagar/<token>`), donde ve lo que debe y paga. Con más de una inscripción
 * vigente, elige cuál.
 *
 * Si los datos no coinciden, el mensaje es siempre el mismo: la página no
 * dice si el carnet existe. Con Turnstile (cuando el build trae la clave) y
 * un tope de intentos del lado del servidor.
 */
export default function MiCuentaPagina() {
  const { subdominio = "" } = useParams();
  const sub = subdominio.toLowerCase();
  const { pagina, error: errorPagina } = usePaginaPublica(sub);
  const navigate = useNavigate();
  const [ci, setCi] = useState("");
  const [fecha, setFecha] = useState("");
  const siteKey = siteKeyTurnstile();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [varias, setVarias] = useState<InscripcionDeMiCuenta[] | null>(null);
  const limites = limitesFechaNacimiento();

  if (errorPagina) return <NoDisponible mensaje={errorPagina} />;
  if (!pagina) return <div style={{ minHeight: "100dvh", background: "#F6F7F9" }} aria-busy="true" />;
  const color = paleta(pagina.color.hex).oscuro;
  const enlace = (token: string) => `${urlPaginaDe(sub)}/pagar/${encodeURIComponent(token)}`;

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (ci.trim().length < 3) return setError("Escribí tu carnet de identidad.");
    if (!fecha) return setError("Escribí tu fecha de nacimiento.");
    if (siteKey && !captcha) return setError("Completá la verificación anti-robots.");
    setError("");
    setEnviando(true);
    try {
      const r = await apiAcademiaPublica.identificar(sub, { ci: ci.trim(), fechaNacimiento: fecha, ...(siteKey && captcha ? { captcha } : {}) });
      if (r.inscripciones.length === 1) {
        navigate(enlace(r.inscripciones[0].token));
        return;
      }
      setVarias(r.inscripciones);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar. Probá de nuevo.");
      // El token de Turnstile es de un solo uso: el backend ya lo gastó.
      if (siteKey) {
        setCaptcha(null);
        setVueltaCaptcha((v) => v + 1);
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#F6F7F9", fontFamily: "Roboto, system-ui, sans-serif" }}>
      <div className="mx-auto w-full max-w-[480px] px-4 py-6 md:max-w-[920px] md:py-12">
        <header className="mb-4">
          <a
            href={urlPaginaDe(sub)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-semibold text-[#374151] shadow-sm hover:bg-[#F9FAFB]"
          >
            ← {pagina.nombre}
          </a>
        </header>
        {/* En la compu, dos paneles: a la izquierda qué va a pasar (con el color de
            la marca), a la derecha el formulario. En el celular, sólo el formulario. */}
        <main className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <aside className="hidden flex-col justify-between gap-8 p-8 text-white md:flex" style={{ background: color }}>
            <div className="space-y-2">
              <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                <Icon name="qr" size={24} />
              </span>
              <p className="pt-2 text-2xl font-bold leading-tight">Pagá tu inscripción sin hacer fila</p>
              <p className="text-sm text-white/80">Desde el celular o la compu, a cualquier hora. {pagina.nombre} confirma tu pago y te avisa por WhatsApp.</p>
            </div>
            <ol className="space-y-3">
              {["Entrá con tu carnet y tu fecha de nacimiento", "Elegí qué pagar: todo, el mes o la próxima cuota", "Pagá con el QR y subí tu comprobante"].map((paso, i) => (
                <li key={paso} className="flex items-start gap-3 text-sm">
                  <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-white/90">{paso}</span>
                </li>
              ))}
            </ol>
          </aside>
          <div className="space-y-5 p-5 md:p-8">
          {varias ? (
            <>
              <div>
                <h1 className="text-xl font-bold text-[#111827]">Elegí cuál querés pagar</h1>
                <p className="text-[13px] text-[#6B7280]">Tenés más de una inscripción en {pagina.nombre}.</p>
              </div>
              <ul className="space-y-2">
                {varias.map((i) => (
                  <li key={i.token}>
                    <Link
                      to={enlace(i.token)}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] px-3.5 py-3 hover:bg-[#F9FAFB]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[#111827]">{i.curso}</span>
                        <span className="block truncate text-[13px] text-[#4B5563]">
                          {i.grupo} · Sede {i.sede}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[12px] font-semibold text-[#374151]">
                        {i.estado === "PREINSCRITA" ? "Preinscrito" : "Inscrito"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <form onSubmit={(e) => void entrar(e)} className="space-y-4" noValidate>
              <div>
                <h1 className="text-xl font-bold text-[#111827]">Pagar mi inscripción</h1>
                <p className="text-[13px] text-[#6B7280]">
                  Entrá con tu carnet y tu fecha de nacimiento: ves lo que te corresponde pagar y pagás desde el celular, a cualquier hora.
                </p>
              </div>
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-[#374151]">Carnet de identidad</span>
                <input value={ci} onChange={(e) => setCi(e.target.value)} inputMode="numeric" autoComplete="off" className={INPUT} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-[#374151]">Fecha de nacimiento</span>
                <input type="date" value={fecha} min={limites.min} max={limites.max} onChange={(e) => setFecha(e.target.value)} className={INPUT} />
              </label>
              {siteKey && <Captcha key={vueltaCaptcha} siteKey={siteKey} onToken={setCaptcha} />}
              {error && (
                <p role="alert" className="rounded-xl bg-[#FEE2E2] px-3.5 py-2.5 text-sm text-[#B91C1C]">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={enviando}
                className="w-full rounded-xl py-3.5 text-[15px] font-semibold text-white disabled:opacity-60"
                style={{ background: color, boxShadow: "0 2px 6px rgba(15, 23, 42, 0.18)" }}
              >
                {enviando ? "Buscando…" : "Ver lo que debo"}
              </button>
              <p className="text-center text-[12px] text-[#6B7280]">¿Todavía no te inscribiste? Elegí tu curso en la página y preinscribite.</p>
            </form>
          )}
          </div>
        </main>
        <a href="https://bamardev.com" className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[#6B7280]">
          <MarcaBamarDev />
          Powered by BamarDev
        </a>
      </div>
    </div>
  );
}
