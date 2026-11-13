"use client";

/**
 * VT-4 · Cola da grade com o modal T3a (SPEC §3.4.4/§3.4.5): recebe do Server
 * Component os números (id/estado) e as vendas vigentes com o comprador, e
 * despacha as Server Actions de venda (VT-5). O feedback segue o padrão da
 * casa: sucesso fecha o modal, mostra Toast pt-BR e revalida o painel
 * (`router.refresh()` — grade e resumo re-renderizam no servidor); falha
 * volta para o modal como `role=alert` (corrida, sessão, banco — nunca
 * engolida). O padrão otimista com rollback é a VT-6.
 */
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { editarVenda, registrarVenda, removerVenda, type EstadoVenda } from "@/actions/vendas";
import { GradeNumeros } from "@/components/GradeNumeros";
import { ModalVenda } from "@/components/ModalVenda";
import { Toast } from "@/components/ui/Toast";
import type { StatusNumero } from "@/lib/estados";

export type NumeroDaGrade = { id: string; numero: number; status: StatusNumero };
export type VendaDaGrade = { numero: number; nome: string; telefone: string };

type Props = {
  /** Total da rifa (coluna `quantidade`) — faixa 1..N e blocos da grade. */
  quantidade: number;
  numeros: NumeroDaGrade[];
  vendas: VendaDaGrade[];
};

type Aviso = { mensagem: string; tipo: "sucesso" | "erro" };

export function GradeComModal({ quantidade, numeros, vendas }: Props) {
  const router = useRouter();
  const [numeroSelecionado, setNumeroSelecionado] = useState<number | null>(null);
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  // useTransition com callback assíncrono — mesmo padrão da lista T1 (FD-12).
  const [pendente, iniciarPendente] = useTransition();

  const mapaNumeros = useMemo(
    () => new Map(numeros.map((numero) => [numero.numero, numero])),
    [numeros],
  );
  const mapaVendas = useMemo(() => new Map(vendas.map((venda) => [venda.numero, venda])), [vendas]);

  const abrir = (numero: number) => {
    setErroServidor(null);
    setNumeroSelecionado(numero);
  };

  const fechar = () => {
    setNumeroSelecionado(null);
    setErroServidor(null);
  };

  /** Registrar (número disponível) ou transferir (número vendido, RF-06). */
  const enviar = (nome: string, telefone: string) => {
    const alvo = numeroSelecionado === null ? undefined : mapaNumeros.get(numeroSelecionado);
    if (!alvo) return;

    iniciarPendente(async () => {
      const transferindo = mapaVendas.has(alvo.numero);
      const resultado: EstadoVenda = transferindo
        ? await editarVenda({ numeroId: alvo.id, nome, telefone })
        : await registrarVenda({ numeroId: alvo.id, nome, telefone });

      if (resultado.ok) {
        setErroServidor(null);
        setNumeroSelecionado(null);
        setAviso({ mensagem: resultado.mensagem, tipo: "sucesso" });
        router.refresh();
      } else {
        // Recusa do servidor (corrida, sessão, banco): modal segue aberto.
        setErroServidor(resultado.mensagem);
      }
    });
  };

  const remover = () => {
    const alvo = numeroSelecionado === null ? undefined : mapaNumeros.get(numeroSelecionado);
    if (!alvo) return;

    iniciarPendente(async () => {
      const resultado = await removerVenda(alvo.id);
      if (resultado.ok) {
        setErroServidor(null);
        setNumeroSelecionado(null);
        setAviso({ mensagem: resultado.mensagem, tipo: "sucesso" });
        router.refresh();
      } else {
        setErroServidor(resultado.mensagem);
      }
    });
  };

  const selecionado = numeroSelecionado === null ? undefined : mapaNumeros.get(numeroSelecionado);
  const compradorSelecionado =
    numeroSelecionado === null ? undefined : mapaVendas.get(numeroSelecionado);

  return (
    <div aria-busy={pendente}>
      <GradeNumeros numeros={numeros} quantidade={quantidade} aoTocarNumero={abrir} />

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
