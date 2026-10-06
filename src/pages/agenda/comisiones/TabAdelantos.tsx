import { useState } from "react";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../../../components/ui";
import { apiComisiones } from "../../../lib/agenda/apiComisiones";
import { fechaNegocio } from "../../../lib/agenda/horaAgenda";
import type { Adelanto } from "../../../lib/agenda/tiposComisiones";
import { parsearMonto } from "../../../lib/dinero";
import { fmtFecha, fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { mensajeDe, useNombreProfesional } from "../config/utilConfig";

/**
 * Adelantos: la plata que el profesional recibe a cuenta antes de cobrar su
 * liquidación ("adelantame 100 para el pasaje"). Se descuentan solos en la
 * próxima liquidación. Uno cargado por error se anula mientras no se haya
 * descontado. No mueve la caja: si salió del cajón, se registra el egreso.
 */
export default function TabAdelantos({ puedeRegistrar }: { puedeRegistrar: boolean }) {
  const [soloPendientes, setSoloPendientes] = useState(true);
  const lista = useApi(() => apiComisiones.adelantos({ pendientes: soloPendientes }), [soloPendientes]);
  const [nuevo, setNuevo] = useState(false);
  const [anular, setAnular] = useState<Adelanto | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso();

  const confirmarAnular = async () => {
    if (!anular) return;
    setAnulando(true);
    setError("");
    try {
      await apiComisiones.anularAdelanto(anular.id);
      setAviso(`Adelanto de ${fmtMoney(anular.monto)} a ${anular.recurso} anulado.`);
      lista.recargar();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo anular"));
    } finally {
      setAnulando(false);
      setAnular(null);
    }
  };

  const filas = lista.datos ?? [];
  return (
    <div className="space-y-3">
      <AvisoOk>{aviso}</AvisoOk>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-texto-2">
          <input
            type="checkbox"
            className="h-5 w-5 accent-primary"
            checked={soloPendientes}
            onChange={(e) => setSoloPendientes(e.target.checked)}
          />
          Sólo los que falta descontar
        </label>
        {puedeRegistrar && (
          <Boton icono="plus" onClick={() => setNuevo(true)}>
            Nuevo adelanto
          </Boton>
        )}
      </div>
      <ErrorMsg>{error}</ErrorMsg>
      {lista.error ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : !lista.datos ? (
        <Cargando />
      ) : filas.length === 0 ? (
        <div className="card">
          <Vacio icono="dollar" titulo="Sin adelantos" texto="Los adelantos se descuentan en la próxima liquidación." />
        </div>
      ) : (
        <ul className="card divide-y divide-borde-soft" aria-label="Adelantos">
          {filas.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-texto">
                  {a.recurso} · {fmtMoney(a.monto)}
                </p>
                <p className="text-[12px] text-texto-3">
                  {fmtFecha(a.fecha)}
                  {a.nota ? ` · ${a.nota}` : ""}
                  {a.registradoPor ? ` · cargó ${a.registradoPor}` : ""}
                </p>
              </div>
              {a.anulado ? (
                <Badge>Anulado</Badge>
              ) : a.liquidacionId ? (
                <Badge tono="verde">Descontado</Badge>
              ) : (
                <>
                  <Badge tono="amarillo">Pendiente</Badge>
                  {puedeRegistrar && (
                    <Boton variante="ghost" onClick={() => setAnular(a)} aria-label={`Anular adelanto de ${a.recurso}`}>
                      Anular
                    </Boton>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {nuevo && (
        <NuevoAdelanto
          onClose={() => setNuevo(false)}
          onCreado={(a) => {
            setNuevo(false);
            setAviso(`Adelanto de ${fmtMoney(a.monto)} a ${a.recurso} registrado.`);
            lista.recargar();
          }}
        />
      )}
      <Confirmar
        abierto={!!anular}
        titulo="¿Anular el adelanto?"
        texto={anular ? `${anular.recurso}, ${fmtMoney(anular.monto)} del ${fmtFecha(anular.fecha)}. Queda en la bitácora.` : ""}
        etiquetaOk="Anular"
        peligroso
        procesando={anulando}
        onCancel={() => setAnular(null)}
        onOk={confirmarAnular}
      />
    </div>
  );
}

function NuevoAdelanto({ onClose, onCreado }: { onClose: () => void; onCreado: (a: Adelanto) => void }) {
  const config = useApi(() => apiComisiones.config(), []);
  const nombres = useNombreProfesional();
  const [recursoId, setRecursoId] = useState("");
  const [fecha, setFecha] = useState(fechaNegocio());
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const m = parsearMonto(monto);
    if (!recursoId) return setError("Elegí a quién.");
    if (m == null || m <= 0) return setError("El monto tiene que ser mayor que cero.");
    setGuardando(true);
    setError("");
    try {
      onCreado(
        await apiComisiones.crearAdelanto({
          recursoId: Number(recursoId),
          fecha,
          monto: m,
          nota: nota.trim() || null,
        }),
      );
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo="Nuevo adelanto"
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Registrar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label={nombres.singular}>
          <Select value={recursoId} onChange={(e) => setRecursoId(e.target.value)} disabled={config.cargando}>
            <option value="">Elegí a quién</option>
            {(config.datos ?? [])
              .filter((r) => r.activo)
              .map((r) => (
                <option key={r.recursoId} value={r.recursoId}>
                  {r.nombre}
                </option>
              ))}
          </Select>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
          </Campo>
          <Campo label="Monto (Bs)">
            <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="100" />
          </Campo>
        </div>
        <Campo label="Nota" hint="Opcional.">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} />
        </Campo>
        <p className="text-[12px] text-texto-3">
          Si sale del cajón, registrá también el egreso en la caja: el adelanto no la mueve.
        </p>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
