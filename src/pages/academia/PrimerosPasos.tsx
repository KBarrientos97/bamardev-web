import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "../../components/Icon";
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
import { BotonFila, claseBotonFila, Tarjeta } from "./piezas";

/**
 * C1 · «Primeros pasos» (auditoría 26-oct): la lista de seis casillas que le
 * dice a un instituto nuevo por dónde empezar. Va arriba del Calendario y de
 * la Configuración mientras haya pasos pendientes. Se marca sola con los datos
 * que ya existen (sedes, ajustes, cursos, docentes y grupos: nada nuevo en el
 * backend) y desaparece sola al completarse. Quien configura también puede
 * ocultarla con «Ya lo sé»; esa preferencia, y el «ya está completa», se
 * guardan en este navegador (si el almacenamiento no anda, la lista simplemente
 * vuelve a mostrarse). La recepción y el docente no la ven: no son quienes
 * arman el instituto.
 */

type Marca = "oculto" | "completo";

const clave = (negocioId: number | undefined) => `bamardev_primeros_pasos_${negocioId ?? 0}`;

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
    // Modo privado o almacenamiento bloqueado: se vuelve a mostrar la próxima vez.
  }
}

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
    <ListaPrimerosPasos
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

function ListaPrimerosPasos({
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
  // Se vuelve a leer al cambiar de pestaña de la Configuración (el componente no
  // se remonta entre ellas) y cuando una pantalla avisa que guardó algo (R3).
  const { pathname } = useLocation();
  // Lo que ya tiene la pantalla de arriba, leído al pedir (no es una dependencia).
  const ya = useRef({ ajustes: ajustesYa, cursos: cursosYa });
  ya.current = { ajustes: ajustesYa, cursos: cursosYa };
  const features = negocio?.features;
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

  // Sólo la primera lectura esconde la lista; una relectura la deja a la vista y la actualiza.
  const d = carga.datos;
  const pasos = d
    ? pasosPrimeros({
        sedes: d.sedes,
        ajustes: ajustesYa !== undefined ? ajustesYa : d.ajustes,
        cursos: cursosYa !== undefined ? cursosYa : d.cursos,
        docentes: d.docentes,
        grupos: d.grupos,
        features,
        qrCargado: d.qrCargado,
        pinPuesto: d.pinPuesto,
        palabras: { carrera: p.carrera, docente: p.docente, sede: p.sede, Sede: p.Sede, Sedes: p.Sedes },
      })
    : [];
  const lista = !!d && pasos.length > 0;
  const terminada = lista && completo(pasos);
  // «Completa» se recuerda sólo si no queda nada por saber: con todos los pasos a
  // la vista, o con los que faltan ocultos únicamente por un permiso que esta
  // persona no tiene (sin eso, un rol sin acceso a algo la pedía para siempre: M4).
  // Un corte o un 500 no cuentan: ahí no se la da por terminada.
  const sinDudas = !!d && (pasosBase(pasos).length >= pasosEsperados(features) || (d.sinPermiso && !d.fallo));
  useEffect(() => {
    if (terminada && sinDudas) onCompleta();
    // `onCompleta` cambia en cada render del padre; sólo importa el momento en que se completa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminada, sinDudas]);

  if (!lista || terminada) return null;
  const hechos = cuantosHechos(pasos);

  return (
    <Tarjeta
      titulo="Primeros pasos"
      id="t-primeros-pasos"
      bajada={`${hechos} de ${pasos.length} listos. Se marca sola a medida que lo vas cargando.`}
      acciones={
        <BotonFila variante="ghost" onClick={onOcultar} title="Ocultar esta lista en este navegador">
          Ya lo sé
        </BotonFila>
      }
    >
      <div
        role="progressbar"
        aria-label="Primeros pasos"
        aria-valuemin={0}
        aria-valuemax={pasos.length}
        aria-valuenow={hechos}
        className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(hechos / pasos.length) * 100}%` }} />
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
            <span className="min-w-0 flex-1 basis-48">
              <span className={`block text-sm font-semibold ${paso.hecho ? "text-texto-3 line-through decoration-texto-4/60" : "text-texto"}`}>
                <span className="sr-only">{paso.hecho ? "Listo: " : "Falta: "}</span>
                {paso.titulo}
              </span>
              {!paso.hecho && <span className="block text-[13px] text-texto-3">{paso.detalle}</span>}
            </span>
            {!paso.hecho && (
              <Link to={paso.a} className={claseBotonFila("soft")}>
                {paso.accion}
                <Icon name="chevronRight" size={15} />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Tarjeta>
  );
}
