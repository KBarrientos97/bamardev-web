import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import Captcha from "../../publico/Captcha";
import { apiAcademiaPublica, ErrorPublico } from "../../lib/academia/apiPublica";
import { fotosQueFaltan, textoFaltanFotos } from "../../lib/academia/fotos";
import {
  diasTexto,
  edadDe,
  EXPEDIDOS,
  fechaCorta,
  limitesFechaNacimiento,
  MAYORIA_DE_EDAD,
  problemaFechaNacimiento,
} from "../../lib/academia/formato";
import type { CursoPublico, FotosInscripcion, GrupoPublico, PreinscripcionEnviada, TipoFoto } from "../../lib/academia/tipos";
import { paleta } from "../../lib/pagina/aspecto";
import { enlaceWhatsapp } from "../../lib/pagina/catalogo";
import { urlPaginaDe, urlPrivacidadDe } from "../../lib/pagina/rutas";
import { usePaginaPublica } from "../../lib/pagina/usePaginaPublica";
import { faltaTexto } from "../../lib/texto";
import { siteKeyTurnstile } from "../../lib/turnstile";
import { Icon } from "../../components/Icon";
import CapturaFotos from "../academia/CapturaFotos";
import { NoDisponible } from "./PaginaPublica";
import { MarcaBamarDev } from "./VistaPagina";

type Paso = 1 | 2 | 3 | 4;
const TITULOS: Record<Paso, string> = { 1: "Curso y horario", 2: "Tus datos", 3: "Fotos", 4: "Pago" };
const NOMBRE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "Martes y jueves", "Lunes a viernes": los días como los dice una persona. */
function diasLargo(dias: number[]): string {
  const corto = diasTexto(dias);
  if (corto.includes("-")) {
    const [a, b] = corto.split("-");
    const i = ["D", "L", "Ma", "Mi", "J", "V", "S"];
    return `${capital(NOMBRE_DIA[i.indexOf(a)] ?? a)} a ${NOMBRE_DIA[i.indexOf(b)] ?? b}`;
  }
  const orden = [...dias].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)).map((d) => NOMBRE_DIA[d]);
  if (orden.length <= 1) return capital(orden[0] ?? "");
  return capital(`${orden.slice(0, -1).join(", ")} y ${orden[orden.length - 1]}`);
}
const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const bs = (n: number) => `Bs ${n.toLocaleString("es-BO")}`;
/** Un fondo apenas teñido con el color de la marca, para lo elegido; gris si el color no es `#RRGGBB`. */
const tinte = (color: string) => (/^#[0-9a-f]{6}$/i.test(color) ? `${color}0F` : "#F9FAFB");

/** El círculo de una opción: lleno con el color de la marca si está elegida. */
function Marca({ on, color }: { on: boolean; color: string }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 bg-white"
      style={{ borderColor: on ? color : "#D1D5DB" }}
    >
      {on && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
    </span>
  );
}

/** Hoy en la hora del celular, `AAAA-MM-DD`. */
function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * P2 · Inscribirme y P3 · Enviada (ronda 2), en `/p/<sub>/inscribirme/<grupo>`
 * (y `link…/<sub>/inscribirme/<grupo>`). En 4 pasos, pensado para el celular:
 * el curso y el horario; los datos como figuran en el carnet (y el tutor si
 * es menor); las 3 fotos obligatorias (D7), con la cámara del celular; y cómo
 * quiere pagar (mes a mes o pago completo, con lo que ahorra).
 *
 * Mientras no exista el QR del banco (D10) no se paga acá: queda como
 * inscripción online y el instituto escribe por WhatsApp para confirmar el
 * lugar. La respuesta es la misma haya o no cupo (antiabuso).
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
  const [enviada, setEnviada] = useState<{ nombre: string; r: PreinscripcionEnviada; curso: CursoPublico; grupo: GrupoPublico | null; forma: string | null; primerPago: number | null } | null>(null);
  /** El backend dijo que el grupo ya no se publica o que la inscripción se apagó. */
  const [cerrada, setCerrada] = useState(false);

  useEffect(() => {
    if (curso && pagina) document.title = `Inscribirme · ${curso.nombre} · ${pagina.nombre}`;
  }, [curso, pagina]);

  // Con la página sin publicar (404) los cursos igual cargan: sin esto la
  // pantalla quedaba en blanco esperando una página que no iba a llegar. Se
  // dice lo mismo que en `/p/<sub>` (QA 23-oct).
  if (errorPagina) return <NoDisponible mensaje={errorPagina} />;
  if (errorCursos) return <NoDisponible mensaje="Esta inscripción no está disponible" />;
  if (!cursos || !pagina) return <div style={{ minHeight: "100dvh", background: "#F6F7F9" }} aria-busy="true" />;
  if (!curso || cerrada) return <NoDisponible mensaje="Este grupo ya no recibe inscripciones" />;

  const c = paleta(pagina.color.hex);
  return (
    <div style={{ minHeight: "100dvh", background: "#F6F7F9", fontFamily: "Roboto, system-ui, sans-serif" }}>
      <div className="mx-auto w-full max-w-[480px] px-4 py-6">
        <header className="mb-4 flex items-center gap-3">
          <a
            href={urlPaginaDe(sub)}
            aria-label="Volver a los cursos"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-semibold text-[#374151] shadow-sm hover:bg-[#F9FAFB]"
          >
            ← {pagina.nombre}
          </a>
        </header>
        <main className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
          {enviada ? (
            <Enviada
              {...enviada}
              color={c.oscuro}
              whatsapp={enlaceWhatsapp(pagina)?.url ?? null}
              urlPagina={urlPaginaDe(sub)}
            />
          ) : (
            <Formulario
              sub={sub}
              negocio={pagina.nombre}
              cursos={cursos.filter((x) => x.grupos.length > 0)}
              cursoInicial={curso}
              grupoInicial={id}
              color={c.oscuro}
              onEnviada={setEnviada}
              onCerrada={() => setCerrada(true)}
            />
          )}
        </main>
        <a href="https://bamardev.com" className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[#6B7280]">
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
  cursos,
  cursoInicial,
  grupoInicial,
  color,
  onEnviada,
  onCerrada,
}: {
  sub: string;
  negocio: string;
  cursos: CursoPublico[];
  cursoInicial: CursoPublico;
  grupoInicial: number;
  color: string;
  onEnviada: (e: { nombre: string; r: PreinscripcionEnviada; curso: CursoPublico; grupo: GrupoPublico | null; forma: string | null; primerPago: number | null }) => void;
  onCerrada: () => void;
}) {
  const [paso, setPaso] = useState<Paso>(1);
  const [cursoId, setCursoId] = useState(cursoInicial.id);
  const [grupoId, setGrupoId] = useState<number | null>(grupoInicial);
  const [datos, setDatos] = useState({ ci: "", ciExpedido: "SC", apellidos: "", nombres: "", fechaNacimiento: "", telefono: "" });
  const [tutor, setTutor] = useState({ nombre: "", telefono: "" });
  const [fotos, setFotos] = useState<FotosInscripcion>({});
  const [marcadas, setMarcadas] = useState<TipoFoto[]>([]);
  const [planId, setPlanId] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [privacidad, setPrivacidad] = useState(false);
  const [pideTutor, setPideTutor] = useState(false);
  const [telefonoMal, setTelefonoMal] = useState(false);
  const siteKey = siteKeyTurnstile();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const curso = cursos.find((x) => x.id === cursoId) ?? cursoInicial;
  const grupo = curso.grupos.find((g) => g.id === grupoId) ?? null;
  const modulos = curso.modulos?.length ? curso.modulos : curso.materias;
  const planes = curso.planes ?? [];
  const mesAMes = planes.find((x) => x.generado === "MES_A_MES");
  const plan = planes.find((x) => x.id === planId) ?? mesAMes ?? planes[0] ?? null;
  // L4: una fecha imposible (futura, o de más de 100 años) se dice en el campo
  // y no deja seguir. Antes pasaba, y el backend contestaba «Sos menor de edad».
  const fechaMal = problemaFechaNacimiento(datos.fechaNacimiento);
  const limitesFecha = limitesFechaNacimiento();
  const edad = fechaMal ? null : edadDe(datos.fechaNacimiento);
  const esMenor = pideTutor || (edad != null && edad < MAYORIA_DE_EDAD);
  const faltanFotos = fotosQueFaltan(fotos);

  /** Lo que no deja seguir en cada paso, dicho en una línea. */
  function motivo(p: Paso): string {
    if (p === 1) return grupo ? "" : "Elegí un horario para seguir";
    if (p === 2) {
      const f: string[] = [];
      if (!datos.ci.trim()) f.push("tu carnet");
      if (!datos.apellidos.trim() || !datos.nombres.trim()) f.push("tu nombre y apellidos");
      if (!datos.fechaNacimiento) f.push("tu fecha de nacimiento");
      if (datos.telefono.replace(/\D/g, "").length < 7) f.push("tu WhatsApp");
      if (esMenor && (!tutor.nombre.trim() || tutor.telefono.replace(/\D/g, "").length < 7)) f.push("los datos de tu tutor");
      return f.length ? faltaTexto(f) : fechaMal;
    }
    if (p === 3) return faltanFotos.length ? textoFaltanFotos(faltanFotos.length) : "";
    const f: string[] = [];
    if (!privacidad) f.push("aceptar la política de privacidad");
    if (siteKey && !captcha) f.push("completar la verificación anti-robots");
    return f.length ? `Falta ${f.join(", ")}` : "";
  }
  const bloqueo = motivo(paso);

  async function enviar() {
    if (bloqueo) return setError(`${bloqueo}.`);
    setError("");
    setEnviando(true);
    try {
      const r = await apiAcademiaPublica.preinscribir(
        sub,
        {
          grupoId: grupoId!,
          nombres: datos.nombres.trim(),
          apellidos: datos.apellidos.trim(),
          telefono: datos.telefono.trim(),
          fechaNacimiento: datos.fechaNacimiento,
          ...(edad != null ? { edad } : {}),
          ci: datos.ci.trim(),
          ciExpedido: datos.ciExpedido,
          ...(esMenor ? { tutor: { nombre: tutor.nombre.trim(), telefono: tutor.telefono.trim() } } : {}),
          ...(plan ? { planPagoId: plan.id } : {}),
          ...(mensaje.trim() ? { mensaje: mensaje.trim() } : {}),
          privacidad: true,
          ...(siteKey && captcha ? { captcha } : {}),
        },
        fotos,
      );
      const primerPago = plan?.generado === "COMPLETO" ? (curso.precioCompleto ?? null) : (curso.precioModulo ?? null);
      onEnviada({
        nombre: datos.nombres.trim().split(" ")[0],
        r,
        curso,
        grupo,
        forma: plan ? (plan.generado === "MES_A_MES" ? "Mes a mes" : plan.generado === "COMPLETO" ? "Pago completo" : plan.nombre) : null,
        primerPago,
      });
    } catch (e) {
      const codigo = e instanceof ErrorPublico ? e.codigo : undefined;
      if (codigo === "TUTOR_REQUERIDO") {
        setPideTutor(true);
        setPaso(2);
        setError("Sos menor de edad: completá los datos de tu madre, padre o tutor.");
      } else if (codigo === "FOTOS_REQUERIDAS" && e instanceof ErrorPublico) {
        const faltan = Array.isArray(e.detalle.faltan) ? (e.detalle.faltan as TipoFoto[]) : [];
        setMarcadas(faltan);
        setPaso(3);
        setError(faltan.length ? `${textoFaltanFotos(faltan.length)}: sacalas de nuevo.` : e.message);
      } else if (codigo === "GRUPO_NO_DISPONIBLE" || codigo === "PREINSCRIPCION_NO_DISPONIBLE") {
        onCerrada();
        return;
      } else if (codigo === "TELEFONO_INVALIDO") {
        setTelefonoMal(true);
        setPaso(2);
        setError(e instanceof Error ? e.message : "Revisá el número de WhatsApp.");
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

  const boton = { background: color, boxShadow: "0 2px 6px rgba(15, 23, 42, 0.18)" };
  return (
    <div>
      {/* Los pasos en su banda, arriba de la tarjeta: dónde está y cuánto falta. */}
      <div className="border-b border-[#E5E7EB] bg-[#F9FAFB] px-5 py-4">
        <div className="flex items-baseline justify-between gap-2 text-[12px] text-[#6B7280]">
          <span className="font-semibold uppercase tracking-wide">
            {negocio} · Paso {paso} de 4
          </span>
          <span className="font-semibold text-[#111827]">{TITULOS[paso]}</span>
        </div>
        <div role="progressbar" aria-label="Avance de la inscripción" aria-valuemin={1} aria-valuemax={4} aria-valuenow={paso} className="mt-2 flex gap-1">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i <= paso ? color : "#E5E7EB" }} />
          ))}
        </div>
      </div>

      <div className="space-y-5 p-5">

        {paso === 1 && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-[#111827]">¿Qué querés estudiar?</h1>
            {cursos.length > 1 && (
              <div role="radiogroup" aria-label="Curso" className="flex flex-wrap gap-2">
                {cursos.map((x) => {
                  const on = x.id === cursoId;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setCursoId(x.id);
                        setGrupoId(x.grupos[0]?.id ?? null);
                        setPlanId(null);
                      }}
                      className="min-h-10 rounded-full border px-3.5 py-1.5 text-sm"
                      style={on ? { borderColor: color, color, fontWeight: 600, background: tinte(color) } : { borderColor: "#E5E7EB", color: "#374151", background: "#ffffff" }}
                    >
                      {x.nombre}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="space-y-0.5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-sm">
              <p className="font-semibold text-[#111827]">
                {curso.nombre}
                {modulos.length ? ` · ${modulos.length} ${modulos.length === 1 ? "módulo" : "módulos"}` : ""}
              </p>
              {modulos.length > 0 && <p className="text-[#4B5563]">{modulos.join(" · ")}</p>}
              {curso.precioModulo != null && (
                <p className="pt-1 text-[#4B5563]">
                  <strong className="text-[#111827]">{bs(curso.precioModulo)}</strong> por módulo · cada módulo dura un mes
                </p>
              )}
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold text-[#111827]">Elegí tu horario</legend>
              {curso.grupos.map((g) => {
                const on = g.id === grupoId;
                const empezo = g.fechaInicio <= hoyLocal();
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setGrupoId(g.id)}
                    className="flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left"
                    style={{ borderColor: on ? color : "#E5E7EB", borderWidth: on ? 2 : 1, background: on ? tinte(color) : "#ffffff" }}
                  >
                    <Marca on={on} color={color} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#111827]">{diasLargo(g.dias)}</span>
                      <span className="block text-[13px] text-[#4B5563]">
                        {g.horaInicio} a {g.horaFin} · Sede {g.sede.nombre}
                      </span>
                      <span className="block text-[13px] text-[#6B7280]">
                        {empezo ? `Empezó el ${fechaCorta(g.fechaInicio)}` : `Empieza el ${fechaCorta(g.fechaInicio)}`}
                      </span>
                    </span>
                    {g.cuposLibres != null && (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                          g.cuposLibres > 0 ? "border border-[#E5E7EB] bg-white text-[#4B5563]" : "bg-[#FEE2E2] text-[#B91C1C]"
                        }`}
                      >
                        {g.cuposLibres > 0 ? `${g.cuposLibres} libres` : "lleno"}
                      </span>
                    )}
                  </button>
                );
              })}
            </fieldset>
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-[#111827]">Tus datos</h1>
              <p className="text-[13px] text-[#6B7280]">Como figuran en tu carnet.</p>
            </div>
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <CampoP etiqueta="Carnet de identidad">
                <input value={datos.ci} onChange={(e) => setDatos({ ...datos, ci: e.target.value })} inputMode="numeric" className={INPUT} />
              </CampoP>
              <CampoP etiqueta="Expedido">
                <select value={datos.ciExpedido} onChange={(e) => setDatos({ ...datos, ciExpedido: e.target.value })} className={INPUT}>
                  {EXPEDIDOS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </CampoP>
            </div>
            <CampoP etiqueta="Apellidos">
              <input value={datos.apellidos} onChange={(e) => setDatos({ ...datos, apellidos: e.target.value })} autoComplete="family-name" className={INPUT} />
            </CampoP>
            <CampoP etiqueta="Nombres">
              <input value={datos.nombres} onChange={(e) => setDatos({ ...datos, nombres: e.target.value })} autoComplete="given-name" className={INPUT} />
            </CampoP>
            <div className="grid grid-cols-2 gap-3">
              <CampoP etiqueta="Fecha de nacimiento" error={fechaMal}>
                <input
                  type="date"
                  value={datos.fechaNacimiento}
                  min={limitesFecha.min}
                  max={limitesFecha.max}
                  onChange={(e) => setDatos({ ...datos, fechaNacimiento: e.target.value })}
                  aria-invalid={!!fechaMal || undefined}
                  className={`${INPUT} ${fechaMal ? "border-[#B91C1C]" : ""}`}
                />
              </CampoP>
              <CampoP etiqueta="WhatsApp">
                <input
                  value={datos.telefono}
                  onChange={(e) => {
                    setDatos({ ...datos, telefono: e.target.value });
                    setTelefonoMal(false);
                  }}
                  inputMode="tel"
                  autoComplete="tel"
                  aria-invalid={telefonoMal || undefined}
                  className={`${INPUT} ${telefonoMal ? "border-[#B91C1C]" : ""}`}
                />
              </CampoP>
            </div>
            {esMenor && (
              <fieldset className="space-y-3 rounded-xl bg-[#FFFBEB] p-3.5">
                <legend className="sr-only">Datos del tutor</legend>
                <p className="text-sm font-semibold text-[#92400E]">
                  {edad != null ? `Tenés ${edad} años: ` : "Sos menor de edad: "}datos de tu madre, padre o tutor
                </p>
                <CampoP etiqueta="Nombre del tutor">
                  <input value={tutor.nombre} onChange={(e) => setTutor({ ...tutor, nombre: e.target.value })} className={INPUT} />
                </CampoP>
                <CampoP etiqueta="Su WhatsApp">
                  <input value={tutor.telefono} onChange={(e) => setTutor({ ...tutor, telefono: e.target.value })} inputMode="tel" className={INPUT} />
                </CampoP>
              </fieldset>
            )}
          </div>
        )}

        {paso === 3 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-[#111827]">Tus fotos</h1>
              <p className="text-[13px] text-[#6B7280]">
                Son obligatorias: las necesitamos para emitir tu certificado y confirmar que sos vos. Sólo las ve la dirección del instituto.
              </p>
            </div>
            <CapturaFotos
              fotos={fotos}
              onCambiar={(f) => {
                setFotos(f);
                setMarcadas((m) => m.filter((t) => !f[t]));
              }}
              marcadas={marcadas}
              compacto
              color={color}
            />
            <p className="text-[13px] text-[#6B7280]">"Tomar foto" abre la cámara de tu celular.</p>
          </div>
        )}

        {paso === 4 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-[#111827]">¿Cómo querés pagar?</h1>
              <p className="text-[13px] text-[#6B7280]">
                {curso.nombre}
                {grupo ? ` · ${diasLargo(grupo.dias).toLowerCase()}, ${grupo.horaInicio} a ${grupo.horaFin} · Sede ${grupo.sede.nombre}` : ""}
              </p>
            </div>
            {planes.length > 0 && (
              <div role="radiogroup" aria-label="Forma de pago" className="space-y-2">
                {planes.map((pl) => {
                  const on = plan?.id === pl.id;
                  const n = modulos.length;
                  const [titulo, monto, linea, detalle] =
                    pl.generado === "MES_A_MES" && curso.precioModulo != null
                      ? ["Mes a mes", bs(curso.precioModulo), `${bs(curso.precioModulo)} por módulo (${n} ${n === 1 ? "cuota" : "cuotas"})`, "El primero al empezar; los demás vencen al empezar cada módulo"]
                      : pl.generado === "COMPLETO" && curso.precioCompleto != null
                        ? ["Pago completo", bs(curso.precioCompleto), curso.ahorro ? `Ahorrás ${bs(curso.ahorro)}` : "", `Un solo pago que cubre ${n === 1 ? "el módulo" : `los ${n} módulos`}`]
                        : [pl.nombre, "", "", ""];
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPlanId(pl.id)}
                      className="flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left"
                      style={{ borderColor: on ? color : "#E5E7EB", borderWidth: on ? 2 : 1, background: on ? tinte(color) : "#ffffff" }}
                    >
                      <Marca on={on} color={color} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-bold text-[#111827]">{titulo}</span>
                          <span className="text-base font-bold text-[#111827]">{monto}</span>
                        </span>
                        {linea &&
                          (pl.generado === "COMPLETO" ? (
                            <span className="mt-1 inline-block rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[12px] font-semibold text-[#047857]">{linea}</span>
                          ) : (
                            <span className="block text-[13px] text-[#4B5563]">{linea}</span>
                          ))}
                        {detalle && <span className="block text-[13px] text-[#6B7280]">{detalle}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <CampoP etiqueta="¿Algo que quieras preguntar? (opcional)">
              <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value.slice(0, 500))} rows={2} className={`${INPUT} resize-y`} />
            </CampoP>
            <label className="flex items-start gap-2 text-[13px] text-[#374151]">
              <input type="checkbox" checked={privacidad} onChange={(e) => setPrivacidad(e.target.checked)} className="mt-0.5" style={{ accentColor: color }} />
              <span>
                Acepto la{" "}
                <a href={urlPrivacidadDe(sub)} target="_blank" rel="noreferrer" className="underline">
                  política de privacidad
                </a>{" "}
                de {negocio} y que me escriban por WhatsApp.
              </span>
            </label>
            {siteKey && <Captcha key={vueltaCaptcha} siteKey={siteKey} onToken={setCaptcha} />}
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-[#FEE2E2] px-3.5 py-2.5 text-sm text-[#B91C1C]">
            {error}
          </p>
        )}

        <div className="space-y-2">
          <div className="flex gap-2">
            {paso > 1 && (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setPaso((paso - 1) as Paso);
                }}
                className="rounded-xl border border-[#D1D5DB] bg-white px-4 py-3.5 text-[15px] font-semibold text-[#374151] hover:bg-[#F9FAFB]"
              >
                Atrás
              </button>
            )}
            {paso < 4 ? (
              <button
                type="button"
                disabled={!!bloqueo}
                aria-describedby="motivo-paso"
                onClick={() => {
                  setError("");
                  setPaso((paso + 1) as Paso);
                }}
                className="flex-1 rounded-xl py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
                style={boton}
              >
                Siguiente
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void enviar()}
                disabled={enviando}
                className="flex-1 rounded-xl py-3.5 text-[15px] font-semibold text-white disabled:opacity-60"
                style={boton}
              >
                {enviando ? "Enviando…" : "Enviar inscripción"}
              </button>
            )}
          </div>
          <p id="motivo-paso" className="text-center text-[13px] text-[#6B7280]">
            {paso < 4 ? bloqueo : "Pagás en el instituto: te escribimos por WhatsApp para confirmar tu lugar."}
          </p>
        </div>
      </div>
    </div>
  );
}

function Enviada({
  nombre,
  r,
  curso,
  grupo,
  forma,
  primerPago,
  color,
  whatsapp,
  urlPagina,
}: {
  nombre: string;
  r: PreinscripcionEnviada;
  curso: CursoPublico;
  grupo: GrupoPublico | null;
  forma: string | null;
  primerPago: number | null;
  color: string;
  whatsapp: string | null;
  urlPagina: string;
}) {
  const n = (curso.modulos?.length ? curso.modulos : curso.materias).length;
  return (
    <div className="space-y-5 p-5">
      <div className="text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-white"
          style={{ background: color, boxShadow: `0 0 0 6px ${tinte(color)}` }}
        >
          <Icon name="check" size={28} />
        </span>
        <h1 className="text-xl font-bold text-[#111827]">¡Listo, {nombre}!</h1>
        <p className="mt-1 text-sm text-[#4B5563]">Recibimos tu inscripción. Te vamos a escribir por WhatsApp para confirmar tu lugar.</p>
      </div>
      <dl aria-label="Tu inscripción" className="divide-y divide-[#E5E7EB] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-1 text-sm">
        <Fila etiqueta="Curso">
          {curso.nombre}
          {n ? ` · ${n} ${n === 1 ? "módulo" : "módulos"}` : ""}
        </Fila>
        {grupo && (
          <Fila etiqueta="Horario">
            {diasLargo(grupo.dias)} · {grupo.horaInicio} a {grupo.horaFin}
          </Fila>
        )}
        <Fila etiqueta="Empieza">
          {fechaCorta(r.grupo.fechaInicio)} · Sede {r.grupo.sede}
        </Fila>
        {forma && <Fila etiqueta="Forma de pago">{forma}</Fila>}
      </dl>
      {primerPago != null && (
        <section
          aria-label="Tu primer pago"
          className="space-y-1.5 rounded-xl border-2 p-4 text-sm"
          style={{ borderColor: color, background: tinte(color) }}
        >
          <p className="flex items-baseline justify-between gap-3">
            <span className="font-semibold text-[#111827]">Tu primer pago</span>
            <span className="text-xl font-bold text-[#111827]">{bs(primerPago)}</span>
          </p>
          <p className="text-[13px] text-[#4B5563]">
            Pagalo en la sede {r.grupo.sede}
            {r.grupo.direccion ? `, ${r.grupo.direccion}` : ""}. Llevá tu carnet (y el de tu tutor, si sos menor).
          </p>
        </section>
      )}
      <p className="text-[13px] text-[#4B5563]">Cuando estés inscrito te mandamos por WhatsApp el enlace a tu estado de cuenta: ahí ves siempre lo que pagaste y lo que falta.</p>
      <div className="flex flex-col gap-2">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl py-3.5 text-center text-[15px] font-semibold text-white"
            style={{ background: color, boxShadow: "0 2px 6px rgba(15, 23, 42, 0.18)" }}
          >
            Escribirnos por WhatsApp
          </a>
        )}
        <a href={urlPagina} className="rounded-xl border border-[#D1D5DB] bg-white py-3.5 text-center text-[15px] font-semibold text-[#374151] hover:bg-[#F9FAFB]">
          Ver otros cursos
        </a>
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-base text-[#111827] outline-none focus:border-[#6B7280]";

function CampoP({ etiqueta, error, children }: { etiqueta: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-semibold text-[#374151]">{etiqueta}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-[#B91C1C]">{error}.</span>}
    </label>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-2.5">
      <dt className="shrink-0 text-[#6B7280]">{etiqueta}</dt>
      <dd className="text-right font-semibold text-[#111827]">{children}</dd>
    </div>
  );
}
