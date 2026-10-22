import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { abrirHojaCupo } from "./hojaCupo";

/**
 * `?creditos=comprar` en cualquier pantalla de la app abre la hoja de comprar
 * créditos (Plan Emprendedor). Es a donde llevan las push del cupo
 * (`CUPO_80`, `CUPO_AGOTADO`, `CREDITOS_POCOS`, PLAN-PUSH §10.1-bis): el aviso
 * dice "comprá un paquete" y tocarlo tiene que dejar el QR a un toque, no en
 * el inicio buscando el chip.
 *
 * Se abre por el mismo evento que el chip (`abrirHojaCupo`), así la dibuja el
 * `HojaCupoHost` de siempre, y después se saca el parámetro: un "atrás" o una
 * recarga no la vuelven a abrir.
 */
export const PARAM_CREDITOS = "creditos";

export function pideComprarCreditos(search: string): boolean {
  return new URLSearchParams(search).get(PARAM_CREDITOS) === "comprar";
}

export function useCreditosDesdeUrl(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const pide = pideComprarCreditos(location.search);
  const ultima = useRef(location);
  useEffect(() => {
    ultima.current = location;
  });
  useEffect(() => {
    if (!pide) return;
    // Sin `agotado`: es "comprar cuando uno quiere", como tocar el chip.
    abrirHojaCupo();
    // El parámetro se saca en el turno siguiente y sólo si sigue ahí. En "/"
    // el inicio ya está redirigiendo a la pantalla de cada uno (y lo pierde
    // solo): navegar en el mismo turno le pisaba esa redirección y la app
    // quedaba en "/" en blanco.
    const t = setTimeout(() => {
      const l = ultima.current;
      if (!pideComprarCreditos(l.search)) return;
      const resto = new URLSearchParams(l.search);
      resto.delete(PARAM_CREDITOS);
      const q = resto.toString();
      navigate({ pathname: l.pathname, search: q ? `?${q}` : "", hash: l.hash }, { replace: true });
    }, 0);
    return () => clearTimeout(t);
    // Una vez por pedido: `navigate` cambia con cada ruta y la volvería a abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pide]);
}
