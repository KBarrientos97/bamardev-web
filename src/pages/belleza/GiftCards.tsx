import { useState } from "react";
import { EncabezadoPagina } from "../../components/filtros";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Kpi,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../../components/ui";
import { api } from "../../lib/api";
import {
  apiExtras,
  type EstadoVale,
  type FiltroVales,
  type Vale,
  type ValeDetalle,
} from "../../lib/belleza/apiExtras";
import { anulaVales } from "../../lib/belleza/capacidades";
import { useExtras } from "../../lib/belleza/useExtras";
import { cubre, parsearMontoO, vuelto } from "../../lib/dinero";
import { fmtFecha, fmtFechaHora, fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";

/**
 * ¿El vale se usó de verdad? Neto por venta: un uso cuya venta se anuló (y le
 * devolvió el saldo) no cuenta, y ese vale se puede anular (QA N2-18).
 */
function usadoDeVerdad(movimientos: { tipo: string; monto: number; venta: { id: number } | null }[]) {
  const neto = new Map<number, number>();
  for (const m of movimientos) {
    if ((m.tipo !== "USO" && m.tipo !== "DEVOLUCION") || !m.venta) continue;
    neto.set(m.venta.id, (neto.get(m.venta.id) ?? 0) + m.monto);
  }
  return [...neto.values()].some((n) => n < -0.004);
}

const mensaje = (e: unknown, porDefecto = "No se pudo completar") =>
  e instanceof Error ? e.message : porDefecto;

const TEXTO_ESTADO: Record<EstadoVale, string> = {
  USABLE: "Con saldo",
  AGOTADA: "Agotada",
  VENCIDA: "Vencida",
  ANULADA: "Anulada",
};

const TONO_ESTADO: Record<EstadoVale, "verde" | "gris" | "amarillo" | "rojo"> = {
  USABLE: "verde",
  AGOTADA: "gris",
  VENCIDA: "amarillo",
  ANULADA: "rojo",
};

const FILTROS: { valor: FiltroVales; texto: string }[] = [
  { valor: "USABLES", texto: "Con saldo" },
  { valor: "AGOTADAS", texto: "Agotadas" },
  { valor: "VENCIDAS", texto: "Vencidas" },
  { valor: "ANULADAS", texto: "Anuladas" },
  { valor: "TODAS", texto: "Todas" },
];

const TEXTO_MOVIMIENTO: Record<string, string> = {
  EMISION: "Venta del vale",
  USO: "Usado en",
  DEVOLUCION: "Devuelto (venta anulada)",
  ANULACION: "Vale anulado",
};

/** "2026-12-31" → "31/12/2026" (fecha del negocio, sin hora). */
const dia = (f: string | null) => (f ? f.split("-").reverse().join("/") : "");

export function EstadoValeBadge({ estado }: { estado: EstadoVale }) {
  return <Badge tono={TONO_ESTADO[estado]}>{TEXTO_ESTADO[estado]}</Badge>;
}

/**
 * Gift cards (feature `gift_cards`): vender un vale, consultar su saldo y el
 * listado. Cobrar CON un vale se hace en el punto de venta, como una forma de
 * pago más.
 *
 * Vender un vale no es una venta: el efectivo entra a la caja del turno como
 * un ingreso, y el servicio se cuenta como venta recién cuando el vale se usa.
 */
export default function GiftCards() {
  const ctx = useExtras();
  const [filtro, setFiltro] = useState<FiltroVales>("USABLES");
  const [q, setQ] = useState("");
  const lista = useApi(() => apiExtras.vales(filtro, q.trim() || undefined), [filtro, q]);
  const [vender, setVender] = useState(false);
  const [vendido, setVendido] = useState<(Vale & { cambio: number }) | null>(null);
  const [verId, setVerId] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Gift cards"
        subtitulo="Vales con saldo que el cliente usa para pagar, entero o en partes."
        accion={
          <Boton icono="plus" onClick={() => setVender(true)}>
            Vender vale
          </Boton>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi
          etiqueta="Saldo por usar"
          valor={fmtMoney(lista.datos?.saldoVigente ?? 0)}
          icono="gift"
          pie={`${lista.datos?.vigentes ?? 0} vales con saldo · es servicio que el negocio debe`}
        />
        <ConsultarSaldo onVer={setVerId} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Estado">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              role="tab"
              aria-selected={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                filtro === f.valor
                  ? "border-primary bg-primary-50 text-primary-700"
                  : "border-borde bg-white text-texto-2 hover:bg-muted"
              }`}
            >
              {f.texto}
            </button>
          ))}
        </div>
        <div className="min-w-[180px] flex-1">
          <Input
            aria-label="Buscar vale"
            placeholder="Código o nombre"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {lista.cargando && !lista.datos ? (
        <Cargando />
      ) : lista.error ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : !lista.datos?.vales.length ? (
        <div className="card">
          <Vacio icono="gift" titulo="No hay vales acá" texto="Vendé uno con «Vender vale»." />
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Vales">
          {lista.datos.vales.map((v) => (
            <li key={v.id}>
              <button
                onClick={() => setVerId(v.id)}
                className="card flex w-full flex-wrap items-center gap-3 p-3.5 text-left hover:bg-muted"
              >
                <div className="min-w-0 flex-[1_1_220px]">
                  <p className="font-mono text-[15px] font-bold tracking-wider text-texto">{v.codigo}</p>
                  <p className="truncate text-[12px] text-texto-3">
                    {v.beneficiario ? `Para ${v.beneficiario}` : "Sin nombre"}
                    {v.venceEn ? ` · vence ${dia(v.venceEn)}` : " · no vence"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-texto">{fmtMoney(v.saldo)}</p>
                  <p className="text-[12px] text-texto-3">de {fmtMoney(v.montoInicial)}</p>
                </div>
                <EstadoValeBadge estado={v.estado} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <VenderVale
        abierto={vender}
        onClose={() => setVender(false)}
        onVendido={(v) => {
          setVender(false);
          setVendido(v);
          lista.recargar();
        }}
      />
      <ValeVendido vale={vendido} onClose={() => setVendido(null)} />
      <DetalleVale
        id={verId}
        puedeAnular={!!ctx && anulaVales(ctx)}
        onClose={() => setVerId(null)}
        onCambio={lista.recargar}
      />
    </div>
  );
}

function ConsultarSaldo({ onVer }: { onVer: (id: number) => void }) {
  const [codigo, setCodigo] = useState("");
  const [vale, setVale] = useState<Vale | null>(null);
  const [error, setError] = useState("");
  const [buscando, setBuscando] = useState(false);
  const consultar = async () => {
    setError("");
    setVale(null);
    if (!codigo.trim()) return;
    setBuscando(true);
    try {
      setVale(await apiExtras.consultarVale(codigo));
    } catch (e) {
      setError(mensaje(e, "No se encontró el vale"));
    } finally {
      setBuscando(false);
    }
  };
  return (
    <div className="card space-y-2 p-4">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-texto-4">Consultar saldo</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void consultar();
        }}
      >
        <Input
          aria-label="Código del vale"
          placeholder="K7QM-2XPA"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          className="font-mono tracking-wider"
        />
        <Boton type="submit" variante="soft" disabled={buscando || !codigo.trim()}>
          Ver
        </Boton>
      </form>
      <ErrorMsg>{error}</ErrorMsg>
      {vale && (
        <button
          onClick={() => onVer(vale.id)}
          className="flex w-full items-center justify-between rounded-xl bg-muted px-3 py-2 text-left"
        >
          <span className="text-sm text-texto-2">
            Saldo <strong className="text-texto">{fmtMoney(vale.saldo)}</strong>
          </span>
          <EstadoValeBadge estado={vale.estado} />
        </button>
      )}
    </div>
  );
}

function VenderVale({
  abierto,
  onClose,
  onVendido,
}: {
  abierto: boolean;
  onClose: () => void;
  onVendido: (v: Vale & { cambio: number }) => void;
}) {
  const formas = useApi(() => (abierto ? api.getFormasPago() : Promise.resolve([])), [abierto]);
  const [monto, setMonto] = useState("");
  const [formaId, setFormaId] = useState<number | "">("");
  const [recibido, setRecibido] = useState("");
  const [vence, setVence] = useState("");
  const [beneficiario, setBeneficiario] = useState("");
  const [comprador, setComprador] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Una clave por formulario abierto: el doble toque no vende dos vales.
  const [clave, setClave] = useState(() => crypto.randomUUID());

  const lista = formas.datos ?? [];
  const forma = lista.find((f) => f.id === formaId) ?? lista[0];
  const efectivo = !!forma && forma.nombre.toLowerCase().includes("efectivo");
  const montoNum = parsearMontoO(monto);
  const recibidoNum = recibido ? parsearMontoO(recibido) : montoNum;

  const limpiar = () => {
    setMonto("");
    setRecibido("");
    setVence("");
    setBeneficiario("");
    setComprador("");
    setError("");
    setClave(crypto.randomUUID());
  };

  const vender = async () => {
    setError("");
    if (!(montoNum > 0)) return setError("Poné el monto del vale.");
    if (!forma) return setError("El negocio no tiene formas de pago cargadas.");
    if (efectivo && !cubre(recibidoNum, montoNum)) return setError("Lo recibido no alcanza.");
    setGuardando(true);
    try {
      const v = await apiExtras.emitirVale({
        monto: montoNum,
        formaPagoId: forma.id,
        ...(efectivo ? { recibido: recibidoNum } : {}),
        ...(vence ? { venceEn: vence } : {}),
        ...(beneficiario.trim() ? { beneficiario: beneficiario.trim() } : {}),
        ...(comprador.trim() ? { comprador: comprador.trim() } : {}),
        clienteRequestId: clave,
      });
      limpiar();
      onVendido(v);
    } catch (e) {
      setError(mensaje(e, "No se pudo vender el vale"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo="Vender vale"
      subtitulo="El cobro entra a tu caja del turno."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={vender} disabled={guardando}>
            {guardando ? "Vendiendo…" : `Cobrar ${fmtMoney(montoNum)}`}
          </Boton>
        </>
      }
    >
      <div className="space-y-3.5">
        <ErrorMsg>{error}</ErrorMsg>
        <Campo label="Monto del vale">
          <Input
            aria-label="Monto del vale"
            type="number"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0,00"
            className="text-lg font-bold"
          />
        </Campo>
        <Campo label="Cómo paga">
          <Select
            aria-label="Cómo paga"
            value={forma?.id ?? ""}
            onChange={(e) => setFormaId(Number(e.target.value))}
          >
            {lista.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </Select>
        </Campo>
        {efectivo && (
          <Campo
            label="Efectivo recibido"
            hint={recibido ? `Cambio ${fmtMoney(vuelto(recibidoNum, montoNum))}` : "Vacío = justo"}
          >
            <Input
              aria-label="Efectivo recibido"
              type="number"
              value={recibido}
              onChange={(e) => setRecibido(e.target.value)}
              placeholder="0,00"
            />
          </Campo>
        )}
        <Campo label="Vence (opcional)" hint="Último día en que se puede usar.">
          <Input aria-label="Vence" type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
        </Campo>
        <Campo label="Para quién (opcional)">
          <Input
            aria-label="Para quién"
            value={beneficiario}
            onChange={(e) => setBeneficiario(e.target.value)}
            maxLength={120}
            placeholder="María"
          />
        </Campo>
        <Campo label="Quién lo compra (opcional)">
          <Input
            aria-label="Quién lo compra"
            value={comprador}
            onChange={(e) => setComprador(e.target.value)}
            maxLength={120}
          />
        </Campo>
      </div>
    </Modal>
  );
}

function ValeVendido({ vale, onClose }: { vale: (Vale & { cambio: number }) | null; onClose: () => void }) {
  const [aviso, setAviso] = useAviso(3000);
  const copiar = async () => {
    if (!vale) return;
    try {
      await navigator.clipboard.writeText(vale.codigo);
      setAviso("Código copiado");
    } catch {
      setAviso(`Anotá el código: ${vale.codigo}`);
    }
  };
  return (
    <Modal
      abierto={!!vale}
      titulo="Vale vendido"
      onClose={onClose}
      acciones={
        <Boton onClick={onClose} className="w-full">
          Listo
        </Boton>
      }
    >
      {vale && (
        <div className="space-y-3 text-center">
          <p className="text-[13px] text-texto-3">Código para el cliente</p>
          <p className="font-mono text-3xl font-extrabold tracking-[0.2em] text-texto">{vale.codigo}</p>
          <p className="text-sm text-texto-2">
            Saldo {fmtMoney(vale.saldo)}
            {vale.venceEn ? ` · vence ${dia(vale.venceEn)}` : " · no vence"}
          </p>
          {vale.cambio > 0 && (
            <p className="rounded-xl bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700">
              Cambio {fmtMoney(vale.cambio)}
            </p>
          )}
          <Boton variante="ghost" onClick={copiar}>
            Copiar código
          </Boton>
          <AvisoOk>{aviso}</AvisoOk>
        </div>
      )}
    </Modal>
  );
}

function DetalleVale({
  id,
  puedeAnular,
  onClose,
  onCambio,
}: {
  id: number | null;
  puedeAnular: boolean;
  onClose: () => void;
  onCambio: () => void;
}) {
  const detalle = useApi<ValeDetalle | null>(
    () => (id ? apiExtras.vale(id) : Promise.resolve(null)),
    [id],
  );
  const [anulando, setAnulando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso();
  const v = detalle.datos;
  const sinUsar = !!v && v.estado !== "ANULADA" && !usadoDeVerdad(v.movimientos);

  const anular = async () => {
    if (!v) return;
    setError("");
    setProcesando(true);
    try {
      const r = await apiExtras.anularVale(v.id, "Anulado desde Gift cards");
      detalle.setDatos(r);
      onCambio();
      setAviso(
        r.devolucion.desdeCaja
          ? `Devolvé ${fmtMoney(r.devolucion.monto)} en efectivo: salió de la caja${r.devolucion.cajaId ? ` #${r.devolucion.cajaId}` : ""}.`
          : `Devolvé ${fmtMoney(r.devolucion.monto)} por ${r.devolucion.formaPago ?? "el mismo medio"}.`,
      );
    } catch (e) {
      setError(mensaje(e, "No se pudo anular"));
    } finally {
      setProcesando(false);
      setAnulando(false);
    }
  };

  return (
    <Modal abierto={id !== null} titulo={v ? `Vale ${v.codigo}` : "Vale"} onClose={onClose}>
      {!v ? (
        <Cargando />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-extrabold text-texto">{fmtMoney(v.saldo)}</p>
              <p className="text-[13px] text-texto-3">
                de {fmtMoney(v.montoInicial)} · pagado con {v.formaPago ?? "—"}
              </p>
            </div>
            <EstadoValeBadge estado={v.estado} />
          </div>
          <p className="text-[13px] text-texto-2">
            {v.beneficiario ? `Para ${v.beneficiario}. ` : ""}
            {v.comprador ? `Lo compró ${v.comprador}. ` : ""}
            {v.venceEn ? `Vence el ${dia(v.venceEn)}.` : "No vence."}
          </p>
          <div>
            <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-texto-3">Historial</p>
            <ol className="space-y-1.5 text-[13px]" aria-label="Historial del vale">
              {v.movimientos.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <span className="text-texto-2">
                    {TEXTO_MOVIMIENTO[m.tipo] ?? m.tipo}
                    {m.venta && m.tipo === "USO" ? ` ${m.venta.comprobante ?? `venta ${m.venta.id}`}` : ""}
                    <span className="block text-[11px] text-texto-4">{fmtFechaHora(m.fecha)}</span>
                  </span>
                  <span className={m.monto < 0 ? "font-semibold text-danger-text" : "font-semibold text-texto"}>
                    {m.monto < 0 ? "−" : "+"}
                    {fmtMoney(Math.abs(m.monto))}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          {v.anuladaEn && (
            <p className="text-[12px] text-texto-3">
              Anulado el {fmtFecha(v.anuladaEn)}
              {v.motivoAnulacion ? `: ${v.motivoAnulacion}` : ""}
            </p>
          )}
          <ErrorMsg>{error}</ErrorMsg>
          <AvisoOk>{aviso}</AvisoOk>
          {puedeAnular && sinUsar && (
            <Boton variante="ghost" onClick={() => setAnulando(true)} className="w-full">
              Anular vale
            </Boton>
          )}
          <Confirmar
            abierto={anulando}
            titulo="¿Anular el vale?"
            texto={`Queda sin saldo y se devuelven ${fmtMoney(v.saldo)} al cliente.`}
            etiquetaOk="Anular"
            peligroso
            procesando={procesando}
            onOk={anular}
            onCancel={() => setAnulando(false)}
          />
        </div>
      )}
    </Modal>
  );
}
