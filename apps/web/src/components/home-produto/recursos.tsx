import type { ReactNode } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { IMG, MODELOS } from "@/components/home-shared/home-data";
import { FOCO_ESCURO } from "@/components/home-shared/estilo";
import { Celular, Navegador } from "@/components/home-shared/frames";
import { CINZA, MIOLO } from "@/components/home-produto/ui";
import { cn } from "@/lib/utils";

/* Os módulos do menu do painel (lib/painel-nav.ts), por extenso onde o nome do menu é curto. */
const MODULOS = [
  "Campanhas",
  "Páginas com a sua marca",
  "Postar nos grupos",
  "Biblioteca de textos",
  "Funis de lançamento",
  "Oferta relâmpago",
  "Comunidades",
  "Grupos",
  "Contatos",
  "Vendas",
  "Resultados",
  "Anúncios",
  "Equipe",
  "Instagram",
  "Domínio próprio",
  "Segundo número",
] as const;

const NUMEROS = [
  { valor: "1 link", texto: "pra todos os grupos da campanha" },
  // O aviso sai do cron de hora em hora (8h às 20h): "mais de 2h", não "em 2 horas".
  { valor: "Mais de 2h", texto: "desconectado e chega o aviso por e-mail" },
  { valor: "7 dias", texto: "grátis, com tudo liberado pra testar" },
] as const;

/** Faixa cobalto com tudo o que o painel tem (ref. Conta Azul) e três números embaixo. */
export function ProdutoTudo() {
  return (
    <section aria-labelledby="tudo-titulo" className="pb-[60px] lg:pb-[100px]">
      <div className={MIOLO}>
        <div className="rounded-[22px] bg-cobalt-500 px-5 pb-9 pt-[34px] text-center text-white lg:rounded-[28px] lg:px-16 lg:pb-[58px] lg:pt-[54px]">
          <h2 id="tudo-titulo" className="font-brand text-[27px] font-normal tracking-[-.02em] lg:text-[38px]">
            Do link à venda, <b className="font-extrabold">tudo num painel só</b>
          </h2>
          <ul className="mx-auto mt-[30px] flex max-w-[1000px] flex-wrap justify-center gap-2 lg:gap-2.5">
            {MODULOS.map((modulo) => (
              <li
                key={modulo}
                className="flex h-[34px] items-center rounded-full border-[1.5px] border-white/70 px-3 text-[13px] font-semibold lg:h-[38px] lg:px-4 lg:text-sm"
              >
                {modulo}
              </li>
            ))}
          </ul>
        </div>
        <ul className="border-b border-[#E2E7EA] lg:mx-10 lg:grid lg:grid-cols-3">
          {NUMEROS.map((numero) => (
            <li
              key={numero.valor}
              className="border-b border-[#E2E7EA] px-1 py-[18px] last:border-b-0 lg:border-b-0 lg:border-r lg:px-7 lg:pb-7 lg:pt-[26px] lg:last:border-r-0"
            >
              <b className="block font-brand text-[26px] font-bold text-cobalt-500">{numero.valor}</b>
              <span className="mt-1.5 block text-[15px] leading-normal text-slate-600">{numero.texto}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const CARTAO_GRANDE = "relative mt-6 grid overflow-hidden rounded-3xl text-white lg:mt-9 lg:h-[400px] lg:grid-cols-2";
const CARTAO_PEQUENO = "relative h-[340px] overflow-hidden rounded-3xl bg-white lg:h-[330px]";
const TITULO_GRUPO = "text-center font-brand text-[22px] font-medium tracking-[-.015em] text-[#25363E] lg:text-[26px]";

function TextoGrande({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col justify-center px-6 pt-[30px] lg:px-14 lg:pt-0">
      <h3 className="max-w-[13em] font-brand text-2xl font-semibold leading-[1.2] tracking-[-.02em] lg:text-[30px]">{titulo}</h3>
      <p className="mt-3.5 max-w-[30em] text-[15.5px] leading-relaxed text-white/75">{texto}</p>
      <a
        href="#planos"
        className={cn("mt-[22px] inline-flex items-center gap-2 self-start rounded-sm text-[15px] font-bold text-acid-500", FOCO_ESCURO)}
      >
        Ver os planos
        <ArrowRight aria-hidden className="size-[17px]" />
      </a>
    </div>
  );
}

function TituloPequeno({ children }: { children: ReactNode }) {
  return (
    <h3 className="relative z-[2] max-w-[330px] px-[22px] pt-6 font-brand text-[19px] font-semibold leading-[1.25] tracking-[-.012em] lg:px-[34px] lg:pt-[30px] lg:text-[21px]">
      {children}
    </h3>
  );
}

function CartaoPequeno({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <article className={CARTAO_PEQUENO}>
      <TituloPequeno>{titulo}</TituloPequeno>
      {children}
    </article>
  );
}

const DUPLA = "mt-3.5 grid gap-3.5 lg:mt-[18px] lg:grid-cols-2 lg:gap-[18px]";
const CELULAR_PEQUENO = "absolute right-[30px] top-[122px] w-[150px] rotate-[4deg] lg:right-11 lg:top-11 lg:w-[180px]";

/** Tela dos grupos com a chave "Grupo lotou, abre outro" por cima. */
function VisualLotou() {
  return (
    <div className="relative h-[340px] lg:h-auto">
      <Celular
        img={IMG.gruposCelular}
        alt="Grupos da campanha: lotado, enchendo agora e na fila"
        sizes="(min-width: 1024px) 230px, 176px"
        className="absolute left-[22px] top-[30px] w-[176px] -rotate-[4deg] lg:left-16 lg:top-[50px] lg:w-[230px]"
      />
      <figure className="absolute right-3.5 top-[210px] z-[2] w-[250px] overflow-hidden rounded-[14px] shadow-[0_24px_50px_-20px_rgba(0,0,0,.6)] lg:left-[250px] lg:right-auto lg:top-[236px] lg:w-[400px]">
        <Image
          src={IMG.chavesRecorte.src}
          alt="Campanha com a chave Grupo lotou, abre outro: ligada"
          width={IMG.chavesRecorte.width}
          height={IMG.chavesRecorte.height}
          sizes="(min-width: 1024px) 400px, 250px"
          className="block h-auto w-full"
        />
      </figure>
    </div>
  );
}

/** Dois modelos de página inclinados, um sobre o outro. */
function ModelosInclinados() {
  return (
    <>
      {[MODELOS[0], MODELOS[1]].map((modelo, i) => (
        <Image
          key={modelo.src}
          src={modelo.src}
          alt={`Modelo de página ${modelo.nome}`}
          width={780}
          height={1280}
          sizes="(min-width: 1024px) 300px, 220px"
          className={cn(
            "absolute w-[220px] rounded-xl shadow-[0_20px_40px_-20px_rgba(7,25,35,.45)] lg:w-[300px]",
            i === 0
              ? "right-[116px] top-[150px] -rotate-[4deg] lg:right-32 lg:top-[118px]"
              : "right-4 top-[182px] rotate-[5deg] lg:right-[26px] lg:top-[150px]",
          )}
        />
      ))}
    </>
  );
}

/** A fila da relâmpago desenhada. Ilustração: o título do cartão já diz o que ela mostra. */
function FilaEuQuero() {
  return (
    <ol aria-hidden className="absolute inset-x-[22px] top-[122px] grid gap-2.5 lg:left-auto lg:right-10 lg:top-24 lg:w-[270px]">
      {["1º", "2º", "3º", "4º"].map((posicao, i) => (
        <li key={posicao} className={cn("flex items-center gap-3 rounded-[14px] bg-[#F2F4F6] px-3.5 py-2.5", i === 3 && "opacity-50")}>
          <b className="grid size-9 place-items-center rounded-full bg-acid-500 font-brand text-[13px] font-extrabold">{posicao}</b>
          <span className="text-[15px] font-bold">EU QUERO</span>
        </li>
      ))}
    </ol>
  );
}

function GradeDiaADia() {
  return (
    <>
      <h2 id="grade-titulo" className={TITULO_GRUPO}>
        Pra quem vende em grupo todo dia
      </h2>
      <article className={cn(CARTAO_GRANDE, "bg-volt-950")}>
        <TextoGrande
          titulo="Grupo lotou? O próximo já nasceu."
          texto="Quando um grupo enche, a Girumo abre o próximo com o nome em sequência e o link passa a apontar pra ele. Do Growth pra cima."
        />
        <VisualLotou />
      </article>
      <div className={DUPLA}>
        <CartaoPequeno titulo="Escreve uma vez e posta em todos os grupos">
          <Celular img={IMG.disparosCelular} alt="Tela de Disparos com a prévia da oferta" sizes="(min-width: 1024px) 180px, 150px" className={CELULAR_PEQUENO} />
        </CartaoPequeno>
        <CartaoPequeno titulo="Página de captação com a sua marca">
          <ModelosInclinados />
        </CartaoPequeno>
      </div>
    </>
  );
}

function GradeVendas() {
  return (
    <>
      <h2 className={cn(TITULO_GRUPO, "mt-14 lg:mt-[88px]")}>Pra quem quer saber o que vende</h2>
      <article className={cn(CARTAO_GRANDE, "bg-[#0B0F12]")}>
        <TextoGrande
          titulo="Cada venda com a origem: anúncio, story ou grupo"
          texto="Anote a venda pelo telefone da cliente. O painel mostra o funil de cada anúncio até a compra e quanto custou cada venda. Do Growth pra cima."
        />
        <div className="relative h-[340px] lg:h-auto">
          <Navegador
            img={IMG.analiseDesktop}
            alt="Análise da campanha: entradas e saídas por hora, cliques no link e grupos"
            endereco="app.girumo.com.br/painel/campanhas"
            sizes="(min-width: 1024px) 660px, 540px"
            className="absolute left-[18px] top-7 w-[540px] lg:left-6 lg:top-14 lg:w-[660px]"
          />
        </div>
      </article>
      <div className={DUPLA}>
        <CartaoPequeno titulo="Oferta relâmpago: quem comenta EU QUERO primeiro leva">
          <FilaEuQuero />
        </CartaoPequeno>
        <CartaoPequeno titulo="Quem entrou e quem saiu, hora a hora">
          <Celular img={IMG.entradasCelular} alt="Entradas e saídas de hoje, por hora" sizes="(min-width: 1024px) 180px, 150px" className={CELULAR_PEQUENO} />
        </CartaoPequeno>
      </div>
    </>
  );
}

/** Grade de cartões por perfil de loja (ref. InfinitePay), com as telas do painel. */
export function ProdutoGrade() {
  return (
    <section id="pra-quem" aria-labelledby="grade-titulo" className={cn(CINZA, "scroll-mt-4 py-[60px] lg:py-24")}>
      <div className={MIOLO}>
        <GradeDiaADia />
        <GradeVendas />
      </div>
    </section>
  );
}
