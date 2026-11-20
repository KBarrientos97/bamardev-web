import { useState } from "react";
import UbicacionDeEntrega from "../../components/UbicacionDeEntrega";
import { Boton, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import type { Ubicacion } from "../../lib/mapa";

/**
 * «Agregar / cambiar ubicación» de un delivery pendiente, desde la caja
 * (20-nov): el cliente manda su ubicación por WhatsApp después de pedir, y la
 * cajera la pega o la marca acá (`PATCH /ventas/:id/ubicacion`). Es opcional:
 * sin pin, el repartidor busca la dirección escrita.
 */
export default function CambiarUbicacion({
  ventaId,
  actual,
  onGuardado,
}: {
  ventaId: number;
  actual: Ubicacion | null;
  /** Ya se guardó: el pedido cambió y la lista se recarga. */
  onGuardado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pin, setPin] = useState<Ubicacion | null>(actual);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function guardar() {
    if (!pin || guardando) return;
    setError("");
    setGuardando(true);
    try {
      await api.ubicacionDeVenta(ventaId, { latitud: pin.lat, longitud: pin.lng });
      setAbierto(false);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la ubicación");
    } finally {
      setGuardando(false);
    }
  }

  // Se marca acá mismo, dentro del detalle de la venta, y no en otra hoja
  // encima (regla del dueño, 20-nov: nunca dos hojas apiladas).
  if (abierto) {
    return (
      <div
        role="group"
        aria-label={actual ? "Cambiar ubicación" : "Agregar ubicación"}
        className="space-y-3 rounded-xl border-[1.5px] border-primary bg-white px-3.5 py-3 motion-safe:animate-[vista-entra_.22s_cubic-bezier(0.32,0.72,0,1)]"
      >
        <p className="text-sm font-bold text-texto">{actual ? "Cambiar ubicación" : "Agregar ubicación"}</p>
        <UbicacionDeEntrega valor={pin} onCambio={setPin} />
        <ErrorMsg>{error}</ErrorMsg>
        <div className="flex gap-2">
          <Boton variante="ghost" className="min-h-11 flex-1" onClick={() => setAbierto(false)} disabled={guardando}>
            Volver
          </Boton>
          <Boton className="min-h-11 flex-1" onClick={guardar} disabled={guardando || !pin}>
            {guardando ? "Guardando…" : "Guardar ubicación"}
          </Boton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted px-3.5 py-2.5">
      <span className="text-[13px] text-texto-2">{actual ? "Con ubicación en el mapa" : "Sin ubicación en el mapa"}</span>
      <Boton
        variante="ghost"
        icono="pin"
        className="min-h-11 !px-3 !py-1.5 text-[13px]"
        onClick={() => {
          setPin(actual);
          setError("");
          setAbierto(true);
        }}
      >
        {actual ? "Cambiar ubicación" : "Agregar ubicación"}
      </Boton>
    </div>
  );
}
