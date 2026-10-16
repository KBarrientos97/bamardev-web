import { useEffect, useState } from "react";
import { Icon } from "../../../components/Icon";
import { Confirmar, ErrorMsg, useAviso } from "../../../components/ui";
import { useApi } from "../../../lib/useApi";
import { apiBillar } from "../api";
import { BotonB, ErrorAccion, Nota, Tarjeta } from "../ui";
import { urlTv } from "./TarjetaPantallaSalon.datos";

/**
 * Mesas de billar → "Pantalla del salón (TV)": el enlace de la TV pública
 * (`/tv/billar/<llave>`), para dejar las mesas en un televisor sin una sesión
 * abierta en esa compu. Generarlo de nuevo anula el anterior: es la forma de
 * cortar a una TV que ya no corresponde.
 *
 * Va en una pantalla que ya pide administrar el billar, y el backend lo exige
 * también (`billar.admin`).
 */
export function TarjetaPantallaSalon({
  sucursalId,
  sucursal,
}: {
  /** El local cuyas mesas muestra la TV; sin él, la principal. */
  sucursalId?: number | null;
  /** Su nombre, sólo cuando el negocio tiene más de uno (si no, no dice nada). */
  sucursal?: string;
}) {
  const llave = useApi(() => apiBillar.llaveSalon(), []);
  const [confirmar, setConfirmar] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso(4000);
  const token = llave.datos?.token ?? null;
  const url = token ? urlTv(window.location.origin, token, sucursalId) : "";

  const generar = async () => {
    setGenerando(true);
    setError("");
    try {
      const r = await apiBillar.nuevaLlaveSalon();
      llave.setDatos({ token: r.token });
      setAviso(token ? "Listo: el enlace anterior ya no anda. Abrí este en el televisor." : "Listo: abrí este enlace en el televisor.");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "No se pudo generar el enlace");
    } finally {
      setGenerando(false);
      setConfirmar(false);
    }
  };

  const copiar = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(url);
      setAviso("Enlace copiado.");
    } catch {
      // Sin permiso para el portapapeles (http, o el navegador lo niega): el
      // enlace está a la vista, seleccionable.
      setError("No se pudo copiar solo: seleccioná el enlace y copialo a mano.");
    }
  };

  return (
    <Tarjeta icono="pantalla" titulo="Pantalla del salón (TV)">
      <p className="text-[13px] leading-relaxed text-texto-2">
        Mostrá las mesas en un televisor del local: cuáles están libres, cuánto tiempo lleva cada una, la hora de las
        reservas y las tarifas. <b className="font-semibold text-texto">No muestra cuentas, montos ni nombres de
        clientes</b>, y no hace falta dejar una sesión abierta en esa compu: entra con su propio enlace.
      </p>
      {sucursal && (
        <p className="mt-2 text-[13px] text-texto-2">
          Muestra las mesas de <b className="font-semibold text-texto">{sucursal}</b>. Para otro local, elegilo arriba
          y copiá su enlace.
        </p>
      )}

      <div className="mt-4">
        {llave.cargando && !llave.datos ? (
          <p className="text-[13px] text-texto-3">Cargando…</p>
        ) : llave.error ? (
          <ErrorMsg onReintentar={llave.recargar}>{llave.error}</ErrorMsg>
        ) : !token ? (
          <div className="flex flex-wrap items-center gap-3">
            <BotonB variante="verde" icono="pantalla" disabled={generando} onClick={() => void generar()}>
              {generando ? "Generando…" : "Generar el enlace"}
            </BotonB>
            <span className="text-[12px] text-texto-4">Todavía no hay ninguna pantalla habilitada.</span>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">Enlace de la pantalla</span>
                <input
                  readOnly
                  value={url}
                  onFocus={(ev) => ev.currentTarget.select()}
                  className="h-10 w-full rounded-xl border border-borde bg-muted px-3 font-mono text-[12px] text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <BotonB variante="verde" onClick={() => void copiar()}>
                  Copiar
                </BotonB>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-texto ring-1 ring-inset ring-borde transition-colors hover:bg-muted"
                >
                  <Icon name="arrowUpRight" size={16} />
                  Abrir
                </a>
                <BotonB variante="rosa" icono="key" disabled={generando} onClick={() => setConfirmar(true)}>
                  Generar uno nuevo
                </BotonB>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-[12px] text-texto-3">
                <li>Abrí el enlace en el navegador del televisor (o de la compu conectada a él).</li>
                <li>Tocá «Pantalla completa». Se actualiza sola; si se corta internet, se reconecta sola.</li>
                <li>Si perdés el control de un televisor, generá uno nuevo: el de ahora deja de andar.</li>
              </ol>
            </div>
            <QrDelEnlace url={url} />
          </div>
        )}
      </div>

      {aviso && (
        <div className="mt-3" role="status">
          <Nota tono="verde" icono="check">
            {aviso}
          </Nota>
        </div>
      )}
      <ErrorAccion texto={error} />

      <Confirmar
        abierto={confirmar}
        titulo="¿Generar un enlace nuevo?"
        texto="El enlace de ahora deja de andar en el momento: los televisores que lo tengan abierto van a mostrar que la pantalla ya no está habilitada, y hay que abrirles el nuevo."
        etiquetaOk="Generar uno nuevo"
        peligroso
        procesando={generando}
        onCancel={() => setConfirmar(false)}
        onOk={() => void generar()}
      />
    </Tarjeta>
  );
}

/**
 * El QR del enlace, para abrirlo en el celular o la tablet que hace de
 * pantalla sin tipear la llave. `qrcode` se baja recién acá: no tiene por qué
 * viajar con el resto de Mesas de billar.
 */
function QrDelEnlace({ url }: { url: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let vigente = true;
    import("../../../lib/pagina/qr")
      .then(({ svgDeQr }) => svgDeQr(url))
      .then((s) => vigente && setSvg(s))
      .catch(() => vigente && setSvg(""));
    return () => {
      vigente = false;
    };
  }, [url]);
  if (!svg) return null;
  return (
    <figure className="flex flex-col items-center gap-2 justify-self-center sm:justify-self-end">
      <div
        role="img"
        aria-label="Código QR del enlace de la pantalla"
        className="h-36 w-36 rounded-xl border border-borde bg-white p-2"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <figcaption className="max-w-[10rem] text-center text-[11px] text-texto-4">
        Escanealo con el celular o la tablet que va a hacer de pantalla.
      </figcaption>
    </figure>
  );
}
