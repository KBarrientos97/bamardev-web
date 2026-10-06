import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { AvisoOk, Boton, Cargando, ErrorMsg, useAviso } from "../../components/ui";
import { apiAgenda } from "../../lib/agenda/apiAgenda";
import { accionesRapidas, esTerminal } from "../../lib/agenda/estadosCita";
import {
  capitalizar,
  diaCorto,
  duracionTexto,
  fechaLarga,
  fechaNegocio,
  horaNegocio,
  lunesDe,
  minutosEntre,
  sumarDias,
} from "../../lib/agenda/horaAgenda";
import type { Cita, MiAgendaRespuesta } from "../../lib/agenda/tiposAgenda";
import { useConsultaPeriodica } from "../../lib/agenda/useConsultaPeriodica";
import { etiquetaRol } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import DetalleCita from "./DetalleCita";
import NuevaCita from "./NuevaCita";
import TarjetaCita from "./TarjetaCita";
import { useAccionRapida } from "./useAccionRapida";
import CampanaAvisos from "./CampanaAvisos";

function conCita(d: MiAgendaRespuesta | null, c: Cita): MiAgendaRespuesta | null {
  if (!d) return d;
  const esta = d.citas.some((x) => x.id === c.id);
  return { ...d, citas: esta ? d.citas.map((x) => (x.id === c.id ? c : x)) : [...d.citas, c] };
}

/**
 * A10 · Mi agenda (MiAgenda.dc del lienzo): lo del profesional que entró y
 * nada más. El día, la semana corta para saltar de día, la próxima cita bien
 * grande y los botones para marcar sus citas.
 *
 * Sólo lo suyo lo decide el backend (`/agenda/mi-agenda` trae las citas de los
 * recursos vinculados a su usuario) y el teléfono del cliente llega en null si
 * el negocio no se lo deja ver. Va sin la barra lateral, como el salón del
 * mesero: es su única pantalla.
 */
export default function MiAgenda() {
  const { usuario, negocio, logout } = useAuth();
  const hoy = fechaNegocio();
  const [dia, setDia] = useState(hoy);
  const [abierta, setAbierta] = useState<Cita | null>(null);
  const [nueva, setNueva] = useState(false);
  const [aviso, setAviso] = useAviso(5000);
  const lunes = lunesDe(dia);

  const agenda = useConsultaPeriodica(
    () => apiAgenda.miAgenda(lunes, sumarDias(lunes, 6)),
    [lunes],
    { pausado: abierta !== null || nueva },
  );
  // Si el negocio le deja agendar (regla del panel, §7.4). Si las reglas no
  // llegan, no se ofrece: es lo que viene apagado por defecto.
  const reglas = useApi(() => apiAgenda.reglas().catch(() => null), []);
  const rapida = useAccionRapida((c) => agenda.setDatos((d) => conCita(d, c)));

  const recursos = agenda.datos?.recursos ?? [];
  const todas = useMemo(
    () => [...(agenda.datos?.citas ?? [])].sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? "")),
    [agenda.datos?.citas],
  );
  const delDia = todas.filter(
    (c) => c.inicio && fechaNegocio(c.inicio) === dia && !["CANCELADA", "RECHAZADA", "EXPIRADA"].includes(c.estado),
  );
  const proxima = proximaCita(todas, hoy);
  const sinTelefono = delDia.some((c) => !c.cliente.telefono);
  const etiqueta = usuario ? etiquetaRol(usuario.rol, negocio) : "Profesional";
  const nombre = usuario?.nombre?.trim() || usuario?.username || "";
  const sucursalId = usuario?.sucursalId ?? recursos[0]?.sucursalIds[0] ?? null;
  const puedeAgendar = !!reglas.datos?.profesionalPuedeAgendar && recursos.length > 0 && sucursalId != null;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-fondo">
      <header className="space-y-3.5 bg-barra px-4 pb-5 pt-3.5 text-barra-texto">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-bold">Mi agenda</h1>
            <p className="truncate text-[12px] text-barra-texto-2">
              {nombre} · {etiqueta}
              {negocio?.nombre ? ` · ${negocio.nombre}` : ""}
            </p>
          </div>
          {/* "Cambios en tu agenda" (§9.1): el backend sólo le manda lo de
              sus recursos. */}
          <CampanaAvisos onAbrirCita={setAbierta} />
          {puedeAgendar && (
            <button
              type="button"
              aria-label="Nueva cita"
              onClick={() => setNueva(true)}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-barra"
            >
              <Icon name="plus" size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={logout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-barra-texto hover:bg-white/25"
          >
            <Icon name="logout" size={20} />
          </button>
        </div>
        {proxima && (
          <div className="mx-auto max-w-2xl rounded-2xl bg-white/15 p-3.5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-barra-texto-2">{proxima.rotulo}</p>
            <p className="text-lg font-bold">
              {horaNegocio(proxima.cita.inicio)} · {proxima.cita.cliente.nombre}
            </p>
            <p className="text-[13px] text-barra-texto-2">
              {[...new Set(proxima.cita.lineas.map((l) => l.servicio))].join(" + ")}
              {proxima.cita.inicio && proxima.cita.fin
                ? ` · ${duracionTexto(minutosEntre(proxima.cita.inicio, proxima.cita.fin))}`
                : ""}
            </p>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-3 px-4 py-3">
        {agenda.cargando && !agenda.datos ? (
          <Cargando texto="Cargando tu agenda…" />
        ) : agenda.datos && recursos.length === 0 ? (
          <SinRecurso etiqueta={etiqueta} />
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Semana anterior"
                onClick={() => setDia((d) => sumarDias(d, -7))}
                className="flex h-14 w-8 shrink-0 items-center justify-center rounded-xl text-texto-3 hover:bg-muted"
              >
                <Icon name="chevronLeft" size={18} />
              </button>
              {Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)).map((f) => {
                const activo = f === dia;
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={activo}
                    aria-label={capitalizar(fechaLarga(f))}
                    onClick={() => setDia(f)}
                    className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl ${
                      activo
                        ? "bg-primary-boton text-white"
                        : `border bg-white text-texto-2 ${f === hoy ? "border-primary" : "border-borde"}`
                    }`}
                  >
                    <span className="text-[11px]">{diaCorto(f)}</span>
                    <strong className="text-[15px]">{Number(f.slice(8))}</strong>
                  </button>
                );
              })}
              <button
                type="button"
                aria-label="Semana siguiente"
                onClick={() => setDia((d) => sumarDias(d, 7))}
                className="flex h-14 w-8 shrink-0 items-center justify-center rounded-xl text-texto-3 hover:bg-muted"
              >
                <Icon name="chevronRight" size={18} />
              </button>
            </div>

            <p className="text-[13px] font-semibold text-texto-2">{capitalizar(fechaLarga(dia))}</p>
            <AvisoOk>{aviso}</AvisoOk>
            <ErrorMsg>{rapida.error}</ErrorMsg>
            <ErrorMsg onReintentar={agenda.recargar}>{agenda.error}</ErrorMsg>

            {delDia.length === 0 ? (
              <p className="py-10 text-center text-sm text-texto-3">No tenés citas este día.</p>
            ) : (
              <div className="space-y-2.5">
                {delDia.map((c) => (
                  <TarjetaCita
                    key={c.id}
                    cita={c}
                    rapidas={esTerminal(c.estado) ? [] : accionesRapidas(c, { profesional: true, ahora: Date.now() })}
                    onAbrir={() => setAbierta(c)}
                    onAccion={(a) => rapida.pedir(c, a)}
                    ocupado={rapida.ocupadoId === c.id}
                    mostrarRecurso={recursos.length > 1}
                    destacada={proxima?.cita.id === c.id}
                  />
                ))}
              </div>
            )}
            {sinTelefono && (
              <p className="flex items-center gap-2 px-1 text-[12px] text-texto-3">
                <Icon name="lock" size={15} />
                El teléfono de los clientes lo ve sólo recepción.
              </p>
            )}
          </>
        )}
      </main>

      {abierta && (
        <DetalleCita
          cita={abierta}
          modo="profesional"
          onClose={() => setAbierta(null)}
          onCambio={(c) => agenda.setDatos((d) => conCita(d, c))}
        />
      )}
      {nueva && sucursalId != null && (
        <NuevaCita
          sucursalId={sucursalId}
          precarga={{ fecha: dia }}
          soloRecursoIds={recursos.map((r) => r.id)}
          onClose={() => setNueva(false)}
          onCreada={(c) => {
            setNueva(false);
            agenda.setDatos((d) => conCita(d, c));
            setAviso(`Cita agendada: ${c.cliente.nombre} a las ${horaNegocio(c.inicio)}`);
          }}
        />
      )}
      {rapida.dialogo}
    </div>
  );
}

/**
 * La cita para mirar ya: la que está en atención ("AHORA") o la siguiente de
 * hoy que todavía no empezó. Mañana no cuenta: a las 20:00 "próxima cita
 * mañana 9:00" se lee como un error.
 */
function proximaCita(citas: Cita[], hoy: string): { cita: Cita; rotulo: string } | null {
  const deHoy = citas.filter((c) => c.inicio && fechaNegocio(c.inicio) === hoy);
  const ahora = deHoy.find((c) => c.estado === "EN_ATENCION");
  if (ahora) return { cita: ahora, rotulo: "Ahora" };
  const ya = new Date().toISOString();
  const sig = deHoy.find(
    (c) =>
      ["RESERVADA", "CONFIRMADA", "EN_ESPERA"].includes(c.estado) &&
      (c.estado === "EN_ESPERA" || new Date(c.inicio ?? 0).getTime() >= Date.now()),
  );
  if (!sig?.inicio) return null;
  if (sig.estado === "EN_ESPERA") return { cita: sig, rotulo: "Próxima cita · ya llegó" };
  const falta = minutosEntre(ya, sig.inicio);
  return { cita: sig, rotulo: `Próxima cita · en ${duracionTexto(falta)}` };
}

function SinRecurso({ etiqueta }: { etiqueta: string }) {
  const { logout } = useAuth();
  return (
    <div className="card mx-auto mt-6 max-w-sm space-y-3 p-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
        <Icon name="calendar" size={26} />
      </div>
      <h2 className="text-base font-bold text-texto">Tu usuario no está vinculado a una agenda</h2>
      <p className="text-[13px] text-texto-3">
        Para ver tus citas, el administrador tiene que vincular tu usuario con tu ficha de{" "}
        {etiqueta.toLowerCase()} en Configurar agenda. Cuando lo haga, entrá de nuevo.
      </p>
      <Boton variante="ghost" icono="logout" onClick={logout} className="w-full">
        Cerrar sesión
      </Boton>
    </div>
  );
}
