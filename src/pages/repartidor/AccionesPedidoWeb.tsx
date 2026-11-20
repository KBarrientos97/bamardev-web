import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, ErrorMsg } from "../../components/ui";
import { frasesDeCobro } from "../../lib/pedidosWeb/cobro";
import { apiPedidosWeb } from "../../lib/pedidosWeb/apiPrivada";
import type { PedidoWebDeEntrega } from "../../lib/pedidosWeb/tipos";
import { direccionEscrita } from "./direccionEntrega";

/**
 * Lo que suma un pedido que vino de la página (13-nov): cómo se cobra, copiar
 * la dirección y «Ya salí del local», que le muestra al cliente la moto en su
 * mapa. Navegar hasta el pin (Google Maps o Waze) pasó a «Cómo llegar»
 * (`ComoLlegar`, 20-nov), que lo tiene toda entrega y no sólo las de la página.
 */
export default function AccionesPedidoWeb({
  ventaId,
  direccion,
  web,
  cobro,
  onSalio,
  sinUbicacion = false,
}: {
  ventaId: number;
  direccion: string | null;
  web: PedidoWebDeEntrega;
  /** Los números de la venta: productos (lo que registra), envío (del repartidor) y lo que se le cobra en mano. */
  cobro: { productos: number; envio: number; aCobrar: number };
  /**
   * Tocó «Ya salí del local»: la lista se refresca y empieza a compartirse la
   * posición. Recibe la hora para que el detalle (y el WhatsApp que arma) sepan
   * que ya salió sin esperar a que la lista vuelva del servidor.
   */
  onSalio: (salioEn: string) => void;
  /** El navegador no da la ubicación (permiso negado o apagado): el cliente NO ve la moto. */
  sinUbicacion?: boolean;
}) {
  const [salio, setSalio] = useState<string | null>(web.salioEn);
  const [saliendo, setSaliendo] = useState(false);
  const [copiada, setCopiada] = useState(false);
  const [error, setError] = useState("");
  // Sin dirección escrita (18-nov: el cliente puede marcar sólo el pin), no hay
  // nada que copiar: «Ubicación marcada en el mapa» no le sirve a nadie pegada
  // en otra app. Para llegar están los botones del mapa.
  const paraCopiar = direccionEscrita(direccion);
  const boton =
    // Con la respuesta al toque de `Boton` (se hunde un poco al apretar): sin
    // ella, en el celular no se sabía si el toque había entrado.
    "flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-3 text-[13px] font-semibold text-texto-2 hover:bg-muted transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:active:scale-100";

  async function yaSali() {
    setError("");
    setSaliendo(true);
    try {
      await apiPedidosWeb.sali(ventaId);
      const ahora = new Date().toISOString();
      setSalio(ahora);
      onSalio(ahora);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo avisar la salida");
    } finally {
      setSaliendo(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(paraCopiar ?? "");
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2500);
    } catch {
      setError("No se pudo copiar. Mantené apretada la dirección para copiarla.");
    }
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-primary/30 bg-primary-50 p-3.5" aria-label="Pedido de la página">
      <p className="text-[13px] font-bold text-primary-700">
        Pedido N° {String(web.numero).padStart(2, "0")} de la página · paga con {web.formaPago === "QR" ? "QR" : "efectivo"}
      </p>
      {/* El envío no entra al total de la venta: se dice cuánto cobrar, de qué se compone y el cambio (QA R1). */}
      <ul className="space-y-0.5 text-[13px] text-texto-2" aria-label="Cobro del pedido">
        {frasesDeCobro(web, cobro).map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {web.referencia && <p className="text-[13px] text-texto-2">Referencia: {web.referencia}</p>}
      {paraCopiar && (
        <button type="button" onClick={copiar} className={`${boton} w-full`}>
          <Icon name="copiar" size={15} /> {copiada ? "Dirección copiada" : "Copiar dirección"}
        </button>
      )}
      {salio ? (
        <p className="rounded-lg bg-white px-3 py-2.5 text-[13px] font-semibold text-primary-700">
          {sinUbicacion
            ? "Ya saliste, pero el cliente todavía no ve dónde vas: activá el permiso de ubicación del navegador."
            : "Ya saliste: el cliente ve dónde vas mientras esta pantalla esté abierta."}
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
