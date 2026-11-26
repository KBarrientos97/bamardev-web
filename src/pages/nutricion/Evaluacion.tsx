import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import ModalSalida from "../../components/ModalSalida";
import { Boton, Cargando, ErrorMsg, Vacio } from "../../components/ui";
import { apiNutricion, esNoEncontrado, pacienteDelCarnet } from "../../lib/nutricion/api";
import { altNumero, ctrlEnter, hayDialogoAbierto, pasarAlSiguiente, useTeclas } from "../../lib/nutricion/atajos";
import { avisoImc, edadEn, empiezaConDigito, errorDeTope, hoyIso, imcDeLoEscrito } from "../../lib/nutricion/calculo";
import { enfocaSolo } from "../../lib/nutricion/foco";
import {
  cambios,
  cambiosDeControl,
  conLoDelServidor,
  controlAInput,
  controlConDatos,
  controlDesde,
  controlVacio,
  fichaAInput,
  fichaDesde,
  fichaVacia,
  hayCambios,
  soloConValor,
  type FormControl,
  type FormFicha,
} from "../../lib/nutricion/formulario";
import type { AltaPacienteInput, Catalogo, MedidaConTabla, Paciente } from "../../lib/nutricion/tipos";
import { pedirCatalogo } from "../../lib/nutricion/useCatalogo";
import { useSalidaConCambios } from "../../lib/useSalidaConCambios";
import { EncabezadoPagina, PaginaAcademia as Pagina } from "../academia/piezas";
import { EtapaMedidas } from "./EtapaMedidas";
import { EtapaComposicion, EtapaFicha, EtapaPesoImc, type CampoForm, type PropsEtapa } from "./EtapasEvaluacion";
import type { Cinta } from "./FiguraCuerpo";
import { EstadoGuardado, Tecla } from "./piezas";

type Etapa = 1 | 2 | 3 | 4;

const ETAPAS: { n: Etapa; titulo: string; corto: string }[] = [
  { n: 1, titulo: "Ficha", corto: "Ficha" },
  { n: 2, titulo: "Medidas", corto: "Medidas" },
  { n: 3, titulo: "Composición corporal", corto: "Composición" },
  { n: 4, titulo: "Peso e IMC", corto: "Peso e IMC" },
];

/** En qué etapa se escribe cada campo (para llevar al error). El peso está en la 1 y en la 4. */
const ETAPA_DEL_CAMPO: Record<CampoForm, Etapa> = {
  nombre: 1,
  edad: 1,
  fechaNacimiento: 1,
  tallaCm: 1,
  hijos: 1,
  pesoKg: 1,
  fecha: 2,
  cinturaCm: 2,
  caderaCm: 2,
  pechoCm: 2,
  musculoPct: 3,
  edadCorporal: 3,
  grasaVisceral: 3,
  grasaPct: 4,
};

const etapaDe = (v: string | null): Etapa => (["1", "2", "3", "4"].includes(v ?? "") ? (Number(v) as Etapa) : 1);

/** Lo que está mal en lo escrito, campo por campo (null = bien). */
function validar(ficha: FormFicha, control: FormControl, hoy: string): Record<CampoForm, string | null> {
  const nombre = ficha.nombre.trim();
  const nacimiento = ficha.fechaNacimiento;
  return {
    nombre: nombre.length < 2 ? "Escribí el nombre del paciente" : nombre.length > 120 ? "Hasta 120 letras" : null,
    edad: nacimiento ? null : errorDeTope("edad", ficha.edad),
    fechaNacimiento: !nacimiento ? null : nacimiento > hoy ? "No puede ser después de hoy" : edadEn(nacimiento, hoy) == null ? "Revisá la fecha" : null,
    tallaCm: errorDeTope("tallaCm", ficha.tallaCm),
    hijos: errorDeTope("hijos", ficha.hijos),
    pesoKg: errorDeTope("pesoKg", control.pesoKg),
    fecha: control.fecha > hoy ? "No puede ser después de hoy" : null,
    cinturaCm: errorDeTope("cinturaCm", control.cinturaCm),
    caderaCm: errorDeTope("caderaCm", control.caderaCm),
    pechoCm: errorDeTope("pechoCm", control.pechoCm),
    grasaPct: errorDeTope("grasaPct", control.grasaPct),
    musculoPct: errorDeTope("musculoPct", control.musculoPct),
    edadCorporal: errorDeTope("edadCorporal", control.edadCorporal),
    grasaVisceral: errorDeTope("grasaVisceral", control.grasaVisceral),
  };
}

/**
 * La evaluación en 4 etapas (CONTRATO-nutricion-evaluacion-22nov §4.2):
 * `/evaluacion/nuevo` y `/evaluacion/:id/editar`. Cada «Guardar y seguir»
 * guarda de verdad: la primera vez hace el alta (con el control inicial si ya
 * hay algo medido) y después manda sólo lo que cambió de la ficha y del
 * control inicial. Al editar, las etapas 2 a 4 son el control inicial.
 *
 * Atajos: `Alt+1..4` salta de etapa, `Ctrl+Enter` guarda y sigue, `Enter` en
 * un campo de una línea pasa al siguiente.
 */
export default function Evaluacion() {
  const { id } = useParams();
  const idRuta = id ? Number(id) : null;
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [pacienteId, setPacienteId] = useState<number | null>(null);
  const [inicialId, setInicialId] = useState<number | null>(null);
  const [nombreGuardado, setNombreGuardado] = useState("");
  // Lo que se escribe, y lo último que quedó guardado (para saber qué cambió).
  const [ficha, setFicha] = useState<FormFicha>(() => {
    // «Crear paciente «X»» desde la lista: lo que se buscó, ya puesto.
    const f = fichaVacia();
    const nombre = params.get("nombre")?.trim();
    const ci = params.get("ci")?.trim();
    // Lo que empieza con un número es el carnet («1112223 LP»); lo demás, el nombre.
    if (ci && empiezaConDigito(ci)) f.ci = ci;
    else if (nombre) f.nombre = nombre;
    return f;
  });
  const [control, setControl] = useState<FormControl>(() => controlVacio());
  const [fichaGuardada, setFichaGuardada] = useState<FormFicha>(() => fichaVacia());
  const [controlGuardado, setControlGuardado] = useState<FormControl>(() => controlVacio());

  const [etapa, setEtapa] = useState<Etapa>(() => etapaDe(params.get("etapa")));
  const [carga, setCarga] = useState<{ cargando: boolean; falla: unknown }>({ cargando: true, falla: null });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [carnet, setCarnet] = useState<{ id: number; texto: string } | null>(null);
  const [tocados, setTocados] = useState<Set<CampoForm>>(() => new Set());
  const [intento, setIntento] = useState(false);
  const [cinta, setCinta] = useState<Cinta | null>(null);
  const contenido = useRef<HTMLDivElement>(null);
  const pie = useRef<HTMLDivElement>(null);
  /** De qué paciente es lo que hay en los campos: no se pisa con una recarga. */
  const hidratado = useRef<number | null>(null);
  const carnetRevisado = useRef<{ ci: string; encontrado: { id: number; texto: string } | null }>({ ci: "", encontrado: null });
  /** El carnet que está escrito ahora (para descartar una respuesta que llegó tarde). */
  const ciEscrito = useRef(ficha.ci);
  ciEscrito.current = ficha.ci;

  /** Llena los campos con lo guardado (para editar). */
  const hidratar = useCallback((p: Paciente, cat: Catalogo | null) => {
    const f = fichaDesde(p);
    const inicial = p.controles.find((c) => c.inicial) ?? p.controles[0] ?? null;
    const c = inicial
      ? controlDesde(inicial, {
          catalogo: cat,
          sexo: p.sexo,
          edad: p.edad,
          fechaNacimiento: p.fechaNacimiento,
          edadDeclarada: p.edadDeclarada,
          edadDeclaradaEn: p.edadDeclaradaEn,
        })
      : controlVacio();
    setFicha(f);
    setFichaGuardada(f);
    setControl(c);
    setControlGuardado(c);
    setInicialId(inicial?.id ?? null);
    setPacienteId(p.id);
    setNombreGuardado(p.nombre);
    hidratado.current = p.id;
  }, []);

  const cargar = useCallback(() => {
    setCarga({ cargando: true, falla: null });
    // El catálogo hace falta para saber si un grado guardado lo eligió la doctora.
    const pedidos: [Promise<Catalogo>, Promise<Paciente | null>] = [
      pedirCatalogo(),
      idRuta != null && hidratado.current !== idRuta ? apiNutricion.paciente(idRuta) : Promise.resolve(null),
    ];
    Promise.all(pedidos)
      .then(([cat, p]) => {
        setCatalogo(cat);
        if (p) hidratar(p, cat);
        setCarga({ cargando: false, falla: null });
      })
      .catch((e: unknown) => setCarga({ cargando: false, falla: e }));
  }, [idRuta, hidratar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El campo que recibe el foco (con Tab, con Enter o tocándolo en el
  // celular) queda entero por encima del pie fijo: si quedaría tapado, la
  // pantalla sube lo justo. El navegador sólo mira la ventana, no el pie.
  useEffect(() => {
    const zona = contenido.current;
    if (!zona) return;
    const alEnfocar = (e: FocusEvent) => {
      const campo = e.target as HTMLElement;
      const tope = pie.current?.getBoundingClientRect().top;
      if (tope == null || !campo.getBoundingClientRect) return;
      const tapado = campo.getBoundingClientRect().bottom + 12 - tope;
      if (tapado > 0) campo.closest("main")?.scrollBy({ top: tapado });
    };
    zona.addEventListener("focusin", alEnfocar);
    return () => zona.removeEventListener("focusin", alEnfocar);
  }, [etapa, carga.cargando]);

  const hoy = hoyIso();
  const errores = validar(ficha, control, hoy);
  const sucio = hayCambios(fichaAInput(fichaGuardada), fichaAInput(ficha)) || hayCambios(controlAInput(controlGuardado), controlAInput(control));
  // En toda la app: el menú lateral, el cajón del celular y el atrás del
  // navegador también preguntan (antes se perdía lo escrito sin aviso).
  const salida = useSalidaConCambios(sucio, { todaLaApp: true });
  // El nombre ya es el título: el enlace dice a dónde vuelve.
  const volver = pacienteId != null ? { a: `/evaluacion/${pacienteId}`, texto: "Planilla del paciente" } : { a: "/evaluacion", texto: "Pacientes" };

  const cambiarFicha: PropsEtapa["cambiarFicha"] = (campo, valor) => {
    setFicha((f) => ({ ...f, [campo]: valor }));
    if (campo === "ci") {
      setCarnet(null);
      // «Ese carnet ya es de…» del último guardado ya no vale para el carnet nuevo.
      if (carnet) setError((e) => (e === carnet.texto ? "" : e));
    }
  };
  const cambiarEnfermedad: PropsEtapa["cambiarEnfermedad"] = (codigo, siguiente) =>
    setFicha((f) => {
      const enfermedades = { ...f.enfermedades };
      const nueva = siguiente(enfermedades[codigo]);
      if (nueva) enfermedades[codigo] = nueva;
      else delete enfermedades[codigo];
      return { ...f, enfermedades };
    });
  const cambiarControl: PropsEtapa["cambiarControl"] = (campo, valor) => setControl((c) => ({ ...c, [campo]: valor }));
  const elegirGrado = (medida: MedidaConTabla, grado: string | null) => setControl((c) => ({ ...c, grados: { ...c.grados, [medida]: grado } }));
  const tocar = (campo: CampoForm) => setTocados((t) => (t.has(campo) ? t : new Set(t).add(campo)));
  const mostrarError = (campo: CampoForm) => (intento || tocados.has(campo) ? errores[campo] : null);

  const irA = (n: Etapa) => {
    setEtapa(n);
    setCinta(null);
    contenido.current?.closest("main")?.scrollTo({ top: 0 });
    // La dirección sigue a la etapa: un F5 vuelve a la misma, no a la del primer guardado.
    if (pacienteId != null && params.get("etapa") !== String(n)) {
      navigate(`/evaluacion/${pacienteId}/editar?etapa=${n}`, { replace: true });
    }
  };

  /**
   * ¿El carnet ya es de un paciente? (§4.2: el carnet va primero, para
   * encontrar rápido al que ya vino). Se pregunta con una pausa corta mientras
   * se escribe, al salir del campo y con `Enter`; la respuesta de cada carnet
   * se guarda, así no se pregunta dos veces lo mismo. Devuelve el paciente que
   * lo tiene, o null (también sin red: al guardar, el servidor dice lo mismo).
   */
  const revisarCarnet = useCallback(
    async (ci: string): Promise<{ id: number; texto: string } | null> => {
      const t = ci.trim();
      if (!t) return null;
      // Si mientras tanto se siguió escribiendo, la respuesta ya no es la del campo.
      const sigueIgual = () => ciEscrito.current.trim() === t;
      const ya = carnetRevisado.current;
      if (ya.ci === t) {
        if (sigueIgual()) setCarnet(ya.encontrado);
        return ya.encontrado;
      }
      try {
        // Si es el mismo carnet lo decide el servidor (puntos, espacios, el guion
        // del complemento, la expedición pegada), entre activos y archivados.
        const delCarnet = await apiNutricion.delCarnet(t);
        const mismo = delCarnet.items.find((x) => x.id !== pacienteId);
        const encontrado = mismo ? { id: mismo.id, texto: `Ya está registrado: ${mismo.nombre}` } : null;
        carnetRevisado.current = { ci: t, encontrado };
        if (sigueIgual()) setCarnet(encontrado);
        return encontrado;
      } catch {
        return null;
      }
    },
    [pacienteId],
  );

  // La pausa corta: medio segundo sin teclear en el carnet.
  useEffect(() => {
    const t = ficha.ci.trim();
    if (!t) return;
    const espera = setTimeout(() => void revisarCarnet(t), 500);
    return () => clearTimeout(espera);
  }, [ficha.ci, revisarCarnet]);

  /** `Enter` en el carnet: si ya es de alguien, el foco va a «Abrir su ficha» (otro Enter la abre); si no, al nombre. */
  async function enterEnCarnet() {
    const encontrado = await revisarCarnet(ficha.ci);
    // El aviso se dibuja YA: si la respuesta llegó recién, «Abrir su ficha»
    // todavía no existe y el foco se quedaba en el carnet (prueba integrada).
    if (ciEscrito.current.trim() === ficha.ci.trim()) flushSync(() => setCarnet(encontrado));
    document.getElementById(encontrado ? "ev-abrir-ficha" : "ev-nombre")?.focus();
  }

  /**
   * Abrir la ficha del que ya tiene ese carnet. Si lo único escrito es el
   * carnet, va directo; con más datos escritos, pregunta antes de perderlos.
   */
  const abrirDelCarnet = (idOtro: number) => {
    const sinCarnet = (f: FormFicha) => fichaAInput({ ...f, ci: "", ciExpedido: "" });
    const algoMas = hayCambios(sinCarnet(fichaGuardada), sinCarnet(ficha)) || hayCambios(controlAInput(controlGuardado), controlAInput(control));
    const ir = () => navigate(`/evaluacion/${idOtro}`);
    if (algoMas) salida.salirSi(ir);
    else ir();
  };

  /** Guarda lo que haya cambiado. Devuelve el id del paciente, o null si no se pudo. */
  async function guardar(): Promise<number | null> {
    setIntento(true);
    const conError = (Object.keys(errores) as CampoForm[]).filter((c) => errores[c]);
    if (conError.length) {
      // Si el error está en otra etapa, se va a ella: no se guarda un dedazo.
      const aca = conError.some((c) => ETAPA_DEL_CAMPO[c] === etapa || (c === "pesoKg" && etapa === 4) || (c === "tallaCm" && etapa === 4));
      if (!aca) irA(ETAPA_DEL_CAMPO[conError[0]]);
      setError("Hay un dato para revisar antes de guardar.");
      return null;
    }
    setGuardando(true);
    setError("");
    // Lo que se manda es lo de ESTE momento: si se sigue escribiendo mientras
    // guarda, eso queda «Sin guardar».
    const fichaEnviada = ficha;
    const controlEnviado = control;
    const fi = fichaAInput(fichaEnviada);
    const ci = controlAInput(controlEnviado);
    let idPaciente = pacienteId;
    // Lo guardado, como lo dejó el servidor: el carnet «8958703 SC» queda
    // «8958703» con «SC» en Exp. Si mientras guardaba se cambió el carnet, lo
    // escrito no se pisa (y queda «Sin guardar»).
    const fichaGuardadaDe = (p: Paciente) => {
      const guardada = conLoDelServidor(fichaEnviada, p);
      setFichaGuardada(guardada);
      setFicha((f) =>
        f.ci === fichaEnviada.ci && f.ciExpedido === fichaEnviada.ciExpedido
          ? { ...f, ci: guardada.ci, ciExpedido: guardada.ciExpedido, edadAnotada: guardada.edadAnotada }
          : { ...f, edadAnotada: guardada.edadAnotada },
      );
    };
    try {
      let detalle: Paciente | null = null;
      if (idPaciente == null) {
        const alta: AltaPacienteInput = { ...soloConValor(fi), nombre: fi.nombre };
        if (controlConDatos(controlEnviado)) alta.control = soloConValor(ci);
        detalle = await apiNutricion.crear(alta);
        idPaciente = detalle.id;
        hidratado.current = detalle.id;
        setPacienteId(detalle.id);
        fichaGuardadaDe(detalle);
        if (alta.control) {
          setControlGuardado(controlEnviado);
          setInicialId(detalle.controles.find((c) => c.inicial)?.id ?? detalle.controles[0]?.id ?? null);
        }
      } else {
        const cf = cambios(fichaAInput(fichaGuardada), fi);
        if (Object.keys(cf).length) {
          detalle = await apiNutricion.editar(idPaciente, cf);
          fichaGuardadaDe(detalle);
        }
        if (inicialId != null) {
          const cc = cambiosDeControl(controlGuardado, controlEnviado);
          if (Object.keys(cc).length) {
            detalle = await apiNutricion.editarControl(inicialId, cc);
            setControlGuardado(controlEnviado);
          }
        } else if (controlConDatos(controlEnviado)) {
          detalle = await apiNutricion.crearControl(idPaciente, soloConValor(ci));
          setControlGuardado(controlEnviado);
          setInicialId(detalle.controles.find((c) => c.inicial)?.id ?? detalle.controles[0]?.id ?? null);
        }
      }
      if (detalle) setNombreGuardado(detalle.nombre);
      return idPaciente;
    } catch (e) {
      const otro = pacienteDelCarnet(e);
      if (otro) {
        setCarnet({ id: otro, texto: e instanceof Error ? e.message : "Ese carnet ya es de otro paciente." });
        irA(1);
      }
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      return null;
    } finally {
      setGuardando(false);
    }
  }

  async function guardarYSeguir() {
    if (guardando) return;
    const eraNuevo = pacienteId == null;
    const desde = etapa;
    const idPaciente = await guardar();
    if (idPaciente == null) return;
    setIntento(false);
    if (desde === 4) {
      navigate(`/evaluacion/${idPaciente}`);
      return;
    }
    const siguiente = (desde + 1) as Etapa;
    // Recién dado de alta: la dirección pasa a la de editar (un F5 no hace otra alta).
    if (eraNuevo) navigate(`/evaluacion/${idPaciente}/editar?etapa=${siguiente}`, { replace: true });
    irA(siguiente);
  }

  const atras = () => {
    if (etapa > 1) irA((etapa - 1) as Etapa);
    else salida.salirSi(() => navigate(volver.a));
  };

  useTeclas((e) => {
    if (hayDialogoAbierto()) return;
    const n = altNumero(e);
    if (n != null && n >= 1 && n <= 4) {
      e.preventDefault();
      irA(n as Etapa);
      return;
    }
    if (ctrlEnter(e)) {
      e.preventDefault();
      void guardarYSeguir();
    }
  });

  // `Enter` en un campo de una línea pasa al siguiente; en el último, al botón.
  const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const el = e.target as HTMLElement;
    if (el.tagName !== "INPUT") return;
    e.preventDefault();
    if (el.id === "ev-ci") {
      void enterEnCarnet();
      return;
    }
    if (!pasarAlSiguiente(contenido.current, el)) document.getElementById("ev-guardar")?.focus();
  };

  if (carga.cargando && idRuta != null && hidratado.current !== idRuta) return <Cargando texto="Cargando la evaluación…" />;
  if (carga.falla && (idRuta == null || hidratado.current !== idRuta)) {
    return (
      <Pagina ancho="max-w-5xl">
        {esNoEncontrado(carga.falla) ? (
          <Vacio
            icono="search"
            titulo="No encontramos este paciente"
            texto="Puede que ya no exista."
            accion={
              <Link to="/evaluacion" className="text-sm font-semibold text-primary-700 hover:underline">
                Volver a los pacientes
              </Link>
            }
          />
        ) : (
          <ErrorMsg onReintentar={cargar}>{carga.falla instanceof Error ? carga.falla.message : "No se pudo cargar."}</ErrorMsg>
        )}
      </Pagina>
    );
  }

  // El IMC imposible se avisa al salir de la talla o del peso (no a mitad de
  // escribirlos: «1» de «170» con 127 kg daría 127), o enseguida si ya venía
  // guardado así (el de QA: 127 kg con 80 cm de talla, IMC 198,4).
  const verAvisoImc =
    intento ||
    tocados.has("tallaCm") ||
    tocados.has("pesoKg") ||
    (ficha.tallaCm === fichaGuardada.tallaCm && control.pesoKg === controlGuardado.pesoKg);
  const props: PropsEtapa = {
    ficha,
    control,
    catalogo,
    cambiarFicha,
    cambiarEnfermedad,
    cambiarControl,
    elegirGrado,
    error: mostrarError,
    tocar,
    irAFicha: () => irA(1),
    avisoImc: verAvisoImc ? avisoImc(imcDeLoEscrito(control.pesoKg, ficha.tallaCm)) : null,
  };

  // Al abrir el alta en la PC, el foco en el carnet (lo primero); si el carnet
  // ya vino de la lista («Crear paciente «X»»), en el nombre. Editando, en
  // ninguno. Con el dedo, en ninguno: el teclado sube al tocar el campo (`foco.ts`).
  const enfocarAlAbrir = pacienteId != null || !enfocaSolo() ? null : params.get("ci") ? "nombre" : "ci";
  const estado = guardando ? "guardando" : sucio ? (pacienteId == null ? "nuevo" : "sinGuardar") : pacienteId == null ? "nuevo" : "guardado";
  // Bien visible: es la diferencia entre seguir con un paciente que ya vino o duplicarlo.
  const avisoCarnet: ReactNode = carnet ? (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-warning-borde bg-warning-suave px-4 py-3"
    >
      <p className="flex min-w-0 items-start gap-2.5 text-[15px] font-semibold text-warning-text">
        <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
        <span className="min-w-0 break-words">{carnet.texto}</span>
      </p>
      <Boton id="ev-abrir-ficha" icono="arrowRight" onClick={() => abrirDelCarnet(carnet.id)} className="shrink-0">
        Abrir su ficha
      </Boton>
    </div>
  ) : null;

  return (
    <Pagina ancho="max-w-5xl" className="pb-0!" onClickCapture={salida.alClicEnEnlace}>
      <EncabezadoPagina
        volver={volver}
        titulo={pacienteId == null ? "Nueva evaluación" : nombreGuardado || ficha.nombre || "Evaluación"}
        bajada={pacienteId == null ? "Evaluación inicial del paciente, en cuatro pasos." : "Evaluación inicial: la ficha y las medidas del primer control."}
      />

      <nav aria-label="Etapas de la evaluación">
        <ol className="grid grid-cols-4 gap-1.5 sm:gap-3">
          {ETAPAS.map((e) => {
            const actual = e.n === etapa;
            return (
              <li key={e.n} className="min-w-0">
                <button
                  type="button"
                  onClick={() => irA(e.n)}
                  aria-current={actual ? "step" : undefined}
                  title={`${e.titulo} (Alt+${e.n})`}
                  className={`flex w-full min-w-0 flex-col items-center gap-1.5 rounded-xl border px-1 py-2 text-center transition-colors sm:flex-row sm:gap-2.5 sm:px-3 sm:text-left ${
                    actual ? "border-primary bg-primary-50" : "border-borde bg-white hover:border-primary-200 hover:bg-muted"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                      actual ? "bg-primary-boton text-white" : "bg-slate-100 text-texto-3"
                    }`}
                  >
                    {e.n}
                  </span>
                  <span className={`min-w-0 text-[12px] font-semibold leading-tight sm:text-[13px] ${actual ? "text-primary-700" : "text-texto-2"}`}>
                    <span className="sm:hidden">{e.corto}</span>
                    <span className="hidden sm:inline">{e.titulo}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div ref={contenido} onKeyDown={alTeclear}>
        {etapa === 1 && (
          <EtapaFicha
            {...props}
            avisoCarnet={avisoCarnet}
            onSalirCarnet={() => void revisarCarnet(ficha.ci)}
            enfocar={enfocarAlAbrir}
          />
        )}
        {etapa === 2 && <EtapaMedidas {...props} cinta={cinta} onCinta={setCinta} />}
        {etapa === 3 && <EtapaComposicion {...props} />}
        {etapa === 4 && <EtapaPesoImc {...props} />}
      </div>

      {/* El pie fijo: el estado y los dos botones, siempre a mano. Flota sobre
          lo que se desplaza, con el mismo ancho que las tarjetas. */}
      <div ref={pie} className="sticky bottom-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4">
        <div className="rounded-2xl border border-borde bg-white/95 px-4 py-3 shadow-[0_-6px_24px_rgba(15,23,42,0.08)] backdrop-blur">
        {error && (
          <p className="mb-2 flex items-start gap-2 text-[13px] font-semibold text-danger-text" role="alert">
            <Icon name="alert" size={15} className="mt-px shrink-0" />
            {error}
          </p>
        )}
        {/* En el celular, el estado arriba y los botones a lo ancho: juntos no entran sin apretarse. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <EstadoGuardado estado={estado} />
          <div className="flex items-center gap-2">
            <Boton variante="ghost" onClick={atras} disabled={guardando}>
              Atrás
            </Boton>
            <Boton
              id="ev-guardar"
              className="flex-1 sm:flex-none"
              onClick={() => void guardarYSeguir()}
              disabled={guardando}
              title={`${etapa === 4 ? "Terminar evaluación" : "Guardar y seguir"} (Ctrl+Enter)`}
            >
              {etapa === 4 ? "Terminar evaluación" : "Guardar y seguir"}
              <Tecla sobreColor>Ctrl+Enter</Tecla>
            </Boton>
          </div>
        </div>
        </div>
      </div>

      <ModalSalida
        salida={salida}
        titulo="¿Salir sin guardar?"
        seguir="Seguir con la evaluación"
        guardando={guardando}
        onGuardar={async () => (await guardar()) != null}
      >
        Hay datos de la evaluación que todavía no se guardaron.
      </ModalSalida>
    </Pagina>
  );
}
