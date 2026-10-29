import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "../../components/Icon";
import PanelLateral from "../../components/PanelLateral";
import { Boton } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import {
  completo,
  cuantosHechos,
  EVENTO_PRIMEROS_PASOS,
  pasosBase,
  pasosEsperados,
  pasosPrimeros,
} from "../../lib/academia/primerosPasos";
import type { AjustesAcademia, Carrera, Docente, GrupoResumen, Sede } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { api, ApiError } from "../../lib/api";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { claseBotonFila } from "./piezas";

/**
 * L1 (28-oct) · «Configuración rápida»: la lista de pasos que le dice a un
 * instituto nuevo por dónde empezar (C1 de la auditoría del 26-oct). Era una
 * tarjeta grande arriba del Calendario, el Panel de control y cada pestaña de
 * la Configuración, que empujaba todo hacia abajo; ahora es un botón con un
 * anillo "n/N" y un punto, en el encabezado, que abre la misma lista en el
 * panel lateral. Se marca sola con los datos que ya existen (sedes, ajustes,
 * cursos, docentes y grupos) y el botón desaparece al completarse, con un
 * "¡Listo!" corto si se completó con la pantalla abierta.
 *
 * El «Ya lo sé» y el «ya se abrió solo una vez» (con la academia recién
 * creada, 0 pasos hechos) viven en los ajustes del instituto, para que valgan
 * en todos los equipos. En este navegador queda además una marca (oculto o
 * completo) para no repetir 5–7 pedidos cada vez; si el almacenamiento no
 * anda, simplemente se vuelve a preguntar. La recepción y el docente no la
 * ven: no son quienes arman el instituto.
 */

type Marca = "oculto" | "completo";

const clave = (negocioId: number | undefined) => `bamardev_primeros_pasos_${negocioId ?? 0}`;
const claveSesion = (negocioId: number | undefined) => `bamardev_configuracion_rapida_abierta_${negocioId ?? 0}`;

function leerMarca(negocioId: number | undefined): Marca | null {
  try {
    const v = localStorage.getItem(clave(negocioId));
    return v === "oculto" || v === "completo" ? v : null;
  } catch {
    return null;
  }
}

function guardarMarca(negocioId: number | undefined, marca: Marca) {
  try {
    localStorage.setItem(clave(negocioId), marca);
  } catch {
    // Modo privado o almacenamiento bloqueado: se vuelve a preguntar la próxima vez.
  }
}

/**
 * Si el panel ya se abrió solo en esta sesión. Respaldo de `primerosPasosVistos`
 * para que, si ese guardado falla (o el backend es anterior), no se abra solo en
 * cada pantalla que lo tiene.
 */
function yaSeAbrioEnLaSesion(negocioId: number | undefined): boolean {
  try {
    return sessionStorage.getItem(claveSesion(negocioId)) === "1";
  } catch {
    return false;
  }
}

function anotarAperturaEnLaSesion(negocioId: number | undefined) {
  try {
    sessionStorage.setItem(claveSesion(negocioId), "1");
  } catch {
    // Sin almacenamiento: queda `primerosPasosVistos` en el backend.
  }
}

/** Un guardado de ajustes que no rompe nada si falla: es una preferencia. */
const recordar = (cambios: Pick<AjustesAcademia, "primerosPasosOcultos" | "primerosPasosVistos">) =>
  void Promise.resolve()
    .then(() => apiAcademia.guardarAjustes(cambios))
    .catch(() => undefined);

/**
 * Lo que la pantalla que la contiene ya tiene cargado (el Calendario pide los
 * ajustes y los cursos para sí): se usa tal cual en vez de pedirlo otra vez
 * (ronda 2, M4). `undefined` = que los pida ella; `null` = se pidió y no se pudo.
 */
export interface DatosYaCargados {
  ajustes?: AjustesAcademia | null;
  cursos?: Carrera[] | null;
}

interface Cargado {
  sedes: Sede[] | null;
  ajustes: AjustesAcademia | null;
  cursos: Carrera[] | null;
  docentes: Docente[] | null;
  grupos: GrupoResumen[] | null;
  qrCargado: boolean | null;
  pinPuesto: boolean | null;
  /** Algún pedido de los pasos de siempre falló por falta de permiso (403)... */
  sinPermiso: boolean;
  /** ...o por otra cosa (un corte, un 500): ahí no se da nada por sabido. */
  fallo: boolean;
}

export default function PrimerosPasos({ ajustes, cursos }: DatosYaCargados = {}) {
  const { usuario, negocio, rubro } = useAuth();
  const [marca, setMarca] = useState<Marca | null>(() => leerMarca(negocio?.id));
  // Sólo quien arma el instituto. Y sin pedir nada al backend si no le toca verla.
  const configura = rubro === "ACADEMIA" && tienePermiso(usuario, "academia.configurar");
  if (!configura || marca) return null;
  return (
    <ConfiguracionRapida
      ajustesYa={ajustes}
      cursosYa={cursos}
      onOcultar={() => {
        guardarMarca(negocio?.id, "oculto");
        setMarca("oculto");
      }}
      onCompleta={() => {
        guardarMarca(negocio?.id, "completo");
        setMarca("completo");
      }}
    />
  );
}

/** Lo que dura el "¡Listo!" antes de que el botón se vaya. */
const MS_LISTO = 4000;

function ConfiguracionRapida({
  ajustesYa,
  cursosYa,
  onOcultar,
  onCompleta,
}: {
  ajustesYa: AjustesAcademia | null | undefined;
  cursosYa: Carrera[] | null | undefined;
  onOcultar: () => void;
  onCompleta: () => void;
}) {
  const p = usePalabras();
  const { negocio, usuario } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [listo, setListo] = useState(false);
  // Se vuelve a leer al cambiar de pestaña de la Configuración (el componente no
  // se remonta entre ellas) y cuando una pantalla avisa que guardó algo (R3).
  const { pathname } = useLocation();
  // Lo que ya tiene la pantalla de arriba, leído al pedir (no es una dependencia).
  const ya = useRef({ ajustes: ajustesYa, cursos: cursosYa });
  ya.current = { ajustes: ajustesYa, cursos: cursosYa };
  const features = negocio?.features;
  const negocioId = negocio?.id;
  const yoId = usuario?.id;
  // Sólo se pregunta por lo que a esta persona le toca resolver.
  const puedeQr = tienePermiso(usuario, "qr.configurar") && !!features?.includes("pago_qr_mixto");
  const puedePin =
    tienePermiso(usuario, "usuarios.administrar") &&
    tienePermiso(usuario, "usuarios.asignar_pin") &&
    !!features?.includes("usuarios") &&
    !!features?.includes("autorizacion_pin");

  const carga = useApi<Cargado>(async () => {
    const estado = { sinPermiso: false, fallo: false };
    /** Un pedido que si falla (un permiso, un corte) deja `null` en vez de romper: ese paso no se muestra. */
    const segura = <T,>(pedir: () => Promise<T>) =>
      Promise.resolve()
        .then(pedir)
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 403) estado.sinPermiso = true;
          else estado.fallo = true;
          return null;
        });
    // El QR y el PIN no cuentan para «no se pudo saber»: si fallan, el paso no aparece y ya.
    const opcional = <T,>(pedir: () => Promise<T>) => Promise.resolve().then(pedir).catch(() => null);
    const [sedes, ajustes, cursos, docentes, grupos, qr, yo] = await Promise.all([
      segura(() => apiAcademia.sedes()),
      ya.current.ajustes !== undefined ? ya.current.ajustes : segura(() => apiAcademia.ajustes()),
      ya.current.cursos !== undefined ? ya.current.cursos : segura(() => apiAcademia.carreras()),
      segura(() => apiAcademia.docentes()),
      // Alcanza con las más nuevas: sólo se mira si hay alguna abierta (M4).
      segura(async () => (await apiAcademia.grupos({ pageSize: 10 })).items),
      puedeQr ? opcional(() => api.qrCobro()) : null,
      puedePin && yoId != null ? opcional(() => api.getUsuario(yoId)) : null,
    ]);
    return {
      sedes,
      ajustes,
      cursos,
      docentes,
      grupos,
      qrCargado: qr ? !!qr.imagen : null,
      pinPuesto: yo ? yo.tienePin : null,
      ...estado,
    };
  }, [pathname]);

  useEffect(() => {
    window.addEventListener(EVENTO_PRIMEROS_PASOS, carga.recargar);
    return () => window.removeEventListener(EVENTO_PRIMEROS_PASOS, carga.recargar);
  }, [carga.recargar]);

  const d = carga.datos;
  const ajustes = ajustesYa !== undefined ? ajustesYa : (d?.ajustes ?? null);
  const pasos = d
    ? pasosPrimeros({
        sedes: d.sedes,
        ajustes,
        cursos: cursosYa !== undefined ? cursosYa : d.cursos,
        docentes: d.docentes,
        grupos: d.grupos,
        features,
        qrCargado: d.qrCargado,
        pinPuesto: d.pinPuesto,
        palabras: { carrera: p.carrera, docente: p.docente, sede: p.sede, Sede: p.Sede, Sedes: p.Sedes },
      })
    : [];
  const hay = !!d && pasos.length > 0;
  const terminada = hay && completo(pasos);
  const hechos = cuantosHechos(pasos);
  // «Completa» se recuerda sólo si no queda nada por saber: con todos los pasos a
  // la vista, o con los que faltan ocultos únicamente por un permiso que esta
  // persona no tiene (sin eso, un rol sin acceso a algo la pedía para siempre: M4).
  // Un corte o un 500 no cuentan: ahí no se la da por terminada.
  const sinDudas = !!d && (pasosBase(pasos).length >= pasosEsperados(features) || (d.sinPermiso && !d.fallo));
  // El «Ya lo sé» que se dio en otro equipo.
  const ocultoEnOtroEquipo = !!ajustes?.primerosPasosOcultos;

  useEffect(() => {
    if (ocultoEnOtroEquipo) onOcultar();
    // `onOcultar` cambia en cada render del padre; sólo importa cuándo llega la marca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocultoEnOtroEquipo]);

  // Se vio a medias en esta visita: al completarse se dice "¡Listo!" antes de irse.
  const vioIncompleta = useRef(false);
  useEffect(() => {
    if (hay && !terminada) vioIncompleta.current = true;
  }, [hay, terminada]);
  useEffect(() => {
    if (!terminada) return;
    if (!vioIncompleta.current) {
      if (sinDudas) onCompleta();
      return;
    }
    setAbierto(false);
    setListo(true);
    const t = setTimeout(() => {
      setListo(false);
      if (sinDudas) onCompleta();
    }, MS_LISTO);
    return () => clearTimeout(t);
    // `onCompleta` cambia en cada render del padre; sólo importa el momento en que se completa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminada, sinDudas]);

  // Una academia recién creada (nada hecho): el panel se abre solo, UNA vez en
  // todos los equipos (`primerosPasosVistos`). Después queda el botón.
  const abreSolo = hay && !terminada && hechos === 0 && !!ajustes && !ajustes.primerosPasosVistos && !ajustes.primerosPasosOcultos;
  useEffect(() => {
    if (!abreSolo || yaSeAbrioEnLaSesion(negocioId)) return;
    anotarAperturaEnLaSesion(negocioId);
    setAbierto(true);
    recordar({ primerosPasosVistos: true });
  }, [abreSolo, negocioId]);

  if (listo) {
    return (
      <span
        role="status"
        className="inline-flex h-[42px] items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 text-sm font-semibold text-emerald-700 motion-safe:animate-[velo-aparece_.2s_ease-out]"
      >
        <Icon name="check" size={16} /> ¡Listo! Configuración completa
      </span>
    );
  }
  if (!hay || terminada || ocultoEnOtroEquipo) return null;

  const total = pasos.length;
  const yaLoSe = () => {
    setAbierto(false);
    recordar({ primerosPasosOcultos: true });
    onOcultar();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={`Configuración rápida: ${hechos} de ${total} listos`}
        title="Lo que falta para dejar el instituto listo"
        className="relative inline-flex h-[42px] shrink-0 items-center gap-2 rounded-xl border border-borde bg-white pl-1.5 pr-1.5 text-sm font-semibold text-texto-2 transition-colors hover:border-primary-200 hover:bg-muted sm:pr-3.5"
      >
        <Anillo hechos={hechos} total={total} />
        <span className="hidden whitespace-nowrap sm:inline">Configuración rápida</span>
        {/* El punto: falta algo. */}
        <span aria-hidden="true" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warning-text ring-2 ring-white" />
      </button>

      <PanelLateral
        abierto={abierto}
        titulo="Configuración rápida"
        subtitulo={`${hechos} de ${total} listos. Se marca sola a medida que lo vas cargando.`}
        onClose={() => setAbierto(false)}
        acciones={
          <>
            <Boton variante="ghost" onClick={yaLoSe}>
              Ya lo sé
            </Boton>
            <p className="text-center text-[12px] text-texto-3">Oculta este botón en todos los equipos.</p>
          </>
        }
      >
        <div
          role="progressbar"
          aria-label="Configuración rápida"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={hechos}
          className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(hechos / total) * 100}%` }} />
        </div>
        <ol className="divide-y divide-borde-soft">
          {pasos.map((paso, i) => (
            <li key={paso.clave} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  paso.hecho ? "bg-emerald-100 text-emerald-700" : "border border-borde bg-white text-texto-3"
                }`}
              >
                {paso.hecho ? <Icon name="check" size={14} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 basis-40">
                <span className={`block text-sm font-semibold ${paso.hecho ? "text-texto-3 line-through decoration-texto-4/60" : "text-texto"}`}>
                  <span className="sr-only">{paso.hecho ? "Listo: " : "Falta: "}</span>
                  {paso.titulo}
                </span>
                {!paso.hecho && <span className="block text-[13px] text-texto-3">{paso.detalle}</span>}
              </span>
              {!paso.hecho && (
                // Ir a otra pantalla cierra el panel: si no, quedaba tapando la que se abrió.
                <Link to={paso.a} onClick={() => setAbierto(false)} className={claseBotonFila("soft")}>
                  {paso.accion}
                  <Icon name="chevronRight" size={15} />
                </Link>
              )}
            </li>
          ))}
        </ol>
      </PanelLateral>
    </>
  );
}

/** El anillo de progreso con "n/N" adentro. */
function Anillo({ hechos, total }: { hechos: number; total: number }) {
  const r = 13;
  const largo = 2 * Math.PI * r;
  return (
    <span aria-hidden="true" className="relative flex h-8 w-8 shrink-0 items-center justify-center">
      <svg viewBox="0 0 32 32" className="absolute inset-0 h-8 w-8 -rotate-90">
        <circle cx="16" cy="16" r={r} fill="none" strokeWidth="3" className="stroke-muted" />
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={largo}
          strokeDashoffset={largo * (1 - hechos / Math.max(1, total))}
          className="stroke-primary transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span className="relative text-[10px] font-bold tabular-nums text-texto-2">
        {hechos}/{total}
      </span>
    </span>
  );
}
