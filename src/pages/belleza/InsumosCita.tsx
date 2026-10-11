import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, ErrorMsg, Input, Select } from "../../components/ui";
import { apiExtras, type ConsumoCita, type ConsumosDeCita } from "../../lib/belleza/apiExtras";
import { fmtCantidad } from "../../lib/belleza/formato";
import { parsearMonto } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "No se pudo guardar");

/**
 * Los insumos que gastó una cita (feature `consumo_servicio`). Se descuentan
 * solos al cobrarla, con la receta de cada servicio; acá se corrige con lo que
 * de verdad se usó (el stock se mueve por la diferencia) o se suma uno que no
 * estaba en la receta.
 */
export default function InsumosCita({
  citaId,
  titulo,
}: {
  citaId: number;
  titulo: (accion?: React.ReactNode) => React.ReactNode;
}) {
  const datos = useApi<ConsumosDeCita>(() => apiExtras.consumosDeCita(citaId), [citaId]);
  const [agregando, setAgregando] = useState(false);
  const d = datos.datos;
  const ventaId = d?.ventas[0]?.id ?? null;
  // Sin `costos.ver` el backend no manda el costo: no se muestra (S2SEG-04).
  const conCosto = (d?.consumos ?? []).every((c) => c.costo != null);
  const costo = (d?.consumos ?? []).reduce((s, c) => s + (c.costo ?? 0), 0);

  return (
    <section className="space-y-2" aria-label="Insumos usados">
      {titulo(
        ventaId != null ? (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-semibold text-primary-700 hover:bg-primary-50"
          >
            <Icon name="plus" size={15} /> Insumo
          </button>
        ) : undefined,
      )}
      <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      {!d ? (
        datos.cargando && <p className="text-[13px] text-texto-3">Cargando…</p>
      ) : ventaId == null ? (
        <p className="text-[13px] text-texto-3">Los insumos de la receta se descuentan al cobrar la cita.</p>
      ) : d.consumos.length === 0 && !agregando ? (
        <p className="text-[13px] text-texto-3">Sus servicios no tienen receta de insumos.</p>
      ) : (
        <>
          <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
            {d.consumos.map((c) => (
              <FilaConsumo key={c.id} consumo={c} onGuardado={datos.recargar} />
            ))}
          </ul>
          {d.consumos.length > 0 && conCosto && (
            <p className="text-right text-[12px] text-texto-3">
              Costo de insumos <strong className="text-texto">{fmtMoney(costo)}</strong>
            </p>
          )}
        </>
      )}
      {agregando && ventaId != null && (
        <AgregarInsumo
          ventaId={ventaId}
          onListo={() => {
            setAgregando(false);
            datos.recargar();
          }}
          onCancelar={() => setAgregando(false)}
        />
      )}
    </section>
  );
}

function FilaConsumo({ consumo, onGuardado }: { consumo: ConsumoCita; onGuardado: () => void }) {
  const [valor, setValor] = useState(String(consumo.cantidad));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const numero = parsearMonto(valor);
  const cambio = numero != null && Math.abs(numero - consumo.cantidad) > 0.0005;

  const guardar = async () => {
    if (numero == null || numero < 0) return setError("Poné cuánto se usó.");
    setError("");
    setGuardando(true);
    try {
      await apiExtras.ajustarConsumo(consumo.id, numero);
      onGuardado();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <li className="space-y-1 p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-texto">{consumo.insumo}</p>
          <p className="text-[12px] text-texto-3">
            {consumo.servicio}
            {consumo.cantidadReceta > 0
              ? ` · receta ${fmtCantidad(consumo.cantidadReceta)} ${consumo.unidad ?? ""}`
              : " · fuera de receta"}
          </p>
        </div>
        <div className="w-20">
          <Input
            aria-label={`Usado de ${consumo.insumo}`}
            type="number"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>
        <span className="w-7 text-[12px] text-texto-3">{consumo.unidad ?? ""}</span>
        {cambio && (
          <Boton variante="soft" onClick={guardar} disabled={guardando} className="px-3 py-2 text-[13px]">
            {guardando ? "…" : "Guardar"}
          </Boton>
        )}
      </div>
      <ErrorMsg>{error}</ErrorMsg>
    </li>
  );
}

function AgregarInsumo({
  ventaId,
  onListo,
  onCancelar,
}: {
  ventaId: number;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const insumos = useApi(() => apiExtras.insumos(), []);
  const [insumoId, setInsumoId] = useState<number | "">("");
  const [cantidad, setCantidad] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const elegido = (insumos.datos ?? []).find((i) => i.id === insumoId);

  const guardar = async () => {
    const n = parsearMonto(cantidad);
    if (!insumoId) return setError("Elegí el insumo.");
    if (n == null || !(n > 0)) return setError("Poné cuánto se usó.");
    setError("");
    setGuardando(true);
    try {
      await apiExtras.agregarConsumo(ventaId, { insumoId, cantidad: n });
      onListo();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-borde p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Select aria-label="Insumo a sumar" value={insumoId} onChange={(e) => setInsumoId(Number(e.target.value) || "")}>
            <option value="">Elegí un insumo…</option>
            {(insumos.datos ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-20">
          <Input aria-label="Cantidad usada" type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0" />
        </div>
        <span className="w-7 text-[12px] text-texto-3">{elegido?.unidad ?? ""}</span>
      </div>
      <ErrorMsg>{error}</ErrorMsg>
      <div className="flex justify-end gap-2">
        <Boton variante="ghost" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Sumar"}
        </Boton>
      </div>
    </div>
  );
}
