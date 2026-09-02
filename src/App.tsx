import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { rutaInicial } from "./lib/permisos";
import Login from "./pages/Login";
import Dashboard from "./pages/inventario/Dashboard";
import { AuthProvider, useAuth } from "./store/AuthContext";

/** Manda a cada rol a su pantalla: cajero al POS, repartidor a entregas. */
function Inicio() {
  const { usuario } = useAuth();
  return <Navigate to={usuario ? rutaInicial(usuario.rol) : "/"} replace />;
}

function Rutas() {
  const { token } = useAuth();

  if (!token) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/inventario" element={<Dashboard />} />
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
