import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { rutaInicial, type Seccion } from "./lib/permisos";
import Creditos from "./pages/Creditos";
import Login from "./pages/Login";
import Reportes from "./pages/Reportes";
import Usuarios from "./pages/Usuarios";
import Almacenes from "./pages/inventario/Almacenes";
import Categorias from "./pages/inventario/Categorias";
import Dashboard from "./pages/inventario/Dashboard";
import Insumos from "./pages/inventario/Insumos";
import Movimientos from "./pages/inventario/Movimientos";
import Productos from "./pages/inventario/Productos";
import Pos from "./pages/pos/Pos";
import Repartidor from "./pages/repartidor/Repartidor";
import { AuthProvider, useAuth } from "./store/AuthContext";

/** Manda a cada rol a su pantalla: cajero al POS, repartidor a entregas. */
function Inicio() {
  const { usuario, negocio } = useAuth();
  if (!usuario) return <Navigate to="/" replace />;
  const destino = rutaInicial({
    rol: usuario.rol,
    modulos: usuario.modulos,
    features: negocio?.features,
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

function Rutas() {
  const { token } = useAuth();

  if (!token) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
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

        <Route
          path="/reparto"
          element={
            <Protegida seccion="reparto">
              <Repartidor />
            </Protegida>
          }
        />

        <Route
          path="/inventario"
          element={
            <Protegida seccion="inventario">
              <Dashboard />
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
          path="/inventario/movimientos"
          element={
            <Protegida seccion="movimientos">
              <Movimientos />
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
          path="/reportes"
          element={
            <Protegida seccion="reportes">
              <Reportes />
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

        {/* Cualquier ruta desconocida vuelve al inicio del rol. */}
        <Route path="*" element={<Inicio />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Rutas />
      </AuthProvider>
    </BrowserRouter>
  );
}
