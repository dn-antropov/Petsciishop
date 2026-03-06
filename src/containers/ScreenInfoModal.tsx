import React, { useState, useEffect, useCallback } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { Toolbar } from '../redux/toolbar';
import * as framebufActions from '../redux/editor';
import * as selectors from '../redux/selectors';
import { RootState, ScreenMetadata } from '../redux/types';
import Modal from '../components/Modal';
import styles from './ScreenInfoModal.module.css';

const MAX_NAME_CHARS = 48;
const MAX_AUTHOR_CHARS = 48;
const MAX_DESCRIPTION_CHARS = 128;
const MONTH_CODES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const URL_RE = /(https?:\/\/[^\s]+)/g;

function formatDateForView(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const year = m[1];
  const monthIdx = parseInt(m[2], 10) - 1;
  const day = m[3];
  if (monthIdx < 0 || monthIdx > 11) return date;
  return `${day}/${MONTH_CODES[monthIdx]}/${year}`;
}

function renderTextWithLinks(text: string): React.ReactNode {
  if (!text) return '-';
  const parts = text.split(URL_RE);
  return parts.map((part, idx) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={idx} href={part} target="_blank" rel="noreferrer" className={styles.inlineLink}>
          {part}
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

interface StateProps {
  show: boolean;
  framebufIndex?: number;
  metadata?: ScreenMetadata;
}

interface DispatchProps {
  onClose: () => void;
  setMetadata: (data: ScreenMetadata, framebufIndex: number) => void;
  setShortcutsActive: (flag: boolean) => void;
}

function ScreenInfoModal({ show, framebufIndex, metadata, onClose, setMetadata, setShortcutsActive }: StateProps & DispatchProps) {
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (show) {
      setName(metadata?.name ?? '');
      setAuthor(metadata?.author ?? '');
      setDate(metadata?.date ?? '');
      setDescription(metadata?.description ?? '');
      setIsEditing(false);
      setShortcutsActive(false);
    } else {
      setShortcutsActive(true);
    }
  }, [show, metadata]);

  const handleNameChange = useCallback((nextName: string) => {
    setName(nextName.slice(0, MAX_NAME_CHARS));
  }, []);

  const handleAuthorChange = useCallback((nextAuthor: string) => {
    setAuthor(nextAuthor.slice(0, MAX_AUTHOR_CHARS));
  }, []);

  const handleDescriptionChange = useCallback((nextDescription: string) => {
    setDescription(nextDescription.slice(0, MAX_DESCRIPTION_CHARS));
  }, []);

  const handleDateChange = useCallback((nextDate: string) => {
    setDate(nextDate);
  }, []);

  const handleSave = useCallback(() => {
    if (!isEditing || framebufIndex === undefined) return;
    const trimmed: ScreenMetadata = {
      name: name.trim() || undefined,
      author: author.trim() || undefined,
      date: date || undefined,
      description: description.trim() || undefined,
    };
    setMetadata(trimmed, framebufIndex);
    setShortcutsActive(true);
    onClose();
  }, [isEditing, framebufIndex, name, author, date, description, setMetadata, onClose, setShortcutsActive]);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleDiscardEdits = useCallback(() => {
    setName(metadata?.name ?? '');
    setAuthor(metadata?.author ?? '');
    setDate(metadata?.date ?? '');
    setDescription(metadata?.description ?? '');
    setIsEditing(false);
  }, [metadata]);

  const handleClose = useCallback(() => {
    setShortcutsActive(true);
    onClose();
  }, [onClose, setShortcutsActive]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  }, [handleClose]);

  return (
    <Modal showModal={show}>
      <div className={styles.container} onKeyDown={handleKeyDown}>
        <div className={styles.title}>Screen Info</div>

        <div className={styles.field}>
          <label className={styles.label}>Name</label>
          {isEditing ? (
            <>
              <input
                className={styles.input}
                type="text"
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                maxLength={MAX_NAME_CHARS}
                autoFocus
              />
              <div className={styles.fieldCounter}>{name.length} / {MAX_NAME_CHARS}</div>
            </>
          ) : (
            <div className={name ? styles.valueTextPlain : styles.valueTextEmpty}>{renderTextWithLinks(name)}</div>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Author</label>
          {isEditing ? (
            <>
              <input
                className={styles.input}
                type="text"
                value={author}
                onChange={e => handleAuthorChange(e.target.value)}
                maxLength={MAX_AUTHOR_CHARS}
              />
              <div className={styles.fieldCounter}>{author.length} / {MAX_AUTHOR_CHARS}</div>
            </>
          ) : (
            <div className={author ? styles.valueTextPlain : styles.valueTextEmpty}>{renderTextWithLinks(author)}</div>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Date</label>
          {isEditing ? (
            <input
              className={styles.input}
              type="date"
              value={date}
              onChange={e => handleDateChange(e.target.value)}
            />
          ) : (
            <div className={date ? styles.valueTextPlain : styles.valueTextEmpty}>{date ? formatDateForView(date) : '-'}</div>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Description</label>
          {isEditing ? (
            <>
              <textarea
                className={styles.textarea}
                value={description}
                onChange={e => handleDescriptionChange(e.target.value)}
                maxLength={MAX_DESCRIPTION_CHARS}
                rows={2}
              />
              <div className={styles.fieldCounter}>{description.length} / {MAX_DESCRIPTION_CHARS}</div>
            </>
          ) : (
            <div className={description ? styles.valueTextPlain : styles.valueTextEmpty}>{renderTextWithLinks(description)}</div>
          )}
        </div>

        <div className={styles.buttons}>
          {!isEditing ? (
            <>
              <button className={styles.cancelBtn} onClick={handleClose}>Close</button>
              <button className={styles.editBtn} onClick={handleStartEdit}>Edit</button>
            </>
          ) : (
            <>
              <button className={styles.cancelBtn} onClick={handleDiscardEdits}>Discard</button>
              <button className={styles.saveBtn} onClick={handleSave}>Save</button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default connect(
  (state: RootState) => {
    const { show, framebufIndex } = state.toolbar.showScreenInfo;
    const fb = framebufIndex !== undefined ? selectors.getFramebufByIndex(state, framebufIndex) : null;
    return {
      show,
      framebufIndex,
      metadata: fb?.metadata,
    };
  },
  (dispatch) => ({
    onClose: () => dispatch(Toolbar.actions.setShowScreenInfo({ show: false })),
    setMetadata: bindActionCreators(framebufActions.actions.setMetadata, dispatch),
    setShortcutsActive: bindActionCreators(Toolbar.actions.setShortcutsActive, dispatch),
  })
)(ScreenInfoModal);
