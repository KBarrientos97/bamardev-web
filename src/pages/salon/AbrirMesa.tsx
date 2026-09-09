import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import type { Mesa } from "../../types/salon";
import { ElegirMesa, Reserva } from "./AccionesMesa";
import { estaUnida, etiquetaMesa } from "./logicaSalon";

/** Dos personas es el grupo más común en un resto bar. */
const INICIAL = 2;
/** Tope defensivo: más que esto es un dedo trabado en el "+". */
const MAXIMO = 30;

/**
 * Sentar gente en una mesa libre.
 *
 * Son dos datos: cuántos son y (opcional) a nombre de quién. La maqueta los
 * presentaba como "Paso 1" y "Paso 2"; acá van sin numerar, porque numerar dos
 * campos hace parecer un trámite lo que son diez segundos con el cliente
 * parado al lado esperando que lo sienten.
 *
 * El botón principal dice "Abrir y tomar pedido" y no sólo "Abrir": nadie
 * sienta a alguien para no tomarle el pedido, así que el camino de siempre
 * tiene que ser un solo toque.
 */
export default function AbrirMesa({
  mesa,
  mesasDelSalon,
  onAtras,
  onAbierta,
  onMesaCambiada,
}: {
  mesa: Mesa;
  /** Todo el salón: hace falta para elegir qué mesa arrimar. */
  mesasDelSalon: Mesa[];
  onAtras: () => void;
  /** La mesa después de unir o separar: la pantalla se repinta con ella. */
  onMesaCambiada: (mesa: Mesa) => void;
  /** La mesa ya abierta: se encadena con la carta sin volver al salón. */
  onAbierta: (mesa: Mesa) => void;
}) {
  const [personas, setPersonas] = useState(INICIAL);
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [reservando, setReservando] = useState(false);
  const [uniendo, setUniendo] = useState(false);

  const lugares = mesa.capacidadTotal || mesa.capacidad;
  const excede = personas > lugares;

  /**
   * Atajos de tamaño de grupo: los que se repiten todo el turno y ahorran
   * tocar el "+" cinco veces. Se ofrecen los que entran en la mesa más el de
   * la capacidad exacta.
   */
  const atajos = [...new Set([1, 2, 4, 6, 8, lugares].filter((n) => n <= lugares))].sort(
    (a, b) => a - b,
  );

  async function abrir() {
    if (enviando) return;
    setError("");
    setEnviando(true);
    try {
      const abierta = await api.abrirMesa(mesa.id, {
        comensales: personas,
        ...(referencia.trim() ? { referencia: referencia.trim() } : {}),
      });
      onAbierta(abierta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la mesa");
      setEnviando(false);
    }
  }

  async function unir(otra: Mesa) {
    setUniendo(false);
    setError("");
    setEnviando(true);
    try {
      onMesaCambiada(await api.unirMesa(mesa.id, [otra.id]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo unir la mesa");
    } finally {
      setEnviando(false);
    }
  }

  async function separar() {
    setError("");
    setEnviando(true);
    try {
      onMesaCambiada(await api.separarMesa(mesa.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron separar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-fondo">
      <header className="flex items-center gap-3 border-b border-borde bg-white px-4 py-3">
        <button
          onClick={onAtras}
          aria-label="Volver"
          className="rounded-lg p-1.5 text-texto-2 hover:bg-muted"
        >
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="min-w-0 flex-1">
          {/* "Mesa M1" o "M1 + M2": el mesero tiene que ver que está por
              sentar al grupo en la mesa armada y no en una sola. */}
          <h1 className="truncate text-lg font-extrabold text-texto">
            Abrir {etiquetaMesa(mesa)}
          </h1>
          <p className="truncate text-xs text-texto-3">
            {mesa.zonaNombre} · {lugares} {lugares === 1 ? "lugar" : "lugares"}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* Aclaración que dejó el dueño sobre esta mesa concreta. */}
        {mesa.notaMesa && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#93C5FD] bg-[#EFF6FF] px-3.5 py-2.5 text-[13px] text-[#2563EB]">
            <Icon name="info" size={16} />
            <span>{mesa.notaMesa}</span>
          </div>
        )}

        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-texto-3">
          ¿Cuántas personas son?
        </p>
        <div className="card p-4">
          {/* Stepper grande: se toca con el pulgar, de pie y a veces con la
              bandeja en la otra mano. Los botones son cuadrados de 56px
              porque a 40 se erraba el toque. */}
          <div className="flex items-center justify-between gap-4">
            <BotonStepper
              etiqueta="Una persona menos"
              onClick={() => setPersonas((n) => Math.max(1, n - 1))}
              disabled={personas <= 1}
            >
              <Icon name="minus" size={22} />
            </BotonStepper>
            <div className="text-center">
              <p className="text-4xl font-extrabold leading-none text-texto">{personas}</p>
              <p className="mt-1 text-xs text-texto-3">
                {personas === 1 ? "persona" : "personas"}
              </p>
            </div>
            <BotonStepper
              etiqueta="Una persona más"
              onClick={() => setPersonas((n) => Math.min(MAXIMO, n + 1))}
              disabled={personas >= MAXIMO}
            >
              <Icon name="plus" size={22} />
            </BotonStepper>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {atajos.map((n) => (
              <button
                key={n}
                onClick={() => setPersonas(n)}
                className={`min-w-[56px] rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  personas === n
                    ? "border-primary bg-primary text-white"
                    : "border-borde bg-white text-texto-2 hover:bg-muted"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Aviso, no bloqueo: si seis personas se quieren apretar en una
              mesa de cuatro, es decisión del cliente. La app avisa para que el
              mesero pueda ofrecerle otra, nada más. */}
          {excede && (
            <p className="mt-3 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-[13px] text-[#D97706]">
              La mesa es para {lugares} {lugares === 1 ? "persona" : "personas"}. Podés
              seguir igual.
            </p>
          )}
        </div>

        <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-texto-3">
          ¿A nombre de quién? (opcional)
        </p>
        <div className="card p-4">
          <input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value.slice(0, 60))}
            placeholder="Ej: Sr. Mamani, cumpleaños…"
            className="w-full rounded-xl border border-borde px-3.5 py-2.5 text-[15px] outline-none focus:border-primary"
          />
          <p className="mt-1.5 text-xs text-texto-3">
            Sirve para encontrar la mesa cuando el salón está lleno.
          </p>
        </div>

        {error && (
          <div className="mt-3">
            <ErrorMsg>{error}</ErrorMsg>
          </div>
        )}
      </div>

      <div className="border-t border-borde bg-white p-4">
        <Boton
          icono="check"
          onClick={abrir}
          disabled={enviando}
          className="w-full py-3 text-base"
        >
          {enviando ? "Abriendo…" : "Abrir y tomar pedido"}
        </Boton>
        {/* Para el grupo que no entra en una sola mesa: llegan 14 y la más
            grande es de 8, así que se arrima otra. Va acá, en la pantalla
            donde el mesero está escribiendo "14", y no escondido en el plano:
            es el único momento en que se acuerda de que hace falta.

            El botón cambia de sentido según cómo esté la mesa: arrimar otra
            cuando está sola, separarlas cuando ya son una grande. Es el mismo
            lugar porque es la misma decisión. */}
        <Boton
          variante="ghost"
          onClick={() => {
            if (estaUnida(mesa)) separar();
            else setUniendo(true);
          }}
          disabled={enviando}
          className="mt-2 w-full"
        >
          {estaUnida(mesa) ? "Separar las mesas" : "Unir otra mesa"}
        </Boton>
        {/* Para cuando llaman a reservar y la mesa todavía no se ocupa. */}
        <Boton
          variante="ghost"
          onClick={() => setReservando(true)}
          disabled={enviando}
          className="mt-2 w-full"
        >
          No están ahora · reservar
        </Boton>
      </div>

      {uniendo && (
        <ElegirMesa
          modo="pasar"
          mesa={mesa}
          mesas={mesasDelSalon}
          procesando={enviando}
          onCerrar={() => setUniendo(false)}
          onElegir={unir}
        />
      )}

      {reservando && (
        <Reserva
          mesa={mesa}
          procesando={enviando}
          onCerrar={() => setReservando(false)}
          onGuardar={async (r) => {
            setReservando(false);
            setEnviando(true);
            try {
              await api.reservarMesa(mesa.id, r);
              onAtras();
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo reservar");
              setEnviando(false);
            }
          }}
        />
      )}
    </div>
  );
}

function BotonStepper({
  etiqueta,
  onClick,
  disabled,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-borde bg-white text-texto-2 transition-colors enabled:hover:border-primary enabled:hover:bg-primary-50 enabled:hover:text-primary-700 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
