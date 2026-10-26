import { lazy, Suspense, useEffect, useRef } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import AtajaErrores from "./components/AtajaErrores";
import Layout from "./components/Layout";
import { RUTA_COBRAR } from "./lib/academia/vista";
import { ConPestanasConfig, InicioConfig } from "./pages/academia/config/ConfigAcademia";
import { RUTA_AGENDA_PRONTO, rutaInicial, veReportes, veSoloSuAgenda, type Seccion } from "./lib/permisos";
import { esBelleza, esFarmacia } from "./lib/rubro";
import AgendaPronto from "./pages/AgendaPronto";
import Creditos from "./pages/Creditos";
import Gastos from "./pages/Gastos";
import GastosFijos from "./pages/GastosFijos";
import Login from "./pages/Login";
import PagarLicencia from "./pages/PagarLicencia";
import Usuarios from "./pages/Usuarios";
import Roles from "./pages/roles/Roles";
import Personal from "./pages/Personal";
import Agenda from "./pages/agenda/Agenda";
import Hoy from "./pages/agenda/Hoy";
import Clientes from "./pages/agenda/Clientes";
import MiAgenda from "./pages/agenda/MiAgenda";
import Solicitudes from "./pages/agenda/Solicitudes";
import Comisiones from "./pages/agenda/comisiones/Comisiones";
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
import Proveedores from "./pages/farmacia/Proveedores";
import VentaFarmaciaProvider from "./pages/farmacia/VentaFarmaciaProvider";
import Repartidor from "./pages/repartidor/Repartidor";
import PanelMesero from "./pages/salon/PanelMesero";
import ConfigAgenda from "./pages/agenda/config/ConfigAgenda";
import ConfigNegocio from "./pages/agenda/config/ConfigNegocio";
import { AuthProvider, useAuth } from "./store/AuthContext";
import { useNavegarDesdePush } from "./lib/push/useNavegarDesdePush";
import { ActualizarAlNavegar } from "./lib/pwa/actualizarAlNavegar";

/*
 * La app del negocio: sesión, login, menú y todas sus pantallas. Se baja
 * aparte, sólo cuando se entra a ella (ver App.tsx): las páginas públicas
 * —la del negocio, la reserva, las promos— no la cargan nunca.
 */

// Página del negocio: el editor y los enlaces cortos se bajan sólo si se usan.
const QrDeCobro = lazy(() => import("./pages/QrDeCobro"));
// De la cuenta, para cualquiera: trae Firebase sólo cuando se activa.
const Notificaciones = lazy(() => import("./pages/Notificaciones"));
const MiPagina = lazy(() => import("./pages/pagina/MiPagina"));
const MisEnlaces = lazy(() => import("./pages/pagina/MisEnlaces"));
const MiAsistente = lazy(() => import("./pages/pagina/MiAsistente"));
const Promociones = lazy(() => import("./pages/promociones/Promociones"));
const Retencion = lazy(() => import("./pages/clientes/Retencion"));
// Belleza fase 4: sólo se bajan en un salón que las tiene prendidas.
const GiftCards = lazy(() => import("./pages/belleza/GiftCards"));
const Propinas = lazy(() => import("./pages/belleza/Propinas"));
const RecetasServicio = lazy(() => import("./pages/belleza/RecetasServicio"));
// Billar: sólo se baja en un negocio con el extra.
const RutasBillar = lazy(() => import("./pages/billar/RutasBillar"));
const SupervisionBillar = lazy(() => import("./pages/billar/supervision/Supervision"));
const PantallaSalonBillar = lazy(() => import("./pages/billar/PantallaSalon"));
const MesasBillar = lazy(() => import("./pages/billar/admin/MesasBillar"));
// Reportes: veintipico de pantallas con sus gráficos; se bajan al entrar.
const Reportes = lazy(() => import("./pages/reportes/Reportes"));
// Educación (PLAN-ACADEMIAS-TECNICO §8): sólo se bajan en un instituto.
const GruposAcademia = lazy(() => import("./pages/academia/Grupos"));
const CalendarioAcademia = lazy(() => import("./pages/academia/Calendario"));
const MisClases = lazy(() => import("./pages/academia/docente/MisClases"));
const PasarLista = lazy(() => import("./pages/academia/docente/PasarLista"));
const NotasAcademia = lazy(() => import("./pages/academia/Notas"));
const PlanillaMes = lazy(() => import("./pages/academia/planilla/PlanillaMes"));
const PlanillaDocente = lazy(() => import("./pages/academia/planilla/PlanillaDocente"));
const ControlAcademia = lazy(() => import("./pages/academia/control/Control"));
const ReportesAcademia = lazy(() => import("./pages/academia/control/Reportes"));
const GrupoAcademia = lazy(() => import("./pages/academia/Grupo"));
const AlumnosAcademia = lazy(() => import("./pages/academia/Alumnos"));
const FichaAlumno = lazy(() => import("./pages/academia/FichaAlumno"));
const Preinscripciones = lazy(() => import("./pages/academia/Preinscripciones"));
const CobranzaAcademia = lazy(() => import("./pages/academia/Cobranza"));
const CobrarAcademia = lazy(() => import("./pages/academia/Cobrar"));
const CarrerasAcademia = lazy(() => import("./pages/academia/config/Carreras"));
const AjustesAcademia = lazy(() => import("./pages/academia/config/AjustesAcademia"));

/** Una pantalla de la academia: con su sección y bajada aparte. */
function Academia({ seccion, children }: { seccion: Seccion; children: React.ReactNode }) {
  return (
    <Protegida seccion={seccion}>
      <Suspense fallback={null}>{children}</Suspense>
    </Protegida>
  );
}

/** Una ruta que se mudó: lleva a la nueva con lo que traía (`?inscripcion=…`). */
function RedirigeConBusqueda({ a }: { a: string }) {
  const { search } = useLocation();
  return <Navigate to={`${a}${search}`} replace />;
}

/**
 * Reportes es la única pantalla de reportes (13-oct-2026) y entra quien ve al
 * menos uno (`veReportes`): también la recepción, que tiene los de la agenda
 * sin el permiso general. Adentro, cada reporte pide lo suyo.
 */
function ProtegidaReportes({ children }: { children: React.ReactNode }) {
  const { puede } = useAuth();
  if (!veReportes(puede)) return <Inicio />;
  return <>{children}</>;
}

/** Manda a cada quien a su pantalla, según sus permisos (ver `rutaInicial`). */
function Inicio() {
  const { usuario, negocio } = useAuth();
  if (!usuario) return <Navigate to="/" replace />;
  const destino = rutaInicial({
    features: negocio?.features,
    rubro: negocio?.tipoNegocio,
    permisos: usuario.permisos,
    permisosPropios: usuario.permisosPropios,
  });
  return <Navigate to={destino} replace />;
}

/**
 * Ni los permisos ni el plan habilitan una sola sección. Pasa con un rol sin
 * permisos (un "Ayudante" al que le dieron acceso) o una cuenta mal
 * configurada; sin esta pantalla el usuario vería un blanco y no sabría a
 * quién reclamarle.
 */
function SinAcceso() {
  const { usuario, negocio, logout } = useAuth();
  const rol = usuario?.rolNombre?.trim();
  // Si mientras tanto llegaron los permisos (una sesión vieja que los pidió a
  // /auth/me, o el dueño le dio un rol con algo), se va a su inicio solo.
  const destino = usuario
    ? rutaInicial({
        features: negocio?.features,
        rubro: negocio?.tipoNegocio,
        permisos: usuario.permisos,
        permisosPropios: usuario.permisosPropios,
      })
    : "/";
  if (destino !== "/sin-acceso") return <Navigate to={destino} replace />;
  // En un salón que todavía no tiene la agenda, quien no ve nada es casi
  // siempre el profesional: el backend no le manda los permisos de una agenda
  // que el plan no incluye. Para él no es una cuenta mal configurada, es la
  // agenda que llega pronto.
  if (esBelleza(negocio?.tipoNegocio) && !negocio?.features?.includes("agenda")) return <AgendaPronto />;
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-bold text-texto">Tu cuenta no tiene secciones</h1>
        <p className="mt-2 text-[13px] text-texto-3">
          {rol ? `El rol "${rol}"` : "Tu rol"} no tiene permisos para ninguna sección de este
          negocio. Pedile al administrador que revise los permisos del rol o el plan contratado.
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
 * Una sección que los permisos o el plan no habilitan no se renderiza: el
 * backend igual respondería 403, y es mejor devolver a la pantalla de inicio
 * que mostrar un error después de cargar.
 */
function Protegida({ seccion, children }: { seccion: Seccion; children: React.ReactNode }) {
  const { puede } = useAuth();
  if (!puede(seccion)) return <Inicio />;
  return <>{children}</>;
}

/**
 * "/mi-agenda" es una sola ruta para quien ve sólo su agenda: la suya si el
 * negocio tiene la feature `agenda` (la sección `mi_agenda`), y si no el aviso
 * de que llega pronto. Así prender la agenda desde el panel le cambia la
 * pantalla sin cambiarle a dónde entra. Quien no ve sólo su agenda —se llame
 * como se llame su rol— vuelve a su inicio.
 */
function MiAgendaOPronto() {
  const { puede, usuario } = useAuth();
  if (puede("mi_agenda")) return <MiAgenda />;
  if (veSoloSuAgenda(usuario)) return <AgendaPronto />;
  return <Inicio />;
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
 * bloqueo). Es la misma pantalla que se ve deslogueado, con el alias escrito a
 * mano también acá (no se toma el de la sesión); sólo cambia a dónde vuelve.
 */
function PagarConSesion() {
  return <PagarLicencia onSalir={() => window.history.back()} />;
}

function Rutas() {
  const { token, permisosListos } = useAuth();
  const navigate = useNavigate();
  const teniaSesion = useRef(token !== null);
  // Tocar una notificación con la app abierta la lleva a la pantalla del aviso.
  useNavegarDesdePush();

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

  // La página pública del negocio (`/p/…`) no llega acá: la atiende App.tsx
  // antes de cargar la app, sin sesión y sin login.
  if (!token) return <Login />;
  // Una sesión vieja sin permisos los está trayendo de /auth/me: sin esperar,
  // el inicio la mandaría a "sin acceso" un segundo antes de tener su menú.
  if (!permisosListos) return <div className="min-h-dvh bg-fondo" aria-busy="true" />;

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
      <Route path={RUTA_AGENDA_PRONTO} element={<MiAgendaOPronto />} />

      {/* Fuera del Layout: la pantalla del salón del billar es para una TV,
          a pantalla completa y sin montos (BILLAR_MODULO_SPEC §7.11). */}
      <Route
        path="/billar/salon"
        element={
          <Protegida seccion="billar">
            <Suspense fallback={<div className="min-h-dvh bg-[#06281D]" />}>
              <PantallaSalonBillar />
            </Suspense>
          </Protegida>
        }
      />

      <Route element={<LayoutSegunRubro />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/sin-acceso" element={<SinAcceso />} />
        {/* Sin `Protegida`: son los avisos de quien está sentado, y la lista
            ya viene filtrada por el backend según su rol (PLAN-PUSH §10.2). */}
        <Route
          path="/notificaciones"
          element={
            <Suspense fallback={null}>
              <Notificaciones />
            </Suspense>
          }
        />

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
        {/* Personal (PLAN-ROLES §9): la gente del negocio, con o sin login. */}
        <Route
          path="/personal"
          element={
            <Protegida seccion="personal">
              <Personal />
            </Protegida>
          }
        />
        {/* Fase 2: comisiones y liquidación, y los reportes de la agenda. */}
        <Route
          path="/comisiones"
          element={
            <Protegida seccion="comisiones">
              <Comisiones />
            </Protegida>
          }
        />
        {/* Los reportes de la agenda viven en Reportes, en su grupo: la
            dirección de antes (un favorito, un link viejo) lleva ahí. */}
        <Route
          path="/reportes-agenda"
          element={
            <Protegida seccion="reportes_agenda">
              <Navigate to="/reportes/profesionales" replace />
            </Protegida>
          }
        />

        {/* Billar: el tablero de las mesas y lo que cuelga de él (consumo,
            cierre, ventas del turno, venta rápida, cerrar caja). Ver pages/billar. */}
        <Route
          path="/billar/*"
          element={
            <Protegida seccion="billar">
              <Suspense fallback={null}>
                <RutasBillar />
              </Suspense>
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
              <ConPestanasConfig>
                <Almacenes />
              </ConPestanasConfig>
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

        {/* Billar: lo que hace la cajera, en vivo y sólo para mirar (del administrador). */}
        <Route
          path="/supervision-billar"
          element={
            <Protegida seccion="supervision_billar">
              <Suspense fallback={null}>
                <SupervisionBillar />
              </Suspense>
            </Protegida>
          }
        />

        {/* Billar: las mesas, las tarifas y los avisos (del administrador). */}
        <Route
          path="/mesas-billar"
          element={
            <Protegida seccion="mesas_billar">
              <Suspense fallback={null}>
                <MesasBillar />
              </Suspense>
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
          path="/configuracion/qr-cobro"
          element={
            <Protegida seccion="qr_cobro">
              <Suspense fallback={null}>
                <QrDeCobro />
              </Suspense>
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
        {/* Reportes (rediseño de oct-2026): una pantalla con su menú y cada
            reporte en su dirección (`/reportes/top-productos`). La sugerencia
            de compra y las mermas de la farmacia viven adentro, en su grupo. */}
        <Route
          path="/reportes/*"
          element={
            <ProtegidaReportes>
              <Suspense fallback={null}>
                <Reportes />
              </Suspense>
            </ProtegidaReportes>
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
        {/* Los roles del negocio (PLAN-ROLES-NEGOCIO): todas las verticales. */}
        <Route
          path="/roles"
          element={
            <Protegida seccion="roles">
              <Roles />
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
        {/* El asistente de la página (extra `asistente_pagina`, IDEAS/3b). */}
        <Route
          path="/mi-asistente"
          element={
            <Protegida seccion="mi_asistente">
              <Suspense fallback={null}>
                <MiAsistente />
              </Suspense>
            </Protegida>
          }
        />

        {/* CRM y promociones (PLAN-CRM-Y-PROMOCIONES). */}
        <Route
          path="/promociones"
          element={
            <Protegida seccion="promociones">
              <Suspense fallback={null}>
                <Promociones />
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
          path="/clientes-que-no-vuelven"
          element={
            <Protegida seccion="retencion">
              <Suspense fallback={null}>
                <Retencion />
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

        {/* Educación, ronda 1 (PLAN-ACADEMIAS-TECNICO §8): sólo con la
            feature `academia` (y `preinscripcion_online` para la bandeja). */}
        {/* "Hoy" salió (26-oct): sus clases del día viven arriba del Calendario. */}
        <Route path="/academia/hoy" element={<Navigate to="/academia/calendario" replace />} />
        {/* Ronda 2: el calendario reemplaza a la lista de grupos (que queda
            como "Ver como lista"); la ruta vieja lleva al calendario. */}
        <Route path="/academia/calendario" element={<Academia seccion="academia_calendario"><CalendarioAcademia /></Academia>} />
        <Route path="/academia/calendario/lista" element={<Academia seccion="academia_calendario"><GruposAcademia /></Academia>} />
        <Route path="/academia/grupos" element={<Navigate to="/academia/calendario" replace />} />
        <Route path="/academia/grupos/:id" element={<Academia seccion="academia_grupos"><GrupoAcademia /></Academia>} />
        {/* La lista y las notas desde el grupo (administración y recepción). */}
        <Route path="/academia/grupos/:id/lista" element={<Academia seccion="academia_grupos"><PasarLista /></Academia>} />
        <Route path="/academia/grupos/:id/notas" element={<Academia seccion="academia_grupos"><NotasAcademia /></Academia>} />
        {/* Lo del docente (alcance PROPIO). */}
        <Route path="/academia/mis-clases" element={<Academia seccion="academia_mis_clases"><MisClases /></Academia>} />
        <Route path="/academia/lista" element={<Academia seccion="academia_lista"><PasarLista /></Academia>} />
        <Route path="/academia/notas" element={<Academia seccion="academia_notas"><NotasAcademia /></Academia>} />
        {/* Control (el dueño). */}
        <Route path="/academia/planilla" element={<Academia seccion="academia_planilla"><ConPestanasConfig><PlanillaMes /></ConPestanasConfig></Academia>} />
        <Route path="/academia/planilla/:id" element={<Academia seccion="academia_planilla"><PlanillaDocente /></Academia>} />
        <Route path="/academia/control" element={<Academia seccion="academia_control"><ControlAcademia /></Academia>} />
        <Route path="/academia/reportes" element={<Academia seccion="academia_reportes"><ReportesAcademia /></Academia>} />
        <Route path="/academia/alumnos" element={<Academia seccion="academia_alumnos"><AlumnosAcademia /></Academia>} />
        <Route path="/academia/alumnos/:id" element={<Academia seccion="academia_alumnos"><FichaAlumno /></Academia>} />
        <Route
          path="/academia/preinscripciones"
          element={<Academia seccion="academia_preinscripciones"><Preinscripciones /></Academia>}
        />
        <Route path="/academia/cobranza" element={<Academia seccion="academia_cobranza"><CobranzaAcademia /></Academia>} />
        <Route path={RUTA_COBRAR} element={<Academia seccion="academia_cobrar"><CobrarAcademia /></Academia>} />
        {/* La ruta de antes de unir Cobrar con Cobranza (26-oct): un enlace guardado sigue andando. */}
        <Route path="/academia/cobrar" element={<RedirigeConBusqueda a={RUTA_COBRAR} />} />
        <Route path="/configuracion/carreras" element={<Academia seccion="academia_carreras"><ConPestanasConfig><CarrerasAcademia /></ConPestanasConfig></Academia>} />
        <Route path="/configuracion/academia" element={<Academia seccion="academia_ajustes"><ConPestanasConfig><AjustesAcademia /></ConPestanasConfig></Academia>} />
        {/* Configuración (26-oct): una entrada en el menú, con una pestaña por pantalla. */}
        <Route path="/academia/configuracion" element={<InicioConfig />} />

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

/** Ya dentro del `BrowserRouter` de App.tsx. */
export default function AppConSesion() {
  return (
    <AuthProvider>
      {/* La versión nueva de un deploy, al pasar a otra pantalla (todas: también
          las que no tienen el menú, como el salón del mesero). */}
      <ActualizarAlNavegar />
      <SinPantallaEnBlanco>
        <Rutas />
      </SinPantallaEnBlanco>
    </AuthProvider>
  );
}
