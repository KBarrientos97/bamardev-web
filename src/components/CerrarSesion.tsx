import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { porSubir, sinSenal, useColaOffline } from "../lib/offline/cola";
import { tienePermiso } from "../lib/permisos";
import { useAuth } from "../store/AuthContext";
import { Boton, Modal } from "./ui";

/**
 * Cuánto se espera a saber si hay caja abierta antes de dejar salir igual. El
 * pedido común tiene 20 s de techo: con el wifi del local caído el cajero se
 * quedaría mirando un botón que no hace nada.
 */
const ESPERA_CAJA_MS = 5_000;

/**
 * ¿Quien cierra sesión tiene una caja abierta? true o false si el servidor
 * contestó; null si no se pudo saber (sin internet, un error, la licencia
 * vencida, o tarda demasiado).
 *
 * Con null se deja salir: un candado que no se puede abrir deja al cajero
 * atrapado adentro de la app, que es lo que le pasó a la de Android con el
 * bloqueo de cierre de caja. El aviso es una ayuda, no una cerradura.
 */
export async function cajaAbiertaAlSalir(espera = ESPERA_CAJA_MS): Promise<boolean | null> {
  if (sinSenal()) return null;
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tarde = new Promise<"tarde">((listo) => {
    reloj = setTimeout(() => listo("tarde"), espera);
  });
  try {
    const r = await Promise.race([api.cajaActual(), tarde]);
    return r === "tarde" ? null : r.caja != null;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

/** Con la caja abierta: no se puede cerrar hasta que suban (ver `PantallaCierre`). */
function sinSubirConCaja(n: number): string {
  return n === 1
    ? "Además, hay 1 venta cobrada sin internet que todavía no subió: sube sola cuando vuelva la conexión, y recién ahí se puede cerrar la caja."
    : `Además, hay ${n} ventas cobradas sin internet que todavía no subieron: suben solas cuando vuelva la conexión, y recién ahí se puede cerrar la caja.`;
}

/** Sin caja abierta (o sin saberlo): se deja salir, pero sabiendo qué pasa con ellas. */
function sinSubirAlSalir(n: number): string {
  return n === 1
    ? "Hay 1 venta cobrada sin internet que todavía no subió. Si cerrás sesión queda guardada en este equipo y sube recién cuando vuelvas a entrar con tu usuario y haya internet."
    : `Hay ${n} ventas cobradas sin internet que todavía no subieron. Si cerrás sesión quedan guardadas en este equipo y suben recién cuando vuelvas a entrar con tu usuario y haya internet.`;
}

/**
 * "Cerrar sesión" del menú (CAJA-3 / USR-08, 28-oct).
 *
 * En el restaurante no se sale con la caja abierta, como en la app
 * (`VentasActivity.logout`): la caja es de quien la abrió, así que al volver a
 * entrar —aunque sea al otro día— seguía vendiendo en el mismo turno, y el
 * arqueo mezclaba los dos días. El aviso ofrece ir al cierre.
 *
 * Si además hay ventas cobradas sin internet que no subieron (la app del
 * iPhone), se dice: cerrar sesión no las borra, pero sólo suben con la sesión
 * de quien las cobró (ver `sesionLocal`). Sin caja abierta, se avisa y se deja
 * salir igual.
 *
 * Los demás rubros salen como siempre, con un toque: el cambio se pidió para
 * el restaurante.
 *
 * `antesDeAvisar`: lo que hay que hacer antes de mostrar un aviso. El Layout
 * cierra ahí el cajón del celular, que si no queda encima del diálogo.
 */
export function useCerrarSesion({ antesDeAvisar }: { antesDeAvisar?: () => void } = {}) {
  const { logout, usuario, rubro } = useAuth();
  const navigate = useNavigate();
  const pendientes = porSubir(useColaOffline()).length;
  const [revisando, setRevisando] = useState(false);
  const [aviso, setAviso] = useState<"caja" | "sinSubir" | null>(null);

  async function pedir() {
    if (revisando) return;
    if (rubro !== "RESTAURANTE") return logout();
    // Sin `caja.operar` (el repartidor, el mesero) no hay caja que preguntar:
    // el backend respondería 403 y sería una espera para nada.
    if (tienePermiso(usuario, "caja.operar")) {
      setRevisando(true);
      const abierta = await cajaAbiertaAlSalir();
      setRevisando(false);
      if (abierta) {
        antesDeAvisar?.();
        return setAviso("caja");
      }
    }
    if (pendientes > 0) {
      antesDeAvisar?.();
      return setAviso("sinSubir");
    }
    logout();
  }

  function irAlCierre() {
    setAviso(null);
    // El POS abre el cierre al llegar con este pedido (ver `Pos.tsx`).
    navigate("/pos", { state: { pantalla: "cierre" } });
  }

  const cancelar = () => setAviso(null);

  const dialogo =
    aviso === "caja" ? (
      <Modal
        abierto
        titulo="Caja abierta"
        onClose={cancelar}
        ancho="max-w-sm"
        acciones={
          <>
            <Boton variante="ghost" onClick={cancelar}>
              Cancelar
            </Boton>
            <Boton icono="lock" onClick={irAlCierre}>
              Ir al cierre de caja
            </Boton>
          </>
        }
      >
        <div className="space-y-2 text-sm text-texto-2">
          <p>
            No podés cerrar sesión con la caja abierta. Primero cerrá la caja: si no, el turno de hoy se
            mezcla con el de mañana.
          </p>
          {pendientes > 0 && <p className="font-semibold text-warning-text">{sinSubirConCaja(pendientes)}</p>}
        </div>
      </Modal>
    ) : aviso === "sinSubir" ? (
      <Modal
        abierto
        titulo="Ventas sin subir"
        onClose={cancelar}
        ancho="max-w-sm"
        acciones={
          <>
            <Boton variante="ghost" onClick={cancelar}>
              Cancelar
            </Boton>
            <Boton
              variante="danger"
              onClick={() => {
                setAviso(null);
                logout();
              }}
            >
              Cerrar sesión igual
            </Boton>
          </>
        }
      >
        <p className="text-sm text-texto-2">{sinSubirAlSalir(pendientes)}</p>
      </Modal>
    ) : null;

  return { pedir, revisando, dialogo };
}
