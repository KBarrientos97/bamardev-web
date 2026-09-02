import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { rutaInicial, type Seccion } from "./lib/permisos";
import Login from "./pages/Login";
import Almacenes from "./pages/inventario/Almacenes";
import Dashboard from "./pages/inventario/Dashboard";
import Insumos from "./pages/inventario/Insumos";
import Movimientos from "./pages/inventario/Movimientos";
import Productos from "./pages/inventario/Productos";
import Pos from "./pages/pos/Pos";
import Repartidor from "./pages/repartidor/Repartidor";
import { AuthProvider, useAuth } from "./store/AuthContext";

/** Manda a cada rol a su pantalla: cajero al POS, repartidor a entregas. */
function Inicio() {
  const { usuario } = useAuth();
  return <Navigate to={usuario ? rutaInicial(usuario.rol) : "/"} replace />;
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
