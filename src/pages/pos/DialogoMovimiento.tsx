import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Campo, ErrorMsg, Input, Modal, Select } from "../../components/ui";
import { api } from "../../lib/api";
import { parsearMontoO } from "../../lib/dinero";
import { fmtHora, fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";

import { MOTIVOS, type MotivoMovimiento } from "./motivosMovimiento";

/** Motivo libre: es el único que pide escribir la descripción y el sentido. */
const OTRO = "__otro__";

/** Una caja abierta del local a la que puede ir el movimiento (Supervisión). */
export interface CajaDestino {
  id: number;
  cajero: string;
  desde: number;
}

/**
 * "Movimiento de efectivo": entradas y salidas de plata de una caja que no son
 * ventas. Es el del cierre de caja de siempre (el cajero con permiso lo registra
 * en la suya) y, desde Supervisión del billar, el que el administrador registra
 * en la caja de la cajera.
 *
 * Sin las props de abajo es exactamente el de siempre: los mismos motivos, con
 * "Otro", sin aviso ni montos rápidos.
 *
 * Con `motivos` (billar, 25-oct) cada motivo lleva su código y dice qué hace
 * con la ganancia del mes: así el Estado de resultado resta la cena y los
 * gastos, y no un pago a proveedor (mercadería que ya resta al venderse) ni un
 * retiro (plata que sigue siendo del dueño). Por eso ahí no hay "Otro": un
 * "Otro" no diría si es un gasto.
 */
export default function DialogoMovimiento({
  cajaId,
  onClose,
  onGuardado,
  motivos,
  motivoInicial,
  deQuien,
  esperado,
  cajas,
}: {
  cajaId: number;
  onClose: () => void;
  /** Con la caja a la que fue: con varias abiertas puede no ser `cajaId`. */
  onGuardado: (cajaId: number) => void;
  /** Billar: los motivos con código (`MOTIVOS_BILLAR`), en vez de los de siempre. */
  motivos?: MotivoMovimiento[];
  /** La etiqueta del motivo que arranca elegido; sin ella, "Otro" (o ninguno, con `motivos`). */
  motivoInicial?: string;
  /** De quién es la caja, cuando no es la de quien registra. */
  deQuien?: { nombre: string; desde: number };
  /** El efectivo que debería haber ahora en esa caja: con él se avisa cómo cambia el cierre. */
  esperado?: number | null;
  /**
   * Supervisión: las cajas abiertas del local. Con más de una se elige a cuál
   * va: antes iba a la del turno que se miraba, que podía ser la del propio
   * administrador, y la cena de la cajera terminaba descontada de otra caja.
   */
  cajas?: CajaDestino[];
}) {
  const conCodigo = motivos != null;
  const lista = motivos ?? MOTIVOS;
  const inicial = lista.find((m) => m.etiqueta === motivoInicial);
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">(inicial?.tipo ?? "EGRESO");
  // Con códigos no se arranca con nada elegido: elegir es justo lo que decide
  // si la plata resta de la ganancia.
  const [motivo, setMotivo] = useState<string | null>(inicial?.etiqueta ?? (conCodigo ? null : OTRO));
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState(inicial && !inicial.detalle ? inicial.etiqueta : "");
  const [destino, setDestino] = useState(cajaId);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const elegido = lista.find((m) => m.etiqueta === motivo);
  const montoNum = parsearMontoO(monto, NaN);
  const montoValido = Number.isFinite(montoNum) && montoNum > 0;

  // La caja elegida y lo que debería tener: la que llega con su esperado no
  // se vuelve a pedir; cualquier otra se pide al elegirla.
  const seElige = cajas != null && cajas.length > 1;
  const otraCaja = seElige ? cajas.find((c) => c.id === destino) : undefined;
  const conocido = destino === cajaId && esperado != null;
  const deOtra = useApi(
    () => (seElige && !conocido ? api.resumenCaja(destino) : Promise.resolve(null)),
    [destino, conocido, seElige],
  );
  const dueno = otraCaja ? { nombre: otraCaja.cajero, desde: otraCaja.desde } : deQuien;
  // Sólo el de la caja elegida: mientras llega el de otra, `useApi` conserva
  // el anterior, y el aviso decía el esperado de una caja con el nombre de otra.
  const deDestino = deOtra.datos?.cajaId === destino ? deOtra.datos.saldoEsperado : null;
  const esperadoDestino = conocido ? esperado : seElige ? deDestino : (esperado ?? null);

  function elegir(m: MotivoMovimiento) {
    setMotivo(m.etiqueta);
    setTipo(m.tipo);
    // Con un motivo de la lista la descripción es la etiqueta, salvo que pida
    // un detalle ("¿En qué?"): ahí se escribe.
    setDescripcion(m.detalle ? "" : m.etiqueta);
    setError("");
  }

  async function guardar() {
    setError("");
    if (conCodigo && !elegido) return setError("Elegí el motivo.");
    const m = parsearMontoO(monto, NaN);
    if (!Number.isFinite(m) || m <= 0) return setError("Poné un monto mayor a cero.");
    const texto = descripcion.trim();
    if (elegido?.detalle?.obligatorio && !texto) return setError(`Falta el detalle: ${elegido.detalle.label}`);
    const final = elegido?.detalle ? texto || elegido.etiqueta : texto;
    if (!final) return setError("Contá para qué fue el movimiento.");

    setEnviando(true);
    try {
      await api.crearMovimientoCaja(destino, {
        tipo,
        monto: m,
        descripcion: final,
        ...(elegido?.origen ? { origen: elegido.origen } : {}),
      });
      onGuardado(destino);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar");
    } finally {
      setEnviando(false);
    }
  }

  const chip = (activo: boolean) =>
    `rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
      activo ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
    }`;

  return (
    <Modal
      abierto
      titulo="Movimiento de efectivo"
      subtitulo="Entradas y salidas que no son ventas"
      onClose={onClose}
      // Los motivos del billar van en dos grupos y necesitan más ancho; el de
      // siempre queda como estaba.
      ancho={conCodigo ? "max-w-md" : "max-w-sm"}
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
        {/* Supervisión con más de una caja abierta: a cuál va. */}
        {otraCaja ? (
          <Campo label="¿En qué caja?">
            <Select value={destino} onChange={(e) => setDestino(Number(e.target.value))}>
              {cajas!.map((c) => (
                <option key={c.id} value={c.id}>
                  Caja de {c.cajero} · abierta desde {desdeCuando(c.desde)}
                </option>
              ))}
            </Select>
          </Campo>
        ) : (
          // Supervisión: a qué caja va, porque quien registra no es su dueño.
          dueno && (
            <p className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-[13px] text-texto-2">
              <Icon name="user" size={16} />
              <span>
                Va a la caja de <b className="text-texto">{dueno.nombre}</b>, abierta desde {desdeCuando(dueno.desde)}
              </span>
            </p>
          )
        )}

        {/* Los motivos, que además deciden el sentido: elegir "Sencillo" y
            tener que marcar aparte que es un ingreso es pedirle al cajero que
            traduzca algo que el motivo ya dice. */}
        <Campo label="Motivo">
          {conCodigo ? (
            // Billar: agrupados por sentido, para leerlos de un vistazo.
            <div className="space-y-2.5">
              {(["EGRESO", "INGRESO"] as const).map((sentido) => {
                const deEste = lista.filter((m) => m.tipo === sentido);
                if (!deEste.length) return null;
                const titulo = sentido === "EGRESO" ? "Sale de la caja" : "Entra a la caja";
                return (
                  <div key={sentido} role="group" aria-label={titulo}>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-texto-3">{titulo}</p>
                    <div className="flex flex-wrap gap-2">
                      {deEste.map((m) => (
                        <button
                          key={m.etiqueta}
                          type="button"
                          aria-pressed={motivo === m.etiqueta}
                          onClick={() => elegir(m)}
                          className={chip(motivo === m.etiqueta)}
                        >
                          {m.etiqueta}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {lista.map((m) => (
                <button key={m.etiqueta} type="button" onClick={() => elegir(m)} className={chip(motivo === m.etiqueta)}>
                  {m.etiqueta}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMotivo(OTRO);
                  setDescripcion("");
                }}
                className={chip(motivo === OTRO)}
              >
                Otro
              </button>
            </div>
          )}
          {motivo && (
            <p className={`mt-1.5 text-xs font-semibold ${tipo === "INGRESO" ? "text-primary-700" : "text-danger-text"}`}>
              {tipo === "INGRESO" ? "Entra plata a la caja" : "Sale plata de la caja"}
            </p>
          )}
        </Campo>

        {/* Billar: lo que hace con la ganancia del mes, para no cargar un gasto
            dos veces ni restar plata que sigue siendo del dueño. */}
        {elegido?.efecto && (
          <p className="flex gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[12.5px] leading-snug text-texto-2">
            <span className="mt-0.5 shrink-0 text-texto-3">
              <Icon name="info" size={15} />
            </span>
            <span>{elegido.efecto}</span>
          </p>
        )}

        {motivo === OTRO && (
          <Campo label="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as "INGRESO" | "EGRESO")}>
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

        {/* Billar: el detalle del motivo ("¿En qué?" de un gasto). */}
        {elegido?.detalle && (
          <Campo label={elegido.detalle.label}>
            <Input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={elegido.detalle.placeholder}
              maxLength={200}
            />
          </Campo>
        )}

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
        {dueno && esperadoDestino != null && montoValido && motivo && (
          <p className="flex gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-[13px] leading-snug text-violet-900">
            <span className="mt-0.5 shrink-0">
              <Icon name="info" size={16} />
            </span>
            <span>
              En el cierre de {dueno.nombre} el efectivo esperado pasa de <b>{fmtMoney(esperadoDestino)}</b> a{" "}
              <b>{fmtMoney(esperadoDestino + (tipo === "INGRESO" ? montoNum : -montoNum))}</b>.
            </span>
          </p>
        )}

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

/**
 * "las 19:23" si abrió hoy; "el 23/10 a las 16:00" si viene de otro día: una
 * caja que quedó abierta desde el jueves se leía como abierta hoy a esa hora.
 */
function desdeCuando(ms: number): string {
  const d = new Date(ms);
  const hora = fmtHora(d);
  if (d.toDateString() === new Date().toDateString()) return `las ${hora}`;
  const dosCifras = (n: number) => String(n).padStart(2, "0");
  return `el ${dosCifras(d.getDate())}/${dosCifras(d.getMonth() + 1)} a las ${hora}`;
}
