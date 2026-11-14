import { useEffect, useRef, useState } from "react";
import { cargarTurnstile } from "../lib/turnstile";

/**
 * El widget de Turnstile. Avisa el token cuando Cloudflare lo da y `null`
 * cuando vence o falla, así el formulario sabe si puede mandar.
 *
 * Los tokens son de un solo uso: para pedir otro, el formulario lo vuelve a
 * montar con otra `key` (después de cualquier respuesta del backend, que ya lo
 * gastó).
 */
/** En qué va la verificación: para que el formulario le diga al cliente qué hacer. */
export type EstadoCaptcha = "verificando" | "pide" | "listo" | "fallo";

export default function Captcha({
  siteKey,
  onToken,
  onEstado,
  discreto = false,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  /**
   * Opcional: avisa si Cloudflare está verificando solo, si pide que el cliente
   * tilde el recuadro (`pide`), si ya está (`listo`) o si falló (`fallo`). Con
   * esto el formulario puede subir hasta el recuadro y ofrecer reintentar.
   */
  onEstado?: (estado: EstadoCaptcha) => void;
  /**
   * Invisible salvo que Cloudflare dude ("interaction-only"): para el chat de
   * la página, donde un recuadro antes de la primera pregunta espanta.
   */
  discreto?: boolean;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const avisar = useRef(onToken);
  const estado = useRef(onEstado);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    avisar.current = onToken;
    estado.current = onEstado;
  }, [onToken, onEstado]);

  useEffect(() => {
    let vivo = true;
    let id: string | undefined;
    cargarTurnstile()
      .then((ts) => {
        if (!vivo || !caja.current) return;
        // «flexible» no baja de 300 px: en una tarjeta dentro de otra, en el celular, se salía por
        // el costado (Drick, 08-nov). Si no entra, el compacto (150 px).
        const entra = caja.current.clientWidth === 0 || caja.current.clientWidth >= 300;
        id = ts.render(caja.current, {
          sitekey: siteKey,
          language: "es",
          // La página es blanca: con "auto", un teléfono en modo oscuro lo
          // pintaría negro en medio del formulario.
          theme: "light",
          // Ocupa el ancho del formulario (mínimo 300 px); si no entra, el compacto.
          size: entra ? "flexible" : "compact",
          ...(discreto ? { appearance: "interaction-only" as const } : {}),
          callback: (token) => {
            avisar.current(token);
            estado.current?.("listo");
          },
          "expired-callback": () => {
            avisar.current(null);
            estado.current?.("verificando");
          },
          "timeout-callback": () => {
            avisar.current(null);
            estado.current?.("fallo");
          },
          "error-callback": () => {
            avisar.current(null);
            estado.current?.("fallo");
          },
          "unsupported-callback": () => {
            avisar.current(null);
            estado.current?.("fallo");
          },
          "before-interactive-callback": () => estado.current?.("pide"),
          "after-interactive-callback": () => estado.current?.("verificando"),
        });
      })
      .catch(() => {
        if (!vivo) return;
        setFallo(true);
        estado.current?.("fallo");
      });
    return () => {
      vivo = false;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey, discreto]);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={caja}
        data-testid="captcha"
        aria-label="Verificación anti-robots"
        className={discreto ? "w-full" : "min-h-[65px] w-full"}
      />
      {fallo && (
        <p className="text-xs text-[#B91C1C]">
          No pudimos cargar la verificación anti-robots. Revisá tu conexión (o el bloqueador de anuncios) y recargá
          la página.
        </p>
      )}
    </div>
  );
}
