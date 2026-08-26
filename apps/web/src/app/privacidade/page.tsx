import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { controllerLine, LEGAL_CONTACT_EMAIL, SUBPROCESSORS } from "@/lib/legal";

export const metadata = {
  title: "Política de Privacidade — Girumo",
  description: "Como a Girumo trata dados pessoais, conforme a LGPD.",
};

export default function PrivacidadePage() {
  return (
    <LegalPage
      title="Política de Privacidade"
      summary="O que fazemos com dados pessoais, por quê, com quem compartilhamos e como você exerce seus direitos."
    >
      <LegalSection n={1} title="Quem é o controlador">
        <p>
          Para os dados da sua conta, o controlador é {controllerLine()}. Contato para assuntos de
          privacidade e para exercer direitos:{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-medium text-cobalt-700 underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection n={2} title="Dois papéis diferentes — e essa distinção importa">
        <p>
          <strong>Dados seus, como cliente:</strong> nome, e-mail, telefone, dados de cobrança e
          registros de uso. Aqui a Girumo é <strong>controladora</strong> — nós decidimos o que
          fazer com esses dados.
        </p>
        <p>
          <strong>Dados dos seus contatos:</strong> os números e nomes das pessoas dos seus grupos,
          os contatos captados pelas suas páginas e o conteúdo que você envia. Aqui a Girumo é{" "}
          <strong>operadora</strong> — tratamos esses dados seguindo as suas instruções, para
          entregar o serviço que você contratou.
        </p>
        <p>
          Em relação aos seus contatos, <strong>o controlador é você</strong>. É sua a
          responsabilidade de ter base legal para falar com eles, de responder aos pedidos deles e
          de informá-los sobre o tratamento.
        </p>
      </LegalSection>

      <LegalSection n={3} title="O que coletamos">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Cadastro:</strong> nome, e-mail e senha (armazenada com hash, nunca em texto).
          </li>
          <li>
            <strong>Login social:</strong> se você entra com Google, recebemos nome e e-mail da
            conta.
          </li>
          <li>
            <strong>Pagamento:</strong> a Stripe processa e guarda os dados do cartão. Nós não
            recebemos nem armazenamos número de cartão — guardamos apenas o identificador do
            cliente e o status da assinatura.
          </li>
          <li>
            <strong>Conexão do WhatsApp:</strong> identificador da sessão, número conectado, lista
            de grupos e status da conexão.
          </li>
          <li>
            <strong>Uso da plataforma:</strong> registros de ações, envios, erros, data e hora, e
            endereço IP.
          </li>
          <li>
            <strong>Tracking das suas páginas:</strong> cliques em links rastreados e origem da
            visita, para dizer de qual anúncio veio cada contato.
          </li>
        </ul>
        <p>
          Não pedimos nem queremos dados sensíveis (saúde, religião, biometria, opinião política).
          Não use a plataforma para tratá-los.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Por que tratamos, e com que base legal">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Executar o contrato</strong> (art. 7º, V): criar e manter sua conta, conectar
            seu WhatsApp, publicar suas campanhas, cobrar a assinatura.
          </li>
          <li>
            <strong>Cumprir obrigação legal</strong> (art. 7º, II): guardar registros fiscais e de
            acesso pelo prazo exigido em lei.
          </li>
          <li>
            <strong>Legítimo interesse</strong> (art. 7º, IX): segurança da plataforma, prevenção a
            fraude e abuso, e melhoria do produto a partir de dados de uso.
          </li>
          <li>
            <strong>Consentimento</strong> (art. 7º, I): comunicações de marketing, quando houver.
            Você pode retirar a qualquer momento sem perder o serviço.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={5} title="Com quem compartilhamos">
        <p>
          Não vendemos dados pessoais. Compartilhamos apenas com fornecedores que processam dados a
          nosso mando, sob contrato:
        </p>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-volt-950/15 text-left">
                <th className="py-2 pr-4 font-semibold">Fornecedor</th>
                <th className="py-2 pr-4 font-semibold">Para quê</th>
                <th className="py-2 font-semibold">Onde processa</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name} className="border-b border-volt-950/[0.07]">
                  <td className="py-2 pr-4 font-medium">{s.name}</td>
                  <td className="py-2 pr-4 text-volt-950/75">{s.role}</td>
                  <td className="py-2 text-volt-950/75">{s.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Também podemos compartilhar quando houver ordem judicial ou obrigação legal, e em caso de
          reorganização societária — situação em que o adquirente fica sujeito a esta política.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Transferência internacional">
        <p>
          Como a tabela acima mostra, parte do tratamento acontece fora do Brasil, principalmente
          nos Estados Unidos. Isso é permitido pelo art. 33 da LGPD mediante garantias contratuais,
          e é o que temos com esses fornecedores.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Por quanto tempo guardamos">
        <p>
          Enquanto sua conta existir. Depois do encerramento, apagamos ou anonimizamos em até 90
          dias, com duas exceções: registros de acesso, guardados por 6 meses (Marco Civil da
          Internet, art. 15), e documentos fiscais, pelo prazo da legislação tributária.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Seus direitos">
        <p>
          A LGPD (art. 18) garante a você: confirmação de que tratamos seus dados, acesso, correção,
          anonimização ou eliminação, portabilidade, informação sobre com quem compartilhamos,
          revogação de consentimento e revisão de decisões automatizadas.
        </p>
        <p>
          Para exercer, escreva para{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-medium text-cobalt-700 underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
          . Respondemos em até 15 dias. Se o pedido for sobre dados de um contato de um cliente
          nosso, encaminhamos ao cliente, que é o controlador daquele dado.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Segurança">
        <p>
          Usamos criptografia em trânsito, senhas com hash, isolamento por cliente no banco de
          dados, controle de acesso por perfil e registro de auditoria das ações sensíveis.
        </p>
        <p>
          Nenhum sistema é imune. Se ocorrer incidente de segurança com risco relevante aos
          titulares, comunicaremos os afetados e a ANPD, como manda o art. 48 da LGPD.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Cookies">
        <p>
          Usamos apenas o necessário para o serviço funcionar: manter você logado e lembrar
          preferências da sua conta. Não usamos cookies de publicidade de terceiros. Os links
          rastreados das suas páginas registram a origem do clique para atribuição, sem criar perfil
          publicitário.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Mudanças nesta política">
        <p>
          Podemos atualizar este documento. Mudanças relevantes serão avisadas por e-mail ou dentro
          do painel. A versão vigente é sempre a publicada nesta página, com a data no topo.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
