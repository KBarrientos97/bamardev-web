import { useEffect, useState } from "react";
import { Outlet, Route, Routes, useParams } from "react-router-dom";
import { apiReserva, ErrorReserva, type NegocioPublico } from "./apiReserva";
import Gestion from "./Gestion";
import { Marco, NoDisponible } from "./piezas";
import { NegocioCtx, type ContextoNegocio } from "./util";
import Portada from "./Portada";
import Privacidad from "./Privacidad";
import Reservar from "./Reservar";

/**
 * La página pública de reservas (PLAN-AGENDA-BELLEZA §8, PLAN-DESARROLLO-
 * BELLEZA §11): vive dentro de la app web en `/r/<subdominio>…` hasta que
 * exista `link.bamardev.com`.
 *
 *   /r/:sub                    portada mínima con Reservar
 *   /r/:sub/reservar[/:suc]    P2-P6
 *   /r/:sub/c/:token           P7, el enlace de gestión
 *   /r/:sub/privacidad         la política del negocio
 *
 * Se carga diferida (`lazy` en App.tsx) y sin el AuthProvider de la app: no
 * hay sesión, ni redirección al login, ni nada de la app en este bundle.
 */
export default function ReservaPublica() {
  return (
    <Routes>
      <Route path=":subdominio" element={<ConNegocio />}>
        <Route index element={<Portada />} />
        <Route path="reservar" element={<Reservar />} />
        <Route path="reservar/:sucursal" element={<Reservar />} />
        <Route path="c/:token" element={<Gestion />} />
        <Route path="privacidad" element={<Privacidad />} />
        <Route path="*" element={<SinPagina />} />
      </Route>
      <Route path="*" element={<SinPagina />} />
    </Routes>
  );
}

/** Carga el negocio una vez para todas sus páginas. */
function ConNegocio() {
  const { subdominio = "" } = useParams();
  const sub = subdominio.toLowerCase();
  const [estado, setEstado] = useState<Omit<ContextoNegocio, "sub">>({
    datos: null,
    cargando: true,
    error: "",
    noDisponible: false,
  });

  useEffect(() => {
    let vigente = true;
    setEstado({ datos: null, cargando: true, error: "", noDisponible: false });
    apiReserva
      .negocio(sub)
      .then((datos: NegocioPublico) => vigente && setEstado({ datos, cargando: false, error: "", noDisponible: false }))
      .catch((e: unknown) => {
        if (!vigente) return;
        const noDisponible = e instanceof ErrorReserva && e.status === 404;
        setEstado({ datos: null, cargando: false, error: (e as Error).message, noDisponible });
      });
    return () => {
      vigente = false;
    };
  }, [sub]);

  return (
    <NegocioCtx.Provider value={{ sub, ...estado }}>
      <Outlet />
    </NegocioCtx.Provider>
  );
}

function SinPagina() {
  return (
    <Marco datos={null}>
      <NoDisponible />
    </Marco>
  );
}
