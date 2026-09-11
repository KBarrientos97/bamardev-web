import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { Boton, Campo, ErrorMsg, Input } from "../components/ui";
import { ApiError, api } from "../lib/api";
import type { CobroQr, OpcionPago, PeriodoCobrable } from "../types";

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
  /**
   * Las opciones de plazo (1, 6 y 12 meses) del negocio, ya con sus totales.
   *
   * Se piden despues de saber el alias y antes de generar el QR: el plazo es lo
   * que define el monto, asi que elegirlo es el paso previo al cobro.
   */
  const [opciones, setOpciones] = useState<OpcionPago[] | null>(null);
  const [elegido, setElegido] = useState<PeriodoCobrable | null>(null);
  const [cobro, setCobro] = useState<CobroQr | null>(null);
  const [pagado, setPagado] = useState(false);
  const [error, setError] = useState("");
  const [generando, setGenerando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  /** El sondeo automático se detiene solo; con esto se puede reanudar. */
  const [pausado, setPausado] = useState(false);
  const sondeos = useRef(0);

  /**
   * Trae los plazos que puede pagar el negocio.
   *
   * Los totales los calcula el BACKEND con el precio pactado de ese negocio:
   * aca solo se muestran. Si el front armara el monto, cualquiera pagaria lo
   * que quisiera.
   */
  const pedirOpciones = useCallback(async (ali: string) => {
    setError("");
    setGenerando(true);
    try {
      const r = await api.opcionesPagoLicencia(ali.trim());
      setOpciones(r.opciones);
      // Preseleccionado el mas largo: es el que conviene al cliente y al flujo
      // de caja. Igual puede cambiarlo antes de generar el QR.
      setElegido(r.opciones[r.opciones.length - 1]?.periodo ?? "MENSUAL");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos traer los planes de pago");
    } finally {
      setGenerando(false);
    }
  }, []);

  const generar = useCallback(async (ali: string, periodo?: PeriodoCobrable) => {
    setError("");
    setGenerando(true);
    try {
      // Viaja el plazo, nunca el monto: el backend lo calcula y el callback del
      // banco vuelve a verificarlo antes de acreditar.
      const r = await api.generarQrLicencia(ali.trim(), periodo);
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

  // Con el alias a mano (la sesión, o el que acaba de tipear en el login) se
  // saltea el primer paso y se va directo a elegir el plazo. Ya no se genera el
  // QR solo: el monto depende de cuantos meses elija.
  useEffect(() => {
    if (aliasInicial) void pedirOpciones(aliasInicial);
  }, [aliasInicial, pedirOpciones]);

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
    if (alias.trim()) void pedirOpciones(alias);
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
          ) : !cobro && !opciones ? (
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
                  BMD-XXXX lo vio una sola vez al contratar. Se acepta SÓLO el
                  alias, a pedido del usuario: dos identificadores para lo mismo
                  confundían más de lo que ayudaban. */}
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
          ) : !cobro ? (
            /* Paso del medio: elegir cuantos meses pagar. Los totales vienen
               calculados del backend; aca solo se eligen. */
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-texto">Elegi tu plazo</h2>
                <p className="mt-0.5 text-[13px] text-texto-3">
                  Pagando mas meses de una vez, cada mes te sale menos.
                </p>
              </div>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <div className="space-y-2.5">
                {(opciones ?? []).map((o) => (
                  <TarjetaPlazo
                    key={o.periodo}
                    opcion={o}
                    activo={elegido === o.periodo}
                    onElegir={() => setElegido(o.periodo)}
                  />
                ))}
              </div>
              <Boton
                className="w-full"
                disabled={generando || !elegido}
                onClick={() => {
                  if (elegido) void generar(alias || aliasInicial || "", elegido);
                }}
              >
                {generando ? "Generando…" : "Generar QR"}
              </Boton>
              <button
                type="button"
                onClick={onSalir}
                className="w-full text-center text-[13px] font-semibold text-texto-3 hover:text-texto"
              >
                Volver al inicio de sesion
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-[13px] text-texto-3">Total a pagar</p>
                <p className="text-3xl font-extrabold tracking-tight text-texto">
                  {bs(cobro.monto)}
                </p>
                <p className="mt-0.5 text-[13px] text-texto-3">
                  {`Licencia por ${cobro.meses} ${cobro.meses === 1 ? "mes" : "meses"}`}
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
                    onClick={() =>
                      void generar(alias || aliasInicial || "", elegido ?? undefined)
                    }
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

                  {/* Cambiar de plazo sin volver a escribir el alias. El QR
                      viejo queda PENDIENTE y el backend lo anula al generar el
                      siguiente, asi que no quedan dos cobros vivos. */}
                  {opciones && (
                    <button
                      type="button"
                      onClick={() => {
                        setCobro(null);
                        setError("");
                      }}
                      className="w-full text-center text-[13px] font-semibold text-primary-700 hover:text-primary"
                    >
                      Cambiar el plazo
                    </button>
                  )}
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

/**
 * Una opcion de plazo: total, lo que sale por mes y cuanto se ahorra.
 *
 * Los tres numeros vienen del backend. El equivalente mensual es el que hace
 * comparable un pago de Bs 2.540 contra uno de Bs 249, que es de lo que depende
 * que alguien se anime al plazo largo.
 */
function TarjetaPlazo({
  opcion,
  activo,
  onElegir,
}: {
  opcion: OpcionPago;
  activo: boolean;
  onElegir: () => void;
}) {
  const etiqueta =
    opcion.meses === 1 ? "1 mes" : `${opcion.meses} meses`;
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={activo}
      className={
        "w-full rounded-xl border p-3.5 text-left transition " +
        (activo
          ? "border-primary bg-primary-50 ring-1 ring-primary"
          : "border-borde bg-white hover:border-primary-200")
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold text-texto">{etiqueta}</span>
        <span className="text-lg font-extrabold tracking-tight text-texto">
          {bs(opcion.total)}
        </span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-texto-3">
          {opcion.meses === 1
            ? "Sin descuento"
            : `${bs(opcion.mensualEquivalente)} por mes`}
        </span>
        {opcion.ahorro > 0 && (
          <span className="text-[12px] font-semibold text-primary-700">
            Ahorras {bs(opcion.ahorro)}
          </span>
        )}
      </div>
    </button>
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
