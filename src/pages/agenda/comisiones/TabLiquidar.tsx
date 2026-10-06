import { useState } from "react";
import {
  AvisoOk,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Select,
  useAviso,
} from "../../../components/ui";
import { apiComisiones } from "../../../lib/agenda/apiComisiones";
import { textoPeriodo, type PeriodoElegido } from "../../../lib/agenda/periodos";
import type { LiquidarInput } from "../../../lib/agenda/tiposComisiones";
import { fmtFecha, fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { Casilla } from "../config/comun";
import { mensajeDe } from "../config/utilConfig";
import { TablaLineas } from "./TabProduccion";

type Metodo = NonNullable<LiquidarInput["metodoPago"]>;

/** El 409 PERIODO_LIQUIDADO del backend (el mensaje es lo que llega a la pantalla). */
const YA_LIQUIDADO = /se pisa con una liquidación ya cerrada/;

/**
 * Liquidar a un profesional por el período elegido: lo que ganó, menos lo que
 * le adelantaron, menos las comisiones de ventas que se anularon después de
 * pagadas. Al cerrar queda inmutable; si el negocio usa Gastos, el pago puede
 * quedar como gasto operativo (no toca la caja).
 */
export default function TabLiquidar({
  periodo,
  recursoId,
  onRecurso,
}: {
  periodo: PeriodoElegido;
  recursoId: number | null;
  onRecurso: (id: number | null) => void;
}) {
  const { negocio } = useAuth();
  const usaGastos = (negocio?.features ?? []).includes("gastos");
  const config = useApi(() => apiComisiones.config(), []);
  const profesionales = (config.datos ?? []).filter((p) => p.activo || p.recursoId === recursoId);
  const elegido = recursoId ?? null;

  const previa = useApi(
    () =>
      elegido == null
        ? Promise.resolve(null)
        : apiComisiones.previa({ recursoId: elegido, desde: periodo.desde, hasta: periodo.hasta }),
    [elegido, periodo.desde, periodo.hasta],
  );

  const [nota, setNota] = useState("");
  const [gasto, setGasto] = useState(false);
  const [metodo, setMetodo] = useState<Metodo>("EFECTIVO");
  const [confirmar, setConfirmar] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso();

  const p = previa.datos;
  const hayAlgo = !!p && (p.lineas.length > 0 || p.lineasAjuste.length > 0 || p.adelantosPendientes.length > 0);

  const cerrar = async () => {
    if (elegido == null) return;
    setCerrando(true);
    setError("");
    try {
      const l = await apiComisiones.liquidar({
        recursoId: elegido,
        desde: periodo.desde,
        hasta: periodo.hasta,
        periodo: periodo.tipo,
        nota: nota.trim() || null,
        registrarGasto: usaGastos && gasto,
        metodoPago: metodo,
      });
      setConfirmar(false);
      setNota("");
      setAviso(
        `Liquidación de ${l.recurso} cerrada: ${fmtMoney(l.neto)}${l.gastoId ? " (registrada en Gastos)" : ""}.`,
      );
      // Ese período ya no se puede volver a liquidar: se limpia la elección
      // en vez de mostrar el aviso de "período liquidado" como un error.
      onRecurso(null);
    } catch (e) {
      setConfirmar(false);
      setError(mensajeDe(e, "No se pudo cerrar la liquidación"));
    } finally {
      setCerrando(false);
    }
  };

  return (
    <div className="space-y-4">
      <AvisoOk>{aviso}</AvisoOk>
      <div className="card p-4">
        <Campo label="Profesional">
          <Select
            value={elegido ?? ""}
            onChange={(e) => onRecurso(e.target.value ? Number(e.target.value) : null)}
            disabled={config.cargando}
          >
            <option value="">Elegí a quién liquidar</option>
            {profesionales.map((r) => (
              <option key={r.recursoId} value={r.recursoId}>
                {r.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      </div>
      <ErrorMsg onReintentar={config.recargar}>{config.error}</ErrorMsg>

      {elegido != null && (
        <>
          {previa.error && YA_LIQUIDADO.test(previa.error) ? (
            // No es una falla: ese período ya se pagó. Se dice como dato.
            <p className="card p-4 text-sm text-texto-2">
              {previa.error} Elegí otro período o mirala en Liquidaciones.
            </p>
          ) : previa.error ? (
            <ErrorMsg onReintentar={previa.recargar}>{previa.error}</ErrorMsg>
          ) : !p ? (
            <Cargando texto="Calculando…" />
          ) : (
            <section className="card space-y-4 p-4" aria-label="Liquidación a cerrar">
              <header>
                <h2 className="text-[15px] font-bold text-texto">
                  {p.recurso.nombre} · {textoPeriodo(p.desde, p.hasta)}
                </h2>
                {p.atrasadas > 0 && (
                  <p className="mt-1 text-[12px] text-texto-3">
                    Incluye {p.atrasadas} {p.atrasadas === 1 ? "venta cobrada" : "ventas cobradas"} tarde de
                    períodos ya liquidados.
                  </p>
                )}
              </header>

              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Renglon etiqueta="Producción" valor={p.produccion} />
                <Renglon etiqueta="Comisión" valor={p.comision} />
                {p.ajustes !== 0 && <Renglon etiqueta="Ventas anuladas ya pagadas" valor={p.ajustes} />}
                <Renglon etiqueta="Adelantos" valor={-p.adelantos} />
                {p.saldoAnterior !== 0 && <Renglon etiqueta="Saldo de la anterior" valor={p.saldoAnterior} />}
                <Renglon etiqueta="A pagar" valor={p.neto} destacado />
              </dl>
              {p.neto < 0 && (
                <p className="rounded-xl bg-warning-bg px-3 py-2 text-[13px] text-warning-text">
                  Le adelantaron más de lo que produjo: el saldo pasa a la próxima liquidación.
                </p>
              )}

              <TablaLineas lineas={[...p.lineas, ...p.lineasAjuste]} />

              {p.adelantosPendientes.length > 0 && (
                <div>
                  <h3 className="mb-1 text-[13px] font-semibold text-texto-2">Adelantos que se descuentan</h3>
                  <ul className="space-y-1 text-[13px]">
                    {p.adelantosPendientes.map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span>
                          {fmtFecha(a.fecha)}
                          {a.nota ? ` · ${a.nota}` : ""}
                        </span>
                        <span className="font-semibold">{fmtMoney(a.monto)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Nota" hint="Opcional: queda en la liquidación.">
                  <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
                </Campo>
                {usaGastos && (
                  <div className="space-y-2">
                    <Casilla
                      checked={gasto}
                      onChange={setGasto}
                      ayuda="Se carga en Gastos operativos (Sueldos). No mueve la caja."
                    >
                      Registrar el pago como gasto
                    </Casilla>
                    {gasto && (
                      <Select
                        aria-label="Cómo se paga"
                        value={metodo}
                        onChange={(e) => setMetodo(e.target.value as Metodo)}
                      >
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                        <option value="QR">QR</option>
                        <option value="TARJETA">Tarjeta</option>
                      </Select>
                    )}
                  </div>
                )}
              </div>

              <ErrorMsg>{error}</ErrorMsg>
              <div className="flex justify-end">
                <Boton icono="check" onClick={() => setConfirmar(true)} disabled={!hayAlgo || cerrando}>
                  Cerrar liquidación
                </Boton>
              </div>
              {!hayAlgo && (
                <p className="text-right text-[12px] text-texto-3">No hay nada para liquidar en este período.</p>
              )}
            </section>
          )}
        </>
      )}

      <Confirmar
        abierto={confirmar}
        titulo="¿Cerrar la liquidación?"
        texto={
          p
            ? `Se paga ${fmtMoney(p.neto)} a ${p.recurso.nombre}. Una liquidación cerrada no se puede editar: lo que cambie después entra en la siguiente.`
            : ""
        }
        etiquetaOk="Cerrar liquidación"
        procesando={cerrando}
        onCancel={() => setConfirmar(false)}
        onOk={cerrar}
      />
    </div>
  );
}

function Renglon({ etiqueta, valor, destacado }: { etiqueta: string; valor: number; destacado?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${destacado ? "bg-primary-50" : "bg-muted"}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{etiqueta}</dt>
      <dd
        className={`mt-1 text-base font-bold ${
          destacado ? (valor < 0 ? "text-danger-text" : "text-primary-700") : "text-texto"
        }`}
      >
        {fmtMoney(valor)}
      </dd>
    </div>
  );
}
