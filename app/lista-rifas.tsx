"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { arquivarRifa, type EstadoAcao } from "@/actions/rifas";
import { Badge } from "@/components/ui/Badge";
import { classesBotaoPrimario } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { ROTULO_STATUS, tipoDoBadge, type StatusRifa } from "@/lib/estados";
import { formatarMoeda } from "@/lib/formato";

/**
 * FD-12 · Listagem interativa da T1 (SPEC §3.2): filtro por status, cards com
 * progresso vendidos/total e menu ⋮ (abrir, editar, arquivar). Recebe do
 * Server Component só os dados exibidos (serialização mínima); o arquivamento
 * passa pela Server Action `arquivarRifa` (FD-11) — a conferência de posse é
 * sempre no servidor, a UI só desabilita o item durante o envio.
 */

/** Card da T1: só campos de exibição — dados de compradores/vendas não entram. */
export type RifaDoCartao = {
  id: string;
  slug: string;
  titulo: string;
  premio_descricao: string;
  premio_valor: number;
  numero_valor: number;
  quantidade: number;
  status: StatusRifa;
  imagem_url: string | null;
  vendidos: number;
};

type Filtro = "todas" | StatusRifa;

const FILTROS: readonly { valor: Filtro; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "aberta", rotulo: "Abertas" },
  { valor: "encerrada", rotulo: "Encerradas" },
  { valor: "sorteada", rotulo: "Sorteadas" },
];

/** Barra vendidos/total (§3.2): proporção com rótulo "0/100" e aria. */
function BarraProgresso({ vendidos, quantidade }: { vendidos: number; quantidade: number }) {
  const percentual = quantidade > 0 ? Math.min(100, Math.round((vendidos / quantidade) * 100)) : 0;

  return (
    <>
      <div
        role="progressbar"
        aria-label={`Progresso de vendas: ${vendidos} de ${quantidade} números vendidos`}
        aria-valuemin={0}
        aria-valuemax={quantidade}
        aria-valuenow={vendidos}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-papel-escuro"
      >
        <div
          className="h-full rounded-full bg-verde-venda transition-[width] duration-300"
          style={{ width: `${percentual}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-medium text-tinta-suave">
        {vendidos}/{quantidade}
      </span>
    </>
  );
}

type MenuRifaProps = {
  rifa: RifaDoCartao;
  pendente: boolean;
  aoArquivar: (id: string) => void;
};

/** Menu ⋮ do card (§3.2: abrir, editar, arquivar) — fecha em ESC/clique fora. */
function MenuRifa({ rifa, pendente, aoArquivar }: MenuRifaProps) {
  const [aberto, setAberto] = React.useState(false);
  const referencia = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!aberto) return;

    const aoClicarFora = (evento: MouseEvent) => {
      if (!referencia.current?.contains(evento.target as Node)) setAberto(false);
    };
    const aoDigitar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAberto(false);
    };

    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoDigitar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoDigitar);
    };
  }, [aberto]);

  return (
    <div ref={referencia} className="absolute right-1.5 top-1.5 z-10">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Ações da rifa ${rifa.titulo}`}
        onClick={() => setAberto((estavaAberto) => !estavaAberto)}
        disabled={pendente}
        className="flex h-11 w-11 items-center justify-center rounded-full text-lg text-tinta-suave transition-colors hover:bg-papel-escuro disabled:opacity-40"
      >
        <span aria-hidden="true">⋮</span>
      </button>

      {aberto ? (
        <div
          role="menu"
          aria-label={`Ações da rifa ${rifa.titulo}`}
          className="absolute right-0 top-12 w-44 overflow-hidden rounded-lg border border-linha bg-white py-1 shadow-lg"
        >
          <Link
            role="menuitem"
            href={`/rifas/${rifa.id}`}
            className="block min-h-[44px] px-4 py-2.5 text-sm text-tinta transition-colors hover:bg-papel-escuro"
            onClick={() => setAberto(false)}
          >
            Abrir
          </Link>
          <Link
            role="menuitem"
            href={`/rifas/${rifa.id}/editar`}
            className="block min-h-[44px] px-4 py-2.5 text-sm text-tinta transition-colors hover:bg-papel-escuro"
            onClick={() => setAberto(false)}
          >
            Editar
          </Link>
          <button
            role="menuitem"
            type="button"
            disabled={pendente}
            onClick={() => aoArquivar(rifa.id)}
            className="block w-full min-h-[44px] px-4 py-2.5 text-left text-sm text-tinta transition-colors hover:bg-papel-escuro disabled:opacity-40"
          >
            {pendente ? "Arquivando…" : "Arquivar"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

type CartaoRifaProps = {
  rifa: RifaDoCartao;
  arquivando: boolean;
  aoArquivar: (id: string) => void;
};

/** Card inteiro é o atalho a T3 (§3.2: tocar card → painel); o ⋮ fica fora do Link. */
function CartaoRifa({ rifa, arquivando, aoArquivar }: CartaoRifaProps) {
  const status = ROTULO_STATUS[rifa.status];

  return (
    <li className="relative">
      <Link
        href={`/rifas/${rifa.id}`}
        className="block rounded-card border border-linha bg-white p-4 pr-12 shadow-sm transition-[border-color,box-shadow] hover:border-marca/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
      >
        <div className="flex items-start gap-3">
          {rifa.imagem_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- miniatura de URL própria do Storage (upload chega no PB-5)
            <img
              src={rifa.imagem_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-marca-suave text-xl"
            >
              🎁
            </span>
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="truncate text-base font-semibold text-tinta">{rifa.titulo}</h2>
            <p className="mt-0.5 text-sm text-tinta-suave">
              Prêmio: {rifa.premio_descricao} {formatarMoeda(rifa.premio_valor)} · Número{" "}
              {formatarMoeda(rifa.numero_valor)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <BarraProgresso vendidos={rifa.vendidos} quantidade={rifa.quantidade} />
          <Badge tipo={tipoDoBadge(rifa.status)}>
            <span aria-hidden="true">{status.icone}</span> {status.texto}
          </Badge>
        </div>
      </Link>

      <MenuRifa rifa={rifa} pendente={arquivando} aoArquivar={aoArquivar} />
    </li>
  );
}

type Props = {
  rifas: RifaDoCartao[];
};

/**
 * Lista filtrável da T1. Estados: vazio (§3.2 prescrito) · lista com cards ·
 * sem resultado no filtro. O arquivamento usa transição: o item mostra
 * "Arquivando…" e o resultado chega como Toast pt-BR (padrão §2.2).
 */
export function ListaRifas({ rifas }: Props) {
  const router = useRouter();
  const [filtro, setFiltro] = React.useState<Filtro>("todas");
  const [arquivandoId, setArquivandoId] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<{ mensagem: string; tipo: "sucesso" | "erro" } | null>(
    null,
  );
  const [pendente, iniciarPendente] = React.useTransition();

  const filtradas = filtro === "todas" ? rifas : rifas.filter((rifa) => rifa.status === filtro);

  const arquivar = (id: string) => {
    setArquivandoId(id);
    iniciarPendente(async () => {
      const resultado: EstadoAcao = await arquivarRifa(id);
      setAviso({ mensagem: resultado.mensagem, tipo: resultado.ok ? "sucesso" : "erro" });
      setArquivandoId(null);
      router.refresh();
    });
  };

  return (
    <div aria-busy={pendente}>
      {rifas.length > 0 ? (
        <nav aria-label="Filtro por status" className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {FILTROS.map(({ valor, rotulo }) => (
            <button
              key={valor}
              type="button"
              aria-pressed={filtro === valor}
              onClick={() => setFiltro(valor)}
              className={[
                "min-h-[36px] shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors",
                filtro === valor
                  ? "border-marca bg-marca text-white"
                  : "border-linha bg-white text-tinta-suave hover:border-marca/40 hover:text-tinta",
              ].join(" ")}
            >
              {rotulo}
            </button>
          ))}
        </nav>
      ) : null}

      {rifas.length === 0 ? (
        <div className="rounded-card border border-linha bg-white px-6 py-12 text-center shadow-sm">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-marca-suave text-2xl"
          >
            🎫
          </span>
          <p className="text-base font-medium text-tinta">
            Você ainda não tem rifas. Crie a primeira!
          </p>
          <p className="mt-1 text-sm text-tinta-suave">
            Em poucos passos ela já está no ar para vender.
          </p>
          <Link href="/rifas/nova" className={`${classesBotaoPrimario} mt-6`}>
            Criar primeira rifa
          </Link>
        </div>
      ) : filtradas.length === 0 ? (
        <p
          role="status"
          className="rounded-card border border-linha bg-white px-6 py-10 text-center text-sm text-tinta-suave shadow-sm"
        >
          Nenhuma rifa com esse status.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtradas.map((rifa) => (
            <CartaoRifa
              key={rifa.id}
              rifa={rifa}
              arquivando={arquivandoId === rifa.id}
              aoArquivar={arquivar}
            />
          ))}
        </ul>
      )}

      {aviso ? (
        <Toast mensagem={aviso.mensagem} tipo={aviso.tipo} aoEncerrar={() => setAviso(null)} />
      ) : null}
    </div>
  );
}
