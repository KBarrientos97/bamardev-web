import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
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
import { textoFaltanFotos } from "../../lib/academia/fotos";
import type {
  AlumnoFila,
  DescuentoInput,
  FotosInscripcion,
  GrupoDetalle,
  GrupoResumen,
  InscripcionDetalle,
  PlanPago,
  Preinscripcion,
  TipoDescuento,
  TipoFoto,
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
import CapturaFotos, { fotosQueFaltan } from "./CapturaFotos";

export interface ResultadoInscripcion {
  inscripcion: Pick<InscripcionDetalle, "id"> & Partial<InscripcionDetalle>;
  /** "Inscribir y cobrar ahora": quien abrió el panel lleva al POS. */
  cobrar: boolean;
  /** Lo que paga hoy (la primera cuota, todo o un adelanto): el POS lo propone. */
  montoHoy?: number;
}

type PagaHoy = "primera" | "todo" | "otro";

type Modo = "buscar" | "nuevo";

/**
 * N5 · Inscribir estudiante (ronda 2): el grupo, los datos, las 3 fotos
 * obligatorias (D7), la forma de pago (mes a mes o pago completo) y cuánto
 * paga hoy; a la derecha, el resumen con lo que falta. Sin las 3 fotos el
 * botón dice cuántas faltan y no inscribe. Cualquier descuento que no sea el
 * del pago completo va escondido en "Aplicar otro descuento o beca" y pide el
 * PIN (S4). Panel ancho sobre la pantalla en escritorio; pantalla completa en
 * el celular.
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
  // La forma de pago que eligió en la página viene marcada.
  const [planId, setPlanId] = useState<number | null>(preinscripcion?.planElegido?.id ?? null);
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
  const [otroDescuento, setOtroDescuento] = useState(false);

  // ── Fotos (D7) ──
  const [fotos, setFotos] = useState<FotosInscripcion>({});
  const [marcadas, setMarcadas] = useState<TipoFoto[]>([]);
  // Un estudiante que ya está cargado puede tener alguna: no se le piden de nuevo.
  const idConFotos = elegido?.id ?? preinscripcion?.alumno.id ?? null;
  const fichaFotos = useApi(
    () => (idConFotos ? apiAcademia.alumno(idConFotos).catch(() => null) : Promise.resolve(null)),
    [idConFotos],
  );
  const yaTiene = (fichaFotos.datos?.fotos ?? []).map((f) => f.tipo);
  // Ante la duda (ajustes sin cargar), se piden: es lo que exige el backend por defecto.
  const pideFotos = ajustes.datos?.fotosObligatorias ?? true;
  const faltanFotos = pideFotos ? fotosQueFaltan(fotos, yaTiene) : [];

  // ── Paga hoy ──
  const [pagaHoy, setPagaHoy] = useState<PagaHoy>("primera");
  const [otroMonto, setOtroMonto] = useState("");

  const [bienvenida, setBienvenida] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  /**
   * Un rechazo que tiene salida (YA_INSCRIPTO, CI_DUPLICADO…): el mensaje del
   * backend y lo que se puede hacer, decidido por el `codigo`.
   */
  const [salida, setSalida] = useState<{ texto: string; accion: ReactNode } | null>(null);
  const [pidiendoPin, setPidiendoPin] = useState<null | ((f: { username: string; pin: string }) => void)>(null);
  const [lleno, setLleno] = useState<{ inscritos: number; cupo: number; seguir: () => void } | null>(null);

  const edad = edadDe(nuevo.fechaNacimiento);
  // Menor por la fecha de nacimiento que se está cargando, o porque el
  // backend lo dijo (un alumno ya cargado, sin tutor).
  // También la preinscripción de un menor que llegó sin tutor: convertir lo pide.
  const esMenor =
    pideTutor ||
    (modo === "nuevo" && !elegido && edad != null && edad < MAYORIA_DE_EDAD) ||
    (!!preinscripcion?.alumno.menor && !preinscripcion.tutor);

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
    if (faltanFotos.length) return `${textoFaltanFotos(faltanFotos.length)}.`;
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
    setSalida(null);
    setEnviando(true);
    try {
      const inscripcion = preinscripcion
        ? await apiAcademia.convertir(
            preinscripcion.id,
            {
              planPagoId: plan!.id,
              ...(descuento ? { descuento } : {}),
              ...(esMenor && tutor.nombre.trim()
                ? { tutor: { nombre: tutor.nombre.trim(), telefono: tutor.telefono.trim(), parentesco: tutor.parentesco } }
                : {}),
              ...(extra.sobreCupo ? { confirmarSobreCupo: true } : {}),
            },
            fotos,
          )
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
          }, fotos);
      if (bienvenida) mandarBienvenida();
      onInscrito({ inscripcion, cobrar, ...(cobrar && montoHoy > 0 ? { montoHoy } : {}) });
    } catch (e) {
      const codigo = e instanceof ApiError ? e.codigo : undefined;
      if (codigo === CODIGOS_ACADEMIA.FOTOS_REQUERIDAS && e instanceof ApiError) {
        // El backend cuenta las que tiene guardadas: marca las que siguen faltando.
        const faltan = Array.isArray(e.detalle.faltan) ? (e.detalle.faltan as TipoFoto[]) : [];
        setMarcadas(faltan);
        setError(faltan.length ? `${textoFaltanFotos(faltan.length)}: sacalas y probá de nuevo.` : e.message);
      } else if (codigo === CODIGOS_ACADEMIA.GRUPO_LLENO && e instanceof ApiError) {
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
      } else if (codigo === CODIGOS_ACADEMIA.YA_INSCRIPTO && e instanceof ApiError) {
        // Ya está en el grupo: si es una preinscripción, se convierte desde la
        // bandeja; si no, su ficha dice cómo está.
        const preinscrito = e.detalle.estado === "PREINSCRITA";
        setSalida({
          texto: e.message,
          accion: preinscrito ? (
            <Link to="/academia/preinscripciones" className="font-semibold underline" onClick={onCerrar}>
              Ir a Preinscripciones
            </Link>
          ) : elegido ? (
            <Link to={`/academia/alumnos/${elegido.id}`} className="font-semibold underline" onClick={onCerrar}>
              Ver su ficha
            </Link>
          ) : null,
        });
      } else if (
        (codigo === CODIGOS_ACADEMIA.CI_DUPLICADO || codigo === CODIGOS_ACADEMIA.TELEFONO_DUPLICADO) &&
        e instanceof ApiError
      ) {
        // El carnet o el teléfono ya son de alguien: se lo busca en vez de crearlo otra vez.
        const buscar = codigo === CODIGOS_ACADEMIA.CI_DUPLICADO ? nuevo.ci.trim() : nuevo.telefono.trim();
        setSalida({
          texto: e.message,
          accion: (
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                setModo("buscar");
                setQ(buscar);
                setSalida(null);
              }}
            >
              Buscarlo
            </button>
          ),
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
  // Un plan de una sola cuota (el pago completo) no tiene "la primera".
  const unaCuota = vista.cuotas.length <= 1;
  const elegidoHoy: PagaHoy = unaCuota && pagaHoy === "primera" ? "todo" : pagaHoy;
  const montoHoy =
    elegidoHoy === "primera"
      ? primera
      : elegidoHoy === "todo"
        ? vista.total
        : Math.max(0, Math.min(vista.total, Number(otroMonto) || 0));
  const saldoQueda = Math.max(0, vista.total - montoHoy);
  const proxima = vista.cuotas.find((_, i) => vista.cuotas.slice(0, i + 1).reduce((s, c) => s + c.monto, 0) > montoHoy);
  const tutorListo = !esMenor || (!!tutor.nombre.trim() && !!tutor.telefono.trim()) || !!preinscripcion?.tutor;
  const datosListos = !!preinscripcion || !!elegido || (!!nuevo.ci.trim() && !!nuevo.apellidos.trim() && !!nuevo.nombres.trim());

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/30"
      onMouseDown={(e) => e.target === e.currentTarget && !enviando && onCerrar()}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Inscribir ${p.alumno}`}
        className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-[440px] sm:border-l sm:border-borde lg:max-w-[920px]"
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8">
        <div className="space-y-7">
          <Paso n={1} titulo="Grupo">
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

          <Paso n={2} titulo={`Datos del ${p.alumno}`}>
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

            {esMenor && (!preinscripcion || !preinscripcion.tutor) && (
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

          {pideFotos && (
            <Paso n={3} titulo="Fotos obligatorias">
              <p className="-mt-1 flex items-center gap-1.5 text-[13px] text-texto-3">
                <Icon name="lock" size={13} /> Las fotos sólo las ve el administrador
              </p>
              <CapturaFotos
                fotos={fotos}
                onCambiar={(f) => {
                  setFotos(f);
                  setMarcadas((m) => m.filter((t) => !f[t]));
                }}
                yaTiene={yaTiene}
                marcadas={marcadas}
              />
            </Paso>
          )}

          <Paso n={pideFotos ? 4 : 3} titulo="Forma de pago">
            {!grupoId ? (
              <p className="text-sm text-texto-3">Primero el grupo.</p>
            ) : detalle.cargando ? (
              <Cargando />
            ) : planes.length === 0 ? (
              <p className="text-sm text-texto-3">Este grupo no tiene planes de pago.</p>
            ) : (
              <div className="space-y-2" role="radiogroup" aria-label="Plan de pago">
                {planes.map((pl) => (
                  <TarjetaPlan
                    key={pl.id}
                    plan={pl}
                    planes={planes}
                    grupo={grupo}
                    elegido={pl.id === planId}
                    onElegir={() => {
                      setPlanId(pl.id);
                      setPagaHoy(pl.calendario.length > 1 ? "primera" : "todo");
                    }}
                  />
                ))}
              </div>
            )}
          </Paso>

          {plan && (
            <section aria-labelledby="t-paga-hoy" className="space-y-2">
              <h3 id="t-paga-hoy" className="text-sm font-bold text-texto">
                Paga hoy
              </h3>
              <div role="group" aria-labelledby="t-paga-hoy" className="flex flex-wrap gap-2">
                {(
                  [
                    ...(unaCuota ? [] : [["primera", `La primera cuota · ${fmtMoney(primera)}`] as const]),
                    ["todo", unaCuota ? `Todo · ${fmtMoney(vista.total)}` : `Todo el curso · ${fmtMoney(vista.total)}`] as const,
                    ["otro", "Otro monto"] as const,
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={elegidoHoy === k}
                    onClick={() => setPagaHoy(k)}
                    className={`rounded-xl border px-3 py-2 text-[13px] transition-colors ${
                      elegidoHoy === k ? "border-primary bg-primary-50 font-semibold text-primary-700" : "border-borde bg-white text-texto-2 hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {elegidoHoy === "otro" && (
                <div className="max-w-[200px]">
                  <Campo label="Monto del adelanto (Bs)">
                    <Input type="number" value={otroMonto} onChange={(e) => setOtroMonto(e.target.value)} />
                  </Campo>
                </div>
              )}
              <p className="text-xs text-texto-4">Si deja un adelanto, el resto queda como saldo.</p>
            </section>
          )}

          <section aria-label="Otro descuento o beca" className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setOtroDescuento((v) => !v);
                if (otroDescuento) {
                  setTipoDesc("");
                  setFirma(null);
                }
              }}
              aria-expanded={otroDescuento || !!tipoDesc}
              className="text-[13px] font-semibold text-primary-700 hover:underline"
            >
              Aplicar otro descuento o beca
            </button>
            {(otroDescuento || !!tipoDesc) && (
            <>
            {!puedeBecas && (
              <p className="flex items-center gap-1.5 text-[13px] text-texto-3">
                <Icon name="lock" size={13} /> Necesita el PIN del administrador; queda registrado quién lo autorizó.
              </p>
            )}
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
                  <p className="text-[13px] text-warning-text">Al inscribir se pide el PIN.</p>
                ) : null}
              </div>
            )}
            </>
            )}
          </section>

          <ErrorMsg>{error}</ErrorMsg>
          {salida && (
            <div role="alert" className="space-y-1 rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm text-warning-text">
              <p>{salida.texto}</p>
              {salida.accion}
            </div>
          )}
        </div>

          <aside aria-label="Resumen de la inscripción" className="mt-7 space-y-4 border-t border-borde-soft pt-5 lg:sticky lg:top-0 lg:mt-0 lg:rounded-xl lg:border lg:border-borde-soft lg:bg-muted/40 lg:p-4">
            <div>
              <p className="text-sm font-bold text-texto">{nombreFinal || `${p.Alumno} nuevo`}</p>
              {grupo && (
                <p className="text-[13px] text-texto-3">
                  {nombreDe(grupo.carrera)} · {horarioGrupo(grupo)} · {nombreDe(grupo.sede)}
                </p>
              )}
            </div>
            <ul aria-label="Requisitos" className="space-y-1.5 text-[13px]">
              <Requisito ok={datosListos} texto="Datos completos" />
              {esMenor && <Requisito ok={tutorListo} texto={tutor.nombre.trim() ? `Tutor: ${tutor.nombre.trim()} (${tutor.parentesco.toLowerCase()})` : "Tutor"} />}
              {pideFotos && (
                <Requisito ok={faltanFotos.length === 0} texto={faltanFotos.length === 0 ? "Las 3 fotos" : `Fotos: ${3 - faltanFotos.length} de 3`} />
              )}
            </ul>
          {plan && (
            <section aria-label="Resumen" className="space-y-2 border-t border-borde-soft pt-3">
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
                <div className="flex justify-between text-texto-2">
                  <dt>Paga hoy</dt>
                  <dd className="tabular-nums">{fmtMoney(montoHoy)}</dd>
                </div>
                <div className="flex justify-between text-texto-2">
                  <dt>Queda de saldo</dt>
                  <dd className="tabular-nums">{fmtMoney(saldoQueda)}</dd>
                </div>
              </dl>
              {proxima && saldoQueda > 0 && (
                <p className="text-[13px] text-texto-3">
                  Después: cuota {proxima.n} · {textoCubre(proxima.cubre)} · {textoVence(proxima.vence)}
                </p>
              )}
            </section>
          )}
          </aside>
        </div>

        <footer className="space-y-2 border-t border-borde-soft px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <label className="flex items-center gap-2 text-[13px] text-texto-2">
            <input type="checkbox" checked={bienvenida} onChange={(e) => setBienvenida(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary-boton)]" />
            Enviar bienvenida por WhatsApp{esMenor ? " al tutor" : ""}
          </label>
          {/* Sin las 3 fotos el botón dice cuántas faltan y no inscribe (D7). */}
          <Boton className="w-full" disabled={enviando || faltanFotos.length > 0} onClick={() => void enviar(true)}>
            {enviando
              ? "Inscribiendo…"
              : faltanFotos.length
                ? textoFaltanFotos(faltanFotos.length)
                : plan && montoHoy > 0
                  ? `Inscribir y cobrar ${fmtMoney(montoHoy)}`
                  : "Inscribir y cobrar"}
          </Boton>
          <Boton variante="ghost" className="w-full" disabled={enviando || faltanFotos.length > 0} onClick={() => void enviar(false)}>
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

function Requisito({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? "text-texto-2" : "text-warning-text"}`}>
      <Icon name={ok ? "check" : "info"} size={15} />
      <span>{texto}</span>
    </li>
  );
}

function TarjetaGrupo({ g }: { g: GrupoResumen }) {
  const p = usePalabras();
  const actual = g.materiaActual;
  const total = g.materias.length;
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-borde px-3.5 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-texto">
          {nombreDe(g.carrera)} · {horarioGrupo(g)}
        </span>
        <span className="block text-[13px] text-texto-3">
          {nombreDe(g.sede)}
          {actual?.docente ? ` · Prof. ${actual.docente}` : ""}
          {g.cupo != null ? ` · ${g.inscritos} de ${g.cupo} inscritos` : ""}
        </span>
        <span className="block text-[13px] text-texto-3">
          {actual && total
            ? `Va en el M${actual.orden} de ${total} · ${actual.nombre}`
            : g.estado === "POR_EMPEZAR"
              ? `Empieza el ${fechaCorta(g.fechaInicio)}`
              : `${p.Materias}: ${total}`}
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

/**
 * Una forma de pago. Los dos planes del modo simple se dicen como los dice la
 * recepción: "Mes a mes · Bs 500 por módulo · M1 hoy · M2 10-nov…" y "Pago
 * completo · Bs 1.350 · ahorra Bs 150". Un plan a medida, con su calendario.
 */
function TarjetaPlan({
  plan,
  planes,
  grupo,
  elegido,
  onElegir,
}: {
  plan: PlanPago;
  planes: PlanPago[];
  grupo: GrupoDetalle | null;
  elegido: boolean;
  onElegir: () => void;
}) {
  const p = usePalabras();
  const cuotas = plan.calendario;
  const mesAMes = planes.find((x) => x.generado === "MES_A_MES");
  const desdeDe = (orden: number) => grupo?.materiasGrupo.find((m) => m.materia.orden === orden)?.desde;
  let titulo = plan.nombre;
  let precio = fmtMoney(plan.total);
  let resumen =
    cuotas.length === 1
      ? "1 pago al inscribirse"
      : cuotas.every((c) => c.monto === cuotas[0].monto)
        ? `${cuotas.length} × ${fmtMoney(cuotas[0].monto)}`
        : `${cuotas.length} cuotas`;
  if (plan.generado === "MES_A_MES") {
    titulo = "Mes a mes";
    precio = `${fmtMoney(cuotas[0]?.monto ?? 0)} por ${p.materia}`;
    resumen = cuotas
      .map((c, i) => `${textoCubre(c.cubre)} ${i === 0 ? "hoy" : fechaCorta(desdeDe(c.cubre[0]) ?? null)}`)
      .join(" · ");
  } else if (plan.generado === "COMPLETO") {
    const ahorro = mesAMes ? mesAMes.total - plan.total : 0;
    titulo = "Pago completo";
    precio = `${fmtMoney(plan.total)}${ahorro > 0 ? ` · ahorra ${fmtMoney(ahorro)}` : ""}`;
    resumen = `Una sola cuota, cubre ${cuotas[0]?.cubre.length === 1 ? `el ${p.materia}` : `los ${cuotas[0]?.cubre.length ?? 0} ${p.materias}`}`;
  }
  const generado = !!plan.generado;
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
        <span className="text-sm font-bold text-texto">{titulo}</span>
        <span className="text-sm font-bold tabular-nums text-texto">{precio}</span>
      </span>
      <span className="block text-[13px] text-texto-3">{resumen}</span>
      {elegido && cuotas.length > 1 && !generado && (
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
