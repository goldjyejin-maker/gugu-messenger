import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MAX_CATEGORIES } from '../types';
import type { Category } from '../types';

interface Props {
  categories: Category[];
  onAdd(name: string): void; onRename(id: string, name: string): void; onDelete(id: string): void;
  onClose(): void;
}

/** 카테고리 관리 창: 추가 / 이름 변경 / 삭제 (최대 3개) */
export default function CategoryManager({ categories, onAdd, onRename, onDelete, onClose }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState('');
  const full = categories.length >= MAX_CATEGORIES;

  const save = (id: string) => { if (text.trim()) onRename(id, text); setEditing(null); };

  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="카테고리 관리" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><b>카테고리 관리</b><button className="icon" aria-label="닫기" onClick={onClose}>✕</button></div>
        <p className="muted sm">최대 {MAX_CATEGORIES}개까지 만들 수 있어요. 삭제해도 안의 채널은 사라지지 않아요.</p>
        <ul className="catlist">
          {categories.map(c => (
            <li key={c.id}>
              {editing === c.id ? (
                <form onSubmit={e => { e.preventDefault(); save(c.id); }}>
                  <input value={text} onChange={e => setText(e.target.value)} maxLength={20} autoFocus />
                  <button className="primary sm" disabled={!text.trim()}>저장</button>
                  <button type="button" className="plainbtn" onClick={() => setEditing(null)}>취소</button>
                </form>
              ) : (
                <>
                  <span className="nm">📁 {c.name}</span>
                  <button className="plainbtn" onClick={() => { setEditing(c.id); setText(c.name); }}>이름 변경</button>
                  <button className="plainbtn danger" onClick={() => {
                    if (confirm(`'${c.name}' 카테고리를 삭제할까요?\n안의 채널은 삭제되지 않고 '카테고리 없음'으로 옮겨져요.`)) onDelete(c.id);
                  }}>삭제</button>
                </>
              )}
            </li>
          ))}
          {categories.length === 0 && <li className="muted sm">아직 카테고리가 없어요</li>}
        </ul>
        <form className="addrow" onSubmit={e => { e.preventDefault(); if (adding.trim() && !full) { onAdd(adding); setAdding(''); } }}>
          <input placeholder={full ? `${MAX_CATEGORIES}개를 모두 만들었어요` : '새 카테고리 이름 (예: 중등부)'} value={adding}
            onChange={e => setAdding(e.target.value)} maxLength={20} disabled={full} />
          <button className="primary" disabled={full || !adding.trim()}>추가 ({categories.length}/{MAX_CATEGORIES})</button>
        </form>
      </div>
    </div>,
    document.body
  );
}
