import { useMemo, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Modal } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { FormCobro } from "./Cobro";
import { useCobro } from "./useCobro";
import { billar, mesasEnUso, tipoDe, useBillar } from "./store";
import { useAhora } from "./reloj";
import { cuentaDe, horaDe } from "./calculo";
import type { Mesa } from "./tipos";
import { BotonB, Circulo, Nota } from "./ui";

/** Cambiar de mesa (§7.12): sólo a una libre. La cuenta entera se muda. */
export function ModalCambiar({ mesa, onClose }: { mesa: Mesa; onClose: () => void }) {
  const e = useBillar();
  const navigate = useNavigate();
  const libres = mesasEnUso(e).filter((m) => m.estado === "libre");
  const [destino, setDestino] = useState<number | null>(libres[0]?.id ?? null);
  const origen = tipoDe(e, mesa);
  const elegida = libres.find((m) => m.id === destino);
  const nuevo = elegida ? tipoDe(e, elegida) : null;
  // La misma regla que `billar.cambiarMesa`: otro tipo u otra tarifa, y no en tiempo fijo.
  const otroTipo = !!nuevo && (nuevo.id !== origen.id || nuevo.tarifa !== origen.tarifa) && !mesa.sesion?.prepago;

  return (
    <Modal
      abierto
      titulo={`Cambiar Mesa ${mesa.id}`}
      subtitulo="Elegí una mesa libre."
      onClose={onClose}
      ancho="max-w-lg"
      acciones={
        <>
          <BotonB onClick={onClose}>Cancelar</BotonB>
          <BotonB
            variante="verde"
            disabled={!elegida}
            onClick={() => {
              billar.cambiarMesa(mesa.id, destino!);
              onClose();
              navigate(`/billar?mesa=${destino}`, { replace: true });
            }}
          >
            Mover a Mesa {destino ?? ""}
          </BotonB>
        </>
      }
    >
      {libres.length === 0 ? (
        <Nota tono="gris">No hay mesas libres ahora. Cuando se libere una, vas a poder mover la cuenta.</Nota>
      ) : (
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Mesa libre" className="grid gap-2 sm:grid-cols-2">
            {libres.map((m) => {
              const t = tipoDe(e, m);
              const activo = m.id === destino;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => setDestino(m.id)}
                  className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                    activo ? "border-primary bg-primary-50/60" : "border-borde hover:bg-muted"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      activo ? "border-primary-boton" : "border-slate-300"
                    }`}
                  >
                    {activo && <span className="h-2.5 w-2.5 rounded-full bg-primary-boton" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold text-texto">
                      Mesa {m.id}
                      {m.alias ? ` · ${m.alias}` : ""}
                    </span>
                    <span className="block text-[12px] text-texto-3">
                      {t.nombre} · {fmtMoney(t.tarifa)}/h
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {otroTipo ? (
            <Nota tono="ambar">
              La Mesa {destino} es {nuevo.nombre} ({fmtMoney(nuevo.tarifa)}/h). Lo jugado hasta ahora queda a{" "}
              {fmtMoney(origen.tarifa)}/h y desde el cambio corre a {fmtMoney(nuevo.tarifa)}/h.
            </Nota>
          ) : (
            <Nota>El cronómetro, los consumos y los pagos se mueven con la cuenta.</Nota>
          )}
        </div>
      )}
    </Modal>
  );
}

const MOTIVOS_PAUSA = ["Problema con la mesa", "Corte de luz", "Cliente salió", "Otro"];
const MOTIVOS_FUERA = ["Cambio de paño", "Mantenimiento", "Otro"];

/** Pausar (§7.12) o sacar de servicio: un motivo de los de siempre, u otro escrito. */
export function ModalMotivo({
  mesa,
  modo,
  onClose,
}: {
  mesa: Mesa;
  modo: "pausar" | "fuera";
  onClose: () => void;
}) {
  const motivos = modo === "pausar" ? MOTIVOS_PAUSA : MOTIVOS_FUERA;
  const [motivo, setMotivo] = useState(motivos[0]);
  const [otro, setOtro] = useState("");
  const final = motivo === "Otro" ? otro.trim() : motivo;
  return (
    <Modal
      abierto
      titulo={modo === "pausar" ? `Pausar Mesa ${mesa.id}` : `Mesa ${mesa.id} fuera de servicio`}
      subtitulo={
        modo === "pausar"
          ? "El cronómetro se frena hasta que la reanudes. La pausa queda registrada."
          : "Sale del tablero para abrir hasta que vuelva a servicio."
      }
      onClose={onClose}
      ancho="max-w-md"
      acciones={
        <>
          <BotonB onClick={onClose}>Cancelar</BotonB>
          <BotonB
            variante={modo === "pausar" ? "ambar" : "verde"}
            icono={modo === "pausar" ? "pausa" : "llave"}
            disabled={!final}
            onClick={() => {
              if (modo === "pausar") billar.pausar(mesa.id, final);
              else billar.fueraDeServicio(mesa.id, final);
              onClose();
            }}
          >
            {modo === "pausar" ? "Pausar" : "Sacar de servicio"}
          </BotonB>
        </>
      }
    >
      <p className="mb-2 text-[13px] font-semibold text-texto-2">Motivo</p>
      <ChipsMotivo motivos={motivos} valor={motivo} onCambiar={setMotivo} />
      {motivo === "Otro" && (
        <Input
          className="mt-3"
          autoFocus
          value={otro}
          onChange={(ev) => setOtro(ev.target.value)}
          placeholder="¿Qué pasó?"
          aria-label="Otro motivo"
        />
      )}
    </Modal>
  );
}

function ChipsMotivo({ motivos, valor, onCambiar }: { motivos: string[]; valor: string; onCambiar: (m: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Motivo" className="flex flex-wrap gap-2">
      {motivos.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={valor === m}
          onClick={() => onCambiar(m)}
          className={`min-h-10 rounded-full px-4 text-[13px] font-semibold transition-colors ${
            valor === m ? "bg-primary-boton text-white" : "bg-white text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

/** Reservar (§7.12): una de las próximas medias horas y a nombre de quién. */
export function ModalReservar({ mesa, onClose }: { mesa: Mesa; onClose: () => void }) {
  const horas = useMemo(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
    return Array.from({ length: 8 }, (_, i) => d.getTime() + i * 30 * 60_000);
  }, []);
  const [hora, setHora] = useState(horas[0]);
  const [nombre, setNombre] = useState("");
  return (
    <Modal
      abierto
      titulo={`Reservar Mesa ${mesa.id}`}
      subtitulo="Queda apartada hasta que lleguen; ahí se abre con un toque."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-md"
      acciones={
        <>
          <BotonB onClick={onClose}>Cancelar</BotonB>
          <BotonB
            variante="verde"
            icono="calendar"
            disabled={!nombre.trim()}
            onClick={() => {
              billar.reservar(mesa.id, hora, nombre);
              onClose();
            }}
          >
            Reservar
          </BotonB>
        </>
      }
    >
      <p className="mb-2 text-[13px] font-semibold text-texto-2">Hora</p>
      <div className="flex flex-wrap gap-2">
        {horas.map((h) => (
          <button
            key={h}
            type="button"
            aria-pressed={hora === h}
            onClick={() => setHora(h)}
            className={`min-h-10 rounded-full px-3.5 text-[13px] font-semibold tabular-nums ${
              hora === h ? "bg-primary-boton text-white" : "bg-white text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
            }`}
          >
            {horaDe(h)}
          </button>
        ))}
      </div>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">A nombre de</span>
        <Input autoFocus value={nombre} onChange={(ev) => setNombre(ev.target.value)} placeholder="Nombre" />
      </label>
    </Modal>
  );
}

/** Registrar un pago parcial o adelanto (§7.5): queda en la cuenta de la mesa. */
export function ModalPago({ mesa, onClose }: { mesa: Mesa; onClose: () => void }) {
  const e = useBillar();
  const ahora = useAhora();
  // El saldo de cuando se abrió: con el tiempo corriendo, el tope no se mueve mientras se escribe.
  const [saldo] = useState(() => (mesa.sesion ? cuentaDe(mesa.sesion, tipoDe(e, mesa), ahora).saldo : 0));
  const cobro = useCobro(saldo, true);
  return (
    <Modal
      abierto
      titulo={`Registrar pago · Mesa ${mesa.id}`}
      subtitulo="Un adelanto o un pago parcial. Se descuenta del saldo al cerrar."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-lg"
      acciones={
        <>
          <BotonB onClick={onClose}>Cancelar</BotonB>
          <BotonB
            variante="verde"
            icono="check"
            disabled={!cobro.pago}
            onClick={() => {
              billar.pagar(mesa.id, cobro.pago!);
              onClose();
            }}
          >
            Registrar {fmtMoney(cobro.monto)}
          </BotonB>
        </>
      }
    >
      <FormCobro cobro={cobro} />
    </Modal>
  );
}

/**
 * Autorización con el PIN del administrador (§7.12): cuatro dígitos y el
 * motivo, que queda en la auditoría. Si en Mesas de billar se apagó el PIN
 * para esta acción, se pide sólo el motivo. MAQUETA: el PIN de prueba es
 * 1234; con el backend se valida como el resto de las anulaciones
 * (`autorizacion_pin`).
 */
export function ModalPin({
  accion,
  detalle,
  motivos,
  pedirPin = true,
  onClose,
  onAutorizar,
}: {
  accion: string;
  detalle: string;
  motivos: string[];
  pedirPin?: boolean;
  onClose: () => void;
  /** `autorizo`: quién puso el PIN, para la auditoría. */
  onAutorizar: (motivo: string, autorizo?: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState(motivos[0]);
  const [error, setError] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  const listo = (!pedirPin || pin.length === 4) && !!motivo;

  const autorizar = () => {
    if (!pedirPin) return onAutorizar(motivo);
    if (pin !== "1234") {
      setError("PIN incorrecto. Probá de nuevo.");
      setPin("");
      campo.current?.focus();
      return;
    }
    onAutorizar(motivo, "Administrador");
  };

  return (
    <Modal
      abierto
      titulo={pedirPin ? "Autorización del administrador" : "Confirmar anulación"}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-md"
      acciones={
        <>
          <BotonB onClick={onClose}>Cancelar</BotonB>
          <BotonB variante={pedirPin ? "verde" : "rosa"} disabled={!listo} onClick={autorizar}>
            {pedirPin ? "Autorizar" : "Anular"}
          </BotonB>
        </>
      }
    >
      {pedirPin && (
        <div className="mb-4 flex items-center gap-3">
          <Circulo icono="lock" tono="ambar" />
          <p className="text-[13px] text-texto-3">Esto necesita el PIN del administrador.</p>
        </div>
      )}
      <Nota tono="gris">
        <b className="text-texto">{accion}</b>
        <br />
        {detalle}
      </Nota>

      {pedirPin && (
        <CampoPin
          campo={campo}
          pin={pin}
          error={error}
          listo={listo}
          onPin={(p) => {
            setError("");
            setPin(p);
          }}
          onEnter={autorizar}
        />
      )}

      <p className="mb-2 mt-4 text-[13px] font-semibold text-texto-2">Motivo</p>
      <ChipsMotivo motivos={motivos} valor={motivo} onCambiar={setMotivo} />
    </Modal>
  );
}

/** Los cuatro casilleros del PIN: un input escondido encima, para el teclado del celular. */
function CampoPin({
  campo,
  pin,
  error,
  listo,
  onPin,
  onEnter,
}: {
  campo: RefObject<HTMLInputElement | null>;
  pin: string;
  error: string;
  listo: boolean;
  onPin: (pin: string) => void;
  onEnter: () => void;
}) {
  return (
    <>
      <p className="mb-2 mt-4 text-[13px] font-semibold text-texto-2">PIN del administrador</p>
      <div className="relative w-fit" onClick={() => campo.current?.focus()}>
        <input
          ref={campo}
          autoFocus
          inputMode="numeric"
          autoComplete="off"
          aria-label="PIN del administrador"
          value={pin}
          maxLength={4}
          onChange={(ev) => onPin(ev.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && listo) onEnter();
          }}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <div className="flex gap-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`flex h-14 w-12 items-center justify-center rounded-xl border-2 text-2xl font-bold ${
                i === pin.length ? "border-primary peer-focus:border-primary" : "border-borde"
              } ${error ? "border-rose-300" : ""}`}
            >
              {pin[i] ? "•" : ""}
            </span>
          ))}
        </div>
      </div>
      <p className={`mt-1.5 text-xs ${error ? "font-semibold text-rose-700" : "text-texto-4"}`}>
        {error || "Escribilo con el teclado. PIN de prueba: 1234"}
      </p>
    </>
  );
}
