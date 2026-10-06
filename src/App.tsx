import { lazy, Suspense, useEffect, useRef } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import AtajaErrores from "./components/AtajaErrores";
import Layout from "./components/Layout";
import { RUTA_AGENDA_PRONTO, rutaInicial, type Seccion } from "./lib/permisos";
import { esFarmacia } from "./lib/rubro";
import AgendaPronto from "./pages/AgendaPronto";
import Creditos from "./pages/Creditos";
import Gastos from "./pages/Gastos";
import GastosFijos from "./pages/GastosFijos";
import Login from "./pages/Login";
import PagarLicencia from "./pages/PagarLicencia";
import Reportes from "./pages/Reportes";
import Usuarios from "./pages/Usuarios";
import Agenda from "./pages/agenda/Agenda";
import Hoy from "./pages/agenda/Hoy";
import Clientes from "./pages/agenda/Clientes";
import MiAgenda from "./pages/agenda/MiAgenda";
import Solicitudes from "./pages/agenda/Solicitudes";
import Almacenes from "./pages/inventario/Almacenes";
import Categorias from "./pages/inventario/Categorias";
import Dashboard from "./pages/inventario/Dashboard";
import Insumos from "./pages/inventario/Insumos";
import Mesas from "./pages/inventario/Mesas";
import Movimientos from "./pages/inventario/Movimientos";
import Productos from "./pages/inventario/Productos";
import Pos from "./pages/pos/Pos";
import BuscarMedicamento from "./pages/farmacia/BuscarMedicamento";
import DashboardFarmacia from "./pages/farmacia/DashboardFarmacia";
import GastosFarmacia from "./pages/farmacia/GastosFarmacia";
import Encargos from "./pages/farmacia/Encargos";
import FormMercaderia from "./pages/farmacia/FormMercaderia";
import FormTransferencia from "./pages/farmacia/FormTransferencia";
import ImportarMedicamentos from "./pages/farmacia/ImportarMedicamentos";
import MovimientosFarmacia from "./pages/farmacia/MovimientosFarmacia";
import Vencimientos from "./pages/farmacia/Vencimientos";
import LibroControlados from "./pages/farmacia/LibroControlados";
import SugerenciaCompra from "./pages/farmacia/SugerenciaCompra";
import Mermas from "./pages/farmacia/Mermas";
import Proveedores from "./pages/farmacia/Proveedores";
import VentaFarmaciaProvider from "./pages/farmacia/VentaFarmaciaProvider";
import Repartidor from "./pages/repartidor/Repartidor";
import PanelMesero from "./pages/salon/PanelMesero";
import ConfigAgenda from "./pages/agenda/config/ConfigAgenda";
import ConfigNegocio from "./pages/agenda/config/ConfigNegocio";
import RutasPaginaPublica from "./pages/pagina/RutasPagina";
import { esRutaDePaginaPublica } from "./lib/pagina/rutas";
import { AuthProvider, useAuth } from "./store/AuthContext";

/**
 * La reserva online del cliente final (`/r/<subdominio>…`). Diferida: es una
 * página pública liviana y no tiene por qué bajar la app entera, ni la app
 * cargar sus pantallas.
 */
const ReservaPublica = lazy(() => import("./publico/ReservaPublica"));
// Página del negocio: el editor y los enlaces cortos se bajan sólo si se usan.
const MiPagina = lazy(() => import("./pages/pagina/MiPagina"));
const MisEnlaces = lazy(() => import("./pages/pagina/MisEnlaces"));
// Belleza fase 4: sólo se bajan en un salón que las tiene prendidas.
const GiftCards = lazy(() => import("./pages/belleza/GiftCards"));
const Propinas = lazy(() => import("./pages/belleza/Propinas"));
const RecetasServicio = lazy(() => import("./pages/belleza/RecetasServicio"));

/** Manda a cada rol a su pantalla: cajero al POS, repartidor a entregas. */
function Inicio() {
  const { usuario, negocio } = useAuth();
  if (!usuario) return <Navigate to="/" replace />;
  const destino = rutaInicial({
    rol: usuario.rol,
    modulos: usuario.modulos,
    features: negocio?.features,
    rubro: negocio?.tipoNegocio,
    // PLAN-ROLES R4: con permisos, la agenda se decide por ellos y la ruta
    // inicial por el arquetipo. Sin ellos (backend viejo), como siempre.
    permisos: usuario.permisos,
    permisosPropios: usuario.permisosPropios,
    arquetipo: usuario.arquetipo,
  });
  return <Navigate to={destino} replace />;
}

/**
 * Ni el rol ni el plan habilitan una sola sección. Pasa con una cuenta mal
 * configurada; sin esta pantalla el usuario vería un blanco y no sabría a
 * quién reclamarle.
 */
function SinAcceso() {
  const { usuario, logout } = useAuth();
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-bold text-texto">Tu cuenta no tiene secciones</h1>
        <p className="mt-2 text-[13px] text-texto-3">
          El rol {usuario?.rol} de este negocio no tiene ningún módulo habilitado.
          Pedile al administrador que revise los permisos o el plan contratado.
        </p>
        <button
          onClick={logout}
          className="mt-5 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

/**
 * Una sección que el rol o el plan no habilitan no se renderiza: el backend
 * igual respondería 403, y es mejor devolver a la pantalla de inicio que
 * mostrar un error después de cargar.
 */
function Protegida({ seccion, children }: { seccion: Seccion; children: React.ReactNode }) {
  const { puede } = useAuth();
  if (!puede(seccion)) return <Inicio />;
  return <>{children}</>;
}

/**
 * La pantalla del profesional. No es una `Seccion`: no pide módulo ni feature
 * (su rol no tiene módulos, D23), es la de un rol y de nadie más. Cualquier
 * otro rol que entre por URL vuelve a su inicio.
 */
function SoloProfesional({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  if (usuario?.rol !== "PROFESIONAL") return <Inicio />;
  return <>{children}</>;
}

/**
 * "/mi-agenda" es una sola ruta para el profesional: su agenda si el negocio
 * tiene la feature `agenda`, y si no el aviso de que llega pronto. Así prender
 * la agenda desde el panel le cambia la pantalla sin cambiarle a dónde entra.
 */
function MiAgendaOPronto() {
  const { puede } = useAuth();
  return puede("mi_agenda") ? <MiAgenda /> : <AgendaPronto />;
}

/**
 * Movimientos tiene dos pantallas para el mismo motor.
 *
 * La de Inventario cubre los cuatro tipos (entrada, salida, ajuste y
 * transferencia) y es la que usan todos los rubros desde siempre. La de
 * farmacia cuenta lo mismo como lo cuenta un mostrador —lo que se recibe de la
 * droguería y lo que se da de baja— y manda a los dos formularios guiados.
 *
 * Se elige acá y no adentro de la pantalla para que el archivo de siempre no se
 * entere de que existe un rubro: así un cambio de farmacia no puede romperle
 * los movimientos a un restaurante que ya está trabajando.
 */
function MovimientosSegunRubro() {
  const { rubro } = useAuth();
  return esFarmacia(rubro) ? <MovimientosFarmacia /> : <Movimientos />;
}

/**
 * La primera pantalla de Inventario. Mismo criterio que Movimientos: la
 * farmacia tiene la suya —con el semáforo de vencimientos y lo más vendido del
 * día— y el Dashboard de siempre no se entera de que existe un rubro.
 */
function DashboardSegunRubro() {
  const { rubro } = useAuth();
  return esFarmacia(rubro) ? <DashboardFarmacia /> : <Dashboard />;
}

/**
 * Gastos operativos. La farmacia tiene la suya, armada como la maqueta: cada
 * gasto se toca y el detalle va en un popup, filtra por categoría y deja
 * administrar las categorías. Usa el mismo formulario y el mismo panel de pago
 * que la de siempre, que sigue igual para los demás rubros.
 */
function GastosSegunRubro() {
  const { rubro } = useAuth();
  return esFarmacia(rubro) ? <GastosFarmacia /> : <Gastos />;
}

/**
 * La app con su barra lateral. En una farmacia, además, con la venta en curso
 * por encima de todas las pantallas (ver `VentaFarmaciaProvider.tsx`): el carrito
 * sobrevive a ir a Buscar medicamento y volver, y el botón "Ver venta" sigue a
 * quien atiende. Los demás rubros reciben el Layout de siempre, sin nada más.
 */
function LayoutSegunRubro() {
  const { rubro } = useAuth();
  if (!esFarmacia(rubro)) return <Layout />;
  return (
    <VentaFarmaciaProvider>
      <Layout />
    </VentaFarmaciaProvider>
  );
}

/**
 * Pago de la licencia estando la sesión abierta (durante la gracia, antes del
 * bloqueo). Es la misma pantalla que se ve deslogueado; sólo cambia de dónde
 * sale el código de activación y a dónde vuelve al salir.
 */
function PagarConSesion() {
  const { negocio } = useAuth();
  return (
    <PagarLicencia
      aliasInicial={negocio?.alias ?? null}
      onSalir={() => window.history.back()}
    />
  );
}

function Rutas() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const teniaSesion = useRef(token !== null);

  // Al cerrar sesión la dirección vuelve a "/". Antes quedaba la del que
  // salió: el mesero cerraba sesión en /salon, entraba el administrador y
  // caía en el panel del mesero, sin la barra lateral para volver a lo suyo,
  // y se leía como "me entró como mesero otra vez". Desde "/" cada uno va a su
  // pantalla (ver Inicio), igual que cuando la sesión vence. Un link abierto
  // sin sesión no pasa por acá: después del login sigue yendo a donde apuntaba.
  useEffect(() => {
    if (teniaSesion.current && !token) navigate("/", { replace: true });
    teniaSesion.current = token !== null;
  }, [token, navigate]);

  // La página pública del negocio no pide sesión (ver RutasPagina.tsx).
  if (esRutaDePaginaPublica(pathname)) return <RutasPaginaPublica />;

  if (!token) return <Login />;

  return (
    <Routes>
      {/* Fuera del Layout a propósito: el panel del mesero no tiene barra
          lateral ni cabecera de la app, tiene sus tres pestañas y nada más.
          Igual que MeserosActivity en Android, que es una activity aparte. */}
      <Route
        path="/salon"
        element={
          <Protegida seccion="salon">
            <PanelMesero />
          </Protegida>
        }
      />

      {/* Fuera del Layout: trae su propio fondo y no necesita la barra
          lateral. Acá el negocio todavía puede operar (está en gracia), así
          que el código de activación sale de la sesión y no del bloqueo. */}
      <Route path="/pagar" element={<PagarConSesion />} />

      {/* Fuera del Layout, como el salón: "Mi agenda" es la única pantalla
          del profesional y una barra lateral con un solo ítem sobra. */}
      <Route
        path={RUTA_AGENDA_PRONTO}
        element={
          <SoloProfesional>
            <MiAgendaOPronto />
          </SoloProfesional>
        }
      />

      <Route element={<LayoutSegunRubro />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/sin-acceso" element={<SinAcceso />} />

        <Route
          path="/pos"
          element={
            <Protegida seccion="pos">
              <Pos />
            </Protegida>
          }
        />

        {/* Agenda de belleza: sólo con la feature `agenda` y en un rubro de
            belleza (ver permisos.ts). */}
        <Route
          path="/agenda"
          element={
            <Protegida seccion="agenda">
              <Agenda />
            </Protegida>
          }
        />
        <Route
          path="/hoy"
          element={
            <Protegida seccion="hoy">
              <Hoy />
            </Protegida>
          }
        />
        <Route
          path="/clientes"
          element={
            <Protegida seccion="clientes">
              <Clientes />
            </Protegida>
          }
        />
        {/* A9: lo que entró por la reserva online (fase 2). */}
        <Route
          path="/solicitudes"
          element={
            <Protegida seccion="solicitudes">
              <Solicitudes />
            </Protegida>
          }
        />

        <Route
          path="/reparto"
          element={
            <Protegida seccion="reparto">
              <Repartidor />
            </Protegida>
          }
        />

        {/* Sólo farmacia: ver `SOLO_EN_RUBRO` en permisos.ts. */}
        <Route
          path="/buscar"
          element={
            <Protegida seccion="busqueda">
              <BuscarMedicamento />
            </Protegida>
          }
        />

        <Route
          path="/encargos"
          element={
            <Protegida seccion="encargos">
              <Encargos />
            </Protegida>
          }
        />

        <Route
          path="/vencimientos"
          element={
            <Protegida seccion="vencimientos">
              <Vencimientos />
            </Protegida>
          }
        />

        <Route
          path="/controlados"
          element={
            <Protegida seccion="controlados">
              <LibroControlados />
            </Protegida>
          }
        />

        <Route
          path="/inventario"
          element={
            <Protegida seccion="inventario">
              <DashboardSegunRubro />
            </Protegida>
          }
        />
        <Route
          path="/inventario/productos"
          element={
            <Protegida seccion="productos">
              <Productos />
            </Protegida>
          }
        />
        {/* Carga desde Excel: crea catálogo Y mueve stock, así que pide lo
            mismo que el ingreso de mercadería. Esa sección sólo existe en
            farmacia: fuera del rubro, entrar por URL devuelve al inicio. */}
        <Route
          path="/inventario/productos/importar"
          element={
            <Protegida seccion="ingreso_mercaderia">
              <ImportarMedicamentos />
            </Protegida>
          }
        />
        <Route
          path="/inventario/categorias"
          element={
            <Protegida seccion="productos">
              <Categorias />
            </Protegida>
          }
        />
        <Route
          path="/inventario/insumos"
          element={
            <Protegida seccion="insumos">
              <Insumos />
            </Protegida>
          }
        />
        <Route
          path="/inventario/almacenes"
          element={
            <Protegida seccion="almacenes">
              <Almacenes />
            </Protegida>
          }
        />
        <Route
          path="/inventario/proveedores"
          element={
            <Protegida seccion="proveedores">
              <Proveedores />
            </Protegida>
          }
        />
        <Route
          path="/inventario/movimientos"
          element={
            <Protegida seccion="movimientos">
              <MovimientosSegunRubro />
            </Protegida>
          }
        />
        {/* Las dos pantallas guiadas del rubro. El guard es el que las apaga
            fuera de farmacia: entrar por URL devuelve al inicio, igual que
            cualquier otra sección que el negocio no tiene. */}
        {/* Las `key` no sobran: las dos rutas dibujan el MISMO componente, así
            que al ir de una a la otra React lo reaprovecha y `tipoInicial`
            —que sólo alimenta el estado inicial— no se vuelve a mirar. Sin
            esto, entrar por "Salida de mercadería" desde "Ingreso" cambiaba la
            URL y dejaba el formulario en Entrada: se guardaba una entrada
            creyendo estar cargando una baja. */}
        <Route
          path="/inventario/movimientos/ingreso"
          element={
            <Protegida seccion="ingreso_mercaderia">
              <FormMercaderia key="ingreso" tipoInicial="ENTRADA" />
            </Protegida>
          }
        />
        <Route
          path="/inventario/movimientos/salida"
          element={
            <Protegida seccion="salida_mercaderia">
              <FormMercaderia key="salida" tipoInicial="SALIDA" />
            </Protegida>
          }
        />
        <Route
          path="/inventario/movimientos/:id/editar"
          element={
            <Protegida seccion="ingreso_mercaderia">
              <FormMercaderia />
            </Protegida>
          }
        />
        {/* Mandar mercadería de una sucursal a otra. Las `key` por lo mismo que
            arriba: si se guarda pero no se puede aprobar, el alta pasa a la
            edición de lo guardado, y tiene que arrancar de nuevo. */}
        <Route
          path="/inventario/movimientos/transferencia"
          element={
            <Protegida seccion="transferencia_mercaderia">
              <FormTransferencia key="nueva" />
            </Protegida>
          }
        />
        <Route
          path="/inventario/movimientos/transferencia/:id/editar"
          element={
            <Protegida seccion="transferencia_mercaderia">
              <FormTransferencia key="editar" />
            </Protegida>
          }
        />

        <Route
          path="/mesas"
          element={
            <Protegida seccion="mesas">
              <Mesas />
            </Protegida>
          }
        />

        <Route
          path="/creditos"
          element={
            <Protegida seccion="creditos">
              <Creditos />
            </Protegida>
          }
        />
        <Route
          path="/gastos"
          element={
            <Protegida seccion="gastos">
              <GastosSegunRubro />
            </Protegida>
          }
        />
        <Route
          path="/gastos/automaticos"
          element={
            <Protegida seccion="gastos">
              <GastosFijos />
            </Protegida>
          }
        />
        <Route
          path="/reportes"
          element={
            <Protegida seccion="reportes">
              <Reportes />
            </Protegida>
          }
        />
        {/* Farmacia: un reporte con pantalla propia (se edita y se imprime el
            pedido). Se entra desde su tarjeta en Reportes. */}
        <Route
          path="/reportes/sugerencia-compra"
          element={
            <Protegida seccion="reportes">
              <SugerenciaCompra />
            </Protegida>
          }
        />
        <Route
          path="/reportes/mermas"
          element={
            <Protegida seccion="reportes">
              <Mermas />
            </Protegida>
          }
        />
        <Route
          path="/usuarios"
          element={
            <Protegida seccion="usuarios">
              <Usuarios />
            </Protegida>
          }
        />

        {/* Agenda de belleza: configuración (A8) y reglas del negocio (A11). */}
        <Route
          path="/configuracion/agenda"
          element={
            <Protegida seccion="agenda_config">
              <ConfigAgenda />
            </Protegida>
          }
        />
        <Route
          path="/configuracion/negocio"
          element={
            <Protegida seccion="config_negocio">
              <ConfigNegocio />
            </Protegida>
          }
        />

        {/* Página del negocio (PLAN-PAGINA-NEGOCIO): el editor y los
            enlaces cortos. La página pública vive fuera de la sesión. */}
        <Route
          path="/mi-pagina"
          element={
            <Protegida seccion="mi_pagina">
              <Suspense fallback={null}>
                <MiPagina />
              </Suspense>
            </Protegida>
          }
        />
        <Route
          path="/mis-enlaces"
          element={
            <Protegida seccion="mis_enlaces">
              <Suspense fallback={null}>
                <MisEnlaces />
              </Suspense>
            </Protegida>
          }
        />

        {/* Belleza fase 4: gift cards, propinas e insumos por servicio. */}
        <Route
          path="/gift-cards"
          element={
            <Protegida seccion="gift_cards">
              <Suspense fallback={null}>
                <GiftCards />
              </Suspense>
            </Protegida>
          }
        />
        <Route
          path="/propinas"
          element={
            <Protegida seccion="propinas">
              <Suspense fallback={null}>
                <Propinas />
              </Suspense>
            </Protegida>
          }
        />
        <Route
          path="/configuracion/insumos-servicio"
          element={
            <Protegida seccion="recetas_servicio">
              <Suspense fallback={null}>
                <RecetasServicio />
              </Suspense>
            </Protegida>
          }
        />

        {/* Cualquier ruta desconocida vuelve al inicio del rol. */}
        <Route path="*" element={<Inicio />} />
      </Route>
    </Routes>
  );
}

/**
 * Ninguna pantalla deja la página en blanco: si una revienta, se ve un aviso
 * con salida (ver `AtajaErrores`), que se rearma al cambiar de dirección.
 */
function SinPantallaEnBlanco({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return <AtajaErrores reiniciarCon={pathname}>{children}</AtajaErrores>;
}

export default function App() {
  return (
    <BrowserRouter>
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
        <Route path="*" element={<AppConSesion />} />
      </Routes>
    </BrowserRouter>
  );
}

function AppConSesion() {
  return (
    <AuthProvider>
      <SinPantallaEnBlanco>
        <Rutas />
      </SinPantallaEnBlanco>
    </AuthProvider>
  );
}
