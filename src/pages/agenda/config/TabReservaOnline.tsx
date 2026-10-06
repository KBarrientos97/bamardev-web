import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { AvisoOk, Badge, Boton, Cargando, ErrorMsg, Input, useAviso } from "../../../components/ui";
import { apiConfigAgenda } from "../../../lib/agenda/apiConfigAgenda";
import {
  apiReservaOnline,
  enlaceReservas,
  type ConfigReservaOnline,
  type SucursalReservas,
} from "../../../lib/agenda/apiReservaOnline";
import { compartirTexto, copiarTexto, puedeCompartirTexto } from "../../../lib/agenda/recordatorio";
import type { Recurso, Servicio } from "../../../lib/agenda/tiposConfigAgenda";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { Bloque, Casilla } from "./comun";
import { mensajeDe, nombreRecurso, useNombreProfesional } from "./utilConfig";

/**
 * Reserva online en la configuración de agenda (A8, fase 2): qué se publica
 * —sucursales, servicios y profesionales— y el enlace para compartir (copiar,
 * menú de compartir del teléfono o `wa.me`, PLAN-AGENDA-BELLEZA §9.2).
 *
 * Cómo se confirma lo que entra (manual o automático) y los topes son reglas
 * del negocio: viven en "Configuración del negocio" (A11), que es del dueño.
 */
export default function TabReservaOnline({
  servicios,
  recursos,
  onCambio,
}: {
  servicios: Servicio[];
  recursos: Recurso[];
  onCambio: () => void;
}) {
  const { puede } = useAuth();
  const nombres = useNombreProfesional();
  const conf = useApi(() => apiReservaOnline.configuracion(), []);
  const [aviso, setAviso] = useAviso();
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  if (conf.error) return <ErrorMsg onReintentar={conf.recargar}>{conf.error}</ErrorMsg>;
  if (conf.cargando || !conf.datos) return <Cargando />;
  const c = conf.datos;
  const publicadas = c.sucursales.filter((s) => s.publicaReservas && s.slugReservas);
  const enLinea = servicios.filter((s) => s.activo && s.reservableOnline);
  const profesionales = recursos.filter((r) => r.activo);

  async function hacer(clave: string, fn: () => Promise<unknown>, ok: string, recargarTodo = false) {
    setOcupado(clave);
    setError("");
    try {
      await fn();
      setAviso(ok);
      conf.recargar();
      if (recargarTodo) onCambio();
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-4">
      {!c.habilitada && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-bg px-3.5 py-3 text-[13px] text-warning-text">
          <Icon name="lock" size={16} />
          <span>
            Tu plan todavía no incluye la reserva online: la página no recibe reservas. Pedile a soporte de BamarDev
            que la active. Lo que configures acá queda guardado.
          </span>
        </p>
      )}

      <Enlace conf={c} publicadas={publicadas} />

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      <Bloque
        titulo="Sucursales"
        subtitulo="Cada sucursal decide si recibe reservas por internet. Apagarla no cancela las citas ya tomadas."
      >
        <ul className="divide-y divide-borde-soft">
          {c.sucursales.map((s) => (
            <FilaSucursal
              key={s.id}
              sucursal={s}
              subdominio={c.subdominio}
              ocupado={ocupado === `s${s.id}`}
              onPublicar={(v) =>
                hacer(
                  `s${s.id}`,
                  () => apiReservaOnline.publicarSucursal(s.id, { publicaReservas: v }),
                  v ? `${s.nombre} ya recibe reservas online.` : `${s.nombre} dejó de recibir reservas online.`,
                )
              }
              onSlug={(slug) =>
                hacer(
                  `s${s.id}`,
                  () => apiReservaOnline.publicarSucursal(s.id, { slugReservas: slug }),
                  "Enlace de la sucursal guardado.",
                )
              }
            />
          ))}
        </ul>
      </Bloque>

      <Bloque
        titulo="Servicios"
        subtitulo={`Los que se pueden reservar por internet (${enLinea.length} de ${servicios.filter((s) => s.activo).length}).`}
      >
        {!servicios.length ? (
          <p className="text-sm text-texto-3">Todavía no hay servicios: cargalos en la pestaña Servicios.</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {servicios
              .filter((s) => s.activo)
              .map((s) => (
                <Casilla
                  key={s.id}
                  checked={s.reservableOnline}
                  disabled={ocupado === `p${s.id}` || s.duracionMin == null}
                  ayuda={s.duracionMin == null ? "Sin duración: cargala para poder publicarlo." : undefined}
                  onChange={(v) =>
                    hacer(
                      `p${s.id}`,
                      () => apiConfigAgenda.actualizarServicio(s.id, { reservableOnline: v }),
                      v ? `"${s.nombre}" se puede reservar online.` : `"${s.nombre}" ya no se ofrece online.`,
                      true,
                    )
                  }
                >
                  {s.nombre}
                </Casilla>
              ))}
          </div>
        )}
      </Bloque>

      <Bloque
        titulo={nombres.plural}
        subtitulo="Sólo los publicados atienden reservas online: el cliente elige uno o «Cualquiera» entre ellos."
      >
        {!profesionales.length ? (
          <p className="text-sm text-texto-3">Todavía no hay a quién publicar.</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {profesionales.map((r) => (
              <Casilla
                key={r.id}
                checked={r.publicadoOnline}
                disabled={ocupado === `r${r.id}`}
                ayuda={r.nombrePublico ? `Se muestra como “${r.nombrePublico}”.` : undefined}
                onChange={(v) =>
                  hacer(
                    `r${r.id}`,
                    () =>
                      apiConfigAgenda.actualizarRecurso(r.id, {
                        tipo: r.tipo,
                        nombre: r.nombre,
                        sucursalIds: r.sucursalIds,
                        servicioIds: r.servicioIds,
                        publicadoOnline: v,
                      }),
                    v ? `${nombreRecurso(r)} aparece en tu página.` : `${nombreRecurso(r)} ya no aparece en tu página.`,
                    true,
                  )
                }
              >
                {nombreRecurso(r)}
              </Casilla>
            ))}
          </div>
        )}
      </Bloque>

      <p className="text-[13px] text-texto-3">
        Cómo se confirman las reservas ({c.modoConfirmacion === "AUTOMATICA" ? "automáticamente" : "las aprobás vos"}),
        con cuánta anticipación y hasta cuándo se pueden cancelar
        {puede("config_negocio") ? (
          <>
            {" "}
            se cambia en{" "}
            <Link to="/configuracion/negocio" className="font-semibold text-primary-700 underline">
              Configuración del negocio
            </Link>
            .
          </>
        ) : (
          " lo decide el dueño en Configuración del negocio."
        )}
      </p>
    </div>
  );
}

/** "Compartir enlace de reservas": copiar, compartir y WhatsApp. */
function Enlace({ conf, publicadas }: { conf: ConfigReservaOnline; publicadas: SucursalReservas[] }) {
  const [aviso, setAviso] = useAviso(4000);
  if (!conf.subdominio) {
    return (
      <Bloque titulo="Tu enlace de reservas">
        <p className="text-sm text-texto-3">
          Tu negocio todavía no tiene dirección propia. Pedile a soporte de BamarDev que la configure.
        </p>
      </Bloque>
    );
  }
  const enlace = enlaceReservas(conf.subdominio);
  const texto = `Reservá tu turno en ${conf.negocio}: ${enlace}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(texto)}`;

  return (
    <Bloque
      titulo="Tu enlace de reservas"
      subtitulo="Pegalo en tu Instagram, en tu WhatsApp Business o en un cartel con QR."
      insignia={publicadas.length ? <Badge tono="verde">Publicado</Badge> : <Badge tono="amarillo">Sin publicar</Badge>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input readOnly value={enlace} aria-label="Enlace de reservas" className="min-w-0 flex-1 basis-64 font-mono text-[13px]" />
        <Boton
          variante="ghost"
          icono="fileText"
          onClick={async () => setAviso((await copiarTexto(enlace)) ? "Enlace copiado." : "No se pudo copiar: seleccionalo a mano.")}
        >
          Copiar
        </Boton>
        {puedeCompartirTexto() && (
          <Boton variante="ghost" icono="arrowUpRight" onClick={() => compartirTexto(texto, `Reservas en ${conf.negocio}`)}>
            Compartir
          </Boton>
        )}
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-700 hover:bg-primary-50"
        >
          <Icon name="phone" size={17} />
          WhatsApp
        </a>
        <a
          href={enlace}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted"
        >
          Ver la página de reservas
        </a>
      </div>
      {!publicadas.length && (
        <p className="text-[13px] text-warning-text">
          Publicá al menos una sucursal (abajo) para que el enlace reciba reservas.
        </p>
      )}
      {conf.serviciosPublicados === 0 && (
        <p className="text-[13px] text-warning-text">Marcá qué servicios se pueden reservar online.</p>
      )}
      <AvisoOk>{aviso}</AvisoOk>
    </Bloque>
  );
}

function FilaSucursal({
  sucursal,
  subdominio,
  ocupado,
  onPublicar,
  onSlug,
}: {
  sucursal: SucursalReservas;
  subdominio: string | null;
  ocupado: boolean;
  onPublicar: (v: boolean) => void;
  onSlug: (slug: string | null) => void;
}) {
  const [slug, setSlug] = useState(sucursal.slugReservas ?? "");
  const cambio = slug.trim() !== (sucursal.slugReservas ?? "");
  return (
    <li className="space-y-2 py-3">
      <Casilla checked={sucursal.publicaReservas} disabled={ocupado} onChange={onPublicar} ayuda={sucursal.direccion ?? undefined}>
        <span className="font-semibold text-texto">{sucursal.nombre}</span> recibe reservas online
      </Casilla>
      {sucursal.publicaReservas && (
        <div className="ml-8 flex flex-wrap items-center gap-2 text-[13px] text-texto-3">
          <span>Nombre en el enlace:</span>
          <Input
            aria-label={`Nombre en el enlace de ${sucursal.nombre}`}
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            className="max-w-[12rem] font-mono text-[13px]"
          />
          {cambio && (
            <Boton variante="ghost" disabled={ocupado} onClick={() => onSlug(slug.trim() || null)}>
              Guardar
            </Boton>
          )}
          {subdominio && sucursal.slugReservas && (
            <a
              href={enlaceReservas(subdominio, sucursal.slugReservas)}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary-700 hover:underline"
            >
              Abrir
            </a>
          )}
        </div>
      )}
    </li>
  );
}
