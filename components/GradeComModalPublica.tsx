"use client";

/**
 * PB-2 · Cola pública da grade com o modal enxuto (SPEC §3.5 · matriz §5.2
 * RF-05a): o visitante anônimo da T4 registra comprador em número
 * DISPONÍVEL — nome + telefone — e nada mais. Não existe editar,
 * transferir nem remover na T4 (RN-03: edição/remoção exclusivas do
 * organizador): número vendido ou sorteado mostra o texto prescrito
 * "Número já vendido." e não abre formulário; com as vendas encerradas, o
 * toque em número disponível avisa "As vendas desta rifa estão
 * encerradas." (mesma recusa da `registrarVenda`, §4.5).
 *
 * VT-6 · padrão otimista com rollback (§6): ao salvar, a pastilha fica
 * verde ✓ na hora; recusa do servidor → rollback + toast e o alerta inline
 * do modal segue aberto (recusa nunca engolida — padrão VT-4). O override
 * é CONDICIONAL ao estado pré-ação (`de`): a verdade do servidor vence
 * (§2.7), sem efeito e sem nunca mascarar o banco.
 *
 * VT-9/RF-18 · a T4 também assina `POSTGRES_CHANGES` em `numeros`
 * (migração 005): a venda do organizador (ou de outro consultor) chega ao
 * vivo — pastilha e F2 ("T4 atualiza só a grade, sem valores") respondem
 * sem refresh; modal aberto no número vendido por outra tela recebe o
 * alerta prescrito na hora.
 *
 * Privacidade (RN-02/RNF-05): este componente NUNCA recebe dados de
 * compradores — só ids/estados de número; o resumo financeiro não existe
 * na T4 (RN-02, decisão 8).
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { registrarVendaPublica, type EstadoVenda } from "@/actions/vendas";
import { GradeNumeros } from "@/components/GradeNumeros";
import { ModalVenda } from "@/components/ModalVenda";
import { Toast } from "@/components/ui/Toast";
import type { NumeroDaGrade } from "@/components/GradeComModal";
import type { StatusNumero } from "@/lib/estados";
import { assinarMudancaNumeros, type MudancaStatusNumeros } from "@/lib/supabase/realtime";

type Props = {
  /** Id da rifa — assina o canal Realtime de `numeros` (RF-18, migração 005). */
  rifaId: string;
  /** Total da rifa (coluna `quantidade`) — faixa 1..N e blocos da grade. */
  quantidade: number;
  numeros: NumeroDaGrade[];
  /** SR-5 · vencedor vigente (§2.7): destaque dourado 🏆 na grade da T4. */
  numeroSorteado?: number;
  /** §3.5: só a etapa `aberta` vende — encerrada/sorteada bloqueiam o toque. */
  vendasAbertas: boolean;
};

type Aviso = { mensagem: string; tipo: "sucesso" | "erro" };

/** VT-6 · override otimista: só vale enquanto o servidor exibir `de` (§2.7). */
type Otimismo = { de: StatusNumero; para: StatusNumero };

/** §3.5 · texto prescrito do toque em número ocupado na T4. */
const NUMERO_JA_VENDIDO = "Número já vendido.";
/** §4.5 · texto prescrito da corrida (o mesmo da T3 — VT-9). */
const NUMERO_VENDIDO_AO_VIVO = "Esse número acabou de ser vendido";
const VENDAS_ENCERRADAS = "As vendas desta rifa estão encerradas.";

export function GradeComModalPublica({
  rifaId,
  quantidade,
  numeros,
  numeroSorteado,
  vendasAbertas,
}: Props) {
  const router = useRouter();
  const [numeroSelecionado, setNumeroSelecionado] = useState<number | null>(null);
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  // VT-6 · otimismo por número: `{ de, para }` condicional ao pré-ação (§2.7).
  const [otimistas, setOtimistas] = useState<Map<number, Otimismo>>(new Map());
  const [pendente, iniciarPendente] = useTransition();

  const mapaNumeros = useMemo(
    () => new Map(numeros.map((numero) => [numero.numero, numero])),
    [numeros],
  );

  // VT-9 · espelhos de leitura para o callback do canal: o canal vive
  // enquanto a tela viver e os eventos chegam FORA do render — os espelhos
  // são atualizados em effect (regra react-hooks/refs: nada de ref no
  // render), sem ressuscrição do canal a cada refresh.
  const mapaNumerosRef = useRef(mapaNumeros);
  const numeroSelecionadoRef = useRef(numeroSelecionado);
  const otimistasRef = useRef(otimistas);
  useEffect(() => {
    mapaNumerosRef.current = mapaNumeros;
    numeroSelecionadoRef.current = numeroSelecionado;
    otimistasRef.current = otimistas;
  });

  // VT-9 · RF-18 na T4: evento ao vivo de `numeros` — pastilha e modal
  // respondem sem que ninguém aperte F5 (F2: "T4 atualiza só a grade").
  useEffect(() => {
    const canal = assinarMudancaNumeros(rifaId, (mudanca: MudancaStatusNumeros) => {
      const { numero, status: statusAoVivo } = mudanca.resposta;
      if (statusAoVivo !== "disponivel" && statusAoVivo !== "vendido") return;

      // MODAL: só mudanças de OUTRA tela (a nossa em voo é a própria
      // gravação chegando — o aviso seria confusão, padrão T3).
      const emVoo = otimistasRef.current.has(numero);
      if (!emVoo && numeroSelecionadoRef.current === numero && statusAoVivo === "vendido") {
        setErroServidor(NUMERO_VENDIDO_AO_VIVO);
        setAviso({ mensagem: NUMERO_VENDIDO_AO_VIVO, tipo: "erro" });
      }

      // PASTILHA: antecipa pelo override condicional, exceto sob ação em voo.
      setOtimistas((atuais) => {
        const pendenteOtimismo = atuais.get(numero);
        if (pendenteOtimismo) {
          if (pendenteOtimismo.para !== statusAoVivo) {
            const proximos = new Map(atuais);
            proximos.delete(numero);
            return proximos;
          }
          return atuais;
        }
        const statusDoServidor = mapaNumerosRef.current.get(numero)?.status;
        if (!statusDoServidor || statusDoServidor === statusAoVivo) return atuais;
        const proximos = new Map(atuais);
        proximos.set(numero, { de: statusDoServidor, para: statusAoVivo });
        return proximos;
      });

      router.refresh();
    });

    return () => {
      void canal.unsubscribe();
    };
  }, [rifaId, router]);

  // VT-6 · grade = servidor + otimismo; a verdade do servidor vence (§2.7).
  const numerosExibidos = useMemo(
    () =>
      otimistas.size === 0
        ? numeros
        : numeros.map((numero) => {
            const otimista = otimistas.get(numero.numero);
            return otimista && otimista.de === numero.status
              ? { ...numero, status: otimista.para }
              : numero;
          }),
    [numeros, otimistas],
  );

  /** Toque da T4 (§3.5): disponível abre o modal; ocupado/encerrada avisa. */
  const tocar = (numero: number) => {
    setErroServidor(null);
    const pastilha = numerosExibidos.find((item) => item.numero === numero);
    if (!pastilha) return;

    if (pastilha.status !== "disponivel") {
      setAviso({ mensagem: NUMERO_JA_VENDIDO, tipo: "erro" });
      return;
    }
    if (!vendasAbertas) {
      setAviso({ mensagem: VENDAS_ENCERRADAS, tipo: "erro" });
      return;
    }
    setNumeroSelecionado(numero);
  };

  const fechar = () => {
    setNumeroSelecionado(null);
    setErroServidor(null);
  };

  /** VT-6 · recusa do servidor: rollback do otimismo + alerta inline (§4.5). */
  const recusar = (mensagem: string, numero: number) => {
    setOtimistas((atuais) => {
      if (!atuais.has(numero)) return atuais;
      const proximos = new Map(atuais);
      proximos.delete(numero);
      return proximos;
    });
    setErroServidor(mensagem);
    setAviso({ mensagem, tipo: "erro" });
  };

  /** RF-05a · registrar comprador no número disponível (origem fica no servidor). */
  const enviar = (nome: string, telefoneE164: string) => {
    const alvo = numeroSelecionado === null ? undefined : mapaNumeros.get(numeroSelecionado);
    if (!alvo) return;

    // Defensiva: só disponível registra (o toque já filtra — §3.5).
    if (alvo.status !== "disponivel" || !vendasAbertas) {
      setNumeroSelecionado(null);
      setAviso({
        mensagem: alvo.status !== "disponivel" ? NUMERO_JA_VENDIDO : VENDAS_ENCERRADAS,
        tipo: "erro",
      });
      return;
    }

    // Otimismo ANTES da transição (prioridade urgente — padrão VT-6).
    setOtimistas((atuais) =>
      new Map(atuais).set(alvo.numero, { de: alvo.status, para: "vendido" }),
    );

    iniciarPendente(async () => {
      const resultado: EstadoVenda = await registrarVendaPublica({
        numeroId: alvo.id,
        nome,
        telefone: telefoneE164,
      });

      if (resultado.ok) {
        setErroServidor(null);
        setNumeroSelecionado(null);
        setAviso({ mensagem: resultado.mensagem, tipo: "sucesso" });
        // O override permanece até o servidor refletir a ação (derivado).
        router.refresh();
      } else {
        recusar(resultado.mensagem, alvo.numero);
      }
    });
  };

  const selecionado = numeroSelecionado === null ? undefined : mapaNumeros.get(numeroSelecionado);

  return (
    <div aria-busy={pendente}>
      <GradeNumeros
        numeros={numerosExibidos}
        quantidade={quantidade}
        numeroSorteado={numeroSorteado}
        aoTocarNumero={tocar}
      />

      {/* Modal enxuto (§3.5): sem `aoRemover` — a T4 não edita nem remove. */}
      {selecionado ? (
        <ModalVenda
          // `key` reinicia o formulário a cada número aberto.
          key={selecionado.numero}
          numero={selecionado.numero}
          status={selecionado.status}
          pendente={pendente}
          erroServidor={erroServidor}
          aoEnviar={enviar}
          aoFechar={fechar}
        />
      ) : null}

      {aviso ? (
        <Toast mensagem={aviso.mensagem} tipo={aviso.tipo} aoEncerrar={() => setAviso(null)} />
      ) : null}
    </div>
  );
}
