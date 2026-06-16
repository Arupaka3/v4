import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingBag, TrendingUp, Lock, Mail, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface AuthViewProps {
  onAuthSuccess: () => void;
}

const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
          ConviTrack
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
