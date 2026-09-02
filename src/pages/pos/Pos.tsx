import { useCallback, useState } from "react";
import { Icon } from "../../components/Icon";
import { Cargando, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtHora, fmtMoney } from "../../lib/format";
import { tieneFeature } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { PagoInput, Venta } from "../../types";
import AperturaCaja from "./AperturaCaja";
import PantallaCobro from "./PantallaCobro";
import PantallaRecibo from "./PantallaRecibo";
import PantallaVenta from "./PantallaVenta";
import { useCarrito } from "./useCarrito";

type Pantalla = "venta" | "cobro" | "recibo";

export default function Pos() {
  const { negocio } = useAuth();
  // La caja manda: sin turno abierto el POS no deja vender, porque toda venta
  // tiene que caer dentro de un arqueo.
  const caja = useApi(() => api.cajaActual(), []);
  const productos = useApi(() => api.getProductos(), []);
  const categorias = useApi(() => api.getCategorias(false), []);
  const formasPago = useApi(() => api.getFormasPago(), []);

  const carrito = useCarrito();
  const [pantalla, setPantalla] = useState<Pantalla>("venta");
  const [venta, setVenta] = useState<Venta | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const cobrar = useCallback(
    async (pagos: PagoInput[]) => {
      setError("");
      setEnviando(true);
      try {
        const creada = await api.crearVenta({
          detalles: carrito.aDetalles(),
          pagos,
          tipoPedido: "LOCAL",
        });
        setVenta(creada);
        carrito.vaciar();
        setPantalla("recibo");
        // El stock cambió al vender: el catálogo tiene que reflejarlo.
        productos.recargar();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar la venta");
      } finally {
        setEnviando(false);
      }
    },
    [carrito, productos],
  );

  if (caja.cargando) return <Cargando texto="Buscando tu caja…" />;
  if (caja.error)
    return (
      <div className="p-5">
        <ErrorMsg>{caja.error}</ErrorMsg>
      </div>
    );

  const abierta = caja.datos?.caja ?? null;
  if (!abierta) return <AperturaCaja onAbierta={() => caja.recargar()} />;

  if (pantalla === "cobro")
    return (
      <PantallaCobro
        total={carrito.total}
        formasPago={formasPago.datos ?? []}
        onAtras={() => setPantalla("venta")}
        onConfirmar={cobrar}
        enviando={enviando}
        error={error}
        // El fiado se ofrece sólo si el plan lo incluye.
        onCredito={
          tieneFeature(negocio?.features, "fiado")
            ? () => setError("La venta a crédito se habilita en el próximo paso.")
            : undefined
        }
      />
    );

  if (pantalla === "recibo" && venta)
    return (
      <PantallaRecibo
        venta={venta}
        onNuevaVenta={() => {
          setVenta(null);
          setPantalla("venta");
        }}
        onHistorial={() => {
          setVenta(null);
          setPantalla("venta");
        }}
      />
    );

  if (productos.cargando) return <Cargando texto="Cargando el catálogo…" />;

  return (
    <PantallaVenta
      productos={productos.datos ?? []}
      categorias={categorias.datos ?? []}
      carrito={carrito}
      onCobrar={() => setPantalla("cobro")}
      cabecera={
        <div className="flex items-center justify-between gap-3 border-b border-borde bg-white px-4 py-3">
          <div>
            <h1 className="text-[15px] font-bold text-texto">Punto de venta</h1>
            <p className="flex items-center gap-1.5 text-xs text-texto-3">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Caja abierta desde {fmtHora(abierta.fechaApertura)} ·{" "}
              {fmtMoney(abierta.montoApertura)}
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-lg bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">
            <Icon name="lock" size={13} /> Turno abierto
          </span>
        </div>
      }
    />
  );
}
