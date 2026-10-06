import { useMemo, useState } from "react";
import { Boton, Campo, ErrorMsg, Input, Modal, Select, Vacio } from "../../components/ui";
import { apiAgenda, esperaDelConflicto, mensajeDe } from "../../lib/agenda/apiAgenda";
import { profesionalesParaCola, serviciosDeLaCola } from "../../lib/agenda/cola";
import { duracionTexto, minutosEntre } from "../../lib/agenda/horaAgenda";
import type { Cita, Recurso } from "../../lib/agenda/tiposAgenda";
import { useApi } from "../../lib/useApi";

/**
 * A6 · Cola de espera (walk-in, feature `cola_walkin`). El que llega sin turno
 * se anota con lo que quiere y, si tiene, con quién; "Atender ahora" le busca
 * el primer profesional libre que haga eso (o el preferido) y arranca la cita
 * desde este momento. Si no hay nadie, el backend contesta cuánto falta.
 *
 * Probada de punta a punta recién en los detalles chicos (la feature estaba
 * apagada en QA): ahora dice qué pidió cada uno (venía en `serviciosPedidos`,
 * no en las líneas) y deja elegir con quién atenderlo. Antes, si el preferido
 * estaba ocupado, "Atender ahora" insistía con él y no había forma de dárselo
 * a otro que estuviera libre.
 */
export default function ColaEspera({
  cola,
  sucursalId,
  recursos,
  onCambio,
}: {
  cola: Cita[];
  sucursalId: number | null;
  /**
   * Para nombrar al preferido y ofrecer con quién atender. Sin ellos (Hoy no
   * los tiene) la cola los pide.
   */
  recursos?: Recurso[];
  onCambio: () => void;
}) {
  const [agregando, setAgregando] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  /** Con quién atender a cada uno; sin elegir, el preferido o el primero libre. */
  const [conQuien, setConQuien] = useState<Record<number, number | "">>({});
  const propios = useApi(
    () => (recursos ? Promise.resolve([] as Recurso[]) : apiAgenda.recursos().catch(() => [] as Recurso[])),
    [!recursos],
  );
  const todos = recursos ?? propios.datos ?? [];

  const ordenada = useMemo(
    () => [...cola].sort((a, b) => a.creadaEn.localeCompare(b.creadaEn)),
    [cola],
  );

  async function atender(c: Cita) {
    setError("");
    setAviso("");
    setOcupado(c.id);
    const elegido = conQuien[c.id];
    try {
      await apiAgenda.atenderAhora(c.id, elegido === "" || elegido == null ? undefined : elegido);
      onCambio();
    } catch (e) {
      const espera = esperaDelConflicto(e);
      if (espera !== null) {
        // Sin elegir, el backend probó con el preferido: es a él a quien nombrar.
        const intentado = elegido || c.recursoPreferidoId;
        const quien = intentado ? todos.find((r) => r.id === intentado)?.nombre : null;
        setAviso(
          `${quien ? `${quien} no está libre` : `No hay nadie libre para ${c.cliente.nombre}`} ahora. Espera estimada: ~${duracionTexto(espera)}.` +
            (otrosQueLoHacen(c, elegido) ? " Podés elegir a otro en «Con»." : ""),
        );
      } else {
        setError(mensajeDe(e));
      }
    } finally {
      setOcupado(null);
    }
  }

  /** Los que pueden atenderlo (hacen todo lo que pidió, en esta sucursal). */
  const quienesPueden = (c: Cita) =>
    profesionalesParaCola(
      todos,
      (c.serviciosPedidos ?? []).map((s) => s.id),
      sucursalId,
    );
  /** ¿Hay alguien más para elegir que el que se intentó? */
  const otrosQueLoHacen = (c: Cita, intentado: number | "" | undefined) => {
    const ya = intentado || c.recursoPreferidoId;
    return quienesPueden(c).some((r) => r.id !== ya);
  };

  async function seFue(c: Cita) {
    setError("");
    setOcupado(c.id);
    try {
      await apiAgenda.cambiarEstado(c.id, "ABANDONO");
      onCambio();
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section aria-label="Cola de espera" className="card space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-texto">Cola de espera</h2>
        <Boton variante="ghost" icono="plus" onClick={() => setAgregando(true)} disabled={!sucursalId}>
          Agregar
        </Boton>
      </div>

      {aviso && (
        <p role="status" className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] font-semibold text-warning-text">
          {aviso}
        </p>
      )}
      <ErrorMsg>{error}</ErrorMsg>

      {ordenada.length === 0 ? (
        <p className="text-[13px] text-texto-3">Nadie esperando.</p>
      ) : (
        <ol className="space-y-2">
          {ordenada.map((c, i) => {
            const servicios = serviciosDeLaCola(c);
            const preferido = c.recursoPreferidoId
              ? todos.find((r) => r.id === c.recursoPreferidoId)?.nombre
              : null;
            const pueden = quienesPueden(c);
            const espera = minutosEntre(c.creadaEn, new Date().toISOString());
            return (
              <li key={c.id} className="space-y-2 rounded-xl border border-borde-soft px-3 py-2.5">
                <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[13px] font-bold text-primary-700">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-texto">{c.cliente.nombre}</p>
                  <p className="text-[12px] text-texto-3">
                    {[servicios, preferido ? `con ${preferido} si se puede` : "", `esperando ${duracionTexto(Math.max(0, espera))}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                </div>
                {pueden.length > 0 && (
                  <label className="flex items-center gap-2 text-[13px] text-texto-2">
                    <span className="shrink-0">Con</span>
                    <Select
                      aria-label={`Con quién atender a ${c.cliente.nombre}`}
                      className="min-w-0 flex-1 py-1.5 text-[13px]"
                      value={conQuien[c.id] ?? ""}
                      onChange={(e) =>
                        setConQuien((x) => ({ ...x, [c.id]: e.target.value ? Number(e.target.value) : "" }))
                      }
                    >
                      <option value="">{preferido ? `${preferido} (lo pidió)` : "El primero libre"}</option>
                      {pueden
                        .filter((r) => r.id !== c.recursoPreferidoId)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nombre}
                          </option>
                        ))}
                    </Select>
                  </label>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => atender(c)}
                    disabled={ocupado !== null}
                    className="h-9 flex-1 rounded-xl bg-primary-50 px-3 text-[13px] font-semibold text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                  >
                    Atender ahora
                  </button>
                  <button
                    type="button"
                    onClick={() => seFue(c)}
                    disabled={ocupado !== null}
                    className="h-9 flex-1 rounded-xl border border-borde bg-white px-3 text-[13px] text-texto-2 hover:bg-muted disabled:opacity-50"
                  >
                    Se fue
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {agregando && sucursalId && (
        <AgregarACola
          sucursalId={sucursalId}
          onClose={() => setAgregando(false)}
          onAgregado={() => {
            setAgregando(false);
            onCambio();
          }}
        />
      )}
    </section>
  );
}

function AgregarACola({
  sucursalId,
  onClose,
  onAgregado,
}: {
  sucursalId: number;
  onClose: () => void;
  onAgregado: () => void;
}) {
  const servicios = useApi(() => apiAgenda.servicios(), []);
  const recursos = useApi(() => apiAgenda.recursos(), []);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [elegidos, setElegidos] = useState<number[]>([]);
  const [preferido, setPreferido] = useState<number | "">("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Sólo profesionales (no cabinas) que hacen todo lo elegido: el backend
  // rechaza (400) un preferido que no lo hace.
  const deLaSucursal = profesionalesParaCola(recursos.datos ?? [], elegidos, sucursalId);
  // Si cambian los servicios y el elegido ya no los hace, vuelve a "Cualquiera".
  const preferidoValido = preferido !== "" && deLaSucursal.some((r) => r.id === preferido) ? preferido : "";

  async function agregar() {
    setError("");
    if (nombre.trim().length < 2) return setError("Poné el nombre de quien espera.");
    if (elegidos.length === 0) return setError("Elegí al menos un servicio.");
    const tel = telefono.replace(/\D/g, "");
    setEnviando(true);
    try {
      await apiAgenda.agregarACola({
        sucursalId,
        // Sin teléfono también: al que pasa por la puerta no siempre se le
        // pide. Vacío no se manda, para no chocar con el teléfono único.
        cliente: tel ? { nombre: nombre.trim(), telefono: tel } : { nombre: nombre.trim() },
        servicioIds: elegidos,
        ...(preferidoValido !== "" ? { recursoPreferidoId: preferidoValido } : {}),
      });
      onAgregado();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo agregar a la cola"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Agregar a la cola"
      onClose={onClose}
      ancho="max-w-md"
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton onClick={agregar} disabled={enviando}>
            {enviando ? "Agregando…" : "Agregar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </Campo>
        <Campo label="Teléfono (opcional)">
          <Input type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </Campo>
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Servicios</p>
          {servicios.cargando ? (
            <p className="text-[13px] text-texto-3">Cargando…</p>
          ) : (servicios.datos ?? []).length === 0 ? (
            <Vacio icono="calendar" titulo="No hay servicios cargados" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {(servicios.datos ?? [])
                .filter((s) => s.activo !== false)
                .map((s) => {
                  const marcado = elegidos.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={marcado}
                      onClick={() =>
                        setElegidos((xs) => (marcado ? xs.filter((x) => x !== s.id) : [...xs, s.id]))
                      }
                      className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                        marcado ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
                      }`}
                    >
                      {s.nombre}
                    </button>
                  );
                })}
            </div>
          )}
        </div>
        <Campo label="Con quién">
          <Select
            aria-label="Con quién"
            value={preferidoValido}
            onChange={(e) => setPreferido(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Cualquiera</option>
            {deLaSucursal.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </Select>
        </Campo>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
