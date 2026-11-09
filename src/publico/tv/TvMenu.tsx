import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { armarAnimacion, conAnimacion, mezclarEdicion } from "../../lib/menuDigital/animado";
import { paginar } from "../../lib/menuDigital/paginar";
import { coloresMenu } from "../../lib/menuDigital/colores";
import { useRelojEscenas } from "../../lib/menuDigital/useRelojEscenas";
import { TableroAnimado } from "../../pages/menu-digital/TableroAnimado";
import { TableroMenu } from "../../pages/menu-digital/TableroMenu";
import { LienzoTv } from "../../pages/tickets/TableroTv";
import type { MenuPublicoApi, PantallaMenu } from "../../types/menuDigital";
import { apiTv, ErrorTv, urlPublica } from "./apiTv";
import { useAlDia, useMantenerEncendida, usePantallaCompleta } from "./pantalla";
import { llaveConForma, sucursalDeLaDireccion } from "./TvBillar.datos";

/**
 * Las TVs del menú digital, SIN sesión: `/tv/menu/<llave>/<número>`. Sin
 * número, la pantalla pregunta "¿Qué pantalla es esta?" con un botón por TV:
 * se enchufa el televisor, se abre el enlace y se elige una vez.
 *
 * Pregunta cada 30 segundos (un precio nuevo o un agotado no es urgente como
 * un número llamado) y, si no entra todo, pasa de página sola.
 */
export default function RutasMenu() {
  return (
    <Routes>
      <Route path=":llave" element={<Selector />} />
      <Route path=":llave/:numero" element={<TvMenu />} />
    </Routes>
  );
}

const CADA_MS = 30_000;

type FaseTv = "cargando" | "lista" | "anulada" | "sinConexion";

/**
 * Lo que puede hacer con esta página la vista previa del editor de Android,
 * que la lleva adentro de un WebView con `?vista=previa`. Una TV de verdad no
 * lo tiene.
 *
 * Antes, para mostrar un cambio, la app esperaba el guardado (0,7 s), 1,2 s
 * más y recargaba la página entera: el dueño tocaba "Lista" y la TV seguía en
 * "Fotos" varios segundos, y después pasaba por "Cargando el menú…".
 */
export interface PuenteVistaPrevia {
  /** La pantalla tal como se está editando: se dibuja ya, sin esperar el guardado. */
  pantalla: (p: Partial<PantallaMenu>) => boolean;
  /**
   * Pregunta otra vez ahora, sin recargar la página. Los platos que entran sí
   * dependen de lo guardado: las categorías, los ocultos y los agotados los
   * filtra el servidor.
   */
  recargar: () => boolean;
  /** "cargando" hasta la primera respuesta; la app tapa la TV con su aviso mientras tanto. */
  fase: () => FaseTv;
}

declare global {
  interface Window {
    bamardevTv?: PuenteVistaPrevia;
  }
}

function Selector() {
  const { llave = "" } = useParams();
  const [estado, setEstado] = useState<{ negocio: string; pantallas: { numero: number; nombre: string }[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!llaveConForma(llave)) return;
    apiTv
      .menus(llave)
      .then(setEstado)
      .catch((e) => setError(e instanceof ErrorTv && e.status === 404 ? "anulada" : "red"));
  }, [llave]);

  if (!llaveConForma(llave)) return <Mensaje titulo="Este enlace está incompleto">Copialo entero desde el Menú digital.</Mensaje>;
  if (error === "anulada") return <Mensaje titulo="Esta pantalla ya no está habilitada">Generá un enlace nuevo en el Menú digital.</Mensaje>;
  if (error) return <Mensaje titulo="No se pudo conectar">Revisá el internet del televisor y recargá la página.</Mensaje>;
  if (!estado) return <Mensaje titulo="Cargando…" />;
  if (!estado.pantallas.length) {
    return <Mensaje titulo="Todavía no hay pantallas armadas">Creá la primera en el Menú digital.</Mensaje>;
  }
  return (
    <Mensaje titulo="¿Qué pantalla es esta?">
      <p>Elegí el televisor para mostrar su menú.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {estado.pantallas.map((p) => (
          <Link
            key={p.numero}
            to={`${p.numero}`}
            className="rounded-full bg-[#FF9F1C] px-6 py-3 text-lg font-bold text-[#1A1210] hover:brightness-105"
          >
            {p.nombre}
          </Link>
        ))}
      </div>
    </Mensaje>
  );
}

function TvMenu() {
  const { llave = "", numero = "" } = useParams();
  const [params] = useSearchParams();
  return (
    <PantallaMenuTv
      llave={llave}
      numero={Number(numero)}
      sucursalId={sucursalDeLaDireccion(params.get("sucursal"))}
      vistaPrevia={params.get("vista") === "previa"}
    />
  );
}

/**
 * Una TV del menú con su llave y su número: la del enlace de siempre y la que
 * se conectó con código en `/tv` (TvConectar), que la abre con la llave que
 * le da el servidor.
 */
export function PantallaMenuTv({
  llave,
  numero: n,
  sucursalId,
  vistaPrevia = false,
}: {
  llave: string;
  numero: number;
  sucursalId?: number;
  vistaPrevia?: boolean;
}) {
  const [datos, setDatos] = useState<MenuPublicoApi | null>(null);
  const [fase, setFase] = useState<FaseTv>("cargando");
  const [pagina, setPagina] = useState(0);
  const [ayuda, setAyuda] = useState(true);
  /** La pantalla que manda el editor de Android (sólo en la vista previa). */
  const [enEdicion, setEnEdicion] = useState<Partial<PantallaMenu> | null>(null);
  const traerYa = useRef<() => void>(() => undefined);
  const faseActual = useRef<FaseTv>("cargando");
  const completa = usePantallaCompleta();
  useMantenerEncendida();
  useAlDia();

  useEffect(() => {
    if (!llaveConForma(llave) || !Number.isInteger(n)) return;
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout> | null = null;
    // Cada pregunta lleva su número: si la vista previa pide otra mientras
    // una sigue en camino, la vieja no pisa lo nuevo ni arma un segundo
    // reloj (que dejaría la página preguntando el doble para siempre).
    let vuelta = 0;
    const traer = async () => {
      if (reloj) clearTimeout(reloj);
      reloj = null;
      const esta = ++vuelta;
      try {
        const r = await apiTv.menu(llave, n, sucursalId);
        if (!vivo || esta !== vuelta) return;
        setDatos(r);
        setFase("lista");
      } catch (e) {
        if (!vivo || esta !== vuelta) return;
        // Sin conexión se queda con lo último: mejor el menú de hace un rato que nada.
        setFase(e instanceof ErrorTv && e.status === 404 ? "anulada" : "sinConexion");
      } finally {
        if (vivo && esta === vuelta) reloj = setTimeout(() => void traer(), CADA_MS);
      }
    };
    traerYa.current = () => void traer();
    void traer();
    return () => {
      vivo = false;
      traerYa.current = () => undefined;
      if (reloj) clearTimeout(reloj);
    };
  }, [llave, n, sucursalId]);

  useEffect(() => {
    faseActual.current = fase;
  }, [fase]);

  useEffect(() => {
    if (!vistaPrevia) return;
    window.bamardevTv = {
      pantalla: (p) => {
        if (!p || typeof p !== "object") return false;
        setEnEdicion(p);
        return true;
      },
      recargar: () => {
        traerYa.current();
        return true;
      },
      fase: () => faseActual.current,
    };
    return () => {
      delete window.bamardevTv;
    };
  }, [vistaPrevia]);

  // Lo que manda el editor va encima de lo guardado: un campo que la app no
  // conoce (de una versión más nueva de la web) queda como estaba. Si eligió
  // otro diseño quieto, la animación se apaga (ver mezclarEdicion).
  const pantalla = useMemo(() => (datos ? mezclarEdicion(datos.pantalla, enEdicion) : null), [datos, enEdicion]);
  const animado = pantalla ? conAnimacion(pantalla).animado : null;

  const paginas = useMemo(
    () => (datos && pantalla && !animado ? paginar(pantalla, datos.platos, datos.categorias) : []),
    [datos, pantalla, animado],
  );
  // Una TV animada no tiene páginas: tiene escenas, cada una con lo que dura.
  const animacion = useMemo(
    () => (datos && pantalla && animado ? armarAnimacion(pantalla, datos.platos, datos.categorias) : null),
    [datos, pantalla, animado],
  );
  const reloj = useRelojEscenas(animacion ? animacion.escenas.map((e) => e.ms) : []);

  // Las fotos de la vuelta entera, de entrada. En una TV animada cada plato
  // aparece solo y en grande: la primera vez su foto llegaba cuando ya había
  // entrado, y se veía el recuadro vacío.
  const fotosDeLaVuelta = animacion && datos ? datos.platos.flatMap((p) => (p.foto ? [urlPublica(p.foto)] : [])).join("|") : "";
  useEffect(() => {
    if (!fotosDeLaVuelta) return;
    for (const src of fotosDeLaVuelta.split("|")) {
      const img = new Image();
      img.src = src;
    }
  }, [fotosDeLaVuelta]);

  // Pasa de página sola; con una sola página no hace nada. Depende del ritmo
  // y no de `datos`, que es otro objeto en cada vuelta de 30 s: el intervalo
  // se reiniciaba y con "20 s" cada página quedaba unos 30.
  const rotarSeg = pantalla?.rotarSeg;
  useEffect(() => {
    if (paginas.length < 2 || !rotarSeg) return;
    const id = setInterval(() => setPagina((p) => (p + 1) % paginas.length), rotarSeg * 1000);
    return () => clearInterval(id);
  }, [paginas.length, rotarSeg]);

  useEffect(() => {
    const id = setTimeout(() => setAyuda(false), 8000);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (datos) document.title = `${datos.negocio} · ${datos.pantalla.nombre}`;
  }, [datos]);

  if (!llaveConForma(llave)) return <Mensaje titulo="Este enlace está incompleto">Copialo entero desde el Menú digital.</Mensaje>;
  if (fase === "anulada") {
    return <Mensaje titulo="Esta pantalla ya no está habilitada">Puede que se haya borrado o que el enlace se haya renovado en el Menú digital.</Mensaje>;
  }
  if (!datos) return <Mensaje titulo={fase === "sinConexion" ? "No se pudo conectar" : "Cargando el menú…"} />;

  const vista = pantalla ?? datos.pantalla;
  const datosTablero = { negocio: datos.negocio, moneda: datos.moneda, pantalla: vista, url: urlPublica, logo: datos.logo };
  return (
    <div onDoubleClick={() => completa.disponible && !completa.activa && completa.pedir()}>
      <LienzoTv modo="pantalla" fondo={coloresMenu(vista).fondo}>
        {animacion ? (
          <TableroAnimado datos={datosTablero} escena={animacion.escenas[reloj.indice]} vuelta={reloj.vuelta} cinta={animacion.cinta} />
        ) : (
          <TableroMenu
            datos={datosTablero}
            pagina={paginas[pagina % paginas.length]}
            paginaActual={pagina % paginas.length}
            totalPaginas={paginas.length}
          />
        )}
      </LienzoTv>
      {/* En la vista previa de la app no hay pantalla completa que pedir. */}
      {ayuda && !vistaPrevia && completa.disponible && !completa.activa && (
        <p className="fixed inset-x-0 bottom-6 z-40 mx-auto w-fit rounded-full bg-black/75 px-4 py-2 text-sm font-semibold text-white">
          Doble clic para pantalla completa
        </p>
      )}
      {fase === "sinConexion" && (
        <p className="fixed right-4 top-4 z-40 flex items-center gap-2 rounded-full bg-amber-950/90 px-3 py-1.5 text-[13px] font-semibold text-amber-100">
          <Icon name="wifiOff" size={14} />
          Sin conexión: se reintenta solo
        </p>
      )}
    </div>
  );
}

function Mensaje({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#1A1210] px-6 text-center text-white">
      <h1 className="max-w-3xl text-3xl font-extrabold 2xl:text-5xl">{titulo}</h1>
      {children && <div className="max-w-2xl text-lg text-white/80 2xl:text-2xl">{children}</div>}
    </div>
  );
}
