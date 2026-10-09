import { useState } from "react";
import { Link } from "react-router-dom";
import { EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { AvisoOk, Badge, Boton, Cargando, ErrorMsg, Vacio, useAviso } from "../../components/ui";
import { apiReservaOnline, type BandejaSolicitudes, type CitaSolicitud } from "../../lib/agenda/apiReservaOnline";
import { mensajeDe } from "../../lib/agenda/apiAgenda";
import {
  capitalizar,
  duracionTexto,
  fechaLarga,
  fechaNegocio,
  horaNegocio,
  minutosEntre,
} from "../../lib/agenda/horaAgenda";
import { enlaceWhatsApp } from "../../lib/agenda/recordatorio";
import { EVENTO_SOLICITUDES } from "../../lib/agenda/contadorSolicitudes";
import { useConsultaPeriodica } from "../../lib/agenda/useConsultaPeriodica";
import { abrirHojaCupo } from "../../lib/hojaCupo";
import { Telefono } from "../../lib/telefono";
import { useBloqueoCupo } from "../../lib/useBloqueoCupo";
import { useAuth } from "../../store/AuthContext";
import PedirMotivo from "./PedirMotivo";

/** Motivos a mano para rechazar: el cliente los ve en su enlace. */
const MOTIVOS_RECHAZO = [
  "No tenemos lugar a esa hora",
  "Ese día no atendemos",
  "Necesitamos hablar con vos antes",
  "Otro",
] as const;

/**
 * A9 · Solicitudes online (PLAN-AGENDA-BELLEZA §8.3): lo que entró por la
 * página de reservas y espera respuesta. Aprobar la deja RESERVADA; rechazar
 * libera el horario y el cliente ve el motivo en su enlace; "Llamar" da el
 * teléfono para coordinar por fuera.
 *
 * Abajo, las que entraron solas (modo automático) y nadie miró: se marcan
 * como vistas. Se refresca sola cada 45 s, como la agenda.
 */
export default function Solicitudes() {
  const { usuario, negocio } = useAuth();
  const [aviso, setAviso] = useAviso(5000);
  const [rechazando, setRechazando] = useState<CitaSolicitud | null>(null);
  const [ocupada, setOcupada] = useState<number | null>(null);
  const [error, setError] = useState("");
  /**
   * Plan Emprendedor (D20): aprobar consume una cita del cupo. Sin lugar, la
   * solicitud se queda en la bandeja y se ofrece comprar créditos con un
   * aviso —no se abre la hoja sola: quien aprueba quizá sólo quería mirar—.
   */
  const [sinCupo, setSinCupo] = useState(false);
  const {
    verificar: hayLugarParaCita,
    manejarError: rechazoPorCupo,
    registrar: registrarConsumo,
  } = useBloqueoCupo("CITA", { abrirHoja: false });
  const bandeja = useConsultaPeriodica<BandejaSolicitudes>(
    () => apiReservaOnline.bandeja(usuario?.sucursalId ?? null),
    [usuario?.sucursalId],
    { pausado: rechazando !== null },
  );

  /** Saca la cita de las dos listas (ya se resolvió). */
  const quitar = (id: number) =>
    bandeja.setDatos((d) =>
      d
        ? {
            ...d,
            solicitudes: d.solicitudes.filter((c) => c.id !== id),
            nuevas: d.nuevas.filter((c) => c.id !== id),
            contador: {
              pendientes: d.solicitudes.filter((c) => c.id !== id).length,
              nuevas: d.nuevas.filter((c) => c.id !== id).length,
            },
          }
        : d,
    );

  async function hacer(c: CitaSolicitud, fn: () => Promise<unknown>, ok: string, aprueba = false) {
    setError("");
    setSinCupo(false);
    if (aprueba && !hayLugarParaCita()) {
      setSinCupo(true);
      return;
    }
    setOcupada(c.id);
    try {
      const r = await fn();
      if (aprueba) registrarConsumo(r as CitaSolicitud);
      quitar(c.id);
      setAviso(ok);
      window.dispatchEvent(new Event(EVENTO_SOLICITUDES));
    } catch (e) {
      // 403 CUPO_AGOTADO: el backend revirtió todo y la cita sigue
      // SOLICITADA. No se recarga la bandeja: no cambió nada.
      if (aprueba && rechazoPorCupo(e)) {
        setSinCupo(true);
        return;
      }
      setError(mensajeDe(e));
      bandeja.refrescar();
    } finally {
      setOcupada(null);
    }
  }

  const solicitudes = bandeja.datos?.solicitudes ?? [];
  const nuevas = bandeja.datos?.nuevas ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Solicitudes online"
        subtitulo="Las reservas de tu página que esperan respuesta."
        accion={
          <Link
            to="/configuracion/agenda?pestana=reservas"
            className="inline-flex items-center gap-2 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted"
          >
            <Icon name="settings" size={17} />
            Reserva online
          </Link>
        }
      />

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>
      {sinCupo && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm text-warning-text"
        >
          <Icon name="alert" size={17} />
          <span className="min-w-0 flex-1 basis-56 font-semibold">
            No te queda cupo de citas hoy. Comprá créditos para aprobarla; la solicitud sigue pendiente.
          </span>
          <Boton icono="coins" variante="soft" onClick={() => abrirHojaCupo({ unidad: "CITA", agotado: true })}>
            Comprar créditos
          </Boton>
        </div>
      )}

      {bandeja.error && !bandeja.datos ? (
        <ErrorMsg onReintentar={bandeja.recargar}>{bandeja.error}</ErrorMsg>
      ) : bandeja.cargando && !bandeja.datos ? (
        <Cargando />
      ) : (
        <>
          <section aria-label="Por aprobar" className="space-y-3">
            <h2 className="text-sm font-bold text-texto-2">
              Por aprobar {solicitudes.length > 0 && <Badge tono="amarillo">{solicitudes.length}</Badge>}
            </h2>
            {!solicitudes.length ? (
              <Vacio
                icono="bell"
                titulo="No hay solicitudes por aprobar"
                texto="Cuando alguien reserve desde tu página, aparece acá."
              />
            ) : (
              solicitudes.map((c) => (
                <TarjetaSolicitud
                  key={c.id}
                  cita={c}
                  negocio={negocio?.nombre ?? ""}
                  ocupada={ocupada === c.id}
                  acciones={
                    <>
                      <Boton
                        icono="check"
                        disabled={ocupada === c.id}
                        onClick={() =>
                          hacer(c, () => apiReservaOnline.aprobar(c.id), `Aprobada la cita de ${c.cliente.nombre}.`, true)
                        }
                      >
                        Aprobar
                      </Boton>
                      <Boton variante="ghost" disabled={ocupada === c.id} onClick={() => setRechazando(c)}>
                        Rechazar
                      </Boton>
                    </>
                  }
                />
              ))
            )}
          </section>

          {nuevas.length > 0 && (
            <section aria-label="Nuevas confirmadas solas" className="space-y-3">
              <h2 className="text-sm font-bold text-texto-2">
                Nuevas, ya confirmadas <Badge tono="azul">{nuevas.length}</Badge>
              </h2>
              <p className="text-[13px] text-texto-3">
                Entraron solas, sin pasar por tu aprobación, por cómo está configurada la confirmación de la
                reserva online. Marcalas como vistas.
              </p>
              {nuevas.map((c) => (
                <TarjetaSolicitud
                  key={c.id}
                  cita={c}
                  negocio={negocio?.nombre ?? ""}
                  ocupada={ocupada === c.id}
                  acciones={
                    <Boton
                      variante="ghost"
                      icono="check"
                      disabled={ocupada === c.id}
                      onClick={() => hacer(c, () => apiReservaOnline.revisar(c.id), "Marcada como vista.")}
                    >
                      Vista
                    </Boton>
                  }
                />
              ))}
            </section>
          )}
        </>
      )}

      {rechazando && (
        <PedirMotivo
          titulo="Rechazar la solicitud"
          texto={`${rechazando.cliente.nombre} va a ver el motivo en el enlace de su reserva. El horario queda libre.`}
          motivos={MOTIVOS_RECHAZO}
          etiquetaOk="Rechazar"
          peligroso
          onCancelar={() => setRechazando(null)}
          onConfirmar={async (motivo) => {
            const c = rechazando;
            setRechazando(null);
            await hacer(c, () => apiReservaOnline.rechazar(c.id, motivo), "Solicitud rechazada.");
          }}
        />
      )}
    </div>
  );
}

function TarjetaSolicitud({
  cita,
  negocio,
  acciones,
  ocupada,
}: {
  cita: CitaSolicitud;
  negocio: string;
  acciones: React.ReactNode;
  ocupada: boolean;
}) {
  const servicios = [...new Set(cita.lineas.map((l) => l.servicio))].join(" + ");
  const recursos = [...new Set(cita.lineas.map((l) => l.recurso))].join(", ");
  const duracion = cita.inicio && cita.fin ? duracionTexto(minutosEntre(cita.inicio, cita.fin)) : "";
  const cuando = cita.inicio
    ? `${capitalizar(fechaLarga(fechaNegocio(cita.inicio)))} · ${horaNegocio(cita.inicio)}`
    : "Sin hora";
  const tel = cita.cliente.telefono;
  const llamar = Telefono.paraLlamada(tel);
  const whatsapp = enlaceWhatsApp(
    tel,
    `Hola ${cita.cliente.nombre.split(" ")[0]}, te escribimos de ${negocio} por tu reserva del ${cuando.toLowerCase()}.`,
  );

  return (
    <article className={`card space-y-2 p-4 ${ocupada ? "opacity-60" : ""}`} aria-label={`Solicitud de ${cita.cliente.nombre}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-texto">{cuando}</p>
          <p className="text-sm text-texto-2">
            {servicios}
            {duracion ? ` · ${duracion}` : ""}
            {recursos ? ` · ${recursos}` : ""}
          </p>
        </div>
        <span className="text-xs text-texto-4">Código {cita.codigo}</span>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm text-texto">
        <span className="font-semibold">{cita.cliente.nombre}</span>
        {cita.cliente.nuevo ? <Badge tono="azul">Nuevo</Badge> : <Badge tono="verde">Ya vino</Badge>}
        {cita.cliente.noShows > 0 && (
          <Badge tono="rojo">
            {cita.cliente.noShows === 1 ? "1 vez no vino" : `${cita.cliente.noShows} veces no vino`}
          </Badge>
        )}
      </p>
      {cita.nota && <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-texto-2">“{cita.nota}”</p>}
      {cita.venceEn && cita.estado === "SOLICITADA" && (
        <p className="text-xs text-texto-3">
          Si nadie responde, se libera {faltaPara(cita.venceEn)}.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {acciones}
        {llamar && (
          <a
            href={`tel:${llamar}`}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50"
          >
            <Icon name="phone" size={16} />
            Llamar
          </a>
        )}
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50"
          >
            <Icon name="arrowUpRight" size={16} />
            WhatsApp
          </a>
        )}
      </div>
    </article>
  );
}

/** "en 40 min", "en 3 h (18:30)", "el sábado 10 de octubre a las 09:00". */
function faltaPara(iso: string): string {
  const min = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (min <= 1) return "en un momento";
  if (min < 60) return `en ${min} min`;
  if (min < 24 * 60) return `en ${Math.round(min / 60)} h (${horaNegocio(iso)})`;
  return `el ${fechaLarga(fechaNegocio(iso))} a las ${horaNegocio(iso)}`;
}
