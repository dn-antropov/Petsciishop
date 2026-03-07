
import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators, Dispatch } from 'redux';
import { RootState } from '../redux/types';
import { Toolbar } from '../redux/toolbar';
import * as selectors from '../redux/selectors';
import * as screensSelectors from '../redux/screensSelectors';
import { getEffectiveColorPalette } from '../redux/settingsSelectors';
import { openBezelPreview } from '../utils/bezelPreview';
import s from './CanvasToolPanel.module.css';

interface Props {
  canvasGrid: boolean;
  canvasGridBrightness: number;
  setCanvasGrid: (flag: boolean) => void;
  setCanvasGridBrightness: (v: number) => void;
  onBezelPreview: () => void;
}

function CanvasToolPanel({ canvasGrid, canvasGridBrightness, setCanvasGrid, setCanvasGridBrightness, onBezelPreview }: Props) {
  // Slider 1–10, where value N maps to brightness N/10
  const sliderValue = Math.max(1, Math.round(canvasGridBrightness * 10));

  return (
    <>
      <label className={s.gridToggle}>
        <input
          type="checkbox"
          checked={canvasGrid}
          onChange={e => setCanvasGrid(e.target.checked)}
        />
        <span>Grid</span>
      </label>
      <label className={`${s.brightnessLabel} ${!canvasGrid ? s.disabled : ''}`}>
        <span className={s.brightnessText}>Brightness</span>
        <input
          type="range"
          className={s.brightnessSlider}
          min={1}
          max={10}
          step={1}
          disabled={!canvasGrid}
          value={sliderValue}
          onChange={e => setCanvasGridBrightness(parseInt(e.target.value) / 10)}
        />
        <span className={s.brightnessValue}>{sliderValue}</span>
      </label>
      <button className={s.previewBtn} onClick={onBezelPreview}>
        Preview
      </button>
    </>
  );
}

export default connect(
  (state: RootState) => ({
    canvasGrid: state.toolbar.canvasGrid,
    canvasGridBrightness: state.toolbar.canvasGridBrightness,
  }),
  (dispatch: Dispatch) => ({
    ...bindActionCreators({
      setCanvasGrid: Toolbar.actions.setCanvasGrid,
      setCanvasGridBrightness: Toolbar.actions.setCanvasGridBrightness,
    }, dispatch),
    onBezelPreview: () => (dispatch as any)((dispatch: any, getState: any) => {
      const state = getState();
      const fb = selectors.getCurrentFramebuf(state);
      if (!fb) return;
      const { font } = selectors.getCurrentFramebufFont(state);
      const palette = getEffectiveColorPalette(state, screensSelectors.getCurrentScreenFramebufIndex(state));
      openBezelPreview({ ...fb, font }, palette);
    }),
  })
)(CanvasToolPanel);
