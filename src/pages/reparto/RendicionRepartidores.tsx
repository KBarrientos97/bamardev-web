import { useState } from "react";
import { Boton, Cargando, ErrorMsg, Modal } from "../../components/ui";
import { api } from "../../lib/api";
import { esPositivo } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import {
  aEntregar,
  cobradosPorLaCaja,
  entregasPorRecibir,
  idsTildados,
  marcarTodas,
  pendientesDeOtraCaja,
  sumaTildada,
  textoEntrega,
  textoOtraCaja,
  textoPedidos,
  type EntregaDeRendicion,
  type RendicionReparto,
  type RepartidorDeRendicion,
} from "../../lib/repartoRendicion";
import { useApi } from "../../lib/useApi";
import LoQueLlevo from "./LoQueLlevo";
import { pedirRendicion } from "./pedirRendicion";

/**
 * «Repartidores» (delivery propio, 18-nov): lo que llevó cada repartidor en la
 * jornada y la plata que tiene que entregar. Se abre desde el cierre de caja y
 * se arregla solo: pide la rendición, recibe la plata y vuelve a pedirla.
 *
 * Con «Controlar la plata de los repartidores» prendido (`activa`), cada
 * entrega en efectivo está como plata en poder del repartidor hasta que la
 * cajera la recibe acá: tilda lo que le dio, confirma y esa plata pasa al
 * cajón. Eso cambia el esperado del arqueo, así que al recibir se le avisa al
 * cierre (`onRecibido`) para que lo vuelva a calcular. Apagado, la pantalla
 * sólo informa cuánto cobró cada uno.
 *
 * Los números los calcula el BACKEND: son los mismos que el arqueo resta del
 * esperado. Acá sólo se suma lo tildado.
 */
export default function RendicionRepartidores({
  almacenId,
  inicial,
  onClose,
  onRecibido,
}: {
  /** La sucursal de la caja: quien ve varias ve sólo los repartidores de ésta. */
  almacenId?: number | null;
  /** Lo que el cierre ya trajo para decidir si mostraba el botón: se ve sin esperar. */
  inicial?: RendicionReparto | null;
  onClose: () => void;
  /** Se recibió plata: el esperado del arqueo cambió. Trae la rendición nueva (null si no se pudo volver a pedir). */
  onRecibido: (nueva: RendicionReparto | null) => void;
}) {
  const rendicion = useApi(() => pedirRendicion(almacenId), [almacenId]);
  const d = rendicion.datos ?? inicial ?? null;

  /**
   * Recibe la plata tildada y vuelve a pedir la rendición: los totales son del
   * servidor, no se parchean en memoria. Si el segundo pedido falla, la
   * recepción igual quedó hecha: el cierre se entera y la lista se recarga.
   */
  async function recibir(ids: number[]) {
    await api.recibirRendicionReparto(ids);
    const nueva = await pedirRendicion(almacenId).catch(() => null);
    if (nueva) rendicion.setDatos(nueva);
    else rendicion.recargar();
    onRecibido(nueva);
  }

  return (
    <Modal
      abierto
      titulo="Repartidores"
      subtitulo="Lo que llevó cada uno y la plata que tiene que entregar."
      onClose={onClose}
    >
      {!d ? (
        rendicion.cargando ? (
          <Cargando />
        ) : (
          <ErrorMsg onReintentar={rendicion.recargar}>{rendicion.error || "No se pudo cargar"}</ErrorMsg>
        )
      ) : d.repartidores.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-texto-3">Hoy ningún repartidor llevó pedidos.</p>
      ) : (
        <div className="space-y-3">
          {/* Se ve lo que trajo el cierre, pero sin poder ponerlo al día: que se sepa. */}
          {rendicion.error && <ErrorMsg onReintentar={rendicion.recargar}>{rendicion.error}</ErrorMsg>}
          <ul className="space-y-3">
            {d.repartidores.map((rep) => (
              <TarjetaRepartidor key={rep.repartidorId} rep={rep} activa={d.activa} onRecibir={recibir} />
            ))}
          </ul>
          {!d.activa && (
            <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-3">
              Para registrar cada entrega de plata, prendé «Controlar la plata de los repartidores» en Configuración ›
              Punto de venta.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * Un pedido que se ve pero no se tilda (lo recibe otra caja, o lo cobró la
 * caja): el mismo renglón que la casilla, punteado y con la aclaración debajo.
 */
function FilaSinCasilla({ e, nota, monto }: { e: EntregaDeRendicion; nota: string; monto: number }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-dashed border-borde bg-muted px-3 py-2.5">
      <span className="min-w-0 flex-1 break-words text-[13px] text-texto-2">
        {textoEntrega(e)}
        <span className="block text-[12px] text-texto-4">{nota}</span>
      </span>{" "}
      <span className="shrink-0 text-[13px] font-bold text-texto-3">{fmtMoney(monto)}</span>
    </li>
  );
}

/** Un renglón de plata: la etiqueta (con su aclaración chica debajo) y el monto. */
function FilaPlata({ etiqueta, nota, valor }: { etiqueta: string; nota?: string; valor: number }) {
  return (
    <div className="flex items-start justify-between gap-3 text-texto-2">
      <dt className="min-w-0">
        {etiqueta}
        {nota && <span className="block text-[12px] text-texto-4">{nota}</span>}
      </dt>
      <dd className="shrink-0 font-semibold text-texto">{fmtMoney(valor)}</dd>
    </div>
  );
}

function TarjetaRepartidor({
  rep,
  activa,
  onRecibir,
}: {
  rep: RepartidorDeRendicion;
  activa: boolean;
  onRecibir: (ids: number[]) => Promise<void>;
}) {
  // Lo DESTILDADO (ver `idsTildados`): de entrada van todas tildadas.
  const [destildadas, setDestildadas] = useState<Set<number>>(() => new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [recibiendo, setRecibiendo] = useState(false);
  const [error, setError] = useState("");

  const porRecibir = activa ? entregasPorRecibir(rep) : [];
  // «Le falta entregar» incluye esto; «Recibí Bs X», no.
  const deOtraCaja = activa ? pendientesDeOtraCaja(rep) : [];
  // Lo que cobró la cajera: no es plata del repartidor (prendido o apagado).
  const deLaCaja = cobradosPorLaCaja(rep);
  const tildadas = idsTildados(rep, destildadas);
  const suma = sumaTildada(rep, destildadas);
  const falta = aEntregar(rep, activa);

  function alternar(id: number) {
    setError("");
    setDestildadas((antes) => {
      const copia = new Set(antes);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  async function confirmar() {
    if (recibiendo || tildadas.length === 0) return;
    setError("");
    setRecibiendo(true);
    try {
      await onRecibir(tildadas);
      setConfirmando(false);
      // Lo que queda arranca otra vez todo tildado: un destildado de antes
      // («ésta me la trae después») ya cumplió su función con este recibo.
      setDestildadas(new Set());
    } catch (e) {
      setConfirmando(false);
      setError(e instanceof Error ? e.message : "No se pudo registrar lo recibido");
    } finally {
      setRecibiendo(false);
    }
  }

  return (
    <li className="card space-y-3 p-4" aria-label={rep.nombre}>
      <div>
        <p className="break-words text-[15px] font-bold text-texto">{rep.nombre}</p>
        <p className="text-[13px] text-texto-3">{textoPedidos(rep)}</p>
      </div>

      <LoQueLlevo productos={rep.productos} etiqueta="Llevó" />

      <dl className="space-y-1.5 text-sm">
        <FilaPlata etiqueta="Cobró en efectivo" valor={rep.cobradoEfectivo} />
        {/* Sólo si hubo: un negocio sin QR o sin tarifa de envío no tiene por qué ver ceros. */}
        {esPositivo(rep.cobradoQr) && <FilaPlata etiqueta="Cobró por QR" nota="ya está en la cuenta" valor={rep.cobradoQr} />}
        {esPositivo(rep.envios) && <FilaPlata etiqueta="Envíos" nota="son del repartidor" valor={rep.envios} />}
        {activa && <FilaPlata etiqueta="Ya entregó a la caja" valor={rep.recibido} />}
      </dl>

      {/* El número que importa, destacado: en ámbar mientras falte plata. */}
      <div
        className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 font-bold ${
          esPositivo(falta) ? "bg-warning-bg text-warning-text" : "bg-primary-50 text-primary-700"
        }`}
      >
        <span>{activa ? "Le falta entregar" : "Tiene que entregar"}</span>
        <span className="shrink-0 text-lg font-extrabold">{fmtMoney(falta)}</span>
      </div>

      {(porRecibir.length > 0 || deOtraCaja.length > 0 || deLaCaja.length > 0) && (
        <div className="space-y-2">
          {porRecibir.length > 1 && (
            <p className="text-[13px] text-texto-3">
              <button
                type="button"
                onClick={() => setDestildadas(marcarTodas(rep, destildadas, true))}
                className="font-semibold text-primary-700 hover:text-primary"
              >
                Marcar todas
              </button>
              {" / "}
              <button
                type="button"
                onClick={() => setDestildadas(marcarTodas(rep, destildadas, false))}
                className="font-semibold text-primary-700 hover:text-primary"
              >
                ninguna
              </button>
            </p>
          )}
          <ul className="space-y-1.5">
            {porRecibir.map((e) => (
              <li key={e.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-borde px-3 py-2.5 hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={!destildadas.has(e.id)}
                    onChange={() => alternar(e.id)}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-borde accent-primary"
                  />
                  <span className="min-w-0 flex-1 break-words text-[13px] text-texto-2">{textoEntrega(e)}</span>{" "}
                  <span className="shrink-0 text-[13px] font-bold text-texto">{fmtMoney(e.efectivo)}</span>
                </label>
              </li>
            ))}
            {/* La plata que cuenta el arqueo de otra caja: se ve, pero la recibe esa caja. */}
            {deOtraCaja.map((e) => (
              <FilaSinCasilla key={`o${e.ventaId}`} e={e} nota={textoOtraCaja(e)} monto={e.efectivo} />
            ))}
            {/* Lo que cobró la cajera con «Cobrar y entregar»: ya está en la caja. */}
            {deLaCaja.map((e) => (
              <FilaSinCasilla key={`c${e.ventaId}`} e={e} nota="Cobró la caja" monto={e.total} />
            ))}
          </ul>
          {/* Sólo lo que esta caja puede recibir: si todo es de otra caja, no hay botón. */}
          {porRecibir.length > 0 && (
            <Boton className="w-full" onClick={() => setConfirmando(true)} disabled={recibiendo || tildadas.length === 0}>
              {tildadas.length === 0 ? "Elegí qué recibiste" : `Recibí ${fmtMoney(suma)}`}
            </Boton>
          )}
        </div>
      )}

      <ErrorMsg>{error}</ErrorMsg>

      {confirmando && (
        <Modal
          abierto
          titulo={`¿Recibiste ${fmtMoney(suma)} de ${rep.nombre}?`}
          onClose={() => !recibiendo && setConfirmando(false)}
          ancho="max-w-sm"
          acciones={
            <>
              <Boton variante="ghost" onClick={() => setConfirmando(false)} disabled={recibiendo}>
                Volver
              </Boton>
              <Boton onClick={confirmar} disabled={recibiendo}>
                {recibiendo ? "Un momento…" : "Recibí"}
              </Boton>
            </>
          }
        >
          <p className="text-sm text-texto-2">
            {tildadas.length === 1 ? "La entrega queda como recibida" : `Las ${tildadas.length} entregas quedan como recibidas`}:
            esa plata pasa al cajón y deja de figurar en poder del repartidor.
          </p>
        </Modal>
      )}
    </li>
  );
}
