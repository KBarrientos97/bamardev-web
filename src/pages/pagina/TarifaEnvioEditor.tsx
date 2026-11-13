import { useEffect, useState } from "react";
import { AvisoOk, Boton, Cargando, ErrorMsg, Input } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { apiPedidosWeb } from "../../lib/pedidosWeb/apiPrivada";
import { calcularEnvio, TARIFA_POR_DEFECTO } from "../../lib/pedidosWeb/tarifa";
import { filasDe, tarifaDeFilas, type Fila } from "../../lib/pedidosWeb/tarifaEditor";

/**
 * La tarifa de envío de los pedidos web (13-nov): cuánto se cobra de delivery
 * según la distancia. El sistema la sugiere y la cajera la confirma o la
 * corrige al aceptar el pedido. Se guarda al toque (no pasa por el borrador de
 * la página: no es parte de lo que se publica).
 *
 * Cada fila es un tramo: el primero es un precio fijo hasta cierto km y los
 * demás cobran por km lo que cae en su tramo. Abajo, ejemplos con lo que
 * quedaría, para ver el efecto sin hacer la cuenta.
 */

export default function TarifaEnvioEditor() {
  const [filas, setFilas] = useState<Fila[]>(filasDe(TARIFA_POR_DEFECTO));
  const [maxKm, setMaxKm] = useState(String(TARIFA_POR_DEFECTO.maxKm));
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    let vivo = true;
    apiPedidosWeb
      .tarifa()
      .then((t) => {
        if (!vivo) return;
        setFilas(filasDe(t));
        setMaxKm(String(t.maxKm));
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar la tarifa"))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, []);

  const lectura = tarifaDeFilas(filas, maxKm);
  const cambiar = (i: number, c: Partial<Fila>) => {
    setGuardado(false);
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...c } : f)));
  };

  async function guardar() {
    if ("error" in lectura) return;
    setError("");
    setGuardando(true);
    try {
      const t = await apiPedidosWeb.guardarTarifa(lectura.tarifa);
      setFilas(filasDe(t));
      setMaxKm(String(t.maxKm));
      setGuardado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la tarifa");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <Cargando texto="Cargando la tarifa…" />;
  const ejemplos = "tarifa" in lectura ? [1, 3, 5, 8].map((km) => [km, calcularEnvio(km, lectura.tarifa)] as const) : [];

  return (
    <div className="space-y-3 border-t border-borde pt-4" aria-label="Tarifa de envío">
      <div>
        <strong className="block text-sm text-texto">Tarifa de envío</strong>
        <span className="text-[13px] text-texto-3">
          Lo que se cobra de delivery según la distancia a la casa del cliente. El sistema la sugiere y quien acepta el pedido puede cambiarla.
        </span>
      </div>
      <ul className="space-y-2">
        {filas.map((f, i) => {
          const primero = i === 0;
          const ultimo = i === filas.length - 1;
          return (
            <li key={i} className="flex flex-wrap items-center gap-2 text-sm text-texto-2">
              <span className="w-24 shrink-0">{primero ? "Hasta" : ultimo ? "Más de" : `De ${filas[i - 1].hasta || "…"} a`}</span>
              {ultimo ? (
                <span className="w-20 text-center text-texto-3">{filas[i - 1].hasta || "…"}</span>
              ) : (
                <Input aria-label={`Hasta cuántos km, tramo ${i + 1}`} inputMode="decimal" className="!w-20" value={f.hasta} onChange={(e) => cambiar(i, { hasta: e.target.value.replace(/[^\d.,]/g, "") })} />
              )}
              <span>km:</span>
              <Input aria-label={primero ? "Precio fijo del primer tramo" : `Precio por km, tramo ${i + 1}`} inputMode="decimal" className="!w-24" value={f.valor} onChange={(e) => cambiar(i, { valor: e.target.value.replace(/[^\d.,]/g, "") })} />
              <span>{primero ? "Bs en total" : "Bs por km"}</span>
              {!primero && !ultimo && filas.length > 2 && (
                <button type="button" aria-label={`Quitar el tramo ${i + 1}`} onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))} className="text-texto-3 hover:text-danger-text">
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => {
          setGuardado(false);
          setFilas((fs) => [...fs.slice(0, -1), { hasta: "", valor: fs[fs.length - 2]?.valor ?? "1" }, fs[fs.length - 1]]);
        }}
        className="rounded-lg border border-borde px-3 py-1.5 text-sm font-semibold"
      >
        Agregar un tramo
      </button>
      <label className="flex flex-wrap items-center gap-2 text-sm text-texto-2">
        <span>No entregar a más de</span>
        <Input aria-label="Distancia máxima en km" inputMode="decimal" className="!w-20" value={maxKm} onChange={(e) => { setGuardado(false); setMaxKm(e.target.value.replace(/[^\d.,]/g, "")); }} />
        <span>km</span>
      </label>
      {ejemplos.length > 0 && (
        <p className="text-[13px] text-texto-3">
          Así quedaría: {ejemplos.map(([km, bs]) => `${km} km = ${fmtMoney(bs)}`).join(" · ")}. El resultado se redondea hacia arriba al boliviano.
        </p>
      )}
      {"error" in lectura && <p className="text-[13px] text-danger-text">{lectura.error}</p>}
      <ErrorMsg>{error}</ErrorMsg>
      {guardado && <AvisoOk>Tarifa guardada.</AvisoOk>}
      <Boton type="button" onClick={guardar} disabled={"error" in lectura || guardando}>
        {guardando ? "Guardando…" : "Guardar tarifa"}
      </Boton>
    </div>
  );
}
