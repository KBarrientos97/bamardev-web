import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Cargando, ErrorMsg } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { cuantosHechos, EVENTO_PRIMEROS_PASOS, pasosPrimeros } from "../../lib/academia/primerosPasos";
import type { AjustesAcademia, Carrera, Docente, GrupoResumen, Sede } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { api } from "../../lib/api";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { claseBotonFila, PaginaAcademia } from "./piezas";

/**
 * «Configuración rápida»: la lista de pasos que le dice a un instituto nuevo
 * por dónde empezar (C1 de la auditoría del 26-oct). Fue una tarjeta grande y
 * después un botón con anillo en el Calendario, el Panel de control y la
 * Configuración (L1, 28-oct); el dueño (31-oct, M1) pidió que viva en UN solo
 * lugar: una pestaña propia de la Configuración del instituto. Por eso ya no
 * hay «Ya lo sé», ni apertura automática, ni marcas en el navegador: la lista
 * está siempre ahí, y con todo hecho muestra todo ✓.
 *
 * Se marca sola con los datos que ya existen (sedes, ajustes, cursos, docentes
 * y grupos) y se vuelve a leer al cambiar de pestaña.
 */

interface Cargado {
  sedes: Sede[] | null;
  ajustes: AjustesAcademia | null;
  cursos: Carrera[] | null;
  docentes: Docente[] | null;
  grupos: GrupoResumen[] | null;
  qrCargado: boolean | null;
  pinPuesto: boolean | null;
}

export default function PrimerosPasos() {
  const p = usePalabras();
  const { negocio, usuario } = useAuth();
  // Se vuelve a leer al cambiar de pestaña de la Configuración (el componente no
  // se remonta entre ellas) y cuando una pantalla avisa que guardó algo (R3).
  const { pathname } = useLocation();
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
    /** Un pedido que si falla (un permiso, un corte) deja `null` en vez de romper: ese paso no se muestra. */
    const segura = <T,>(pedir: () => Promise<T>) =>
      Promise.resolve()
        .then(pedir)
        .catch(() => null);
    const [sedes, ajustes, cursos, docentes, grupos, qr, yo] = await Promise.all([
      segura(() => apiAcademia.sedes()),
      segura(() => apiAcademia.ajustes()),
      segura(() => apiAcademia.carreras()),
      segura(() => apiAcademia.docentes()),
      // Alcanza con las más nuevas: sólo se mira si hay alguna abierta (M4).
      segura(async () => (await apiAcademia.grupos({ pageSize: 10 })).items),
      puedeQr ? segura(() => api.qrCobro()) : null,
      puedePin && yoId != null ? segura(() => api.getUsuario(yoId)) : null,
    ]);
    return { sedes, ajustes, cursos, docentes, grupos, qrCargado: qr ? !!qr.imagen : null, pinPuesto: yo ? yo.tienePin : null };
  }, [pathname]);

  useEffect(() => {
    window.addEventListener(EVENTO_PRIMEROS_PASOS, carga.recargar);
    return () => window.removeEventListener(EVENTO_PRIMEROS_PASOS, carga.recargar);
  }, [carga.recargar]);

  const d = carga.datos;
  const pasos = d
    ? pasosPrimeros({
        sedes: d.sedes,
        ajustes: d.ajustes,
        cursos: d.cursos,
        docentes: d.docentes,
        grupos: d.grupos,
        features,
        qrCargado: d.qrCargado,
        pinPuesto: d.pinPuesto,
        palabras: { carrera: p.carrera, docente: p.docente, sede: p.sede, Sede: p.Sede, Sedes: p.Sedes },
      })
    : [];
  const total = pasos.length;
  const hechos = cuantosHechos(pasos);

  return (
    <PaginaAcademia ancho="max-w-3xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-texto">Configuración rápida</h1>
        <p className="text-sm text-texto-3">
          {d && total > 0
            ? hechos === total
              ? "¡Listo! Está todo lo necesario para empezar."
              : `${hechos} de ${total} listos. Se marca sola a medida que lo vas cargando.`
            : "Lo que falta para dejar el instituto listo."}
        </p>
      </header>

      {carga.error && !d ? (
        <ErrorMsg onReintentar={carga.recargar}>{carga.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : total === 0 ? (
        <p className="rounded-xl border border-borde-soft bg-white p-4 text-sm text-texto-3">
          No se pudo leer el estado del instituto. Probá de nuevo en un momento.
        </p>
      ) : (
        <div className="rounded-xl border border-borde-soft bg-white p-4">
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
                  <Link to={paso.a} className={claseBotonFila("soft")}>
                    {paso.accion}
                    <Icon name="chevronRight" size={15} />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </PaginaAcademia>
  );
}
