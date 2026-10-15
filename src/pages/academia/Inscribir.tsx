import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Chips } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { Boton, Campo, Cargando, Confirmar, ErrorMsg, Input, Select } from "../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../lib/academia/apiAcademia";
import {
  calendarioConDescuento,
  edadDe,
  EXPEDIDOS,
  fechaCorta,
  horarioGrupo,
  MAYORIA_DE_EDAD,
  nombreAlumno,
  nombreDe,
  PARENTESCOS,
  textoCubre,
  textoVence,
} from "../../lib/academia/formato";
import type {
  AlumnoFila,
  DescuentoInput,
  GrupoResumen,
  InscripcionDetalle,
  PlanPago,
  Preinscripcion,
  TipoDescuento,
} from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { enlaceWhatsApp } from "../../lib/agenda/recordatorio";
import { ApiError } from "../../lib/api";
import { fmtMoney } from "../../lib/format";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { PedirPinCredito } from "../pos/PantallaCredito";
import { abrirWhatsapp } from "../../lib/academia/vista";

export interface ResultadoInscripcion {
  inscripcion: Pick<InscripcionDetalle, "id"> & Partial<InscripcionDetalle>;
  /** "Inscribir y cobrar ahora": quien abrió el panel lleva al POS. */
  cobrar: boolean;
}

type Modo = "buscar" | "nuevo";

/**
 * E5 · Inscribir alumno (PLAN-ACADEMIAS §5): ¿quién?, ¿a qué grupo?, ¿cómo
 * paga? y, si hace falta, la beca o la promoción. Panel de 440 px sobre la
 * pantalla en escritorio; pantalla completa en el celular.
 *
 * Desde una preinscripción (E20) el alumno y el grupo ya vienen: sólo se
 * elige el plan, y "convertir" la deja inscrita.
 *
 * Lo que decide es el backend: el menor sin tutor (400 TUTOR_REQUERIDO), el
 * grupo lleno (409 GRUPO_LLENO, se confirma y se reintenta) y el descuento
 * sobre el tope (403 DESCUENTO_REQUIERE_AUTORIZACION, se pide el PIN como en
 * el fiado). Acá se recalcula el calendario a la vista, nada más.
 */
export default function Inscribir({
  grupoInicial,
  alumnoInicial,
  preinscripcion,
  onCerrar,
  onInscrito,
}: {
  grupoInicial?: Pick<GrupoResumen, "id" | "nombre"> & Partial<GrupoResumen>;
  alumnoInicial?: { id: number; nombre: string; menor?: boolean };
  preinscripcion?: Preinscripcion;
  onCerrar: () => void;
  onInscrito: (r: ResultadoInscripcion) => void;
}) {
  const p = usePalabras();
  const { usuario } = useAuth();
  const puedeBecas = tienePermiso(usuario, "academia.becas");

  // ── ¿Quién? ──
  const [modo, setModo] = useState<Modo>("buscar");
  const [q, setQ] = useState("");
  const [elegido, setElegido] = useState<{ id: number; nombre: string; telefono?: string | null } | null>(
    alumnoInicial ? { id: alumnoInicial.id, nombre: alumnoInicial.nombre } : null,
  );
  const [nuevo, setNuevo] = useState({ ci: "", ciExpedido: "SC", apellidos: "", nombres: "", fechaNacimiento: "", telefono: "" });
  const [tutor, setTutor] = useState({ nombre: "", parentesco: "Madre", telefono: "" });
  /** El backend dijo que es menor y no tiene tutor: el bloque aparece aunque no lo supiéramos. */
  const [pideTutor, setPideTutor] = useState(false);

  // ── ¿A qué grupo? ──
  const [grupoId, setGrupoId] = useState<number | null>(preinscripcion?.grupo.id ?? grupoInicial?.id ?? null);
  const fijoGrupo = !!preinscripcion || !!grupoInicial;
  const grupos = useApi(
    () => (fijoGrupo ? Promise.resolve(null) : apiAcademia.grupos({ pageSize: 100 })),
    [fijoGrupo],
  );
  const abiertos = (grupos.datos?.items ?? []).filter((g) => g.estado !== "TERMINADO" && g.inscripcionAbierta);
  const detalle = useApi(() => (grupoId ? apiAcademia.grupo(grupoId) : Promise.resolve(null)), [grupoId]);
  const grupo = detalle.datos;

  // ── ¿Cómo paga? ──
  const planes = (grupo?.planesOfrecidos ?? []).filter((x) => x.activo !== false);
  const [planId, setPlanId] = useState<number | null>(null);
  useEffect(() => {
    // Un solo plan: viene elegido. Con varios, la secretaría elige.
    if (planes.length === 1 && planId == null) setPlanId(planes[0].id);
  }, [planes, planId]);
  const plan = planes.find((x) => x.id === planId) ?? null;

  // ── Beca o promoción ──
  const [tipoDesc, setTipoDesc] = useState<"" | TipoDescuento>("");
  const [enPct, setEnPct] = useState(true);
  const [valorDesc, setValorDesc] = useState("");
  const [motivo, setMotivo] = useState("");
  const [firma, setFirma] = useState<{ username: string; pin: string } | null>(null);
  const ajustes = useApi(() => apiAcademia.ajustes().catch(() => null), []);

  const [bienvenida, setBienvenida] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [pidiendoPin, setPidiendoPin] = useState<null | ((f: { username: string; pin: string }) => void)>(null);
  const [lleno, setLleno] = useState<{ inscritos: number; cupo: number; seguir: () => void } | null>(null);

  const edad = edadDe(nuevo.fechaNacimiento);
  // Menor por la fecha de nacimiento que se está cargando, o porque el
  // backend lo dijo (un alumno ya cargado, sin tutor).
  const esMenor = pideTutor || (modo === "nuevo" && !elegido && edad != null && edad < MAYORIA_DE_EDAD);

  const vista = useMemo(() => calendarioConDescuento(plan, tipoDesc, enPct, Number(valorDesc) || 0), [plan, tipoDesc, enPct, valorDesc]);
  const sobreTope =
    !!tipoDesc && vista.pct > (ajustes.datos?.topePromoSinPinPct ?? Number.POSITIVE_INFINITY) && !puedeBecas;

  const nombreFinal = preinscripcion
    ? nombreAlumno(preinscripcion.alumno)
    : elegido?.nombre ?? (nuevo.apellidos || nuevo.nombres ? nombreAlumno(nuevo) : "");

  function faltantes(): string | null {
    if (!preinscripcion && !elegido) {
      if (modo === "buscar") return `Elegí al ${p.alumno} o cargá uno nuevo.`;
      if (!nuevo.ci.trim()) return "Falta el carnet de identidad.";
      if (!nuevo.apellidos.trim() || !nuevo.nombres.trim()) return "Faltan los apellidos y los nombres.";
    }
    if (esMenor && (!tutor.nombre.trim() || !tutor.telefono.trim())) return `Es menor: falta el tutor (nombre y WhatsApp).`;
    if (!grupoId) return "Elegí el grupo.";
    if (!plan) return "Elegí cómo paga.";
    if (tipoDesc && !(Number(valorDesc) > 0)) return "Poné el descuento, o elegí Ninguna.";
    if (tipoDesc && motivo.trim().length < 3) return "Contá el motivo del descuento.";
    return null;
  }

  async function enviar(cobrar: boolean, extra: { sobreCupo?: boolean; firma?: { username: string; pin: string } } = {}) {
    const falta = faltantes();
    if (falta) return setError(falta);
    const autorizador = extra.firma ?? firma ?? undefined;
    // Sobre el tope y sin el permiso: el PIN se pide antes de mandar.
    if (sobreTope && !autorizador) {
      setPidiendoPin(() => (f: { username: string; pin: string }) => {
        setFirma(f);
        void enviar(cobrar, { ...extra, firma: f });
      });
      return;
    }
    const descuento: DescuentoInput | undefined = tipoDesc
      ? {
          tipo: tipoDesc,
          ...(enPct ? { pct: Number(valorDesc) } : { monto: Number(valorDesc) }),
          motivo: motivo.trim(),
          ...(autorizador ? { autorizador } : {}),
        }
      : undefined;
    setError("");
    setEnviando(true);
    try {
      const inscripcion = preinscripcion
        ? await apiAcademia.convertir(preinscripcion.id, { planPagoId: plan!.id, ...(descuento ? { descuento } : {}) })
        : await apiAcademia.inscribir({
            ...(elegido ? { alumnoId: elegido.id } : {
              alumno: {
                ci: nuevo.ci.trim(),
                ...(nuevo.ciExpedido ? { ciExpedido: nuevo.ciExpedido } : {}),
                apellidos: nuevo.apellidos.trim(),
                nombres: nuevo.nombres.trim(),
                ...(nuevo.fechaNacimiento ? { fechaNacimiento: nuevo.fechaNacimiento } : {}),
                ...(nuevo.telefono.trim() ? { telefono: nuevo.telefono.trim() } : {}),
              },
            }),
            ...(esMenor && tutor.nombre.trim()
              ? { tutor: { nombre: tutor.nombre.trim(), telefono: tutor.telefono.trim(), parentesco: tutor.parentesco } }
              : {}),
            grupoId: grupoId!,
            planPagoId: plan!.id,
            ...(descuento ? { descuento } : {}),
            ...(extra.sobreCupo ? { confirmarSobreCupo: true } : {}),
          });
      if (bienvenida) mandarBienvenida();
      onInscrito({ inscripcion, cobrar });
    } catch (e) {
      const codigo = e instanceof ApiError ? e.codigo : undefined;
      if (codigo === CODIGOS_ACADEMIA.GRUPO_LLENO && e instanceof ApiError) {
        setLleno({
          inscritos: Number(e.detalle.inscritos ?? 0),
          cupo: Number(e.detalle.cupo ?? 0),
          seguir: () => void enviar(cobrar, { ...extra, sobreCupo: true }),
        });
      } else if (codigo === CODIGOS_ACADEMIA.TUTOR_REQUERIDO) {
        setPideTutor(true);
        setError(`Es menor de edad: cargá al tutor para inscribirlo.`);
      } else if (codigo === CODIGOS_ACADEMIA.DESCUENTO_REQUIERE_AUTORIZACION) {
        setFirma(null);
        setPidiendoPin(() => (f: { username: string; pin: string }) => {
          setFirma(f);
          void enviar(cobrar, { ...extra, firma: f });
        });
      } else {
        setError(e instanceof Error ? e.message : "No se pudo inscribir");
      }
    } finally {
      setEnviando(false);
    }
  }

  /** La bienvenida por wa.me (PA §9): al tutor si lo hay, si no al alumno. */
  function mandarBienvenida() {
    const telefono = esMenor ? tutor.telefono : preinscripcion?.alumno.telefono ?? elegido?.telefono ?? nuevo.telefono;
    if (!telefono || !grupo) return;
    const nombre = esMenor ? tutor.nombre.split(" ")[0] : nombreFinal.split(",").pop()?.trim().split(" ")[0] ?? "";
    const texto = `Hola ${nombre}, ¡bienvenido/a a ${nombreDe(grupo.carrera)}! Empezás el ${fechaCorta(grupo.fechaInicio)}, ${horarioGrupo(grupo)}, en ${nombreDe(grupo.sede)}.`;
    const url = enlaceWhatsApp(telefono, texto);
    if (url) abrirWhatsapp(url);
  }

  const primera = vista.cuotas[0]?.monto ?? 0;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/30"
      onMouseDown={(e) => e.target === e.currentTarget && !enviando && onCerrar()}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Inscribir ${p.alumno}`}
        className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-[440px] sm:border-l sm:border-borde"
      >
        <header className="flex items-start justify-between gap-3 border-b border-borde-soft px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-texto">Inscribir {p.alumno}</h2>
            {grupo && <p className="text-[13px] text-texto-3">{p.Sede} {nombreDe(grupo.sede)}</p>}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-2 text-texto-3 hover:bg-muted">
            <Icon name="close" size={19} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5">
          <Paso n={1} titulo="¿Quién?">
            {preinscripcion ? (
              <p className="text-sm">
                <span className="font-semibold text-texto">{nombreFinal}</span>
                {preinscripcion.alumno.telefono && <span className="text-texto-3"> · {preinscripcion.alumno.telefono}</span>}
                {preinscripcion.tutor && (
                  <span className="block text-[13px] text-texto-3">Tutor: {preinscripcion.tutor.nombre}</span>
                )}
              </p>
            ) : elegido ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-borde px-3.5 py-2.5">
                <span className="text-sm font-semibold text-texto">{elegido.nombre}</span>
                {!alumnoInicial && (
                  <button type="button" onClick={() => setElegido(null)} className="text-xs font-semibold text-texto-2 underline">
                    Cambiar
                  </button>
                )}
              </div>
            ) : modo === "buscar" ? (
              <BuscarAlumno
                q={q}
                onQ={setQ}
                onElegir={(a) => setElegido({ id: a.id, nombre: nombreAlumno(a), telefono: a.telefono })}
                onNuevo={(texto) => {
                  setModo("nuevo");
                  if (/^\d{5,}$/.test(texto.trim())) setNuevo((n) => ({ ...n, ci: texto.trim() }));
                }}
                palabra={p.alumno}
              />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_90px] gap-2">
                  {/* El CI es texto: nunca más "6.642E+09" (PA §5, E5). */}
                  <Campo label="Carnet de identidad">
                    <Input value={nuevo.ci} inputMode="numeric" onChange={(e) => setNuevo({ ...nuevo, ci: e.target.value })} />
                  </Campo>
                  <Campo label="Expedido">
                    <Select value={nuevo.ciExpedido} onChange={(e) => setNuevo({ ...nuevo, ciExpedido: e.target.value })}>
                      {EXPEDIDOS.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </Select>
                  </Campo>
                </div>
                <Campo label="Apellidos">
                  <Input value={nuevo.apellidos} onChange={(e) => setNuevo({ ...nuevo, apellidos: e.target.value })} />
                </Campo>
                <Campo label="Nombres">
                  <Input value={nuevo.nombres} onChange={(e) => setNuevo({ ...nuevo, nombres: e.target.value })} />
                </Campo>
                <div className="grid grid-cols-2 gap-2">
                  <Campo label="Fecha de nacimiento" hint={edad != null ? `${edad} años` : undefined}>
                    <Input type="date" value={nuevo.fechaNacimiento} onChange={(e) => setNuevo({ ...nuevo, fechaNacimiento: e.target.value })} />
                  </Campo>
                  <Campo label="Teléfono (opcional)">
                    <Input inputMode="tel" value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} />
                  </Campo>
                </div>
                <button type="button" onClick={() => setModo("buscar")} className="text-xs font-semibold text-texto-2 underline">
                  Buscar uno que ya está cargado
                </button>
              </div>
            )}

            {esMenor && !preinscripcion && (
              <div className="mt-4 space-y-3 rounded-xl border border-warning-text/30 bg-warning-bg/40 p-3.5">
                <p className="text-sm font-semibold text-warning-text">
                  Tutor · obligatorio{edad != null && edad < MAYORIA_DE_EDAD ? ` (menor · ${edad} años)` : ""}
                </p>
                <Campo label="Nombre del tutor">
                  <Input value={tutor.nombre} onChange={(e) => setTutor({ ...tutor, nombre: e.target.value })} />
                </Campo>
                <div className="grid grid-cols-2 gap-2">
                  <Campo label="Parentesco">
                    <Select value={tutor.parentesco} onChange={(e) => setTutor({ ...tutor, parentesco: e.target.value })}>
                      {PARENTESCOS.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </Select>
                  </Campo>
                  <Campo label="WhatsApp">
                    <Input inputMode="tel" value={tutor.telefono} onChange={(e) => setTutor({ ...tutor, telefono: e.target.value })} />
                  </Campo>
                </div>
              </div>
            )}
          </Paso>

          <Paso n={2} titulo="¿A qué grupo?">
            {fijoGrupo ? (
              grupo ? (
                <TarjetaGrupo g={grupo} />
              ) : (
                <p className="text-sm text-texto-2">{preinscripcion?.grupo.nombre ?? grupoInicial?.nombre}</p>
              )
            ) : grupos.cargando ? (
              <Cargando />
            ) : abiertos.length === 0 ? (
              <p className="text-sm text-texto-3">No hay grupos con la inscripción abierta.</p>
            ) : (
              <Select
                aria-label="Grupo"
                value={grupoId ?? ""}
                onChange={(e) => {
                  setGrupoId(e.target.value ? Number(e.target.value) : null);
                  setPlanId(null);
                }}
              >
                <option value="">Elegí el grupo…</option>
                {abiertos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {nombreDe(g.carrera)} · {horarioGrupo(g)} · {nombreDe(g.sede)}
                    {g.cupo ? ` · ${g.inscritos}/${g.cupo}` : ""}
                  </option>
                ))}
              </Select>
            )}
            {!fijoGrupo && grupo && <div className="mt-3"><TarjetaGrupo g={grupo} /></div>}
          </Paso>

          <Paso n={3} titulo="¿Cómo paga?">
            {!grupoId ? (
              <p className="text-sm text-texto-3">Primero el grupo.</p>
            ) : detalle.cargando ? (
              <Cargando />
            ) : planes.length === 0 ? (
              <p className="text-sm text-texto-3">Este grupo no tiene planes de pago.</p>
            ) : (
              <div className="space-y-2" role="radiogroup" aria-label="Plan de pago">
                {planes.map((pl) => (
                  <TarjetaPlan key={pl.id} plan={pl} elegido={pl.id === planId} onElegir={() => setPlanId(pl.id)} />
                ))}
              </div>
            )}
          </Paso>

          <Paso n={4} titulo="Beca o promoción">
            <Chips
              valor={tipoDesc}
              opciones={[
                ["", "Ninguna"],
                ["BECA", "Beca"],
                ["PROMOCION", "Promoción"],
              ]}
              onChange={(v) => {
                setTipoDesc(v);
                setFirma(null);
              }}
            />
            {tipoDesc && (
              <div className="mt-3 space-y-3">
                <div className="flex items-end gap-2">
                  <Campo label="Descuento">
                    <Input type="number" value={valorDesc} onChange={(e) => { setValorDesc(e.target.value); setFirma(null); }} />
                  </Campo>
                  <div className="pb-0.5">
                    <Chips
                      valor={enPct ? "pct" : "bs"}
                      opciones={[
                        ["pct", "%"],
                        ["bs", "Bs"],
                      ]}
                      onChange={(v) => { setEnPct(v === "pct"); setFirma(null); }}
                    />
                  </div>
                </div>
                <Campo label="Motivo">
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipoDesc === "BECA" ? "Ej.: rendimiento, situación económica" : "Ej.: promoción de inicio"} />
                </Campo>
                {firma ? (
                  <p className="text-[13px] text-texto-3">Autorizó {firma.username} con su PIN.</p>
                ) : sobreTope ? (
                  <p className="text-[13px] text-warning-text">Pasa el tope sin autorización: al inscribir se pide el PIN.</p>
                ) : null}
              </div>
            )}
          </Paso>

          {plan && (
            <section aria-label="Resumen" className="space-y-2 border-t border-borde-soft pt-4">
              <h3 className="text-sm font-bold text-texto">Resumen</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between text-texto-2">
                  <dt>
                    {p.Carrera} ({plan.nombre})
                  </dt>
                  <dd className="tabular-nums">{fmtMoney(plan.total)}</dd>
                </div>
                {vista.descuento > 0 && (
                  <div className="flex justify-between text-texto-2">
                    <dt>
                      {tipoDesc === "BECA" ? "Beca" : "Promoción"} {Math.round(vista.pct * 10) / 10} %
                    </dt>
                    <dd className="tabular-nums">− {fmtMoney(vista.descuento)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-borde-soft pt-1 font-bold text-texto">
                  <dt>Total del curso</dt>
                  <dd className="tabular-nums">{fmtMoney(vista.total)}</dd>
                </div>
              </dl>
              <ul className="space-y-1 pt-1 text-[13px] text-texto-3">
                {vista.cuotas.map((c) => (
                  <li key={c.n} className="flex justify-between gap-2">
                    <span>
                      Cuota {c.n} · {textoCubre(c.cubre)} · {textoVence(c.vence)}
                    </span>
                    <span className="tabular-nums text-texto-2">{fmtMoney(c.monto)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ErrorMsg>{error}</ErrorMsg>
        </div>

        <footer className="space-y-2 border-t border-borde-soft px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <label className="flex items-center gap-2 text-[13px] text-texto-2">
            <input type="checkbox" checked={bienvenida} onChange={(e) => setBienvenida(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary-boton)]" />
            Enviar bienvenida por WhatsApp{esMenor ? " al tutor" : ""}
          </label>
          <Boton className="w-full" disabled={enviando} onClick={() => void enviar(true)}>
            {enviando ? "Inscribiendo…" : plan ? `Inscribir y cobrar ${fmtMoney(primera)}` : "Inscribir y cobrar"}
          </Boton>
          <Boton variante="ghost" className="w-full" disabled={enviando} onClick={() => void enviar(false)}>
            Inscribir sin cobrar
          </Boton>
        </footer>
      </aside>

      {pidiendoPin && (
        <PedirPinCredito
          subtitulo="El descuento pasa el tope que se da sin autorización"
          onCancelar={() => setPidiendoPin(null)}
          onFirmar={(username, pin) => {
            const seguir = pidiendoPin;
            setPidiendoPin(null);
            seguir({ username, pin });
          }}
        />
      )}
      <Confirmar
        abierto={!!lleno}
        titulo="El grupo está lleno"
        texto={lleno ? `Tiene ${lleno.inscritos} inscritos y el cupo es de ${lleno.cupo}. ¿Lo inscribís igual?` : ""}
        etiquetaOk="Inscribir igual"
        onCancel={() => setLleno(null)}
        onOk={() => {
          const seguir = lleno?.seguir;
          setLleno(null);
          seguir?.();
        }}
      />
    </div>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-bold text-texto">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 text-xs text-primary-700">{n}</span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function TarjetaGrupo({ g }: { g: GrupoResumen }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-borde px-3.5 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-texto">
          {nombreDe(g.carrera)} · {horarioGrupo(g)}
        </span>
        <span className="block text-[13px] text-texto-3">
          {nombreDe(g.sede)} · empieza {fechaCorta(g.fechaInicio)}
          {g.materiaActual?.docente ? ` · ${g.materiaActual.docente}` : ""}
        </span>
      </span>
      {g.cupo != null && (
        <span className={`shrink-0 text-sm tabular-nums ${g.inscritos >= g.cupo ? "font-semibold text-warning-text" : "text-texto-2"}`}>
          {g.inscritos} / {g.cupo}
        </span>
      )}
    </div>
  );
}

function TarjetaPlan({ plan, elegido, onElegir }: { plan: PlanPago; elegido: boolean; onElegir: () => void }) {
  const cuotas = plan.calendario;
  const resumen =
    cuotas.length === 1
      ? "1 pago al inscribirse"
      : cuotas.every((c) => c.monto === cuotas[0].monto)
        ? `${cuotas.length} × ${fmtMoney(cuotas[0].monto)}`
        : `${cuotas.length} cuotas`;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={elegido}
      onClick={onElegir}
      className={`w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${
        elegido ? "border-primary bg-primary-50" : "border-borde hover:bg-muted"
      }`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-texto">{plan.nombre}</span>
        <span className="text-sm font-bold tabular-nums text-texto">{fmtMoney(plan.total)}</span>
      </span>
      <span className="block text-[13px] text-texto-3">{resumen}</span>
      {elegido && cuotas.length > 1 && (
        <span className="mt-1.5 block space-y-0.5 text-[12px] text-texto-3">
          {cuotas.map((c) => (
            <span key={c.n} className="flex justify-between">
              <span>
                {textoCubre(c.cubre)} · {textoVence(c.vence)}
              </span>
              <span className="tabular-nums">{fmtMoney(c.monto)}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

function BuscarAlumno({
  q,
  onQ,
  onElegir,
  onNuevo,
  palabra,
}: {
  q: string;
  onQ: (q: string) => void;
  onElegir: (a: AlumnoFila) => void;
  onNuevo: (texto: string) => void;
  palabra: string;
}) {
  const [buscado, setBuscado] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBuscado(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const r = useApi(
    () => (buscado.length >= 2 ? apiAcademia.alumnos({ q: buscado, pageSize: 6 }) : Promise.resolve(null)),
    [buscado],
  );
  const lista = r.datos?.items ?? [];
  return (
    <div className="space-y-2">
      <Input
        aria-label={`Buscar ${palabra}`}
        value={q}
        onChange={(e) => onQ(e.target.value)}
        placeholder="CI, nombre o teléfono"
        autoFocus
      />
      {buscado.length >= 2 && !r.cargando && lista.length === 0 && (
        <p className="text-[13px] text-texto-3">No hay nadie con «{buscado}»: se crea la ficha.</p>
      )}
      {lista.length > 0 && (
        <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
          {lista.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => onElegir(a)} className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-muted">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-texto">{nombreAlumno(a)}</span>
                  <span className="block truncate text-xs text-texto-3">
                    {[a.codigo, a.ci && `CI ${a.ci}`, a.grupoActual?.nombre].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Icon name="chevronRight" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Boton variante="ghost" icono="plus" onClick={() => onNuevo(q)}>
        Nuevo {palabra}
      </Boton>
    </div>
  );
}
