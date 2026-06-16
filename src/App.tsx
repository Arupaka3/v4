import { useState, useEffect } from 'react';
import type { ActiveTab, Receipt, SpendingGoal, SavingsGoal, Streak } from './types';
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
  const [isLoading, setIsLoading] = useState(true);

  // 編集中のレシート情報
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  
  // 設定モーダルの表示ステート（バグ修正：App.tsxルートで管理）
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // v2追加のステート
  const [spendingGoal, setSpendingGoal] = useState<SpendingGoal>({
    monthlyAmountLimit: 10000,
    monthlyCountLimit: 12
  });
  
  // 欲しいもの目標 (Supabaseで永続化)
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  // 基本月間貯蓄額 (Supabaseで永続化)
  const [monthlyBaseSavings, setMonthlyBaseSavings] = useState<number>(5000);
  // 月間収入 (Supabaseで永続化) (NEW)
  const [monthlyIncome, setMonthlyIncome] = useState<number | null>(null);
  // ストリーク (Supabaseで永続化) (NEW)
  const [streak, setStreak] = useState<Streak>({ currentStreak: 0, bestStreak: 0, lastConviniDate: null });
  const [activeMilestone, setActiveMilestone] = useState<{ days: number; message: string } | null>(null);

  const [linkedPayments, setLinkedPayments] = useState<string[]>([]);

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

  // ストリークの動的計算 (今日 2026-05-31 から遡ってコンビニを利用していない日数を数える)
  const checkStreak = (receiptsData: Receipt[], baseDateStr: string = '2026-05-31'): { currentStreak: number; lastConviniDate: string | null } => {
    if (receiptsData.length === 0) {
      return { currentStreak: 0, lastConviniDate: null };
    }

    const usedDates = new Set(receiptsData.map(r => r.date.split('T')[0]));
    
    // 日付順に降順ソートされたレシートから、最新のコンビニ利用日を取得
    const sortedReceipts = [...receiptsData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastConviniDate = sortedReceipts[0].date.split('T')[0];

    let currentStreak = 0;
    const checkDate = new Date(`${baseDateStr}T12:00:00`); // タイムゾーンずれを防ぐため昼12時

    while (true) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (usedDates.has(dateStr)) {
        break; // 利用した日が見つかった時点でストップ
      }
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
      
      if (currentStreak > 365) break; // 安全弁
    }

    return { currentStreak, lastConviniDate };
  };

  // マイルストーンのチェックとモーダル表示
  const checkMilestones = (currentStreak: number) => {
    if (!session) return;
    const milestones = [
      { days: 3, message: '🎉 3日達成！いいスタートです' },
      { days: 7, message: '🔥 1週間達成！節約の習慣が身についてきました' },
      { days: 14, message: '💪 2週間！もう立派な節約家です' },
      { days: 30, message: '🏆 1ヶ月達成！コンビニ断ちマスターです' }
    ];

    const target = milestones.find(m => m.days === currentStreak);
    if (target) {
      const key = `cobaco_milestone_shown_${session.user.id}_${target.days}`;
      const isShown = localStorage.getItem(key);
      if (!isShown) {
        setActiveMilestone(target);
        localStorage.setItem(key, 'true');
      }
    }
  };

  // ストリーク情報の取得とSupabase同期
  const fetchAndSyncStreak = async (currentReceipts: Receipt[]) => {
    if (!session) return;
    try {
      // 1. Supabaseから現在のレコードを取得
      const { data, error } = await supabase
        .from('streaks')
        .select('current_streak, best_streak, last_convini_date')
        .eq('user_id', session.user.id)
        .single();

      let dbCurrent = 0;
      let dbBest = 0;
      let dbLastDate: string | null = null;
      let hasRecord = false;

      if (!error && data) {
        dbCurrent = data.current_streak;
        dbBest = data.best_streak;
        dbLastDate = data.last_convini_date;
        hasRecord = true;
      } else if (error && error.code !== 'PGRST116') {
        throw error;
      }

      // 2. ローカルでストリークを計算
      const { currentStreak, lastConviniDate } = checkStreak(currentReceipts);

      // 3. ベストストリークの更新
      let newBest = dbBest;
      if (currentStreak > dbBest) {
        newBest = currentStreak;
      }

      // 4. 不整合があればDBへ同期保存(upsert)
      if (!hasRecord || dbCurrent !== currentStreak || dbBest !== newBest || dbLastDate !== lastConviniDate) {
        const { error: upsertError } = await supabase
          .from('streaks')
          .upsert({
            user_id: session.user.id,
            current_streak: currentStreak,
            best_streak: newBest,
            last_convini_date: lastConviniDate,
            updated_at: new Date().toISOString()
          });

        if (upsertError) throw upsertError;
      }

      setStreak({
        currentStreak,
        bestStreak: newBest,
        lastConviniDate
      });

      // 5. 祝福モーダル判定
      checkMilestones(currentStreak);

    } catch (e) {
      console.error('Failed to sync streak with Supabase', e);
    }
  };

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
      // ストリークの同期と計算を実行
      fetchAndSyncStreak(mapped);
    } catch (e) {
      console.error('Failed to fetch receipts from Supabase', e);
    }
  };

  // Supabaseから欲しいものリストを取得する
  const fetchSavingsGoals = async () => {
    if (!session) return;
    try {
      const { data, error } = await supabase
        .from('wish_list')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const mapped: SavingsGoal[] = (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        price: row.price,
        createdAt: row.created_at,
        currentSavings: row.current_savings || 0
      }));

      setSavingsGoals(mapped);
    } catch (e) {
      console.error('Failed to fetch savings goals from Supabase', e);
    }
  };

  // Supabaseから基本貯蓄額設定を取得する
  const fetchBaseSavings = async () => {
    if (!session) return;
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('monthly_base_savings, monthly_income')
        .eq('user_id', session.user.id)
        .single();

      if (error) {
        // レコードが存在しない場合はデフォルト5000円でレコードを初期作成
        if (error.code === 'PGRST116') {
          const { error: insertError } = await supabase
            .from('user_settings')
            .insert({
              user_id: session.user.id,
              monthly_base_savings: 5000,
              monthly_income: null
            });
          if (insertError) throw insertError;
          setMonthlyBaseSavings(5000);
          setMonthlyIncome(null);
          return;
        }
        throw error;
      }

      setMonthlyBaseSavings(data.monthly_base_savings);
      setMonthlyIncome(data.monthly_income);
    } catch (e) {
      console.error('Failed to fetch base savings from Supabase', e);
    }
  };

  // セッション変更時に全てのクラウドデータを取得する
  useEffect(() => {
    if (session) {
      setIsLoading(true);
      Promise.all([
        fetchReceipts(),
        fetchSavingsGoals(),
        fetchBaseSavings()
      ]).finally(() => {
        setIsLoading(false);
      });
    } else {
      setReceipts([]);
      setSavingsGoals([]);
      setMonthlyBaseSavings(5000);
      setMonthlyIncome(null);
      setStreak({ currentStreak: 0, bestStreak: 0, lastConviniDate: null });
      setIsLoading(false);
    }
  }, [session]);

  // ローカルストレージからの読込（クラウド移行しない補助設定）
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

    // 2. 電子決済連携
    const savedPayments = localStorage.getItem('cobaco_linked_payments');
    if (savedPayments) {
      try {
        setLinkedPayments(JSON.parse(savedPayments));
      } catch (e) {
        console.error('Failed to parse linked payments', e);
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

  // 基本貯蓄額の更新 (Supabaseに保存)
  const handleUpdateBaseSavings = async (amount: number) => {
    if (!session) return;
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: session.user.id,
          monthly_base_savings: amount,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setMonthlyBaseSavings(amount);
      triggerNotification('基本の月間貯蓄額を更新しました 💰');
    } catch (e) {
      console.error('Failed to update base savings in Supabase', e);
      triggerNotification('更新に失敗しました ❌');
    }
  };

  // 月収の更新 (Supabaseに保存)
  const handleUpdateMonthlyIncome = async (income: number) => {
    if (!session) return;
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: session.user.id,
          monthly_income: income,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setMonthlyIncome(income);
      triggerNotification('月収情報を更新しました 💰');
    } catch (e) {
      console.error('Failed to update monthly income in Supabase', e);
      triggerNotification('更新に失敗しました ❌');
    }
  };

  // 欲しいものの追加 (Supabaseに保存)
  const handleAddSavingsGoal = async (name: string, price: number, currentSavings: number = 0) => {
    if (!session) return;
    try {
      const { error } = await supabase
        .from('wish_list')
        .insert({
          user_id: session.user.id,
          name,
          price,
          current_savings: currentSavings
        });

      if (error) throw error;

      triggerNotification('欲しいものを追加しました 🛍️');
      fetchSavingsGoals();
    } catch (e) {
      console.error('Failed to add savings goal to Supabase', e);
      triggerNotification('追加に失敗しました ❌');
    }
  };

  // 欲しいものの削除 (Supabaseから削除)
  const handleDeleteSavingsGoal = async (id: string) => {
    if (!session) return;
    try {
      const { error } = await supabase
        .from('wish_list')
        .delete()
        .eq('id', id);

      if (error) throw error;

      triggerNotification('欲しいものを削除しました 🗑️');
      fetchSavingsGoals();
    } catch (e) {
      console.error('Failed to delete savings goal from Supabase', e);
      triggerNotification('削除に失敗しました ❌');
    }
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
                streak={streak}
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
                monthlyIncome={monthlyIncome}
                onUpdateMonthlyIncome={handleUpdateMonthlyIncome}
              />
            )}
            {activeTab === 'goals' && (
              <GoalsView
                receipts={receipts}
                spendingGoal={spendingGoal}
                savingsGoals={savingsGoals}
                monthlyBaseSavings={monthlyBaseSavings}
                isLoading={isLoading}
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

      {/* マイルストーン祝福モーダル */}
      {activeMilestone && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 5000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease-out',
          padding: '24px'
        }}>
          <div className="ios-card" style={{
            width: '100%',
            maxWidth: '300px',
            textAlign: 'center',
            padding: '24px 20px',
            backgroundColor: 'var(--ios-bg)',
            borderRadius: '20px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            animation: 'slideUp 0.3s cubic-bezier(0.1, 0.8, 0.3, 1)'
          }}>
            <div style={{ fontSize: '48px' }}>
              {activeMilestone.days === 3 ? '🥉' : activeMilestone.days === 7 ? '🥈' : activeMilestone.days === 14 ? '🥇' : '🏆'}
            </div>
            <div style={{ fontSize: '18px', fontWeight: '800' }}>ストリーク達成！</div>
            <p style={{ fontSize: '13px', color: 'var(--ios-text-secondary)', margin: 0, lineHeight: 1.5 }}>
              {activeMilestone.message}
            </p>
            <button
              onClick={() => setActiveMilestone(null)}
              className="ios-btn"
              style={{ width: '100%', padding: '10px 0', borderRadius: '10px', fontSize: '14px' }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* ホームインジケータ */}
      <div className="phone-home-indicator"></div>
    </div>
  );
}

export default App;
