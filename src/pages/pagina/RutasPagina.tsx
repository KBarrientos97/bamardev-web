import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

const PaginaPublica = lazy(() => import("./PaginaPublica"));
const PrivacidadNegocio = lazy(() => import("./PrivacidadNegocio"));

/**
 * `/p/<subdominio>` es la página PÚBLICA del negocio: la abre cualquiera, con
 * o sin sesión. Por eso se atiende antes de mirar el token (sin sesión, la app
 * mostraría el login) y fuera del Layout. Se carga aparte (lazy): quien entra
 * desde Instagram no baja las pantallas de la app.
 *
 * Lista para mudarse a `link.bamardev.com/<subdominio>` cuando exista el DNS.
 */
export default function RutasPaginaPublica() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", background: "#F6F7F9" }} />}>
      <Routes>
        <Route path="/p/:subdominio" element={<PaginaPublica />} />
        <Route path="/p/:subdominio/privacidad" element={<PrivacidadNegocio />} />
      </Routes>
    </Suspense>
  );
}
