import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { AvisoOk, Boton, Cargando, ErrorMsg, Input, Vacio, useAviso } from "../../components/ui";
import { apiAgenda, mensajeDe } from "../../lib/agenda/apiAgenda";
import { horaNegocio } from "../../lib/agenda/horaAgenda";
import type { CitaHistorial, ClienteFicha, ClienteFichaDetalle } from "../../lib/agenda/tiposAgenda";
import { fmtFecha, fmtMoney, iniciales } from "../../lib/format";
import { Telefono } from "../../lib/telefono";
import { useApi } from "../../lib/useApi";
import { FichaTecnicaCliente } from "../belleza/ExtrasAgenda";
import { BadgeEstado, Rotulo } from "./piezas";

/** Lo que tarda en buscar después de la última tecla. */
const ESPERA_BUSQUEDA_MS = 300;

/**
 * A7 · Cliente (PLAN-AGENDA-BELLEZA §5.1): el buscador de fichas y la ficha
 * con su historia —citas con servicio y profesional, compras—, sus no-shows,
 * alergias y notas, y el "no permitir reservas online".
 *
 * Las fichas nacen solas al agendar con teléfono (ola B): esta pantalla es
 * para encontrarlas y completarlas, no para darlas de alta una por una.
 */
export default function Clientes() {
  const [texto, setTexto] = useState("");
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState<number | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(texto.trim()), ESPERA_BUSQUEDA_MS);
    return () => window.clearTimeout(t);
  }, [texto]);

  const lista = useApi(() => apiAgenda.buscarClientes(q), [q]);
  const clientes = lista.datos ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-bold text-texto">Clientes</h1>
        <p className="text-[13px] text-texto-3">
          {q ? "Por nombre o teléfono" : "Los que vinieron hace menos tiempo primero"}
        </p>
      </header>

      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-texto-4">
          <Icon name="search" size={18} />
        </span>
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nombre o teléfono"
          aria-label="Buscar cliente"
          className="pl-10"
        />
      </div>

      <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      {lista.cargando && !lista.datos ? (
        <Cargando texto="Buscando…" />
      ) : clientes.length === 0 ? (
        <Vacio
          icono="users"
          titulo={q ? "Nadie con ese nombre o teléfono" : "Todavía no hay clientes"}
          texto={q ? undefined : "La ficha se crea sola al agendar una cita con teléfono."}
        />
      ) : (
        <ul className="space-y-2">
          {clientes.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setAbierta(c.id)}
                aria-label={`Ver la ficha de ${c.nombre}`}
                className="card flex w-full items-center gap-3 p-3.5 text-left hover:border-primary"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 font-bold text-primary-700">
                  {iniciales(c.nombre)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-texto">{c.nombre}</span>
                  <span className="block text-[13px] text-texto-2">
                    {c.telefono ? Telefono.paraMostrar(c.telefono) : "Sin teléfono"}
                    {c.ultimaVisita ? ` · última visita ${fmtFecha(c.ultimaVisita)}` : ""}
                  </span>
                </span>
                <MarcasCliente cliente={c} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {abierta !== null && (
        <FichaCliente
          id={abierta}
          onClose={() => setAbierta(null)}
          onCambio={(f) => lista.setDatos(clientes.map((c) => (c.id === f.id ? { ...c, ...f } : c)))}
        />
      )}
    </div>
  );
}

function MarcasCliente({ cliente }: { cliente: ClienteFicha }) {
  return (
    <span className="flex shrink-0 flex-col items-end gap-1 text-[11px] font-semibold">
      {cliente.noShows > 0 && (
        <span className="rounded-lg bg-danger-bg px-2 py-0.5 text-danger-text">
          {cliente.noShows} {cliente.noShows === 1 ? "inasistencia" : "inasistencias"}
        </span>
      )}
      {cliente.bloqueadoOnline && (
        <span className="rounded-lg bg-warning-bg px-2 py-0.5 text-warning-text">Sin reserva online</span>
      )}
    </span>
  );
}

/**
 * La ficha en un panel lateral (pantalla completa en el celular), como la
 * cita (A4). Alergias va marcado como dato sensible: se ve, pero no se copia
 * a ningún lado (ni a PostHog ni al recordatorio).
 */
export function FichaCliente({
  id,
  onClose,
  onCambio,
}: {
  id: number;
  onClose: () => void;
  onCambio: (ficha: ClienteFicha) => void;
}) {
  const ficha = useApi(() => apiAgenda.cliente(id), [id]);
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useAviso(4000);

  useEffect(() => {
    if (editando) return;
    const alTecla = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [onClose, editando]);

  const f = ficha.datos;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/30"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={f ? `Ficha de ${f.nombre}` : "Ficha del cliente"}
        className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-[460px] sm:border-l sm:border-borde"
      >
        <header className="flex items-start gap-3 border-b border-borde-soft px-5 py-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-texto">{f?.nombre ?? "Cliente"}</h1>
            {f && (
              <p className="text-[13px] text-texto-3">
                {f.telefono ? Telefono.paraMostrar(f.telefono) : "Sin teléfono"}
                {f.fechaNacimiento ? ` · nació el ${fmtFecha(`${f.fechaNacimiento}T12:00:00`)}` : ""}
              </p>
            )}
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
          <ErrorMsg onReintentar={ficha.recargar}>{ficha.error}</ErrorMsg>
          {!f ? (
            ficha.cargando && <Cargando texto="Cargando la ficha…" />
          ) : editando ? (
            <EditarFicha
              ficha={f}
              onCancelar={() => setEditando(false)}
              onGuardada={(nueva) => {
                ficha.setDatos({ ...f, ...nueva });
                onCambio(nueva);
                setEditando(false);
                setAviso("Ficha guardada");
              }}
            />
          ) : (
            <>
              <AvisoOk>{aviso}</AvisoOk>
              <Resumen ficha={f} />
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <Rotulo>Datos de cuidado</Rotulo>
                  <button
                    type="button"
                    onClick={() => setEditando(true)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-semibold text-primary-700 hover:bg-primary-50"
                  >
                    <Icon name="edit" size={15} /> Editar
                  </button>
                </div>
                <Dato titulo="Alergias" sensible vacio="Sin alergias anotadas">
                  {f.alergias}
                </Dato>
                <Dato titulo="Notas" vacio="Sin notas">
                  {f.notas}
                </Dato>
                <p className="text-[13px] text-texto-2">
                  Reservas online:{" "}
                  <strong className={f.bloqueadoOnline ? "text-warning-text" : "text-texto"}>
                    {f.bloqueadoOnline ? "no permitidas" : "permitidas"}
                  </strong>
                </p>
              </section>
              <HistorialCitas citas={f.citas} />
              {/* Belleza fase 4: fórmulas y fotos (sólo con su feature). */}
              <FichaTecnicaCliente clienteId={f.id} />
              <Compras ficha={f} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Resumen({ ficha }: { ficha: ClienteFichaDetalle }) {
  const atendidas = ficha.citas.filter((c) => c.estado === "COMPLETADA").length;
  return (
    <dl className="grid grid-cols-3 gap-2">
      <Cifra etiqueta="Visitas" valor={String(atendidas)} />
      <Cifra etiqueta="No vino" valor={String(ficha.noShows)} alerta={ficha.noShows > 0} />
      <Cifra etiqueta="Última visita" valor={ficha.ultimaVisita ? fmtFecha(ficha.ultimaVisita) : "—"} />
    </dl>
  );
}

function Cifra({ etiqueta, valor, alerta = false }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${alerta ? "border-danger/30 bg-danger-bg" : "border-borde bg-white"}`}>
      <dt className={`text-[11px] font-semibold uppercase ${alerta ? "text-danger-text" : "text-texto-3"}`}>{etiqueta}</dt>
      <dd className={`truncate text-base font-bold ${alerta ? "text-danger-text" : "text-texto"}`}>{valor}</dd>
    </div>
  );
}

function Dato({
  titulo,
  sensible = false,
  vacio,
  children,
}: {
  titulo: string;
  sensible?: boolean;
  vacio: string;
  children: string | null;
}) {
  return (
    <div className={`rounded-xl p-3 ${sensible && children ? "bg-danger-bg" : "bg-muted"}`}>
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-texto-3">
        {titulo}
        {sensible && (
          <span
            title="Dato de salud: sólo para atender bien. No se comparte ni sale en el recordatorio."
            className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger-text"
          >
            Dato sensible
          </span>
        )}
      </p>
      <p className={`mt-0.5 whitespace-pre-wrap text-sm ${children ? "text-texto" : "text-texto-4"}`}>
        {children || vacio}
      </p>
    </div>
  );
}

function HistorialCitas({ citas }: { citas: CitaHistorial[] }) {
  return (
    <section className="space-y-2">
      <Rotulo>Citas</Rotulo>
      {citas.length === 0 ? (
        <p className="text-[13px] text-texto-3">Todavía no tiene citas.</p>
      ) : (
        <ol className="divide-y divide-borde-soft rounded-xl border border-borde">
          {citas.map((c) => (
            <li key={c.id} className="space-y-1 p-3">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-[13px] font-semibold text-texto">
                  {c.inicio ? `${fmtFecha(c.inicio)} · ${horaNegocio(c.inicio)}` : "En la cola"}
                  <span className="font-normal text-texto-3"> · {c.sucursal}</span>
                </p>
                <BadgeEstado estado={c.estado} />
              </div>
              <p className="text-[13px] text-texto-2">
                {c.lineas.map((l) => `${l.servicio} con ${l.recurso}`).join(" · ") || "Sin servicios"}
              </p>
              {(c.total > 0 || c.cobroRevisar || c.motivoCancelacion) && (
                <p className="text-[12px] text-texto-3">
                  {c.total > 0 ? fmtMoney(c.total) : ""}
                  {c.cobroRevisar ? " · cobro para revisar" : ""}
                  {c.motivoCancelacion ? ` · ${c.motivoCancelacion}` : ""}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Compras({ ficha }: { ficha: ClienteFichaDetalle }) {
  if (ficha.compras.length === 0) return null;
  return (
    <section className="space-y-2">
      <Rotulo>Compras</Rotulo>
      <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
        {ficha.compras.map((v) => (
          <li key={v.id} className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-texto">
                {v.comprobante ?? `#${v.id}`} · {fmtFecha(v.fecha)}
                {v.fiado && <span className="ml-1 font-normal text-texto-3">· fiado</span>}
                {v.estado === "ANULADO" && <span className="ml-1 font-semibold text-danger-text">· anulada</span>}
              </p>
              <p className="truncate text-[12px] text-texto-3">
                {v.items.map((i) => (i.cantidad === 1 ? i.producto : `${i.cantidad} × ${i.producto}`)).join(", ")}
              </p>
            </div>
            <span className={`text-sm font-semibold ${v.estado === "ANULADO" ? "text-texto-4 line-through" : "text-texto"}`}>
              {fmtMoney(v.total)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Lo que recepción completa a mano: alergias, notas y el bloqueo online. */
function EditarFicha({
  ficha,
  onCancelar,
  onGuardada,
}: {
  ficha: ClienteFicha;
  onCancelar: () => void;
  onGuardada: (f: ClienteFicha) => void;
}) {
  const [alergias, setAlergias] = useState(ficha.alergias ?? "");
  const [notas, setNotas] = useState(ficha.notas ?? "");
  const [bloqueado, setBloqueado] = useState(ficha.bloqueadoOnline);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function guardar() {
    setError("");
    setGuardando(true);
    try {
      onGuardada(
        await apiAgenda.editarCliente(ficha.id, {
          // Vacío borra el dato: null, no "".
          alergias: alergias.trim() || null,
          notas: notas.trim() || null,
          bloqueadoOnline: bloqueado,
        }),
      );
    } catch (e) {
      setError(mensajeDe(e, "No se pudo guardar la ficha"));
    } finally {
      setGuardando(false);
    }
  }

  const area =
    "w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100";
  return (
    <section className="space-y-4">
      <label className="block">
        <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-texto-2">
          Alergias
          <span className="rounded bg-danger-bg px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger-text">
            Dato sensible
          </span>
        </span>
        <textarea
          value={alergias}
          onChange={(e) => setAlergias(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Ej.: amoníaco, látex"
          className={area}
        />
        <span className="mt-1 block text-xs text-texto-4">
          Es dato de salud: lo ve quien atiende, no se comparte ni sale en el recordatorio.
        </span>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">Notas</span>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Ej.: prefiere a Ana, viene con su hija"
          className={area}
        />
      </label>
      <label className="flex items-start gap-3 rounded-xl border border-borde p-3">
        <input
          type="checkbox"
          checked={bloqueado}
          onChange={(e) => setBloqueado(e.target.checked)}
          className="mt-0.5 h-5 w-5 accent-[var(--color-primary)]"
        />
        <span>
          <span className="block text-sm font-semibold text-texto">No permitir reservas online</span>
          <span className="block text-[12px] text-texto-3">
            Puede seguir agendando por teléfono o en el local. Se activa solo al llegar al tope de inasistencias.
          </span>
        </span>
      </label>
      <ErrorMsg>{error}</ErrorMsg>
      <div className="flex gap-2">
        <Boton variante="ghost" onClick={onCancelar} disabled={guardando} className="flex-1">
          Cancelar
        </Boton>
        <Boton onClick={() => void guardar()} disabled={guardando} className="flex-1">
          {guardando ? "Guardando…" : "Guardar"}
        </Boton>
      </div>
    </section>
  );
}
