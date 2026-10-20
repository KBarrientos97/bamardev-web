import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon, type NombreIcono } from "../../components/Icon";
import PoweredByBamarDev from "../../components/PoweredByBamarDev";
import { Boton } from "../../components/ui";
import {
  aliasDeLaDireccion,
  bienvenidaVista,
  dejarBienvenidaPendiente,
  olvidarCodigoDeEntrada,
  tomarCodigoDeEntrada,
} from "../../lib/alta/entrada";
import { useAuth } from "../../store/AuthContext";
import type { LoginResponse } from "../../types";

/**
 * `/entrar#c=<código>`: a dónde salta la landing con la cuenta recién creada
 * (PLAN-ALTA-LANDING). Canjea el código de un solo uso, deja la sesión igual
 * que el login y manda al inicio del usuario, donde lo espera la bienvenida
 * con su código de negocio.
 *
 * Se atiende con o sin sesión: en una compu que ya tenía otra abierta, la
 * cuenta nueva la reemplaza, igual que si se entrara por el login.
 */
export default function Entrar() {
  const { entrarConCodigo, token } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  // Se lee una vez, al montar: después del canje el código se olvida, y
  // leerlo de nuevo en un re-render caería en el aviso de "ya se usó".
  const [codigo] = useState(() => tomarCodigoDeEntrada());
  /**
   * "codigo": el backend lo rechazó (vencido, usado o inválido) y no hay más
   * que hacer con él. "red": no se llegó al backend; el código puede seguir
   * vivo, así que se ofrece reintentar.
   */
  const [fallo, setFallo] = useState<"codigo" | "red" | null>(codigo ? null : "codigo");
  const [intento, setIntento] = useState(0);
  // El código es de un solo uso: el doble montaje de StrictMode (o un
  // re-render) no puede mandarlo dos veces, porque la segunda respondería
  // "ya se usó" encima de una entrada que salió bien. El pedido se guarda y
  // cada montaje se cuelga del mismo; sólo "Reintentar" arma otro.
  const pedido = useRef<{ intento: number; promesa: Promise<LoginResponse> } | null>(null);

  useEffect(() => {
    if (!codigo) return;
    if (pedido.current?.intento !== intento) {
      const promesa = entrarConCodigo(codigo);
      promesa.then(
        () => olvidarCodigoDeEntrada(),
        (e: { status?: number }) => {
          if (e?.status !== 0) olvidarCodigoDeEntrada();
        },
      );
      pedido.current = { intento, promesa };
    }
    let vivo = true;
    pedido.current.promesa.then(
      (res) => {
        if (!vivo) return;
        if (!bienvenidaVista(res.negocio.id, res.usuario.id)) {
          dejarBienvenidaPendiente({
            negocioId: res.negocio.id,
            usuarioId: res.usuario.id,
            alias: res.negocio.alias ?? "",
            usuario: res.usuario.username,
            nombreNegocio: res.negocio.nombre,
            vence: res.licencia?.vencimiento ?? null,
          });
        }
        // Al inicio y no a una pantalla fija: de ahí cada uno va a la suya
        // según sus permisos y su rubro (ver `Inicio` en AppNegocio).
        navigate("/", { replace: true });
      },
      (e: { status?: number }) => {
        // `status` 0 es el ApiError de la red caída (ver `publico` en api.ts).
        if (vivo) setFallo(e?.status === 0 ? "red" : "codigo");
      },
    );
    return () => {
      vivo = false;
    };
  }, [codigo, intento, entrarConCodigo, navigate]);

  // Sin código pero con sesión (volvió a /entrar con el botón Atrás, o lo
  // abrió de nuevo después de entrar): nada que canjear, sigue en la app.
  useEffect(() => {
    if (fallo === "codigo" && !codigo && token) navigate("/", { replace: true });
  }, [fallo, codigo, token, navigate]);

  if (!fallo) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-fondo px-5" aria-busy="true">
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary motion-reduce:animate-none" />
        <p className="text-sm text-texto-3">Entrando a tu cuenta…</p>
      </div>
    );
  }

  const alias = aliasDeLaDireccion(search);
  const irAlLogin = () =>
    // Al login de siempre. El alias viaja en el estado de la navegación y no
    // en la URL: es sólo para prellenar.
    navigate("/", { replace: true, state: alias ? { alias } : null });

  if (fallo === "red") {
    return (
      <Aviso icono="alert" titulo="No pudimos conectar" texto="Revisá tu internet y probá de nuevo.">
        <Boton
          type="button"
          className="w-full"
          onClick={() => {
            setFallo(null);
            setIntento((n) => n + 1);
          }}
        >
          Reintentar
        </Boton>
        <button
          type="button"
          onClick={irAlLogin}
          className="w-full text-center text-[13px] font-semibold text-texto-3 hover:text-texto"
        >
          Ir a iniciar sesión
        </button>
      </Aviso>
    );
  }

  return (
    <Aviso
      icono="key"
      titulo="El enlace ya se usó o venció"
      texto={
        <>
          Tu cuenta está bien. Entrá con tu código de negocio, el usuario{" "}
          <strong className="font-semibold text-texto">admin</strong> y tu contraseña.
        </>
      }
    >
      <Boton type="button" className="w-full" onClick={irAlLogin}>
        Ir a iniciar sesión
      </Boton>
    </Aviso>
  );
}

/** La tarjeta de los avisos, con el mismo fondo y marca que el login. */
function Aviso({
  icono,
  titulo,
  texto,
  children,
}: {
  icono: NombreIcono;
  titulo: string;
  texto: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-primary-50 via-white to-fondo px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="card space-y-4 p-6 text-center shadow-lg" role="alert">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary">
            <Icon name={icono} size={22} />
          </span>
          <div>
            <h1 className="text-lg font-bold text-texto">{titulo}</h1>
            <p className="mt-1.5 text-sm leading-snug text-texto-2">{texto}</p>
          </div>
          {children}
        </div>
        <div className="mt-8 flex justify-center">
          <PoweredByBamarDev />
        </div>
      </div>
    </div>
  );
}
