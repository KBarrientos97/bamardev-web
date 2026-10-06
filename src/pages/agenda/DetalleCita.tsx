import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { AvisoOk, Boton, Confirmar, ErrorMsg, useAviso } from "../../components/ui";
import { apiAgenda, mensajeDe } from "../../lib/agenda/apiAgenda";
import {
  accionesPara,
  accionesRapidas,
  ETIQUETA_ACCION,
  ETIQUETA_ESTADO,
  MOTIVOS_CANCELAR,
  MOTIVOS_SIN_CARGO,
  pideMotivo,
  sePuedeMover,
} from "../../lib/agenda/estadosCita";
import { capitalizar, fechaLarga, fechaNegocio, horaNegocio } from "../../lib/agenda/horaAgenda";
import {
  compartirTexto,
  copiarTexto,
  enlaceWhatsApp,
  puedeCompartirTexto,
  textoRecordatorio,
} from "../../lib/agenda/recordatorio";
import type { AccionCita, Cita, EventoCita } from "../../lib/agenda/tiposAgenda";
import { fmtMoney, iniciales } from "../../lib/format";
import { Telefono } from "../../lib/telefono";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import MoverCita from "./MoverCita";
import PedirMotivo from "./PedirMotivo";
import { BadgeEstado, IconoCompartir, IconoCopiar, IconoWhatsApp, Rotulo } from "./piezas";

const ORIGEN: Record<Cita["origen"], string> = {
  INTERNA: "Agendada en el local",
  ONLINE: "Reservada online",
  WALKIN: "Llegó sin turno",
};

/**
 * A4 · Detalle de la cita (Cita.dc del lienzo). Panel lateral en escritorio y
 * pantalla completa en el celular.
 *
 * Arranca con la cita que ya está en la lista (se ve al instante) y la
 * completa con `GET /agenda/citas/:id`, que es la que trae el historial.
 */
export default function DetalleCita({
  cita: inicial,
  modo = "recepcion",
  sucursal,
  onClose,
  onCambio,
}: {
  cita: Cita;
  modo?: "recepcion" | "profesional";
  sucursal?: string | null;
  onClose: () => void;
  /** Después de una acción: la lista de atrás se pone al día con esto. */
  onCambio: (cita: Cita) => void;
}) {
  const { negocio } = useAuth();
  const profesional = modo === "profesional";
  const completa = useApi(() => apiAgenda.cita(inicial.id), [inicial.id]);
  const cita = completa.datos ?? inicial;
  const eventos = completa.datos?.eventos ?? inicial.eventos;

  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso(4000);
  const [pidiendo, setPidiendo] = useState<AccionCita | null>(null);
  const [moviendo, setMoviendo] = useState(false);

  // Escape cierra el panel, como cualquier cosa que se abre encima. Mientras
  // hay un diálogo arriba, lo cierra el diálogo.
  useEffect(() => {
    if (pidiendo || moviendo) return;
    const alTecla = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [onClose, pidiendo, moviendo]);

  function aplicar(nueva: Cita) {
    onCambio(nueva);
    // La respuesta de una acción no trae el historial: se muestra la cita
    // nueva con el historial de antes y se vuelve a pedir la completa.
    completa.setDatos({ ...nueva, eventos: nueva.eventos ?? completa.datos?.eventos });
    completa.recargar();
  }

  async function ejecutar(accion: AccionCita, motivo?: string) {
    setError("");
    setOcupado(true);
    try {
      aplicar(await apiAgenda.cambiarEstado(cita.id, accion, motivo));
      setPidiendo(null);
    } catch (e) {
      setError(mensajeDe(e));
      setPidiendo(null);
    } finally {
      setOcupado(false);
    }
  }

  function pedir(accion: AccionCita) {
    if (pideMotivo(accion) || accion === "NO_ASISTIO") setPidiendo(accion);
    else ejecutar(accion);
  }

  const acciones = accionesPara(cita.estado, { profesional });
  const rapidas = accionesRapidas(cita, { profesional });
  const principal = rapidas.find((r) => r.principal);
  const secundarias = acciones.filter((a) => a !== principal?.accion && a !== "CANCELAR");
  const puedeMover = !profesional && sePuedeMover(cita.estado);
  const puedeCancelar = acciones.includes("CANCELAR");

  const fecha = cita.inicio ? fechaNegocio(cita.inicio) : null;
  const recordatorio = textoRecordatorio(cita, { negocio: negocio?.nombre, sucursal });
  const whatsapp = enlaceWhatsApp(cita.cliente.telefono, recordatorio);
  const conPrecios = !profesional || cita.lineas.some((l) => l.precio > 0);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Cita de ${cita.cliente.nombre}`}
        className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-[420px] sm:border-l sm:border-borde"
      >
        <header className="flex items-start gap-3 border-b border-borde-soft px-5 py-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <BadgeEstado estado={cita.estado} />
            <h1 className="truncate text-xl font-bold text-texto">{cita.cliente.nombre}</h1>
            <p className="text-[13px] text-texto-3">
              {fecha
                ? `${capitalizar(fechaLarga(fecha))} · ${horaNegocio(cita.inicio)} – ${horaNegocio(cita.fin)}`
                : "En la cola, sin hora todavía"}
              {sucursal ? ` · ${sucursal}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-texto-3 hover:bg-muted"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="space-y-2.5">
            <Rotulo>Cliente</Rotulo>
            <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 font-bold text-primary-700">
                {iniciales(cita.cliente.nombre)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-texto">{cita.cliente.nombre}</p>
                <p className="text-[13px] text-texto-2">
                  {cita.cliente.telefono ? Telefono.paraMostrar(cita.cliente.telefono) : "Teléfono oculto"}
                </p>
              </div>
              {cita.cliente.nuevo ? (
                <span className="rounded-lg bg-info-bg px-2 py-0.5 text-[11px] font-bold uppercase text-info-text">Nuevo</span>
              ) : (
                <span className="rounded-lg bg-primary-50 px-2 py-0.5 text-[11px] font-bold uppercase text-primary-700">Recurrente</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-[12px]">
              <span
                className={`rounded-lg px-2 py-1 ${
                  cita.cliente.noShows > 0 ? "bg-danger-bg font-semibold text-danger-text" : "bg-slate-100 text-texto-2"
                }`}
              >
                {cita.cliente.noShows} {cita.cliente.noShows === 1 ? "inasistencia" : "inasistencias"}
              </span>
              {cita.cliente.alergias && (
                <span className="rounded-lg bg-danger-bg px-2 py-1 font-semibold text-danger-text">
                  Alergia: {cita.cliente.alergias}
                </span>
              )}
              {cita.noShowSugerido && (
                <span className="rounded-lg bg-warning-bg px-2 py-1 font-semibold text-warning-text">
                  Pasaron 15 min y no llegó
                </span>
              )}
            </div>
          </section>

          <section className="space-y-2.5">
            <Rotulo>Servicios</Rotulo>
            <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
              {cita.lineas.map((l) => (
                <li key={l.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-texto">{l.servicio}</p>
                    <p className="text-[12px] text-texto-3">
                      {horaNegocio(l.inicio)} – {horaNegocio(l.fin)} · con {l.recurso}
                      {l.sobreTurno && <span className="ml-1 font-semibold text-warning-text">· sobre-turno</span>}
                    </p>
                  </div>
                  {conPrecios && <span className="text-sm font-semibold text-texto">{fmtMoney(l.precio)}</span>}
                </li>
              ))}
              {cita.lineas.length === 0 && <li className="p-3 text-[13px] text-texto-3">Sin servicios asignados todavía.</li>}
            </ul>
            {conPrecios && cita.lineas.length > 1 && (
              <p className="text-right text-sm text-texto-2">
                Total <span className="font-bold text-texto">{fmtMoney(cita.total)}</span>
              </p>
            )}
          </section>

          {cita.nota && (
            <section className="space-y-2">
              <Rotulo>Nota</Rotulo>
              <p className="rounded-xl bg-muted p-3 text-sm text-texto-2">{cita.nota}</p>
            </section>
          )}

          <section className="space-y-2">
            <Rotulo>Avisar al cliente</Rotulo>
            <div className="flex flex-wrap gap-2">
              <BotonAviso
                onClick={async () =>
                  setAviso((await copiarTexto(recordatorio)) ? "Recordatorio copiado" : "No se pudo copiar")
                }
              >
                <IconoCopiar /> Copiar recordatorio
              </BotonAviso>
              {puedeCompartirTexto() && (
                <BotonAviso onClick={() => compartirTexto(recordatorio, `Cita ${cita.codigo}`)}>
                  <IconoCompartir /> Compartir
                </BotonAviso>
              )}
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-borde bg-white px-3 text-sm text-texto-2 hover:bg-muted"
                >
                  <IconoWhatsApp /> Enviar por WhatsApp
                </a>
              )}
            </div>
            <p className="text-[12px] text-texto-3">
              {whatsapp
                ? "Sin WhatsApp integrado: se abre con el texto escrito y lo mandás vos."
                : "Sin teléfono a la vista: copiá el texto y pasáselo a recepción."}
            </p>
            <AvisoOk>{aviso}</AvisoOk>
          </section>

          <section className="space-y-2">
            <Rotulo>Historial</Rotulo>
            <p className="text-[12px] text-texto-3">{ORIGEN[cita.origen]}</p>
            {eventos && eventos.length > 0 ? (
              <ol className="space-y-1.5 text-[13px] text-texto-2">
                {[...eventos].reverse().map((ev, i) => (
                  <li key={i}>{lineaHistorial(ev)}</li>
                ))}
              </ol>
            ) : completa.cargando ? (
              <p className="text-[13px] text-texto-3">Cargando…</p>
            ) : null}
          </section>
        </div>

        <footer className="space-y-2.5 border-t border-borde-soft bg-muted px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <ErrorMsg>{error}</ErrorMsg>
          {principal?.accion === "COBRAR" ? (
            <Boton disabled className="w-full py-3 text-base" title="El cobro desde la agenda llega pronto">
              Cobrar · llega pronto
            </Boton>
          ) : principal ? (
            <Boton onClick={() => pedir(principal.accion as AccionCita)} disabled={ocupado} className="w-full py-3 text-base">
              {ETIQUETA_ACCION[principal.accion as AccionCita]}
            </Boton>
          ) : null}
          {secundarias.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {secundarias.map((a) => (
                <Boton key={a} variante="ghost" onClick={() => pedir(a)} disabled={ocupado} className="flex-1">
                  {ETIQUETA_ACCION[a]}
                </Boton>
              ))}
            </div>
          )}
          {(puedeMover || puedeCancelar) && (
            <div className="flex gap-2">
              {puedeMover && (
                <Boton variante="ghost" onClick={() => setMoviendo(true)} disabled={ocupado} className="flex-1">
                  Mover
                </Boton>
              )}
              {puedeCancelar && (
                <button
                  type="button"
                  onClick={() => pedir("CANCELAR")}
                  disabled={ocupado}
                  className="flex-1 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-danger-text hover:bg-muted disabled:opacity-50"
                >
                  Cancelar cita
                </button>
              )}
            </div>
          )}
        </footer>
      </aside>

      {pidiendo === "CANCELAR" && (
        <PedirMotivo
          titulo="Cancelar cita"
          texto="Libera el horario. Una cita cancelada no se reabre: si vuelve, se agenda otra."
          motivos={MOTIVOS_CANCELAR}
          etiquetaOk="Cancelar cita"
          peligroso
          onCancelar={() => setPidiendo(null)}
          onConfirmar={(m) => ejecutar("CANCELAR", m)}
        />
      )}
      {pidiendo === "SIN_CARGO" && (
        <PedirMotivo
          titulo="Cerrar sin cargo"
          texto="La cita queda completada sin venta."
          motivos={MOTIVOS_SIN_CARGO}
          etiquetaOk="Cerrar sin cargo"
          onCancelar={() => setPidiendo(null)}
          onConfirmar={(m) => ejecutar("SIN_CARGO", m)}
        />
      )}
      <Confirmar
        abierto={pidiendo === "NO_ASISTIO"}
        titulo="¿No vino?"
        texto={`Se marca como inasistencia de ${cita.cliente.nombre} y se libera el horario.`}
        etiquetaOk="No vino"
        peligroso
        procesando={ocupado}
        onCancel={() => setPidiendo(null)}
        onOk={() => ejecutar("NO_ASISTIO")}
      />
      {moviendo && (
        <MoverCita
          cita={cita}
          onClose={() => setMoviendo(false)}
          onMovida={(c) => {
            setMoviendo(false);
            aplicar(c);
          }}
        />
      )}
    </div>
  );
}

function BotonAviso({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-borde bg-white px-3 text-sm text-texto-2 hover:bg-muted"
    >
      {children}
    </button>
  );
}

/** "10:02 · Lucía: Reservada → En atención". Un día que no es hoy lleva la fecha. */
function lineaHistorial(ev: EventoCita): string {
  const cuando =
    fechaNegocio(ev.en) === fechaNegocio()
      ? horaNegocio(ev.en)
      : `${fechaLarga(fechaNegocio(ev.en)).split(" ").slice(0, 2).join(" ")} · ${horaNegocio(ev.en)}`;
  const quien = ev.usuario ?? (ev.origen === "ENLACE" ? "El cliente" : "Sistema");
  const que = ev.de
    ? `${ETIQUETA_ESTADO[ev.de]} → ${ETIQUETA_ESTADO[ev.a]}`
    : `creó la cita (${ETIQUETA_ESTADO[ev.a]})`;
  return `${cuando} · ${quien}: ${que}`;
}
