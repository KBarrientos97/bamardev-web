import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import {
  anunciar,
  audioBloqueado,
  audioYaPermitido,
  desbloquearAudio,
  paletaTv,
  sonarTono,
} from "../../lib/tickets/llamado";
import { llamadosNuevos } from "../../lib/tickets/llamadosNuevos";
import { LienzoTv, TableroTv } from "../../pages/tickets/TableroTv";
import { AJUSTES_TV_DE_FABRICA } from "../../types/tickets";
import { urlPublica } from "./apiTv";
import { useAlDia, useMantenerEncendida, usePantallaCompleta } from "./pantalla";
import { llaveConForma, sucursalDeLaDireccion } from "./TvBillar.datos";
import { usePantallaTickets } from "./usePantallaTickets";

/**
 * La TV de tickets del restaurante, SIN sesión: `/tv/tickets/<llave>`, con
 * `?sucursal=<id>` si el negocio tiene más de un local.
 *
 * Muestra los números listos para entregar y los que se preparan, y cuando
 * despacho marca uno listo (o lo vuelve a llamar) suena el tono, la voz dice
 * el número y el número late en grande. Entra con la llave que se genera en
 * Tickets y pedidos; regenerarla la corta.
 *
 * Vive fuera del AuthProvider, como la TV del billar (ver App.tsx): no lee la
 * sesión guardada en ese navegador ni la puede cerrar.
 */
export default function TvTickets() {
  const { llave = "" } = useParams();
  const [params] = useSearchParams();
  if (!llaveConForma(llave)) {
    return (
      <Mensaje titulo="Este enlace está incompleto">
        Copialo entero desde <b>Tickets y pedidos → Pantalla de la TV</b>, con el botón Copiar.
      </Mensaje>
    );
  }
  return <PantallaConLlave llave={llave} sucursalId={sucursalDeLaDireccion(params.get("sucursal"))} />;
}

function PantallaConLlave({ llave, sucursalId }: { llave: string; sucursalId?: number }) {
  const s = usePantallaTickets(llave, sucursalId);
  useMantenerEncendida();
  useAlDia();
  const completa = usePantallaCompleta();

  // El reloj y los minutos corren cada segundo en la TV, con la hora del
  // servidor (el reloj de un televisor suele estar corrido).
  const [local, setLocal] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setLocal(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [sonidoActivo, setSonidoActivo] = useState(() => !audioBloqueado());
  const vistos = useRef(new Map<number, number>());
  const primeraVez = useRef(true);
  const [llamando, setLlamando] = useState<{ numero: number; hasta: number } | null>(null);

  const datos = s.datos;
  const ajustes = datos?.ajustes ?? AJUSTES_TV_DE_FABRICA;

  useEffect(() => {
    if (!datos) return;
    const nuevos = llamadosNuevos(datos.listos, vistos.current, datos.ahora, primeraVez.current);
    primeraVez.current = false;
    if (!nuevos.length) return;
    const ultimo = nuevos[nuevos.length - 1];
    setLlamando({ numero: ultimo, hasta: Date.now() + datos.ajustes.segundosResaltado * 1000 });
    if (!audioBloqueado()) for (const n of nuevos) void anunciar(n, datos.ajustes);
  }, [datos]);

  useEffect(() => {
    document.title = datos?.negocio ? `${datos.negocio} · Tickets` : "Tickets";
  }, [datos?.negocio]);

  // Lo que el toque necesita saber sin volver a enganchar los oyentes.
  const actual = useRef({ ajustes, llamando });
  useEffect(() => {
    actual.current = { ajustes, llamando };
  });

  // Si el navegador ya deja sonar (app instalada, Chrome con el permiso), no
  // se pide el toque: antes el cartel salía igual y el primer llamado no sonaba.
  useEffect(() => {
    let vivo = true;
    void audioYaPermitido().then((ok) => {
      if (vivo && ok) setSonidoActivo(true);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // El navegador no deja sonar nada hasta el primer toque: el primero que
  // toque la TV (o el mouse o una tecla de la compu) la deja sonando para
  // todo el día. Con todos los eventos y no sólo `pointerdown`: un dedo en una
  // pantalla táctil no cuenta como gesto hasta que se levanta (QA 29-oct, la
  // TV no sonaba). Cada evento del mismo toque desbloquea; suena una vez.
  const yaConfirmo = useRef(false);
  useEffect(() => {
    if (sonidoActivo) return;
    const alTocar = () => {
      void desbloquearAudio().then((ok) => {
        if (!ok || yaConfirmo.current) return;
        yaConfirmo.current = true;
        setSonidoActivo(true);
        // Que se oiga algo al tocar: quien la prende sabe que quedó sonando,
        // y el número que estaba en pantalla sin sonido se canta ahora.
        const { ajustes: a, llamando: l } = actual.current;
        if (l && l.hasta > Date.now()) void anunciar(l.numero, a);
        else sonarTono(a.tono, a.volumen);
      });
    };
    const eventos = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;
    for (const e of eventos) window.addEventListener(e, alTocar);
    return () => {
      for (const e of eventos) window.removeEventListener(e, alTocar);
    };
  }, [sonidoActivo]);

  if (s.fase === "anulada") {
    return (
      <Mensaje titulo="Esta pantalla ya no está habilitada">
        Generá un enlace nuevo en <b>Tickets y pedidos → Pantalla de la TV</b> y abrilo en este televisor.
      </Mensaje>
    );
  }
  if (s.fase === "invalida") {
    return (
      <Mensaje titulo="Este enlace no sirve">
        Puede que apunte a un local que ya no existe. Generalo de nuevo en <b>Tickets y pedidos</b>.
      </Mensaje>
    );
  }
  if (!datos) return <Mensaje titulo="Cargando los pedidos…" />;

  const ahora = local + s.desfase;
  // Se deja de llamar al pasar el tiempo de resaltado, o antes si ya se
  // entregó (no tiene sentido seguir llamando a quien ya se lo llevó).
  const numeroLlamando =
    llamando && llamando.hasta > local && datos.listos.some((l) => l.numero === llamando.numero)
      ? llamando.numero
      : null;

  return (
    <div onDoubleClick={() => completa.disponible && !completa.activa && completa.pedir()}>
      <LienzoTv modo="pantalla" fondo={paletaTv(ajustes).fondo}>
        <TableroTv
          ajustes={ajustes}
          datos={{ negocio: datos.negocio, ahora, preparando: datos.preparando, listos: datos.listos }}
          llamando={numeroLlamando}
          logoUrl={datos.logo ? urlPublica(datos.logo) : null}
        />
      </LienzoTv>
      {!sonidoActivo && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <p className="flex items-center gap-3 rounded-2xl bg-black/80 px-5 py-3 text-base font-semibold text-white shadow-2xl 2xl:text-xl">
            <Icon name="volumen" size={22} />
            Tocá la pantalla una vez para activar el sonido
          </p>
        </div>
      )}
      {s.sinConexion && (
        <div className="fixed inset-x-4 top-4 z-40 mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-950/95 px-4 py-3 text-[14px] text-amber-100 shadow-2xl 2xl:text-lg">
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-400" aria-hidden />
          <span className="min-w-0 flex-1">
            <b>Sin conexión con el servidor.</b> Los números pueden estar atrasados: se vuelve a conectar sola.
          </span>
          <button type="button" onClick={s.reintentar} className="shrink-0 font-bold underline">
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}

function Mensaje({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#1A1210] px-6 text-center text-white">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-white/80 2xl:h-24 2xl:w-24">
        <Icon name="ticket" size={30} />
      </span>
      <h1 className="max-w-2xl text-2xl font-extrabold sm:text-3xl 2xl:text-5xl">{titulo}</h1>
      {children && <div className="max-w-xl text-base text-white/75 sm:text-lg 2xl:text-2xl">{children}</div>}
    </div>
  );
}
