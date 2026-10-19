import type { Metadata } from "next";
import Link from "next/link";

import { BRAND } from "@/lib/brand";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";

/**
 * Manual do app da Girumo no Bling (homologação: "Link do manual" e "Link da homepage" do cadastro do app). Segue o
 * modelo de manual da doc do Bling (developer.bling.com.br/aplicativos, "Modelo de manual"): passos no Bling,
 * requisitos, o que fazer depois de autorizar e contato. Pública e sem JavaScript: o revisor do Bling abre sem conta.
 */

export const metadata: Metadata = {
  title: "Integração com o Bling",
  description:
    "Como conectar o Bling à Girumo: as vendas do Bling entram na Girumo em segundos, ligadas ao grupo ou ao anúncio que trouxe a cliente, e vão ao Meta Ads.",
};

const LINK = "font-medium text-cobalt-700 underline";

function Secao({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-6 space-y-3">
      <h2 id={`${id}-titulo`} className="font-display text-xl font-extrabold tracking-[-0.02em]">
        {titulo}
      </h2>
      <div className="space-y-3 text-[16px] leading-relaxed text-volt-950/85">{children}</div>
    </section>
  );
}

export default function ManualBlingPage() {
  return (
    <main className="min-h-screen bg-canvas-100 text-volt-950">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <Link
          href="/"
          className="font-data text-xs uppercase tracking-[0.16em] text-volt-950/50 transition-colors hover:text-volt-950"
        >
          ← {BRAND.name}
        </Link>

        <h1 className="font-display mt-6 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
          Integração Girumo + Bling
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed text-volt-950/70">
          A Girumo organiza grupos VIP de WhatsApp para lojas de atacado e varejo. Com o Bling conectado, cada venda do
          Bling entra na Girumo em segundos, ligada ao grupo ou ao anúncio que trouxe a cliente, e vai para o Meta Ads
          — para você saber o que vendeu de verdade e anunciar para quem compra.
        </p>

        <nav aria-label="Nesta página" className="mt-8 rounded-xl border border-volt-950/10 bg-paper-0 p-5">
          <p className="font-data text-xs uppercase tracking-[0.14em] text-volt-950/50">Nesta página</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-[15px]">
            <li><a href="#o-que-faz" className={LINK}>O que a integração faz</a></li>
            <li><a href="#requisitos" className={LINK}>Requisitos</a></li>
            <li><a href="#manual" className={LINK}>Como conectar</a></li>
            <li><a href="#ajustes" className={LINK}>Depois de conectar: ajustes</a></li>
            <li><a href="#listas" className={LINK}>Listas e públicos do Meta</a></li>
            <li><a href="#desconectar" className={LINK}>Como desconectar</a></li>
            <li><a href="#dados" className={LINK}>Seus dados</a></li>
            <li><a href="#contato" className={LINK}>Suporte</a></li>
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          <Secao id="o-que-faz" titulo="O que a integração faz">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Vendas em segundos:</strong> o Bling avisa a Girumo a cada pedido criado ou alterado, e a venda
                aparece em Vendas. Uma conferência a cada 5 minutos pega o que o aviso perder.
              </li>
              <li>
                <strong>De onde veio a venda:</strong> pelo telefone da cliente, a Girumo liga a venda ao anúncio (quando
                ela chegou por um anúncio com UTM) ou ao grupo de WhatsApp em que ela entrou.
              </li>
              <li>
                <strong>Meta Ads:</strong> cada pedido vai ao Meta como início de compra (InitiateCheckout) e cada venda
                como compra (Purchase), pela API de Conversões, com os dados da cliente criptografados.
              </li>
              <li>
                <strong>Listas de clientes:</strong> Alto valor, Compradores e Leads qualificados, atualizadas a cada
                pedido.
              </li>
              <li>
                <strong>Só leitura:</strong> a Girumo lê pedidos, contatos, situações e canais de venda. Ela não cria,
                não altera e não apaga nada no seu Bling.
              </li>
            </ul>
          </Secao>

          <Secao id="requisitos" titulo="Requisitos">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Uma conta na Girumo.{" "}
                <a href="https://app.girumo.com.br/signup" className={LINK}>
                  Crie a sua aqui
                </a>{" "}
                — leva um minuto.
              </li>
              <li>Ser dono ou administrador da loja na Girumo (só eles veem o botão de conectar).</li>
              <li>Uma conta no Bling com os pedidos de venda em uso.</li>
              <li>
                Para enviar as vendas ao Meta: uma campanha da Girumo com o Pixel e o token da API de Conversões do Meta
                (na campanha, Editar › Integrações). Sem isso a integração funciona, só não envia ao Meta.
              </li>
            </ul>
          </Secao>

          <Secao id="manual" titulo="Como conectar">
            <p>
              A conexão começa na Girumo. Se você encontrou o app na Central de Extensões do Bling, entre na Girumo e
              siga os passos abaixo.
            </p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                Entre na Girumo em{" "}
                <a href="https://app.girumo.com.br/login" className={LINK}>
                  app.girumo.com.br
                </a>
                .
              </li>
              <li>Abra Configurações › Integrações e, no cartão do Bling, clique em <strong>Conectar Bling</strong>.</li>
              <li>Na tela do Bling que abrir, entre com a sua conta (se pedir) e clique em <strong>Autorizar</strong>.</li>
              <li>
                Pronto: você volta para a Girumo com a mensagem de conectado. As vendas novas já entram, e as dos
                últimos 90 dias chegam nos minutos seguintes.
              </li>
            </ol>
            <p>
              Se a tela do Bling demorar mais de 10 minutos ou for aberta em outro navegador, a Girumo pede para clicar
              em Conectar Bling de novo. Cada conta do Bling fica ligada a uma loja da Girumo por vez.
            </p>
          </Secao>

          <Secao id="ajustes" titulo="Depois de conectar: ajustes">
            <p>No cartão do Bling, clique em <strong>Ajustar</strong>:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>O que conta como venda:</strong> as situações do seu Bling que valem como venda. Atendido (e as
                situações que herdam dele) já vem marcado. Cancelado e Em digitação nunca contam.
              </li>
              <li>
                <strong>Valor alto:</strong> a partir de quanto uma compra coloca a cliente na lista Alto valor. Vazio
                desliga a lista.
              </li>
              <li>
                <strong>Enviar ao Meta:</strong> liga ou desliga o envio e escolhe o Pixel (o da campanha escolhida).
              </li>
              <li>
                <strong>Canais que já mandam a venda ao Meta:</strong> se a sua loja virtual (Yampi, Nuvemshop, Shopify…)
                já envia a compra ao Meta pelo pixel dela, marque o canal. A venda dele continua na Girumo, em Vendas e
                nas listas, mas o evento não sai daqui — assim o Meta não conta a mesma compra duas vezes.
              </li>
            </ul>
            <p>
              O cartão mostra também se as vendas estão chegando em tempo real, a última venda recebida e os números
              dos últimos 30 dias (vendas, valor, origem e o que foi ao Meta).
            </p>
          </Secao>

          <Secao id="listas" titulo="Listas e públicos do Meta">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong>Alto valor:</strong> clientes com pelo menos uma compra a partir do valor alto.</li>
              <li><strong>Compradores:</strong> clientes que já compraram.</li>
              <li><strong>Leads qualificados:</strong> fizeram pedido e não pagaram (em aberto ou cancelado).</li>
            </ul>
            <p>
              Cada pessoa fica em uma lista só. Crie os públicos uma vez no Gerenciador de Anúncios do Meta, em
              Públicos (o cartão mostra a regra de cada um); depois eles se atualizam sozinhos com cada venda. Para as vendas de antes de
              conectar, baixe o CSV de cada lista no cartão e suba no Meta.
            </p>
          </Secao>

          <Secao id="desconectar" titulo="Como desconectar">
            <p>
              Na Girumo: Configurações › Integrações › Bling › Ajustar › <strong>Desconectar Bling</strong>. A Girumo
              para de receber as vendas e apaga o acesso; as vendas já importadas ficam.
            </p>
            <p>
              No Bling: Central de Extensões › Minhas instalações › menu do app da Girumo › Desinstalar. A Girumo mostra
              no cartão que o acesso foi removido.
            </p>
          </Secao>

          <Secao id="dados" titulo="Seus dados">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                O acesso ao Bling fica guardado criptografado e só é usado para ler os pedidos da sua loja.
              </li>
              <li>
                Telefone, e-mail, nome, nascimento e endereço da cliente vão ao Meta criptografados (SHA-256): o Meta
                compara com as contas dele, não lê. E-mail, nascimento e endereço não ficam guardados em texto na
                Girumo.
              </li>
              <li>
                Quem pediu para sair das suas listas (descadastro) não vai ao Meta. Detalhes na{" "}
                <Link href="/privacidade" className={LINK}>
                  Política de Privacidade
                </Link>
                .
              </li>
            </ul>
          </Secao>

          <Secao id="contato" titulo="Suporte">
            <p>
              Dúvidas ou problemas com a integração:{" "}
              <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={LINK}>
                {LEGAL_CONTACT_EMAIL}
              </a>
              . Diga o nome da sua loja na Girumo e o que aparece no cartão do Bling.
            </p>
          </Secao>
        </div>
      </div>
    </main>
  );
}
