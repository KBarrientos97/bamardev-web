import { useEffect, useState } from "react";
import { urlApi } from "../../lib/apiMenuDigital";
import { escalaLetra } from "../../lib/menuDigital/letraRecibo";
import { svgDeQr, textoEnlace } from "../../lib/pagina/qr";
import { numeroTicket } from "../../lib/tickets/llamado";
import type { AjustesRecibo } from "../../types/menuDigital";

/**
 * Piezas del recibo de un negocio con las pantallas del local (Configuración
 * del recibo): la cabecera con el logo y los datos del negocio, el número de
 * ticket y el recuadro del QR con el tiempo estimado (la letra de cada papel,
 * en `lib/menuDigital/letraRecibo`). Las usan el recibo de la caja y la vista
 * previa de Configuración, para que lo que se diseña sea lo que sale.
 */

const ALTO_LOGO = { s: 44, m: 64, l: 88 } as const;

/**
 * La hoja del rollo de 58 mm para el navegador. `index.html` declara la de
 * 80 mm, y con el rollo angosto sólo se achicaba el contenido: el driver
 * recibía una hoja de 80 y, según cuál, la achicaba entera (letra diminuta) o
 * la cortaba. Esta `@page` va después y pisa a la de `index.html` mientras la
 * pantalla que la dibuja está abierta: 48 mm de ticket más 5 mm por lado.
 */
export function HojaAngosta() {
  return <style>{"@page { size: 58mm 297mm; margin: 4mm 5mm; }"}</style>;
}

export function CabeceraNegocio({ r, logo, nombre }: { r: AjustesRecibo; logo: string | null; nombre: string }) {
  const conLogo = r.logo && !!logo;
  const contacto = [r.direccion, r.telefono ? `Tel. ${r.telefono}` : ""].filter(Boolean).join(" · ");
  return (
    <header className="pb-2 text-center">
      {conLogo && (
        // En blanco y negro y con más contraste al imprimir: una térmica no
        // tiene grises, y el logo en color salía como una mancha (el driver
        // le hace la trama solo).
        //
        // Con `height` y no `maxHeight`: index.css, al imprimir, le saca el
        // tope de alto a todo lo del papel (por los comprobantes que viven en
        // un modal), y el logo salía a su tamaño natural, casi del ancho del
        // rollo, con "Chico" elegido (Kevin, 5-nov). Y dividido por la escala
        // de la letra: el logo tiene su propio tamaño, y con la letra chica
        // no tiene que achicarse también.
        <img
          src={urlApi(logo!)}
          alt=""
          className="mx-auto mb-1 object-contain grayscale contrast-125"
          style={{
            height: ALTO_LOGO[r.tamanoLogo] / escalaLetra(r.tamanoLetra),
            width: "auto",
            maxWidth: "80%",
          }}
        />
      )}
      {(!conLogo || r.nombre) && <h2 className="text-base font-bold text-texto">{nombre}</h2>}
      {r.lema && <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-texto-2">{r.lema}</p>}
      {contacto && <p className="mt-0.5 text-[11px] text-texto-2">{contacto}</p>}
      {r.nit && <p className="text-[11px] text-texto-2">NIT: {r.nit}</p>}
    </header>
  );
}

/**
 * El número que el cliente espera oír, en su recuadro: lo primero que se ve
 * del papel. Desde el 5-nov en 36 px (eran 44) y con menos aire: el recuadro
 * se comía casi dos centímetros de rollo, y el número para cantar en grande
 * ya está en la pantalla de la caja y en la TV.
 */
export function NumeroDelRecibo({ numero }: { numero: number }) {
  return (
    <div className="mx-auto mb-1.5 w-fit rounded-lg border-2 border-texto px-3 py-0.5 text-center">
      <p className="text-[9px] font-bold tracking-[0.3em] text-texto-3">TICKET N°</p>
      <p className="font-mono text-[36px] font-black leading-none tracking-tight text-texto">
        {numeroTicket(numero)}
      </p>
    </div>
  );
}

/**
 * El recuadro de abajo: el QR (a la página, el Instagram o el WhatsApp del
 * negocio) y, con número de pedido, cuánto falta para que esté listo.
 */
export function QrRecibo({ r, conTicket }: { r: AjustesRecibo; conTicket: boolean }) {
  const [svg, setSvg] = useState("");
  const conQr = r.qr.mostrar && !!r.qr.enlace;
  useEffect(() => {
    if (!conQr) return;
    let vivo = true;
    svgDeQr(r.qr.enlace)
      .then((s) => vivo && setSvg(s))
      .catch(() => vivo && setSvg(""));
    return () => {
      vivo = false;
    };
  }, [conQr, r.qr.enlace]);

  const espera = conTicket && r.minutosEstimados > 0;
  if (!conQr && !espera) return null;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border-2 border-dashed border-texto px-3 py-2.5">
      {conQr && svg && (
        <span
          aria-hidden
          className="block h-[68px] w-[68px] shrink-0"
          // Generado acá por `qrcode` a partir del enlace que cargó el dueño.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      <div className="min-w-0 text-left text-[11px] leading-snug text-texto-2">
        {conQr && r.qr.titulo && <p className="text-[12px] font-bold text-texto">{r.qr.titulo}</p>}
        {conQr && r.qr.texto && <p>{r.qr.texto}</p>}
        {conQr && <p className="break-all font-semibold text-texto">{textoEnlace(r.qr.enlace)}</p>}
        {espera && (
          <p className={conQr ? "mt-1" : ""}>
            Tiempo estimado:{" "}
            <b className="text-texto">
              {r.minutosEstimados}–{r.minutosEstimados + 5} min
            </b>
          </p>
        )}
      </div>
    </div>
  );
}
