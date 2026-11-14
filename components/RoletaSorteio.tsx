"use client";

/**
 * SR-5 · RoletaSorteio (RF-09a · SPEC §4.9/§2.2) — animação PURAMENTE
 * presentacional no browser: roda DEPOIS de o servidor gravar o resultado
 * (a Server Action `sortear` só devolve sucesso com o snapshot já gravado —
 * SR-3), gira 3–5 s pelos primeiros nomes dos participantes e desacelera no
 * número/nome JÁ retornados pelo servidor. Nada aqui escolhe, altera ou
 * bloqueia vencedor: o resultado é único e auditável no banco (RNF-06) — a
 * roleta é cenário ("emoção é presentacional", §4.9).
 *
 * Bordas prescritas pela matriz §5.2 (RF-09a · Cenário B):
 *   - sem participantes → renderiza NEUTRA (sem giro, sem nomes do ciclo),
 *     exibindo direto o resultado servido, e nunca bloqueia o fluxo: fechar
 *     segue disponível (a gravação já aconteceu);
 *   - honra `prefers-reduced-motion` (RNF-03/PL-2): sem animação, revela
 *     direto.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatarNumero, formatarQuantidade } from "@/lib/formato";
import type { ResultadoSorteio } from "@/lib/schemas";

/** Participante da roleta: nome da venda vigente + número vendido. */
export type ParticipanteRoleta = { nome: string; numero: number };

/** Janela prescrita de 3–5 s (§4.9): 24 passos com intervalo crescente ≈ 3,6 s. */
const PASSOS_GIRO = 24;
const ATRASO_INICIAL_MS = 60;
const ATRASO_FINAL_MS = 320;
const ATRASO_REVELACAO_MS = 500;

/** Domínio da coluna `numeros.numero` (CHECK da migração 001) — filtro defensivo. */
const NUMERO_MAXIMO = 5000;

const PREFERS_REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * Cronograma PURO do giro: intervalos crescentes ao quadrado (ease-out) —
 * arranca rápido e desacelera até parar. Puro e exportado para o teste
 * unitário avançar com fake timers de forma determinística.
 */
export function cronogramaGiro(
  passos = PASSOS_GIRO,
  inicialMs = ATRASO_INICIAL_MS,
  finalMs = ATRASO_FINAL_MS,
): number[] {
  if (passos < 2) return [inicialMs];
  return Array.from({ length: passos }, (_, passo) => {
    const fracao = passo / (passos - 1);
    return Math.round(inicialMs + (finalMs - inicialMs) * fracao * fracao);
  });
}

function prefereMenosMovimento(): boolean {
  return window.matchMedia?.(PREFERS_REDUCED_MOTION).matches ?? false;
}

/** §4.9 — "primeiros nomes dos participantes": primeiro token do nome. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

type Entrada = { nome: string; numero: string };

type Props = {
  /** Nomes + números das vendas vigentes (cenário do giro). */
  participantes: ParticipanteRoleta[];
  /** Snapshot JÁ gravado pelo servidor (contrato FD-5) — o ponto final. */
  resultado: ResultadoSorteio;
  /** Fechamento (botão, ESC ou backdrop): quem consome revela o painel. */
  aoEncerrar: () => void;
};

export function RoletaSorteio({ participantes, resultado, aoEncerrar }: Props) {
  // Ciclo de exibição: só o cenário do giro. Dado malformado (nome vazio,
  // número fora do domínio da coluna) nunca derruba a tela — entra no filtro,
  // padrão GradeNumeros. O vencedor NUNCA vem daqui: o ponto final é sempre
  // o snapshot servido pelo servidor (§4.9).
  const ciclo = useMemo<Entrada[]>(
    () =>
      participantes.flatMap((participante) => {
        const nome = primeiroNome(participante.nome);
        if (
          nome === "" ||
          !Number.isInteger(participante.numero) ||
          participante.numero < 1 ||
          participante.numero > NUMERO_MAXIMO
        ) {
          return [];
        }
        return [{ nome, numero: formatarNumero(participante.numero) }];
      }),
    [participantes],
  );

  // Sem participantes (borda da matriz) ou prefers-reduced-motion: revela
  // direto — neutro, sem giro, sem nunca bloquear o fluxo (a gravação já é
  // fato do servidor).
  const [revelado, setRevelado] = useState(
    () => ciclo.length === 0 || prefereMenosMovimento(),
  );
  const [indice, setIndice] = useState(0);

  // Espelho do ciclo (regra react-hooks/refs — atualizado em effect): um
  // `router.refresh()` do painel troca a identidade da lista de participantes
  // no MEIO do giro (a rifa já virou "sorteada") sem reiniciar a animação.
  const cicloRef = useRef(ciclo);
  useEffect(() => {
    cicloRef.current = ciclo;
  }, [ciclo]);

  useEffect(() => {
    if (revelado) return;

    const atrasos = cronogramaGiro();
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout>;

    const girar = (passo: number) => {
      if (cancelado) return;
      const cicloAtual = cicloRef.current;
      if (cicloAtual.length > 0) {
        setIndice(passo % cicloAtual.length);
      }
      if (passo + 1 < atrasos.length) {
        timer = setTimeout(() => girar(passo + 1), atrasos[passo]);
      } else {
        // Desacelerou até parar: para no resultado SERVIDO pelo servidor.
        timer = setTimeout(() => {
          if (!cancelado) setRevelado(true);
        }, ATRASO_REVELACAO_MS);
      }
    };

    timer = setTimeout(() => girar(0), atrasos[0]);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [revelado]);

  const revelando = revelado || ciclo.length === 0;
  const entrada = ciclo[indice % Math.max(ciclo.length, 1)];

  return (
    <Modal
      aberto
      aoFechar={aoEncerrar}
      titulo={revelando ? "Resultado do sorteio" : "Sorteando o vencedor…"}
    >
      <div className="space-y-4 text-center">
        <p aria-hidden="true" className="text-4xl">
          {revelando ? "🎉" : "🎰"}
        </p>

        {revelando ? (
          // Resultado SERVIDO (único lugar onde o vencedor aparece — §4.9).
          // `role=status` anuncia uma única vez, no fim do giro.
          <div role="status" className="space-y-1">
            <p className="text-sm text-tinta-suave">Número sorteado:</p>
            <p className="text-4xl font-bold tabular-nums text-ouro">
              {formatarNumero(resultado.numero)}
            </p>
            <p className="text-base font-medium text-tinta">{resultado.nomeVencedor}</p>
            <p className="text-sm text-tinta-suave">
              Entre {formatarQuantidade(resultado.totalVendidos)} números vendidos.
            </p>
          </div>
        ) : (
          // Giro é cenário visual: fora da leitura contínua (aria-hidden) —
          // o anúncio acessível acontece UMA vez, no resultado (role=status).
          <div aria-hidden="true" className="space-y-1">
            <p className="text-4xl font-bold tabular-nums text-tinta">{entrada.numero}</p>
            <p className="text-lg text-tinta-suave">{entrada.nome}</p>
          </div>
        )}

        <Button onClick={aoEncerrar} className="w-full">
          Voltar ao painel
        </Button>
      </div>
    </Modal>
  );
}
