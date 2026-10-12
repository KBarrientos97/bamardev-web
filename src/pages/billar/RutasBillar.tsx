import { useEffect } from "react";
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { Cargando, ErrorMsg } from "../../components/ui";
import { useAuth } from "../../store/AuthContext";
import { DialogoActual } from "./Avisos";
import CerrarCaja from "./CerrarCaja";
import CerrarMesa from "./CerrarMesa";
import ConsumoMesa from "./ConsumoMesa";
import { DialogosProvider, useDialogos } from "./dialogos";
import { recargar, useBillar, useSondeoBillar } from "./store";
import Tablero from "./Tablero";
import VentaRapida from "./VentaRapida";
import VentasTurno from "./VentasTurno";

/**
 * Las pantallas del billar que van dentro de la barra lateral (`/billar/*`).
 * Comparten los diálogos. Los avisos de tiempo fijo y los flotantes viven en
 * el Layout (\`DeFondo\`), para que suenen aunque el cajero esté en otra
 * pantalla. La del salón (la TV) va aparte, sin barra.
 *
 * Los datos son los del backend (\`store.ts\`): hasta que llega el primer
 * tablero no se dibuja nada, porque sin él la caja se veía cerrada y se
 * ofrecía abrirla.
 */
export default function RutasBillar() {
  const { negocio } = useAuth();
  useSondeoBillar(negocio?.alias);
  const e = useBillar();

  return (
    <DialogosProvider>
      {!e.cargado ? (
        e.error ? (
          <div className="p-6">
            <ErrorMsg onReintentar={() => void recargar(true)}>{e.error}</ErrorMsg>
          </div>
        ) : (
          <Cargando texto="Cargando las mesas…" />
        )
      ) : (
        <>
          <AccionDeLaDireccion />
          <Routes>
            <Route index element={<Tablero />} />
            <Route path="consumo/:mesaId" element={<ConsumoMesa />} />
            <Route path="cerrar/:mesaId" element={<CerrarMesa />} />
            <Route path="ventas" element={<VentasTurno />} />
            <Route path="venta-rapida" element={<VentaRapida />} />
            <Route path="caja" element={<CerrarCaja />} />
            <Route path="*" element={<Navigate to="/billar" replace />} />
          </Routes>
          <DialogoActual />
        </>
      )}
    </DialogosProvider>
  );
}

/**
 * Lo que piden los avisos flotantes por la dirección: \`accion=extender\` (con
 * \`mesa\`) y \`ticket=\`. Se abre el diálogo y el pedido se borra de la
 * dirección, para que recargar o volver atrás no lo abra de nuevo. Si ya no
 * tiene sentido (la mesa se cerró), \`DialogoActual\` lo descarta solo.
 */
function AccionDeLaDireccion() {
  const [params, setParams] = useSearchParams();
  const { abrir } = useDialogos();
  const accion = params.get("accion");
  const mesa = Number(params.get("mesa")) || null;
  const ticket = params.get("ticket");

  useEffect(() => {
    if (!accion && !ticket) return;
    if (accion === "extender" && mesa) abrir({ tipo: "extender", mesaId: mesa });
    if (ticket) abrir({ tipo: "ticket", codigo: ticket });
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete("accion");
        n.delete("ticket");
        return n;
      },
      { replace: true },
    );
  }, [accion, mesa, ticket, abrir, setParams]);

  return null;
}
