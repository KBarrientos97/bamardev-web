import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { paginar } from "../../lib/menuDigital/paginar";
import { coloresMenu } from "../../lib/menuDigital/colores";
import { TableroMenu } from "../../pages/menu-digital/TableroMenu";
import { LienzoTv } from "../../pages/tickets/TableroTv";
import type { MenuPublicoApi } from "../../types/menuDigital";
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
  const n = Number(numero);
  const sucursalId = sucursalDeLaDireccion(params.get("sucursal"));
  const [datos, setDatos] = useState<MenuPublicoApi | null>(null);
  const [fase, setFase] = useState<"cargando" | "lista" | "anulada" | "sinConexion">("cargando");
  const [pagina, setPagina] = useState(0);
  const [ayuda, setAyuda] = useState(true);
  const completa = usePantallaCompleta();
  useMantenerEncendida();
  useAlDia();

  useEffect(() => {
    if (!llaveConForma(llave) || !Number.isInteger(n)) return;
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout> | null = null;
    const traer = async () => {
      try {
        const r = await apiTv.menu(llave, n, sucursalId);
        if (!vivo) return;
        setDatos(r);
        setFase("lista");
      } catch (e) {
        if (!vivo) return;
        // Sin conexión se queda con lo último: mejor el menú de hace un rato que nada.
        setFase(e instanceof ErrorTv && e.status === 404 ? "anulada" : "sinConexion");
      } finally {
        if (vivo) reloj = setTimeout(() => void traer(), CADA_MS);
      }
    };
    void traer();
    return () => {
      vivo = false;
      if (reloj) clearTimeout(reloj);
    };
  }, [llave, n, sucursalId]);

  const paginas = useMemo(
    () => (datos ? paginar(datos.pantalla, datos.platos, datos.categorias) : []),
    [datos],
  );

  // Pasa de página sola; con una sola página no hace nada. Depende del ritmo
  // y no de `datos`, que es otro objeto en cada vuelta de 30 s: el intervalo
  // se reiniciaba y con "20 s" cada página quedaba unos 30.
  const rotarSeg = datos?.pantalla.rotarSeg;
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

  const actual = paginas[pagina % paginas.length];
  return (
    <div onDoubleClick={() => completa.disponible && !completa.activa && completa.pedir()}>
      <LienzoTv modo="pantalla" fondo={coloresMenu(datos.pantalla).fondo}>
        <TableroMenu
          datos={{ negocio: datos.negocio, moneda: datos.moneda, pantalla: datos.pantalla, url: urlPublica, logo: datos.logo }}
          pagina={actual}
          paginaActual={pagina % paginas.length}
          totalPaginas={paginas.length}
        />
      </LienzoTv>
      {ayuda && completa.disponible && !completa.activa && (
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
