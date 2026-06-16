import { useState, useEffect } from 'react';
import type { ActiveTab, Receipt, SpendingGoal, SavingsGoal, Streak, UserBadge } from './types';
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
  const [spendingGoal, setSpendingGoal] = useState<SpendingGoal>(() => {
    const savedSpending = localStorage.getItem('cobaco_spending_goal');
    if (savedSpending) {
      try {
        return JSON.parse(savedSpending);
      } catch (e) {
        console.error('Failed to parse spending goal', e);
      }
    }
    return {
      monthlyAmountLimit: 10000,
      monthlyCountLimit: 12
    };
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

  const [linkedPayments, setLinkedPayments] = useState<string[]>(() => {
    const savedPayments = localStorage.getItem('cobaco_linked_payments');
    if (savedPayments) {
      try {
        return JSON.parse(savedPayments);
      } catch (e) {
        console.error('Failed to parse linked payments', e);
      }
    }
    return [];
  });

  // バッジ関連のステート
  const [unlockedBadges, setUnlockedBadges] = useState<UserBadge[]>([]);
  const [badgeToasts, setBadgeToasts] = useState<{ id: string; badgeName: string }[]>([]);



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

  // ストリークの動的計算 (今日から遡ってコンビニを利用していない日数を数える)
  const checkStreak = (receiptsData: Receipt[], baseDateStr?: string): { currentStreak: number; lastConviniDate: string | null } => {
    if (receiptsData.length === 0) {
      return { currentStreak: 0, lastConviniDate: null };
    }

    // 各レシートの日付をローカルタイムゾーン (YYYY-MM-DD) に変換した Set を作る
    const usedDates = new Set(receiptsData.map(r => {
      const d = new Date(r.date);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${date}`;
    }));
    
    // 日付順に降順ソートされたレシートから、最新のコンビニ利用日を取得
    const sortedReceipts = [...receiptsData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastConviniD = new Date(sortedReceipts[0].date);
    const lastConviniDate = `${lastConviniD.getFullYear()}-${String(lastConviniD.getMonth() + 1).padStart(2, '0')}-${String(lastConviniD.getDate()).padStart(2, '0')}`;

    let currentStreak = 0;
    
    // 基準日を決定 (引数がなければ実際の今日)
    let checkDate: Date;
    if (baseDateStr) {
      checkDate = new Date(`${baseDateStr}T12:00:00`);
    } else {
      checkDate = new Date();
      checkDate.setHours(12, 0, 0, 0); // タイムゾーンずれを防ぐため昼12時
    }

    while (true) {
      const y = checkDate.getFullYear();
      const m = String(checkDate.getMonth() + 1).padStart(2, '0');
      const date = String(checkDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${date}`;

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

  // トースト通知を表示する関数
  const showBadgeToast = (badgeName: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setBadgeToasts(prev => [...prev, { id, badgeName }]);
    setTimeout(() => {
      setBadgeToasts(prev => prev.filter(t => t.id !== id));
    }, 3200); // 3.2秒後に消去 (フェードアウト完了後)
  };

  // Supabaseから解除済みバッジ一覧を取得する
  const fetchUnlockedBadges = async (): Promise<UserBadge[]> => {
    if (!session) return [];
    try {
      const { data, error } = await supabase
        .from('badges')
        .select('*')
        .eq('user_id', session.user.id);

      if (error) throw error;
      setUnlockedBadges(data || []);
      return data || [];
    } catch (e) {
      console.error('Failed to fetch unlocked badges from Supabase', e);
      return [];
    }
  };

  // 全バッジの解除条件をチェックして同期・トースト表示を行う
  const checkAndUnlockBadges = async (
    currentReceipts: Receipt[],
    currentStreak: number,
    currentSpendingGoal: SpendingGoal,
    currentLinkedPayments: string[],
    existingBadges: UserBadge[]
  ) => {
    if (!session) return;

    // 今月の定義は 2026-05
    const thisMonthReceipts = currentReceipts.filter(r => r.date.startsWith('2026-05'));
    const currentAmount = thisMonthReceipts.reduce((sum, r) => sum + r.amount, 0);
    const currentCount = thisMonthReceipts.length;

    // 衝動買いスコアの計算
    const impulseCount = thisMonthReceipts.filter(r => r.isImpulse).length;
    const lateNightCount = thisMonthReceipts.filter(r => {
      const hour = new Date(r.date).getHours();
      return hour >= 22 || hour < 5;
    }).length;

    let impulseScore = 0;
    if (currentCount > 0) {
      const ratioScore = (impulseCount / currentCount) * 80;
      const penaltyScore = Math.min(lateNightCount * 10, 20);
      impulseScore = Math.min(Math.round(ratioScore + penaltyScore), 100);
    }

    // 各バッジの獲得条件を定義
    const badgeChecks = [
      {
        key: 'first_scan',
        name: '初回スキャン達成',
        isUnlocked: currentReceipts.length >= 1
      },
      {
        key: 'first_goal_achieved',
        name: '初回目標達成',
        isUnlocked: currentReceipts.length >= 1 && currentAmount <= currentSpendingGoal.monthlyAmountLimit && currentCount <= currentSpendingGoal.monthlyCountLimit
      },
      {
        key: 'streak_3',
        name: 'コンビニ断ち3日達成',
        isUnlocked: currentStreak >= 3
      },
      {
        key: 'streak_7',
        name: '7日連続達成',
        isUnlocked: currentStreak >= 7
      },
      {
        key: 'impulse_control',
        name: '衝動買いスコア50以下',
        isUnlocked: currentReceipts.length > 0 && impulseScore <= 50
      },
      {
        key: 'monthly_budget',
        name: '月間目標達成',
        isUnlocked: thisMonthReceipts.length > 0 && currentAmount <= currentSpendingGoal.monthlyAmountLimit
      },
      {
        key: 'cashless_expert',
        name: 'キャッシュレス連携達人',
        isUnlocked: currentLinkedPayments.length >= 1
      }
    ];

    const existingKeys = new Set(existingBadges.map(b => b.badge_key));
    const newlyUnlocked = badgeChecks.filter(b => b.isUnlocked && !existingKeys.has(b.key));

    if (newlyUnlocked.length > 0) {
      const inserts = newlyUnlocked.map(b => ({
        user_id: session.user.id,
        badge_key: b.key,
        unlocked_at: new Date().toISOString()
      }));

      try {
        const { data, error } = await supabase
          .from('badges')
          .insert(inserts)
          .select();

        if (error) throw error;

        // 解除済みバッジリストの更新
        const updatedBadges = [...existingBadges, ...(data || [])];
        setUnlockedBadges(updatedBadges);

        // 新規獲得トーストを表示（1つずつずらして出す）
        newlyUnlocked.forEach((badge, index) => {
          setTimeout(() => {
            showBadgeToast(badge.name);
          }, index * 800);
        });
      } catch (e) {
        console.error('Failed to insert unlocked badges', e);
      }
    }
  };

  // ストリーク情報の取得とSupabase同期
  const fetchAndSyncStreak = async (currentReceipts: Receipt[]): Promise<Streak> => {
    const defaultStreak = { currentStreak: 0, bestStreak: 0, lastConviniDate: null };
    if (!session) return defaultStreak;
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
          }, { onConflict: 'user_id' });

        if (upsertError) throw upsertError;
      }

      const updatedStreak = {
        currentStreak,
        bestStreak: newBest,
        lastConviniDate
      };

      setStreak(updatedStreak);

      // 5. 祝福モーダル判定
      checkMilestones(currentStreak);

      return updatedStreak;
    } catch (e) {
      console.error('Failed to sync streak with Supabase', e);
      return defaultStreak;
    }
  };

  // Supabaseから履歴一覧を取得する
  const fetchReceipts = async (): Promise<{ receipts: Receipt[]; streak: Streak }> => {
    const defaultVal = { receipts: [], streak: { currentStreak: 0, bestStreak: 0, lastConviniDate: null } };
    if (!session) return defaultVal;
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
      const updatedStreak = await fetchAndSyncStreak(mapped);
      return { receipts: mapped, streak: updatedStreak };
    } catch (e) {
      console.error('Failed to fetch receipts from Supabase', e);
      return defaultVal;
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
      const initLoad = async () => {
        setIsLoading(true);
        try {
          // データのフェッチ
          const { receipts: receiptsData, streak: streakData } = await fetchReceipts();
          const badgesData = await fetchUnlockedBadges();
          await fetchSavingsGoals();
          await fetchBaseSavings();
          
          // 初回バッジチェック
          await checkAndUnlockBadges(receiptsData, streakData.currentStreak, spendingGoal, linkedPayments, badgesData);
        } catch (e) {
          console.error('Failed during initial load data sync', e);
        } finally {
          setIsLoading(false);
        }
      };
      initLoad();
    } else {
      setReceipts([]);
      setSavingsGoals([]);
      setUnlockedBadges([]);
      setMonthlyBaseSavings(5000);
      setMonthlyIncome(null);
      setStreak({ currentStreak: 0, bestStreak: 0, lastConviniDate: null });
      setIsLoading(false);
    }
  }, [session]);


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
      const { receipts: r, streak: s } = await fetchReceipts();
      const b = await fetchUnlockedBadges();
      await checkAndUnlockBadges(r, s.currentStreak, spendingGoal, linkedPayments, b);
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
      const { receipts: r, streak: s } = await fetchReceipts();
      const b = await fetchUnlockedBadges();
      await checkAndUnlockBadges(r, s.currentStreak, spendingGoal, linkedPayments, b);
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
      const { receipts: r, streak: s } = await fetchReceipts();
      const b = await fetchUnlockedBadges();
      await checkAndUnlockBadges(r, s.currentStreak, spendingGoal, linkedPayments, b);
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
  const handleUpdateSpendingGoal = async (newGoal: SpendingGoal) => {
    setSpendingGoal(newGoal);
    localStorage.setItem('cobaco_spending_goal', JSON.stringify(newGoal));
    triggerNotification('節約目標を更新しました 🎯');
    
    // バッジチェック
    const b = await fetchUnlockedBadges();
    await checkAndUnlockBadges(receipts, streak.currentStreak, newGoal, linkedPayments, b);
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

      // バッジチェック
      const b = await fetchUnlockedBadges();
      await checkAndUnlockBadges(receipts, streak.currentStreak, spendingGoal, linkedPayments, b);
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

      // バッジチェック
      const b = await fetchUnlockedBadges();
      await checkAndUnlockBadges(receipts, streak.currentStreak, spendingGoal, linkedPayments, b);
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
      const { receipts: r, streak: s } = await fetchReceipts();
      const b = await fetchUnlockedBadges();
      await checkAndUnlockBadges(r, s.currentStreak, spendingGoal, updatedPayments, b);
    } catch (e) {
      console.error('Failed to insert mock linked receipts to Supabase', e);
    }
  };

  // TODO: remove before production release
  const handleInjectDemoData = async () => {
    if (!session) return;
    
    const confirmInject = window.confirm("デモデータを投入しますか？既存のデータは削除されません。");
    if (!confirmInject) return;

    try {
      setIsLoading(true);

      // --- 1. receipts 過去3ヶ月分・計45件の生成 ---
      const baseDate = new Date();
      const demoReceipts: any[] = [];

      // 45件を月ごとに分散
      // 3ヶ月前 (3月): 15件
      // 2ヶ月前 (4月): 14件
      // 先月 (5月): 12件
      // 今月 (6月): 4件 (計45件)
      const monthsBack = [
        { offset: 3, count: 15, minPrice: 400, maxPrice: 1200 },
        { offset: 2, count: 14, minPrice: 300, maxPrice: 900 },
        { offset: 1, count: 12, minPrice: 200, maxPrice: 800 },
        { offset: 0, count: 4, minPrice: 300, maxPrice: 600 }
      ];

      const storeNames = ['セブンイレブン', 'ファミリーマート', 'ローソン'];
      const itemsPresets = [
        ['生茶 500ml', '鮭おにぎり', 'サラダチキン'],
        ['黒烏龍茶', 'カツサンド', '大きなエクレア'],
        ['カップヌードル', 'コカ・コーラ 500ml', 'ポテトチップス'],
        ['明治ブルガリアヨーグルト', 'バナナ', '牛乳 1L'],
        ['モンスターエナジー', 'Lチキ レギュラー', 'おしゃぶり昆布'],
        ['お～いお茶', '幕の内弁当', '宇治抹茶ラテ']
      ];

      monthsBack.forEach(({ offset, count, minPrice, maxPrice }) => {
        const year = baseDate.getFullYear();
        const month = baseDate.getMonth() - offset;
        
        for (let i = 0; i < count; i++) {
          const randomDay = Math.floor(Math.random() * 28) + 1;
          
          // 時間帯の分散
          const timeRand = Math.random();
          let hour = 12;
          if (timeRand < 0.20) {
            hour = Math.floor(Math.random() * 3) + 7; // 7, 8, 9
          } else if (timeRand < 0.50) {
            hour = Math.floor(Math.random() * 2) + 12; // 12, 13
          } else if (timeRand < 0.75) {
            hour = Math.floor(Math.random() * 3) + 17; // 17, 18, 19
          } else {
            const midnightHours = [23, 0, 1, 2];
            hour = midnightHours[Math.floor(Math.random() * midnightHours.length)];
          }

          const minute = Math.floor(Math.random() * 60);
          
          const d = new Date(year, month, randomDay, hour, minute, 0);
          const tzOffset = d.getTimezoneOffset() * 60000;
          const localISO = new Date(d.getTime() - tzOffset).toISOString().slice(0, 19) + '+09:00'; // 日本時間 +09:00

          const amount = Math.floor((Math.random() * (maxPrice - minPrice) + minPrice) / 10) * 10;
          const storeName = storeNames[Math.floor(Math.random() * storeNames.length)] + ' デモ店舗';
          const items = itemsPresets[Math.floor(Math.random() * itemsPresets.length)];

          const isImpulse = amount >= 1000 || hour >= 22 || hour < 5;
          const impulseReasons: string[] = [];
          if (hour >= 22 || hour < 5) impulseReasons.push('深夜利用');
          if (amount >= 1000) impulseReasons.push('高額支出');

          demoReceipts.push({
            user_id: session.user.id,
            store_name: storeName,
            amount: amount,
            items: { list: items, isImpulse, impulseReasons },
            used_at: localISO
          });
        }
      });

      // DB への挿入
      const { error: receiptsError } = await supabase
        .from('usage_history')
        .insert(demoReceipts);
      if (receiptsError) throw receiptsError;

      // --- 2. wish_list の生成 ---
      const demoWishList = [
        { user_id: session.user.id, name: 'AirPods Pro', price: 39800, current_savings: 12000 },
        { user_id: session.user.id, name: 'Nintendo Switch', price: 32978, current_savings: 8000 },
        { user_id: session.user.id, name: '旅行（沖縄）', price: 80000, current_savings: 25000 }
      ];

      const { error: wishListError } = await supabase
        .from('wish_list')
        .insert(demoWishList);
      if (wishListError) throw wishListError;

      // --- 3. user_settings の UPSERT ---
      const { error: settingsError } = await supabase
        .from('user_settings')
        .upsert({
          user_id: session.user.id,
          monthly_base_savings: 15000,
          monthly_income: 250000,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      if (settingsError) throw settingsError;

      // --- 4. streaks の UPSERT ---
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const lastConviniDateStr = `${threeDaysAgo.getFullYear()}-${String(threeDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(threeDaysAgo.getDate()).padStart(2, '0')}`;

      const { error: streaksError } = await supabase
        .from('streaks')
        .upsert({
          user_id: session.user.id,
          current_streak: 5,
          best_streak: 12,
          last_convini_date: lastConviniDateStr,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      if (streaksError) throw streaksError;

      // --- 5. フロント側のローカルストレージ (spendingGoal等) の更新 ---
      const demoSpendingGoal = { monthlyAmountLimit: 10000, monthlyCountLimit: 12 };
      setSpendingGoal(demoSpendingGoal);
      localStorage.setItem('cobaco_spending_goal', JSON.stringify(demoSpendingGoal));

      // データの再フェッチと同期
      const { receipts: r, streak: s } = await fetchReceipts();
      const b = await fetchUnlockedBadges();
      await fetchSavingsGoals();
      await fetchBaseSavings();
      await checkAndUnlockBadges(r, s.currentStreak, demoSpendingGoal, linkedPayments, b);

      triggerNotification('✅ デモデータを投入しました。ページを更新してください。');
      alert('✅ デモデータを投入しました。ページを更新してください。');
    } catch (e: any) {
      console.error('Failed to inject demo data', e);
      const errMsg = e?.message || JSON.stringify(e);
      triggerNotification('❌ デモデータの投入に失敗しました');
      alert('❌ デモデータの投入に失敗しました:\n' + errMsg);
    } finally {
      setIsLoading(false);
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
              <BadgesView unlockedBadges={unlockedBadges} />
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

            {/* 開発者メニュー */}
            {/* TODO: remove before production release */}
            {session.user.email?.toLowerCase() === 's24g1115nm@chibatech.ac.jp' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '0.5px solid var(--ios-border)', paddingTop: '16px', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--ios-red)', fontWeight: 800 }}>開発者メニュー</span>
                <button
                  onClick={handleInjectDemoData}
                  className="ios-btn"
                  style={{ width: '100%', backgroundColor: 'var(--ios-red)', color: '#FFFFFF' }}
                >
                  ⚠️ デモデータを投入する（既存データは残ります）
                </button>
              </div>
            )}

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

      {/* バッジ新規獲得トースト通知 */}
      <div className="badge-toast-container">
        {badgeToasts.map(toast => (
          <div key={toast.id} className="badge-toast">
            <span>🎉</span>
            <span>バッジ獲得：{toast.badgeName}</span>
          </div>
        ))}
      </div>

      {/* ホームインジケータ */}
      <div className="phone-home-indicator"></div>
    </div>
  );
}

export default App;
