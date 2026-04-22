'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, AlertCircle, Building2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await signIn(email, password);
      router.push('/dashboard');
    } catch { setError('البريد الإلكتروني أو كلمة المرور غير صحيحة'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(160deg, #0f1729 0%, #1a2540 50%, #0f1729 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', position: 'relative', overflow: 'hidden',
    }}>
      {/* Background circles */}
      <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: '50vw', height: '50vw', borderRadius: '50%', background: 'rgba(201,168,76,.06)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-15%', left: '-5%', width: '40vw', height: '40vw', borderRadius: '50%', background: 'rgba(16,185,129,.05)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: '400px', position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '20px', margin: '0 auto 1rem',
            background: 'linear-gradient(135deg, #c9a84c, #e8c97a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(201,168,76,.4)',
          }}>
            <Building2 size={34} color="#0f1729" strokeWidth={2} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', marginBottom: '0.25rem' }}>نظام الصندوق</h1>
          <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,.45)' }}>الصندوق العائلي والتجاري الخاص</p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,.06)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: '24px',
          padding: '2rem',
        }}>
          {error && (
            <div style={{
              background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)',
              borderRadius: '12px', padding: '0.75rem 1rem', marginBottom: '1.25rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: '#fca5a5', fontSize: '0.85rem',
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,.6)', marginBottom: '0.5rem' }}>
                البريد الإلكتروني
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="example@email.com" dir="ltr"
                style={{
                  width: '100%', padding: '0.75rem 1rem', borderRadius: '12px',
                  background: 'rgba(255,255,255,.08)', border: '1.5px solid rgba(255,255,255,.12)',
                  color: '#fff', fontSize: '0.875rem', fontFamily: 'Cairo, inherit',
                  outline: 'none', transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(201,168,76,.6)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,.12)'}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,.6)', marginBottom: '0.5rem' }}>
                كلمة المرور
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  style={{
                    width: '100%', padding: '0.75rem 1rem', paddingLeft: '2.75rem', borderRadius: '12px',
                    background: 'rgba(255,255,255,.08)', border: '1.5px solid rgba(255,255,255,.12)',
                    color: '#fff', fontSize: '0.875rem', fontFamily: 'Cairo, inherit',
                    outline: 'none', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(201,168,76,.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,.12)'}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{
                  position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.4)',
                  display: 'flex', padding: '4px',
                }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={{
              marginTop: '0.5rem', width: '100%', padding: '0.875rem',
              borderRadius: '14px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? 'rgba(201,168,76,.5)' : 'linear-gradient(135deg, #c9a84c, #e8c97a)',
              color: '#0f1729', fontSize: '1rem', fontWeight: 800,
              fontFamily: 'Cairo, inherit', letterSpacing: '0.01em',
              boxShadow: '0 4px 16px rgba(201,168,76,.4)',
              transition: 'opacity 0.15s, transform 0.1s',
            }}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span style={{ width: '18px', height: '18px', border: '2px solid rgba(15,23,41,.3)', borderTopColor: '#0f1729', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                  جاري الدخول...
                </span>
              ) : 'دخول'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'rgba(255,255,255,.25)', marginTop: '1.5rem' }}>
            لا يوجد تسجيل ذاتي — الحسابات تُنشأ من المدير فقط
          </p>
        </div>
      </div>
    </div>
  );
}
