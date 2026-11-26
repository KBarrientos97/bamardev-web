import { useState, type FormEvent } from "react";
import Captcha from "../../publico/Captcha";
import { Icon } from "../../components/Icon";
import { apiConsultaNutricion, type ConsultaPaciente } from "../../lib/nutricion/consulta";
import { siteKeyTurnstile } from "../../lib/turnstile";

const INPUT =
  "w-full rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-base text-[#111827] outline-none focus:border-[#6B7280]";

/**
 * El carnet, la verificación anti-robots y «Ver mi ficha». En `/mi-ficha` y,
 * en un consultorio de nutrición, adentro de su página (`enPagina`: con un
 * título que invita, porque ahí el paciente no entró sólo a eso).
 *
 * Aparte de `MiFichaPagina` para que la página pública no arrastre la
 * planilla ni las piezas de la app (separacion.test.ts): la ficha se baja
 * recién cuando alguien consulta.
 */
export default function FormularioConsulta({
  sub,
  nombre,
  color,
  onConsulta,
  enPagina = false,
}: {
  sub: string;
  nombre: string;
  color: string;
  onConsulta: (d: ConsultaPaciente) => void;
  enPagina?: boolean;
}) {
  const [ci, setCi] = useState("");
  const siteKey = siteKeyTurnstile();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (ci.trim().length < 3) return setError("Escribí tu carnet de identidad.");
    if (siteKey && !captcha) return setError("Completá la verificación anti-robots.");
    setError("");
    setEnviando(true);
    try {
      onConsulta(await apiConsultaNutricion.consultar(sub, { ci: ci.trim(), ...(siteKey && captcha ? { captcha } : {}) }));
      setCi("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo consultar. Probá de nuevo.");
    } finally {
      setEnviando(false);
      // El token de Turnstile es de un solo uso: el backend ya lo gastó.
      if (siteKey) {
        setCaptcha(null);
        setVueltaCaptcha((v) => v + 1);
      }
    }
  }

  return (
    <form onSubmit={(e) => void entrar(e)} className="space-y-4 text-left" noValidate>
      {enPagina ? (
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: color }}>
            <Icon name="evaluacion" size={22} />
          </span>
          <div>
            <h2 className="text-lg font-bold leading-tight text-[#111827]">Consultá tu ficha</h2>
            <p className="mt-0.5 text-[13px] text-[#6B7280]">Con tu carnet ves tu evaluación y tu seguimiento, y bajás tus planillas en PDF.</p>
          </div>
        </div>
      ) : (
        <div>
          <h1 className="text-xl font-bold text-[#111827]">Consultar mi ficha</h1>
          <p className="text-[13px] text-[#6B7280]">
            Entrá con tu carnet para ver tu evaluación y tu seguimiento en {nombre}. Es sólo para mirar: los cambios los hace tu nutricionista.
          </p>
        </div>
      )}
      <label className="block">
        <span className="mb-1 block text-[13px] font-semibold text-[#374151]">Carnet de identidad</span>
        <input value={ci} onChange={(e) => setCi(e.target.value)} inputMode="numeric" autoComplete="off" className={INPUT} />
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
        {enviando ? "Buscando…" : "Ver mi ficha"}
      </button>
      <p className="text-center text-[12px] text-[#6B7280]">
        {enPagina ? "Es sólo para mirar: los cambios los hace tu nutricionista." : "Si cerrás o salís, para volver a mirar hay que escribir el carnet de nuevo."}
      </p>
    </form>
  );
}
