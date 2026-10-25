import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Campo, ErrorMsg, Input, Modal, Select } from "../../components/ui";
import { api } from "../../lib/api";
import { parsearMontoO } from "../../lib/dinero";
import { fmtHora, fmtMoney } from "../../lib/format";

import { MOTIVOS, type MotivoMovimiento } from "./motivosMovimiento";

/** Motivo libre: es el único que pide escribir la descripción y el sentido. */
const OTRO = "__otro__";

/**
 * "Movimiento de efectivo": entradas y salidas de plata de una caja que no son
 * ventas. Es el del cierre de caja de siempre (el cajero con permiso lo registra
 * en la suya) y, desde Supervisión del billar, el que el administrador registra
 * en la caja de la cajera.
 *
 * Sin las props de abajo es exactamente el de siempre: los mismos motivos, sin
 * aviso ni montos rápidos.
 */
export default function DialogoMovimiento({
  cajaId,
  onClose,
  onGuardado,
  motivosExtra = [],
  motivoInicial,
  deQuien,
  esperado,
}: {
  cajaId: number;
  onClose: () => void;
  onGuardado: () => void;
  /** Motivos que van antes de los de siempre (la cena, en Supervisión). */
  motivosExtra?: MotivoMovimiento[];
  /** La etiqueta del motivo que arranca elegido; sin ella, "Otro". */
  motivoInicial?: string;
  /** De quién es la caja, cuando no es la de quien registra. */
  deQuien?: { nombre: string; desde: number };
  /** El efectivo que debería haber ahora en esa caja: con él se avisa cómo cambia el cierre. */
  esperado?: number | null;
}) {
  const lista = [...motivosExtra, ...MOTIVOS];
  const inicial = lista.find((m) => m.etiqueta === motivoInicial);
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">(inicial?.tipo ?? "EGRESO");
  const [motivo, setMotivo] = useState<string>(inicial?.etiqueta ?? OTRO);
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState(inicial?.etiqueta ?? "");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const elegido = lista.find((m) => m.etiqueta === motivo);
  const montoNum = parsearMontoO(monto, NaN);
  const montoValido = Number.isFinite(montoNum) && montoNum > 0;

  async function guardar() {
    setError("");
    const m = parsearMontoO(monto, NaN);
    if (!Number.isFinite(m) || m <= 0) return setError("Poné un monto mayor a cero.");
    if (!descripcion.trim()) return setError("Contá para qué fue el movimiento.");

    setEnviando(true);
    try {
      await api.crearMovimientoCaja(cajaId, {
        tipo,
        monto: m,
        descripcion: descripcion.trim(),
        ...(elegido?.origen ? { origen: elegido.origen } : {}),
      });
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Movimiento de efectivo"
      subtitulo="Entradas y salidas que no son ventas"
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={enviando}>
            {enviando ? "Guardando…" : "Registrar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        {/* Supervisión: a qué caja va, porque quien registra no es su dueño. */}
        {deQuien && (
          <p className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-[13px] text-texto-2">
            <Icon name="user" size={16} />
            <span>
              Va a la caja de <b className="text-texto">{deQuien.nombre}</b>, abierta desde las {fmtHora(new Date(deQuien.desde))}
            </span>
          </p>
        )}

        {/* Los motivos de siempre, que además deciden el sentido: elegir
            "Sencillo" y tener que marcar aparte que es un ingreso es pedirle al
            cajero que traduzca algo que el motivo ya dice. */}
        <Campo label="Motivo">
          <div className="flex flex-wrap gap-2">
            {lista.map((m) => (
              <button
                key={m.etiqueta}
                type="button"
                onClick={() => {
                  setMotivo(m.etiqueta);
                  setTipo(m.tipo);
                  // Con un motivo de la lista la descripción es la etiqueta:
                  // no hay nada más que escribir.
                  setDescripcion(m.etiqueta);
                }}
                className={`rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
                  motivo === m.etiqueta
                    ? "bg-primary-boton text-white"
                    : "border border-borde bg-white text-texto-2 hover:bg-muted"
                }`}
              >
                {m.etiqueta}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setMotivo(OTRO);
                setDescripcion("");
              }}
              className={`rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
                motivo === OTRO
                  ? "bg-primary-boton text-white"
                  : "border border-borde bg-white text-texto-2 hover:bg-muted"
              }`}
            >
              Otro
            </button>
          </div>
          <p
            className={`mt-1.5 text-xs font-semibold ${
              tipo === "INGRESO" ? "text-primary-700" : "text-danger-text"
            }`}
          >
            {tipo === "INGRESO" ? "Entra plata a la caja" : "Sale plata de la caja"}
          </p>
        </Campo>

        {motivo === OTRO && (
          <Campo label="Tipo">
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "INGRESO" | "EGRESO")}
            >
              <option value="EGRESO">Egreso — sale plata de la caja</option>
              <option value="INGRESO">Ingreso — entra plata a la caja</option>
            </Select>
          </Campo>
        )}

        <Campo label="Monto">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            autoFocus
            className="font-bold"
          />
          {/* La cena casi siempre es de unos pocos montos: se toca en vez de escribir. */}
          {elegido?.montosRapidos && (
            <div className="mt-2 flex gap-2">
              {elegido.montosRapidos.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMonto(String(n))}
                  className={`min-h-11 flex-1 rounded-xl text-[14px] font-bold transition-colors ${
                    montoValido && montoNum === n
                      ? "bg-primary-boton text-white"
                      : "border border-borde bg-white text-texto-2 hover:bg-muted"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </Campo>

        {/* Con un motivo de la lista la descripción ya está resuelta; sólo
            "Otro" obliga a escribirla. */}
        {motivo === OTRO && (
          <Campo label="Descripción">
            <Input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={tipo === "EGRESO" ? "Ej. compra de hielo" : "Ej. vuelto del dueño"}
            />
          </Campo>
        )}

        {/* Supervisión: cómo le cambia el cierre a la cajera. */}
        {deQuien && esperado != null && montoValido && (
          <p className="flex gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-[13px] leading-snug text-violet-900">
            <span className="mt-0.5 shrink-0">
              <Icon name="info" size={16} />
            </span>
            <span>
              En el cierre de {deQuien.nombre} el efectivo esperado pasa de <b>{fmtMoney(esperado)}</b> a{" "}
              <b>{fmtMoney(esperado + (tipo === "INGRESO" ? montoNum : -montoNum))}</b>.
            </span>
          </p>
        )}

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
