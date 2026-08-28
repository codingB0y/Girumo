import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { controllerSentence, LEGAL_CONTACT_EMAIL, LEGAL_ENTITY } from "@/lib/legal";

export const metadata = {
  title: "Termos de Uso — Girumo",
  description: "Condições de uso da plataforma Girumo.",
};

export default function TermosPage() {
  return (
    <LegalPage
      title="Termos de Uso"
      summary="As regras de uso da Girumo. Ao criar uma conta você concorda com o que está aqui — vale a pena ler antes."
    >
      <LegalSection n={1} title="Quem somos e o que este documento é">
        <p>
          {controllerSentence()} Este documento é o contrato entre nós e você, a pessoa ou empresa
          que usa a plataforma (&quot;você&quot;, &quot;cliente&quot;).
        </p>
        <p>
          Ao criar uma conta, você declara que leu e concorda com estes Termos e com a Política de
          Privacidade. Se não concordar, não use a plataforma.
        </p>
        <p className="text-sm text-volt-950/60">
          O CPF acima aparece parcialmente por segurança. O número completo é fornecido a quem
          solicitar por {LEGAL_CONTACT_EMAIL}, e consta da nota fiscal de cada cobrança.
        </p>
      </LegalSection>

      <LegalSection n={2} title="O que a Girumo faz">
        <p>
          A Girumo é uma ferramenta para quem vende por grupos de WhatsApp. Ela ajuda a captar
          pessoas para os seus grupos, publicar sua oferta em vários grupos de uma vez, agendar
          publicações e mostrar de qual grupo ou anúncio veio cada resultado.
        </p>
        <p>
          <strong>A Girumo não é o WhatsApp e não tem relação com a Meta.</strong> A plataforma se
          conecta ao seu número através de integrações que não são a API oficial do WhatsApp
          Business. Isso é parte do serviço e você precisa saber disso antes de contratar.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Risco de bloqueio do seu número">
        <p>
          O WhatsApp tem regras próprias e pode restringir, suspender ou banir números por conta
          própria, inclusive por volume de mensagens, denúncias de destinatários ou uso de
          ferramentas de automação.
        </p>
        <p>
          A Girumo aplica limites de cadência para reduzir esse risco, mas{" "}
          <strong>não pode garantir que seu número não será bloqueado</strong>, e não se
          responsabiliza por bloqueios, perda de acesso a grupos ou perda de contatos decorrentes de
          decisões do WhatsApp. Recomendamos usar um número dedicado ao negócio.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Sua conta">
        <p>
          Você é responsável por manter sua senha em segredo e por tudo que acontecer na sua conta.
          Avise imediatamente se suspeitar de acesso indevido.
        </p>
        <p>
          Você precisa ter pelo menos 18 anos e, se estiver contratando em nome de uma empresa,
          poderes para representá-la.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Como você pode e não pode usar">
        <p>Você concorda em não usar a Girumo para:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>enviar mensagens a quem não pediu para receber, nem a listas compradas ou raspadas;</li>
          <li>enviar conteúdo ilegal, enganoso, discriminatório ou que viole direitos de terceiros;</li>
          <li>vender produtos cuja comercialização seja proibida;</li>
          <li>burlar limites da plataforma, revender acesso ou compartilhar sua conta;</li>
          <li>tentar acessar dados de outros clientes ou comprometer a segurança do serviço.</li>
        </ul>
        <p>
          <strong>A base de contatos é sua responsabilidade.</strong> Você declara que as pessoas
          com quem se comunica pela plataforma consentiram em receber suas mensagens, ou que existe
          outra base legal para o contato. Podemos suspender contas que gerem denúncias recorrentes.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Planos, cobrança e renovação">
        <p>
          Os planos e preços vigentes ficam publicados no site e na área de configurações da sua
          conta. A assinatura pode ser <strong>mensal ou anual</strong>, conforme você escolher na
          contratação, e <strong>renova automaticamente</strong> pelo mesmo período até que você
          cancele.
        </p>
        <p>
          Antes de cada renovação do plano anual avisamos por e-mail com pelo menos 10 dias de
          antecedência, informando a data e o valor da cobrança.
        </p>
        <p>
          A cobrança é processada pela Stripe. Os meios de pagamento aceitos são os exibidos no
          checkout no momento da contratação. Em meios com confirmação assíncrona, como boleto, o
          plano é liberado quando o pagamento é confirmado pelo processador — não no momento da
          emissão.
        </p>
        <p>
          Se um pagamento falhar, podemos suspender o acesso aos recursos pagos até a regularização.
          Preços podem mudar, e avisaremos com pelo menos 30 dias de antecedência antes de aplicar
          um novo preço à sua assinatura.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Cancelamento">
        <p>
          Você pode cancelar quando quiser, pela própria área de configurações, sem multa e sem
          fidelidade. No plano mensal, o cancelamento vale para o fim do período já pago — você
          continua com acesso até lá.
        </p>
        <p>
          <strong>Arrependimento em 7 dias:</strong> por se tratar de contratação feita pela
          internet, você tem o direito do art. 49 do Código de Defesa do Consumidor — desistir em
          até 7 dias contados da contratação e receber de volta o que pagou, monetariamente
          atualizado. Basta pedir por {LEGAL_CONTACT_EMAIL}.
        </p>
        <p>
          <strong>Cancelamento do plano anual:</strong> se você cancelar um plano anual depois dos 7
          dias, devolvemos os meses que ainda não foram usados. O preço anual é um desconto
          concedido pelo compromisso de 12 meses, então os meses já usados são recalculados pelo
          preço mensal do mesmo plano e a diferença é devolvida — nunca cobramos nada além disso.
        </p>
        <p>
          Exemplo, no Growth: o anual custa R$ 197 por mês, R$ 2.364 pagos de uma vez. Cancelando
          depois de 3 meses de uso, esses 3 meses passam a valer o preço mensal (R$ 297 cada, R$
          891 no total) e devolvemos os R$ 1.473 restantes.
        </p>
        <p>
          Em qualquer um dos dois casos, a devolução é solicitada por {LEGAL_CONTACT_EMAIL} e o
          valor é devolvido em até 10 dias úteis, pelo mesmo meio usado no pagamento. Cancelar pela
          tela de configurações encerra a cobrança, mas não dispara a devolução sozinho.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Seus dados e seu conteúdo">
        <p>
          O conteúdo que você cria na plataforma e a sua base de contatos continuam sendo seus. Você
          nos concede apenas a licença necessária para operar o serviço — armazenar, processar e
          transmitir esse conteúdo para entregar o que você pediu.
        </p>
        <p>
          Ao encerrar a conta você pode solicitar a exportação dos seus dados. O tratamento de dados
          pessoais está descrito na Política de Privacidade.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Disponibilidade e suporte">
        <p>
          Trabalhamos para manter a plataforma no ar, mas o serviço é fornecido &quot;como
          está&quot;: podem ocorrer interrupções por manutenção, falha de terceiros dos quais
          dependemos ou fatores fora do nosso controle. Não prometemos um índice de disponibilidade
          contratual.
        </p>
        <p>Suporte pelos canais indicados no site e dentro do painel, em dias úteis.</p>
      </LegalSection>

      <LegalSection n={10} title="Limitação de responsabilidade">
        <p>
          Na máxima extensão permitida pela lei, nossa responsabilidade total por qualquer
          reivindicação relacionada ao serviço fica limitada ao valor que você pagou à Girumo nos 12
          meses anteriores ao fato.
        </p>
        <p>
          Não respondemos por lucros cessantes, perda de oportunidade de venda, bloqueio do seu
          número pelo WhatsApp ou por atos de terceiros. Nada aqui afasta responsabilidades que a
          lei não permita afastar, inclusive as do Código de Defesa do Consumidor.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Suspensão e encerramento">
        <p>
          Podemos suspender ou encerrar uma conta que descumpra estes Termos, que gere risco à
          plataforma ou a terceiros, ou que esteja inadimplente. Sempre que possível avisamos antes
          e damos chance de corrigir.
        </p>
        <p>Você pode encerrar sua conta a qualquer momento.</p>
      </LegalSection>

      <LegalSection n={12} title="Mudanças nestes Termos">
        <p>
          Podemos atualizar este documento. Mudanças relevantes serão avisadas por e-mail ou dentro
          do painel com pelo menos 30 dias de antecedência. A versão vigente é sempre a publicada
          nesta página, com a data indicada no topo.
        </p>
      </LegalSection>

      <LegalSection n={13} title="Lei aplicável e foro">
        <p>
          Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro de{" "}
          {LEGAL_ENTITY.jurisdiction} para dirimir controvérsias, ressalvado o direito do consumidor
          de escolher o foro do seu domicílio.
        </p>
        <p>
          Dúvidas sobre este documento:{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-medium text-cobalt-700 underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
