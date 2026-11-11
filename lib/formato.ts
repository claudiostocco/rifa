/**
 * FD-6 · Formatação de exibição (SPEC §4.19, RF-02/RF-10).
 *
 * Funções puras de `lib/`: nenhum valor exibido deve ser calculado na mão nas
 * telas — a UI/Server Actions gravam o formato da coluna "Formato gravado" e
 * chamam daqui só na renderização. Domínio telefônico: números brasileiros,
 * pois a máscara prescrita "(XX) XXXXX-XXXX" é a brasileira.
 */

/** Limite operacional da coluna `numeros.numero` (CHECK da migração 001). */
const NUMERO_MINIMO = 1;
const NUMERO_MAXIMO = 5000;

const FORMATADOR_BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * T5 e a breve exposição do WhatsApp no rodapé da T4 rodam em hosts UTC
 * (Vercel); o público é brasileiro, então o instante fixa o fuso de
 * São Paulo aqui para exibição consistente em qualquer ambiente.
 */
const FUSO_EXIBICAO = "America/Sao_Paulo";

/** `formatarNumero` · 1→"001", 37→"037", 1200→"1200" (padLeft ≥ 3, RF-02). */
export function formatarNumero(numero: number): string {
  if (!Number.isInteger(numero)) {
    throw new Error(`O número da rifa deve ser um inteiro (recebido: ${numero})`);
  }
  if (numero < NUMERO_MINIMO || numero > NUMERO_MAXIMO) {
    throw new Error(
      `O número da rifa deve estar entre ${NUMERO_MINIMO} e ${NUMERO_MAXIMO} (recebido: ${numero})`,
    );
  }
  return String(numero).padStart(3, "0");
}

/** `formatarMoeda` · 850→"R$ 850,00" (Intl pt-BR/BRL, §4.19). */
export function formatarMoeda(valor: number): string {
  if (!Number.isFinite(valor)) {
    throw new Error(`Informe um valor em reais válido (recebido: ${String(valor)})`);
  }
  return FORMATADOR_BRL.format(valor);
}

type ParteTelefone = { area: string; assinante: string };

/** Aceita só DDI 55 + DDD + 8 ou 9 dígitos (E.164 brasileiro). */
const TELEFONE_BR = /^\+55(\d{2})(\d{8,9})$/;

function analisarTelefone(telefone: string): ParteTelefone {
  const partes = TELEFONE_BR.exec(telefone.trim());
  if (!partes) {
    throw new Error(
      "O telefone deve ser brasileiro e estar no formato E.164 (ex.: +5511988887777)",
    );
  }
  return { area: partes[1], assinante: partes[2] };
}

/** Máscara de exibição: "+5511988887777" → "(11) 98888-7777". */
export function formatarTelefone(telefone: string): string {
  const { area, assinante } = analisarTelefone(telefone);
  const grupos =
    assinante.length === 9
      ? `${assinante.slice(0, 5)}-${assinante.slice(5)}`
      : `${assinante.slice(0, 4)}-${assinante.slice(4)}`;
  return `(${area}) ${grupos}`;
}

/**
 * Máscara oculta (RF-10, T5): mantém DDD e primeiro dígito do assinante e...
 * "+5511988884444" → "(11) 9••••-••44". O telefone completo JAMAIS pode sair
 * desta função para a tela pública — a revelação é tarefa do servidor.
 */
export function formatarTelefoneOculto(telefone: string): string {
  const { area, assinante } = analisarTelefone(telefone);
  const inicio = assinante[0] + "•".repeat(assinante.length - 5);
  const fim = "••" + assinante.slice(-2);
  return `(${area}) ${inicio}-${fim}`;
}

/**
 * Direção produção ← exibição (o "↔" da máscara): aceita o texto digitado com
 * ou sem máscara e devolve o E.164 que o banco grava. Sem o `+`, assume-se
 * digitação brasileira sem DDI internacional e o DDI 55 é acrescentado.
 */
export function formatarTelefoneE164(texto: string): string {
  const digitos = texto.replace(/\D/g, "");
  const expressouDDI = texto.trim().startsWith("+");
  const candidata =
    !expressouDDI && (digitos.length === 10 || digitos.length === 11) ? `55${digitos}` : digitos;
  if (!`+${candidata}`.match(TELEFONE_BR)) {
    throw new Error("O telefone deve ter DDI 55 e DDD + 8 ou 9 dígitos (ex.: (11) 98888-7777)");
  }
  return `+${candidata}`;
}

/**
 * Máscara progressiva ao digitar (usada nos formulários): aceita texto parcial
 * e devolve o melhor formato possível no momento — "(1" → "(11" → "(11) 9" →
 * "(11) 98888-7777". Não valida domínio (isso é do `formatarTelefoneE164` na
 * submissão); só formata, com os grupos fixos do celular §4.19 (5-4) — sem
 * reformatação no meio da digitação (o campo é de WhatsApp: celular).
 */
export function mascaraTelefoneDigitacao(texto: string): string {
  const digitos = texto.replace(/\D/g, "").slice(0, 11);
  if (digitos.length === 0) return "";

  const area = digitos.slice(0, 2);
  const assinante = digitos.slice(2);

  if (digitos.length <= 2) return `(${area}`;
  if (assinante.length === 0) return `(${area}) `;
  return assinante.length <= 5
    ? `(${area}) ${assinante}`
    : `(${area}) ${assinante.slice(0, 5)}-${assinante.slice(5)}`;
}

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Data prevista: "2026-12-25" → "25/12/2026" (date sem componente de hora). */
export function formatarData(data: string): string {
  const partes = DATA_ISO.exec(data);
  if (!partes) {
    throw new Error(`A data deve estar no formato AAAA-MM-DD (recebida: ${data})`);
  }
  const [, ano, mes, dia] = partes;
  const calendarizada = new Date(`${data}T00:00:00Z`);
  const comoUTC = {
    ano: calendarizada.getUTCFullYear(),
    mes: calendarizada.getUTCMonth() + 1,
    dia: calendarizada.getUTCDate(),
  };
  if (comoUTC.ano !== Number(ano) || comoUTC.mes !== Number(mes) || comoUTC.dia !== Number(dia)) {
    throw new Error(`A data informada não existe no calendário: ${data}`);
  }
  return `${dia}/${mes}/${ano}`;
}

const FORMATADOR_INSTANTE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_EXIBICAO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Data/hora de sorteio (timestamptz): "2026-11-08T20:30:00Z" → "08/11/2026 17:30".
 * Montagem por `formatToParts` para garantia do layout exato do §4.19,
 * independendo dos separadores que o runtime escolher.
 */
export function formatarDataHora(instante: string | Date): string {
  const data = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(data.getTime())) {
    throw new Error(`Informe uma data/hora válida (recebida: ${String(instante)})`);
  }
  const partes = new Map(
    FORMATADOR_INSTANTE.formatToParts(data).map((parte) => [parte.type, parte.value]),
  );
  // `year` do pt-BR já vem com 4 dígitos; `hour` pode ter espaço decorativo.
  const hora = (partes.get("hour") ?? "").trim();
  return `${partes.get("day")}/${partes.get("month")}/${partes.get("year")} ${hora}:${partes.get("minute")}`;
}
