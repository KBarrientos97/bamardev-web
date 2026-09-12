import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Cargando, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFechaHora, fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { EntregaMesero } from "../../types/salon";

/**
 * El efectivo que los meseros cobraron y todavía no está en el cajón.
 *
 * **Una sola pantalla para los dos lados**, igual que el endpoint: la cajera ve
 * todo lo que le tienen que entregar y tilda lo que recibe; el mesero ve lo
 * suyo, lo que le falta y lo que ya le aprobaron. Dos pantallas serían dos
 * lugares donde el total puede discrepar, y este circuito existe precisamente
 * para que la plata que falta se pueda nombrar.
 *
 * Lo que cambia por rol es sólo el pie: aprobar es del cajero, y el backend lo
 * frena igual. Acá el botón directamente no se dibuja, porque ofrecer algo que
 * siempre va a fallar es peor que no ofrecerlo.
 *
 * Es el espejo de `EntregasFragment` de Android. Los dos números de arriba
 * —pendiente y aprobado— los calcula el BACKEND: son los mismos que el arqueo
 * le resta al esperado, y recalcularlos acá sería abrir la puerta a que el
 * cierre de caja y esta pantalla no coincidan.
 */
export default function Entregas({ onVolver }: { onVolver?: () => void }) {
  const { usuario } = useAuth();
  const entregas = useApi(() => api.entregasMesero(), []);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [aprobando, setAprobando] = useState(false);
  const [error, setError] = useState("");

  /** true si quien mira es el que RECIBE la plata, no el que la tiene. */
  const puedeAprobar = usuario?.rol !== "MESERO";

  const datos = entregas.datos;
  const items = datos?.items ?? [];
  const pendientes = items.filter((e) => e.estado === "PENDIENTE");

  function alternar(id: number) {
    setMarcadas((antes) => {
      const copia = new Set(antes);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  function marcarTodas() {
    // Si ya están todas, el botón desmarca: es el mismo gesto para las dos
    // cosas y evita tener dos botones que se usan una vez cada uno.
    setMarcadas(
      marcadas.size === pendientes.length
        ? new Set()
        : new Set(pendientes.map((e) => e.id)),
    );
  }

  async function aprobar() {
    if (aprobando || marcadas.size === 0) return;
    setError("");
    setAprobando(true);
    try {
      await api.aprobarEntregas([...marcadas]);
      setMarcadas(new Set());
      // Se recarga en vez de parchear la lista en memoria: los totales los
      // calcula el backend y son los mismos que usa el arqueo.
      await entregas.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo confirmar la entrega");
    } finally {
      setAprobando(false);
    }
  }

  if (entregas.cargando && !datos)
    return (
      <div className="p-4">
        <Cargando />
      </div>
    );

  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        {onVolver && (
          <button
            type="button"
            onClick={onVolver}
            aria-label="Volver"
            className="rounded-lg p-1.5 text-texto-3 hover:bg-muted hover:text-texto"
          >
            <Icon name="chevronLeft" size={20} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-texto">Entregas de efectivo</h1>
          <p className="text-[13px] text-texto-3">
            {puedeAprobar
              ? "Lo que los meseros cobraron y todavía no entraste al cajón."
              : "Lo que cobraste y todavía no entregaste a la caja."}
          </p>
        </div>
      </div>

      {/* Los dos números que importan. El pendiente es el que el arqueo resta
          del esperado: mientras no sea 0, el cajón tiene menos de lo vendido y
          eso NO es un faltante. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3.5">
          <p className="text-[13px] text-texto-3">Sin entregar</p>
          <p className="mt-0.5 text-xl font-extrabold tracking-tight text-danger-text">
            {fmtMoney(datos?.pendiente ?? 0)}
          </p>
        </div>
        <div className="card p-3.5">
          <p className="text-[13px] text-texto-3">Ya en caja</p>
          <p className="mt-0.5 text-xl font-extrabold tracking-tight text-texto">
            {fmtMoney(datos?.aprobado ?? 0)}
          </p>
        </div>
      </div>

      <ErrorMsg>{error || entregas.error}</ErrorMsg>

      {items.length === 0 ? (
        <div className="card flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <Icon name="check" size={28} />
          <p className="text-[13px] text-texto-3">
            {puedeAprobar
              ? "No hay efectivo esperando: todo lo cobrado ya está en el cajón."
              : "No tenés efectivo pendiente de entregar."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((e) => (
            <Fila
              key={e.id}
              entrega={e}
              puedeAprobar={puedeAprobar}
              marcada={marcadas.has(e.id)}
              onAlternar={() => alternar(e.id)}
            />
          ))}
        </ul>
      )}

      {/* El pie es lo único que cambia por rol. Sólo aparece si hay algo que
          aprobar: con la lista al día el botón no tiene nada que hacer. */}
      {puedeAprobar && pendientes.length > 0 && (
        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-borde bg-white/95 pt-3 pb-1 backdrop-blur">
          <button
            type="button"
            onClick={marcarTodas}
            className="self-start text-[13px] font-semibold text-primary-700 hover:text-primary"
          >
            {marcadas.size === pendientes.length
              ? "Desmarcar todas"
              : `Marcar las ${pendientes.length} pendientes`}
          </button>
          <Boton
            onClick={aprobar}
            disabled={aprobando || marcadas.size === 0}
            className="w-full"
          >
            {aprobando
              ? "Confirmando…"
              : marcadas.size === 0
                ? "Elegí qué recibiste"
                : `Recibí ${fmtMoney(
                    pendientes
                      .filter((e) => marcadas.has(e.id))
                      .reduce((acc, e) => acc + e.monto, 0),
                  )}`}
          </Boton>
        </div>
      )}
    </div>
  );
}

/**
 * Una entrega.
 *
 * La marca sólo existe para el cajero y sólo sobre lo PENDIENTE: una entrega
 * aprobada ya movió la plata y volver a tocarla no significa nada.
 */
function Fila({
  entrega,
  puedeAprobar,
  marcada,
  onAlternar,
}: {
  entrega: EntregaMesero;
  puedeAprobar: boolean;
  marcada: boolean;
  onAlternar: () => void;
}) {
  const pendiente = entrega.estado === "PENDIENTE";
  const seleccionable = puedeAprobar && pendiente;

  const contenido = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-bold text-texto">
            {entrega.mesaCodigo || "Mesa"}
          </span>
          {entrega.comprobante && (
            <span className="text-[12px] text-texto-3">
              {entrega.comprobante}
            </span>
          )}
        </div>
        {/* El nombre del mesero sólo le sirve a quien recibe: el mesero ya sabe
            que la plata es suya. */}
        {puedeAprobar && (
          <p className="text-[13px] text-texto-2">{entrega.meseroNombre}</p>
        )}
        <p className="mt-0.5 text-[12px] text-texto-3">
          {pendiente
            ? fmtFechaHora(entrega.creadaEn)
            : `Recibido por ${entrega.aprobadaPorNombre ?? "caja"} · ${fmtFechaHora(
                entrega.aprobadaEn ?? entrega.creadaEn,
              )}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <span
          className={
            "font-extrabold tracking-tight " +
            (pendiente ? "text-danger-text" : "text-texto-3")
          }
        >
          {fmtMoney(entrega.monto)}
        </span>
        {seleccionable ? (
          <span
            aria-hidden
            className={
              "flex h-5 w-5 items-center justify-center rounded-md border " +
              (marcada
                ? "border-primary bg-primary text-white"
                : "border-borde bg-white")
            }
          >
            {marcada && <Icon name="check" size={13} strokeWidth={3} />}
          </span>
        ) : (
          !pendiente && <Icon name="check" size={16} />
        )}
      </div>
    </>
  );

  if (!seleccionable) {
    return (
      <li className="card flex items-center gap-3 p-3.5">{contenido}</li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={onAlternar}
        aria-pressed={marcada}
        className={
          "card flex w-full items-center gap-3 p-3.5 text-left transition " +
          (marcada ? "ring-1 ring-primary" : "hover:border-primary-200")
        }
      >
        {contenido}
      </button>
    </li>
  );
}
