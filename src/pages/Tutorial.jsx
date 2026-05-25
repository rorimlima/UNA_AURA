import { useState } from 'react';
import { FileText, Settings, ShoppingCart, Users, Package, DollarSign, LayoutDashboard, RotateCcw, Image as ImageIcon } from 'lucide-react';

export default function Tutorial() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Visão Geral', icon: <LayoutDashboard size={16} /> },
    { id: 'vendas', label: 'Vendas', icon: <ShoppingCart size={16} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <DollarSign size={16} /> },
    { id: 'conciliacao', label: 'Conciliação', icon: <FileText size={16} /> },
    { id: 'devolucoes', label: 'Devoluções', icon: <RotateCcw size={16} /> },
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
      image: "/dashboard_ui.png"
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
      image: ""
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
      image: ""
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
      image: ""
    },
    devolucoes: {
      title: "Como Gerenciar Devoluções e Créditos",
      description: "O módulo de Devoluções permite devolver joias danificadas ou acordadas ao fornecedor, gerando créditos de abatimento de forma automática.",
      steps: [
        "Vá em Devoluções e clique em '+ Nova Devolução'.",
        "Selecione o fornecedor e escolha a Compra de Origem (opcional, para puxar os produtos comprados anteriormente).",
        "Insira as quantidades e valores dos itens devolvidos. O campo 'Gerar crédito ao finalizar' deve estar marcado se quiser o crédito.",
        "Salve a devolução como Rascunho. Quando estiver tudo verificado, clique em 'Finalizar' (check ✔) na listagem.",
        "O sistema reduzirá a quantidade do estoque físico das joias e gerará um Crédito Ativo para o fornecedor.",
        "Caso precise desfazer a devolução, basta clicar em 'Cancelar' (ícone X). O sistema anulará o crédito e devolverá as joias ao estoque físico."
      ],
      image: "/devolucao_credito_ui.png"
    },
    estoque: {
      title: "Controle de Estoque e Compras",
      description: "Gerencie seu estoque físico e faça compras de reposição com fornecedores, aproveitando créditos de devoluções.",
      steps: [
        "Vá em Produtos para cadastrar as joias. Defina o Custo, a Referência e o Preço de Venda. O sistema calculará o seu Lucro (Markup).",
        "Ao cadastrar um Fornecedor, você poderá criar uma Nova Compra.",
        "Na Nova Compra, o estoque físico é incrementado de forma imediata quando você salva a transação.",
        "Abatimento de Créditos: Se o fornecedor possuir saldo de devolução anterior, marque 'Usar Crédito' para deduzir o valor total.",
        "O saldo restante (se houver) será gerado como Contas a Pagar de forma automática na aba do Financeiro."
      ],
      image: "/compra_credito_ui.png"
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
      image: ""
    },
    config: {
      title: "Configurações e Personalização",
      description: "Ajuste os dados da sua empresa para que os documentos saiam com a sua cara.",
      steps: [
        "Vá em Configurações > Empresa.",
        "Preencha Razão Social, CNPJ, e Endereço. Esses dados aparecerão nos recibos de venda.",
        "Adicione o link da Logo da sua empresa. A logo aparecerá tanto na tela de login quanto impressa nos recibos de venda em PDF."
      ],
      image: ""
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

            {/* Premium Image Card Instead of Video */}
            <div>
              <h4 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ImageIcon size={18} className="text-primary" /> Guia Ilustrado
              </h4>
              <div style={{ 
                width: '100%', 
                aspectRatio: '16/10', 
                background: 'var(--color-surface)', 
                borderRadius: 'var(--radius-lg)', 
                border: '1px solid var(--color-glass-border)', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.24)'
              }}>
                {content[activeTab].image ? (
                  <img 
                    src={content[activeTab].image} 
                    alt={content[activeTab].title} 
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'cover'
                    }} 
                  />
                ) : (
                  <div style={{ 
                    padding: 'var(--space-6)', 
                    textAlign: 'center', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, rgba(20,20,20,0.95), rgba(40,40,40,0.85))',
                    width: '100%',
                    height: '100%'
                  }}>
                    <div style={{ 
                      width: 64, 
                      height: 64, 
                      borderRadius: '50%', 
                      background: 'rgba(201,169,110,0.1)', 
                      border: '1px solid rgba(201,169,110,0.2)',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      marginBottom: 'var(--space-4)' 
                    }}>
                      <ImageIcon size={32} style={{ color: 'var(--color-gold)', opacity: 0.8 }} />
                    </div>
                    <div style={{ fontWeight: 600, color: 'var(--color-gold)', fontSize: 'var(--text-md)', marginBottom: '8px' }}>Visualização em Breve</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', maxWidth: '240px', lineHeight: 1.5 }}>
                      Nosso manual ilustrado está sendo constantemente atualizado com novas capturas de tela.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
