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
 */
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { editarVenda, registrarVenda, removerVenda, type EstadoVenda } from "@/actions/vendas";
import { BuscaFiltroGrade } from "@/components/BuscaFiltroGrade";
import { GradeNumeros } from "@/components/GradeNumeros";
import { ModalVenda } from "@/components/ModalVenda";
import { Toast } from "@/components/ui/Toast";
import type { StatusNumero } from "@/lib/estados";
import { filtrarGrade, type FiltroEstado } from "@/lib/busca";

export type NumeroDaGrade = { id: string; numero: number; status: StatusNumero };
export type VendaDaGrade = { numero: number; nome: string; telefone: string };

type Props = {
  /** Total da rifa (coluna `quantidade`) — faixa 1..N e blocos da grade. */
  quantidade: number;
  numeros: NumeroDaGrade[];
  vendas: VendaDaGrade[];
};

type Aviso = { mensagem: string; tipo: "sucesso" | "erro" };

/** VT-6 · override otimista: só vale enquanto o servidor exibir `de` (§2.7). */
type Otimismo = { de: StatusNumero; para: StatusNumero };

export function GradeComModal({ quantidade, numeros, vendas }: Props) {
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
