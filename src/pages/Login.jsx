import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './Login.css';

export default function Login() {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'reset'
  const [resetSent, setResetSent] = useState(false);
  const [empresa, setEmpresa] = useState(null);

  useEffect(() => {
    supabase.from('empresa').select('nome, logo_url').limit(1).maybeSingle()
      .then(({ data }) => { if (data) setEmpresa(data); });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'reset') {
        await resetPassword(email);
        setResetSent(true);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(
        mode === 'reset'
          ? 'Erro ao enviar e-mail de recuperação.'
          : 'Credenciais inválidas. Verifique e tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      {/* Decorative background elements */}
      <div className="login-bg-glow login-bg-glow-1" />
      <div className="login-bg-glow login-bg-glow-2" />
      <div className="login-bg-glow login-bg-glow-3" />

      <div className="login-container animate-fade-in">
        {/* Brand Side */}
        <div className="login-brand">
          <div className="login-brand-content">
            <div className="login-logo-official">
              {empresa?.logo_url
                ? <img src={empresa.logo_url} alt={empresa.nome || 'UNA AURA'} style={{ maxHeight: 100, objectFit: 'contain' }} />
                : <img src="/logo.svg" alt="UNA AURA" />}
            </div>
            <p className="login-brand-tagline">O brilho que já existe em você</p>
            <div className="login-brand-divider" />
            <p className="login-brand-desc">
              Sistema premium de gestão de semijoias e joias.
              Controle total do seu negócio com elegância.
            </p>
            <div className="login-brand-gems">
              <span>💎</span><span>✨</span><span>💍</span>
            </div>
          </div>
          <div className="login-brand-pattern" />
        </div>

        {/* Form Side */}
        <div className="login-form-side">
          <div className="login-form-wrapper">
            <div className="login-form-header">
              <h2>{mode === 'reset' ? 'Recuperar Senha' : 'Bem-vinda de volta'}</h2>
              <p className="text-muted">
                {mode === 'reset'
                  ? 'Informe seu e-mail para receber o link de recuperação'
                  : 'Acesse sua conta para continuar'}
              </p>
            </div>

            {error && (
              <div className="login-error animate-slide-up">
                <span>{error}</span>
              </div>
            )}

            {resetSent && mode === 'reset' && (
              <div className="login-success animate-slide-up">
                <span>✨ E-mail de recuperação enviado! Verifique sua caixa de entrada.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label className="form-label">E-mail</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              {mode === 'login' && (
                <div className="form-group">
                  <label className="form-label">Senha</label>
                  <div className="login-password-wrapper">
                    <input
                      type={showPass ? 'text' : 'password'}
                      className="form-input"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="login-password-toggle"
                      onClick={() => setShowPass(!showPass)}
                      tabIndex={-1}
                    >
                      {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'login' && (
                <div className="login-options">
                  <label className="login-remember">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={e => setRemember(e.target.checked)}
                    />
                    <span>Lembrar login</span>
                  </label>
                  <button
                    type="button"
                    className="login-forgot"
                    onClick={() => { setMode('reset'); setError(''); }}
                  >
                    Esqueceu a senha?
                  </button>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg login-submit"
                disabled={loading}
              >
                {loading ? (
                  <div className="spinner" />
                ) : mode === 'reset' ? (
                  'Enviar Link'
                ) : (
                  'Entrar'
                )}
              </button>

              {mode === 'reset' && (
                <button
                  type="button"
                  className="btn btn-ghost login-back"
                  onClick={() => { setMode('login'); setError(''); setResetSent(false); }}
                >
                  ← Voltar ao login
                </button>
              )}
            </form>
          </div>

          <p className="login-footer">
            UNA AURA © {new Date().getFullYear()} • Todos os direitos reservados
          </p>
        </div>
      </div>
    </div>
  );
}
