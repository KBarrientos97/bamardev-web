import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Campo, ErrorMsg, Input, Modal } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import type { ItemComanda, Mesa } from "../../types/salon";
import {
  consumoDeMesa,
  mesasParaElegir,
  subtotalItem,
  type MovimientoMesa,
} from "./logicaSalon";

/** Lo que dice el diálogo en cada movimiento (los textos de `strings.xml`). */
const TEXTOS: Record<MovimientoMesa, { titulo: string; subtitulo: string; vacio: string }> = {
  pasar: {
    titulo: "¿A qué mesa la paso?",
    subtitulo: "El consumo y los pedidos se mueven con el grupo.",
    vacio: "No hay ninguna mesa libre ahora mismo.",
  },
  juntar: {
    titulo: "¿Qué mesa junto con esta?",
    subtitulo: "El consumo de esa mesa se suma a esta y la otra queda libre.",
    vacio: "No hay otra mesa ocupada para juntar.",
  },
  unir: {
    titulo: "¿Con qué mesa la unís?",
    subtitulo:
      "Para un grupo que no entra en una sola mesa. Se suman los lugares de las dos y queda una sola cuenta.",
    vacio: "No hay otra mesa libre para unir.",
  },
};

/**
 * Elegir la otra mesa de un "pasar", un "juntar" o un "unir".
 *
 * Son tres cosas distintas y por eso el diálogo cambia de texto y de lista
 * (las reglas, en `mesasParaElegir`):
 *  - **Pasar**: el grupo se levanta y se sienta en otra mesa. Va a una LIBRE.
 *  - **Juntar**: dos cuentas que ya comieron se cobran juntas. Va a una
 *    con gente y sin cobrar.
 *  - **Unir**: se arrima una mesa LIBRE antes de sentar a un grupo grande.
 */
export function ElegirMesa({
  modo,
  mesa,
  mesas,
  procesando,
  onElegir,
  onCerrar,
}: {
  modo: MovimientoMesa;
  mesa: Mesa;
  mesas: Mesa[];
  procesando: boolean;
  onElegir: (otra: Mesa) => void;
  onCerrar: () => void;
}) {
  const juntar = modo === "juntar";
  const textos = TEXTOS[modo];
  const candidatas = mesasParaElegir(modo, mesa, mesas);

  return (
    <Modal
      abierto
      titulo={textos.titulo}
      subtitulo={textos.subtitulo}
      onClose={onCerrar}
      ancho="max-w-sm"
      acciones={
        <Boton variante="ghost" onClick={onCerrar}>
          Cancelar
        </Boton>
      }
    >
      {candidatas.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-texto-3">{textos.vacio}</p>
      ) : (
        <div className="space-y-2">
          {candidatas.map((m) => (
            <button
              key={m.id}
              onClick={() => onElegir(m)}
              disabled={procesando}
              className="flex w-full items-center gap-3 rounded-xl border border-borde bg-white p-3 text-left hover:bg-muted disabled:opacity-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-extrabold text-texto">
                {m.codigo}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-texto">{m.nombre}</p>
                <p className="truncate text-xs text-texto-3">
                  {m.zonaNombre}
                  {/* Quién la atiende: juntar la mesa de otro mesero es una
                      decisión distinta que juntar la propia. */}
                  {juntar && m.meseroNombre ? ` · Atiende ${m.meseroNombre}` : ""}
                  {/* Al unir lo que se elige son lugares: cuántos suma. */}
                  {modo === "unir" ? ` · ${m.capacidad} ${m.capacidad === 1 ? "lugar" : "lugares"}` : ""}
                </p>
              </div>
              {juntar && (
                <span className="shrink-0 text-sm font-bold text-texto">
                  {fmtMoney(consumoDeMesa(m))}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Los motivos que se repiten. El dueño todavía no los configura. */
const MOTIVOS = [
  "El cliente lo canceló",
  "Se pidió por error",
  "No hay ingredientes",
  "Llegó mal preparado",
];

/**
 * Quitar un producto de la cuenta.
 *
 * Pide el motivo porque es lo que el dueño va a querer leer después, y lo que
 * el mesero le explica al cliente.
 */
export function AnularItem({
  item,
  enCocina,
  procesando,
  onConfirmar,
  onCerrar,
}: {
  item: ItemComanda;
  /** La comanda ya salió: hay que avisarle a la cocina. */
  enCocina: boolean;
  procesando: boolean;
  onConfirmar: (motivo: string) => void;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [libre, setLibre] = useState("");
  const [error, setError] = useState("");

  function confirmar() {
    const elegido = (motivo || libre).trim();
    if (!elegido) return setError("Elegí o escribí el motivo");
    onConfirmar(elegido);
  }

  return (
    <Modal
      abierto
      titulo="Quitar producto"
      subtitulo={`${item.cantidad}× ${item.nombre} · ${fmtMoney(subtotalItem(item))}`}
      onClose={onCerrar}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton variante="danger" onClick={confirmar} disabled={procesando}>
            Quitar {item.nombre}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        {enCocina && (
          <p className="rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-[13px] text-[#D97706]">
            Ya está en cocina: avisales para que no lo preparen.
          </p>
        )}
        <p className="text-[11px] font-bold uppercase tracking-wide text-texto-3">
          ¿Por qué se quita?
        </p>
        <div className="flex flex-wrap gap-2">
          {MOTIVOS.map((m) => (
            <button
              key={m}
              onClick={() => {
                setMotivo(motivo === m ? "" : m);
                setError("");
              }}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                motivo === m
                  ? "border-primary-boton bg-primary-boton text-white"
                  : "border-borde bg-white text-texto-2 hover:bg-muted"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <Input
          value={libre}
          onChange={(e) => {
            setLibre(e.target.value.slice(0, 120));
            setError("");
          }}
          placeholder="Otro motivo…"
        />
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

/** El mismo tope que al abrir la mesa (`AbrirMesa`) y que la app. */
const MAX_PERSONAS_RESERVA = 30;

/**
 * Reservar la mesa para más tarde.
 *
 * Para cuando llaman a reservar y la mesa todavía no se ocupa: el mesero la
 * marca y nadie sienta a otro grupo encima.
 */
export function Reserva({
  mesa,
  procesando,
  onGuardar,
  onCerrar,
}: {
  mesa: Mesa;
  procesando: boolean;
  onGuardar: (r: {
    hora: string;
    nombre: string;
    telefono?: string;
    personas: number;
    nota?: string;
  }) => void;
  onCerrar: () => void;
}) {
  const previa = mesa.reserva;
  const [hora, setHora] = useState(previa?.hora ?? "");
  const [nombre, setNombre] = useState(previa?.nombre ?? "");
  const [telefono, setTelefono] = useState(previa?.telefono ?? "");
  // Un stepper de 1 a 30 y no un campo libre: vacío o en 0 la web no mandaba
  // las personas, `ReservarMesaDto` las exige y guardar fallaba con un error de
  // validación (un "2.5" también pasaba). Así siempre viaja un número válido,
  // como en la app (ReservaDialog.kt).
  const [personas, setPersonas] = useState(() =>
    Math.min(MAX_PERSONAS_RESERVA, Math.max(1, Math.round(previa?.personas ?? 2))),
  );
  const [nota, setNota] = useState(previa?.nota ?? "");
  const [error, setError] = useState("");

  function guardar() {
    if (!hora.trim()) return setError("Elegí la hora de la reserva");
    if (!nombre.trim())
      return setError("Escribí a nombre de quién queda la reserva");
    onGuardar({
      hora: hora.trim(),
      nombre: nombre.trim(),
      ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
      personas,
      ...(nota.trim() ? { nota: nota.trim() } : {}),
    });
  }

  return (
    <Modal
      abierto
      titulo={previa ? "Cambiar la reserva" : `Reservar ${mesa.codigo}`}
      onClose={onCerrar}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton icono="save" onClick={guardar} disabled={procesando}>
            Guardar reserva
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="¿A qué hora?">
          <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </Campo>
        <Campo label="¿A nombre de quién?">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value.slice(0, 60))}
            placeholder="Ej: Sra. Peredo"
          />
        </Campo>
        <Campo label="Teléfono (opcional)">
          <Input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value.slice(0, 20))}
            inputMode="tel"
          />
        </Campo>
        {/* Un div y no un `Campo`: el `Campo` es un <label>, y tocar su texto
            activaría el primer botón de adentro (una persona menos). */}
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">¿Cuántas personas?</p>
          <div className="flex items-center gap-3">
            <BotonPersonas
              etiqueta="Una persona menos"
              onClick={() => setPersonas((n) => Math.max(1, n - 1))}
              disabled={personas <= 1}
            >
              <Icon name="minus" size={18} />
            </BotonPersonas>
            <p className="min-w-10 text-center text-2xl font-extrabold text-texto" aria-live="polite">
              {personas}
            </p>
            <BotonPersonas
              etiqueta="Una persona más"
              onClick={() => setPersonas((n) => Math.min(MAX_PERSONAS_RESERVA, n + 1))}
              disabled={personas >= MAX_PERSONAS_RESERVA}
            >
              <Icon name="plus" size={18} />
            </BotonPersonas>
          </div>
        </div>
        <Campo label="Nota (opcional)">
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, 120))}
            placeholder="Ej: aniversario, cerca de la ventana"
          />
        </Campo>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

function BotonPersonas({
  etiqueta,
  onClick,
  disabled,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-borde bg-white text-texto-2 transition-colors enabled:hover:border-primary enabled:hover:bg-primary-50 enabled:hover:text-primary-700 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
