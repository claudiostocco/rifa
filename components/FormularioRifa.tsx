"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { criarRifa, salvarEdicaoRifa, type EstadoRifa } from "@/actions/rifas";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  formatarFrasePremio,
  formatarQuantidade,
  mascaraMoedaDigitacao,
  valorDeTextoMoeda,
} from "@/lib/formato";
import { CriarRifaInputSchema, TAMANHOS_RIFA, type RotuloPremio } from "@/lib/schemas";

/**
 * FD-13 · T2 · Criar/Editar rifa (SPEC §3.3, §4.1 · matriz §5.2 RF-01).
 *
 * Formulário único com validação em tempo real: o mesmo `CriarRifaInputSchema`
 * do contrato (FD-5) roda no cliente a cada alteração — botão inativo até o
 * mínimo válido e mensagens por campo, tocadas no `blur` (quantidade e mínima
 * são co-tocadas: RN-05 amarra os dois). A escrita passa pelas Server Actions
 * (`criarRifa` FD-10 / `salvarEdicaoRifa` → `editarRifa` FD-11): o cliente
 * valida só para guiar, o servidor é a fonte de verdade.
 *
 * Máscara de moeda progressiva (`mascaraMoedaDigitacao`, §4.19) e contadores
 * de caracteres (título 60, descrição 500). Com QUALQUER venda, o select de
 * quantidade vem desabilitado do servidor (RN-09) — nem chega ao FormData.
 *
 * A prévia do prêmio (`formatarFrasePremio`) é o único elemento vivo além dos
 * campos: mostra a frase exata que o comprador verá na T4 enquanto o rótulo é
 * escolhido — feedback que evita a confusão clássica entre "estimado", "mais
 * de" e "até".
 */

/** Rifa pré-preenchida no modo edição — valores já em formato de digitação. */
export type RifaParaEdicao = {
  id: string;
  titulo: string;
  descricao: string;
  premio_descricao: string;
  premio_rotulo: RotuloPremio;
  /** "850,00" — o mesmo formato que a máscara de digitação produz. */
  premio_valor: string;
  numero_valor: string;
  quantidade: number;
  qtd_minima: number;
  /** "AAAA-MM-DD" ou "" quando a rifa não tem data prevista. */
  data_prevista: string;
};

type Props = {
  /** Presente = modo edição; ausente = modo criação. */
  rifa?: RifaParaEdicao;
  /** RN-09: com qualquer venda (vigente ou removida) a quantidade trava. */
  quantidadeBloqueada?: boolean;
};

type Valores = {
  titulo: string;
  descricao: string;
  premio_rotulo: RotuloPremio;
  premio_descricao: string;
  premio_valor: string;
  numero_valor: string;
  quantidade: string;
  qtd_minima: string;
  data_prevista: string;
};

const ROTULO_OPCOES: readonly { valor: RotuloPremio; texto: string }[] = [
  { valor: "estimado", texto: "Valor estimado" },
  { valor: "mais_de", texto: "Mais de" },
  { valor: "ate", texto: "Até" },
];

/** Contador de caracteres (§3.3): sempre visível, layout estável. */
function Contador({ atual, limite }: { atual: number; limite: number }) {
  return (
    <span aria-hidden="true" className="block text-right text-xs text-tinta-suave">
      {atual}/{limite}
    </span>
  );
}

/** Chip do rótulo do prêmio: radio nativo escondido + rótulo tocável ≥ 44px. */
function OpcaoRotulo({
  valor,
  texto,
  selecionado,
  aoEscolher,
}: {
  valor: RotuloPremio;
  texto: string;
  selecionado: boolean;
  aoEscolher: () => void;
}) {
  return (
    <label
      className={[
        "inline-flex min-h-[44px] cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca",
        selecionado
          ? "border-marca bg-marca text-white"
          : "border-linha bg-white text-tinta-suave hover:border-marca/40 hover:text-tinta",
      ].join(" ")}
    >
      <input
        type="radio"
        name="premio_rotulo"
        value={valor}
        checked={selecionado}
        onChange={aoEscolher}
        className="sr-only"
      />
      {texto}
    </label>
  );
}

export function FormularioRifa({ rifa, quantidadeBloqueada = false }: Props) {
  const modoEdicao = rifa !== undefined;
  const router = useRouter();

  const [estado, disparar, enviando] = useActionState<EstadoRifa | undefined, FormData>(
    modoEdicao ? salvarEdicaoRifa : criarRifa,
    undefined,
  );

  const [valores, setValores] = useState<Valores>(() => ({
    titulo: rifa?.titulo ?? "",
    descricao: rifa?.descricao ?? "",
    premio_rotulo: rifa?.premio_rotulo ?? "estimado",
    premio_descricao: rifa?.premio_descricao ?? "",
    premio_valor: rifa?.premio_valor ?? "",
    numero_valor: rifa?.numero_valor ?? "",
    quantidade: String(rifa?.quantidade ?? 100),
    qtd_minima: String(rifa?.qtd_minima ?? 0),
    data_prevista: rifa?.data_prevista ?? "",
  }));
  const [tocados, setTocados] = useState<ReadonlySet<string>>(new Set());

  const setCampo = (campo: keyof Valores, valor: string) =>
    setValores((anteriores) => ({ ...anteriores, [campo]: valor }));

  const marcarTocado = (campos: readonly string[]) =>
    setTocados((anteriores) => {
      const novos = new Set(anteriores);
      for (const campo of campos) novos.add(campo);
      return novos;
    });

  // Validação em tempo real (derivada durante a renderização — sem effect):
  // o payload espelha o que a Server Action lerá do FormData, com os campos
  // vazios virando `undefined` para o contrato devolver a mensagem certa.
  const valorNumerico = (texto: string): number | undefined => {
    if (texto.trim() === "") return undefined;
    const valor = valorDeTextoMoeda(texto);
    return Number.isNaN(valor) ? undefined : valor;
  };
  const inteiroNumerico = (texto: string): number | undefined => {
    if (texto.trim() === "") return undefined;
    const valor = Number(texto);
    return Number.isNaN(valor) ? undefined : valor;
  };

  const parse = CriarRifaInputSchema.safeParse({
    titulo: valores.titulo.trim(),
    descricao: valores.descricao.trim(),
    premio_descricao: valores.premio_descricao.trim(),
    premio_rotulo: valores.premio_rotulo,
    premio_valor: valorNumerico(valores.premio_valor),
    numero_valor: valorNumerico(valores.numero_valor),
    quantidade: inteiroNumerico(valores.quantidade),
    qtd_minima: inteiroNumerico(valores.qtd_minima),
    ...(valores.data_prevista ? { data_prevista: valores.data_prevista } : {}),
  });

  const errosPorCampo = new Map<string, string>();
  if (!parse.success) {
    for (const problema of parse.error.issues) {
      const campo = problema.path[0];
      if (typeof campo === "string" && !errosPorCampo.has(campo)) {
        errosPorCampo.set(campo, problema.message);
      }
    }
  }
  const formularioValido = parse.success;

  const erroDe = (campo: string): string | undefined =>
    tocados.has(campo) ? errosPorCampo.get(campo) : undefined;

  // Prévia do prêmio (§3.4.1/§3.5): só com descrição e valor positivo válidos.
  const valorPremio = valorNumerico(valores.premio_valor);
  const frasePremio =
    valores.premio_descricao.trim() !== "" &&
    valorPremio !== undefined &&
    valorPremio > 0 &&
    Number.isFinite(valorPremio)
      ? formatarFrasePremio(valores.premio_rotulo, valores.premio_descricao.trim(), valorPremio)
      : null;

  // Pós-criação/pós-salvamento: redirect ao painel T3 (SPEC §4.1 "Saída de
  // sucesso") — o link público e o botão copiar vivem no cabeçalho da T3.
  useEffect(() => {
    if (estado?.ok) {
      router.push(`/rifas/${estado.rifaId}`);
    }
  }, [estado, router]);

  return (
    <form action={disparar} className="space-y-5" aria-busy={enviando}>
      {modoEdicao ? <input type="hidden" name="id" value={rifa.id} /> : null}

      <div className="space-y-1">
        <Input
          rotulo="Título da rifa"
          id="titulo"
          name="titulo"
          autoComplete="off"
          placeholder="Ex.: Rifa do forno elétrico"
          maxLength={60}
          value={valores.titulo}
          erro={erroDe("titulo")}
          onBlur={() => marcarTocado(["titulo"])}
          onChange={(evento) => setCampo("titulo", evento.target.value)}
        />
        <Contador atual={valores.titulo.length} limite={60} />
      </div>

      <div className="space-y-1">
        <Input
          rotulo="Descrição (opcional)"
          id="descricao"
          name="descricao"
          autoComplete="off"
          placeholder="Para que é a arrecadação, como entrar em contato…"
          maxLength={500}
          value={valores.descricao}
          erro={erroDe("descricao")}
          onBlur={() => marcarTocado(["descricao"])}
          onChange={(evento) => setCampo("descricao", evento.target.value)}
        />
        <Contador atual={valores.descricao.length} limite={500} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-tinta">Como mostrar o valor do prêmio</legend>
        <div className="flex flex-wrap gap-2">
          {ROTULO_OPCOES.map((opcao) => (
            <OpcaoRotulo
              key={opcao.valor}
              valor={opcao.valor}
              texto={opcao.texto}
              selecionado={valores.premio_rotulo === opcao.valor}
              aoEscolher={() => setCampo("premio_rotulo", opcao.valor)}
            />
          ))}
        </div>
      </fieldset>

      {frasePremio ? (
        <p className="rounded-lg bg-papel-escuro px-3 py-2.5 text-sm text-tinta">
          <span className="text-tinta-suave">Prévia pública: </span>
          <span className="font-medium">{frasePremio}</span>
        </p>
      ) : null}

      <Input
        rotulo="Descrição do prêmio"
        id="premio-descricao"
        name="premio_descricao"
        autoComplete="off"
        placeholder="Ex.: Forno elétrico"
        maxLength={120}
        value={valores.premio_descricao}
        erro={erroDe("premio_descricao")}
        onBlur={() => marcarTocado(["premio_descricao"])}
        onChange={(evento) => setCampo("premio_descricao", evento.target.value)}
      />

      <Input
        rotulo="Valor do prêmio (R$)"
        id="premio-valor"
        name="premio_valor"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        value={valores.premio_valor}
        erro={erroDe("premio_valor")}
        onBlur={() => marcarTocado(["premio_valor"])}
        onChange={(evento) => setCampo("premio_valor", mascaraMoedaDigitacao(evento.target.value))}
      />

      <Input
        rotulo="Valor do número (R$)"
        id="numero-valor"
        name="numero_valor"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        value={valores.numero_valor}
        erro={erroDe("numero_valor")}
        onBlur={() => marcarTocado(["numero_valor"])}
        onChange={(evento) => setCampo("numero_valor", mascaraMoedaDigitacao(evento.target.value))}
      />

      <div className="flex w-full flex-col gap-1.5">
        <label htmlFor="quantidade" className="text-sm font-medium text-tinta">
          Quantidade de números
        </label>
        <select
          id="quantidade"
          name="quantidade"
          value={valores.quantidade}
          disabled={quantidadeBloqueada}
          onChange={(evento) => {
            setCampo("quantidade", evento.target.value);
            // RN-05 amarra quantidade e mínima: mudar uma reconfere a outra.
            marcarTocado(["quantidade", "qtd_minima"]);
          }}
          className={[
            "min-h-[44px] w-full rounded-lg border bg-white px-3 text-base text-tinta",
            "focus:border-marca disabled:cursor-not-allowed disabled:bg-papel-escuro disabled:text-tinta-suave",
            "border-linha",
          ].join(" ")}
        >
          {TAMANHOS_RIFA.map((tamanho) => (
            <option key={tamanho} value={tamanho}>
              {formatarQuantidade(tamanho)}
            </option>
          ))}
        </select>
        {quantidadeBloqueada ? (
          <span className="text-xs text-tinta-suave">
            A quantidade não pode ser alterada porque a rifa já tem vendas registradas.
          </span>
        ) : null}
      </div>

      <Input
        rotulo="Mínimo de números vendidos"
        id="qtd-minima"
        name="qtd_minima"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        dica="O sorteio fica liberado ao atingir esse mínimo. Use 0 para não exigir mínimo."
        value={valores.qtd_minima}
        erro={erroDe("qtd_minima")}
        onBlur={() => marcarTocado(["qtd_minima"])}
        onChange={(evento) => {
          const digitos = evento.target.value.replace(/\D/g, "").slice(0, 4);
          setCampo("qtd_minima", digitos);
          marcarTocado(["qtd_minima", "quantidade"]);
        }}
      />

      <Input
        rotulo="Data prevista do sorteio (opcional)"
        id="data-prevista"
        name="data_prevista"
        type="date"
        value={valores.data_prevista}
        erro={erroDe("data_prevista")}
        onBlur={() => marcarTocado(["data_prevista"])}
        onChange={(evento) => setCampo("data_prevista", evento.target.value)}
      />

      <Button
        type="submit"
        tamanho="grande"
        className="w-full"
        disabled={!formularioValido || enviando}
      >
        {enviando
          ? modoEdicao
            ? "Salvando…"
            : "Criando…"
          : modoEdicao
            ? "Salvar alterações"
            : "Criar rifa"}
      </Button>

      {estado && !estado.ok ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {estado.mensagem}
        </p>
      ) : null}
    </form>
  );
}
