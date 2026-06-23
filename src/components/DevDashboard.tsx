// TODO: remove before production release - dev only
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

type TabType = 'receipts' | 'wish_list' | 'user_settings' | 'streaks' | 'badges';

interface DevDashboardProps {}

const DevDashboard: React.FC<DevDashboardProps> = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('receipts');
  
  // 各種テーブルデータ
  const [receipts, setReceipts] = useState<any[]>([]);
  const [wishList, setWishList] = useState<any[]>([]);
  const [userSettings, setUserSettings] = useState<any>({
    monthly_base_savings: 5000,
    monthly_income: null,
    monthly_budget: 10000,
    reduction_rate: 30
  });
  const [streak, setStreak] = useState<any>({
    current_streak: 0,
    best_streak: 0,
    last_convini_date: null
  });
  const [badges, setBadges] = useState<any[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // ページネーション用ステート
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(receipts.length / itemsPerPage);

  // タブ切り替え時にページを1に戻す
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  // レシート削除等により総ページ数が減った場合の自動補正
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [receipts.length, totalPages, currentPage]);

  // 認証情報の取得
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // データフェッチ
  const fetchAllData = async () => {
    if (!session) return;
    const userId = session.user.id;

    // 1. Receipts (usage_history)
    const { data: receiptsData } = await supabase
      .from('usage_history')
      .select('*')
      .eq('user_id', userId)
      .order('used_at', { ascending: false });
    setReceipts(receiptsData || []);

    // 2. Wish list
    const { data: wishListData } = await supabase
      .from('wish_list')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    setWishList(wishListData || []);

    // 3. User settings
    const { data: settingsData } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    // settingsData から monthly_budget と reduction_rate を localStorage から同期
    const savedSpending = localStorage.getItem('cobaco_spending_goal');
    let monthlyBudget = 10000;
    let reductionRate = 30;
    if (savedSpending) {
      try {
        const parsed = JSON.parse(savedSpending);
        monthlyBudget = parsed.monthlyAmountLimit || 10000;
        // 削減率はGoalsView等で使われるのでデフォルト30
      } catch (e) {
        console.error(e);
      }
    }

    setUserSettings({
      monthly_base_savings: settingsData?.monthly_base_savings ?? 5000,
      monthly_income: settingsData?.monthly_income ?? 250000,
      monthly_budget: monthlyBudget,
      reduction_rate: reductionRate
    });

    // 4. Streaks
    const { data: streaksData } = await supabase
      .from('streaks')
      .select('*')
      .eq('user_id', userId)
      .single();
    setStreak({
      current_streak: streaksData?.current_streak ?? 0,
      best_streak: streaksData?.best_streak ?? 0,
      last_convini_date: streaksData?.last_convini_date ?? ''
    });

    // 5. Badges
    const { data: badgesData } = await supabase
      .from('badges')
      .select('*')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: true });
    setBadges(badgesData || []);
  };

  useEffect(() => {
    if (session) {
      fetchAllData();
    }
  }, [session, activeTab]);

  if (!session) {
    return (
      <div style={{ padding: '40px', color: '#FFF', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>⚠️ 未ログイン状態です</h2>
        <p>ホーム画面からテストアカウントでログインした後、このページをリロードしてください。</p>
        <p><a href="/" style={{ color: '#34C759', fontWeight: 'bold' }}>ホーム画面へ戻る</a></p>
      </div>
    );
  }

  const userId = session.user.id;

  // --- receipts一括操作・CRUD ---
  const handleAddReceipt = async () => {
    const offset = new Date().getTimezoneOffset() * 60000;
    const nowStr = new Date(Date.now() - offset).toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
    const { error } = await supabase
      .from('usage_history')
      .insert({
        user_id: userId,
        store_name: '新規店舗',
        amount: 500,
        items: { list: ['デモ商品'], isImpulse: false, impulseReasons: [] },
        used_at: nowStr + '+09:00'
      });
    if (error) alert('追加エラー: ' + error.message);
    fetchAllData();
  };

  const handleUpdateReceiptField = async (id: string, fieldName: string, value: any) => {
    // receipts の state をローカルで更新して即座にインプットに反映
    setReceipts(prev => prev.map(r => r.id === id ? { ...r, [fieldName]: value } : r));

    // Supabaseへの書き込み
    let updateVal = value;
    if (fieldName === 'amount') updateVal = parseInt(value, 10) || 0;
    if (fieldName === 'items') {
      const itemsList = value.split(',').map((x: string) => x.trim()).filter((x: string) => x.length > 0);
      const isImpulse = parseInt(value) >= 1000; // 金額での衝動買いなど
      updateVal = { list: itemsList, isImpulse, impulseReasons: isImpulse ? ['高額支出'] : [] };
    }

    const colName = fieldName === 'items' ? 'items' : fieldName === 'date' ? 'used_at' : fieldName;

    const { error } = await supabase
      .from('usage_history')
      .update({ [colName]: updateVal })
      .eq('id', id);

    if (error) console.error('Update error:', error);
  };

  const handleDeleteReceipt = async (id: string) => {
    const { error } = await supabase
      .from('usage_history')
      .delete()
      .eq('id', id);
    if (error) alert('削除エラー: ' + error.message);
    fetchAllData();
  };

  const generateDemoReceipts = async () => {
    const baseDate = new Date();
    const demoReceipts: any[] = [];
    const monthsBack = [
      { offset: 3, count: 12, minPrice: 400, maxPrice: 1200 },
      { offset: 2, count: 9, minPrice: 300, maxPrice: 900 },
      { offset: 1, count: 7, minPrice: 200, maxPrice: 800 },
      { offset: 0, count: 3, minPrice: 300, maxPrice: 600 }
    ];

    const storeNames = ['セブンイレブン', 'ファミリーマート', 'ローソン'];
    const itemsPresets = [
      ['鮭おにぎり', 'お茶 500ml'],
      ['カツサンド', 'コーヒー'],
      ['カップヌードル', '炭酸飲料'],
      ['サンドイッチ', 'カフェラテ']
    ];

    monthsBack.forEach(({ offset, count, minPrice, maxPrice }) => {
      const year = baseDate.getFullYear();
      const month = baseDate.getMonth() - offset;
      for (let i = 0; i < count; i++) {
        const randomDay = Math.floor(Math.random() * 28) + 1;
        
        const timeRand = Math.random();
        let hour = 12;
        if (timeRand < 0.20) {
          hour = Math.floor(Math.random() * 3) + 7;
        } else if (timeRand < 0.50) {
          hour = Math.floor(Math.random() * 2) + 12;
        } else if (timeRand < 0.75) {
          hour = Math.floor(Math.random() * 3) + 17;
        } else {
          const midnightHours = [23, 0, 1, 2];
          hour = midnightHours[Math.floor(Math.random() * midnightHours.length)];
        }
        const minute = Math.floor(Math.random() * 60);
        
        const d = new Date(year, month, randomDay, hour, minute, 0);
        const tzOffset = d.getTimezoneOffset() * 60000;
        const localISO = new Date(d.getTime() - tzOffset).toISOString().slice(0, 19) + '+09:00';

        const amount = Math.floor((Math.random() * (maxPrice - minPrice) + minPrice) / 10) * 10;
        const storeName = storeNames[Math.floor(Math.random() * storeNames.length)];
        const items = itemsPresets[Math.floor(Math.random() * itemsPresets.length)];
        const isImpulse = amount >= 1000 || hour >= 22 || hour < 5;

        demoReceipts.push({
          user_id: userId,
          store_name: storeName,
          amount: amount,
          items: { list: items, isImpulse, impulseReasons: isImpulse ? (hour >= 22 || hour < 5 ? ['深夜利用'] : ['高額支出']) : [] },
          used_at: localISO
        });
      }
    });

    const { error } = await supabase
      .from('usage_history')
      .insert(demoReceipts);
    if (error) alert('デモレシート追加失敗: ' + error.message);
    fetchAllData();
  };

  const deleteThisMonthReceipts = async () => {
    const d = new Date();
    const startOfMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01T00:00:00+09:00`;
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const endOfMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01T00:00:00+09:00`;

    const { error } = await supabase
      .from('usage_history')
      .delete()
      .eq('user_id', userId)
      .gte('used_at', startOfMonth)
      .lt('used_at', endOfMonth);

    if (error) alert('今月削除失敗: ' + error.message);
    fetchAllData();
  };

  const deleteAllReceipts = async () => {
    if (!window.confirm('本当にすべてのレシート履歴を削除しますか？')) return;
    const { error } = await supabase
      .from('usage_history')
      .delete()
      .eq('user_id', userId);
    if (error) alert('全削除失敗: ' + error.message);
    fetchAllData();
  };

  // --- wish_list CRUD ---
  const handleAddWish = async () => {
    const { error } = await supabase
      .from('wish_list')
      .insert({
        user_id: userId,
        name: '新しいアイテム',
        price: 10000,
        current_savings: 0
      });
    if (error) alert('追加失敗: ' + error.message);
    fetchAllData();
  };

  const handleUpdateWishField = async (id: string, fieldName: string, value: any) => {
    setWishList(prev => prev.map(w => w.id === id ? { ...w, [fieldName]: value } : w));
    let updateVal = value;
    if (fieldName === 'price' || fieldName === 'current_savings') {
      updateVal = parseInt(value, 10) || 0;
    }
    const { error } = await supabase
      .from('wish_list')
      .update({ [fieldName]: updateVal })
      .eq('id', id);
    if (error) console.error(error);
  };

  const handleDeleteWish = async (id: string) => {
    const { error } = await supabase
      .from('wish_list')
      .delete()
      .eq('id', id);
    if (error) alert('削除失敗: ' + error.message);
    fetchAllData();
  };

  const injectWishPresets = async () => {
    const presets = [
      { user_id: userId, name: 'AirPods Pro', price: 39800, current_savings: 12000 },
      { user_id: userId, name: 'Nintendo Switch', price: 32978, current_savings: 8000 },
      { user_id: userId, name: '旅行（沖縄）', price: 80000, current_savings: 25000 }
    ];
    const { error } = await supabase
      .from('wish_list')
      .insert(presets);
    if (error) alert('プリセット追加失敗: ' + error.message);
    fetchAllData();
  };

  const deleteAllWishItems = async () => {
    if (!window.confirm('本当にすべての欲しいものアイテムを削除しますか？')) return;
    const { error } = await supabase
      .from('wish_list')
      .delete()
      .eq('user_id', userId);
    if (error) alert('全削除失敗: ' + error.message);
    fetchAllData();
  };

  // --- user_settings CRUD ---
  const handleSaveSettings = async () => {
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        monthly_base_savings: parseInt(userSettings.monthly_base_savings, 10) || 0,
        monthly_income: parseInt(userSettings.monthly_income, 10) || 0,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) {
      alert('保存失敗: ' + error.message);
      return;
    }

    // localStorage と localState にも budget を保存
    const goal = {
      monthlyAmountLimit: parseInt(userSettings.monthly_budget, 10) || 0,
      monthlyCountLimit: 12 // 固定
    };
    localStorage.setItem('cobaco_spending_goal', JSON.stringify(goal));

    alert('✅ 設定を保存しました。');
    fetchAllData();
  };

  const applySettingsPreset = async (mode: 'low' | 'normal' | 'high') => {
    let income = 250000;
    let budget = 10000;
    let savings = 15000;
    let reduction = 30;

    if (mode === 'low') {
      income = 180000;
      budget = 8000;
      savings = 5000;
      reduction = 10;
    } else if (mode === 'high') {
      income = 500000;
      budget = 20000;
      savings = 50000;
      reduction = 50;
    }

    setUserSettings({
      monthly_base_savings: savings,
      monthly_income: income,
      monthly_budget: budget,
      reduction_rate: reduction
    });

    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        monthly_base_savings: savings,
        monthly_income: income,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) {
      alert('プリセット設定失敗: ' + error.message);
      return;
    }

    localStorage.setItem('cobaco_spending_goal', JSON.stringify({
      monthlyAmountLimit: budget,
      monthlyCountLimit: 12
    }));

    alert(`✅ ${mode === 'low' ? '低収入' : mode === 'high' ? '高収入' : '標準'}モードに設定しました。`);
    fetchAllData();
  };

  // --- streaks CRUD ---
  const handleSaveStreak = async (newStreak: any) => {
    setStreak(newStreak);
    const { error } = await supabase
      .from('streaks')
      .upsert({
        user_id: userId,
        current_streak: parseInt(newStreak.current_streak, 10) || 0,
        best_streak: parseInt(newStreak.best_streak, 10) || 0,
        last_convini_date: newStreak.last_convini_date || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    if (error) console.error(error);
  };

  const applyStreakPreset = async (days: number) => {
    let lastDate: string | null = null;
    if (days > 0) {
      const d = new Date();
      d.setDate(d.getDate() - days);
      lastDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    const nextStreak = {
      current_streak: days,
      best_streak: Math.max(streak.best_streak, days),
      last_convini_date: lastDate
    };
    await handleSaveStreak(nextStreak);
    alert(`✅ ストリークを ${days}日 に設定しました。`);
  };

  // --- badges CRUD ---
  const handleUnlockBadge = async (badgeKey: string) => {
    if (badges.some(b => b.badge_key === badgeKey)) {
      alert('このバッジは既に獲得済みです。');
      return;
    }
    const { error } = await supabase
      .from('badges')
      .insert({
        user_id: userId,
        badge_key: badgeKey,
        unlocked_at: new Date().toISOString()
      });
    if (error) alert('付与失敗: ' + error.message);
    fetchAllData();
  };

  const handleDeleteBadge = async (id: string) => {
    const { error } = await supabase
      .from('badges')
      .delete()
      .eq('id', id);
    if (error) alert('バッジ削除失敗: ' + error.message);
    fetchAllData();
  };

  const unlockAllBadges = async () => {
    const keys = ['first_scan', 'first_goal_achieved', 'streak_3', 'streak_7', 'impulse_control', 'monthly_budget', 'cashless_expert'];
    const existing = new Set(badges.map(b => b.badge_key));
    const toInsert = keys.filter(k => !existing.has(k)).map(k => ({
      user_id: userId,
      badge_key: k,
      unlocked_at: new Date().toISOString()
    }));

    if (toInsert.length === 0) {
      alert('すべてのバッジは既に付与されています。');
      return;
    }

    const { error } = await supabase
      .from('badges')
      .insert(toInsert);
    if (error) alert('一括付与失敗: ' + error.message);
    fetchAllData();
  };

  const resetAllBadges = async () => {
    if (!window.confirm('本当にすべてのバッジをリセットしますか？')) return;
    const { error } = await supabase
      .from('badges')
      .delete()
      .eq('user_id', userId);
    if (error) alert('リセット失敗: ' + error.message);
    fetchAllData();
  };

  // --- 全テーブル一括操作 ---
  const handleResetAllTablesAndInjectDemo = async () => {

    try {
      // 1. 全削除
      await supabase.from('usage_history').delete().eq('user_id', userId);
      await supabase.from('wish_list').delete().eq('user_id', userId);
      await supabase.from('badges').delete().eq('user_id', userId);
      
      // 2. Receiptsデモ生成
      await generateDemoReceipts();

      // 3. Wishプリセット生成
      const presets = [
        { user_id: userId, name: 'AirPods Pro', price: 39800, current_savings: 12000 },
        { user_id: userId, name: 'Nintendo Switch', price: 32978, current_savings: 8000 },
        { user_id: userId, name: '旅行（沖縄）', price: 80000, current_savings: 25000 }
      ];
      await supabase.from('wish_list').insert(presets);

      // 4. Streaksデモ
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const lastConviniDateStr = `${threeDaysAgo.getFullYear()}-${String(threeDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(threeDaysAgo.getDate()).padStart(2, '0')}`;
      await supabase.from('streaks').upsert({
        user_id: userId,
        current_streak: 5,
        best_streak: 12,
        last_convini_date: lastConviniDateStr,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

      // 5. User settingsデモ (標準モード)
      await supabase.from('user_settings').upsert({
        user_id: userId,
        monthly_base_savings: 15000,
        monthly_income: 250000,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

      localStorage.setItem('cobaco_spending_goal', JSON.stringify({
        monthlyAmountLimit: 10000,
        monthlyCountLimit: 12
      }));

      alert('✅ デモデータを投入しました。ホームに戻って確認してください。');
      window.location.href = '/';
    } catch (e) {
      alert('一括処理に失敗しました。');
    }
  };

  return (
    <div style={{
      height: '100vh',
      overflowY: 'auto',
      backgroundColor: '#121214',
      color: '#ECECEE',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '24px 16px',
      boxSizing: 'border-box'
    }}>
      {/* 共通ヘッダー */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto 20px auto',
        borderBottom: '1px solid #2C2C2E',
        paddingBottom: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: '#34C759' }}>開発用データ管理ダッシュボード</h1>
            <span style={{ fontSize: '11px', color: '#8E8E93', wordBreak: 'break-all' }}>現在ログイン中のユーザーID: {userId}</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {showResetConfirm ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', backgroundColor: '#2C2C2E', padding: '8px 12px', borderRadius: '8px', border: '1px solid #FF3B30' }}>
                <span style={{ fontSize: '12px', color: '#FF3B30', fontWeight: '700' }}>本当に実行しますか？</span>
                <button
                  onClick={() => { setShowResetConfirm(false); handleResetAllTablesAndInjectDemo(); }}
                  style={{ backgroundColor: '#FF3B30', color: '#FFF', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                >
                  はい、実行する
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  style={{ backgroundColor: '#3A3A3C', color: '#FFF', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowResetConfirm(true)}
                style={{
                  backgroundColor: '#FF3B30',
                  color: '#FFF',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                ⚠️ 全テーブルリセット＋デモデータ投入
              </button>
            )}
            <a
              href="/"
              style={{
                backgroundColor: '#2C2C2E',
                color: '#34C759',
                padding: '10px 16px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '700',
                textDecoration: 'none',
                border: '1px solid #34C759'
              }}
            >
              ホームに戻る 🏠
            </a>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* ナビゲーションタブ */}
        <div style={{
          display: 'flex',
          backgroundColor: '#1C1C1E',
          padding: '4px',
          borderRadius: '10px',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          gap: '4px'
        }}>
          {([
            { key: 'receipts', label: 'receipts（レシート履歴）' },
            { key: 'wish_list', label: 'wish_list（欲しいもの）' },
            { key: 'user_settings', label: 'user_settings（設定）' },
            { key: 'streaks', label: 'streaks（ストリーク）' },
            { key: 'badges', label: 'badges（バッジ）' }
          ] as const).map(t => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  flex: 1,
                  background: isActive ? '#34C759' : 'transparent',
                  border: 'none',
                  color: isActive ? '#FFF' : '#8E8E93',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* タブコンテンツ */}
        <div style={{ backgroundColor: '#1C1C1E', padding: '20px', borderRadius: '16px', border: '1px solid #2C2C2E' }}>
          
          {/* receiptsタブ */}
          {activeTab === 'receipts' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={generateDemoReceipts} style={{ backgroundColor: '#2C2C2E', border: '1px solid #34C759', color: '#34C759', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                    過去3ヶ月のデモデータを生成
                  </button>
                  <button onClick={deleteThisMonthReceipts} style={{ backgroundColor: '#2C2C2E', border: '1px solid #FF9500', color: '#FF9500', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                    今月のデータを全削除
                  </button>
                  <button onClick={deleteAllReceipts} style={{ backgroundColor: '#2C2C2E', border: '1px solid #FF3B30', color: '#FF3B30', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                    全データを削除
                  </button>
                </div>
                <button onClick={handleAddReceipt} style={{ backgroundColor: '#34C759', color: '#FFF', border: 'none', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                  ＋ 新規追加
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left', minWidth: '800px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2C2C2E', color: '#8E8E93' }}>
                      <th style={{ padding: '10px 8px' }}>id</th>
                      <th style={{ padding: '10px 8px' }}>date (JST)</th>
                      <th style={{ padding: '10px 8px' }}>amount (¥)</th>
                      <th style={{ padding: '10px 8px' }}>store_name</th>
                      <th style={{ padding: '10px 8px' }}>items / memo (カンマ区切り)</th>
                      <th style={{ padding: '10px 8px', width: '80px' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(r => {
                      const dateLocal = r.used_at ? r.used_at.substring(0, 16) : '';
                      const itemsStr = r.items?.list ? r.items.list.join(', ') : '';

                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid #2C2C2E' }}>
                          <td style={{ padding: '8px', color: '#8E8E93', fontFamily: 'monospace' }}>{r.id.substring(0, 8)}...</td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="datetime-local"
                              value={dateLocal}
                              onChange={(e) => setReceipts(prev => prev.map(pr => pr.id === r.id ? { ...pr, used_at: e.target.value } : pr))}
                              onBlur={(e) => handleUpdateReceiptField(r.id, 'date', e.target.value)}
                              style={{ backgroundColor: '#2C2C2E', border: '1px solid #3A3A3C', color: '#FFF', borderRadius: '4px', padding: '4px 6px', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="number"
                              value={r.amount}
                              onChange={(e) => setReceipts(prev => prev.map(pr => pr.id === r.id ? { ...pr, amount: e.target.value } : pr))}
                              onBlur={(e) => handleUpdateReceiptField(r.id, 'amount', e.target.value)}
                              style={{ backgroundColor: '#2C2C2E', border: '1px solid #3A3A3C', color: '#FFF', borderRadius: '4px', padding: '4px 6px', width: '80px', textAlign: 'right', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="text"
                              value={r.store_name}
                              onChange={(e) => setReceipts(prev => prev.map(pr => pr.id === r.id ? { ...pr, store_name: e.target.value } : pr))}
                              onBlur={(e) => handleUpdateReceiptField(r.id, 'store_name', e.target.value)}
                              style={{ backgroundColor: '#2C2C2E', border: '1px solid #3A3A3C', color: '#FFF', borderRadius: '4px', padding: '4px 6px', width: '120px', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="text"
                              value={itemsStr}
                              onChange={(e) => {
                                const newItems = { list: e.target.value.split(',') };
                                setReceipts(prev => prev.map(pr => pr.id === r.id ? { ...pr, items: newItems } : pr));
                              }}
                              onBlur={(e) => handleUpdateReceiptField(r.id, 'items', e.target.value)}
                              placeholder="商品A, 商品B..."
                              style={{ backgroundColor: '#2C2C2E', border: '1px solid #3A3A3C', color: '#FFF', borderRadius: '4px', padding: '4px 6px', width: '100%', boxSizing: 'border-box', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <button onClick={() => handleDeleteReceipt(r.id)} style={{ backgroundColor: '#FF3B30', color: '#FFF', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                              削除
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ページネーションコントロール */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '16px' }}>
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    style={{
                      backgroundColor: '#2C2C2E',
                      border: '1px solid #3A3A3C',
                      color: currentPage === 1 ? '#48484A' : '#34C759',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                      fontSize: '12px'
                    }}
                  >
                    ＜ 前へ
                  </button>
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                    ページ {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    style={{
                      backgroundColor: '#2C2C2E',
                      border: '1px solid #3A3A3C',
                      color: currentPage >= totalPages ? '#48484A' : '#34C759',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                      fontSize: '12px'
                    }}
                  >
                    次へ ＞
                  </button>
                </div>
              )}
            </div>
          )}

          {/* wish_listタブ */}
          {activeTab === 'wish_list' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={injectWishPresets} style={{ backgroundColor: '#2C2C2E', border: '1px solid #34C759', color: '#34C759', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                    サンプルデータを3件追加
                  </button>
                  <button onClick={deleteAllWishItems} style={{ backgroundColor: '#2C2C2E', border: '1px solid #FF3B30', color: '#FF3B30', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                    全データを削除
                  </button>
                </div>
                <button onClick={handleAddWish} style={{ backgroundColor: '#34C759', color: '#FFF', border: 'none', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                  ＋ 新規追加
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2C2C2E', color: '#8E8E93' }}>
                      <th style={{ padding: '10px 8px' }}>id</th>
                      <th style={{ padding: '10px 8px' }}>name</th>
                      <th style={{ padding: '10px 8px' }}>price (¥)</th>
                      <th style={{ padding: '10px 8px' }}>current_savings (¥)</th>
                      <th style={{ padding: '10px 8px', width: '80px' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wishList.map(w => (
                      <tr key={w.id} style={{ borderBottom: '1px solid #2C2C2E' }}>
                        <td style={{ padding: '8px', color: '#8E8E93', fontFamily: 'monospace' }}>{w.id.substring(0, 8)}...</td>
                        <td style={{ padding: '8px' }}>
                          <input
                            type="text"
                            value={w.name}
                            onChange={(e) => setWishList(prev => prev.map(pw => pw.id === w.id ? { ...pw, name: e.target.value } : pw))}
                            onBlur={(e) => handleUpdateWishField(w.id, 'name', e.target.value)}
                            style={{ backgroundColor: '#2C2C2E', border: '1px solid #3A3A3C', color: '#FFF', borderRadius: '4px', padding: '4px 6px', fontSize: '12px' }}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input
                            type="number"
                            value={w.price}
                            onChange={(e) => setWishList(prev => prev.map(pw => pw.id === w.id ? { ...pw, price: e.target.value } : pw))}
                            onBlur={(e) => handleUpdateWishField(w.id, 'price', e.target.value)}
                            style={{ backgroundColor: '#2C2C2E', border: '1px solid #3A3A3C', color: '#FFF', borderRadius: '4px', padding: '4px 6px', width: '100px', fontSize: '12px' }}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input
                            type="number"
                            value={w.current_savings}
                            onChange={(e) => setWishList(prev => prev.map(pw => pw.id === w.id ? { ...pw, current_savings: e.target.value } : pw))}
                            onBlur={(e) => handleUpdateWishField(w.id, 'current_savings', e.target.value)}
                            style={{ backgroundColor: '#2C2C2E', border: '1px solid #3A3A3C', color: '#FFF', borderRadius: '4px', padding: '4px 6px', width: '100px', fontSize: '12px' }}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <button onClick={() => handleDeleteWish(w.id)} style={{ backgroundColor: '#FF3B30', color: '#FFF', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* user_settingsタブ */}
          {activeTab === 'user_settings' && (
            <div style={{ maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => applySettingsPreset('low')} style={{ flex: 1, backgroundColor: '#2C2C2E', border: '1px solid #8E8E93', color: '#FFF', padding: '8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                  低収入モード
                </button>
                <button onClick={() => applySettingsPreset('normal')} style={{ flex: 1, backgroundColor: '#2C2C2E', border: '1px solid #34C759', color: '#34C759', padding: '8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                  標準モード
                </button>
                <button onClick={() => applySettingsPreset('high')} style={{ flex: 1, backgroundColor: '#2C2C2E', border: '1px solid #007AFF', color: '#007AFF', padding: '8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                  高収入モード
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', backgroundColor: '#2C2C2E', padding: '20px', borderRadius: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#8E8E93', marginBottom: '6px', fontWeight: 'bold' }}>月間予算 (monthly_budget)</label>
                  <input
                    type="number"
                    value={userSettings.monthly_budget}
                    onChange={(e) => setUserSettings((prev: any) => ({ ...prev, monthly_budget: e.target.value }))}
                    style={{ width: '100%', backgroundColor: '#1C1C1E', border: '1px solid #3A3A3C', color: '#FFF', borderRadius: '6px', padding: '10px', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#8E8E93', marginBottom: '6px', fontWeight: 'bold' }}>月間貯蓄目標 (monthly_base_savings)</label>
                  <input
                    type="number"
                    value={userSettings.monthly_base_savings}
                    onChange={(e) => setUserSettings((prev: any) => ({ ...prev, monthly_base_savings: e.target.value }))}
                    style={{ width: '100%', backgroundColor: '#1C1C1E', border: '1px solid #3A3A3C', color: '#FFF', borderRadius: '6px', padding: '10px', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#8E8E93', marginBottom: '6px', fontWeight: 'bold' }}>月間収入 (monthly_income)</label>
                  <input
                    type="number"
                    value={userSettings.monthly_income || ''}
                    onChange={(e) => setUserSettings((prev: any) => ({ ...prev, monthly_income: e.target.value }))}
                    style={{ width: '100%', backgroundColor: '#1C1C1E', border: '1px solid #3A3A3C', color: '#FFF', borderRadius: '6px', padding: '10px', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#8E8E93', marginBottom: '6px', fontWeight: 'bold' }}>削減率 (reduction_rate %)</label>
                  <select
                    value={userSettings.reduction_rate}
                    onChange={(e) => setUserSettings((prev: any) => ({ ...prev, reduction_rate: parseInt(e.target.value, 10) }))}
                    style={{ width: '100%', backgroundColor: '#1C1C1E', border: '1px solid #3A3A3C', color: '#FFF', borderRadius: '6px', padding: '10px', fontSize: '14px', boxSizing: 'border-box' }}
                  >
                    <option value={10}>10%</option>
                    <option value={20}>20%</option>
                    <option value={30}>30%</option>
                    <option value={50}>50%</option>
                  </select>
                </div>
                <button
                  onClick={handleSaveSettings}
                  style={{ backgroundColor: '#34C759', color: '#FFF', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}
                >
                  設定を保存
                </button>
              </div>
            </div>
          )}

          {/* streaksタブ */}
          {activeTab === 'streaks' && (
            <div style={{ maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => applyStreakPreset(0)} style={{ flex: 1, backgroundColor: '#2C2C2E', border: '1px solid #FF3B30', color: '#FF3B30', padding: '8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                  リセット
                </button>
                <button onClick={() => applyStreakPreset(3)} style={{ flex: 1, backgroundColor: '#2C2C2E', border: '1px solid #8E8E93', color: '#FFF', padding: '8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                  3日達成
                </button>
                <button onClick={() => applyStreakPreset(7)} style={{ flex: 1, backgroundColor: '#2C2C2E', border: '1px solid #FF9500', color: '#FF9500', padding: '8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                  7日達成
                </button>
                <button onClick={() => applyStreakPreset(30)} style={{ flex: 1, backgroundColor: '#2C2C2E', border: '1px solid #34C759', color: '#34C759', padding: '8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                  30日達成
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', backgroundColor: '#2C2C2E', padding: '20px', borderRadius: '12px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', color: '#8E8E93', fontWeight: 'bold' }}>現在のストリーク (current_streak)</label>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#34C759' }}>{streak.current_streak}日</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    value={streak.current_streak}
                    onChange={(e) => handleSaveStreak({ ...streak, current_streak: e.target.value })}
                    style={{ width: '100%', accentColor: '#34C759', cursor: 'pointer' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', color: '#8E8E93', fontWeight: 'bold' }}>過去最高記録 (best_streak)</label>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#FF9500' }}>{streak.best_streak}日</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    value={streak.best_streak}
                    onChange={(e) => handleSaveStreak({ ...streak, best_streak: e.target.value })}
                    style={{ width: '100%', accentColor: '#FF9500', cursor: 'pointer' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#8E8E93', marginBottom: '6px', fontWeight: 'bold' }}>最後のコンビニ利用日 (last_convini_date)</label>
                  <input
                    type="date"
                    value={streak.last_convini_date || ''}
                    onChange={(e) => handleSaveStreak({ ...streak, last_convini_date: e.target.value })}
                    style={{ width: '100%', backgroundColor: '#1C1C1E', border: '1px solid #3A3A3C', color: '#FFF', borderRadius: '6px', padding: '10px', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* badgesタブ */}
          {activeTab === 'badges' && (
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <button onClick={unlockAllBadges} style={{ backgroundColor: '#34C759', color: '#FFF', border: 'none', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                  🎉 全バッジを付与
                </button>
                <button onClick={resetAllBadges} style={{ backgroundColor: '#FF3B30', color: '#FFF', border: 'none', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                  🔥 全バッジをリセット
                </button>
              </div>

              {/* 手動付与セクション */}
              <div style={{ backgroundColor: '#2C2C2E', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>手動個別解除</h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {([
                    { key: 'first_scan', label: '🥉 初回スキャン達成' },
                    { key: 'first_goal_achieved', label: '🎖️ 初回目標達成' },
                    { key: 'streak_3', label: '🥈 コンビニ断ち3日' },
                    { key: 'streak_7', label: '🔥 7日連続達成' },
                    { key: 'impulse_control', label: '🥇 衝動買い50以下' },
                    { key: 'monthly_budget', label: '🏆 月間目標達成' },
                    { key: 'cashless_expert', label: '💳 キャッシュレス連携' }
                  ]).map(b => {
                    const isUnlocked = badges.some(ub => ub.badge_key === b.key);
                    return (
                      <button
                        key={b.key}
                        disabled={isUnlocked}
                        onClick={() => handleUnlockBadge(b.key)}
                        style={{
                          backgroundColor: isUnlocked ? '#1C1C1E' : '#34C759',
                          color: isUnlocked ? '#8E8E93' : '#FFF',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          cursor: isUnlocked ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold',
                          opacity: isUnlocked ? 0.5 : 1
                        }}
                      >
                        {b.label} {isUnlocked ? '(獲得済)' : '(付与)'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 獲得済みバッジ一覧 */}
              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>現在獲得中のバッジ ({badges.length}個)</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2C2C2E', color: '#8E8E93' }}>
                      <th style={{ padding: '10px 8px' }}>badge_key</th>
                      <th style={{ padding: '10px 8px' }}>unlocked_at (JST)</th>
                      <th style={{ padding: '10px 8px', width: '80px' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {badges.map(b => (
                      <tr key={b.id} style={{ borderBottom: '1px solid #2C2C2E' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{b.badge_key}</td>
                        <td style={{ padding: '8px' }}>{new Date(b.unlocked_at).toLocaleString()}</td>
                        <td style={{ padding: '8px' }}>
                          <button onClick={() => handleDeleteBadge(b.id)} style={{ backgroundColor: '#FF3B30', color: '#FFF', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                            解除取消
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default DevDashboard;
