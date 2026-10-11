import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { rutaCortaDeVieja, rutaLargaDeLink } from "../../lib/pagina/link";

const PaginaPublica = lazy(() => import("./PaginaPublica"));
// Diferido como lo demás: importado directo, cualquier reserva o gestión de
// cita en este host bajaba también la página del negocio (con su vista),
// sólo por este aviso.
const NoDisponible = lazy(() => import("./PaginaPublica").then((m) => ({ default: m.NoDisponible })));
const PrivacidadNegocio = lazy(() => import("./PrivacidadNegocio"));
const PromoPublica = lazy(() => import("./PromoPublica"));
const ReservaPublica = lazy(() => import("../../publico/ReservaPublica"));
const PrivacidadDeLaReserva = lazy(() =>
  import("../../publico/ReservaPublica").then((m) => ({ default: m.PrivacidadDeLaReserva })),
);

/**
 * Todo lo que existe en `link(-qa).bamardev.com` (ver `lib/pagina/link.ts`):
 * la página del negocio, su privacidad, sus promociones y la reserva online,
 * con direcciones cortas. Sin sesión, sin login y sin nada de la app: en este
 * host la app no existe, y cualquier otra dirección es "no disponible" (la
 * Pages Function ya la sirve con un 404). Qué formas existen lo decide
 * `rutaLargaDeLink`, lo mismo que mira la Function.
 *
 * La reserva se monta entera con sus rutas de siempre (`:subdominio/reservar`,
 * `:subdominio/c/:token`…), sólo que sin el `/r` delante.
 */
export default function RutasLink() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", background: "#F6F7F9" }} />}>
      <Routes>
        {/* La raíz la manda a la landing la Pages Function antes de que
            cargue nada; esto sólo se ve en `npm run dev`. */}
        <Route path="/" element={<NoDisponible />} />
        <Route path="/p/*" element={<AlCorto />} />
        <Route path="/r/*" element={<AlCorto />} />
        <Route path="/:subdominio" element={<PaginaPublica />} />
        <Route path="/:subdominio/privacidad" element={<Privacidad />} />
        <Route path="/:subdominio/promo/:slug" element={<PromoPublica />} />
        <Route path="/*" element={<SoloReserva />} />
      </Routes>
    </Suspense>
  );
}

/** La página primero; si no está publicada, la de la reserva. */
function Privacidad() {
  const { subdominio = "" } = useParams();
  return <PrivacidadNegocio siNoHay={<PrivacidadDeLaReserva sub={subdominio} />} />;
}

/** Lo que queda es la reserva (`/<sub>/reservar…`, `/<sub>/c/<token>`) o nada. */
function SoloReserva() {
  const { pathname } = useLocation();
  return rutaLargaDeLink(pathname)?.startsWith("/r/") ? <ReservaPublica /> : <NoDisponible />;
}

/** `/p/<sub>…` o `/r/<sub>…` sobre el host link: a la forma corta. */
function AlCorto() {
  const { pathname, search } = useLocation();
  const corta = rutaCortaDeVieja(pathname);
  return corta ? <Navigate to={`${corta}${search}`} replace /> : <NoDisponible />;
}
