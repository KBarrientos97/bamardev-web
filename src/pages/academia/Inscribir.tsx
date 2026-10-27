import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Chips } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { Boton, Campo, Cargando, ErrorMsg, Input, Select } from "../../components/ui";
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
  nombresDe,
  PARENTESCOS,
  textoCubre,
  textoModulos,
  textoVence,
  venceCuota,
} from "../../lib/academia/formato";
import { fotosQueFaltan, textoFaltanFotos } from "../../lib/academia/fotos";
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
import { MINIMO_BUSQUEDA, useTextoDemorado } from "../../lib/academia/useBusquedaEstudiante";
import { usePalabras } from "../../lib/academia/usePalabras";
import { enlaceWhatsApp } from "../../lib/agenda/recordatorio";
import { ApiError } from "../../lib/api";
import { fmtMoney, isoDia } from "../../lib/format";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { abrirWhatsapp } from "../../lib/academia/vista";
import BuscadorEstudiante from "./BuscadorEstudiante";
import CapturaFotos from "./CapturaFotos";
import { BotonFila, BotonIcono, ResumenPanel } from "./piezas";

export interface ResultadoInscripcion {
  inscripcion: Pick<InscripcionDetalle, "id"> & Partial<InscripcionDetalle>;
  /** "Inscribir y cobrar ahora": quien abrió el panel lleva a "Cobrar a estudiante" (A1). */
  cobrar: boolean;
  /** Lo que paga hoy (la primera cuota, todo o un adelanto): el cobro lo trae cargado (A2). */
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
 *
 * El PIN y la confirmación del grupo lleno se piden en el pie, junto al
 * botón, y no en un diálogo encima: en el celular el alta ya ocupa la
 * pantalla entera y un diálogo sobre ella era una hoja sobre otra.
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
  /**
   * A3 (22-oct): quien aprueba fotos (el admin) las está viendo al inscribir:
   * el paso 3 trae marcado "Revisé las 3 fotos" y quedan aprobadas. Sin el
   * permiso (la recepción) no hay check y siguen el camino de siempre.
   */
  const apruebaFotos = tienePermiso(usuario, "academia.fotos");
  const [fotosRevisadas, setFotosRevisadas] = useState(true);

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
    // Un solo plan: viene elegido. Con varios, "Mes a mes" (UX 2a, A2): es el
    // que más se usa, y así "Inscribir y cobrar" nunca queda sin plan.
    if (planId != null || planes.length === 0) return;
    const porDefecto = planes.length === 1 ? planes[0] : planes.find((x) => x.generado === "MES_A_MES");
    if (porDefecto) setPlanId(porDefecto.id);
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
  /**
   * El paso que falta antes de mandar, en el pie: el PIN del encargado o
   * confirmar el grupo lleno. Guarda con qué se estaba mandando (no una
   * función): al seguir se manda con lo que está en pantalla en ese momento.
   */
  const [pidiendoPin, setPidiendoPin] = useState<null | { cobrar: boolean; extra: ExtraEnvio }>(null);
  const [lleno, setLleno] = useState<{ inscritos: number; cupo: number; cobrar: boolean; extra: ExtraEnvio } | null>(null);
  /** D3: faltan fotos y se pregunta si se inscribe igual (el botón sigue activo). */
  const [sinFotos, setSinFotos] = useState<{ cobrar: boolean; extra: ExtraEnvio } | null>(null);

  const edad = edadDe(nuevo.fechaNacimiento);
  // Menor por la fecha de nacimiento que se está cargando, o porque el
  // backend lo dijo (un alumno ya cargado, sin tutor).
  // También la preinscripción de un menor que llegó sin tutor: convertir lo pide.
  const esMenor =
    pideTutor ||
    (modo === "nuevo" && !elegido && edad != null && edad < MAYORIA_DE_EDAD) ||
    (!!preinscripcion?.alumno.menor && !preinscripcion.tutor);

  /**
   * Lo que está mal en la beca o promoción: ni 0, ni más del 100 %, ni más
   * que el curso. Mientras esté mal, el resumen no la aplica: mostraba "Beca
   * 100 %, total Bs 0" con el campo en rojo (QA ronda 2, N-6).
   */
  const descuentoMal = (() => {
    if (!tipoDesc || valorDesc.trim() === "") return "";
    const n = Number(valorDesc);
    if (!Number.isFinite(n) || n <= 0) return "Tiene que ser más de 0.";
    if (enPct && n > 100) return "No puede pasar el 100 %.";
    if (!enPct && plan && n > plan.total) return `No puede pasar el precio del ${p.carrera} (${fmtMoney(plan.total)}).`;
    return "";
  })();
  const valorDescValido = descuentoMal ? 0 : Number(valorDesc) || 0;
  // Sin cuotas en Bs 0 y en orden de vencimiento, como las crea y las cobra el
  // backend: «la primera» es la que vence antes (auditoría 26-oct, bug 19).
  const vista = useMemo(() => {
    const hoy = isoDia(new Date());
    const desde = (orden: number) => grupo?.materiasGrupo.find((m) => m.materia.orden === orden)?.desde;
    return calendarioConDescuento(plan, tipoDesc, enPct, valorDescValido, (c) => {
      const v = venceCuota(c.vence, desde, hoy, c.cubre[0]);
      return !v || v === "hoy" ? hoy : v;
    });
  }, [plan, tipoDesc, enPct, valorDescValido, grupo]);
  // Un plan de una sola cuota (el pago completo) no tiene "la primera".
  const unaCuota = vista.cuotas.length <= 1;
  const elegidoHoy: PagaHoy = unaCuota && pagaHoy === "primera" ? "todo" : pagaHoy;

  /**
   * Lo que está mal en el adelanto, dicho en el campo mientras se escribe: un
   * -50 dejaba "Paga hoy Bs 0,00" e inscribía igual (QA ronda 2, B-16).
   */
  const adelantoMal = (() => {
    if (elegidoHoy !== "otro" || otroMonto.trim() === "") return "";
    const n = Number(otroMonto);
    if (!Number.isFinite(n) || n <= 0) return "Tiene que ser más de Bs 0.";
    if (plan && n > vista.total) return `No puede pasar el total (${fmtMoney(vista.total)}).`;
    return "";
  })();
  const sobreTope =
    !!tipoDesc && vista.pct > (ajustes.datos?.topePromoSinPinPct ?? Number.POSITIVE_INFINITY) && !puedeBecas;

  const nombreFinal = preinscripcion
    ? nombreAlumno(preinscripcion.alumno)
    : elegido?.nombre ?? (nuevo.apellidos || nuevo.nombres ? nombreAlumno(nuevo) : "");

  /** Lo que falta para inscribir; con `cobrar`, también lo que se cobra hoy. */
  function faltantes(cobrar: boolean): string | null {
    if (!preinscripcion && !elegido) {
      if (modo === "buscar") return `Elegí al ${p.alumno} o cargá uno nuevo.`;
      if (!nuevo.ci.trim()) return "Falta el carnet de identidad.";
      if (!nuevo.apellidos.trim() || !nuevo.nombres.trim()) return "Faltan los apellidos y los nombres.";
    }
    if (esMenor && (!tutor.nombre.trim() || !tutor.telefono.trim())) return `Es menor: falta el tutor (nombre y WhatsApp).`;
    if (!grupoId) return "Elegí el grupo.";
    if (!plan) return "Elegí cómo paga.";
    if (tipoDesc && valorDesc.trim() === "") return "Poné el descuento, o elegí Ninguna.";
    if (descuentoMal) return `El descuento: ${descuentoMal.charAt(0).toLowerCase()}${descuentoMal.slice(1)}`;
    if (tipoDesc && motivo.trim().length < 3) return "Contá el motivo del descuento.";
    if (cobrar && elegidoHoy === "otro" && otroMonto.trim() === "") return "Poné cuánto paga hoy.";
    if (cobrar && adelantoMal) return `Lo que paga hoy: ${adelantoMal.charAt(0).toLowerCase()}${adelantoMal.slice(1)}`;
    return null;
  }

  /**
   * Después del primer intento, lo que falta se recalcula en vivo al lado del
   * botón: se ve sin buscarlo al fondo del panel y se va solo al corregirlo
   * (QA ronda 2, B-15: "Elegí cómo paga." quedaba pegado y fuera de la vista).
   */
  const [validar, setValidar] = useState<null | { cobrar: boolean }>(null);
  // Un rechazo del backend vale para lo que se mandó: al cambiar algo, se va.
  // Lo mismo el paso pendiente del pie (PIN, grupo lleno): era de otro grupo,
  // otro descuento u otro estudiante.
  useEffect(() => {
    setError("");
    setPidiendoPin(null);
    setLleno(null);
    setSinFotos(null);
    // También la salida (YA_INSCRIPTO, CI_DUPLICADO…): decía «ya está en el grupo»
    // de quien se acaba de cambiar (ronda 1, D7).
    setSalida(null);
  }, [planId, grupoId, tutor, nuevo, elegido, pagaHoy, otroMonto, tipoDesc, valorDesc, enPct, motivo, fotos]);

  // Que un estudiante sea menor lo dijo el backend de ÉL: al cambiar a otro, el
  // bloque del tutor y lo que se cargó vuelven a cero (ronda 1, D8). Si no, un
  // adulto quedaba con «Tutor · obligatorio» y se mandaba un tutor que no tiene.
  useEffect(() => {
    setPideTutor(false);
    setTutor({ nombre: "", parentesco: "Madre", telefono: "" });
  }, [elegido]);

  async function enviar(cobrar: boolean, extra: ExtraEnvio = {}) {
    setValidar({ cobrar });
    if (faltantes(cobrar)) {
      setError("");
      setSalida(null);
      return;
    }
    // D3: con fotos pendientes se pregunta antes de seguir (con el PIN, el grupo
    // lleno y lo demás, la confirmación viaja en `extra` y no se vuelve a pedir).
    if (faltanFotos.length && !extra.sinFotos) {
      setSinFotos({ cobrar, extra });
      return;
    }
    const autorizador = extra.firma ?? firma ?? undefined;
    // Sobre el tope y sin el permiso: el PIN se pide antes de mandar.
    if (sobreTope && !autorizador) {
      setPidiendoPin({ cobrar, extra });
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
    setPidiendoPin(null);
    setLleno(null);
    setSinFotos(null);
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
              ...(faltanFotos.length ? { fotosPendientes: true } : {}),
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
            ...(faltanFotos.length ? { fotosPendientes: true } : {}),
          }, fotos);
      if (bienvenida) mandarBienvenida(inscripcion.bienvenida);
      // A3: con el check, las fotos quedan aprobadas. Si falla, la inscripción
      // ya está hecha: las fotos siguen "por revisar" y se aprueban después.
      const alumnoId = elegido?.id ?? preinscripcion?.alumno.id ?? inscripcion.alumnoId;
      if (apruebaFotos && pideFotos && fotosRevisadas && faltanFotos.length === 0 && alumnoId != null) {
        await apiAcademia.revisarFotos(alumnoId, { ok: true }).catch(() => undefined);
      }
      onInscrito({ inscripcion, cobrar, ...(cobrar && montoHoy > 0 ? { montoHoy } : {}) });
    } catch (e) {
      const codigo = e instanceof ApiError ? e.codigo : undefined;
      if (codigo === CODIGOS_ACADEMIA.FOTOS_REQUERIDAS && e instanceof ApiError) {
        // El backend cuenta las que tiene guardadas: marca las que siguen faltando.
        const faltan = Array.isArray(e.detalle.faltan) ? (e.detalle.faltan as TipoFoto[]) : [];
        setMarcadas(faltan);
        setError(faltan.length ? `${textoFaltanFotos(faltan.length)}: sacalas y probá de nuevo.` : e.message);
      } else if (codigo === CODIGOS_ACADEMIA.GRUPO_LLENO && e instanceof ApiError) {
        setLleno({ inscritos: Number(e.detalle.inscritos ?? 0), cupo: Number(e.detalle.cupo ?? 0), cobrar, extra });
      } else if (codigo === CODIGOS_ACADEMIA.TUTOR_REQUERIDO) {
        setPideTutor(true);
        setError(`Es menor de edad: cargá al tutor para inscribirlo.`);
      } else if (codigo === CODIGOS_ACADEMIA.DESCUENTO_REQUIERE_AUTORIZACION) {
        setFirma(null);
        setPidiendoPin({ cobrar, extra: { ...extra, firma: undefined } });
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
      } else if (e instanceof ApiError && e.status === 403 && autorizador) {
        // Se mandó un PIN y el backend lo rechazó (403 sin código: «Usuario o PIN
        // incorrecto»). Ese PIN no se guarda ni se reenvía solo: cada reintento
        // sumaría un fallo a la bitácora de PIN (alarma y tope). Se vuelve a pedir.
        setFirma(null);
        setPidiendoPin({ cobrar, extra: { ...extra, firma: undefined } });
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "No se pudo inscribir");
      }
    } finally {
      setEnviando(false);
    }
  }

  /** La bienvenida por wa.me (PA §9): al tutor si lo hay, si no al alumno. */
  function mandarBienvenida(delBackend: InscripcionDetalle["bienvenida"]) {
    // La arma el backend (con el tutor que tiene guardado aunque acá no se
    // haya cargado): si la manda, va esa; `null` es que no hay a quién.
    if (delBackend !== undefined) {
      if (delBackend?.url) abrirWhatsapp(delBackend.url);
      return;
    }
    const telefono = esMenor ? tutor.telefono : preinscripcion?.alumno.telefono ?? elegido?.telefono ?? nuevo.telefono;
    if (!telefono || !grupo) return;
    const delAlumno = nombreFinal.split(",").pop()?.trim().split(" ")[0] ?? "";
    const cuando = `el ${fechaCorta(grupo.fechaInicio)}, ${horarioGrupo(grupo)}, en ${nombreDe(grupo.sede)}`;
    // Al tutor se le habla del estudiante, no como si fuera él quien empieza
    // ("Hola Madre, ¡bienvenido/a…! Empezás…", QA ronda 2, B-19).
    const texto = esMenor
      ? `Hola ${tutor.nombre.trim()}, ${delAlumno} ya está inscrito/a en ${nombreDe(grupo.carrera)}. Empieza ${cuando}.`
      : `Hola ${delAlumno}, ¡bienvenido/a a ${nombreDe(grupo.carrera)}! Empezás ${cuando}.`;
    const url = enlaceWhatsApp(telefono, texto);
    if (url) abrirWhatsapp(url);
  }

  const primera = vista.cuotas[0]?.monto ?? 0;
  const falta = validar ? faltantes(validar.cobrar) : null;
  const montoHoy =
    elegidoHoy === "primera"
      ? primera
      : elegidoHoy === "todo"
        ? vista.total
        : Math.max(0, Math.min(vista.total, Number(otroMonto) || 0));
  const saldoQueda = Math.max(0, vista.total - montoHoy);
  const proxima = vista.cuotas.find((_, i) => vista.cuotas.slice(0, i + 1).reduce((s, c) => s + c.monto, 0) > montoHoy);
  // La bienvenida de un menor va a su tutor (contrato #41): también la del
  // menor preinscrito online que ya trajo tutor, que no es `esMenor` porque
  // no hay que pedirlo (QA ronda 2, N-9).
  const alTutor = esMenor || !!preinscripcion?.alumno.menor;
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
        <header className="flex items-center justify-between gap-3 border-b border-borde-soft px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-texto">Inscribir {p.alumno}</h2>
            {grupo && <p className="text-[13px] text-texto-3">{p.Sede} {nombreDe(grupo.sede)}</p>}
          </div>
          <BotonIcono icono="close" etiqueta="Cerrar" onClick={onCerrar} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/40 px-4 py-4 sm:px-5 sm:py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-4">
          <Paso n={1} titulo="Grupo" listo={!!grupo}>
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
            {!fijoGrupo && grupo && <TarjetaGrupo g={grupo} />}
          </Paso>

          <Paso n={2} titulo={`Datos del ${p.alumno}`} listo={datosListos && tutorListo}>
            {preinscripcion ? (
              <p className="text-sm">
                <span className="font-semibold text-texto">{nombreFinal}</span>
                {preinscripcion.alumno.telefono && <span className="text-texto-3"> · {preinscripcion.alumno.telefono}</span>}
                {preinscripcion.tutor && (
                  <span className="block text-[13px] text-texto-3">Tutor: {preinscripcion.tutor.nombre}</span>
                )}
              </p>
            ) : elegido ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-borde bg-muted/50 px-3.5 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-texto">
                  <Icon name="user" size={16} />
                  <span className="truncate">{elegido.nombre}</span>
                </span>
                {!alumnoInicial && (
                  <BotonFila variante="ghost" onClick={() => setElegido(null)}>
                    Cambiar
                  </BotonFila>
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
                <BotonFila variante="ghost" icono="search" onClick={() => setModo("buscar")}>
                  Buscar uno que ya está cargado
                </BotonFila>
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
            <Paso n={3} titulo="Fotos obligatorias" listo={faltanFotos.length === 0}>
              <p className="flex items-center gap-1.5 text-[13px] text-texto-3">
                <Icon name="lock" size={13} /> Las fotos sólo las ve el administrador
              </p>
              <p className="text-[13px] text-texto-3">Si hoy no las tiene, podés inscribir igual: quedan pendientes en el Panel de control.</p>
              <CapturaFotos
                fotos={fotos}
                onCambiar={(f) => {
                  setFotos(f);
                  setMarcadas((m) => m.filter((t) => !f[t]));
                }}
                yaTiene={yaTiene}
                marcadas={marcadas}
              />
              {apruebaFotos && (
                <label className="flex min-h-11 items-center gap-2 text-[13px] text-texto-2">
                  <input
                    type="checkbox"
                    checked={fotosRevisadas}
                    onChange={(e) => setFotosRevisadas(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-primary-boton)]"
                  />
                  Revisé las 3 fotos (quedan aprobadas al inscribir)
                </label>
              )}
            </Paso>
          )}

          <Paso n={pideFotos ? 4 : 3} titulo="Plan de pago" listo={!!plan}>
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

          {/* Cuánto paga hoy va en la misma tarjeta que la forma de pago: es la otra mitad de la misma cuenta. */}
          {plan && (
            <section aria-labelledby="t-paga-hoy" className="space-y-2 border-t border-borde-soft pt-4">
              <h4 id="t-paga-hoy" className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
                Paga hoy
              </h4>
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
                    className={`min-h-11 rounded-xl border px-3.5 text-[13px] tabular-nums transition-colors sm:min-h-10 ${
                      elegidoHoy === k
                        ? "border-primary bg-primary-50 font-semibold text-primary-700 ring-2 ring-primary-100"
                        : "border-borde bg-white text-texto-2 hover:border-primary-200 hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {elegidoHoy === "otro" && (
                <div className="max-w-[200px]">
                  <Campo label="Monto del adelanto (Bs)" error={adelantoMal || undefined}>
                    <Input type="number" value={otroMonto} aria-invalid={!!adelantoMal || undefined} onChange={(e) => setOtroMonto(e.target.value)} />
                  </Campo>
                </div>
              )}
              <p className="text-xs text-texto-4">Si deja un adelanto, el resto queda como saldo.</p>
            </section>
          )}
          </Paso>

          <section aria-label="Otro descuento o beca" className="space-y-3 rounded-xl border border-borde-soft bg-white p-4">
            <BotonFila
              variante="ghost"
              icono="percent"
              onClick={() => {
                setOtroDescuento((v) => !v);
                if (otroDescuento) {
                  setTipoDesc("");
                  setFirma(null);
                }
              }}
              aria-expanded={otroDescuento || !!tipoDesc}
            >
              Aplicar otro descuento o beca
            </BotonFila>
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
                  <Campo label="Descuento" error={descuentoMal || undefined}>
                    <Input
                      type="number"
                      value={valorDesc}
                      aria-invalid={!!descuentoMal || undefined}
                      onChange={(e) => {
                        setValorDesc(e.target.value);
                        setFirma(null);
                      }}
                    />
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

        </div>

          <aside aria-label="Resumen de la inscripción" className="mt-4 lg:sticky lg:top-0 lg:mt-0">
          <ResumenPanel className="space-y-4 border border-borde-soft">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-texto-4">Resumen</p>
              <p className="text-sm font-bold text-texto">{nombreFinal || `${p.Alumno} nuevo`}</p>
              {grupo && (
                <p className="text-[13px] text-texto-3">
                  {nombreDe(grupo.carrera)} · {horarioGrupo(grupo)} · {nombreDe(grupo.sede)}
                </p>
              )}
            </div>
            <ul aria-label="Requisitos" className="space-y-1.5 text-[13px]">
              {/* UX 2b: hasta que estén, dice que faltan (decía "Datos completos" en naranja). */}
              <Requisito ok={datosListos} texto={datosListos ? "Datos completos" : "Faltan los datos"} />
              {esMenor && <Requisito ok={tutorListo} texto={tutor.nombre.trim() ? `Tutor: ${tutor.nombre.trim()} (${tutor.parentesco.toLowerCase()})` : "Tutor"} />}
              {pideFotos && (
                <Requisito ok={faltanFotos.length === 0} texto={faltanFotos.length === 0 ? "Las 3 fotos" : `Fotos: ${3 - faltanFotos.length} de 3 · quedan pendientes`} />
              )}
            </ul>
          {plan && (
            // Los montos en su propio recuadro blanco: lo que se cobra hoy no se pierde entre los requisitos.
            <section aria-label="Resumen" className="space-y-2 rounded-lg border border-borde-soft bg-white p-3.5">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3 text-texto-2">
                  <dt>
                    {p.Carrera} ({plan.nombre})
                  </dt>
                  <dd className="tabular-nums">{fmtMoney(plan.total)}</dd>
                </div>
                {vista.descuento > 0 && (
                  <div className="flex justify-between gap-3 text-texto-2">
                    <dt>
                      {tipoDesc === "BECA" ? "Beca" : "Promoción"} {Math.round(vista.pct * 10) / 10} %
                    </dt>
                    <dd className="tabular-nums">− {fmtMoney(vista.descuento)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3 border-t border-borde-soft pt-1.5 font-bold text-texto">
                  <dt>Total del curso</dt>
                  <dd className="tabular-nums">{fmtMoney(vista.total)}</dd>
                </div>
                <div className="-mx-2 flex justify-between gap-3 rounded-md bg-primary-50 px-2 py-1 font-semibold text-primary-700">
                  <dt>Paga hoy</dt>
                  <dd className="tabular-nums">{fmtMoney(montoHoy)}</dd>
                </div>
                <div className="flex justify-between gap-3 text-texto-2">
                  <dt>Queda de saldo</dt>
                  <dd className="tabular-nums">{fmtMoney(saldoQueda)}</dd>
                </div>
              </dl>
              {proxima && saldoQueda > 0 && (
                <p className="border-t border-borde-soft pt-2 text-[13px] text-texto-3">
                  Después: cuota {proxima.n} · {textoModulos(proxima.cubre, nombresDe(grupo?.materiasGrupo))} · {textoVence(proxima.vence)}
                </p>
              )}
            </section>
          )}
          </ResumenPanel>
          </aside>
        </div>

        <footer className="space-y-2.5 border-t border-borde-soft bg-muted px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-5">
          {/* Junto al botón y no al fondo de la zona con scroll: ahí no se veían (QA ronda 2, B-15). */}
          {(falta || error) && (
            <div role="alert">
              <ErrorMsg>{falta || error}</ErrorMsg>
            </div>
          )}
          {salida && (
            <div role="alert" className="space-y-1 rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm text-warning-text">
              <p>{salida.texto}</p>
              {salida.accion}
            </div>
          )}
          {pidiendoPin ? (
            <PinEnLinea
              onCancelar={() => setPidiendoPin(null)}
              onFirmar={(f) => {
                const { cobrar, extra } = pidiendoPin;
                setFirma(f);
                void enviar(cobrar, { ...extra, firma: f });
              }}
            />
          ) : sinFotos ? (
            <section aria-label="Faltan fotos" className="space-y-2.5 rounded-xl border border-warning-text/30 bg-warning-bg px-3.5 py-3">
              <p className="text-sm text-warning-text">
                <b>{textoFaltanFotos(faltanFotos.length)}.</b> Podés inscribir igual: el {p.alumno} queda marcado «Faltan fotos» en su ficha. ¿Inscribir sin las fotos?
              </p>
              <div className="flex flex-col gap-2 lg:flex-row-reverse">
                <Boton
                  className="min-h-11 w-full lg:w-auto"
                  disabled={enviando}
                  onClick={() => void enviar(sinFotos.cobrar, { ...sinFotos.extra, sinFotos: true })}
                >
                  Inscribir sin fotos
                </Boton>
                <Boton variante="ghost" className="min-h-11 w-full bg-white lg:w-auto" disabled={enviando} onClick={() => setSinFotos(null)}>
                  Cargar las fotos
                </Boton>
              </div>
            </section>
          ) : lleno ? (
            <section aria-label="El grupo está lleno" className="space-y-2.5 rounded-xl border border-warning-text/30 bg-warning-bg px-3.5 py-3">
              <p className="text-sm text-warning-text">
                <b>El grupo está lleno.</b> Tiene {lleno.inscritos} inscritos y el cupo es de {lleno.cupo}. ¿Lo inscribís igual?
              </p>
              <div className="flex flex-col gap-2 lg:flex-row-reverse">
                <Boton
                  className="min-h-11 w-full lg:w-auto"
                  disabled={enviando}
                  onClick={() => void enviar(lleno.cobrar, { ...lleno.extra, sobreCupo: true })}
                >
                  Inscribir igual
                </Boton>
                <Boton variante="ghost" className="min-h-11 w-full bg-white lg:w-auto" disabled={enviando} onClick={() => setLleno(null)}>
                  Cancelar
                </Boton>
              </div>
            </section>
          ) : (
          /* En escritorio, la bienvenida a la izquierda y los botones a la derecha (el principal al final); en el celular, uno debajo del otro. */
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <label className="flex min-h-11 items-center gap-2 text-[13px] text-texto-2 lg:min-h-0">
              <input type="checkbox" checked={bienvenida} onChange={(e) => setBienvenida(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary-boton)]" />
              Enviar bienvenida por WhatsApp{alTutor ? " al tutor" : ""}
            </label>
            <div className="flex flex-col gap-2 lg:flex-row-reverse lg:items-center">
              {/* Sin las 3 fotos (D3) los botones siguen activos: al tocarlos se pregunta si se inscribe igual. */}
              <Boton className="min-h-11 w-full lg:w-auto lg:min-w-[240px]" disabled={enviando} onClick={() => void enviar(true)}>
                {enviando ? "Inscribiendo…" : plan && montoHoy > 0 ? `Inscribir y cobrar ${fmtMoney(montoHoy)}` : "Inscribir y cobrar"}
              </Boton>
              <Boton variante="ghost" className="min-h-11 w-full bg-white lg:w-auto" disabled={enviando} onClick={() => void enviar(false)}>
                Inscribir sin cobrar
              </Boton>
            </div>
          </div>
          )}
        </footer>
      </aside>

    </div>
  );
}

type ExtraEnvio = { sobreCupo?: boolean; sinFotos?: boolean; firma?: { username: string; pin: string } };

/**
 * El PIN del encargado para un descuento sobre el tope, en el pie del alta.
 * Lo mismo que pide `PedirPinCredito` del fiado (usuario de quien autoriza,
 * salvo que el que inscribe ya autorice con PIN; 4 a 6 dígitos), pero en
 * línea: ése es un diálogo y acá quedaba encima de la pantalla del alta.
 */
function PinEnLinea({ onCancelar, onFirmar }: { onCancelar: () => void; onFirmar: (f: { username: string; pin: string }) => void }) {
  const { usuario: actual } = useAuth();
  const pideUsuario = !tienePermiso(actual, "autorizar.pin");
  const [autorizador, setAutorizador] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function firmar() {
    if (!/^\d{4,6}$/.test(pin)) return setError("El PIN son 4 dígitos.");
    if (pideUsuario && autorizador.trim().length < 3) return setError("Poné el usuario del encargado que autoriza.");
    onFirmar({ username: pideUsuario ? autorizador.trim() : (actual?.username ?? ""), pin });
  }

  return (
    <section aria-labelledby="t-autoriza" className="space-y-3 rounded-xl border border-borde bg-white px-3.5 py-3">
      <div>
        <h3 id="t-autoriza" className="text-sm font-bold text-texto">
          Autorización del encargado
        </h3>
        <p className="text-[13px] text-texto-3">El descuento pasa el tope que se da sin autorización</p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          firmar();
        }}
      >
        <div className={pideUsuario ? "grid grid-cols-2 gap-2" : ""}>
          {pideUsuario && (
            <Campo label="Usuario del encargado">
              <Input value={autorizador} onChange={(e) => setAutorizador(e.target.value)} autoFocus autoComplete="off" />
            </Campo>
          )}
          <Campo label="PIN">
            <Input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus={!pideUsuario}
              autoComplete="off"
              placeholder="4 dígitos"
              className="text-lg font-bold tracking-widest"
            />
          </Campo>
        </div>
        <p className="-mt-2 text-xs text-texto-4">Cada intento queda registrado con tu usuario y lo ve el administrador.</p>
        <ErrorMsg>{error}</ErrorMsg>
        <div className="flex flex-col gap-2 lg:flex-row-reverse">
          <Boton type="submit" className="min-h-11 w-full lg:w-auto">
            Autorizar
          </Boton>
          {/* Sin type, un botón dentro del form lo manda: Cancelar autorizaría. */}
          <Boton type="button" variante="ghost" className="min-h-11 w-full bg-white lg:w-auto" onClick={onCancelar}>
            Cancelar
          </Boton>
        </div>
      </form>
    </section>
  );
}

/**
 * Un paso del alta en su recuadro: el número (o el visto cuando ya está) y el
 * título arriba, una línea suave y lo que se carga. Así los pasos no quedan
 * sueltos sobre el blanco del panel.
 */
function Paso({ n, titulo, listo = false, children }: { n: number; titulo: string; listo?: boolean; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="rounded-xl border border-borde-soft bg-white">
      <h3 className="flex items-center gap-2.5 border-b border-borde-soft px-4 py-3 text-sm font-bold text-texto">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
            listo ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20" : "bg-primary-50 text-primary-700"
          }`}
        >
          {listo ? <Icon name="check" size={14} /> : n}
        </span>
        {titulo}
      </h3>
      <div className="space-y-3 p-4">{children}</div>
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
    <div className="flex items-start justify-between gap-3 rounded-xl border border-borde bg-muted/50 px-3.5 py-2.5">
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
    // Cada cuota con su vencimiento como lo calcula el backend: con un grupo
    // que todavía no empezó, la primera vence el día que empieza el M1, no
    // hoy (QA 23-oct). "Paga hoy" es otra cosa: un cobro.
    const hoy = isoDia(new Date());
    resumen = cuotas
      .map((c) => {
        const vence = venceCuota(c.vence, desdeDe, hoy, c.cubre[0]);
        return `${textoCubre(c.cubre)} ${vence === "hoy" ? "hoy" : fechaCorta(vence)}`;
      })
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
      className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
        elegido ? "border-primary bg-primary-50 ring-2 ring-primary-100" : "border-borde bg-white hover:border-primary-200 hover:bg-muted"
      }`}
    >
      {/* El puntito de radio: que se vea cuál está elegida sin depender sólo del color de fondo. */}
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${elegido ? "border-primary" : "border-slate-300"}`}
      >
        {elegido && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-sm font-bold text-texto">{titulo}</span>
        <span className="text-sm font-bold tabular-nums text-texto">{precio}</span>
      </span>
      <span className="block text-[13px] text-texto-3">{resumen}</span>
      {elegido && cuotas.length > 1 && !generado && (
        <span className="mt-1.5 block space-y-0.5 text-[12px] text-texto-3">
          {cuotas.map((c) => (
            <span key={c.n} className="flex justify-between">
              <span>
                {textoModulos(c.cubre, nombresDe(grupo?.materiasGrupo))} · {textoVence(c.vence)}
              </span>
              <span className="tabular-nums">{fmtMoney(c.monto)}</span>
            </span>
          ))}
        </span>
      )}
      </span>
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
  const buscado = useTextoDemorado(q);
  // La respuesta lleva la búsqueda a la que pertenece: `cargando` se enciende en
  // un efecto, y en el cuadro que sigue a un cambio todavía está la lista de la
  // búsqueda anterior (ronda 1, D14: destello de «No hay nadie con…»).
  const r = useApi(
    () =>
      buscado.length >= MINIMO_BUSQUEDA
        ? apiAcademia.alumnos({ q: buscado, pageSize: 6 }).then((x) => ({ de: buscado, items: x.items }))
        : Promise.resolve(null),
    [buscado],
  );
  const vigente = r.datos?.de === buscado;
  const lista = vigente ? (r.datos?.items ?? []) : [];
  // Sólo con la búsqueda ya asentada (`buscado` alcanzó lo escrito) y sin error
  // de red: si falló no se sabe si el estudiante existe.
  const sinResultados = buscado.length >= MINIMO_BUSQUEDA && buscado === q.trim() && vigente && !r.cargando && !r.error && lista.length === 0;
  return (
    <div className="space-y-2">
      <BuscadorEstudiante valor={q} onChange={onQ} autoFocus />
      {/* Si la búsqueda falla la pantalla no puede quedar muda (ronda 1, D3). */}
      {r.error && buscado.length >= MINIMO_BUSQUEDA && <ErrorMsg onReintentar={r.recargar}>{r.error}</ErrorMsg>}
      {/* "Nuevo" como botón sólo cuando la búsqueda no encuentra a nadie (D2): antes
          salía siempre y se cargaban fichas repetidas de quien ya estaba. */}
      {sinResultados && (
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
      {sinResultados && (
        <Boton variante="ghost" icono="plus" onClick={() => onNuevo(q)}>
          Nuevo {palabra}
        </Boton>
      )}
      {/* Con resultados no se oculta del todo (ronda 1, D3): un hermano o un homónimo
          aparece en la lista y no es la misma persona. Va discreto, como enlace. */}
      {lista.length > 0 && (
        <p className="text-[13px] text-texto-3">
          ¿No está en la lista?{" "}
          <button type="button" className="font-semibold text-primary underline" onClick={() => onNuevo(q)}>
            Crear ficha nueva
          </button>
        </p>
      )}
    </div>
  );
}
