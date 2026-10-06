import { useState } from "react";
import { AvisoOk, Boton, Campo, Cargando, ErrorMsg, Input, useAviso, Vacio } from "../../../components/ui";
import { apiComisiones } from "../../../lib/agenda/apiComisiones";
import type { ConfigComision, EventoComision } from "../../../lib/agenda/tiposComisiones";
import { fmtFechaHora, fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { mensajeDe } from "../config/utilConfig";

/** "" = sin %; si no, el número validado (0 a 100) o undefined si no sirve. */
function leerPct(texto: string): number | null | undefined {
  const t = texto.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
}

const txt = (n: number | null) => (n == null ? "" : String(n));

/**
 * Los % de cada profesional: el base sobre servicios, uno propio por servicio
 * (el tinte paga más que el corte) y el de productos de reventa. Valen para lo
 * que se cobre de acá en adelante: lo ya cobrado tiene su % congelado.
 */
export default function TabPorcentajes() {
  const config = useApi(() => apiComisiones.config(), []);
  const bitacora = useApi(() => apiComisiones.bitacora(), []);
  const [aviso, setAviso] = useAviso();

  if (config.error) return <ErrorMsg onReintentar={config.recargar}>{config.error}</ErrorMsg>;
  if (!config.datos) return <Cargando />;
  if (!config.datos.length) {
    return (
      <div className="card">
        <Vacio icono="users" titulo="Sin profesionales" texto="Cargalos en Configuración de agenda." />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <AvisoOk>{aviso}</AvisoOk>
      <p className="text-[13px] text-texto-3">
        El % se congela en cada venta al cobrar: cambiarlo no reescribe lo ya cobrado.
      </p>
      {config.datos.map((c) => (
        <FormPct
          key={c.recursoId}
          config={c}
          onGuardado={(n) => {
            setAviso(`Porcentajes de ${n.nombre} guardados.`);
            config.recargar();
            bitacora.recargar();
          }}
        />
      ))}
      <Bitacora eventos={bitacora.datos ?? []} />
    </div>
  );
}

function FormPct({ config, onGuardado }: { config: ConfigComision; onGuardado: (c: ConfigComision) => void }) {
  const [base, setBase] = useState(txt(config.comisionPct));
  const [productos, setProductos] = useState(txt(config.comisionProductoPct));
  const [porServicio, setPorServicio] = useState<Record<number, string>>(() =>
    Object.fromEntries(config.servicios.map((s) => [s.servicioId, txt(s.comisionPct)])),
  );
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const b = leerPct(base);
    const p = leerPct(productos);
    const servicios = config.servicios.map((s) => ({
      servicioId: s.servicioId,
      comisionPct: leerPct(porServicio[s.servicioId] ?? ""),
    }));
    if (b === undefined || p === undefined || servicios.some((s) => s.comisionPct === undefined)) {
      return setError("Los porcentajes van de 0 a 100 (o vacío).");
    }
    setGuardando(true);
    setError("");
    try {
      onGuardado(
        await apiComisiones.guardarConfig(config.recursoId, {
          comisionPct: b,
          comisionProductoPct: p,
          servicios: servicios.map((s) => ({ servicioId: s.servicioId, comisionPct: s.comisionPct ?? null })),
        }),
      );
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="card space-y-3 p-4" aria-label={`Porcentajes de ${config.nombre}`}>
      <h2 className="text-[15px] font-bold text-texto">
        {config.nombre}
        {!config.activo && <span className="ml-2 text-[12px] font-normal text-texto-4">(inactivo)</span>}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Comisión sobre servicios (%)" hint="Vacío = no comisiona.">
          {/* Sin un "40" de ejemplo: se leía como que ya comisiona 40 % (QA DIA-14). */}
          <Input type="number" value={base} onChange={(e) => setBase(e.target.value)} placeholder="Sin comisión" />
        </Campo>
        <Campo label="Comisión sobre productos (%)" hint="Lo que vende de reventa. Vacío = no comisiona.">
          <Input
            type="number"
            value={productos}
            onChange={(e) => setProductos(e.target.value)}
            placeholder="Sin comisión"
          />
        </Campo>
      </div>
      {config.servicios.length > 0 && (
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">% propio por servicio (opcional)</p>
          <p className="mb-2 text-[12px] text-texto-3">
            {base.trim()
              ? `Vacío = el ${base.trim()} % de sus servicios.`
              : "Vacío = no comisiona ese servicio."}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {config.servicios.map((s) => (
              <label key={s.servicioId} className="flex items-center gap-2 text-[13px] text-texto-2">
                <span className="min-w-0 flex-1 truncate" title={s.servicio}>
                  {s.servicio}
                </span>
                {/* El ancho va en un envoltorio: el `w-full` del Input le ganaba
                    al `w-20` y el nombre del servicio quedaba en 0 px (QA DIA-01). */}
                <span className="w-24 shrink-0">
                  <Input
                    type="number"
                    aria-label={`% de ${s.servicio}`}
                    value={porServicio[s.servicioId] ?? ""}
                    onChange={(e) => setPorServicio((v) => ({ ...v, [s.servicioId]: e.target.value }))}
                    placeholder={base.trim() ? `${base.trim()} %` : "—"}
                  />
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
      <ErrorMsg>{error}</ErrorMsg>
      <div className="flex justify-end">
        <Boton onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Boton>
      </div>
    </section>
  );
}

const ACCION: Record<EventoComision["accion"], string> = {
  CONFIGURAR: "Cambió los porcentajes",
  ADELANTO: "Registró un adelanto",
  ANULAR_ADELANTO: "Anuló un adelanto",
  LIQUIDAR: "Cerró una liquidación",
};

function Bitacora({ eventos }: { eventos: EventoComision[] }) {
  if (!eventos.length) return null;
  return (
    <section className="card p-4" aria-label="Bitácora de comisiones">
      <h2 className="mb-2 text-[15px] font-bold text-texto">Bitácora</h2>
      <ul className="space-y-1.5 text-[13px]">
        {eventos.slice(0, 30).map((e) => {
          const monto = (e.detalle?.monto ?? e.detalle?.neto) as number | undefined;
          return (
            <li key={e.id} className="flex flex-wrap gap-x-2 text-texto-2">
              <span className="text-texto-4">{fmtFechaHora(e.en)}</span>
              <span>
                {e.usuario ?? "Alguien"} · {ACCION[e.accion] ?? e.accion}
                {e.recurso ? ` de ${e.recurso}` : ""}
                {typeof monto === "number" ? ` (${fmtMoney(monto)})` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
