import { useState } from "react";
import { Boton, Cargando, ErrorMsg, Modal } from "../../../components/ui";
import { fmtMoney } from "../../../lib/format";
import { tienePermiso } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import type { CobroApi } from "../../billar/api";
import { CobrosPorDia, IconoMedio } from "../../billar/supervision/Cobros";
import { porLaForma, tituloDeLaForma } from "../../billar/supervision/Cobros.datos";
import { ContenidoDetalleVenta } from "../../billar/supervision/DetalleVenta";
import { useScrollDelDialogo } from "../../billar/supervision/useScrollDelDialogo";
import ListaProductosVendidos from "../../pos/ListaProductosVendidos";
import { apiReportes, type CobrosDelMedioApi } from "../api";
import { useReporte } from "../contexto";
import { plural } from "../formato";
import { prosaRango } from "../periodo";
import { Nota, Segmentos } from "../ui";

type Pestana = "cobros" | "productos";

const PESTANAS = [
  ["cobros", "Cobros"],
  ["productos", "Productos"],
] as const;

/**
 * "Cobrado por QR" (26-oct): lo cobrado con un medio en el período, cobro por
 * cobro y día por día, y qué productos se pagaron con él. Se abre tocando un
 * medio en Métodos de pago, sólo en un billar.
 *
 * Es para conciliar. Miguel, el administrador, veía "QR · 3 cobros · Bs 120" y
 * no sabía cuáles eran ("No me sale de qué producto"): compara cada QR contra
 * el extracto de su banco, por hora y monto, y uno que figura acá y no llegó
 * al banco es plata que falta. Por eso los cobros van por día de la jornada
 * (el QR de la 1:50 es de la noche anterior, como lo busca él) con lo cobrado
 * cada día.
 *
 * Los productos de una venta pagada parte y parte no se reparten entre los
 * medios: un pago no apunta a un renglón de la venta, y prorratear inventaría
 * un dato. Van aparte, con lo que entró por este medio.
 */
export default function CobrosDelMedio({
  medio,
  monto,
  cobros,
  onClose,
}: {
  /** El nombre tal como lo trae Métodos de pago ("QR", "Efectivo"). */
  medio: string;
  /** El monto y los cobros de la fila: arriba van los mismos números. */
  monto: number;
  cobros?: number;
  onClose: () => void;
}) {
  const { rango, periodo, corteMin } = useReporte();
  const { usuario } = useAuth();
  // El detalle de la venta lo da la ruta de Supervisión, que es del administrador del billar.
  const abreVentas = tienePermiso(usuario, "billar.admin");
  const [pestana, setPestana] = useState<Pestana>("cobros");
  const [venta, setVenta] = useState<number | null>(null);
  const { raiz, recordar } = useScrollDelDialogo(venta);
  const primera = useApi(() => apiReportes.cobrosDelMedio(rango, medio), [rango.desde, rango.hasta, rango.sucursalId, medio]);
  // Las tandas que se suman con "Ver más": un mes de QR de un billar movido no entra en una.
  const [mas, setMas] = useState<{ cobros: CobroApi[]; tanda: CobrosDelMedioApi["tanda"] } | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [errorMas, setErrorMas] = useState("");

  const d = primera.datos;
  const lista = d ? [...d.cobros, ...(mas?.cobros ?? [])] : [];
  const tanda = mas?.tanda ?? d?.tanda;
  const siguiente = tanda?.siguiente ?? null;
  const hayMas = siguiente != null;
  const quedan = tanda?.quedan ?? 0;

  const verMas = async () => {
    if (!siguiente || pidiendo) return;
    setPidiendo(true);
    setErrorMas("");
    try {
      const r = await apiReportes.cobrosDelMedio(rango, medio, siguiente);
      // Por las dudas, nunca dos veces el mismo cobro: se sumaría dos veces en
      // el total del día, que es el que se coteja con el banco.
      setMas((m) => {
        const vistos = new Set([...(d?.cobros ?? []), ...(m?.cobros ?? [])].map((c) => c.id));
        return { cobros: [...(m?.cobros ?? []), ...r.cobros.filter((c) => !vistos.has(c.id))], tanda: r.tanda };
      });
    } catch (err) {
      setErrorMas(err instanceof Error && err.message ? err.message : "No se pudieron traer más cobros.");
    } finally {
      setPidiendo(false);
    }
  };
  const abrir = abreVentas
    ? (id: number) => {
        recordar();
        setVenta(id);
      }
    : undefined;
  // Por el nombre exacto: es lo que filtra la lista, y con dos QR cada uno dice cuál es.
  const por = porLaForma(medio);
  // Arriba, los números de la fila mientras carga y después los del período
  // que se lista abajo: la fila pudo cargarse un rato antes, y "3 cobros en 5
  // ventas" arriba con 5 cobros abajo no cuadraba.
  const montoArriba = d?.totales.monto ?? monto;
  const cobrosArriba = d?.totales.cobros ?? cobros;

  return (
    <Modal
      abierto
      titulo={tituloDeLaForma(medio)}
      subtitulo={prosaRango(periodo.desde, periodo.hasta)}
      onClose={onClose}
      ancho="max-w-2xl"
      acciones={
        <Boton variante="ghost" onClick={onClose}>
          Cerrar
        </Boton>
      }
    >
      <div ref={raiz}>
        {venta != null && (
          <ContenidoDetalleVenta
            consulta={{ venta }}
            ahora={Date.now()}
            volver={{ texto: "Volver a los cobros", onVolver: () => setVenta(null) }}
          />
        )}
        {/* Escondida y no desmontada mientras se mira una venta: al volver,
            siguen las páginas que ya se pidieron y la pestaña elegida. */}
        <div hidden={venta != null} className="space-y-4 text-[13px]">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3">
            <IconoMedio medio={medio} size={40} />
            <div className="min-w-0">
              <p className="text-[20px] font-extrabold leading-tight tabular-nums text-texto">{fmtMoney(montoArriba)}</p>
              <p className="text-texto-3">
                {cobrosArriba != null ? plural(cobrosArriba, "cobro", "cobros") : "Cobrado en el período"}
                {d && d.totales.ventas > 0 && <> · en {plural(d.totales.ventas, "venta", "ventas")}</>}
                {d && d.totales.mixtas > 0 && (
                  <> · {plural(d.totales.mixtas, "pagada parte y parte", "pagadas parte y parte")}</>
                )}
              </p>
            </div>
          </div>

          <div>
            <Segmentos valor={pestana} opciones={PESTANAS} onChange={setPestana} />
          </div>

          {primera.error ? (
            <ErrorMsg onReintentar={primera.recargar}>{primera.error}</ErrorMsg>
          ) : !d ? (
            <Cargando texto="Trayendo los cobros…" />
          ) : pestana === "cobros" ? (
            <div className="space-y-3">
              {lista.length === 0 ? (
                <p className="py-6 text-center text-texto-3">No hubo cobros {por} en este período.</p>
              ) : (
                <CobrosPorDia cobros={lista} corteMin={rango.corteMin ?? corteMin ?? 0} onAbrir={abrir} incompleto={hayMas} />
              )}
              {errorMas && <ErrorMsg onReintentar={() => void verMas()}>{errorMas}</ErrorMsg>}
              {hayMas && (
                <div className="text-center">
                  <Boton variante="ghost" disabled={pidiendo} onClick={() => void verMas()}>
                    {pidiendo ? "Trayendo…" : `Ver más · quedan ${quedan}`}
                  </Boton>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <section aria-label={`Pagados sólo ${por}`} className="space-y-2">
                <h3 className="text-[12px] font-bold uppercase tracking-wider text-texto-2">Pagados sólo {por}</h3>
                {d.productos?.solo ? (
                  <ListaProductosVendidos d={d.productos.solo} />
                ) : (
                  <p className="text-texto-3">Ninguna venta del período se pagó sólo {por}.</p>
                )}
              </section>
              {d.productos?.mixtas && (
                <section aria-label="En ventas pagadas parte y parte" className="space-y-2 border-t border-borde-soft pt-4">
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-texto-2">En ventas pagadas parte y parte</h3>
                  <Nota>
                    De estas ventas entraron <b>{fmtMoney(d.productos.mixtasMonto)}</b> {por}. No se puede decir qué producto pagó cada
                    medio.
                  </Nota>
                  <ListaProductosVendidos d={d.productos.mixtas} />
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
