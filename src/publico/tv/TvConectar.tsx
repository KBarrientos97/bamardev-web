import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../../components/Icon";
import { codigoParaVer } from "../../lib/tickets/codigoTv";
import { apiTv, ErrorTv, type TvConectada, type TvEsperando } from "./apiTv";
import { useAlDia, useMantenerEncendida } from "./pantalla";
import { PantallaMenuTv } from "./TvMenu";
import { PantallaConLlave } from "./TvTickets";

/** Esperando su código: pregunta seguido, para cambiar apenas la conectan. */
const ESPERANDO_MS = 3_000;
/** Conectada: pregunta de vez en cuando, por si le cambian lo que muestra. */
const CONECTADA_MS = 20_000;
/** Sin servidor, ni conectada ni con código: reintenta sin apurar. */
const SIN_CONEXION_MS = 5_000;

const CLAVE_SECRETO = "bamardev.tv.televisor";

/**
 * El secreto de esta TV: en la dirección (`/tv?tv=…`) y en el navegador.
 *
 * Los dos a propósito: el navegador de algunos televisores borra lo guardado
 * al apagarse, pero reabre la última página. Con uno solo, cada mañana la TV
 * amanecía pidiendo otro código y había que subirse a conectarla de nuevo.
 */
function leerSecreto(): string | null {
  const enUrl = new URLSearchParams(window.location.search).get("tv");
  if (enUrl && /^[A-Za-z0-9_-]{20,64}$/.test(enUrl)) return enUrl;
  try {
    return window.localStorage.getItem(CLAVE_SECRETO);
  } catch {
    return null;
  }
}

function guardarSecreto(secreto: string | null) {
  try {
    if (secreto) window.localStorage.setItem(CLAVE_SECRETO, secreto);
    else window.localStorage.removeItem(CLAVE_SECRETO);
  } catch {
    // Sin almacenamiento (modo privado, TV vieja): queda la dirección.
  }
  window.history.replaceState(null, "", secreto ? `/tv?tv=${encodeURIComponent(secreto)}` : "/tv");
}

/**
 * La TV del restaurante conectada con código (Kevin, 4-nov): `/tv`, sin
 * enlace largo. Las TVs van colgadas arriba y escribir la llave entera con el
 * control remoto era un castigo.
 *
 * La TV pide un código y lo muestra en grande; el encargado lo escribe en el
 * celular (Tickets y pedidos o Menú digital → Conectar una TV) y elige qué va
 * a mostrar. Desde ahí la TV abre esa pantalla —la de tickets o una del menú,
 * las mismas del enlace de siempre— y cada 20 s pregunta si se la cambiaron.
 * Si la desconectan, vuelve a mostrar un código.
 *
 * Sólo para las pantallas del restaurante: la TV del billar sigue con su
 * enlace.
 */
export default function TvConectar() {
  const [estado, setEstado] = useState<TvEsperando | TvConectada | null>(null);
  const [sinConexion, setSinConexion] = useState(false);

  useEffect(() => {
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout> | null = null;
    let conectada = false;
    const vuelta = async () => {
      let espera = ESPERANDO_MS;
      try {
        const secreto = leerSecreto();
        if (!secreto) {
          const nueva = await apiTv.televisorNuevo();
          if (!vivo) return;
          guardarSecreto(nueva.secreto);
          setEstado({ estado: "ESPERANDO", codigo: nueva.codigo, venceEn: nueva.venceEn });
          conectada = false;
        } else {
          const r = await apiTv.televisor(secreto);
          if (!vivo) return;
          // Que la dirección lo lleve aunque haya venido sólo del navegador.
          if (!window.location.search.includes(secreto)) guardarSecreto(secreto);
          setEstado(r);
          conectada = r.estado === "CONECTADA";
          if (conectada) espera = CONECTADA_MS;
        }
        setSinConexion(false);
      } catch (e) {
        if (!vivo) return;
        if (e instanceof ErrorTv && e.status === 404) {
          // La desconectaron (o el secreto es de una TV borrada): otro código, ya.
          guardarSecreto(null);
          setEstado(null);
          conectada = false;
          espera = 0;
        } else {
          // Conectada, sigue mostrando lo suyo: la pantalla avisa si no llegan datos.
          setSinConexion(true);
          espera = conectada ? CONECTADA_MS : SIN_CONEXION_MS;
        }
      } finally {
        if (vivo) reloj = setTimeout(() => void vuelta(), espera);
      }
    };
    void vuelta();
    return () => {
      vivo = false;
      if (reloj) clearTimeout(reloj);
    };
  }, []);

  if (estado?.estado === "CONECTADA") {
    const sucursalId = estado.sucursalId ?? undefined;
    // La llave en la `key`: si se regenera, la pantalla arranca de nuevo con
    // la nueva en vez de quedarse en "ya no está habilitada".
    return estado.muestra === "MENU" && estado.menu != null ? (
      <PantallaMenuTv
        key={`menu-${estado.menu}-${estado.llave}-${sucursalId}`}
        llave={estado.llave}
        numero={estado.menu}
        sucursalId={sucursalId}
      />
    ) : (
      <PantallaConLlave key={`tickets-${estado.llave}-${sucursalId}`} llave={estado.llave} sucursalId={sucursalId} />
    );
  }
  return <EsperandoCodigo codigo={estado?.codigo ?? null} sinConexion={sinConexion} />;
}

/** El código en grande, para leerlo desde abajo, y cómo se usa. */
function EsperandoCodigo({ codigo, sinConexion }: { codigo: string | null; sinConexion: boolean }) {
  // Lo de cualquier pantalla de TV, mientras espera: la conectada ya lo hace.
  useMantenerEncendida();
  useAlDia();
  useEffect(() => {
    document.title = "Conectar la TV";
  }, []);

  if (!codigo) {
    return (
      <Fondo>
        <h1 className="text-2xl font-extrabold sm:text-3xl 2xl:text-5xl">
          {sinConexion ? "Sin conexión con el servidor" : "Preparando la TV…"}
        </h1>
        {sinConexion && <p className="text-lg text-white/75 2xl:text-2xl">Se vuelve a intentar sola.</p>}
      </Fondo>
    );
  }
  return (
    <Fondo>
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-white/80 2xl:h-24 2xl:w-24">
        <Icon name="pantalla" size={30} />
      </span>
      <h1 className="text-2xl font-extrabold sm:text-4xl 2xl:text-6xl">Conectá esta TV</h1>
      <p
        className="rounded-3xl bg-white px-[5vw] py-[2vw] font-mono text-[12vw] font-black leading-none tracking-[0.12em] text-[#1A1210]"
        aria-label={`Código ${codigo.split("").join(" ")}`}
      >
        {codigoParaVer(codigo)}
      </p>
      <ol className="max-w-3xl space-y-2 text-left text-lg text-white/85 sm:text-2xl 2xl:text-4xl">
        <li>
          1. En el celular, abrí <b>Tickets y pedidos</b> o <b>Menú digital</b>.
        </li>
        <li>
          2. Tocá <b>Conectar una TV</b> y escribí este código.
        </li>
        <li>3. Elegí qué va a mostrar: la TV cambia sola.</li>
      </ol>
      <p className="text-sm text-white/55 sm:text-base 2xl:text-2xl">
        {sinConexion ? "Sin conexión con el servidor: se vuelve a intentar sola." : "El código cambia cada 15 minutos."}
      </p>
    </Fondo>
  );
}

function Fondo({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#1A1210] px-6 py-8 text-center text-white 2xl:gap-10">
      {children}
    </div>
  );
}
