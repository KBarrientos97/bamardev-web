import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../store/AuthContext";
import { MotorAvisos } from "./Avisos";
import { useAhora } from "./reloj";
import { AvisoSinConexionTv, MarcoSalon } from "./SalonTv";
import { mesasEnUso, recargar, useBillar, useSondeoBillar } from "./store";
import { vistaDe } from "./vista";

/**
 * La pantalla del salón (§7.11) con la sesión del cajero: para una TV, a
 * pantalla completa, con el tiempo de cada mesa y SIN montos ni datos del
 * cajero. Sale con Escape.
 *
 * Se abre desde el tablero y se mantiene al día sola: va fuera del Layout,
 * así que pide el tablero por su cuenta. Para dejarla fija en un televisor
 * está la TV pública (`/tv/billar/:llave`, publico/tv), que no necesita una
 * sesión abierta en esa compu; las dos dibujan con las piezas de SalonTv.tsx.
 */
export default function PantallaSalon() {
  const e = useBillar();
  const ahora = useAhora();
  const navigate = useNavigate();
  const { negocio } = useAuth();
  useSondeoBillar(negocio?.alias);
  const vistas = mesasEnUso(e).map((m) => vistaDe(e, m, ahora));

  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") navigate("/billar");
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [navigate]);

  return (
    <MarcoSalon
      titulo={negocio?.nombre ?? "Billar"}
      vistas={vistas}
      tipos={Object.values(e.tipos)}
      cargado={e.cargado}
      mensaje={e.error}
      ahora={ahora}
      acciones={
        <button
          type="button"
          onClick={() => navigate("/billar")}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white/85 ring-1 ring-inset ring-white/20 hover:bg-white/10"
        >
          <Icon name="close" size={15} />
          Salir
        </button>
      }
    >
      {/* Ya cargada, un sondeo que falla no se veía: la TV quedaba con los
          relojes corriendo sobre mesas que pudieron cambiar. */}
      {e.cargado && e.error && <AvisoSinConexionTv detalle={e.error} onReintentar={() => void recargar(true)} />}
      {/* Va fuera del Layout, así que el motor de avisos de fondo no corre: con
          la PC de la barra mostrando la TV no sonaba nada (y es la compu con
          parlantes). Sólo el zumbido y la voz: los avisos flotantes, con su
          "Extender", no van en la tele (revisión del 16-oct). */}
      <MotorAvisos />
    </MarcoSalon>
  );
}
