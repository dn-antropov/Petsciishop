import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { Toolbar } from '../redux/toolbar';
import * as framebufActions from '../redux/editor';
import * as selectors from '../redux/selectors';
import { RootState, ScreenMetadata } from '../redux/types';
import Modal from '../components/Modal';
import styles from './ScreenInfoModal.module.css';

const MAX_METADATA_BYTES = 128;

function metadataByteSize(name: string, author: string, date: string, description: string): number {
  const enc = new TextEncoder();
  let size = 1; // flags byte
  const nameBytes = name ? enc.encode(name).length : 0;
  const authorBytes = author ? enc.encode(author).length : 0;
  const descriptionBytes = description ? enc.encode(description).length : 0;
  if (nameBytes > 0) size += 1 + nameBytes;
  if (authorBytes > 0) size += 1 + authorBytes;
  if (date) size += 3;
  if (descriptionBytes > 0) size += 1 + descriptionBytes;
  return size;
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

  useEffect(() => {
    if (show) {
      setName(metadata?.name ?? '');
      setAuthor(metadata?.author ?? '');
      setDate(metadata?.date ?? '');
      setDescription(metadata?.description ?? '');
      setShortcutsActive(false);
    } else {
      setShortcutsActive(true);
    }
  }, [show, metadata]);

  const byteSize = useMemo(
    () => metadataByteSize(name, author, date, description),
    [name, author, date, description]
  );

  const hasAnyField = !!(name || author || date || description);
  const effectiveSize = hasAnyField ? byteSize : 0;
  const overBudget = effectiveSize > MAX_METADATA_BYTES;

  const handleSave = useCallback(() => {
    if (framebufIndex === undefined || overBudget) return;
    const trimmed: ScreenMetadata = {
      name: name.trim() || undefined,
      author: author.trim() || undefined,
      date: date || undefined,
      description: description.trim() || undefined,
    };
    setMetadata(trimmed, framebufIndex);
    setShortcutsActive(true);
    onClose();
  }, [framebufIndex, name, author, date, description, overBudget, setMetadata, onClose, setShortcutsActive]);

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
          <input
            className={styles.input}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={48}
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Author</label>
          <input
            className={styles.input}
            type="text"
            value={author}
            onChange={e => setAuthor(e.target.value)}
            maxLength={48}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Date</label>
          <input
            className={styles.input}
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Description</label>
          <textarea
            className={styles.textarea}
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        <div className={overBudget ? styles.budgetOver : styles.budget}>
          {effectiveSize} / {MAX_METADATA_BYTES} bytes
        </div>

        <div className={styles.buttons}>
          <button className={styles.cancelBtn} onClick={handleClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={overBudget}>Save</button>
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
