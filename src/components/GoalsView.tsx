import React, { useState } from 'react';
import { Target, TrendingUp, PiggyBank, Plus, Trash2, Sliders, ChevronDown, Sparkles } from 'lucide-react';
import type { Receipt, SavingsGoal, SpendingGoal } from '../types';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot
} from 'recharts';

interface GoalsViewProps {
  receipts: Receipt[];
  spendingGoal: SpendingGoal;
  savingsGoals: SavingsGoal[];
  monthlyBaseSavings: number;
  isLoading?: boolean;
  onUpdateSpendingGoal: (goal: SpendingGoal) => void;
  onAddSavingsGoal: (name: string, price: number, currentSavings: number) => void;
  onDeleteSavingsGoal: (id: string) => void;
  onUpdateBaseSavings: (amount: number) => void;
}

const GoalsView: React.FC<GoalsViewProps> = ({
  receipts,
  spendingGoal,
  savingsGoals,
  monthlyBaseSavings,
  isLoading = false,
  onUpdateSpendingGoal,
  onAddSavingsGoal,
  onDeleteSavingsGoal,
  onUpdateBaseSavings
}) => {
  // 1. 利用履歴から月間支出を算出 (リアルタイム日付基準)
  const today = new Date();
  const thisMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  
  // 今月のコンビニ支出と回数
  const thisMonthReceipts = receipts.filter(r => r.date.startsWith(thisMonthStr));
  const currentAmount = thisMonthReceipts.reduce((sum, r) => sum + r.amount, 0);
  const currentCount = thisMonthReceipts.length;

  // 過去30日間の総支出
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const last30DaysReceipts = receipts.filter(r => new Date(r.date) >= thirtyDaysAgo);
  const last30DaysSpent = last30DaysReceipts.reduce((sum, r) => sum + r.amount, 0);

  // 1か月あたりの平均支出
  let monthlyAverageSpent = 0;
  if (receipts.length > 0) {
    const totalSpent = receipts.reduce((sum, r) => sum + r.amount, 0);
    const dates = receipts.map(r => new Date(r.date).getTime());
    const oldestDate = new Date(Math.min(...dates));
    const monthDiff = (today.getFullYear() - oldestDate.getFullYear()) * 12 + (today.getMonth() - oldestDate.getMonth()) + 1;
    monthlyAverageSpent = Math.round(totalSpent / Math.max(1, monthDiff));
  }

  // 未来予測削減率の選択状態 (要件3: 10%, 20%, 30%, 50% から選択)
  const [reductionRate, setReductionRate] = useState<10 | 20 | 30 | 50>(30);

  // 未来予測シミュレーションの対象月数 (3, 6, 12, 24ヶ月) (NEW)
  const [simulationMonths, setSimulationMonths] = useState<3 | 6 | 12 | 24>(12);

  // 欲しいもの追加用フォーム
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState<number>(0);
  const [newItemSavings, setNewItemSavings] = useState<number>(0); // 現在の貯蓄額
  const [showAddForm, setShowAddForm] = useState(false);

  // 目標設定フォーム
  const [editAmountLimit, setEditAmountLimit] = useState(spendingGoal.monthlyAmountLimit);
  const [editCountLimit, setEditCountLimit] = useState(spendingGoal.monthlyCountLimit);
  const [isEditingSpending, setIsEditingSpending] = useState(false);

  // 基本貯蓄額設定用
  const [editBaseSavings, setEditBaseSavings] = useState(monthlyBaseSavings);
  const [isEditingBaseSavings, setIsEditingBaseSavings] = useState(false);

  // 達成率計算 (予算上限に対する進捗)
  const amountProgress = Math.min((currentAmount / spendingGoal.monthlyAmountLimit) * 100, 100);
  const countProgress = Math.min((currentCount / spendingGoal.monthlyCountLimit) * 100, 100);

  // 目標保存処理
  const handleSaveSpendingGoal = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSpendingGoal({
      monthlyAmountLimit: editAmountLimit,
      monthlyCountLimit: editCountLimit
    });
    setIsEditingSpending(false);
  };

  // 基本貯蓄額保存処理
  const handleSaveBaseSavings = (e: React.FormEvent) => {
    e.preventDefault();
    if (editBaseSavings < 0) return;
    onUpdateBaseSavings(editBaseSavings);
    setIsEditingBaseSavings(false);
  };

  const handleStartEditBaseSavings = () => {
    setEditBaseSavings(monthlyBaseSavings);
    setIsEditingBaseSavings(true);
  };

  // 欲しいもの追加処理
  const handleAddSavings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName || newItemPrice <= 0) return;
    onAddSavingsGoal(newItemName, newItemPrice, newItemSavings);
    setNewItemName('');
    setNewItemPrice(0);
    setNewItemSavings(0);
    setShowAddForm(false);
  };

  // 未来予測用コンビニ支出目安 (仕様: receiptsテーブルの1ヶ月平均。なければuser_settingsのデフォルト値¥8,000を使用)
  const monthlySpent = monthlyAverageSpent > 0 ? monthlyAverageSpent : 8000;
  
  // 削減による節約可能額 (月額) (要件2)
  const monthlyReductionSavings = Math.round(monthlySpent * (reductionRate / 100));
  
  // 合計の月間貯蓄可能額
  const totalMonthlySavings = monthlyBaseSavings + monthlyReductionSavings;

  // 指定月数後までの累積データを生成 (0〜simulationMonths後、計simulationMonths+1点)
  interface ChartPoint {
    name: string;
    monthOffset: number;
    baseAccumulated: number;
    reducedAccumulated: number;
  }
  const chartData: ChartPoint[] = [];
  const currentMonthIdx = today.getMonth(); // 0-11
  
  for (let i = 0; i <= simulationMonths; i++) {
    const m = (currentMonthIdx + i) % 12;
    const monthName = `${m + 1}月`;
    chartData.push({
      name: monthName,
      monthOffset: i,
      // 現状維持の累積額
      baseAccumulated: monthlyBaseSavings * i,
      // 削減後の累積額
      reducedAccumulated: totalMonthlySavings * i,
    });
  }

  // receiptsが0件かつwish_listが0件の場合の判定
  const isEmpty = receipts.length === 0 && savingsGoals.length === 0;

  return (
    <div>
      <div className="view-title">
        <span>目標・予測</span>
      </div>

      {/* --- Section 1: 現在のコンビニ支出実績 (要件1) --- */}
      <div className="ios-card" style={{ background: '#FAFAFC', border: '1px solid var(--ios-border)', padding: '16px' }}>
        <span style={{ fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <TrendingUp size={16} color="var(--ios-primary)" />
          コンビニ支出実績 (実データ)
        </span>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, backgroundColor: '#FFFFFF', padding: '10px 8px', borderRadius: '12px', textAlign: 'center', border: '0.5px solid var(--ios-border)' }}>
            <span style={{ fontSize: '9px', color: 'var(--ios-text-secondary)', display: 'block', marginBottom: '4px' }}>今月の支出</span>
            <span style={{ fontSize: '13px', fontWeight: '800', fontFamily: 'Outfit' }}>¥{currentAmount.toLocaleString()}</span>
            <span style={{ fontSize: '8px', color: 'var(--ios-text-secondary)', display: 'block', marginTop: '2px' }}>{currentCount}回利用</span>
          </div>
          <div style={{ flex: 1, backgroundColor: '#FFFFFF', padding: '10px 8px', borderRadius: '12px', textAlign: 'center', border: '0.5px solid var(--ios-border)' }}>
            <span style={{ fontSize: '9px', color: 'var(--ios-text-secondary)', display: 'block', marginBottom: '4px' }}>過去30日間</span>
            <span style={{ fontSize: '13px', fontWeight: '800', fontFamily: 'Outfit' }}>¥{last30DaysSpent.toLocaleString()}</span>
            <span style={{ fontSize: '8px', color: 'var(--ios-text-secondary)', display: 'block', marginTop: '2px' }}>総額</span>
          </div>
          <div style={{ flex: 1, backgroundColor: '#FFFFFF', padding: '10px 8px', borderRadius: '12px', textAlign: 'center', border: '0.5px solid var(--ios-border)' }}>
            <span style={{ fontSize: '9px', color: 'var(--ios-text-secondary)', display: 'block', marginBottom: '4px' }}>1ヶ月平均</span>
            <span style={{ fontSize: '13px', fontWeight: '800', fontFamily: 'Outfit' }}>¥{monthlyAverageSpent.toLocaleString()}</span>
            <span style={{ fontSize: '8px', color: 'var(--ios-text-secondary)', display: 'block', marginTop: '2px' }}>全期間平均</span>
          </div>
        </div>
      </div>

      {/* --- Section 2: 今月の節約目標設定機能 --- */}
      <div className="ios-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={16} color="var(--ios-primary)" />
            今月の節約目標
          </span>
          <button
            onClick={() => {
              if (!isEditingSpending) {
                setEditAmountLimit(spendingGoal.monthlyAmountLimit);
                setEditCountLimit(spendingGoal.monthlyCountLimit);
              }
              setIsEditingSpending(!isEditingSpending);
            }}
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--ios-primary)',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            {isEditingSpending ? 'キャンセル' : '目標を編集'}
          </button>
        </div>

        {isEditingSpending ? (
          <form onSubmit={handleSaveSpendingGoal} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="ios-input-group" style={{ marginBottom: '8px' }}>
              <label className="ios-input-label">月の利用金額上限 (円)</label>
              <input
                type="number"
                className="ios-input"
                value={editAmountLimit || ''}
                onChange={e => setEditAmountLimit(Number(e.target.value))}
                min="1000"
                required
              />
            </div>
            <div className="ios-input-group" style={{ marginBottom: '12px' }}>
              <label className="ios-input-label">月の利用回数上限 (回)</label>
              <input
                type="number"
                className="ios-input"
                value={editCountLimit || ''}
                onChange={e => setEditCountLimit(Number(e.target.value))}
                min="1"
                required
              />
            </div>
            <button type="submit" className="ios-btn" style={{ padding: '10px 16px', fontSize: '14px', borderRadius: '10px' }}>
              目標を保存する
            </button>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 金額目標進捗 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                <span style={{ fontWeight: 600 }}>利用金額 (上限 ¥{spendingGoal.monthlyAmountLimit.toLocaleString()})</span>
                <span style={{ fontWeight: 700, color: currentAmount > spendingGoal.monthlyAmountLimit ? 'var(--ios-red)' : 'var(--ios-text-main)' }}>
                  ¥{currentAmount.toLocaleString()} ({Math.round((currentAmount / spendingGoal.monthlyAmountLimit) * 100)}%)
                </span>
              </div>
              <div style={{ height: '10px', backgroundColor: 'var(--ios-gray-light)', borderRadius: '5px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    width: `${amountProgress}%`, 
                    height: '100%', 
                    backgroundColor: currentAmount > spendingGoal.monthlyAmountLimit ? 'var(--ios-red)' : 'var(--ios-primary)',
                    borderRadius: '5px',
                    transition: 'width 0.5s ease-out'
                  }}
                ></div>
              </div>
            </div>

            {/* 回数目標進捗 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                <span style={{ fontWeight: 600 }}>利用回数 (上限 {spendingGoal.monthlyCountLimit}回)</span>
                <span style={{ fontWeight: 700, color: currentCount > spendingGoal.monthlyCountLimit ? 'var(--ios-red)' : 'var(--ios-text-main)' }}>
                  {currentCount}回 ({Math.round((currentCount / spendingGoal.monthlyCountLimit) * 100)}%)
                </span>
              </div>
              <div style={{ height: '10px', backgroundColor: 'var(--ios-gray-light)', borderRadius: '5px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    width: `${countProgress}%`, 
                    height: '100%', 
                    backgroundColor: currentCount > spendingGoal.monthlyCountLimit ? 'var(--ios-red)' : 'var(--ios-primary)',
                    borderRadius: '5px',
                    transition: 'width 0.5s ease-out'
                  }}
                ></div>
              </div>
            </div>

            <div style={{ fontSize: '10px', color: 'var(--ios-text-secondary)', textAlign: 'center', backgroundColor: '#FAFAFC', padding: '8px', borderRadius: '10px' }}>
              {currentAmount <= spendingGoal.monthlyAmountLimit && currentCount <= spendingGoal.monthlyCountLimit ? (
                <span>🎉 現在目標達成ペースを維持しています！素晴らしい！</span>
              ) : (
                <span style={{ color: 'var(--ios-red)', fontWeight: '600' }}>⚠️ 予算または利用回数の上限を超過しています。習慣を見直しましょう！</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- Section 3: 月間貯蓄額設定 (要件7) --- */}
      <div className="ios-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PiggyBank size={16} color="var(--ios-primary)" />
            月間貯蓄額（基本貯金ペース）
          </span>
          <button
            onClick={() => {
              if (isEditingBaseSavings) {
                setIsEditingBaseSavings(false);
              } else {
                handleStartEditBaseSavings();
              }
            }}
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--ios-primary)',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            {isEditingBaseSavings ? 'キャンセル' : '変更'}
          </button>
        </div>

        {isEditingBaseSavings ? (
          <form onSubmit={handleSaveBaseSavings} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div className="ios-input-group" style={{ flex: 1, margin: 0 }}>
              <label className="ios-input-label" style={{ fontSize: '11px' }}>月間貯蓄額 (円)</label>
              <input
                type="number"
                className="ios-input"
                value={editBaseSavings || ''}
                onChange={e => setEditBaseSavings(Number(e.target.value))}
                min="0"
                step="500"
                required
                style={{ padding: '8px 12px', fontSize: '14px' }}
              />
            </div>
            <button type="submit" className="ios-btn" style={{ padding: '10px 16px', fontSize: '14px', borderRadius: '10px', width: 'auto', flexShrink: 0 }}>
              保存
            </button>
          </form>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'Outfit', color: 'var(--ios-text-main)' }}>
              ¥{monthlyBaseSavings.toLocaleString()}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--ios-text-secondary)', marginLeft: '6px' }}>
              /月 (コンビニ削減分を含まない通常の貯金ペース)
            </span>
          </div>
        )}
      </div>

      {/* --- Section 4: 未来予測シミュレーション (要件2, 3, 4, 5, 8) --- */}
      <div className="ios-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PiggyBank size={16} color="var(--ios-orange)" />
            未来予測・欲しいもの達成シミュレーション
          </span>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              border: 'none',
              background: 'var(--ios-orange-light)',
              color: 'var(--ios-orange)',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            {showAddForm ? <ChevronDown size={14} /> : <Plus size={14} />}
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddSavings} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px', backgroundColor: '#FFFBF5', padding: '12px', borderRadius: '14px', border: '1px solid rgba(255, 149, 0, 0.15)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label className="ios-input-label" style={{ fontSize: '11px' }}>欲しいもの</label>
                <input
                  type="text"
                  className="ios-input"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="例: Nintendo Switch 2"
                  required
                  style={{ padding: '8px 12px', fontSize: '13px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label className="ios-input-label" style={{ fontSize: '11px' }}>価格 (円)</label>
                  <input
                    type="number"
                    className="ios-input"
                    value={newItemPrice || ''}
                    onChange={e => setNewItemPrice(Number(e.target.value))}
                    placeholder="金額"
                    min="100"
                    required
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="ios-input-label" style={{ fontSize: '11px' }}>現在の貯蓄額 (任意)</label>
                  <input
                    type="number"
                    className="ios-input"
                    value={newItemSavings || ''}
                    onChange={e => setNewItemSavings(Number(e.target.value))}
                    placeholder="すでに貯まった額"
                    min="0"
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                  />
                </div>
              </div>
            </div>
            <button type="submit" className="ios-btn" style={{ backgroundColor: 'var(--ios-orange)', padding: '8px 12px', fontSize: '13px', borderRadius: '8px' }}>
              欲しいものを追加する
            </button>
          </form>
        )}

        {/* 削減率選択コントロール (要件3: 10%, 20%, 30%, 50% 押しボタン) */}
        <div style={{ backgroundColor: '#FAFAFC', padding: '16px', borderRadius: '16px', marginBottom: '16px', border: '1px solid var(--ios-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sliders size={14} color="var(--ios-orange)" />
              コンビニ削減シミュレーション設定
            </span>
            <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--ios-orange)', fontFamily: 'Outfit' }}>
              {reductionRate}% 削減
            </span>
          </div>

          <p style={{ fontSize: '10px', color: 'var(--ios-text-secondary)', lineHeight: '1.4', margin: '0 0 14px 0' }}>
            コンビニの無駄遣い目安 (月間: ¥{monthlySpent.toLocaleString()}) から、何%削減して貯蓄に回すかを選択します。
          </p>

          {/* セグメンテッド削減率切り替えボタン */}
          <div style={{
            display: 'flex',
            backgroundColor: 'rgba(120, 120, 128, 0.08)',
            padding: '2px',
            borderRadius: '9px',
            marginBottom: '16px'
          }}>
            {([10, 20, 30, 50] as const).map(rate => (
              <button
                key={rate}
                type="button"
                onClick={() => setReductionRate(rate)}
                style={{
                  flex: 1,
                  border: 'none',
                  background: reductionRate === rate ? '#FFFFFF' : 'transparent',
                  boxShadow: reductionRate === rate ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  borderRadius: '7px',
                  padding: '8px 0',
                  fontSize: '13px',
                  fontWeight: reductionRate === rate ? '600' : '500',
                  color: reductionRate === rate ? 'var(--ios-orange)' : 'var(--ios-text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {rate}%
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderTop: '0.5px solid var(--ios-border)', paddingTop: '12px' }}>
            <div>
              <span style={{ color: 'var(--ios-text-secondary)', display: 'block', fontSize: '9px' }}>追加の月間節約額 (浮くお金)</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ios-orange)', fontFamily: 'Outfit' }}>
                +¥{monthlyReductionSavings.toLocaleString()} <span style={{ fontSize: '9px', fontWeight: '500' }}>/月</span>
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ color: 'var(--ios-text-secondary)', display: 'block', fontSize: '9px' }}>月間総貯蓄予測 (基本 ¥{monthlyBaseSavings.toLocaleString()} 含)</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ios-text-main)', fontFamily: 'Outfit' }}>
                ¥{totalMonthlySavings.toLocaleString()} <span style={{ fontSize: '9px', fontWeight: '500' }}>/月</span>
              </span>
            </div>
          </div>
        </div>

        {/* 累積貯蓄額予測折れ線グラフ (Recharts) */}
        {isLoading ? (
          <div className="ios-card animate-skeleton" style={{ padding: '16px', backgroundColor: '#F2F2F7', minHeight: '260px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '50%', height: '16px', backgroundColor: '#E5E5EA', borderRadius: '4px' }}></div>
            <div style={{ flex: 1, backgroundColor: '#E5E5EA', borderRadius: '12px' }}></div>
          </div>
        ) : isEmpty ? (
          <div className="ios-card" style={{ padding: '32px 16px', textAlign: 'center', backgroundColor: '#FAFAFC', border: '1px dashed var(--ios-border)', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--ios-text-secondary)', margin: 0, lineHeight: 1.6 }}>
              レシートと欲しいものを登録すると<br />予測グラフが表示されます
            </p>
          </div>
        ) : (
          <div className="ios-card" style={{ padding: '16px', overflow: 'hidden', backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.05)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ios-text-secondary)' }}>
                貯蓄額シミュレーション ({simulationMonths}ヶ月後まで)
              </span>
              {/* 表示期間（月数）のセグメンテッドコントロール */}
              <div style={{
                display: 'flex',
                backgroundColor: 'rgba(120, 120, 128, 0.08)',
                padding: '2px',
                borderRadius: '8px'
              }}>
                {([3, 6, 12, 24] as const).map(months => (
                  <button
                    key={months}
                    type="button"
                    onClick={() => setSimulationMonths(months)}
                    style={{
                      border: 'none',
                      background: simulationMonths === months ? '#FFFFFF' : 'transparent',
                      boxShadow: simulationMonths === months ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '10px',
                      fontWeight: simulationMonths === months ? '600' : '500',
                      color: simulationMonths === months ? 'var(--ios-orange)' : 'var(--ios-text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {months}ヶ月
                  </button>
                ))}
              </div>
            </div>
            
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 15, left: -15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F2F2F7" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#8E8E93', fontSize: 10 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#8E8E93', fontSize: 10 }}
                    tickFormatter={(value) => `¥${(value / 1000).toLocaleString()}k`}
                  />
                  <Tooltip
                    formatter={(value: any) => [`¥${Number(value).toLocaleString()}`, '']}
                    labelStyle={{ fontSize: 11, fontWeight: 'bold' }}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '0.5px solid #E5E5EA',
                      borderRadius: '8px',
                      fontSize: '11px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="baseAccumulated"
                    name="現状維持"
                    stroke="#8E8E93"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="reducedAccumulated"
                    name="削減後"
                    stroke="#34C759"
                    strokeWidth={3.5}
                    dot={{ r: 3, stroke: '#34C759', strokeWidth: 1, fill: '#FFFFFF' }}
                    activeDot={{ r: 6 }}
                  />
                  
                  {/* wish_listの目標値ラインと交点マーク (被り防止ロジック) */}
                  {(() => {
                    const sortedGoals = [...savingsGoals]
                      .map(g => ({ ...g, remaining: Math.max(0, g.price - (g.currentSavings || 0)) }))
                      .filter(g => g.remaining > 0)
                      .sort((a, b) => a.remaining - b.remaining);

                    return sortedGoals.map((goal, idx) => {
                      const remaining = goal.remaining;
                      if (totalMonthlySavings <= 0) return null;
                      const monthsNeeded = Math.ceil(remaining / totalMonthlySavings);
                      const showDot = monthsNeeded <= simulationMonths;
                      const targetMonthName = showDot ? (chartData[monthsNeeded] ? chartData[monthsNeeded].name : null) : null;

                      // 隣接するラベルとの重複防止のため、左右交互に配置
                      const labelPosition = idx % 2 === 0 ? 'insideBottomLeft' : 'insideBottomRight';
                      const labelColor = idx % 2 === 0 ? '#C67A00' : '#E67E22';

                      return (
                        <React.Fragment key={goal.id}>
                          {/* 水平目標ライン */}
                          <ReferenceLine
                            y={remaining}
                            stroke={labelColor}
                            strokeDasharray="3 3"
                            strokeWidth={1}
                            label={{
                              value: `${goal.name} (¥${goal.price.toLocaleString()})`,
                              position: labelPosition,
                              fill: labelColor,
                              fontSize: 9,
                              fontWeight: '600',
                              offset: 6
                            }}
                          />
                          {/* 達成交点マーク */}
                          {showDot && targetMonthName && (
                            <ReferenceDot
                              x={targetMonthName}
                              y={remaining}
                              r={5}
                              fill="#34C759"
                              stroke="#FFFFFF"
                              strokeWidth={2}
                              label={{
                                value: `${goal.name}: ${monthsNeeded}ヶ月`,
                                position: idx % 2 === 0 ? 'top' : 'bottom', // 点のラベルも被らないよう上下に分ける
                                fill: '#34C759',
                                fontSize: 9,
                                fontWeight: 'bold',
                                offset: 6
                              }}
                            />
                          )}
                        </React.Fragment>
                      );
                    });
                  })()}
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            {/* 凡例 */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '12px', fontSize: '10px', color: 'var(--ios-text-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '12px', height: '2px', backgroundColor: '#8E8E93' }}></div>
                <span>現状維持 (月 ¥{monthlyBaseSavings.toLocaleString()})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '12px', height: '3.5px', backgroundColor: '#34C759' }}></div>
                <span>{reductionRate}%削減後 (月 ¥{totalMonthlySavings.toLocaleString()})</span>
              </div>
            </div>
          </div>
        )}

        {/* 欲しいものリストとシミュレーション結果カード (要件4, 5, 6, 8) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {savingsGoals.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ios-text-secondary)', padding: '20px 0', fontSize: '12px' }}>
              欲しいものが登録されていません。上の＋ボタンから登録しましょう！
            </div>
          ) : (
            savingsGoals.map(goal => {
              const currentSavings = goal.currentSavings || 0;
              // 達成率 (要件6: 未設定時は0%)
              const progressPercent = goal.price > 0 ? Math.min(Math.round((currentSavings / goal.price) * 100), 100) : 0;
              const remainingPrice = Math.max(0, goal.price - currentSavings);

              // 削減率を適用した場合の購入までにかかる月数
              const monthsNeededWithReduction = remainingPrice > 0 
                ? (totalMonthlySavings > 0 ? Math.ceil(remainingPrice / totalMonthlySavings) : Infinity) 
                : 0;

              // 削減率 0% (追加の節約なし) の場合にかかる月数
              const monthsNeededNoReduction = remainingPrice > 0 
                ? (monthlyBaseSavings > 0 ? Math.ceil(remainingPrice / monthlyBaseSavings) : Infinity) 
                : 0;

              // 短縮される期間 (要件8)
              const monthsSaved = (monthsNeededNoReduction !== Infinity && monthsNeededWithReduction !== Infinity)
                ? Math.max(0, monthsNeededNoReduction - monthsNeededWithReduction)
                : 0;

              return (
                <div 
                  key={goal.id} 
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '14px',
                    border: '1px solid rgba(0,0,0,0.05)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.01)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '800' }}>{goal.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ios-text-secondary)', fontFamily: 'Outfit', marginTop: '2px' }}>
                        価格: ¥{goal.price.toLocaleString()} <span style={{ fontSize: '10px' }}>(現在実績 ¥{currentSavings.toLocaleString()} 貯金済)</span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => onDeleteSavingsGoal(goal.id)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: 'var(--ios-gray-dark)',
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* 欲しいものの進捗バー */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ height: '8px', backgroundColor: 'var(--ios-gray-light)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          width: `${progressPercent}%`, 
                          height: '100%', 
                          backgroundColor: 'var(--ios-orange)',
                          borderRadius: '4px',
                          transition: 'width 0.5s ease-out'
                        }}
                      ></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--ios-text-secondary)', marginTop: '4px', fontWeight: 600 }}>
                      <span>貯金達成率: {progressPercent}%</span>
                      <span>残り: ¥{remainingPrice.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* シミュレーション比較カード (要件5, 8) */}
                  <div style={{ 
                    background: 'linear-gradient(135deg, #FFFDF9 0%, #FFF9F0 100%)', 
                    borderLeft: '3px solid var(--ios-orange)', 
                    padding: '10px 12px', 
                    borderRadius: '0 8px 8px 0', 
                    fontSize: '11px', 
                    lineHeight: '1.5' 
                  }}>
                    {remainingPrice === 0 ? (
                      <span style={{ color: 'var(--ios-primary)', fontWeight: '700' }}>
                        🎉 おめでとうございます！目標金額を達成しました！購入可能です。
                      </span>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '0.5px solid rgba(0,0,0,0.05)', paddingBottom: '4px' }}>
                            <span style={{ color: 'var(--ios-text-secondary)' }}>現在のコンビニ支出:</span>
                            <span style={{ fontWeight: '700' }}>¥{monthlySpent.toLocaleString()} /月</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '0.5px solid rgba(0,0,0,0.05)', paddingBottom: '4px' }}>
                            <span style={{ color: 'var(--ios-text-secondary)' }}>{reductionRate}% 削減時の節約可能額:</span>
                            <span style={{ fontWeight: '700', color: 'var(--ios-orange)' }}>¥{monthlyReductionSavings.toLocaleString()} /月</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', color: 'var(--ios-text-main)' }}>
                            <span>購入予測 (削減後ペース):</span>
                            <span>
                              {monthsNeededWithReduction === Infinity ? '貯蓄ペース未設定' : `約 ${monthsNeededWithReduction} ヶ月後`}
                            </span>
                          </div>
                        </div>

                        {/* シミュレーション比較 (要件8) */}
                        {reductionRate > 0 && monthsSaved > 0 && monthsNeededNoReduction !== Infinity && (
                          <div style={{ 
                            marginTop: '8px', 
                            padding: '6px 8px', 
                            backgroundColor: 'var(--ios-primary-light)', 
                            borderRadius: '6px', 
                            color: '#1B9A5E', 
                            fontWeight: '700',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Sparkles size={12} />
                              <span>削減シミュレーション結果：</span>
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--ios-text-secondary)', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                              <span>現状のペース：約 {monthsNeededNoReduction} ヶ月</span>
                              <span>➡</span>
                              <span style={{ fontWeight: '800', color: '#1B9A5E' }}>{reductionRate}%削減：約 {monthsNeededWithReduction} ヶ月</span>
                            </div>
                            <div style={{ borderTop: '0.5px dashed rgba(27, 154, 94, 0.2)', paddingTop: '4px', marginTop: '4px', textAlign: 'center', fontSize: '11px' }}>
                              🔥 購入まで <span style={{ fontSize: '13px', fontWeight: '800' }}>{monthsSaved} ヶ月短縮</span> できます！
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default GoalsView;
