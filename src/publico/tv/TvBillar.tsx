import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { useAhora } from "../../pages/billar/reloj";
import { AvisoSinConexionTv, MarcoSalon, MensajeTv } from "../../pages/billar/SalonTv";
import { vistaSalon } from "../../pages/billar/SalonTv.datos";
import { useAlDia, useMantenerEncendida, usePantallaCompleta } from "./pantalla";
import { llaveConForma, mesasDelSalon, sucursalDeLaDireccion, tiposDelSalon } from "./TvBillar.datos";
import { useSalonPublico } from "./useSalonPublico";

/** La TV de tickets del restaurante (`/tv/tickets/<llave>`). */
const TvTickets = lazy(() => import("./TvTickets"));
/** Las TVs del menú digital (`/tv/menu/<llave>/<n>`). */
const TvMenu = lazy(() => import("./TvMenu"));

/**
 * La TV del salón del billar SIN sesión (§7.11): `/tv/billar/<llave>`, con
 * `?sucursal=<id>` si el negocio tiene más de un local.
 *
 * Antes la única TV era `/billar/salon`, con la sesión del cajero: para
 * dejarla en un televisor había que dejar una sesión abierta en esa compu, y
 * cualquiera en la barra podía usarla para cobrar o anular. Esta entra con la
 * llave que se genera en Mesas de billar → Pantalla del salón, y regenerarla
 * la corta.
 *
 * Vive fuera del AuthProvider (ver App.tsx), como la reserva: no lee la sesión
 * guardada en ese navegador (ni el tema, ni el negocio, ni el token) y un 401
 * de acá no puede mandar a nadie al login. Dibuja con las mismas piezas que
 * la TV con sesión (SalonTv.tsx) y no tiene nada que lleve a la app.
 */
export default function RutasTv() {
  return (
    <Routes>
      <Route path="billar/:llave" element={<TvBillar />} />
      {/* La TV de tickets del restaurante: aparte, para que una no baje la otra. */}
      <Route
        path="tickets/:llave"
        element={
          <Suspense fallback={<div className="min-h-dvh bg-[#1A1210]" />}>
            <TvTickets />
          </Suspense>
        }
      />
      {/* Las TVs del menú digital: `/tv/menu/<llave>` elige cuál, `/<n>` la muestra. */}
      <Route
        path="menu/*"
        element={
          <Suspense fallback={<div className="min-h-dvh bg-[#1A1210]" />}>
            <TvMenu />
          </Suspense>
        }
      />
      <Route path="*" element={<EnlaceIncompleto />} />
    </Routes>
  );
}

function TvBillar() {
  const { llave = "" } = useParams();
  const [params] = useSearchParams();
  // Un enlace cortado al pegarlo (WhatsApp lo parte a veces) se dice como tal:
  // con "ya no está habilitada" el dueño generaba otro sin necesidad.
  if (!llaveConForma(llave)) return <EnlaceIncompleto />;
  return <SalonConLlave llave={llave} sucursalId={sucursalDeLaDireccion(params.get("sucursal"))} />;
}

function SalonConLlave({ llave, sucursalId }: { llave: string; sucursalId?: number }) {
  const s = useSalonPublico(llave, sucursalId);
  const ahora = useAhora();
  useMantenerEncendida();
  useAlDia();
  const negocio = s.datos?.negocio;

  useEffect(() => {
    document.title = negocio ? `${negocio} · Mesas` : "Mesas de billar";
  }, [negocio]);

  if (s.fase === "anulada") {
    return (
      <MensajeTv titulo="Esta pantalla ya no está habilitada">
        Generá un enlace nuevo en <b className="text-white">Mesas de billar → Pantalla del salón</b> y abrilo en este
        televisor.
      </MensajeTv>
    );
  }
  if (s.fase === "invalida") {
    return (
      <MensajeTv titulo="Este enlace no sirve">
        Puede que apunte a un local que ya no existe. Generalo de nuevo en{" "}
        <b className="text-white">Mesas de billar → Pantalla del salón</b>.
      </MensajeTv>
    );
  }

  const datos = s.datos;
  const tipos = datos ? tiposDelSalon(datos) : {};
  const vistas = datos ? mesasDelSalon(datos).map((m) => vistaSalon(m, tipos, datos.avisos, ahora)) : [];
  return (
    <MarcoSalon
      titulo={negocio || "Billar"}
      vistas={vistas}
      tipos={Object.values(tipos)}
      cargado={!!datos}
      mensaje={s.sinConexion ? "No se pudo conectar con el servidor. Se vuelve a intentar solo…" : null}
      ahora={ahora}
      acciones={<BotonPantallaCompleta />}
    >
      {s.sinConexion && <AvisoSinConexionTv detalle={s.sinConexion} onReintentar={s.reintentar} />}
    </MarcoSalon>
  );
}

/** Lo único tocable de la TV: no lleva a la app, sólo agranda la página. */
function BotonPantallaCompleta() {
  const { disponible, activa, pedir } = usePantallaCompleta();
  if (!disponible || activa) return null;
  return (
    <button
      type="button"
      onClick={pedir}
      className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white/85 ring-1 ring-inset ring-white/20 hover:bg-white/10 2xl:text-lg"
    >
      <Icon name="pantalla" size={16} />
      Pantalla completa
    </button>
  );
}

function EnlaceIncompleto() {
  return (
    <MensajeTv titulo="Este enlace está incompleto">
      Copialo entero desde <b className="text-white">Mesas de billar → Pantalla del salón</b>, con el botón Copiar.
    </MensajeTv>
  );
}
