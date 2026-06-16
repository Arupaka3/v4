import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import type { Receipt } from '../types';

interface EditReceiptModalProps {
  receipt: Receipt;
  onClose: () => void;
  onSave: (updated: Omit<Receipt, 'id'>) => void;
}

const EditReceiptModal: React.FC<EditReceiptModalProps> = ({ receipt, onClose, onSave }) => {
  const [storeName, setStoreName] = useState(receipt.storeName);
  const [amount, setAmount] = useState<number>(receipt.amount);
  const [items, setItems] = useState<string[]>(receipt.items || []);
  const [newItemText, setNewItemText] = useState('');

  const handleAddItem = () => {
    if (newItemText.trim()) {
      setItems([...items, newItemText.trim()]);
      setNewItemText('');
    }
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName || amount <= 0) return;

    onSave({
      storeName,
      amount,
      date: receipt.date, // 日時は既存のものを維持
      isImpulse: receipt.isImpulse, // 衝動買いフラグと理由も既存を引き継ぐ
      impulseReasons: receipt.impulseReasons,
      items
    });
  };

  return (
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
        maxHeight: '85%',
        backgroundColor: 'var(--ios-bg)',
        borderTopLeftRadius: '24px',
        borderTopRightRadius: '24px',
        padding: '20px 16px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideUp 0.3s cubic-bezier(0.1, 0.8, 0.3, 1)'
      }}>
        {/* ヘッダー */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '0.5px solid var(--ios-border)'
        }}>
          <span style={{ fontSize: '18px', fontWeight: '800' }}>履歴を編集</span>
          <button 
            type="button"
            onClick={onClose}
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

        {/* 編集フォーム */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', paddingBottom: '20px' }}>
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

          {/* 購入アイテムのリスト */}
          <div className="ios-input-group" style={{ marginBottom: '24px' }}>
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

          {/* アクションボタン */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              type="button" 
              className="ios-btn ios-btn-secondary"
              onClick={onClose}
              style={{ flex: 1 }}
            >
              キャンセル
            </button>
            <button 
              type="submit" 
              className="ios-btn"
              style={{ flex: 2 }}
            >
              <Check size={18} />
              保存する
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditReceiptModal;
