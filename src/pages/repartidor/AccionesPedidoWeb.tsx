import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, ErrorMsg } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { urlRuta } from "../../lib/mapa";
import { urlWaze } from "../../lib/pedidosWeb/navegacion";
import { apiPedidosWeb } from "../../lib/pedidosWeb/apiPrivada";
import type { PedidoWebDeEntrega } from "../../lib/pedidosWeb/tipos";

/**
 * Lo que suma un pedido que vino de la página (13-nov): navegar hasta el pin
 * del cliente (Google Maps o Waze), copiar la dirección y «Ya salí del local»,
 * que le muestra al cliente la moto en su mapa.
 */
export default function AccionesPedidoWeb({
  ventaId,
  direccion,
  web,
  onSalio,
}: {
  ventaId: number;
  direccion: string | null;
  web: PedidoWebDeEntrega;
  /** Tocó «Ya salí del local»: la lista se refresca y empieza a compartirse la posición. */
  onSalio: () => void;
}) {
  const [salio, setSalio] = useState<string | null>(web.salioEn);
  const [saliendo, setSaliendo] = useState(false);
  const [copiada, setCopiada] = useState(false);
  const [error, setError] = useState("");
  const pin = web.latitud != null && web.longitud != null ? { lat: web.latitud, lng: web.longitud } : null;
  const boton =
    "flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-3 text-[13px] font-semibold text-texto-2 hover:bg-muted";

  async function yaSali() {
    setError("");
    setSaliendo(true);
    try {
      await apiPedidosWeb.sali(ventaId);
      setSalio(new Date().toISOString());
      onSalio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo avisar la salida");
    } finally {
      setSaliendo(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(direccion ?? "");
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2500);
    } catch {
      setError("No se pudo copiar. Mantené apretada la dirección para copiarla.");
    }
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-primary/30 bg-primary-50 p-3.5" aria-label="Pedido de la página">
      <p className="text-[13px] font-bold text-primary-700">
        Pedido N° {String(web.numero).padStart(2, "0")} de la página · paga con{" "}
        {web.formaPago === "QR" ? "QR" : `efectivo${web.pagaCon != null ? ` (trae ${fmtMoney(web.pagaCon)})` : ""}`}
      </p>
      {web.referencia && <p className="text-[13px] text-texto-2">Referencia: {web.referencia}</p>}
      {pin && (
        <div className="flex gap-2">
          <a href={urlRuta(pin)} target="_blank" rel="noreferrer" className={boton}>
            <Icon name="pin" size={15} /> Ir con Google Maps
          </a>
          <a href={urlWaze(pin.lat, pin.lng)} target="_blank" rel="noreferrer" className={boton}>
            <Icon name="pin" size={15} /> Abrir en Waze
          </a>
        </div>
      )}
      <button type="button" onClick={copiar} className={`${boton} w-full`}>
        <Icon name="copiar" size={15} /> {copiada ? "Dirección copiada" : "Copiar dirección"}
      </button>
      {salio ? (
        <p className="rounded-lg bg-white px-3 py-2.5 text-[13px] font-semibold text-primary-700">
          Ya saliste: el cliente ve dónde vas mientras esta pantalla esté abierta.
        </p>
      ) : (
        <Boton className="min-h-12 w-full" icono="truck" onClick={yaSali} disabled={saliendo}>
          {saliendo ? "Avisando…" : "Ya salí del local"}
        </Boton>
      )}
      <ErrorMsg>{error}</ErrorMsg>
    </div>
  );
}
