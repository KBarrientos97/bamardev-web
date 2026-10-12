import { useAuth } from "../../store/AuthContext";
import { MotorAvisos, Toasts } from "./Avisos";
import { useSondeoBillar } from "./store";

/**
 * Lo del billar que corre en TODAS las pantallas del negocio, no sólo en el
 * tablero: el tablero al día, los avisos de tiempo fijo (zumbido y voz), los
 * avisos flotantes y el número del menú.
 *
 * Antes vivía dentro de /billar/*: con el cajero en el POS, en Reportes o en
 * Inventario, una mesa de tiempo fijo vencía sin que sonara nada, el número
 * del menú quedaba congelado y al volver el aviso salía tarde (bug 1 del
 * testing de la maqueta, 11-oct-2026).
 *
 * Lo monta el Layout sólo si el usuario ve el billar, y se baja aparte
 * (lazy): un restaurante o una farmacia no cargan nada de esto.
 */
export default function BillarDeFondo() {
  const { negocio } = useAuth();
  useSondeoBillar(negocio?.alias);
  return (
    <>
      <MotorAvisos />
      <Toasts />
    </>
  );
}
