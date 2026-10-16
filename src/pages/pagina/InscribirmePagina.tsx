import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import Captcha from "../../publico/Captcha";
import { apiAcademiaPublica, ErrorPublico } from "../../lib/academia/apiPublica";
import { fechaCorta, horarioGrupo, MAYORIA_DE_EDAD } from "../../lib/academia/formato";
import type { CursoPublico, PreinscripcionEnviada } from "../../lib/academia/tipos";
import { paleta } from "../../lib/pagina/aspecto";
import { enlaceWhatsapp } from "../../lib/pagina/catalogo";
import { urlPaginaDe, urlPrivacidadDe } from "../../lib/pagina/rutas";
import { usePaginaPublica } from "../../lib/pagina/usePaginaPublica";
import { siteKeyTurnstile } from "../../lib/turnstile";
import { NoDisponible } from "./PaginaPublica";
import { MarcaBamarDev } from "./VistaPagina";

/**
 * P2 · Preinscribirme y P3 · Preinscripción enviada (PLAN-ACADEMIAS-TECNICO
 * §9), en `/p/<sub>/inscribirme/<grupo>` (y `link…/<sub>/inscribirme/<grupo>`).
 * Sin pago: el horario, el nombre, el WhatsApp y la edad; si es menor, el
 * tutor (obligatorio); un mensaje opcional, la privacidad del negocio y la
 * verificación anti-robots, como la reserva online. La respuesta es la misma
 * haya o no cupo (antiabuso): siempre "te escribimos por WhatsApp".
 */
export default function InscribirmePagina() {
  const { subdominio = "", grupoId } = useParams();
  const sub = subdominio.toLowerCase();
  const { pagina, error: errorPagina } = usePaginaPublica(sub);
  const [cursos, setCursos] = useState<CursoPublico[] | null>(null);
  const [errorCursos, setErrorCursos] = useState("");

  useEffect(() => {
    let vivo = true;
    apiAcademiaPublica
      .cursos(sub)
      .then((c) => vivo && setCursos(c))
      .catch((e: unknown) => vivo && setErrorCursos(e instanceof Error ? e.message : "No se pudo cargar"));
    return () => {
      vivo = false;
    };
  }, [sub]);

  const id = Number(grupoId);
  const curso = useMemo(() => cursos?.find((c) => c.grupos.some((g) => g.id === id)) ?? null, [cursos, id]);
  const [enviada, setEnviada] = useState<{ nombre: string; r: PreinscripcionEnviada } | null>(null);

  useEffect(() => {
    if (curso && pagina) document.title = `Preinscribirme · ${curso.nombre} · ${pagina.nombre}`;
  }, [curso, pagina]);

  if (errorPagina && !cursos) return <NoDisponible mensaje={errorPagina} />;
  if (errorCursos) return <NoDisponible mensaje="Esta preinscripción no está disponible" />;
  if (!cursos || !pagina) return <div style={{ minHeight: "100dvh", background: "#F6F7F9" }} aria-busy="true" />;
  if (!curso) return <NoDisponible mensaje="Este grupo ya no recibe preinscripciones" />;

  const c = paleta(pagina.color.hex);
  return (
    <div style={{ minHeight: "100dvh", background: "#F6F7F9", fontFamily: "Roboto, system-ui, sans-serif" }}>
      <div className="mx-auto w-full max-w-[480px] px-4 py-6">
        <header className="mb-4 flex items-center gap-3">
          <a href={urlPaginaDe(sub)} className="text-[13px] text-[#4B5563] hover:underline">
            ← {pagina.nombre}
          </a>
        </header>
        <main className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          {enviada ? (
            <Enviada
              nombre={enviada.nombre}
              r={enviada.r}
              color={c.oscuro}
              whatsapp={enlaceWhatsapp(pagina)?.url ?? null}
              urlPagina={urlPaginaDe(sub)}
            />
          ) : (
            <Formulario
              sub={sub}
              negocio={pagina.nombre}
              curso={curso}
              grupoInicial={id}
              color={c.oscuro}
              onEnviada={(nombre, r) => setEnviada({ nombre, r })}
            />
          )}
        </main>
        <a
          href="https://bamardev.com"
          className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[#6B7280]"
        >
          <MarcaBamarDev />
          Powered by BamarDev
        </a>
      </div>
    </div>
  );
}

function Formulario({
  sub,
  negocio,
  curso,
  grupoInicial,
  color,
  onEnviada,
}: {
  sub: string;
  negocio: string;
  curso: CursoPublico;
  grupoInicial: number;
  color: string;
  onEnviada: (nombre: string, r: PreinscripcionEnviada) => void;
}) {
  const [grupoId, setGrupoId] = useState(grupoInicial);
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [telefono, setTelefono] = useState("");
  const [edad, setEdad] = useState("");
  const [tutor, setTutor] = useState({ nombre: "", telefono: "" });
  const [mensaje, setMensaje] = useState("");
  const [privacidad, setPrivacidad] = useState(false);
  const [pideTutor, setPideTutor] = useState(false);
  const siteKey = siteKeyTurnstile();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const edadN = edad.trim() === "" ? null : Number(edad);
  const esMenor = pideTutor || (edadN != null && edadN < MAYORIA_DE_EDAD);

  const faltan: string[] = [];
  if (!nombres.trim() || !apellidos.trim()) faltan.push("tu nombre y apellidos");
  if (telefono.replace(/\D/g, "").length < 7) faltan.push("tu WhatsApp");
  if (edadN == null || !Number.isFinite(edadN) || edadN < 5 || edadN > 99) faltan.push("tu edad");
  if (esMenor && (!tutor.nombre.trim() || tutor.telefono.replace(/\D/g, "").length < 7)) faltan.push("los datos de tu tutor");
  if (!privacidad) faltan.push("aceptar la política de privacidad");
  if (siteKey && !captcha) faltan.push("completar la verificación anti-robots");

  async function enviar() {
    if (faltan.length) return setError(`Falta ${faltan.join(", ")}.`);
    setError("");
    setEnviando(true);
    try {
      const r = await apiAcademiaPublica.preinscribir(sub, {
        grupoId,
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        telefono: telefono.trim(),
        edad: edadN!,
        ...(esMenor ? { tutor: { nombre: tutor.nombre.trim(), telefono: tutor.telefono.trim() } } : {}),
        ...(mensaje.trim() ? { mensaje: mensaje.trim() } : {}),
        privacidad: true,
        ...(siteKey && captcha ? { captcha } : {}),
      });
      onEnviada(nombres.trim().split(" ")[0], r);
    } catch (e) {
      if (e instanceof ErrorPublico && e.codigo === "TUTOR_REQUERIDO") {
        setPideTutor(true);
        setError("Sos menor de edad: completá los datos de tu madre, padre o tutor.");
      } else {
        setError(e instanceof Error ? e.message : "No se pudo enviar. Probá de nuevo.");
      }
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
    <div className="space-y-5">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6B7280]">{negocio} · Preinscribirme</p>
        <h1 className="mt-1 text-xl font-bold text-[#111827]">{curso.nombre}</h1>
        <p className="text-sm text-[#4B5563]">
          {curso.horasTotales} h{curso.desde != null ? ` · desde Bs ${curso.desde.toLocaleString("es-BO")}` : ""}
        </p>
      </div>

      {curso.grupos.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-[#111827]">¿Qué horario preferís?</legend>
          {curso.grupos.map((g) => {
            const elegido = g.id === grupoId;
            return (
              <label
                key={g.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3"
                style={{ borderColor: elegido ? color : "#E5E7EB", background: elegido ? "#F9FAFB" : "#ffffff" }}
              >
                <input type="radio" name="grupo" checked={elegido} onChange={() => setGrupoId(g.id)} className="mt-1" style={{ accentColor: color }} />
                <span>
                  <span className="block text-sm font-semibold text-[#111827]">
                    {horarioGrupo(g)} · {g.sede.nombre}
                  </span>
                  <span className="block text-[13px] text-[#6B7280]">
                    Empieza el {fechaCorta(g.fechaInicio)}
                    {g.cuposLibres != null ? (g.cuposLibres > 0 ? ` · quedan ${g.cuposLibres} cupos` : " · lleno, te anotamos igual") : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-3">
        <CampoP etiqueta="Nombres">
          <input value={nombres} onChange={(e) => setNombres(e.target.value)} autoComplete="given-name" className={INPUT} />
        </CampoP>
        <CampoP etiqueta="Apellidos">
          <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} autoComplete="family-name" className={INPUT} />
        </CampoP>
        <CampoP etiqueta="WhatsApp">
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" autoComplete="tel" className={INPUT} />
        </CampoP>
        <CampoP etiqueta="Edad">
          <input value={edad} onChange={(e) => setEdad(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" className={INPUT} />
        </CampoP>
      </div>

      {esMenor && (
        <div className="space-y-3 rounded-xl bg-[#FFFBEB] p-3.5">
          <p className="text-sm font-semibold text-[#92400E]">Sos menor de edad: datos de tu madre, padre o tutor</p>
          <CampoP etiqueta="Nombre del tutor">
            <input value={tutor.nombre} onChange={(e) => setTutor({ ...tutor, nombre: e.target.value })} className={INPUT} />
          </CampoP>
          <CampoP etiqueta="WhatsApp del tutor">
            <input value={tutor.telefono} onChange={(e) => setTutor({ ...tutor, telefono: e.target.value })} inputMode="tel" className={INPUT} />
          </CampoP>
        </div>
      )}

      <CampoP etiqueta="¿Algo que quieras preguntar? (opcional)">
        <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value.slice(0, 500))} rows={3} className={`${INPUT} resize-y`} />
      </CampoP>

      <label className="flex items-start gap-2 text-[13px] text-[#374151]">
        <input type="checkbox" checked={privacidad} onChange={(e) => setPrivacidad(e.target.checked)} className="mt-0.5" style={{ accentColor: color }} />
        <span>
          Acepto la{" "}
          <a href={urlPrivacidadDe(sub)} target="_blank" rel="noreferrer" className="underline">
            política de privacidad
          </a>{" "}
          de {negocio} y que me escriban por WhatsApp sobre esta preinscripción.
        </span>
      </label>

      {siteKey && <Captcha key={vueltaCaptcha} siteKey={siteKey} onToken={setCaptcha} />}

      {error && (
        <p role="alert" className="rounded-xl bg-[#FEE2E2] px-3.5 py-2.5 text-sm text-[#B91C1C]">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void enviar()}
        disabled={enviando}
        className="w-full rounded-xl py-3.5 text-[15px] font-semibold text-white disabled:opacity-60"
        style={{ background: color }}
      >
        {enviando ? "Enviando…" : "Enviar preinscripción"}
      </button>
      <p className="text-center text-[13px] text-[#6B7280]">No pagás nada ahora. Te escribimos para confirmar tu lugar.</p>
    </div>
  );
}

function Enviada({
  nombre,
  r,
  color,
  whatsapp,
  urlPagina,
}: {
  nombre: string;
  r: PreinscripcionEnviada;
  color: string;
  whatsapp: string | null;
  urlPagina: string;
}) {
  const boton: CSSProperties = { background: color };
  return (
    <div className="space-y-5 text-center">
      <div>
        <h1 className="text-xl font-bold text-[#111827]">¡Listo, {nombre}!</h1>
        <p className="mt-1 text-sm text-[#4B5563]">Recibimos tu preinscripción. Te vamos a escribir por WhatsApp para confirmar tu lugar.</p>
      </div>
      <dl className="space-y-2 rounded-xl bg-[#F9FAFB] p-4 text-left text-sm">
        <Fila etiqueta="Grupo">{r.grupo.nombre}</Fila>
        <Fila etiqueta="Empieza">{fechaCorta(r.grupo.fechaInicio)}</Fila>
        <Fila etiqueta="Sede">{r.grupo.sede}</Fila>
        {r.grupo.direccion && <Fila etiqueta="Dirección">{r.grupo.direccion}</Fila>}
      </dl>
      <p className="text-left text-[13px] text-[#4B5563]">Para inscribirte, vení con tu carnet de identidad (y el de tu tutor, si sos menor).</p>
      <div className="flex flex-col gap-2">
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-xl py-3 text-[15px] font-semibold text-white" style={boton}>
            Escribirnos por WhatsApp
          </a>
        )}
        <a href={urlPagina} className="rounded-xl border border-[#E5E7EB] py-3 text-[15px] font-semibold text-[#374151]">
          Ver otros cursos
        </a>
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-base text-[#111827] outline-none focus:border-[#6B7280]";

function CampoP({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-semibold text-[#374151]">{etiqueta}</span>
      {children}
    </label>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#6B7280]">{etiqueta}</dt>
      <dd className="text-right font-semibold text-[#111827]">{children}</dd>
    </div>
  );
}
