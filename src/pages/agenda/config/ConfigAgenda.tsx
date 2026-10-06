import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EncabezadoPagina } from "../../../components/filtros";
import { Icon } from "../../../components/Icon";
import { Cargando, ErrorMsg } from "../../../components/ui";
import { api } from "../../../lib/api";
import { apiConfigAgenda } from "../../../lib/agenda/apiConfigAgenda";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import type { Almacen } from "../../../types";
import type { Recurso, Servicio } from "../../../lib/agenda/tiposConfigAgenda";
import { useNombreProfesional, type Pestana, type Sucursal } from "./utilConfig";
import TabBloqueos from "./TabBloqueos";
import TabExcepciones from "./TabExcepciones";
import TabHorarios from "./TabHorarios";
import TabRecursos from "./TabRecursos";
import TabServicios from "./TabServicios";

/**
 * A8 · Configuración de agenda (PLAN-AGENDA-BELLEZA §5.1): todo lo que hay
 * que cargar antes de poder dar una cita. La ven el dueño y el encargado.
 *
 * Servicios, recursos y sucursales se cargan una vez acá arriba porque los
 * usan casi todas las pestañas (un servicio dice quién lo hace; un horario es
 * de un recurso en una sucursal) y así cambiar de pestaña no vuelve a pedir lo
 * mismo. La pestaña va en la URL (`?pestana=`) para que un F5 no te devuelva
 * a Servicios en medio de cargar horarios.
 */

const PESTANAS: Pestana[] = ["servicios", "recursos", "horarios", "excepciones", "bloqueos"];

export default function ConfigAgenda() {
  const { puede } = useAuth();
  const nombres = useNombreProfesional();
  const [params, setParams] = useSearchParams();
  const pedida = params.get("pestana") as Pestana | null;
  const pestana: Pestana = pedida && PESTANAS.includes(pedida) ? pedida : "servicios";

  const servicios = useApi(() => apiConfigAgenda.servicios(), []);
  const recursos = useApi(() => apiConfigAgenda.recursos(true), []);
  const almacenes = useApi(() => api.getSucursales(), []);

  // Un depósito no atiende a nadie: no tiene agenda.
  const sucursales: Sucursal[] = useMemo(
    () =>
      (almacenes.datos ?? ([] as Almacen[]))
        .filter((a) => a.activo && a.tipo !== "DEPOSITO")
        .map((a) => ({ id: a.id, nombre: a.nombre })),
    [almacenes.datos],
  );

  const etiquetas: Record<Pestana, string> = {
    servicios: "Servicios",
    recursos: `${nombres.plural} y espacios`,
    horarios: "Horarios",
    excepciones: "Excepciones",
    bloqueos: "Bloqueos",
  };

  const elegir = (p: Pestana) => {
    const nuevos = new URLSearchParams(params);
    nuevos.set("pestana", p);
    setParams(nuevos, { replace: true });
  };

  const cargando = servicios.cargando || recursos.cargando;
  const error = servicios.error || recursos.error;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Configuración de agenda"
        subtitulo="Qué se atiende, quién lo hace y cuándo."
        accion={
          // Las reglas (granularidad, qué ve el profesional, reserva online)
          // viven en la configuración del negocio, que es sólo del dueño.
          puede("config_negocio") ? (
            <Link
              to="/configuracion/negocio"
              className="inline-flex items-center gap-2 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 transition-colors hover:bg-muted"
            >
              <Icon name="settings" size={17} />
              Reglas del negocio
            </Link>
          ) : undefined
        }
      />

      <div
        role="tablist"
        aria-label="Secciones de la configuración"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {PESTANAS.map((p) => (
          <button
            key={p}
            role="tab"
            id={`tab-${p}`}
            aria-selected={pestana === p}
            aria-controls={`panel-${p}`}
            onClick={() => elegir(p)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              pestana === p
                ? "bg-primary-boton text-white"
                : "border border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            {etiquetas[p]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`}>
        {error ? (
          <ErrorMsg
            onReintentar={() => {
              servicios.recargar();
              recursos.recargar();
            }}
          >
            {error}
          </ErrorMsg>
        ) : cargando && (!servicios.datos || !recursos.datos) ? (
          <Cargando />
        ) : (
          <Contenido
            pestana={pestana}
            servicios={servicios.datos ?? []}
            recursos={recursos.datos ?? []}
            sucursales={sucursales}
            recargarServicios={servicios.recargar}
            recargarRecursos={recursos.recargar}
            irA={elegir}
          />
        )}
      </div>
    </div>
  );
}

function Contenido({
  pestana,
  servicios,
  recursos,
  sucursales,
  recargarServicios,
  recargarRecursos,
  irA,
}: {
  pestana: Pestana;
  servicios: Servicio[];
  recursos: Recurso[];
  sucursales: Sucursal[];
  recargarServicios: () => void;
  recargarRecursos: () => void;
  irA: (p: Pestana) => void;
}) {
  // Un servicio dice quién lo hace y un recurso qué servicios hace: es la
  // misma relación vista de los dos lados, así que guardar una recarga ambas.
  const recargarTodo = () => {
    recargarServicios();
    recargarRecursos();
  };

  switch (pestana) {
    case "servicios":
      return <TabServicios servicios={servicios} recursos={recursos} onCambio={recargarTodo} />;
    case "recursos":
      return (
        <TabRecursos
          recursos={recursos}
          servicios={servicios}
          sucursales={sucursales}
          onCambio={recargarTodo}
        />
      );
    case "horarios":
      return <TabHorarios recursos={recursos} sucursales={sucursales} irA={irA} />;
    case "excepciones":
      return <TabExcepciones recursos={recursos} irA={irA} />;
    case "bloqueos":
      return <TabBloqueos recursos={recursos} sucursales={sucursales} />;
  }
}
