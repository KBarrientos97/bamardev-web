import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Modal } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { tienePermiso } from "../../lib/permisos";
import { useAuth } from "../../store/AuthContext";
import { useIntentoDeCobro } from "../pos/useIntentoDeCobro";
import type { Credenciales } from "./api";
import { FormCobro } from "./Cobro";
import { useCobro } from "./useCobro";
import { useAccion } from "./useAccion";
import { huellaAdelanto } from "./reintentos";
import { billar, mesasEnUso, tipoDe, useBillar } from "./store";
import { ahoraServidor, useAhora } from "./reloj";
import { cuentaDe, horaDe } from "./calculo";
import type { Mesa } from "./tipos";
import { BotonB, Circulo, ErrorAccion, Nota } from "./ui";

/** Cambiar de mesa (§7.12): sólo a una libre. La cuenta entera se muda. */
export function ModalCambiar({ mesa, onClose }: { mesa: Mesa; onClose: () => void }) {
  const e = useBillar();
  const navigate = useNavigate();
  const libres = mesasEnUso(e).filter((m) => m.estado === "libre");
  const [destino, setDestino] = useState<number | null>(libres[0]?.id ?? null);
  const accion = useAccion();
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
            disabled={!elegida || accion.enviando}
            onClick={async () => {
              if (!(await accion.ejecutar(() => billar.cambiarMesa(mesa.id, destino!)))) return;
              onClose();
              navigate(`/billar?mesa=${destino}`, { replace: true });
            }}
          >
            {accion.enviando ? "Moviendo…" : `Mover a Mesa ${destino ?? ""}`}
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
      <ErrorAccion texto={accion.error} />
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
  const accion = useAccion();
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
            disabled={final.length < 2 || accion.enviando}
            onClick={async () => {
              const ok = await accion.ejecutar(() =>
                modo === "pausar" ? billar.pausar(mesa.id, final) : billar.fueraDeServicio(mesa.id, final),
              );
              if (ok) onClose();
            }}
          >
            {accion.enviando ? "Guardando…" : modo === "pausar" ? "Pausar" : "Sacar de servicio"}
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
      <ErrorAccion texto={accion.error} />
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
  const accion = useAccion();
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
            disabled={nombre.trim().length < 2 || accion.enviando}
            onClick={async () => {
              if (await accion.ejecutar(() => billar.reservar(mesa.id, hora, nombre))) onClose();
            }}
          >
            {accion.enviando ? "Reservando…" : "Reservar"}
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
      <ErrorAccion texto={accion.error} />
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
  const accion = useAccion();
  // Con wifi malo la respuesta se pierde y el cajero vuelve a tocar
  // "Registrar": el mismo id hace que el adelanto entre una sola vez al cajón.
  const intento = useIntentoDeCobro();
  const registrar = async () => {
    const pago = cobro.pago;
    if (!pago || !mesa.sesion) return;
    const clave = intento.actual(huellaAdelanto(mesa.sesion.id, pago));
    if (!(await accion.ejecutar(() => billar.pagar(mesa.id, pago, clave)))) return;
    intento.registrado();
    onClose();
  };
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
            disabled={!cobro.pago || accion.enviando}
            onClick={() => void registrar()}
          >
            {accion.enviando ? "Registrando…" : `Registrar ${fmtMoney(cobro.monto)}`}
          </BotonB>
        </>
      }
    >
      <FormCobro cobro={cobro} />
      <ErrorAccion texto={accion.error} />
    </Modal>
  );
}

/**
 * Autorización con PIN (§7.12): el motivo, que queda en la auditoría, y el
 * PIN. Es la misma regla que anular una venta en el POS: quien puede
 * autorizar pone su propio PIN; un cajero pone el usuario y el PIN del
 * encargado que lo autoriza (con el permiso de la acción, si no el servidor
 * lo rechaza). Si en Mesas de billar se apagó el PIN para esta acción, se
 * pide sólo el motivo.
 */
export function ModalPin({
  accion: titulo,
  detalle,
  motivos,
  pedirPin = true,
  permiso,
  bloqueado = false,
  children,
  onClose,
  onAutorizar,
}: {
  accion: string;
  detalle: string;
  motivos: string[];
  pedirPin?: boolean;
  /** El permiso de la acción: quien autoriza lo tiene que tener, además de `autorizar.pin`. */
  permiso: string;
  /** Otro dato del diálogo todavía no está listo (la hora nueva, por ejemplo). */
  bloqueado?: boolean;
  /** Campos propios de la acción, arriba del motivo. */
  children?: ReactNode;
  onClose: () => void;
  /**
   * Hace la acción; si el servidor dice que no, el diálogo sigue abierto con su
   * mensaje. `clienteRequestId` es el mismo mientras el diálogo siga abierto:
   * la acción que lo use (anular la mesa) no se repite si el cajero reintenta
   * porque la respuesta no llegó.
   */
  onAutorizar: (motivo: string, cred: Credenciales, clienteRequestId: string) => Promise<unknown>;
}) {
  const { usuario } = useAuth();
  const pideUsuario = pedirPin && !(tienePermiso(usuario, "autorizar.pin") && tienePermiso(usuario, permiso));
  const opciones = [...motivos, "Otro"];
  const [motivo, setMotivo] = useState(opciones[0]);
  const [otro, setOtro] = useState("");
  const [autorizador, setAutorizador] = useState("");
  const [pin, setPin] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  const accion = useAccion();
  const intento = useIntentoDeCobro();
  const final = motivo === "Otro" ? otro.trim() : motivo;
  const listo =
    !bloqueado &&
    final.length >= 3 &&
    (!pedirPin || (/^\d{4,6}$/.test(pin) && (!pideUsuario || autorizador.trim().length >= 3)));

  const autorizar = async () => {
    if (!listo || accion.enviando) return;
    const cred: Credenciales = pedirPin
      ? { ...(pideUsuario ? { autorizadorUsername: autorizador.trim() } : {}), autorizadorPin: pin }
      : {};
    if (!(await accion.ejecutar(() => onAutorizar(final, cred, intento.actual())))) {
      setPin("");
      campo.current?.focus();
      return;
    }
    intento.registrado();
  };

  return (
    <Modal
      abierto
      titulo={pedirPin ? "Autorización" : "Confirmar"}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-md"
      acciones={
        <>
          <BotonB onClick={onClose}>Cancelar</BotonB>
          <BotonB variante={pedirPin ? "verde" : "rosa"} disabled={!listo || accion.enviando} onClick={autorizar}>
            {accion.enviando ? "Enviando…" : pedirPin ? "Autorizar" : "Confirmar"}
          </BotonB>
        </>
      }
    >
      {pedirPin && (
        <div className="mb-4 flex items-center gap-3">
          <Circulo icono="lock" tono="ambar" />
          <p className="text-[13px] text-texto-3">
            {pideUsuario ? "Esto necesita el PIN de un encargado." : "Confirmalo con tu PIN."}
          </p>
        </div>
      )}
      <Nota tono="gris">
        <b className="text-texto">{titulo}</b>
        <br />
        {detalle}
      </Nota>

      {children}

      <p className="mb-2 mt-4 text-[13px] font-semibold text-texto-2">Motivo</p>
      <ChipsMotivo motivos={opciones} valor={motivo} onCambiar={setMotivo} />
      {motivo === "Otro" && (
        <Input
          className="mt-3"
          value={otro}
          onChange={(ev) => setOtro(ev.target.value)}
          placeholder="¿Por qué?"
          aria-label="Otro motivo"
        />
      )}

      {pedirPin && pideUsuario && (
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">Usuario del encargado</span>
          <Input
            value={autorizador}
            onChange={(ev) => setAutorizador(ev.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            placeholder="Usuario"
          />
        </label>
      )}
      {pedirPin && (
        <CampoPin
          campo={campo}
          pin={pin}
          error={accion.error}
          titulo={pideUsuario ? "PIN del encargado" : "Tu PIN"}
          listo={listo}
          onPin={(p) => {
            accion.setError("");
            setPin(p);
          }}
          onEnter={autorizar}
        />
      )}
      {!pedirPin && <ErrorAccion texto={accion.error} />}
    </Modal>
  );
}

/**
 * Los casilleros del PIN (de 4 a 6 dígitos, como en todo el sistema): un
 * input escondido encima, para el teclado del celular. Arranca con cuatro y
 * crece si el PIN es más largo.
 */
function CampoPin({
  campo,
  pin,
  error,
  titulo,
  listo,
  onPin,
  onEnter,
}: {
  campo: RefObject<HTMLInputElement | null>;
  pin: string;
  error: string;
  titulo: string;
  listo: boolean;
  onPin: (pin: string) => void;
  onEnter: () => void;
}) {
  const casilleros = Math.min(6, Math.max(4, pin.length));
  return (
    <>
      <p className="mb-2 mt-4 text-[13px] font-semibold text-texto-2">{titulo}</p>
      <div className="relative w-fit" onClick={() => campo.current?.focus()}>
        <input
          ref={campo}
          inputMode="numeric"
          autoComplete="off"
          aria-label={titulo}
          value={pin}
          maxLength={6}
          onChange={(ev) => onPin(ev.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && listo) onEnter();
          }}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <div className="flex gap-2" aria-hidden>
          {Array.from({ length: casilleros }, (_, i) => (
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
      <p
        role={error ? "alert" : undefined}
        className={`mt-1.5 text-xs ${error ? "font-semibold text-rose-700" : "text-texto-4"}`}
      >
        {error || "De 4 a 6 dígitos. Escribilo con el teclado."}
      </p>
    </>
  );
}

/**
 * Corregir la hora de inicio (§7.12): se abrió tarde o se olvidaron de
 * abrirla. Pide PIN siempre y queda en la auditoría. La hora es de hoy; si
 * todavía no llegó, es de ayer (una mesa que arrancó antes de la medianoche).
 */
export function ModalEditarInicio({ mesa, onClose }: { mesa: Mesa; onClose: () => void }) {
  const s = mesa.sesion;
  const [hora, setHora] = useState(() => (s ? horaInput(s.start) : ""));
  if (!s) return null;
  const inicio = aHoraDelDia(hora);
  const valida = inicio !== null && Math.abs(inicio - s.start) >= 60_000;
  return (
    <ModalPin
      accion={`Corregir el inicio de la Mesa ${mesa.id}`}
      // Sin punto después de la hora: ya termina en "p. m." y quedaba "p. m..".
      detalle={`Arrancó a las ${horaDe(s.start)}; la cuenta se recalcula desde la hora nueva.`}
      motivos={["Se olvidó abrirla", "Se abrió tarde", "Error de hora"]}
      permiso="billar.admin"
      bloqueado={!valida}
      onClose={onClose}
      onAutorizar={async (motivo, cred) => {
        await billar.editarInicio(mesa.id, inicio!, motivo, cred);
        onClose();
      }}
    >
      <label className="mt-4 block">
        <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">Empezaron a jugar a las</span>
        <Input type="time" value={hora} onChange={(ev) => setHora(ev.target.value)} className="w-40" />
      </label>
    </ModalPin>
  );
}

/** "21:05", en la hora del local (la del navegador). */
function horaInput(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "21:05" → hoy a esa hora, o ayer si todavía no llegó. */
function aHoraDelDia(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora);
  if (!m) return null;
  const ahora = ahoraServidor();
  const d = new Date(ahora);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() > ahora) d.setDate(d.getDate() - 1);
  return d.getTime();
}
