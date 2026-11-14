"use client";

/**
 * VT-4/VT-6 · Cola da grade com o modal T3a (SPEC §3.4.4/§3.4.5): recebe do
 * Server Component os números (id/estado) e as vendas vigentes com o
 * comprador, e despacha as Server Actions de venda (VT-5). O feedback segue o
 * padrão da casa: sucesso fecha o modal, mostra Toast pt-BR e revalida o
 * painel (`router.refresh()` — grade e resumo re-renderizam no servidor).
 *
 * VT-6 · Padrão otimista com rollback (SPEC §6/§3.4.5/§4.5): ao salvar uma
 * venda a pastilha muda NA HORA (verde ✓ antes da resposta do servidor); se o
 * servidor recusar — o consultor vendeu o número 1s antes (RN-03, corrida) —
 * a pastilha volta ao estado do servidor com rollback + toast prescrito
 * ("Esse número acabou de ser vendido"), e o alerta inline do modal segue
 * visível (recusa de Server Action nunca é engolida, VT-4).
 *
 * O override otimista é CONDICIONAL ao estado pré-ação (`de`): só vale
 * enquanto o servidor ainda exibe o estado anterior. Assim que o servidor
 * refletir a ação (refresh/revalidação) — ou mudar por conta própria
 * (realtime da VT-9) — o estado do servidor vence. Reconciliação sem effect,
 * sem flicker e sem jamais mascarar o banco: a UI não é fonte de verdade
 * (§2.7 — a conferência é sempre no servidor).
 *
 * VT-9 · RF-18 (§4.16): o canal Realtime (`POSTGRES_CHANGES` em `numeros`
 * — migração 005) entrega ao vivo as mudanças feitas por QUALQUER tela
 * (consultor na T4/PB-2, organizador em outra aba). O handler:
 *   1. modal — número aberto vendido por outra pessoa avisa na hora com o
 *      texto prescrito "Esse número acabou de ser vendido" (o Salvar
 *      recusaria com a MESMA mensagem, VT-5);
 *   2. pastilha — antecipa o estado do evento pelo MESMO override
 *      condicional da VT-6, exceto quando há ação nossa em voo para o
 *      número (o otimismo dela governa; se o mundo passou por cima dela,
 *      o override é descartado e a verdade chega pelo refresh);
 *   3. grade/resumo/cabeçalho — `router.refresh()` re-renderiza os Server
 *      Components com o estado do banco (o resumo não assina canal
 *      próprio: ele é Server Component, RN-02/decisão 8).
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { editarVenda, registrarVenda, removerVenda, type EstadoVenda } from "@/actions/vendas";
import { BuscaFiltroGrade } from "@/components/BuscaFiltroGrade";
import { GradeNumeros } from "@/components/GradeNumeros";
import { ModalVenda } from "@/components/ModalVenda";
import { Toast } from "@/components/ui/Toast";
import type { StatusNumero } from "@/lib/estados";
import { filtrarGrade, type FiltroEstado } from "@/lib/busca";
import { assinarMudancaNumeros, type MudancaStatusNumeros } from "@/lib/supabase/realtime";

export type NumeroDaGrade = { id: string; numero: number; status: StatusNumero };
export type VendaDaGrade = { numero: number; nome: string; telefone: string };

type Props = {
  /** Id da rifa — assina o canal Realtime de `numeros` (RF-18, migração 005). */
  rifaId: string;
  /** Total da rifa (coluna `quantidade`) — faixa 1..N e blocos da grade. */
  quantidade: number;
  numeros: NumeroDaGrade[];
  vendas: VendaDaGrade[];
};

type Aviso = { mensagem: string; tipo: "sucesso" | "erro" };

/** VT-6 · override otimista: só vale enquanto o servidor exibir `de` (§2.7). */
type Otimismo = { de: StatusNumero; para: StatusNumero };

/** §4.5 · texto prescrito da corrida — usado ao vivo (VT-9) e na recusa. */
const NUMERO_VENDIDO_AO_VIVO = "Esse número acabou de ser vendido";

export function GradeComModal({ rifaId, quantidade, numeros, vendas }: Props) {
  const router = useRouter();
  const [numeroSelecionado, setNumeroSelecionado] = useState<number | null>(null);
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  // VT-8 · busca e filtro locais (§3.4.3): filtram apenas a EXIBIÇÃO — o
  // estado do banco nunca muda por aqui (a conferência é no servidor, §2.7).
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroEstado>("todos");
  // VT-6 · otimismo por número: `{ de, para }` — o `para` só substitui o
  // status ENQUANTO o servidor ainda exibir o `de` (estado pré-ação). Map
  // (não slot único) suporta mais de uma ação em voo sem colisão.
  const [otimistas, setOtimistas] = useState<Map<number, Otimismo>>(new Map());
  // useTransition com callback assíncrono — mesmo padrão da lista T1 (FD-12).
  const [pendente, iniciarPendente] = useTransition();

  const mapaNumeros = useMemo(
    () => new Map(numeros.map((numero) => [numero.numero, numero])),
    [numeros],
  );
  const mapaVendas = useMemo(() => new Map(vendas.map((venda) => [venda.numero, venda])), [vendas]);

  // VT-9 · espelho de leitura para o callback do canal: o canal vive enquanto
  // a tela viver e os eventos chegam FORA do render — os espelhos são
  // atualizados em effect (regra react-hooks/refs: nada de ref no render).
  const numerosRef = useRef(numeros);
  const numeroSelecionadoRef = useRef(numeroSelecionado);
  const otimistasRef = useRef(otimistas);
  useEffect(() => {
    numerosRef.current = numeros;
    numeroSelecionadoRef.current = numeroSelecionado;
    otimistasRef.current = otimistas;
  });

  // VT-9 · RF-18: evento ao vivo de `numeros` — modal, pastilha e painel
  // respondem sem que ninguém aperte F5 (§4.16).
  useEffect(() => {
    const canal = assinarMudancaNumeros(rifaId, (mudanca: MudancaStatusNumeros) => {
      const { numero, status: statusAoVivo } = mudanca.resposta;
      if (statusAoVivo !== "disponivel" && statusAoVivo !== "vendido") return;

      // 1. MODAL: só para mudanças de OUTRA tela. Com ação nossa em voo para
      // o número, o evento é a própria gravação dela chegando — avisar
      // "acabou de ser vendido" pela venda do organizador seria confusão.
      const emVoo = otimistasRef.current.has(numero);
      if (!emVoo && numeroSelecionadoRef.current === numero && statusAoVivo === "vendido") {
        setErroServidor(NUMERO_VENDIDO_AO_VIVO);
        setAviso({ mensagem: NUMERO_VENDIDO_AO_VIVO, tipo: "erro" });
      }

      // 2. PASTILHA: antecipa o estado do evento pelo override condicional
      // da VT-6. Com ação nossa em voo, o otimismo dela governa — e se o
      // mundo passou por cima dela (ex.: remoção concorrente), o override
      // é descartado: a verdade chega pelo refresh (nunca mascara o banco).
      setOtimistas((atuais) => {
        const pendente = atuais.get(numero);
        if (pendente) {
          if (pendente.para !== statusAoVivo) {
            const proximos = new Map(atuais);
            proximos.delete(numero);
            return proximos;
          }
          return atuais;
        }
        const statusDoServidor = numerosRef.current.find((n) => n.numero === numero)?.status;
        if (!statusDoServidor || statusDoServidor === statusAoVivo) return atuais;
        const proximos = new Map(atuais);
        proximos.set(numero, { de: statusDoServidor, para: statusAoVivo });
        return proximos;
      });

      // 3. GRADE/RESUMO/CABEÇALHO: Server Components re-renderizam no
      // servidor com o estado do banco (o resumo não assina canal próprio).
      router.refresh();
    });

    return () => {
      void canal.unsubscribe();
    };
  }, [rifaId, router]);

  // VT-6 · a grade recebe servidor + otimismo: o número em voo exibe o estado
  // antecipado enquanto o servidor ainda mostra o pré-ação; quando o servidor
  // reflete a ação (ou muda por conta própria), o estado do servidor vence —
  // reconciliação derivada em render, sem effect e sem limpeza manual.
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

  // VT-8 · busca + filtro derivados em render (sem effect), por CIMA do
  // otimismo: o número em voo continua filtrável no estado antecipado.
  const { visiveis: numerosFiltrados, destaque: numeroDestaque } = useMemo(
    () => filtrarGrade(numerosExibidos, mapaVendas, busca, filtro),
    [numerosExibidos, mapaVendas, busca, filtro],
  );
  const semResultado =
    numerosFiltrados.length === 0 && (busca.trim().length > 0 || filtro !== "todos");

  const limparBusca = () => {
    setBusca("");
    setFiltro("todos");
  };

  const abrir = (numero: number) => {
    setErroServidor(null);
    setNumeroSelecionado(numero);
  };

  const fechar = () => {
    setNumeroSelecionado(null);
    setErroServidor(null);
  };

  /** VT-6 · recusa do servidor: rollback do otimismo + toast prescrito (§4.5)
   *  e alerta inline com o modal aberto (recusa nunca engolida — VT-4). */
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

  /** Registrar (número disponível) ou transferir (número vendido, RF-06). */
  const enviar = (nome: string, telefone: string) => {
    const alvo = numeroSelecionado === null ? undefined : mapaNumeros.get(numeroSelecionado);
    if (!alvo) return;

    const transferindo = mapaVendas.has(alvo.numero);
    // Otimismo ANTES da transição (prioridade urgente): a pastilha vira verde
    // com ✓ na hora do Salvar, enquanto a ação está em voo (§6). Edição/
    // transferência não muda o status — nada a antecipar.
    if (!transferindo && alvo.status === "disponivel") {
      setOtimistas((atuais) =>
        new Map(atuais).set(alvo.numero, { de: alvo.status, para: "vendido" }),
      );
    }

    iniciarPendente(async () => {
      const resultado: EstadoVenda = transferindo
        ? await editarVenda({ numeroId: alvo.id, nome, telefone })
        : await registrarVenda({ numeroId: alvo.id, nome, telefone });

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

  const remover = () => {
    const alvo = numeroSelecionado === null ? undefined : mapaNumeros.get(numeroSelecionado);
    if (!alvo) return;

    // VT-6 · otimismo na remoção (§6/RF-06): pastilha volta a disponível na hora.
    setOtimistas((atuais) =>
      new Map(atuais).set(alvo.numero, { de: alvo.status, para: "disponivel" }),
    );

    iniciarPendente(async () => {
      const resultado = await removerVenda(alvo.id);
      if (resultado.ok) {
        setErroServidor(null);
        setNumeroSelecionado(null);
        setAviso({ mensagem: resultado.mensagem, tipo: "sucesso" });
        router.refresh();
      } else {
        recusar(resultado.mensagem, alvo.numero);
      }
    });
  };

  const selecionado = numeroSelecionado === null ? undefined : mapaNumeros.get(numeroSelecionado);
  const compradorSelecionado =
    numeroSelecionado === null ? undefined : mapaVendas.get(numeroSelecionado);

  return (
    <div aria-busy={pendente}>
      {numeros.length > 0 ? (
        <div className="mb-3">
          <BuscaFiltroGrade
            busca={busca}
            filtro={filtro}
            aoDigitar={setBusca}
            aoFiltrar={setFiltro}
          />
        </div>
      ) : null}

      {semResultado ? (
        <div
          role="status"
          className="rounded-card border border-linha bg-white px-6 py-10 text-center shadow-sm"
        >
          <p className="text-sm font-medium text-tinta">
            Nenhum número encontrado{busca.trim() ? ` para "${busca.trim()}"` : ""}.
          </p>
          <p className="mt-1 text-sm text-tinta-suave">
            Ajuste a busca ou o filtro para ver a grade completa.
          </p>
          <button
            type="button"
            onClick={limparBusca}
            className="mt-4 min-h-[44px] rounded-full border border-marca px-5 text-sm font-semibold text-marca transition-colors hover:bg-marca-suave"
          >
            Limpar busca e filtros
          </button>
        </div>
      ) : (
        <GradeNumeros
          numeros={numerosFiltrados}
          quantidade={quantidade}
          numeroDestaque={numeroDestaque ?? undefined}
          aoTocarNumero={abrir}
        />
      )}

      {selecionado ? (
        <ModalVenda
          // `key` reinicia o formulário a cada número aberto (prefill correto).
          key={selecionado.numero}
          numero={selecionado.numero}
          status={selecionado.status}
          comprador={compradorSelecionado}
          pendente={pendente}
          erroServidor={erroServidor}
          aoEnviar={enviar}
          aoRemover={remover}
          aoFechar={fechar}
        />
      ) : null}

      {aviso ? (
        <Toast mensagem={aviso.mensagem} tipo={aviso.tipo} aoEncerrar={() => setAviso(null)} />
      ) : null}
    </div>
  );
}
