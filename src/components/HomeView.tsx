import React, { useState } from 'react';
import { Plus, ChevronRight, Calendar, TrendingUp, Flame, Sparkles, X, Trash2, User, Edit2 } from 'lucide-react';
import type { Receipt, ActiveTab } from '../types';

interface HomeViewProps {
  receipts: Receipt[];
  onNavigate: (tab: ActiveTab) => void;
  onDeleteReceipt?: (id: string) => void; // 履歴削除用
  onOpenSettings?: () => void;
  onEditReceipt?: (receipt: Receipt) => void;
}

const HomeView: React.FC<HomeViewProps> = ({ 
  receipts, 
  onNavigate, 
  onDeleteReceipt, 
  onOpenSettings, 
  onEditReceipt 
}) => {
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [graphPeriod, setGraphPeriod] = useState<7 | 30 | 90>(7);
  const [expandedReceipts, setExpandedReceipts] = useState<{ [id: string]: boolean }>({});

  // システムの「今日」の基準日付を 2026-05-31 とする
  const TODAY_STR = '2026-05-31';
  const today = new Date(`${TODAY_STR}T23:59:59`);

  // --- 今月の支出合計・利用回数を計算 (5月中) ---
  const thisMonthReceipts = receipts.filter(r => r.date.startsWith('2026-05'));
  const totalAmount = thisMonthReceipts.reduce((sum, r) => sum + r.amount, 0);
  const totalCount = thisMonthReceipts.length;

  // 衝動買いスコアの計算
  const impulseCount = thisMonthReceipts.filter(r => r.isImpulse).length;
  const lateNightCount = thisMonthReceipts.filter(r => {
    const hour = new Date(r.date).getHours();
    return hour >= 22 || hour < 5;
  }).length;

  let impulseScore = 0;
  if (totalCount > 0) {
    const ratioScore = (impulseCount / totalCount) * 80; // 割合で最大80点
    const penaltyScore = Math.min(lateNightCount * 10, 20); // 深夜利用ペナルティで最大20点
    impulseScore = Math.min(Math.round(ratioScore + penaltyScore), 100);
  }

  let scoreColor = 'var(--ios-primary)';
  let scoreBg = 'var(--ios-primary-light)';
  let scoreText = '健全な支出です';
  if (impulseScore >= 70) {
    scoreColor = 'var(--ios-red)';
    scoreBg = 'var(--ios-red-light)';
    scoreText = '衝動買い危険度・高';
  } else if (impulseScore >= 40) {
    scoreColor = 'var(--ios-orange)';
    scoreBg = 'var(--ios-orange-light)';
    scoreText = 'やや無意識の利用あり';
  }

  // --- ストリークの動的計算 ---
  // 1. コンビニ未利用日数
  // 最新のレシートの日付から今日(2026-05-31)までの経過日数
  let noConvenienceStreak = 0;
  if (receipts.length > 0) {
    // 日付順にソート (降順)
    const sorted = [...receipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastDate = new Date(sorted[0].date);
    const diffTime = today.getTime() - lastDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    noConvenienceStreak = Math.max(0, diffDays);
  }

  // 2. 深夜利用なし日数
  // 最後に深夜利用(22:00-05:00)したレシートの日付から今日までの経過日数
  let noLateNightStreak = 0;
  const lateNightReceipts = receipts.filter(r => {
    const hour = new Date(r.date).getHours();
    return hour >= 22 || hour < 5;
  });
  if (lateNightReceipts.length > 0) {
    const sorted = [...lateNightReceipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastLateNightDate = new Date(sorted[0].date);
    const diffTime = today.getTime() - lastLateNightDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    noLateNightStreak = Math.max(0, diffDays);
  } else {
    // 深夜利用が一度もない場合は全データの期間
    noLateNightStreak = 30; // デフォルト30日
  }

  // --- 行動変化フィードバックの動的計算 (先週と今週の比較) ---
  // 今週 (5/25 - 5/31)
  const receiptsThisWeek = receipts.filter(r => {
    const d = new Date(r.date);
    return d >= new Date('2026-05-25T00:00:00') && d <= new Date('2026-05-31T23:59:59');
  });

  // 先週 (5/18 - 5/24)
  const receiptsLastWeek = receipts.filter(r => {
    const d = new Date(r.date);
    return d >= new Date('2026-05-18T00:00:00') && d <= new Date('2026-05-24T23:59:59');
  });

  const feedBacks: string[] = [];

  // ① 利用回数比較
  const countThisWeek = receiptsThisWeek.length;
  const countLastWeek = receiptsLastWeek.length;
  if (countLastWeek > 0 && countThisWeek < countLastWeek) {
    const reductionRate = Math.round(((countLastWeek - countThisWeek) / countLastWeek) * 100);
    feedBacks.push(`🎉 先週より利用回数が${reductionRate}%減っています！素晴らしい改善です！`);
  }

  // ② 深夜利用比較
  const lateNightThisWeek = receiptsThisWeek.filter(r => {
    const h = new Date(r.date).getHours();
    return h >= 22 || h < 5;
  }).length;
  const lateNightLastWeek = receiptsLastWeek.filter(r => {
    const h = new Date(r.date).getHours();
    return h >= 22 || h < 5;
  }).length;
  if (lateNightLastWeek > 0 && lateNightThisWeek < lateNightLastWeek) {
    feedBacks.push(`🌙 深夜の利用が減少しています。睡眠の質と健康状態もアップ！`);
  }

  // ③ 衝動買い割合の比較
  const impulseThisWeek = receiptsThisWeek.filter(r => r.isImpulse).length;
  const impulseLastWeek = receiptsLastWeek.filter(r => r.isImpulse).length;
  const impulseRatioThisWeek = countThisWeek > 0 ? impulseThisWeek / countThisWeek : 0;
  const impulseRatioLastWeek = countLastWeek > 0 ? impulseLastWeek / countLastWeek : 0;
  if (impulseRatioLastWeek > 0 && impulseRatioThisWeek < impulseRatioLastWeek) {
    feedBacks.push(`🛍️ 衝動買いスコアが改善しています。本当に必要な買い物が増えました。`);
  }

  // ④ 利用頻度の全体的な改善フィードバック
  if (countThisWeek < countLastWeek && lateNightThisWeek < lateNightLastWeek) {
    feedBacks.push(`🔥 コンビニの利用頻度が下がっています。欲しいもののために貯金が進んでいます！`);
  }

  // フィードバックがない場合のデフォルト
  if (feedBacks.length === 0) {
    feedBacks.push(`📈 レシートを登録し続けることで、先週の自分と比較した改善点が表示されます！`);
  }

  // 最新3件の履歴
  const recentReceipts = receipts.slice(0, 3);

  // コンビニテーマカラー
  const getStoreTheme = (name: string) => {
    if (name.includes('セブン')) return { bg: '#E6F3ED', color: '#1B9A5E', name: 'セブン' };
    if (name.includes('ファミリー') || name.includes('ファミマ')) return { bg: '#EAF6FF', color: '#00A0E9', name: 'ファミマ' };
    if (name.includes('ローソン')) return { bg: '#FFF9E6', color: '#005BAC', name: 'ローソン' };
    return { bg: '#F2F2F7', color: '#8E8E93', name: 'その他' };
  };

  // 品目アコーディオン展開処理
  const toggleReceiptExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedReceipts(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const renderItemsList = (receiptId: string, items?: string[]) => {
    if (!items || items.length === 0) {
      return <span style={{ fontSize: '10px', color: 'var(--ios-text-secondary)', fontStyle: 'italic' }}>商品登録なし</span>;
    }

    const isExpanded = expandedReceipts[receiptId];
    const limit = 2;
    const hasMore = items.length > limit;
    const displayedItems = isExpanded ? items : items.slice(0, limit);

    return (
      <div style={{ marginTop: '4px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {displayedItems.map((item, idx) => (
            <span 
              key={idx} 
              style={{ 
                fontSize: '9px', 
                backgroundColor: 'rgba(0,0,0,0.04)', 
                padding: '2px 6px', 
                borderRadius: '4px',
                color: 'var(--ios-text-secondary)',
                display: 'inline-block'
              }}
            >
              {item}
            </span>
          ))}
          {!isExpanded && hasMore && (
            <span 
              style={{ 
                fontSize: '9px', 
                backgroundColor: 'rgba(0,122,255,0.08)', 
                color: 'var(--ios-primary)',
                padding: '2px 6px', 
                borderRadius: '4px',
                fontWeight: '600'
              }}
            >
              +{items.length - limit}件
            </span>
          )}
        </div>
        {hasMore && (
          <button
            onClick={(e) => toggleReceiptExpand(receiptId, e)}
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--ios-primary)',
              fontSize: '10px',
              fontWeight: '600',
              padding: '2px 0',
              marginTop: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '2px'
            }}
          >
            {isExpanded ? '閉じる' : 'もっと見る'}
          </button>
        )}
      </div>
    );
  };

  // グラフデータ (期間切り替え対応)
  const getGraphData = (period: number) => {
    const days = Array.from({ length: period }, (_, i) => {
      const d = new Date(TODAY_STR);
      d.setDate(d.getDate() - (period - 1 - i));
      return d.toISOString().split('T')[0];
    });

    const dailyAmounts = days.map(day => {
      return receipts
        .filter(r => r.date.startsWith(day))
        .reduce((sum, r) => sum + r.amount, 0);
    });

    const maxAmount = Math.max(...dailyAmounts, 1000); // 最小高さ保障

    return { days, dailyAmounts, maxAmount };
  };

  const { days, dailyAmounts, maxAmount } = getGraphData(graphPeriod);

  // SVG折れ線グラフの座標計算
  const width = 360;
  const height = 110;
  const padding = 15;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = dailyAmounts.map((amt, idx) => {
    const x = padding + (idx / (graphPeriod - 1)) * chartWidth;
    const y = padding + chartHeight - (amt / maxAmount) * chartHeight;
    return { x, y, amount: amt };
  });

  const pathD = points.reduce((acc, p, idx) => {
    return acc + `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
  }, '');

  const areaD = points.length > 0 
    ? `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z` 
    : '';

  const shouldShowLabel = (idx: number) => {
    if (graphPeriod === 7) return true;
    if (graphPeriod === 30) return idx % 5 === 0 || idx === 29;
    if (graphPeriod === 90) return idx % 15 === 0 || idx === 89;
    return false;
  };

  return (
    <div>
      {/* ビュータイトルと新規スキャンボタン */}
      <div className="view-title">
        <span>ホーム</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* 設定ボタン */}
          <button 
            onClick={() => onOpenSettings && onOpenSettings()}
            style={{
              border: 'none',
              background: 'var(--ios-gray-light)',
              color: 'var(--ios-text-main)',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <User size={18} />
          </button>
          <button 
            onClick={() => onNavigate('scan')}
            style={{
              border: 'none',
              background: 'var(--ios-primary-light)',
              color: 'var(--ios-primary)',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* ストリーク機能 (連続達成日数) */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <div className="ios-card" style={{ flex: 1, margin: 0, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(255, 149, 0, 0.15)', background: 'linear-gradient(135deg, #FFFDF9 0%, #FFF9F0 100%)' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: '#FFE5CC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FF9500',
            animation: 'pulse 1.5s infinite ease-in-out'
          }}>
            <Flame size={18} fill="#FF9500" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--ios-text-secondary)', fontWeight: '600' }}>コンビニ未利用</div>
            <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--ios-text-main)' }}>
              {noConvenienceStreak}日継続中
            </div>
          </div>
        </div>

        <div className="ios-card" style={{ flex: 1, margin: 0, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(0, 122, 255, 0.15)', background: 'linear-gradient(135deg, #F9FBFF 0%, #F0F5FF 100%)' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: '#CCE5FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#007AFF'
          }}>
            <Calendar size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--ios-text-secondary)', fontWeight: '600' }}>深夜利用なし</div>
            <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--ios-text-main)' }}>
              {noLateNightStreak}日継続中
            </div>
          </div>
        </div>
      </div>

      {/* サマリーカード */}
      <div className="ios-card" style={{ background: 'linear-gradient(135deg, #1B9A5E 0%, #34C759 100%)', color: '#FFFFFF', padding: '22px', boxShadow: '0 8px 24px rgba(52, 199, 89, 0.2)' }}>
        <div style={{ fontSize: '13px', opacity: 0.85, fontWeight: 500, marginBottom: '4px' }}>今月のコンビニ支出</div>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '16px' }}>
          <span style={{ fontSize: '36px', fontWeight: 800, fontFamily: 'Outfit' }}>¥{totalAmount.toLocaleString()}</span>
          <span style={{ fontSize: '13px', marginLeft: '4px', opacity: 0.85 }}>/ 予算 ¥10,000</span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '0.5px solid rgba(255,255,255,0.2)', paddingTop: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '2px' }}>利用回数</div>
            <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'Outfit' }}>{totalCount} <span style={{ fontSize: '12px', fontWeight: 500 }}>回</span></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '2px' }}>1回平均</div>
            <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'Outfit' }}>
              ¥{totalCount > 0 ? Math.round(totalAmount / totalCount).toLocaleString() : 0}
            </div>
          </div>
        </div>
      </div>

      {/* 行動変化フィードバックカード */}
      <div className="ios-card" style={{ padding: '18px', background: 'linear-gradient(135deg, #F6FFF8 0%, #E8F8EC 100%)', border: '1px solid rgba(52, 199, 89, 0.2)', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          top: '-10px',
          right: '-10px',
          color: 'rgba(52, 199, 89, 0.1)',
          transform: 'rotate(15deg)'
        }}>
          <Sparkles size={80} />
        </div>
        
        <span style={{ fontSize: '14px', fontWeight: 800, color: '#1B9A5E', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
          <Sparkles size={16} />
          先週との比較フィードバック
        </span>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 1, position: 'relative' }}>
          {feedBacks.map((feedback, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#1B9A5E', lineHeight: '1.4', fontWeight: 600 }}>
                {feedback}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 衝動買いスコアカード */}
      <div className="ios-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          width: '74px',
          height: '74px',
          borderRadius: '50%',
          border: `6px solid ${scoreBg}`,
          borderTopColor: scoreColor,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transform: 'rotate(-45deg)',
          flexShrink: 0
        }}>
          <span style={{
            fontSize: '18px',
            fontWeight: 800,
            color: scoreColor,
            fontFamily: 'Outfit',
            transform: 'rotate(45deg)'
          }}>
            {impulseScore}%
          </span>
        </div>
        
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700 }}>衝動買いスコア</span>
            <span className="ios-badge" style={{ backgroundColor: scoreBg, color: scoreColor }}>
              {scoreText}
            </span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--ios-text-secondary)', lineHeight: '1.4', margin: 0 }}>
            {impulseScore >= 70 
              ? '深夜の利用や1日に複数回利用が目立ちます。無意識のコンビニ寄りを減らす工夫をしましょう。'
              : impulseScore >= 40
              ? 'ある程度セーブできていますが、ついで買いや夜間の利用に注意が必要です。'
              : '素晴らしいペースです！コンビニ浪費をしっかりコントロールできています。'}
          </p>
        </div>
      </div>

      {/* グラフカード */}
      <div className="ios-card" style={{ padding: '16px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <TrendingUp size={16} color="var(--ios-primary)" />
            支出推移
          </span>
          {/* 期間切り替えタブ */}
          <div style={{
            display: 'flex',
            backgroundColor: 'rgba(120, 120, 128, 0.08)',
            padding: '2px',
            borderRadius: '7px',
          }}>
            {([7, 30, 90] as const).map(p => {
              const label = p === 7 ? '7日' : p === 30 ? '30日' : '3ヶ月';
              const isActive = graphPeriod === p;
              return (
                <button
                  key={p}
                  onClick={() => setGraphPeriod(p)}
                  style={{
                    border: 'none',
                    background: isActive ? '#FFFFFF' : 'transparent',
                    boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                    borderRadius: '5px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: isActive ? '600' : '500',
                    color: isActive ? 'var(--ios-text-main)' : 'var(--ios-text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.1s ease'
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        
        <div style={{ width: '100%', height: `${height}px`, position: 'relative' }}>
          {dailyAmounts.reduce((s, a) => s + a, 0) === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', height: '100%', fontSize: '13px', color: 'var(--ios-text-secondary)' }}>
              データがありません。レシートを追加してください。
            </div>
          ) : (
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--ios-primary)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--ios-primary)" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              
              {/* 横のグリッドライン */}
              <line x1={padding} y1={padding} x2={width-padding} y2={padding} stroke="rgba(0,0,0,0.05)" strokeDasharray="3,3" />
              <line x1={padding} y1={padding + chartHeight/2} x2={width-padding} y2={padding + chartHeight/2} stroke="rgba(0,0,0,0.05)" strokeDasharray="3,3" />
              <line x1={padding} y1={padding + chartHeight} x2={width-padding} y2={padding + chartHeight} stroke="rgba(0,0,0,0.08)" />

              {/* グラフの塗りつぶし領域 */}
              {areaD && <path d={areaD} fill="url(#chart-grad)" />}

              {/* グラフの線 */}
              {pathD && <path d={pathD} fill="none" stroke="var(--ios-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

              {/* プロット点とラベル */}
              {points.map((p, idx) => {
                const date = new Date(days[idx]);
                const dayLabel = `${date.getMonth() + 1}/${date.getDate()}`;
                const showPoint = graphPeriod === 7 || (graphPeriod === 30 && p.amount > 0 && idx % 3 === 0) || (graphPeriod === 90 && p.amount > 0 && idx % 7 === 0);
                const showLabel = shouldShowLabel(idx);
                
                return (
                  <g key={idx}>
                    {p.amount > 0 && showPoint && (
                      <>
                        <circle cx={p.x} cy={p.y} r={graphPeriod === 7 ? "4.5" : "3"} fill="#FFFFFF" stroke="var(--ios-primary)" strokeWidth={graphPeriod === 7 ? "2.5" : "1.5"} />
                        {graphPeriod === 7 && p.amount > 300 && (
                          <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="9px" fontWeight="700" fill="var(--ios-primary)" fontFamily="Outfit">
                            ¥{p.amount}
                          </text>
                        )}
                      </>
                    )}
                    {/* 日付ラベル */}
                    {showLabel && (
                      <>
                        {graphPeriod > 7 && (
                          <line x1={p.x} y1={padding} x2={p.x} y2={height - padding} stroke="rgba(0,0,0,0.03)" strokeDasharray="2,2" />
                        )}
                        <text x={p.x} y={height - 2} textAnchor="middle" fontSize="9px" fontWeight="600" fill="var(--ios-text-secondary)">
                          {dayLabel}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>

      {/* 直近の利用履歴 */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700 }}>直近の利用履歴</span>
          <button 
            onClick={() => setShowHistoryModal(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ios-primary)',
              fontSize: '13px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            すべて見る
            <ChevronRight size={14} />
          </button>
        </div>

        {recentReceipts.length === 0 ? (
          <div className="ios-card" style={{ textAlign: 'center', color: 'var(--ios-text-secondary)', padding: '30px 20px', fontSize: '14px' }}>
            履歴がまだありません。<br/>下のカメラボタンからレシートを追加しましょう！
          </div>
        ) : (
          recentReceipts.map(receipt => {
            const theme = getStoreTheme(receipt.storeName);
            const dateObj = new Date(receipt.date);
            const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
            
            return (
              <div 
                key={receipt.id} 
                className="ios-card interactive" 
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  padding: '14px 16px',
                  marginBottom: '10px',
                  cursor: 'pointer'
                }}
                onClick={() => setShowHistoryModal(true)}
              >
                {/* コンビニミニロゴマーク */}
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  backgroundColor: theme.bg,
                  color: theme.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '800',
                  fontSize: '14px',
                  flexShrink: 0,
                  marginTop: '2px'
                }}>
                  {theme.name[0]}
                </div>

                <div style={{ flex: 1, marginLeft: '12px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{receipt.storeName}</span>
                    {receipt.isImpulse && (
                      <span className="ios-badge ios-badge-danger" style={{ padding: '2px 4px', fontSize: '9px', flexShrink: 0 }}>
                        衝動買い
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--ios-text-secondary)', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                    <Calendar size={10} />
                    {dateStr}
                  </span>
                  {/* アコーディオン品目リスト */}
                  {renderItemsList(receipt.id, receipt.items)}
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'Outfit', color: receipt.isImpulse ? 'var(--ios-red)' : 'var(--ios-text-main)' }}>
                    ¥{receipt.amount.toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* クイックアクション */}
      <button 
        className="ios-btn"
        onClick={() => onNavigate('scan')}
        style={{ marginTop: '8px', marginBottom: '16px' }}
      >
        <Plus size={20} />
        レシートを読み取る
      </button>

      {/* --- 全履歴モーダルビュー --- */}
      {showHistoryModal && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'flex-end',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            width: '100%',
            maxHeight: '80%',
            backgroundColor: 'var(--ios-bg)',
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            padding: '20px 16px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideUp 0.3s cubic-bezier(0.1, 0.8, 0.3, 1)'
          }}>
            {/* モーダルヘッダー */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '0.5px solid var(--ios-border)' }}>
              <span style={{ fontSize: '18px', fontWeight: '800' }}>全利用履歴 ({receipts.length}件)</span>
              <button 
                onClick={() => setShowHistoryModal(false)}
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

            {/* 履歴リスト */}
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '20px' }}>
              {receipts.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--ios-text-secondary)', padding: '40px 0' }}>
                  履歴がありません。
                </div>
              ) : (
                receipts.map(receipt => {
                  const theme = getStoreTheme(receipt.storeName);
                  const dateObj = new Date(receipt.date);
                  const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
                  
                  return (
                    <div 
                      key={receipt.id} 
                      className="ios-card" 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px 14px',
                        marginBottom: '10px'
                      }}
                    >
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        backgroundColor: theme.bg,
                        color: theme.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '800',
                        fontSize: '13px',
                        flexShrink: 0
                      }}>
                        {theme.name[0]}
                      </div>

                      <div style={{ flex: 1, marginLeft: '10px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{receipt.storeName}</span>
                          {receipt.isImpulse && (
                            <span className="ios-badge ios-badge-danger" style={{ padding: '2px 4px', fontSize: '8px' }}>
                              衝動買い
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '2px', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: 'var(--ios-text-secondary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Calendar size={8} />
                            {dateStr}
                          </span>
                        </div>
                        {renderItemsList(receipt.id, receipt.items)}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <div style={{ textAlign: 'right', marginRight: '4px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'Outfit', color: receipt.isImpulse ? 'var(--ios-red)' : 'var(--ios-text-main)' }}>
                            ¥{receipt.amount.toLocaleString()}
                          </div>
                        </div>
                        {onEditReceipt && (
                          <button
                            onClick={() => {
                              onEditReceipt(receipt);
                            }}
                            style={{
                              border: 'none',
                              background: 'none',
                              color: 'var(--ios-primary)',
                              cursor: 'pointer',
                              padding: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Edit2 size={15} />
                          </button>
                        )}
                        {onDeleteReceipt && (
                          <button
                            onClick={() => {
                              if (window.confirm('この履歴を削除しますか？')) {
                                onDeleteReceipt(receipt.id);
                              }
                            }}
                            style={{
                              border: 'none',
                              background: 'none',
                              color: 'var(--ios-red)',
                              cursor: 'pointer',
                              padding: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeView;
