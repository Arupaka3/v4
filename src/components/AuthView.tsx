import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingBag, TrendingUp, Lock, Mail, Loader2, AlertCircle, CheckCircle, Wand2, Copy, Check } from 'lucide-react';

interface AuthViewProps {
  onAuthSuccess: () => void;
}

// ランダムな英数字文字列を生成
const randomStr = (len: number, chars = 'abcdefghijklmnopqrstuvwxyz0123456789') =>
  Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

// サンプルメールアドレスとパスワードを生成
const generateSampleCredentials = () => {
  const timestamp = Date.now().toString(36); // 時刻ベースのユニーク文字列
  const suffix = randomStr(4);
  const email = `yorimichi-${timestamp}${suffix}@example.com`;
  // 英大文字・英小文字・数字・記号を含む12文字
  const upper = randomStr(2, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  const lower = randomStr(6, 'abcdefghijklmnopqrstuvwxyz');
  const digits = randomStr(2, '0123456789');
  const symbols = randomStr(2, '!@#$%');
  const combined = (upper + lower + digits + symbols).split('').sort(() => Math.random() - 0.5).join('');
  return { email, password: combined };
};

const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 生成された認証情報のプレビュー（コピー用）
  const [generatedCredentials, setGeneratedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        // 新規登録
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;

        if (data.user && data.session) {
          // すぐにセッションが取得できた場合（確認メール不要設定など）
          onAuthSuccess();
        } else {
          setMessage('登録確認メールを送信しました。メール内のリンクをクリックして登録を完了してください。');
        }
      } else {
        // ログイン
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;
        onAuthSuccess();
      }
    } catch (err: any) {
      console.error(err);
      // エラーメッセージの日本語化
      let jpErrorMsg = err.message;
      if (err.message.includes('Invalid login credentials')) {
        jpErrorMsg = 'メールアドレスまたはパスワードが正しくありません。';
      } else if (err.message.includes('User already registered')) {
        jpErrorMsg = 'このメールアドレスは既に登録されています。';
      } else if (err.message.includes('Password should be at least')) {
        jpErrorMsg = 'パスワードは6文字以上で入力してください。';
      } else if (err.message.includes('Email format is invalid')) {
        jpErrorMsg = 'メールアドレスの形式が正しくありません。';
      }
      setError(jpErrorMsg);
    } finally {
      setLoading(false);
    }
  };

  // サンプル情報を自動生成してフォームに入力
  const handleGenerateSample = () => {
    const creds = generateSampleCredentials();
    setEmail(creds.email);
    setPassword(creds.password);
    setGeneratedCredentials(creds);
    setError(null);
    setMessage(null);
    setCopiedField(null);
  };

  // クリップボードへコピー
  const handleCopy = (field: 'email' | 'password') => {
    const text = field === 'email' ? generatedCredentials?.email : generatedCredentials?.password;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      minHeight: '100%',
      padding: '24px 8px',
      boxSizing: 'border-box'
    }}>
      {/* アプリロゴとヘッダー */}
      <div style={{
        textAlign: 'center',
        marginBottom: '32px',
        animation: 'fadeIn 0.5s ease-out'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          width: '72px',
          height: '72px',
          borderRadius: '22px',
          background: 'linear-gradient(135deg, #1B9A5E 0%, #34C759 100%)',
          color: '#FFFFFF',
          boxShadow: '0 10px 25px rgba(52, 199, 89, 0.3)',
          marginBottom: '16px'
        }}>
          <ShoppingBag size={30} style={{ position: 'relative', top: '-2px' }} />
          <TrendingUp size={16} style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            background: 'var(--ios-card)',
            color: 'var(--ios-primary)',
            borderRadius: '50%',
            padding: '2px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
          }} />
        </div>
        
        <h1 style={{
          fontSize: '28px',
          fontWeight: 800,
          margin: '0 0 6px 0',
          letterSpacing: '-0.5px',
          color: 'var(--ios-text-main)'
        }}>
          よりみちログ
        </h1>
        <p style={{
          fontSize: '13px',
          color: 'var(--ios-text-secondary)',
          margin: 0,
          fontWeight: 500
        }}>
          コンビニ利用を賢く記録・自己管理
        </p>
      </div>

      {/* ログイン・新規登録の切り替え（iOS風セグメンテッドコントロール） */}
      <div style={{
        display: 'flex',
        backgroundColor: 'rgba(120, 120, 128, 0.08)',
        padding: '2px',
        borderRadius: '9px',
        marginBottom: '24px'
      }}>
        <button
          type="button"
          onClick={() => {
            setIsSignUp(false);
            setError(null);
            setMessage(null);
            setGeneratedCredentials(null);
          }}
          style={{
            flex: 1,
            border: 'none',
            background: !isSignUp ? '#FFFFFF' : 'transparent',
            boxShadow: !isSignUp ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            borderRadius: '7px',
            padding: '8px 0',
            fontSize: '13px',
            fontWeight: !isSignUp ? '600' : '500',
            color: !isSignUp ? 'var(--ios-text-main)' : 'var(--ios-text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          ログイン
        </button>
        <button
          type="button"
          onClick={() => {
            setIsSignUp(true);
            setError(null);
            setMessage(null);
            setGeneratedCredentials(null);
          }}
          style={{
            flex: 1,
            border: 'none',
            background: isSignUp ? '#FFFFFF' : 'transparent',
            boxShadow: isSignUp ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            borderRadius: '7px',
            padding: '8px 0',
            fontSize: '13px',
            fontWeight: isSignUp ? '600' : '500',
            color: isSignUp ? 'var(--ios-text-main)' : 'var(--ios-text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          新規登録
        </button>
      </div>

      {/* フォーム */}
      <form onSubmit={handleSubmit} className="ios-card" style={{ padding: '24px', margin: 0 }}>
        {/* エラー表示 */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--ios-red-light)',
            color: 'var(--ios-red)',
            padding: '12px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600',
            marginBottom: '16px',
            border: '1px solid rgba(255, 59, 48, 0.1)'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* メッセージ表示 */}
        {message && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--ios-primary-light)',
            color: 'var(--ios-primary)',
            padding: '12px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600',
            marginBottom: '16px',
            border: '1px solid rgba(52, 199, 89, 0.1)'
          }}>
            <CheckCircle size={16} style={{ flexShrink: 0 }} />
            <span>{message}</span>
          </div>
        )}

        {/* サンプル自動生成ボタン */}
        <button
          type="button"
          onClick={handleGenerateSample}
          disabled={loading}
          style={{
            width: '100%',
            border: '1.5px dashed rgba(255, 149, 0, 0.5)',
            background: 'rgba(255, 149, 0, 0.05)',
            color: 'var(--ios-orange)',
            borderRadius: '12px',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginBottom: '16px',
            transition: 'all 0.15s ease'
          }}
        >
          <Wand2 size={14} />
          サンプルのメールアドレスとパスワードを自動生成
        </button>

        {/* 生成済み認証情報のプレビューカード */}
        {generatedCredentials && (
          <div style={{
            backgroundColor: '#FFFDF9',
            border: '1px solid rgba(255, 149, 0, 0.2)',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '16px',
            fontSize: '11px'
          }}>
            <div style={{ fontWeight: '700', color: 'var(--ios-orange)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Wand2 size={12} />
              自動生成された認証情報（メモしてください）
            </div>
            {/* メールアドレス行 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderRadius: '8px', padding: '8px 10px', marginBottom: '6px', border: '0.5px solid var(--ios-border)' }}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '9px', color: 'var(--ios-text-secondary)', marginBottom: '2px' }}>メールアドレス</div>
                <div style={{ fontSize: '11px', fontWeight: '600', fontFamily: 'monospace', wordBreak: 'break-all' }}>{generatedCredentials.email}</div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('email')}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: copiedField === 'email' ? 'var(--ios-primary)' : 'var(--ios-text-secondary)', padding: '4px', flexShrink: 0 }}
              >
                {copiedField === 'email' ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            {/* パスワード行 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderRadius: '8px', padding: '8px 10px', border: '0.5px solid var(--ios-border)' }}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '9px', color: 'var(--ios-text-secondary)', marginBottom: '2px' }}>パスワード</div>
                <div style={{ fontSize: '11px', fontWeight: '600', fontFamily: 'monospace' }}>{generatedCredentials.password}</div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('password')}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: copiedField === 'password' ? 'var(--ios-primary)' : 'var(--ios-text-secondary)', padding: '4px', flexShrink: 0 }}
              >
                {copiedField === 'password' ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <div style={{ fontSize: '9px', color: 'var(--ios-text-secondary)', marginTop: '6px', lineHeight: '1.4' }}>
              ⚠️ このメールアドレスとパスワードは記録しておいてください。ログイン時に必要です。
            </div>
          </div>
        )}

        {/* メールアドレス入力 */}
        <div className="ios-input-group">
          <label className="ios-input-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Mail size={12} />
            メールアドレス
          </label>
          <input
            type="email"
            className="ios-input"
            placeholder="example@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={loading}
          />
        </div>

        {/* パスワード入力 */}
        <div className="ios-input-group" style={{ marginBottom: '24px' }}>
          <label className="ios-input-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Lock size={12} />
            パスワード
          </label>
          <input
            type="password"
            className="ios-input"
            placeholder="6文字以上のパスワード"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            disabled={loading}
          />
        </div>

        {/* 決定ボタン */}
        <button
          type="submit"
          className="ios-btn"
          disabled={loading}
          style={{ width: '100%' }}
        >
          {loading ? (
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            isSignUp ? '登録する' : 'ログイン'
          )}
        </button>
      </form>
    </div>
  );
};

export default AuthView;
