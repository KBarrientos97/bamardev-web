import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cargando, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import type { Caja } from "../../types";
import PantallaCierre, { CierreOk } from "../pos/PantallaCierre";
import { CajaCerradaAviso } from "./ModalesCaja";
import { recargar } from "./store";
import { Encabezado } from "./ui";

/**
 * Cerrar caja (§7.13): el mismo cierre del POS, con su arqueo, sus
 * movimientos y los productos del turno. Es una sola caja: la del cajero, la
 * que cobró las mesas y las ventas rápidas.
 *
 * Lo del billar está adentro del cierre del POS: los adelantos de mesas que
 * siguen abiertas cuentan en el efectivo esperado, y con una mesa en juego la
 * caja NO se cierra (decisión de Kevin, 11-oct-2026, al revés de la captura
 * de la maqueta, que las pasaba al turno siguiente): el cierre dice cuáles son
 * y no deja confirmar hasta cobrarlas.
 */
export default function CerrarCaja() {
  const navigate = useNavigate();
  const caja = useApi(() => api.cajaActual(), []);
  const [cerrada, setCerrada] = useState<Caja | null>(null);
  const volver = () => {
    void recargar(true);
    navigate("/billar");
  };

  if (cerrada) return <CierreOk caja={cerrada} onSalir={volver} />;
  if (caja.cargando) return <Cargando />;
  if (caja.error) return <ErrorMsg onReintentar={caja.recargar}>{caja.error}</ErrorMsg>;
  if (!caja.datos?.caja) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo="Cerrar caja" />
        <CajaCerradaAviso />
      </div>
    );
  }
  return <PantallaCierre caja={caja.datos.caja} onAtras={volver} onCerrada={setCerrada} />;
}
