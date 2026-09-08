import { useState } from "react";
import { Boton, ErrorMsg, Input, Modal } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import type { ItemComanda, Mesa } from "../../types/salon";
import { consumoDeMesa, estaOcupada, subtotalItem } from "./logicaSalon";

/**
 * Elegir la mesa destino de un "pasar" o un "juntar".
 *
 * Son dos cosas distintas y por eso el diálogo cambia de texto y de lista:
 *  - **Pasar**: el grupo se levanta y se sienta en otra mesa. Va a una LIBRE.
 *  - **Juntar**: dos cuentas que ya comieron se cobran juntas. Va a una
 *    OCUPADA.
 */
export function ElegirMesa({
  modo,
  mesa,
  mesas,
  procesando,
  onElegir,
  onCerrar,
}: {
  modo: "pasar" | "juntar";
  mesa: Mesa;
  mesas: Mesa[];
  procesando: boolean;
  onElegir: (otra: Mesa) => void;
  onCerrar: () => void;
}) {
  const pasar = modo === "pasar";
  const candidatas = mesas.filter((m) =>
    m.id === mesa.id ? false : pasar ? m.estado === "LIBRE" : estaOcupada(m),
  );

  return (
    <Modal
      abierto
      titulo={pasar ? "¿A qué mesa la paso?" : "¿Qué mesa junto con esta?"}
      subtitulo={
        pasar
          ? "El consumo y los pedidos se mueven con el grupo."
          : "El consumo de esa mesa se suma a esta y la otra queda libre."
      }
      onClose={onCerrar}
      ancho="max-w-sm"
      acciones={
        <Boton variante="ghost" onClick={onCerrar}>
          Cancelar
        </Boton>
      }
    >
      {candidatas.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-texto-3">
          {pasar
            ? "No hay ninguna mesa libre ahora mismo."
            : "No hay otra mesa ocupada para juntar."}
        </p>
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
                  {!pasar && m.meseroNombre ? ` · Atiende ${m.meseroNombre}` : ""}
                </p>
              </div>
              {!pasar && (
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
                  ? "border-primary bg-primary text-white"
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
