import { useState } from 'react';
import { PlayCircle, FileText, Settings, ShoppingCart, Users, Package, DollarSign, LayoutDashboard, ChevronRight } from 'lucide-react';

export default function Tutorial() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Visão Geral', icon: <LayoutDashboard size={16} /> },
    { id: 'vendas', label: 'Vendas', icon: <ShoppingCart size={16} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <DollarSign size={16} /> },
    { id: 'conciliacao', label: 'Conciliação', icon: <FileText size={16} /> },
    { id: 'estoque', label: 'Estoque', icon: <Package size={16} /> },
    { id: 'clientes', label: 'Clientes', icon: <Users size={16} /> },
    { id: 'config', label: 'Configurações', icon: <Settings size={16} /> },
  ];

  const content = {
    dashboard: {
      title: "Bem-vindo ao ERP Una Aura",
      description: "O Dashboard é a central de comando do seu sistema. Aqui você tem uma visão rápida e completa sobre as vendas, finanças e estoque.",
      steps: [
        "Visualize o faturamento do mês atual e compare com os meses anteriores.",
        "Acompanhe as dívidas (Contas a Receber) que estão em atraso e o que tem a pagar.",
        "Fique de olho no alerta de estoque baixo para repor as mercadorias antes que acabem.",
        "Acesse rapidamente os módulos através do menu lateral."
      ],
      videoId: "" // Placeholder para o YouTube
    },
    vendas: {
      title: "Como Registrar Vendas e Múltiplos Pagamentos",
      description: "A tela de Vendas permite criar pedidos completos, abatendo o estoque e gerando os recebimentos financeiros automaticamente.",
      steps: [
        "Clique em 'Nova Venda' e selecione o Cliente e o Vendedor.",
        "Adicione os produtos que estão sendo vendidos. O estoque disponível aparecerá ao lado do nome.",
        "Na seção 'Pagamentos', adicione como o cliente está pagando. Você pode misturar formas! Ex: R$ 50 no PIX e o restante em 2x no Cartão.",
        "Confira se o valor total dos pagamentos bate exatamente com o valor total dos produtos.",
        "Clique em 'Finalizar Venda'. Se quiser, confirme a impressão do Recibo na tela seguinte."
      ],
      videoId: ""
    },
    financeiro: {
      title: "Gestão do Financeiro (Pagar e Receber)",
      description: "Controle todo o dinheiro que entra e sai da empresa de forma organizada.",
      steps: [
        "Aba Contas a Receber: Veja o que seus clientes estão devendo. Para registrar o pagamento, clique em 'Receber', escolha a conta bancária de destino e a data.",
        "Aba Contas a Pagar: Registre suas despesas (luz, água, fornecedores). Marque-as como pagas quando o dinheiro sair da conta.",
        "Aba Contas Bancárias: Cadastre os caixas e bancos que você usa (Ex: Caixa Físico, Conta Itaú, Conta Nubank).",
        "Aba Extrato: Acompanhe todas as movimentações reais que aconteceram nas suas contas bancárias."
      ],
      videoId: ""
    },
    conciliacao: {
      title: "Conciliação Bancária (OFX)",
      description: "Módulo avançado para conferir se o que está no seu banco bate exatamente com o que você registrou no sistema.",
      steps: [
        "Baixe o arquivo de extrato em formato OFX no site do seu banco.",
        "Na tela de Conciliação, selecione a conta no sistema e envie o arquivo OFX.",
        "O sistema mostrará as transações do banco de um lado e as do sistema do outro. Clique para parear (ligar) as duas.",
        "Se o sistema encontrar valores iguais em datas próximas, ele sugerirá o pareamento automático.",
        "Se uma taxa bancária estiver no OFX mas não no sistema, use o botão 'Lançamento Avulso' para registrar essa despesa na hora."
      ],
      videoId: ""
    },
    estoque: {
      title: "Controle de Estoque e Compras",
      description: "Aprenda a cadastrar produtos, registrar fornecedores e fazer novas compras para repor o estoque.",
      steps: [
        "Vá em Produtos para cadastrar as joias. Defina o Custo e o Preço de Venda. O sistema calculará o seu Lucro (Markup).",
        "Ao cadastrar um Fornecedor, você pode criar uma Nova Compra.",
        "Ao fazer uma compra, os itens entram automaticamente no estoque assim que você salvar.",
        "E mais: a compra gerará contas a pagar no módulo Financeiro, garantindo que nada passe despercebido."
      ],
      videoId: ""
    },
    clientes: {
      title: "Cadastro e Ficha do Cliente",
      description: "Gerencie quem compra com você e visualize rapidamente as dívidas e histórico de cada um.",
      steps: [
        "Clique em 'Novo Cliente' para registrar dados, CPF/CNPJ, e-mail e telefone.",
        "Para ver o histórico de alguém, clique no botão azul 'Ficha Completa' ao lado do nome do cliente.",
        "Na Ficha do Cliente, você verá todas as compras que ele já fez.",
        "E o mais importante: se ele tiver Títulos a Receber (fiado/crediário), você pode baixar (dar como recebido) diretamente por ali, sem precisar ir na aba de Financeiro!"
      ],
      videoId: ""
    },
    config: {
      title: "Configurações e Personalização",
      description: "Ajuste os dados da sua empresa para que os documentos saiam com a sua cara.",
      steps: [
        "Vá em Configurações > Empresa.",
        "Preencha Razão Social, CNPJ, e Endereço. Esses dados aparecerão nos recibos de venda.",
        "Adicione o link da Logo da sua empresa. A logo aparecerá tanto na tela de login quanto impressa nos recibos de venda em PDF."
      ],
      videoId: ""
    }
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: 'var(--space-8)' }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">Central de Tutoriais</h2>
          <p className="page-subtitle">Aprenda a utilizar todos os recursos do seu ERP</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 'var(--space-6)', alignItems: 'start' }}>
        
        {/* Sidebar Tabs */}
        <div className="glass-card" style={{ padding: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 'var(--space-2)', paddingLeft: 'var(--space-2)' }}>Módulos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                  borderRadius: 'var(--radius-md)', border: 'none', background: activeTab === t.id ? 'var(--color-primary-light)' : 'transparent',
                  color: activeTab === t.id ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
                  fontWeight: activeTab === t.id ? 600 : 500, cursor: 'pointer', transition: 'all 0.2s ease',
                  textAlign: 'left'
                }}
              >
                <span style={{ color: activeTab === t.id ? 'var(--color-primary)' : 'inherit' }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="glass-card" style={{ padding: 'var(--space-6)', minHeight: 400 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 'var(--space-2)' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {tabs.find(t => t.id === activeTab)?.icon}
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', margin: 0 }}>
              {content[activeTab].title}
            </h3>
          </div>
          
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-6)', lineHeight: 1.5 }}>
            {content[activeTab].description}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
            {/* Steps */}
            <div>
              <h4 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} className="text-primary" /> Passo a Passo
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {content[activeTab].steps.map((step, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, flexShrink: 0, marginTop: 2 }}>
                      {idx + 1}
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
                      {step}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Video Placeholder */}
            <div>
              <h4 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PlayCircle size={18} className="text-primary" /> Vídeo Aula
              </h4>
              <div style={{ width: '100%', aspectRatio: '16/9', background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--color-glass-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)', textAlign: 'center' }}>
                {content[activeTab].videoId ? (
                  <iframe 
                    width="100%" height="100%" 
                    src={`https://www.youtube.com/embed/${content[activeTab].videoId}`} 
                    title="YouTube video player" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen 
                    style={{ borderRadius: 'var(--radius-md)' }}
                  />
                ) : (
                  <>
                    <PlayCircle size={48} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)', opacity: 0.5 }} />
                    <div style={{ fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Vídeo em breve</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      Você poderá inserir o link do YouTube futuramente editando o arquivo <code style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 4px', borderRadius: 4 }}>Tutorial.jsx</code>.
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
