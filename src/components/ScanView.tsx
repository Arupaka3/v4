import React, { useState, useRef } from 'react';
import { Camera, Upload, RefreshCw, CheckCircle, CreditCard, Link, Check } from 'lucide-react';
import type { Receipt } from '../types';

interface ScanViewProps {
  onAddReceipt: (receipt: Omit<Receipt, 'id'>) => void;
  linkedPayments: string[]; // 既に連携されている決済サービス
  onLinkPayment: (provider: string) => void; // 決済サービスを連携するアクション
}

const PRESET_RECEIPTS = [
  {
    storeName: 'セブンイレブン 習志野店',
    amount: 1140,
    items: ['カップヌードル 謎肉特盛', 'ポテトチップスうすしお', 'ストロングゼロ 500ml'],
    isImpulse: true,
    impulseReasons: ['深夜利用', '高額支出']
  },
  {
    storeName: 'ファミリーマート 千葉大前店',
    amount: 450,
    items: ['ファミチキ', 'レッドブル 250ml'],
    isImpulse: true,
    impulseReasons: ['1日複数回', 'ついで買い']
  },
  {
    storeName: 'ローソン 津田沼駅前店',
    amount: 680,
    items: ['タルタルチキン南蛮弁当', 'お茶 500ml'],
    isImpulse: false,
    impulseReasons: []
  }
];

const ScanView: React.FC<ScanViewProps> = ({ onAddReceipt, linkedPayments, onLinkPayment }) => {
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'parsed'>('idle');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  
  // フォームステート
  const [storeName, setStoreName] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState('');
  const [isImpulse, setIsImpulse] = useState(false);
  const [impulseReasons, setImpulseReasons] = useState<string[]>([]);
  const [items, setItems] = useState<string[]>([]);
  const [newItemText, setNewItemText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 日本語レシート解析パーサー
  const parseReceiptText = (text: string) => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    // 1. 店舗名の抽出
    let extractedStoreName = '';
    const storeKeywords = [
      { name: 'セブン-イレブン', match: ['セブン', 'SEVEN', 'seven-eleven'] },
      { name: 'ファミリーマート', match: ['ファミリー', 'ファミマ', 'FamilyMart', 'familymart'] },
      { name: 'ローソン', match: ['ローソン', 'LAWSON', 'lawson'] },
      { name: 'ミニストップ', match: ['ミニストップ', 'MINISTOP', 'ministop'] },
      { name: 'デイリーヤマザキ', match: ['デイリー', 'ヤマザキ', 'Daily'] }
    ];

    for (const kw of storeKeywords) {
      if (kw.match.some(m => text.toLowerCase().includes(m.toLowerCase()))) {
        const matchedLine = lines.find(line => kw.match.some(m => line.toLowerCase().includes(m.toLowerCase())));
        extractedStoreName = matchedLine || kw.name;
        break;
      }
    }

    if (!extractedStoreName && lines.length > 0) {
      extractedStoreName = lines[0];
    }

    // 2. 金額の抽出
    let extractedAmount = 0;
    const amountRegex = /(?:合計|支払|小計|お買上金額|領収金額|合\s*計)[\s:：¥￥]*([0-9,]+)/i;
    const matchAmount = text.match(amountRegex);
    if (matchAmount && matchAmount[1]) {
      extractedAmount = parseInt(matchAmount[1].replace(/,/g, ''), 10);
    } else {
      const amountYenRegex = /([0-9,]+)\s*(?:円|yen)/i;
      const matchYen = text.match(amountYenRegex);
      if (matchYen && matchYen[1]) {
        extractedAmount = parseInt(matchYen[1].replace(/,/g, ''), 10);
      }
    }

    // 3. 日時の抽出
    let extractedDate = '';
    const dateRegex = /(\d{4}|\d{2})[\/\-年](\d{1,2})[\/\-月](\d{1,2})[日\s]?/;
    const timeRegex = /(\d{1,2})[:：](\d{2})/;
    
    const matchDate = text.match(dateRegex);
    const matchTime = text.match(timeRegex);

    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;
    let day = new Date().getDate();
    let hour = new Date().getHours();
    let minute = new Date().getMinutes();

    if (matchDate) {
      let parsedYear = parseInt(matchDate[1], 10);
      if (parsedYear < 100) {
        parsedYear += 2000;
      }
      year = parsedYear;
      month = parseInt(matchDate[2], 10);
      day = parseInt(matchDate[3], 10);
    }

    if (matchTime) {
      hour = parseInt(matchTime[1], 10);
      minute = parseInt(matchTime[2], 10);
    }

    const formatNum = (n: number) => String(n).padStart(2, '0');
    extractedDate = `${year}-${formatNum(month)}-${formatNum(day)}T${formatNum(hour)}:${formatNum(minute)}`;

    // 4. 商品一覧の抽出
    const extractedItems: string[] = [];
    const excludeKeywords = [
      '合計', '小計', '支払', 'お釣', '領収', '課税', '対象', '軽減', '税率', '割引', '値引',
      'クーポン', 'ポイント', '点数', 'クレジットカード', '現金', 'お預', '売上', 'レシート', '番号', '電話'
    ];

    for (const line of lines) {
      if (excludeKeywords.some(kw => line.includes(kw))) {
        continue;
      }

      const itemMatch = line.match(/^(.+?)[\s\t]+[¥￥\*※]?\d+/);
      if (itemMatch && itemMatch[1]) {
        const itemName = itemMatch[1].trim();
        if (itemName.length > 1 && !/^\d+$/.test(itemName)) {
          extractedItems.push(itemName);
        }
      }
    }

    const isImpulse = extractedAmount >= 1000 || hour >= 22 || hour < 5;
    const impulseReasons: string[] = [];
    if (hour >= 22 || hour < 5) impulseReasons.push('深夜利用');
    if (extractedAmount >= 1000) impulseReasons.push('高額支出');

    return {
      storeName: extractedStoreName,
      amount: extractedAmount,
      date: extractedDate,
      items: extractedItems.slice(0, 5),
      isImpulse,
      impulseReasons
    };
  };

  // 本物の OCR.Space API 連携処理
  const runOCR = async (base64Data: string) => {
    setScanState('scanning');
    
    // APIキーの取得（無ければデモ用キーを利用）
    const ocrApiKey = import.meta.env.VITE_OCR_SPACE_API_KEY || 'helloworld';

    try {
      const formData = new FormData();
      formData.append('base64Image', base64Data);
      formData.append('language', 'jpn');
      formData.append('OCREngine', '2'); // 日本語レシートに強い最新エンジン2
      formData.append('isTable', 'true'); // テーブル・表形式を強化

      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: {
          'apikey': ocrApiKey
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`API接続エラー: ${response.status}`);
      }

      const result = await response.json();

      if (result.IsErroredOnProcessing || !result.ParsedResults || result.ParsedResults.length === 0) {
        throw new Error(result.ErrorMessage || 'OCR処理に失敗しました。');
      }

      const parsedText = result.ParsedResults[0].ParsedText;
      console.log('OCR Parsed Text:', parsedText);

      // パーサーの実行
      const parsedData = parseReceiptText(parsedText);

      // フォーム初期値に設定
      setStoreName(parsedData.storeName);
      setAmount(parsedData.amount);
      setDate(parsedData.date);
      setItems(parsedData.items);
      setIsImpulse(parsedData.isImpulse);
      setImpulseReasons(parsedData.impulseReasons);

      setScanState('parsed');
    } catch (e) {
      console.error('OCR.Space API Error:', e);
      
      // 失敗時の手動フォールバック処理
      setStoreName('');
      setAmount(0);
      
      const offset = new Date().getTimezoneOffset() * 60000;
      const localISOTime = (new Date(new Date().getTime() - offset)).toISOString().slice(0, 16);
      setDate(localISOTime);
      
      setItems([]);
      setIsImpulse(false);
      setImpulseReasons([]);

      alert('レシートの読み取りに失敗しました。手動で入力してください。');
      setScanState('parsed'); // 失敗時も手動入力ができるフォーム画面へ切り替える
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64String = event.target.result as string;
          setUploadedImage(base64String);
          runOCR(base64String);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // サンプルレシート用モックスキャン処理
  const startMockScanning = () => {
    setScanState('scanning');
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * PRESET_RECEIPTS.length);
      const preset = PRESET_RECEIPTS[randomIndex];
      const now = new Date();
      
      if (preset.isImpulse && preset.impulseReasons.includes('深夜利用')) {
        now.setHours(23);
        now.setMinutes(45);
        now.setDate(now.getDate() - 1);
      }
      
      const offset = now.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(new Date().getTime() - offset)).toISOString().slice(0, 16);

      setStoreName(preset.storeName);
      setAmount(preset.amount);
      setDate(localISOTime);
      setIsImpulse(preset.isImpulse);
      setImpulseReasons(preset.impulseReasons);
      setItems(preset.items);
      
      setScanState('parsed');
    }, 2000);
  };

  const handleQuickScan = () => {
    const dummyImage = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400" style="background:%23FFF"><rect x="10" y="10" width="280" height="380" fill="none" stroke="%23CCC" stroke-width="2" stroke-dasharray="5,5"/><text x="150" y="50" font-size="20" font-weight="bold" font-family="sans-serif" text-anchor="middle" fill="%23666">RECEIPT</text><line x1="30" y1="80" x2="270" y2="80" stroke="%23EEE" stroke-width="2"/><text x="150" y="200" font-size="14" font-family="sans-serif" text-anchor="middle" fill="%23AAA">Convenience Store Receipt</text></svg>`;
    setUploadedImage(dummyImage);
    startMockScanning();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName || amount <= 0 || !date) return;

    const reasons = [...impulseReasons];
    const hour = new Date(date).getHours();
    
    if ((hour >= 22 || hour < 5) && !reasons.includes('深夜利用')) {
      reasons.push('深夜利用');
    }
    
    if (amount >= 1000 && !reasons.includes('高額支出')) {
      reasons.push('高額支出');
    }

    onAddReceipt({
      storeName,
      amount,
      date,
      isImpulse: isImpulse || reasons.length > 0,
      impulseReasons: isImpulse ? (reasons.length > 0 ? reasons : ['ついで買い']) : [],
      items
    });
    setScanState('idle');
    setUploadedImage(null);
  };

  const handleAddItem = () => {
    if (newItemText.trim()) {
      setItems([...items, newItemText.trim()]);
      setNewItemText('');
    }
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // 電子決済の連携処理 (擬似アニメーション)
  const handleLinkPaymentClick = (provider: string) => {
    if (linkedPayments.includes(provider)) return;
    setLinkingProvider(provider);
    setTimeout(() => {
      onLinkPayment(provider);
      setLinkingProvider(null);
    }, 1500);
  };

  const providers = [
    { id: 'PayPay', name: 'PayPay', color: '#FF003F', bg: '#FFF0F3' },
    { id: 'Suica', name: 'Suica', color: '#00A960', bg: '#F0FFF4' },
    { id: 'RakutenPay', name: '楽天ペイ', color: '#BF0000', bg: '#FFF0F0' },
    { id: 'dBarai', name: 'd払い', color: '#E60012', bg: '#FFF0F0' }
  ];

  return (
    <div>
      <div className="view-title">
        <span>レシート・決済連携</span>
      </div>

      {scanState === 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* レシートカメラエリア */}
          <div 
            style={{
              height: '240px',
              border: '2.5px dashed var(--ios-gray-dark)',
              borderRadius: '24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#FFFFFF',
              cursor: 'pointer',
              padding: '20px',
              boxSizing: 'border-box',
              textAlign: 'center',
              position: 'relative'
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--ios-primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ios-primary)',
              marginBottom: '12px'
            }}>
              <Camera size={28} />
            </div>
            <span style={{ fontSize: '15px', fontWeight: '800', marginBottom: '6px' }}>レシート画像をアップロード</span>
            <span style={{ fontSize: '11px', color: 'var(--ios-text-secondary)', lineHeight: '1.4' }}>
              カメラでレシートを撮影するか、ライブラリから画像を選択して自動で金額と日時を読み取ります。
            </span>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              style={{ display: 'none' }}
            />
          </div>

          {/* クイックシミュレーションボタン */}
          <button 
            type="button" 
            className="ios-btn ios-btn-secondary"
            onClick={handleQuickScan}
            style={{ padding: '12px 20px', fontSize: '14px', borderRadius: '12px' }}
          >
            <Upload size={16} />
            サンプルレシートで自動スキャンを試す
          </button>

          {/* 電子決済自動記録UI (NEW) */}
          <div className="ios-card" style={{ marginTop: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <CreditCard size={18} color="var(--ios-primary)" />
              電子決済自動記録 (将来機能)
            </span>
            
            <p style={{ fontSize: '11px', color: 'var(--ios-text-secondary)', lineHeight: '1.4', margin: '0 0 16px 0' }}>
              普段お使いの電子決済サービスと連携することで、コンビニでの利用履歴を自動で取得・分析できるようになります。
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {providers.map(provider => {
                const isLinked = linkedPayments.includes(provider.id);
                const isLinking = linkingProvider === provider.id;

                return (
                  <div 
                    key={provider.id} 
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: provider.bg,
                      padding: '12px 16px',
                      borderRadius: '16px',
                      border: `1px solid ${provider.color}15`,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* ロゴのモック表現 */}
                      <span style={{ 
                        fontSize: '14px', 
                        fontWeight: '800', 
                        color: '#FFFFFF', 
                        backgroundColor: provider.color, 
                        width: '32px', 
                        height: '32px', 
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'Outfit'
                      }}>
                        {provider.name[0]}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--ios-text-main)' }}>
                        {provider.name}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLinkPaymentClick(provider.id)}
                      disabled={isLinked || isLinking}
                      style={{
                        border: 'none',
                        borderRadius: '10px',
                        padding: '6px 12px',
                        fontSize: '11px',
                        fontWeight: '700',
                        backgroundColor: isLinked ? 'var(--ios-primary)' : isLinking ? '#E5E5EA' : provider.color,
                        color: isLinked || isLinking ? '#FFFFFF' : '#FFFFFF',
                        cursor: isLinked || isLinking ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        minWidth: '70px',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                      }}
                    >
                      {isLinked ? (
                        <>
                          <Check size={12} strokeWidth={3} />
                          連携済
                        </>
                      ) : isLinking ? (
                        <RefreshCw size={12} className="animate-pulse-slow" style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <>
                          <Link size={12} />
                          連携
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
            
            {linkedPayments.length > 0 && (
              <div style={{
                marginTop: '16px',
                padding: '10px',
                backgroundColor: 'var(--ios-primary-light)',
                borderRadius: '10px',
                fontSize: '10px',
                color: '#1B9A5E',
                textAlign: 'center',
                fontWeight: 600
              }}>
                💡 電子決済の自動読み込みにより、サンプル履歴データが登録されました！
              </div>
            )}
          </div>
        </div>
      )}

      {scanState === 'scanning' && (
        <div className="ios-card" style={{ 
          height: '240px', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {uploadedImage && (
            <img 
              src={uploadedImage} 
              alt="Scan Target" 
              style={{ 
                position: 'absolute', 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover', 
                opacity: 0.15 
              }} 
            />
          )}
          
          <div className="scan-laser-line"></div>
          <RefreshCw className="animate-pulse-slow" size={40} color="var(--ios-primary)" style={{ animation: 'spin 2s linear infinite', marginBottom: '16px', zIndex: 11 }} />
          <span style={{ fontSize: '15px', fontWeight: '800', color: 'var(--ios-primary)', zIndex: 11 }}>AIがレシートを解析中...</span>
        </div>
      )}

      {scanState === 'parsed' && (
        <form onSubmit={handleSave} className="ios-card" style={{ padding: '20px', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ios-primary)', fontWeight: '800', fontSize: '15px', marginBottom: '20px', borderBottom: '0.5px solid var(--ios-border)', paddingBottom: '12px' }}>
            <CheckCircle size={20} />
            <span>OCR 読み取り結果 (編集可能)</span>
          </div>

          {/* 店舗名 */}
          <div className="ios-input-group">
            <label className="ios-input-label">店舗名</label>
            <input 
              type="text" 
              className="ios-input" 
              value={storeName} 
              onChange={e => setStoreName(e.target.value)}
              required
              placeholder="例: セブンイレブン 習志野店"
            />
          </div>

          {/* 金額 */}
          <div className="ios-input-group">
            <label className="ios-input-label">金額 (円)</label>
            <input 
              type="number" 
              className="ios-input" 
              value={amount || ''} 
              onChange={e => setAmount(Number(e.target.value))}
              required
              min="1"
              placeholder="金額を入力"
            />
          </div>

          {/* 日時 */}
          <div className="ios-input-group">
            <label className="ios-input-label">日時</label>
            <input 
              type="datetime-local" 
              className="ios-input" 
              value={date} 
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>

          {/* 購入アイテムのリスト */}
          <div className="ios-input-group">
            <label className="ios-input-label">購入商品 (任意)</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input 
                type="text" 
                className="ios-input" 
                value={newItemText} 
                onChange={e => setNewItemText(e.target.value)}
                placeholder="例: モンスターエナジー"
                style={{ flex: 1 }}
              />
              <button 
                type="button" 
                className="ios-btn" 
                onClick={handleAddItem}
                style={{ width: 'auto', padding: '0 16px' }}
              >
                追加
              </button>
            </div>
            
            {items.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                {items.map((item, idx) => (
                  <span 
                    key={idx} 
                    className="ios-badge ios-badge-neutral"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '10px' }}
                  >
                    {item}
                    <button 
                      type="button" 
                      onClick={() => handleRemoveItem(idx)}
                      style={{ border: 'none', background: 'none', color: 'var(--ios-gray-dark)', padding: 0, cursor: 'pointer', fontSize: '11px', display: 'flex' }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 衝動買いセルフチェック */}
          <div className="ios-card" style={{ backgroundColor: isImpulse ? 'var(--ios-red-light)' : '#FAFAFC', border: isImpulse ? '1px solid rgba(255, 59, 48, 0.15)' : '1px solid var(--ios-border)', padding: '14px', borderRadius: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '24px' }}>
            <input 
              type="checkbox" 
              id="impulse-check" 
              checked={isImpulse} 
              onChange={e => {
                setIsImpulse(e.target.checked);
                if (!e.target.checked) setImpulseReasons([]);
                else if (impulseReasons.length === 0) setImpulseReasons(['ついで買い']);
              }}
              style={{
                width: '20px',
                height: '20px',
                accentColor: 'var(--ios-red)',
                cursor: 'pointer',
                marginTop: '2px'
              }}
            />
            <div style={{ flex: 1 }}>
              <label htmlFor="impulse-check" style={{ fontSize: '14px', fontWeight: '700', color: isImpulse ? 'var(--ios-red)' : 'var(--ios-text-main)', cursor: 'pointer' }}>
                これは「衝動買い」ですか？
              </label>
              <p style={{ fontSize: '11px', color: 'var(--ios-text-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
                お腹が空いていないのに寄って買った、深夜につい寄ってしまった、予定外のものを買った等の場合はチェックを入れて習慣を自覚しましょう。
              </p>
              
              {isImpulse && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                  {['深夜利用', '1日複数回', 'ついで買い', 'ストレス解消', 'ご褒美'].map(reason => {
                    const active = impulseReasons.includes(reason);
                    return (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => {
                          if (active) {
                            setImpulseReasons(impulseReasons.filter(r => r !== reason));
                          } else {
                            setImpulseReasons([...impulseReasons, reason]);
                          }
                        }}
                        className={`ios-badge ${active ? 'ios-badge-danger' : 'ios-badge-neutral'}`}
                        style={{ border: 'none', cursor: 'pointer', padding: '5px 10px' }}
                      >
                        {reason}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 送信ボタン */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              type="button" 
              className="ios-btn ios-btn-secondary"
              onClick={() => {
                setScanState('idle');
                setUploadedImage(null);
              }}
              style={{ flex: 1 }}
            >
              再スキャン
            </button>
            <button 
              type="submit" 
              className="ios-btn"
              style={{ flex: 2 }}
            >
              保存する
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default ScanView;
