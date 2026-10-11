import { Component, lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { enHostLink, esRutaDePaginaPublica } from "./lib/pagina/rutas";
import { reportarError } from "./lib/telemetria";
import RutasPaginaPublica from "./pages/pagina/RutasPagina";

/*
 * La entrada de la SPA: decide qué se baja según la dirección, y nada más.
 *
 * Una misma SPA atiende la app del negocio (POS, agenda, reportes…) y lo
 * público: la página del negocio (`/p/<sub>`), la reserva online (`/r/<sub>…`)
 * y todo `link(-qa).bamardev.com`. Lo público lo abren clientes finales desde
 * Instagram o WhatsApp, con celulares baratos y datos móviles; si este archivo
 * importara la app, cada uno bajaría ≈ 1,5 MB de JS que nunca usa antes de
 * ver la página. Por eso acá sólo hay imports livianos, y la app entera
 * (sesión, login, menú, pantallas) vive en AppNegocio.tsx, que se baja recién
 * cuando se entra a ella. Lo cuida `separacion.test.ts`: nada pesado puede
 * colarse por un import estático de este archivo.
 */

const AppNegocio = lazy(() => import("./AppNegocio"));
/** La reserva online del cliente final (`/r/<subdominio>…`). */
const ReservaPublica = lazy(() => import("./publico/ReservaPublica"));
/** Todo `link(-qa).bamardev.com`: la página y la reserva, sin la app. */
const RutasLink = lazy(() => import("./pages/pagina/RutasLink"));

/** El gris de la página pública mientras llega su pantalla. */
const ESPERA_PAGINA = <div style={{ minHeight: "100dvh", background: "#F6F7F9" }} />;

export default function App() {
  // En el host link no existe la app: ni login, ni sesión, ni sus pantallas.
  if (enHostLink()) {
    return (
      <BrowserRouter>
        <FalloDeCarga>
          <Suspense fallback={ESPERA_PAGINA}>
            <RutasLink />
          </Suspense>
        </FalloDeCarga>
      </BrowserRouter>
    );
  }
  return (
    <BrowserRouter>
      <FalloDeCarga>
        <Routes>
          {/* Fuera del AuthProvider a propósito: la reserva pública no tiene
              sesión, y así ni el login ni el cierre por licencia o por 401
              pueden alcanzarla (PLAN-AGENDA-BELLEZA §8.6). */}
          <Route
            path="/r/*"
            element={
              <Suspense fallback={<div className="min-h-dvh bg-white" />}>
                <ReservaPublica />
              </Suspense>
            }
          />
          <Route path="*" element={<PaginaOApp />} />
        </Routes>
      </FalloDeCarga>
    </BrowserRouter>
  );
}

/**
 * `/p/<subdominio>` (y su privacidad y sus promos) es la página PÚBLICA del
 * negocio: se atiende antes de cargar la app, así no pasa por la sesión —una
 * sesión vencida en ese navegador no la manda al login— ni baja sus pantallas.
 * Todo lo demás es la app.
 */
function PaginaOApp() {
  const { pathname } = useLocation();
  if (esRutaDePaginaPublica(pathname)) return <RutasPaginaPublica />;
  return (
    // El mismo fondo que pinta la app mientras espera sus permisos: entrar no
    // parpadea en blanco.
    <Suspense fallback={<div className="min-h-dvh bg-fondo" aria-busy="true" />}>
      <AppNegocio />
    </Suspense>
  );
}

interface EstadoFallo {
  error: boolean;
  ruta: string;
}

/**
 * Si un pedazo no llega (datos móviles que se cortan a mitad de la carga, o un
 * despliegue que reemplazó los archivos mientras la pestaña estaba abierta),
 * `lazy` revienta y React desmontaría todo: una página en blanco. Esto deja un
 * aviso con un botón para reintentar. Va con estilos en línea porque puede
 * verse antes de que llegue nada más; y en lo público no reporta (ver
 * `esRutaPublica` en telemetria.ts). Los errores de las pantallas de la app
 * los ataja antes `AtajaErrores`, adentro de AppNegocio.
 */
function FalloDeCarga({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <AtajaFallo ruta={pathname}>{children}</AtajaFallo>;
}

class AtajaFallo extends Component<{ ruta: string; children: ReactNode }, EstadoFallo> {
  state: EstadoFallo = { error: false, ruta: this.props.ruta };

  static getDerivedStateFromError() {
    return { error: true };
  }

  // Cambiar de dirección (el botón Atrás) vuelve a intentar.
  static getDerivedStateFromProps(props: { ruta: string }, estado: EstadoFallo) {
    return props.ruta === estado.ruta ? null : { error: false, ruta: props.ruta };
  }

  componentDidCatch(error: Error) {
    reportarError("carga", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          background: "#F6F7F9",
          color: "#1F2937",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p style={{ margin: 0, maxWidth: 320, fontSize: 15 }}>
          No se pudo abrir esta página. Revisá tu conexión y probá de nuevo.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            minHeight: 44,
            padding: "0 20px",
            border: 0,
            borderRadius: 12,
            background: "#047857",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }
}
