import { useState } from "react";
import { Icon } from "../../../components/Icon";
import { Boton, ErrorMsg, Input } from "../../../components/ui";
import { apiExtras, type PropinaInput } from "../../../lib/belleza/apiExtras";
import { cobraConVale, cobraPropinas, type ContextoExtras } from "../../../lib/belleza/capacidades";
import { aCentavos, parsearMontoO } from "../../../lib/dinero";
import { fmtMoney } from "../../../lib/format";
import type { FormaPago, PagoInput } from "../../../types";

/** A dos decimales, como lo guarda el backend. */
const redondear = aCentavos;

/** Un profesional de la venta, para su propina. */
export interface ProfesionalCobro {
  id: number;
  nombre: string;
}

interface ValeAplicado {
  codigo: string;
  saldo: number;
  formaPagoId: number;
}

interface PropinaEditada {
  monto: string;
  medio: "EFECTIVO" | "QR";
}

function buscarForma(formas: FormaPago[], nombre: string) {
  return formas.find((f) => f.nombre.toLowerCase() === nombre.toLowerCase());
}

/**
 * Lo de la fase 4 de belleza dentro del cobro: pagar parte (o todo) con un
 * vale, y anotar la propina de cada profesional.
 *
 * - El vale es un pago más (forma "Gift card" + código): baja lo que queda por
 *   cubrir con efectivo o QR. El backend descuenta el saldo y valida todo.
 * - La propina NO es parte del cobro: no suma al total ni a los pagos. Viaja
 *   aparte (`propinas`), y la que se deja en efectivo se suma a lo que hay que
 *   recibir en mano (el cliente suele pagar todo junto y pedir el cambio).
 *
 * Sin la feature (o fuera de belleza) no hay bloque, y el cobro de siempre no
 * cambia en nada: `montoVale` 0, sin pagos ni propinas extra.
 */
export function useExtrasCobro({
  ctx,
  total,
  profesionales,
  formasPago,
  permiteQr,
}: {
  ctx: ContextoExtras;
  total: number;
  profesionales: ProfesionalCobro[];
  formasPago: FormaPago[];
  permiteQr: boolean;
}) {
  // Una venta en 0 (todo con paquete) no tiene qué pagar con un vale: al
  // cobro se llega sólo por la propina (QA PER-10).
  const conVale = cobraConVale(ctx) && total > 0;
  const conPropinas = cobraPropinas(ctx) && profesionales.length > 0;

  const [abiertoVale, setAbiertoVale] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [vale, setVale] = useState<ValeAplicado | null>(null);
  const [usar, setUsar] = useState("");
  const [errorVale, setErrorVale] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [propinas, setPropinas] = useState<Record<number, PropinaEditada>>({});

  const montoVale = vale ? Math.min(redondear(parsearMontoO(usar)), vale.saldo, total) : 0;

  const formaEfectivo = buscarForma(formasPago, "Efectivo");
  const formaQr = buscarForma(formasPago, "QR");

  const listaPropinas: (PropinaInput & { efectivo: boolean })[] = [];
  for (const p of profesionales) {
    const e = propinas[p.id];
    const monto = redondear(parsearMontoO(e?.monto));
    if (!e || !(monto > 0)) continue;
    const forma = e.medio === "QR" ? formaQr : formaEfectivo;
    if (!forma) continue;
    listaPropinas.push({ recursoId: p.id, monto, formaPagoId: forma.id, efectivo: e.medio !== "QR" });
  }
  const propinasEfectivo = redondear(
    listaPropinas.filter((p) => p.efectivo).reduce((s, p) => s + p.monto, 0),
  );

  const aplicar = async () => {
    setErrorVale("");
    if (!codigo.trim()) return;
    setBuscando(true);
    try {
      const [v, forma] = await Promise.all([apiExtras.consultarVale(codigo), apiExtras.formaPagoVale()]);
      if (v.estado !== "USABLE") {
        setErrorVale(
          v.estado === "VENCIDA"
            ? `El vale venció el ${v.venceEn?.split("-").reverse().join("/")}`
            : v.estado === "ANULADA"
              ? "El vale está anulado"
              : "El vale no tiene saldo",
        );
        return;
      }
      setVale({ codigo: v.codigo, saldo: v.saldo, formaPagoId: forma.id });
      setUsar(String(Math.min(v.saldo, total)));
    } catch (e) {
      setErrorVale(e instanceof Error ? e.message : "No se encontró el vale");
    } finally {
      setBuscando(false);
    }
  };

  const quitarVale = () => {
    setVale(null);
    setUsar("");
    setCodigo("");
    setErrorVale("");
  };

  const pagosVale: PagoInput[] =
    vale && montoVale > 0
      ? [{ formaPagoId: vale.formaPagoId, monto: montoVale, giftCardCodigo: vale.codigo }]
      : [];

  const ui =
    conVale || conPropinas ? (
      <div className="space-y-3">
        {conVale && (
          <div className="rounded-2xl border border-borde bg-white p-4">
            {!vale ? (
              abiertoVale ? (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void aplicar();
                  }}
                >
                  <p className="text-[13px] font-semibold text-texto-2">Pagar con gift card</p>
                  <div className="flex gap-2">
                    <Input
                      aria-label="Código del vale"
                      placeholder="K7QM-2XPA"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                      className="font-mono tracking-wider"
                      autoFocus
                    />
                    <Boton type="submit" variante="soft" disabled={buscando || !codigo.trim()}>
                      {buscando ? "…" : "Aplicar"}
                    </Boton>
                  </div>
                  <ErrorMsg>{errorVale}</ErrorMsg>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAbiertoVale(true)}
                  className="flex w-full items-center gap-2 text-[13px] font-semibold text-primary-700"
                >
                  <Icon name="gift" size={17} /> Pagar con gift card
                </button>
              )
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] text-texto-2">
                    <Icon name="gift" size={15} className="mr-1 inline" />
                    Vale <strong className="font-mono">{vale.codigo}</strong> · saldo {fmtMoney(vale.saldo)}
                  </p>
                  <button
                    type="button"
                    onClick={quitarVale}
                    className="rounded-lg px-2 py-1 text-[12px] font-semibold text-texto-3 hover:bg-muted"
                  >
                    Quitar
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-texto-2">Se usan</span>
                  <div className="w-32">
                    <Input
                      aria-label="Monto del vale"
                      type="number"
                      value={usar}
                      onChange={(e) => setUsar(e.target.value)}
                    />
                  </div>
                  <span className="text-[12px] text-texto-3">quedan {fmtMoney(redondear(vale.saldo - montoVale))}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {conPropinas && (
          <div className="space-y-2 rounded-2xl border border-borde bg-white p-4">
            <p className="text-[13px] font-semibold text-texto-2">
              Propina <span className="font-normal text-texto-3">(aparte: no suma a la venta)</span>
            </p>
            {profesionales.map((p) => {
              const e = propinas[p.id] ?? { monto: "", medio: "EFECTIVO" as const };
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-texto">{p.nombre}</span>
                  <div className="w-24">
                    <Input
                      aria-label={`Propina para ${p.nombre}`}
                      type="number"
                      value={e.monto}
                      placeholder="0,00"
                      onChange={(ev) => setPropinas((x) => ({ ...x, [p.id]: { ...e, monto: ev.target.value } }))}
                    />
                  </div>
                  {permiteQr && (
                    <div className="flex overflow-hidden rounded-xl border border-borde text-[12px] font-semibold">
                      {(["EFECTIVO", "QR"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={e.medio === m}
                          onClick={() => setPropinas((x) => ({ ...x, [p.id]: { ...e, medio: m } }))}
                          className={`px-2.5 py-2 ${e.medio === m ? "bg-primary-50 text-primary-700" : "bg-white text-texto-3"}`}
                        >
                          {m === "EFECTIVO" ? "Efectivo" : "QR"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    ) : null;

  return {
    ui,
    montoVale,
    pagosVale,
    propinas: listaPropinas.map(({ recursoId, monto, formaPagoId }) => ({ recursoId, monto, formaPagoId })),
    propinasEfectivo,
  };
}
