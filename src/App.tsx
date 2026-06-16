import { useState, useEffect } from 'react';
import type { ActiveTab, Receipt, SpendingGoal, SavingsGoal } from './types';
import TabBar from './components/TabBar';
import HomeView from './components/HomeView';
import ScanView from './components/ScanView';
import AnalyticsView from './components/AnalyticsView';
import GoalsView from './components/GoalsView';
import BadgesView from './components/BadgesView';
import AuthView from './components/AuthView';
import EditReceiptModal from './components/EditReceiptModal';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { X, LogOut } from 'lucide-react';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [islandActive, setIslandActive] = useState(false);
  const [islandMessage, setIslandMessage] = useState('');

  // 編集中のレシート情報
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  
  // 設定モーダルの表示ステート（バグ修正：App.tsxルートで管理）
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // v2追加のステート
  const [spendingGoal, setSpendingGoal] = useState<SpendingGoal>({
    monthlyAmountLimit: 10000,
    monthlyCountLimit: 12
  });
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([
    { id: 'g1', name: 'Nintendo Switch 2', price: 50000, createdAt: '2026-05-15' },
    { id: 'g2', name: 'AirPods Pro', price: 35000, createdAt: '2026-05-20' }
  ]);
  const [linkedPayments, setLinkedPayments] = useState<string[]>([]);
  const [monthlyBaseSavings, setMonthlyBaseSavings] = useState<number>(5000);

  // ログインセッションの監視
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Supabaseから履歴一覧を取得する
  const fetchReceipts = async () => {
    if (!session) return;
    try {
      const { data, error } = await supabase
        .from('usage_history')
        .select('*')
        .order('used_at', { ascending: false });

      if (error) throw error;

      const mapped: Receipt[] = (data || []).map((row: any) => {
        const itemsData = row.items;
        // itemsがオブジェクトで list と isImpulse が含まれているか確認
        const list = (itemsData && typeof itemsData === 'object' && 'list' in itemsData) 
          ? itemsData.list 
          : (Array.isArray(itemsData) ? itemsData : []);
        const isImpulse = (itemsData && typeof itemsData === 'object' && 'isImpulse' in itemsData)
          ? itemsData.isImpulse
          : false;
        const impulseReasons = (itemsData && typeof itemsData === 'object' && 'impulseReasons' in itemsData)
          ? itemsData.impulseReasons
          : [];

        return {
          id: row.id,
          amount: row.amount,
          date: row.used_at,
          storeName: row.store_name,
          isImpulse,
          impulseReasons,
          items: list
        };
      });

      setReceipts(mapped);
    } catch (e) {
      console.error('Failed to fetch receipts from Supabase', e);
    }
  };

  // セッション変更時にデータを取得する
  useEffect(() => {
    if (session) {
      fetchReceipts();
    } else {
      setReceipts([]);
    }
  }, [session]);

  // ローカルストレージから目標等のデータを読み込む（レシート以外のステート）
  useEffect(() => {
    // 1. 節約目標
    const savedSpending = localStorage.getItem('cobaco_spending_goal');
    if (savedSpending) {
      try {
        setSpendingGoal(JSON.parse(savedSpending));
      } catch (e) {
        console.error('Failed to parse spending goal', e);
      }
    }

    // 2. 欲しいもの貯金目標
    const savedSavings = localStorage.getItem('cobaco_savings_goals');
    if (savedSavings) {
      try {
        setSavingsGoals(JSON.parse(savedSavings));
      } catch (e) {
        console.error('Failed to parse savings goals', e);
      }
    }

    // 3. 電子決済連携
    const savedPayments = localStorage.getItem('cobaco_linked_payments');
    if (savedPayments) {
      try {
        setLinkedPayments(JSON.parse(savedPayments));
      } catch (e) {
        console.error('Failed to parse linked payments', e);
      }
    }

    // 4. 基本の月間貯蓄額
    const savedBaseSavings = localStorage.getItem('cobaco_base_savings');
    if (savedBaseSavings) {
      try {
        setMonthlyBaseSavings(Number(savedBaseSavings));
      } catch (e) {
        console.error('Failed to parse base savings', e);
      }
    }
  }, []);

  // ダイナミックアイランド通知をトリガーする
  const triggerNotification = (message: string) => {
    setIslandMessage(message);
    setIslandActive(true);
    setTimeout(() => {
      setIslandActive(false);
    }, 3000);
  };

  // レシートの追加 (Supabaseに保存)
  const handleAddReceipt = async (newReceipt: Omit<Receipt, 'id'>) => {
    if (!session) return;
    try {
      const itemsPayload = {
        list: newReceipt.items || [],
        isImpulse: newReceipt.isImpulse,
        impulseReasons: newReceipt.impulseReasons || []
      };

      const { error } = await supabase
        .from('usage_history')
        .insert({
          user_id: session.user.id,
          store_name: newReceipt.storeName,
          amount: newReceipt.amount,
          items: itemsPayload,
          used_at: newReceipt.date
        });

      if (error) throw error;

      triggerNotification('レシートを保存しました 💾');
      fetchReceipts();
      setActiveTab('home');
    } catch (e) {
      console.error('Failed to add receipt to Supabase', e);
      triggerNotification('保存に失敗しました ❌');
    }
  };

  // レシートの削除 (Supabaseから削除)
  const handleDeleteReceipt = async (id: string) => {
    if (!session) return;
    try {
      const { error } = await supabase
        .from('usage_history')
        .delete()
        .eq('id', id);

      if (error) throw error;

      triggerNotification('履歴を削除しました 🗑️');
      fetchReceipts();
    } catch (e) {
      console.error('Failed to delete receipt from Supabase', e);
      triggerNotification('削除に失敗しました ❌');
    }
  };

  // レシートの更新 (Supabaseをアップデート)
  const handleUpdateReceipt = async (id: string, updatedFields: Omit<Receipt, 'id'>) => {
    if (!session) return;
    try {
      const itemsPayload = {
        list: updatedFields.items || [],
        isImpulse: updatedFields.isImpulse,
        impulseReasons: updatedFields.impulseReasons || []
      };

      const { error } = await supabase
        .from('usage_history')
        .update({
          store_name: updatedFields.storeName,
          amount: updatedFields.amount,
          items: itemsPayload,
          used_at: updatedFields.date
        })
        .eq('id', id);

      if (error) throw error;

      triggerNotification('履歴を更新しました 💾');
      setEditingReceipt(null);
      fetchReceipts();
    } catch (e) {
      console.error('Failed to update receipt in Supabase', e);
      triggerNotification('更新に失敗しました ❌');
    }
  };

  // ログアウト処理
  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      triggerNotification('ログアウトしました 🔑');
    } catch (e) {
      console.error('Failed to logout', e);
    }
  };

  // 節約目標の更新
  const handleUpdateSpendingGoal = (newGoal: SpendingGoal) => {
    setSpendingGoal(newGoal);
    localStorage.setItem('cobaco_spending_goal', JSON.stringify(newGoal));
    triggerNotification('節約目標を更新しました 🎯');
  };

  // 基本貯蓄額の更新
  const handleUpdateBaseSavings = (amount: number) => {
    setMonthlyBaseSavings(amount);
    localStorage.setItem('cobaco_base_savings', String(amount));
    triggerNotification('基本の月間貯蓄額を更新しました 💰');
  };

  // 欲しいものの追加
  const handleAddSavingsGoal = (name: string, price: number) => {
    const newGoal: SavingsGoal = {
      id: Date.now().toString(),
      name,
      price,
      createdAt: new Date().toISOString().split('T')[0]
    };
    const updated = [...savingsGoals, newGoal];
    setSavingsGoals(updated);
    localStorage.setItem('cobaco_savings_goals', JSON.stringify(updated));
    triggerNotification('欲しいものを追加しました 🛍️');
  };

  // 欲しいものの削除
  const handleDeleteSavingsGoal = (id: string) => {
    const updated = savingsGoals.filter(g => g.id !== id);
    setSavingsGoals(updated);
    localStorage.setItem('cobaco_savings_goals', JSON.stringify(updated));
    triggerNotification('欲しいものを削除しました 🗑️');
  };

  // 電子決済の自動連携とモックデータ追加 (Supabaseに保存)
  const handleLinkPayment = async (provider: string) => {
    if (!session) return;
    if (linkedPayments.includes(provider)) return;

    const updatedPayments = [...linkedPayments, provider];
    setLinkedPayments(updatedPayments);
    localStorage.setItem('cobaco_linked_payments', JSON.stringify(updatedPayments));

    // 自動連携シミュレーション：3件の利用履歴を自動登録
    const offset = new Date().getTimezoneOffset() * 60000;
    const nowStr = (new Date(new Date().getTime() - offset)).toISOString().slice(0, 16);

    const mockLinkedReceipts = [
      {
        user_id: session.user.id,
        amount: 350,
        used_at: nowStr,
        store_name: 'ファミリーマート 千葉大前店',
        items: { list: ['鮭おにぎり', '生カヌレケーキ'], isImpulse: false, impulseReasons: [] }
      },
      {
        user_id: session.user.id,
        amount: 620,
        used_at: nowStr,
        store_name: 'セブンイレブン 習志野店',
        items: { list: ['サラダチキン', 'サンドイッチミックス'], isImpulse: false, impulseReasons: [] }
      },
      {
        user_id: session.user.id,
        amount: 280,
        used_at: nowStr,
        store_name: 'ローソン 津田沼駅前店',
        items: { list: ['Lチキ レギュラー'], isImpulse: false, impulseReasons: [] }
      }
    ];

    try {
      const { error } = await supabase
        .from('usage_history')
        .insert(mockLinkedReceipts);

      if (error) throw error;

      triggerNotification(`${provider}連携完了！3件の履歴を取得しました 📱`);
      fetchReceipts();
    } catch (e) {
      console.error('Failed to insert mock linked receipts to Supabase', e);
    }
  };

  // 時間を取得してステータスバーに表示
  const [currentTime, setCurrentTime] = useState('20:23');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setCurrentTime(`${hours}:${minutes}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="phone-frame">
      {/* ステータスバー */}
      <div className="phone-status-bar">
        <span>{currentTime}</span>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <span>📶</span>
          <span>🔋</span>
        </div>
      </div>

      {/* ダイナミックアイランド (通知機能付き) */}
      <div className={`phone-island ${islandActive ? 'active' : ''}`}>
        {islandActive && (
          <div style={{
            color: '#FFFFFF',
            fontSize: '11px',
            fontWeight: '600',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 12px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            animation: 'fadeIn 0.2s ease-in-out'
          }}>
            {islandMessage}
          </div>
        )}
      </div>

      {/* 未ログイン時は認証画面を表示 */}
      {!session ? (
        <main className="scrollable" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <AuthView onAuthSuccess={() => triggerNotification('ログインしました 🔑')} />
        </main>
      ) : (
        <>
          {/* メインビューエリア */}
          <main className="scrollable">
            {activeTab === 'home' && (
              <HomeView
                receipts={receipts}
                onNavigate={setActiveTab}
                onDeleteReceipt={handleDeleteReceipt}
                onOpenSettings={() => setShowSettingsModal(true)}
                onEditReceipt={setEditingReceipt}
              />
            )}
            {activeTab === 'scan' && (
              <ScanView
                onAddReceipt={handleAddReceipt}
                linkedPayments={linkedPayments}
                onLinkPayment={handleLinkPayment}
              />
            )}
            {activeTab === 'analytics' && (
              <AnalyticsView
                receipts={receipts}
              />
            )}
            {activeTab === 'goals' && (
              <GoalsView
                receipts={receipts}
                spendingGoal={spendingGoal}
                savingsGoals={savingsGoals}
                monthlyBaseSavings={monthlyBaseSavings}
                onUpdateSpendingGoal={handleUpdateSpendingGoal}
                onAddSavingsGoal={handleAddSavingsGoal}
                onDeleteSavingsGoal={handleDeleteSavingsGoal}
                onUpdateBaseSavings={handleUpdateBaseSavings}
              />
            )}
            {activeTab === 'badges' && (
              <BadgesView
                receipts={receipts}
                spendingGoal={spendingGoal}
                linkedPayments={linkedPayments}
              />
            )}
          </main>

          {/* ナビゲーションバー */}
          <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
        </>
      )}

      {/* 設定モーダル (バグ修正: phone-frame直下に配置してスクロールエリアの影響を避ける) */}
      {showSettingsModal && session && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          zIndex: 3000,
          display: 'flex',
          alignItems: 'flex-end',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            width: '100%',
            backgroundColor: 'var(--ios-bg)',
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            padding: '20px 16px 32px 16px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            animation: 'slideUp 0.3s cubic-bezier(0.1, 0.8, 0.3, 1)'
          }}>
            {/* モーダルヘッダー */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '0.5px solid var(--ios-border)' }}>
              <span style={{ fontSize: '18px', fontWeight: '800' }}>設定</span>
              <button 
                onClick={() => setShowSettingsModal(false)}
                style={{
                  border: 'none',
                  background: 'var(--ios-gray-light)',
                  color: 'var(--ios-text-main)',
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* メールアドレス表示 */}
            <div className="ios-card" style={{ margin: 0, padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--ios-text-secondary)', fontWeight: 600 }}>ログイン中のアカウント</span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ios-text-main)', wordBreak: 'break-all' }}>
                {session.user.email || '未設定'}
              </span>
            </div>

            {/* ログアウトボタン */}
            <button
              onClick={() => {
                handleLogout();
                setShowSettingsModal(false);
              }}
              className="ios-btn ios-btn-danger"
              style={{ width: '100%' }}
            >
              <LogOut size={16} />
              ログアウト
            </button>
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {editingReceipt && (
        <EditReceiptModal
          receipt={editingReceipt}
          onClose={() => setEditingReceipt(null)}
          onSave={(updated) => handleUpdateReceipt(editingReceipt.id, updated)}
        />
      )}

      {/* ホームインジケータ */}
      <div className="phone-home-indicator"></div>
    </div>
  );
}

export default App;
