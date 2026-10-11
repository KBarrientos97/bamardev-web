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
export default function Captcha({
  siteKey,
  onToken,
  discreto = false,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  /**
   * Invisible salvo que Cloudflare dude ("interaction-only"): para el chat de
   * la página, donde un recuadro antes de la primera pregunta espanta.
   */
  discreto?: boolean;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const avisar = useRef(onToken);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    avisar.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let vivo = true;
    let id: string | undefined;
    cargarTurnstile()
      .then((ts) => {
        if (!vivo || !caja.current) return;
        id = ts.render(caja.current, {
          sitekey: siteKey,
          language: "es",
          // La página es blanca: con "auto", un teléfono en modo oscuro lo
          // pintaría negro en medio del formulario.
          theme: "light",
          // Ocupa el ancho del formulario (mínimo 300 px): a 390 px entra.
          size: "flexible",
          ...(discreto ? { appearance: "interaction-only" as const } : {}),
          callback: (token) => avisar.current(token),
          "expired-callback": () => avisar.current(null),
          "timeout-callback": () => avisar.current(null),
          "error-callback": () => avisar.current(null),
        });
      })
      .catch(() => {
        if (vivo) setFallo(true);
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
