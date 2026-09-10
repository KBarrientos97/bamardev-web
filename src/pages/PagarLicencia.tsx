import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { Boton, Campo, ErrorMsg, Input } from "../components/ui";
import { ApiError, api } from "../lib/api";
import type { CobroQr } from "../types";

/** Cada cuánto se le pregunta al backend si el pago entró. */
const SONDEO_MS = 5000;

/**
 * Cuántas veces se pregunta sola antes de esperar al botón "Ya pagué".
 *
 * Acá el sondeo SÍ vale la pena (a diferencia del panel, donde se sacó): quien
 * mira la pantalla es el cliente que está escaneando el QR, y verlo pasar solo
 * a "pagado" es la confirmación de que puede volver a trabajar.
 *
 * Consultar el estado tiene su propio tope (60/min), aparte del de generar, así
 * que 5 minutos entran de sobra. El corte no es por el límite: es para no dejar
 * un intervalo golpeando el servidor si alguien se olvida la pestaña abierta.
 */
const SONDEOS_ANTES_DE_PAUSAR = 60;

function bs(monto: number): string {
  return `Bs ${monto.toLocaleString("es-BO", {
    minimumFractionDigits: monto % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

interface Props {
  /** Alias del negocio, si se lo conoce (sesión o login); si no, se pide. */
  aliasInicial?: string | null;
  /** Vuelve al login. */
  onSalir: () => void;
}

/**
 * Pagar la licencia con un QR, sin sesión iniciada.
 *
 * Va sin login a propósito y no es un descuido: la licencia vencida hace que
 * el backend rechace TODOS los requests autenticados, así que ni el
 * administrador podría entrar a pagar. El negocio se identifica con su código
 * de activación y acá sólo se muestra el monto y el estado del cobro.
 *
 * El monto lo decide el backend (respeta el precio pactado con cada cliente):
 * si se calculara acá, cualquiera pagaría lo que quisiera.
 */
export default function PagarLicencia({ aliasInicial, onSalir }: Props) {
  const [alias, setAlias] = useState(aliasInicial ?? "");
  const [cobro, setCobro] = useState<CobroQr | null>(null);
  const [pagado, setPagado] = useState(false);
  const [error, setError] = useState("");
  const [generando, setGenerando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  /** El sondeo automático se detiene solo; con esto se puede reanudar. */
  const [pausado, setPausado] = useState(false);
  const sondeos = useRef(0);

  const generar = useCallback(async (cod: string) => {
    setError("");
    setGenerando(true);
    try {
      const r = await api.generarQrLicencia(cod.trim());
      setCobro(r);
      setPagado(r.estado === "PAGADO");
      sondeos.current = 0;
      setPausado(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el QR");
    } finally {
      setGenerando(false);
    }
  }, []);

  // Con el alias a mano (la sesión, o el que acaba de tipear en el login), el
  // QR se pide solo: un paso menos para alguien que ya está trabado.
  useEffect(() => {
    if (aliasInicial) void generar(aliasInicial);
  }, [aliasInicial, generar]);

  const consultar = useCallback(
    async (alias: string) => {
      try {
        const r = await api.estadoQrLicencia(alias);
        if (r.estado === "PAGADO") setPagado(true);
        return r.estado;
      } catch (e) {
        // 429 = se agotó el cupo del endpoint. Seguir preguntando sólo lo
        // empeora, así que el sondeo se detiene y queda el botón manual.
        if ((e as ApiError)?.status === 429) setPausado(true);
        // Cualquier otro fallo puntual no se muestra: sería un cartel de error
        // parpadeando cada cinco segundos mientras el dueño escanea el QR.
        return null;
      }
    },
    [],
  );

  // Sondeo mientras se espera el pago. Se corta al pagar, al vencer el QR y al
  // desmontar: un intervalo huérfano contra un endpoint con tope de 10 por
  // minuto terminaría bloqueándose a sí mismo.
  useEffect(() => {
    if (!cobro || pagado || pausado) return;
    const vencido = new Date(cobro.venceEn).getTime() <= Date.now();
    if (vencido) return;

    const id = setInterval(() => {
      sondeos.current += 1;
      if (sondeos.current >= SONDEOS_ANTES_DE_PAUSAR) {
        // Después de un minuto se deja de preguntar solo. Quien está pagando
        // tiene el botón "Ya pagué"; quien dejó la pestaña abierta no gasta
        // el cupo de requests por nada.
        setPausado(true);
        return;
      }
      void consultar(cobro.alias);
    }, SONDEO_MS);
    return () => clearInterval(id);
  }, [cobro, pagado, pausado, consultar]);

  const verificar = async () => {
    if (!cobro) return;
    setVerificando(true);
    const estado = await consultar(cobro.alias);
    setVerificando(false);
    if (estado && estado !== "PAGADO") {
      setError("El banco todavía no informó el pago. Si ya pagaste, esperá unos segundos.");
      setTimeout(() => setError(""), 5000);
    }
    // Volver a mirar reanuda el sondeo: el dueño sigue en la pantalla.
    sondeos.current = 0;
    setPausado(false);
  };

  const enviarAlias = (e: FormEvent) => {
    e.preventDefault();
    if (alias.trim()) void generar(alias);
  };

  const vencido = cobro ? new Date(cobro.venceEn).getTime() <= Date.now() : false;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-primary-50 via-white to-fondo px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-marca text-white shadow-lg shadow-primary/30">
            <Icon name="archive" size={38} strokeWidth={2.2} />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-primary">
            BamarDev
          </h1>
          <p className="mt-1 text-[13px] text-texto-3">Pago de la licencia</p>
        </div>

        <div className="card space-y-4 p-6 shadow-lg">
          {pagado ? (
            <Exito onSalir={onSalir} />
          ) : !cobro ? (
            <form onSubmit={enviarAlias} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-texto">Pagar con QR</h2>
                <p className="mt-0.5 text-[13px] text-texto-3">
                  Ingresá el alias de tu negocio y te generamos el QR para pagar.
                </p>
              </div>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              {/* Se pide el ALIAS y no el código de activación: el alias es
                  lo que el dueño escribe en cada login, mientras que el
                  BMD-XXXX lo vio una sola vez al contratar. El backend acepta
                  los dos, así que quien tenga el código a mano también entra. */}
              <Campo label="Negocio" hint="El mismo alias con el que entrás al sistema">
                <Input
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="pollosdonomar"
                  autoCapitalize="none"
                  autoComplete="organization"
                  spellCheck={false}
                />
              </Campo>
              <Boton type="submit" className="w-full" disabled={generando || !alias.trim()}>
                {generando ? "Generando…" : "Generar QR"}
              </Boton>
              <button
                type="button"
                onClick={onSalir}
                className="w-full text-center text-[13px] font-semibold text-texto-3 hover:text-texto"
              >
                Volver al inicio de sesión
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-[13px] text-texto-3">Total a pagar</p>
                <p className="text-3xl font-extrabold tracking-tight text-texto">
                  {bs(cobro.monto)}
                </p>
                <p className="mt-0.5 text-[13px] text-texto-3">
                  {cobro.periodo === "ANUAL"
                    ? "Licencia por 12 meses"
                    : "Licencia por 1 mes"}
                </p>
              </div>

              {error && <ErrorMsg>{error}</ErrorMsg>}

              {vencido ? (
                <div className="space-y-3 text-center">
                  <p className="text-[13px] text-texto-2">
                    Este QR ya venció. Generá uno nuevo para pagar.
                  </p>
                  <Boton
                    className="w-full"
                    disabled={generando}
                    onClick={() => void generar(alias || aliasInicial || "")}
                  >
                    {generando ? "Generando…" : "Generar otro QR"}
                  </Boton>
                </div>
              ) : (
                <>
                  {cobro.imagenQr ? (
                    <img
                      src={cobro.imagenQr}
                      alt="Código QR para pagar la licencia"
                      className="mx-auto w-full max-w-[260px] rounded-xl border border-borde bg-white p-3"
                    />
                  ) : (
                    <p className="rounded-xl bg-muted p-4 text-center text-[13px] text-texto-3">
                      El QR ya se había generado. Si lo perdiste, tocá
                      «Generar otro QR» cuando este venza.
                    </p>
                  )}

                  {/* El texto sigue al estado real: prometer "se actualiza
                      sola" después de que el sondeo se pausó sería mentir, y
                      el dueño esperaría mirando una pantalla que ya no
                      pregunta nada. */}
                  <p className="text-center text-[13px] leading-snug text-texto-3">
                    {pausado
                      ? "Escaneá el QR desde la app de tu banco. Cuando termines, tocá «Ya pagué» para confirmarlo."
                      : "Escaneá el QR desde la app de tu banco. Cuando el pago entre, esta pantalla se actualiza sola."}
                  </p>

                  <Boton
                    variante="ghost"
                    className="w-full"
                    disabled={verificando}
                    onClick={verificar}
                  >
                    {verificando ? "Verificando…" : "Ya pagué, verificar"}
                  </Boton>
                </>
              )}

              <button
                type="button"
                onClick={onSalir}
                className="w-full text-center text-[13px] font-semibold text-texto-3 hover:text-texto"
              >
                Volver al inicio de sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Exito({ onSalir }: { onSalir: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <Icon name="check" size={30} strokeWidth={2.4} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-texto">¡Pago recibido!</h2>
        <p className="mt-1 text-[13px] leading-snug text-texto-3">
          La licencia ya está al día. Iniciá sesión para seguir trabajando.
        </p>
      </div>
      <Boton className="w-full" onClick={onSalir}>
        Iniciar sesión
      </Boton>
    </div>
  );
}
