import { useState } from "react";
import { Icon } from "../../components/Icon";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Input,
  Modal,
  Select,
} from "../../components/ui";
import { api } from "../../lib/api";
import { fmtHora, fmtMoney } from "../../lib/format";
import { puedeSupervisar } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { Caja } from "../../types";

export default function PantallaCierre({
  caja,
  onAtras,
  onCerrada,
}: {
  caja: Caja;
  onAtras: () => void;
  onCerrada: () => void;
}) {
  const { usuario } = useAuth();
  const resumen = useApi(() => api.resumenCaja(caja.id), [caja.id]);
  const [contado, setContado] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [movimientoAbierto, setMovimientoAbierto] = useState(false);

  const r = resumen.datos;
  const esperado = r?.saldoEsperado ?? 0;
  const contadoNum = Number(contado) || 0;
  // La diferencia sólo tiene sentido una vez que se contó: mostrarla en 0
  // antes de teclear haría parecer que la caja ya cuadra.
  const conteoHecho = contado !== "";
  const diferencia = Math.round((contadoNum - esperado) * 100) / 100;

  async function cerrar() {
    setError("");
    if (!conteoHecho) return setError("Contá el efectivo que hay en la caja.");
    setEnviando(true);
    try {
      await api.cerrarCaja(caja.id, {
        montoCierre: contadoNum,
        ...(nota.trim() ? { notaCierre: nota.trim() } : {}),
      });
      onCerrada();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar la caja");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col">
      <div className="flex items-center gap-2 border-b border-borde bg-white px-4 py-3">
        <button
          onClick={onAtras}
          aria-label="Volver"
          className="rounded-lg p-1.5 text-texto-2 hover:bg-muted"
        >
          <Icon name="arrowLeft" size={20} />
        </button>
        <div>
          <h1 className="text-[15px] font-bold text-texto">Cierre de caja</h1>
          <p className="text-xs text-texto-3">
            Abierta desde {fmtHora(caja.fechaApertura)}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {resumen.cargando ? (
          <Cargando texto="Calculando el arqueo…" />
        ) : !r ? (
          <ErrorMsg>{resumen.error}</ErrorMsg>
        ) : (
          <>
            <section className="card p-4">
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-texto-4">
                Movimiento del turno
              </h2>
              <dl className="space-y-1.5 text-sm">
                <Fila etiqueta="Fondo de apertura" valor={r.montoApertura} />
                <Fila
                  etiqueta={`Ventas (${r.cantidadVentas})`}
                  valor={r.totalVentas}
                />
                {r.porFormaPago.map((f) => (
                  <Fila key={f.nombre} etiqueta={f.nombre} valor={f.monto} sangria />
                ))}
                {r.cambioEntregado > 0 && (
                  <Fila etiqueta="Cambio entregado" valor={-r.cambioEntregado} />
                )}
                {r.ingresos > 0 && <Fila etiqueta="Ingresos de efectivo" valor={r.ingresos} />}
                {r.egresos > 0 && <Fila etiqueta="Egresos de efectivo" valor={-r.egresos} />}
                {r.abonosEfectivo > 0 && (
                  <Fila etiqueta="Abonos de créditos" valor={r.abonosEfectivo} />
                )}
                {r.creditoOtorgado > 0 && (
                  <Fila
                    etiqueta="Fiado otorgado (no es efectivo)"
                    valor={r.creditoOtorgado}
                    apagado
                  />
                )}
                {r.anuladas > 0 && (
                  <div className="flex justify-between pt-1 text-texto-3">
                    <dt>Ventas anuladas</dt>
                    <dd>{r.anuladas}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-3 flex items-center justify-between border-t border-borde pt-3">
                <span className="text-[13px] font-bold text-texto">
                  Efectivo esperado en caja
                </span>
                <span className="text-lg font-extrabold text-texto">
                  {fmtMoney(esperado)}
                </span>
              </div>
            </section>

            {/* Registrar entradas y salidas de efectivo es cosa de encargados:
                el backend lo exige con RolesGuard, así que no se ofrece al
                cajero un botón que le va a dar 403. */}
            {puedeSupervisar(usuario?.rol ?? "CAJERO") && (
              <Boton
                variante="ghost"
                icono="swap"
                onClick={() => setMovimientoAbierto(true)}
                className="w-full"
              >
                Registrar movimiento de efectivo
              </Boton>
            )}

            <section className="card p-4">
              <Campo
                label="Efectivo contado"
                hint="Contá los billetes y monedas que hay en la caja"
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={contado}
                  onChange={(e) => setContado(e.target.value)}
                  placeholder="0,00"
                  className="text-lg font-bold"
                />
              </Campo>

              {conteoHecho && (
                <div
                  className={`mt-3 rounded-xl px-4 py-3 text-center ${
                    diferencia === 0
                      ? "bg-primary-50 text-primary-700"
                      : diferencia > 0
                        ? "bg-info-bg text-info-text"
                        : "bg-danger-bg text-danger-text"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    {diferencia === 0
                      ? "La caja cuadra"
                      : diferencia > 0
                        ? "Sobrante"
                        : "Faltante"}
                  </p>
                  <p className="text-2xl font-extrabold">
                    {fmtMoney(Math.abs(diferencia))}
                  </p>
                </div>
              )}

              <div className="mt-3">
                <Campo label="Nota del cierre (opcional)">
                  <Input
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Ej. faltó cambio de Bs 2"
                  />
                </Campo>
              </div>

              <ErrorMsg>{error}</ErrorMsg>
            </section>
          </>
        )}
      </div>

      <div className="border-t border-borde bg-white p-4">
        <Boton
          onClick={cerrar}
          disabled={enviando || resumen.cargando}
          className="w-full py-3 text-base"
        >
          {enviando ? "Cerrando…" : "Cerrar caja"}
        </Boton>
      </div>

      {movimientoAbierto && (
        <DialogoMovimiento
          cajaId={caja.id}
          onClose={() => setMovimientoAbierto(false)}
          onGuardado={() => {
            setMovimientoAbierto(false);
            // El movimiento cambia el efectivo esperado: hay que recalcular.
            resumen.recargar();
          }}
        />
      )}
    </div>
  );
}

function Fila({
  etiqueta,
  valor,
  sangria,
  apagado,
}: {
  etiqueta: string;
  valor: number;
  sangria?: boolean;
  apagado?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${sangria ? "pl-3" : ""} ${
        apagado ? "text-texto-4" : "text-texto-2"
      }`}
    >
      <dt className={sangria ? "text-[13px]" : ""}>{etiqueta}</dt>
      <dd className={sangria ? "text-[13px]" : ""}>{fmtMoney(valor)}</dd>
    </div>
  );
}

function DialogoMovimiento({
  cajaId,
  onClose,
  onGuardado,
}: {
  cajaId: number;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">("EGRESO");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function guardar() {
    setError("");
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) return setError("Poné un monto mayor a cero.");
    if (!descripcion.trim()) return setError("Contá para qué fue el movimiento.");

    setEnviando(true);
    try {
      await api.crearMovimientoCaja(cajaId, {
        tipo,
        monto: m,
        descripcion: descripcion.trim(),
      });
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Movimiento de efectivo"
      subtitulo="Entradas y salidas que no son ventas"
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={enviando}>
            {enviando ? "Guardando…" : "Registrar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="Tipo">
          <Select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "INGRESO" | "EGRESO")}
          >
            <option value="EGRESO">Egreso — sale plata de la caja</option>
            <option value="INGRESO">Ingreso — entra plata a la caja</option>
          </Select>
        </Campo>

        <Campo label="Monto">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            autoFocus
            className="font-bold"
          />
        </Campo>

        <Campo label="Descripción">
          <Input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder={tipo === "EGRESO" ? "Ej. compra de hielo" : "Ej. vuelto del dueño"}
          />
        </Campo>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

/** Comprobante del arqueo, con lo que se contó y la diferencia. */
export function CierreOk({ caja, onSalir }: { caja: Caja; onSalir: () => void }) {
  const diferencia = caja.montoDiferencia ?? 0;
  return (
    <div className="flex min-h-full items-center justify-center p-5">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <Icon name="check" size={32} strokeWidth={2.5} />
        </span>
        <h1 className="mt-4 text-xl font-bold text-texto">Caja cerrada</h1>
        <p className="mt-1 text-[13px] text-texto-3">
          Turno de {fmtHora(caja.fechaApertura)} a {fmtHora(caja.fechaCierre)}
        </p>

        <dl className="card mt-5 space-y-2 p-4 text-left text-sm">
          <div className="flex justify-between text-texto-2">
            <dt>Fondo de apertura</dt>
            <dd>{fmtMoney(caja.montoApertura)}</dd>
          </div>
          <div className="flex justify-between font-bold text-texto">
            <dt>Efectivo contado</dt>
            <dd>{fmtMoney(caja.montoCierre ?? 0)}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-borde pt-2">
            <dt className="text-texto-2">Diferencia</dt>
            <dd>
              <Badge tono={diferencia === 0 ? "verde" : diferencia > 0 ? "azul" : "rojo"}>
                {diferencia === 0
                  ? "Cuadra"
                  : `${diferencia > 0 ? "Sobrante" : "Faltante"} ${fmtMoney(Math.abs(diferencia))}`}
              </Badge>
            </dd>
          </div>
          {caja.notaCierre && (
            <p className="border-t border-borde pt-2 text-[13px] italic text-texto-3">
              {caja.notaCierre}
            </p>
          )}
        </dl>

        <Boton onClick={onSalir} className="mt-5 w-full">
          Volver
        </Boton>
      </div>
    </div>
  );
}
