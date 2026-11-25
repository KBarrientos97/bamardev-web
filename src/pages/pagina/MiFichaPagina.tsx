import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import Captcha from "../../publico/Captcha";
import { Chips } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { conUnidad, fechaLarga, type CampoControl } from "../../lib/nutricion/calculo";
import { apiConsultaNutricion, type ConsultaPaciente } from "../../lib/nutricion/consulta";
import { bajarPdfEvaluacion, documentoEvaluacion } from "../../lib/nutricion/pdfEvaluacion";
import { DEL_GRAFICO, MEDIDAS } from "../../lib/nutricion/planilla";
import { escalonesDeLaSemana, nombreSemana, semanaCorta, textoKg, textoKgTotal, textoProducto } from "../../lib/nutricion/seguimiento/formato";
import { bajarPdfSeguimiento, documentoSeguimiento, dosisParaPdf } from "../../lib/nutricion/seguimiento/pdf";
import type { HojaPaciente, Tratamiento } from "../../lib/nutricion/seguimiento/tipos";
import type { Paciente } from "../../lib/nutricion/tipos";
import { paleta } from "../../lib/pagina/aspecto";
import { urlPaginaDe } from "../../lib/pagina/rutas";
import { usePaginaPublica } from "../../lib/pagina/usePaginaPublica";
import { siteKeyTurnstile } from "../../lib/turnstile";
import { useApi } from "../../lib/useApi";
import { KpiTarjeta, Tarjeta } from "../academia/piezas";
import GraficoEvolucion from "../nutricion/GraficoEvolucion";
import { Evolucion, FichaLectura, ImcDeHoy, Planilla, Resumen } from "../nutricion/PlanillaPaciente";
import { NoDisponible } from "./PaginaPublica";
import { MarcaBamarDev } from "./VistaPagina";

const INPUT =
  "w-full rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-base text-[#111827] outline-none focus:border-[#6B7280]";
/** El verde de nutrición, si el consultorio no tiene página publicada (de ahí sale su color). */
const VERDE = "#047857";

/**
 * «Consultar mi ficha» (`/p/<sub>/mi-ficha`, rubro NUTRICION, 25-nov-2026):
 * el paciente entra con su carnet (sólo con él, decisión del dueño) y ve, de
 * SÓLO LECTURA, su evaluación (cómo está hoy, la evolución, sus controles y su
 * ficha) y su seguimiento semana a semana, y baja los dos PDF: los mismos que
 * la nutricionista le manda por WhatsApp.
 *
 * El seguimiento llega sin pagos (el backend los saca). Lo que se consultó
 * vive sólo en la memoria de la pestaña: no se guarda en el navegador y
 * «Salir» lo borra. Si el carnet no lleva a nada, el mensaje es siempre el
 * mismo (la página no dice quién se atiende acá). Con Turnstile cuando el
 * build trae la clave y topes de intentos del lado del servidor.
 *
 * Anda aunque la página del consultorio no esté publicada: la nutricionista
 * puede mandar este enlace directo. Lo cierra el interruptor de los ajustes.
 */
export default function MiFichaPagina() {
  const { subdominio = "" } = useParams();
  const sub = subdominio.toLowerCase();
  const info = useApi(() => apiConsultaNutricion.info(sub), [sub]);
  // La página publicada sólo da el color y el «← volver»: sin ella, igual se consulta.
  const { pagina } = usePaginaPublica(sub);
  const [ci, setCi] = useState("");
  const siteKey = siteKeyTurnstile();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState<ConsultaPaciente | null>(null);

  if (info.error && !info.datos) return <NoDisponible mensaje="Esta consulta no está disponible." />;
  if (!info.datos) return <div style={{ minHeight: "100dvh", background: "#F6F7F9" }} aria-busy="true" />;
  const nombre = info.datos.negocio;
  const color = pagina ? paleta(pagina.color.hex).oscuro : VERDE;

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (ci.trim().length < 3) return setError("Escribí tu carnet de identidad.");
    if (siteKey && !captcha) return setError("Completá la verificación anti-robots.");
    setError("");
    setEnviando(true);
    try {
      setDatos(await apiConsultaNutricion.consultar(sub, { ci: ci.trim(), ...(siteKey && captcha ? { captcha } : {}) }));
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
    <div style={{ minHeight: "100dvh", background: "#F6F7F9", fontFamily: "Roboto, system-ui, sans-serif" }}>
      <div className={`mx-auto w-full px-4 py-6 md:py-10 ${datos ? "max-w-[1100px]" : "max-w-[480px] md:max-w-[920px]"}`}>
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {pagina ? (
            <a
              href={urlPaginaDe(sub)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-semibold text-[#374151] shadow-sm hover:bg-[#F9FAFB]"
            >
              ← {nombre}
            </a>
          ) : (
            <span className="text-[13px] font-semibold text-[#374151]">{nombre}</span>
          )}
          {datos && (
            <button
              type="button"
              onClick={() => {
                setDatos(null);
                setError("");
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-semibold text-[#374151] shadow-sm hover:bg-[#F9FAFB]"
            >
              <Icon name="logout" size={15} />
              Salir
            </button>
          )}
        </header>
        {datos ? (
          <Ficha datos={datos} color={color} />
        ) : (
          <main className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <aside className="hidden flex-col justify-between gap-8 p-8 text-white md:flex" style={{ background: color }}>
              <div className="space-y-2">
                <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <Icon name="evaluacion" size={24} />
                </span>
                <p className="pt-2 text-2xl font-bold leading-tight">Tu evaluación y tu seguimiento, cuando quieras</p>
                <p className="text-sm text-white/80">Mirá cómo venís desde el celular o la compu y bajá tus planillas en PDF.</p>
              </div>
              <ol className="space-y-3">
                {["Entrá con tu carnet", "Mirá tu evolución, tus controles y tus semanas", "Bajá el PDF de tu evaluación o de tu tratamiento"].map((paso, i) => (
                  <li key={paso} className="flex items-start gap-3 text-sm">
                    <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-white/90">{paso}</span>
                  </li>
                ))}
              </ol>
            </aside>
            <form onSubmit={(e) => void entrar(e)} className="space-y-4 p-5 md:p-8" noValidate>
              <div>
                <h1 className="text-xl font-bold text-[#111827]">Consultar mi ficha</h1>
                <p className="text-[13px] text-[#6B7280]">Entrá con tu carnet para ver tu evaluación y tu seguimiento en {nombre}. Es sólo para mirar: los cambios los hace tu nutricionista.</p>
              </div>
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
              <p className="text-center text-[12px] text-[#6B7280]">Si cerrás o salís, para volver a mirar hay que escribir el carnet de nuevo.</p>
            </form>
          </main>
        )}
        <a href="https://bamardev.com" className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[#6B7280]">
          <MarcaBamarDev />
          Powered by BamarDev
        </a>
      </div>
    </div>
  );
}

type Vista = "evaluacion" | "seguimiento";

/** Lo consultado: las dos pestañas, la evaluación y el seguimiento, de sólo lectura. */
function Ficha({ datos, color }: { datos: ConsultaPaciente; color: string }) {
  const tratamientos = datos.seguimiento.tratamientos;
  const [vista, setVista] = useState<Vista>("evaluacion");
  // El PDF lleva el mismo `Paciente` de la planilla de la app; el id del cliente no se usa.
  const p: Paciente = { ...datos.paciente, clienteId: 0 };
  const datosPersona = [
    p.ci ? `CI ${p.ci}${p.ciExpedido ? ` ${p.ciExpedido}` : ""}` : null,
    p.edad != null ? `${p.edad} años` : null,
    p.sexo === "F" ? "Mujer" : p.sexo === "M" ? "Hombre" : null,
  ].filter(Boolean);

  return (
    <main className="space-y-5">
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm md:p-6">
        <p className="text-[12px] font-semibold uppercase tracking-wide" style={{ color }}>
          {datos.negocio}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#111827]">{p.nombre}</h1>
        {datosPersona.length > 0 && <p className="mt-0.5 text-[13px] text-[#6B7280]">{datosPersona.join(" · ")}</p>}
        {tratamientos.length > 0 && (
          <div className="mt-4" role="tablist" aria-label="Qué mirar">
            <Chips<Vista>
              valor={vista}
              onChange={setVista}
              opciones={[
                ["evaluacion", "Evaluación"],
                ["seguimiento", tratamientos.length > 1 ? "Tratamientos" : "Tratamiento"],
              ]}
            />
          </div>
        )}
      </section>
      {vista === "evaluacion" || !tratamientos.length ? (
        <Evaluacion datos={datos} paciente={p} />
      ) : (
        <Seguimiento datos={datos} paciente={p} />
      )}
    </main>
  );
}

/** Un botón «Descargar PDF» con su aviso. */
function BotonPdf({ etiqueta, bajar }: { etiqueta: string; bajar: () => Promise<unknown> }) {
  const [armando, setArmando] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={armando}
        onClick={async () => {
          setArmando(true);
          setError("");
          try {
            await bajar();
          } catch {
            setError("No se pudo armar el PDF. Probá de nuevo.");
          } finally {
            setArmando(false);
          }
        }}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-borde bg-white px-4 text-sm font-semibold text-texto-2 transition-colors hover:bg-muted disabled:opacity-60"
      >
        <Icon name="download" size={16} />
        {armando ? "Armando el PDF…" : etiqueta}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger-text">
          {error}
        </span>
      )}
    </span>
  );
}

function Evaluacion({ datos, paciente: p }: { datos: ConsultaPaciente; paciente: Paciente }) {
  const cat = datos.catalogo;
  const [medida, setMedida] = useState<CampoControl>("pesoKg");
  const sinNada = p.controles.length === 0 && !p.pesos?.length;
  return (
    <>
      {sinNada ? (
        <Tarjeta titulo="Tu evaluación">
          <p className="py-6 text-center text-sm text-texto-3">Todavía no hay controles cargados.</p>
        </Tarjeta>
      ) : (
        <>
          <Resumen paciente={p} catalogo={cat} />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-6">
            <Tarjeta
              titulo="Evolución"
              barra={
                <div className="py-3 [&_button]:min-h-11 lg:[&_button]:min-h-0">
                  <Chips<CampoControl> envolver valor={medida} onChange={setMedida} opciones={DEL_GRAFICO.map((c) => [c, MEDIDAS[c].corto] as const)} />
                </div>
              }
            >
              <Evolucion paciente={p} medida={MEDIDAS[medida]} />
            </Tarjeta>
            <ImcDeHoy paciente={p} catalogo={cat} />
          </div>
          <Tarjeta
            titulo="Controles"
            contador={p.controles.length}
            acciones={<BotonPdf etiqueta="Descargar PDF" bajar={() => bajarPdfEvaluacion(documentoEvaluacion({ negocio: datos.negocio, paciente: p, catalogo: cat }))} />}
            sinRelleno
          >
            {p.controles.length ? (
              <Planilla controles={p.controles} catalogo={cat} />
            ) : (
              <p className="px-5 py-6 text-center text-sm text-texto-3">El peso de cada semana está en tu tratamiento.</p>
            )}
          </Tarjeta>
        </>
      )}
      <FichaLectura paciente={p} catalogo={cat} edita={false} />
    </>
  );
}

function Seguimiento({ datos, paciente: p }: { datos: ConsultaPaciente; paciente: Paciente }) {
  const ts = datos.seguimiento.tratamientos;
  const [elegido, setElegido] = useState(ts[0]?.id ?? 0);
  const t = ts.find((x) => x.id === elegido) ?? ts[0];
  if (!t) return null;
  const catalogo = { ...datos.seguimiento.catalogo, ocultos: datos.seguimiento.catalogo.ocultos ?? [] };
  const hojaPaciente: HojaPaciente["paciente"] = {
    id: p.id,
    nombre: p.nombre,
    ci: p.ci,
    ciExpedido: p.ciExpedido,
    telefono: p.telefono,
    sexo: p.sexo,
    edad: p.edad,
    tallaCm: p.tallaCm,
    activo: p.activo,
  };
  return (
    <>
      {ts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {ts.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={x.id === t.id}
              onClick={() => setElegido(x.id)}
              className={`min-h-10 rounded-full border px-3.5 text-[13px] font-semibold ${
                x.id === t.id ? "border-primary bg-primary-50 text-primary-700" : "border-borde bg-white text-texto-2 hover:bg-muted"
              }`}
            >
              {x.nombre} · {x.estado === "ACTIVO" ? "en curso" : `terminado${x.terminadoEn ? ` el ${fechaLarga(x.terminadoEn)}` : ""}`}
            </button>
          ))}
        </div>
      )}
      <ResumenTratamiento t={t} />
      <PesoPorSemana t={t} />
      <Tarjeta
        titulo={`${t.nombre}: semana a semana`}
        bajada={`Desde el ${fechaLarga(t.inicio)}${t.estado === "TERMINADO" && t.terminadoEn ? ` hasta el ${fechaLarga(t.terminadoEn)}` : ""}`}
        acciones={
          <BotonPdf
            etiqueta="Descargar PDF"
            bajar={() => bajarPdfSeguimiento(documentoSeguimiento({ negocio: datos.negocio, paciente: hojaPaciente, tratamiento: t, catalogo }))}
          />
        }
        sinRelleno
      >
        <ol className="divide-y divide-borde-soft">
          {[...t.registros].reverse().map((r) => {
            const k = textoKg(r.kgSemana);
            const total = textoKgTotal(r.kgBajados);
            return (
              <li key={r.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_7rem_minmax(0,1fr)] sm:gap-4 sm:px-5">
                <div>
                  <p className="text-sm font-semibold text-texto">{nombreSemana(r.semana)}</p>
                  <p className="text-xs text-texto-4">{fechaLarga(r.fecha)}</p>
                </div>
                <div>
                  <p className="text-sm tabular-nums text-texto">{r.pesoKg != null ? conUnidad(r.pesoKg, "kg", 2) : "—"}</p>
                  {k && <p className={`text-xs ${k.tono === "bajo" ? "text-emerald-700" : k.tono === "subio" ? "text-danger-text" : "text-texto-3"}`}>{k.texto} kg</p>}
                  {total && <p className="text-xs text-texto-4">{total}</p>}
                </div>
                <div className="min-w-0 space-y-0.5 text-[13px]">
                  {r.producto && <p className="font-semibold text-texto-2">Desde esta semana: {textoProducto({ nombre: r.producto.nombre, vialMg: r.producto.vialMg ?? null, vialMl: r.producto.vialMl ?? null })}</p>}
                  {r.sinDosis ? (
                    <p className="font-semibold text-warning-text">No se aplicó{r.motivoSinDosis ? `: ${r.motivoSinDosis}` : ""}</p>
                  ) : r.dosis != null ? (
                    <p className="text-texto-2">Dosis: {dosisParaPdf(r, escalonesDeLaSemana(t, r.semana, catalogo))}</p>
                  ) : null}
                  {r.observaciones && <p className="whitespace-pre-line break-words text-texto-3">{r.observaciones}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </Tarjeta>
    </>
  );
}

function ResumenTratamiento({ t }: { t: Tratamiento }) {
  const r = t.resumen;
  const total = textoKg(r.kgBajados);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiTarjeta etiqueta="Peso inicial" valor={r.pesoInicial != null ? conUnidad(r.pesoInicial, "kg", 2) : "—"} />
      <KpiTarjeta etiqueta="Peso actual" valor={r.pesoActual != null ? conUnidad(r.pesoActual, "kg", 2) : "—"} />
      <KpiTarjeta
        etiqueta={total?.tono === "subio" ? "Subió" : "Bajó"}
        valor={total ? `${total.cifra} kg` : "—"}
        tono={total?.tono === "subio" ? "urgente" : "normal"}
        pie={total ? "desde el inicio" : undefined}
      />
      <KpiTarjeta etiqueta="Semana" valor={String(r.semana)} pie={r.ultimaFecha ? `al ${fechaLarga(r.ultimaFecha)}` : undefined} />
    </div>
  );
}

function PesoPorSemana({ t }: { t: Tratamiento }) {
  const puntos = t.registros.flatMap((r) => (r.pesoKg == null ? [] : [{ fecha: r.fecha, valor: r.pesoKg, etiqueta: semanaCorta(r.semana) }]));
  if (puntos.length < 2) return null;
  return (
    <Tarjeta titulo="Peso por semana">
      <GraficoEvolucion puntos={puntos} nombre="Peso" formato={(n) => conUnidad(n, "kg", 2)} />
    </Tarjeta>
  );
}
