import { useState } from "react";
import { Icon } from "../../components/Icon";
import { AvisoOk, Boton, ErrorMsg, Modal, Select, useAviso } from "../../components/ui";
import { apiSpa } from "../../lib/agenda/apiSpa";
import { mensajeDe } from "../../lib/agenda/apiAgenda";
import { useSpa } from "../../lib/agenda/spa";
import type { FichaSalud, FichaSaludInput, PaqueteDelCliente } from "../../lib/agenda/tiposSpa";
import { fmtFecha } from "../../lib/format";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { Rotulo } from "./piezas";

/**
 * Lo que la fase 3 le suma a la ficha del cliente: sus paquetes con el saldo
 * de sesiones, y su ficha de salud con los consentimientos firmados.
 *
 * La ficha de salud es **dato sensible** (§17.3): sólo con el permiso de
 * datos de salud, nunca a PostHog (el `request` sólo reporta ruta y mensaje
 * de un 5xx) y el backend no la manda al modo soporte.
 */
export default function FichaSpa({ clienteId }: { clienteId: number }) {
  const spa = useSpa();
  const { usuario } = useAuth();
  const veSalud = spa.consentimientos && tienePermiso(usuario, "cliente.ver_salud", true);
  return (
    <>
      {spa.paquetes && <PaquetesCliente clienteId={clienteId} />}
      {veSalud && <SaludCliente clienteId={clienteId} />}
    </>
  );
}

function PaquetesCliente({ clienteId }: { clienteId: number }) {
  const paquetes = useApi(() => apiSpa.paquetesDelCliente(clienteId), [clienteId]);
  const lista = paquetes.datos ?? [];
  if (!paquetes.error && lista.length === 0) return null;
  return (
    <section className="space-y-2">
      <Rotulo>Paquetes</Rotulo>
      <ErrorMsg onReintentar={paquetes.recargar}>{paquetes.error}</ErrorMsg>
      <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
        {lista.map((p) => (
          <li key={p.id} className="space-y-1 p-3">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-[13px] font-semibold text-texto">{p.nombre}</p>
              <EstadoPaquete paquete={p} />
            </div>
            <p className="text-[13px] text-texto-2">
              {p.items.map((i) => `${i.servicio}: ${i.restantes} de ${i.sesiones}`).join(" · ")}
            </p>
            <p className="text-[12px] text-texto-3">
              Comprado el {fmtFecha(p.compradoEn)} · vence el {fmtFecha(`${p.ultimoDia}T12:00:00`)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EstadoPaquete({ paquete }: { paquete: PaqueteDelCliente }) {
  const quedan = paquete.items.reduce((s, i) => s + i.restantes, 0);
  const [texto, clases] =
    paquete.estado === "ANULADO"
      ? ["Anulado", "bg-slate-100 text-texto-3"]
      : paquete.vencido
        ? ["Vencido", "bg-danger-bg text-danger-text"]
        : quedan === 0
          ? ["Usado", "bg-slate-100 text-texto-3"]
          : [`${quedan} ${quedan === 1 ? "sesión" : "sesiones"}`, "bg-primary-50 text-primary-700"];
  return <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase ${clases}`}>{texto}</span>;
}

const CAMPOS: { campo: keyof Omit<FichaSalud, "actualizadoEn" | "embarazo">; titulo: string }[] = [
  { campo: "antecedentes", titulo: "Antecedentes" },
  { campo: "medicamentos", titulo: "Medicamentos" },
  { campo: "contraindicaciones", titulo: "Contraindicaciones" },
  { campo: "observaciones", titulo: "Observaciones" },
];

function SaludCliente({ clienteId }: { clienteId: number }) {
  const salud = useApi(() => apiSpa.saludDelCliente(clienteId), [clienteId]);
  const [editando, setEditando] = useState(false);
  const [viendo, setViendo] = useState<number | null>(null);
  const [aviso, setAviso] = useAviso(4000);
  const ficha = salud.datos?.ficha ?? null;
  const firmados = salud.datos?.firmados ?? [];

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Rotulo>Salud y consentimientos</Rotulo>
        {salud.datos && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-semibold text-primary-700 hover:bg-primary-50"
          >
            <Icon name="edit" size={15} /> {ficha ? "Editar" : "Completar"}
          </button>
        )}
      </div>
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg onReintentar={salud.recargar}>{salud.error}</ErrorMsg>
      <div className="space-y-1.5 rounded-xl bg-muted p-3 text-[13px]">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-texto-3">
          Ficha de salud
          <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger-text">
            Dato sensible
          </span>
        </p>
        {ficha ? (
          <dl className="space-y-1">
            {CAMPOS.filter((c) => ficha[c.campo]).map((c) => (
              <div key={c.campo}>
                <dt className="inline font-semibold text-texto-2">{c.titulo}: </dt>
                <dd className="inline whitespace-pre-wrap text-texto">{ficha[c.campo]}</dd>
              </div>
            ))}
            {ficha.embarazo != null && (
              <div>
                <dt className="inline font-semibold text-texto-2">Embarazo: </dt>
                <dd className="inline text-texto">{ficha.embarazo ? "Sí" : "No"}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-texto-4">Sin ficha de salud todavía.</p>
        )}
      </div>
      {firmados.length > 0 && (
        <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
          {firmados.map((f) => (
            <li key={f.id} className="flex items-center gap-2 p-3 text-[13px]">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-texto">
                  {f.servicio} <span className="font-normal text-texto-3">· v{f.version}</span>
                </p>
                <p className="text-[12px] text-texto-3">
                  Firmó {f.firmante ?? "—"} el {fmtFecha(f.firmadoEn)}
                  {!f.vigente && <span className="ml-1 font-semibold text-warning-text">· el texto cambió: firmar de nuevo</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViendo(f.id)}
                className="shrink-0 rounded-lg px-2 py-1 font-semibold text-primary-700 hover:bg-primary-50"
              >
                Ver
              </button>
            </li>
          ))}
        </ul>
      )}
      {editando && salud.datos && (
        <EditarSalud
          clienteId={clienteId}
          ficha={ficha}
          onClose={() => setEditando(false)}
          onGuardada={() => {
            setEditando(false);
            setAviso("Ficha de salud guardada");
            salud.recargar();
          }}
        />
      )}
      {viendo != null && <VerConsentimiento id={viendo} onClose={() => setViendo(null)} />}
    </section>
  );
}

function EditarSalud({
  clienteId,
  ficha,
  onClose,
  onGuardada,
}: {
  clienteId: number;
  ficha: FichaSalud | null;
  onClose: () => void;
  onGuardada: () => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAMPOS.map((c) => [c.campo, ficha?.[c.campo] ?? ""])),
  );
  const [embarazo, setEmbarazo] = useState(ficha?.embarazo == null ? "" : ficha.embarazo ? "si" : "no");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const input: FichaSaludInput = {
      ...Object.fromEntries(CAMPOS.map((c) => [c.campo, valores[c.campo].trim() || null])),
      embarazo: embarazo === "" ? null : embarazo === "si",
    };
    setGuardando(true);
    setError("");
    try {
      await apiSpa.guardarFichaSalud(clienteId, input);
      onGuardada();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo guardar la ficha de salud"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo="Ficha de salud"
      subtitulo="Dato sensible: sólo para atender bien."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        {CAMPOS.map((c) => (
          <label key={c.campo} className="block space-y-1">
            <span className="text-[13px] font-semibold text-texto-2">{c.titulo}</span>
            <textarea
              value={valores[c.campo]}
              onChange={(e) => setValores((v) => ({ ...v, [c.campo]: e.target.value }))}
              rows={2}
              maxLength={2000}
              className="w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
          </label>
        ))}
        <label className="block space-y-1">
          <span className="text-[13px] font-semibold text-texto-2">Embarazo</span>
          <Select value={embarazo} onChange={(e) => setEmbarazo(e.target.value)} aria-label="Embarazo">
            <option value="">No se preguntó</option>
            <option value="no">No</option>
            <option value="si">Sí</option>
          </Select>
        </label>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

function VerConsentimiento({ id, onClose }: { id: number; onClose: () => void }) {
  const c = useApi(() => apiSpa.consentimiento(id), [id]);
  return (
    <Modal abierto titulo={c.datos ? `Consentimiento · ${c.datos.servicio}` : "Consentimiento"} onClose={onClose} ancho="max-w-2xl">
      <ErrorMsg onReintentar={c.recargar}>{c.error}</ErrorMsg>
      {c.datos && (
        <div className="space-y-3">
          <p className="text-[12px] text-texto-3">
            Versión {c.datos.version} · firmó {c.datos.firmante} el {fmtFecha(c.datos.firmadoEn)}
          </p>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted p-3.5 text-sm text-texto-2">
            {c.datos.texto}
          </div>
          <img src={c.datos.firma} alt={`Firma de ${c.datos.firmante}`} className="max-h-40 rounded-xl border border-borde bg-white" />
        </div>
      )}
    </Modal>
  );
}
