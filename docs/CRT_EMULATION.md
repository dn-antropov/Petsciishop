# CRT Emulation in Petscii Shop

## Overview

The bezel preview renders PETSCII artwork as it would appear on a Commodore 1702 color monitor — a 13-inch JVC-manufactured slot-mask CRT with 0.64mm dot pitch, typically connected via composite or S-Video.

The CRT simulation runs entirely on Canvas 2D (no WebGL) and produces a static composited PNG at 1280x720. All effects are applied to the screen region inside the transparent bezel overlay.

## Research Sources

The CRT pipeline is informed by:

- **VICE emulator** (`/vice/src/video/`) — CPU-only PAL/NTSC CRT rendering. Key techniques: scanline shade at 75% brightness (not black bars), 3-tap horizontal luma blur, PAL delay-line chrominance averaging. VICE does NOT implement bloom, vignette, or phosphor mask.
- **CRT-Royale shader** (libretro) — gold standard GPU CRT emulation. Beam Gaussian profile with brightness-dependent width (`0.3 + 0.1 * brightness^3`), generalized Gaussian scanline shape, phosphor mask tiles.
- **int10h/FFcrt** — CPU-based CRT transform for FFmpeg. Halation radius ~30px, alpha 0.12, bloom factor 0.65, horizontal pixel blur 50%.
- **Commodore 1702 hardware** — slot mask (not shadow mask or aperture grille), NTSC composite, ~200 visible scanlines in 240-line active area.

## Compositing Pipeline

Effects are applied in this order (`src/utils/bezelPreview.ts`):

### 1. Source Image with Color Boost

The PETSCII framebuffer is rendered to canvas with nearest-neighbor scaling (no interpolation) and a mild CSS filter boost:

```
brightness(1.1) contrast(1.15) saturate(1.1)
```

This compensates for the overall dimming that CRT effects introduce and adds the slightly oversaturated look of a composite CRT.

### 2. Analog Horizontal Softness

A 0.6px Gaussian blur applied to the screen region simulates the bandwidth-limited analog signal path of the 1702. Real composite video produces noticeable horizontal softness while vertical edges stay relatively sharp. Canvas 2D blur is isotropic, so we keep the radius very small.

### 3. Phosphor Bloom / Halation

A wider 4px blur of the screen content is composited back using `globalCompositeOperation = 'screen'` at 10% alpha. This simulates the diffuse glow that CRT phosphors produce — light scatters through the glass faceplate, creating a soft halo around bright areas.

Parameters:
- Blur radius: 4px (at 720p)
- Blend mode: `screen`
- Alpha: 0.10

### 4. Brightness-Dependent Scanlines

Every 3rd output row receives a semi-transparent black bar. The key insight from CRT physics: **bright scanlines should show less gap**.

On a real CRT, the electron beam physically widens at higher voltages (brighter pixels), causing the phosphor glow to fill the inter-scanline gap. Dark pixels produce a thin beam with a visible dark gap between lines.

Implementation:
- Read back screen pixels with `getImageData`
- Compute per-row average luminance (fast weighted sum: `R*0.299 + G*0.587 + B*0.114`)
- Modulate scanline alpha: `alpha = baseAlpha * (1.0 - brightness * bloomFactor)`
- Base alpha: 0.28 (max darkness for fully black rows)
- Bloom factor: 0.55 (how much bright rows reduce the scanline)

This matches VICE's approach (scanlines at 75% brightness, not black) but adds the brightness-dependent beam width from CRT-Royale.

### 5. Vignette

A multi-stop radial gradient darkens the screen edges and corners, simulating beam deflection angle falloff and phosphor efficiency reduction at the CRT periphery.

Gradient stops (from center outward):
- 0%: transparent
- 60%: 2% black
- 85%: 18% black
- 100%: 35% black

This is deliberately subtle — the 1702 is a well-made monitor with relatively even illumination. Consumer TVs would have more aggressive vignetting.

### 6. Brightness Compensation

A final 12% brightness boost (`brightness(1.12)`) compensates for the cumulative darkening from scanlines, bloom compositing, and vignette. Without this, the CRT image looks too dim compared to the original.

### 7. Bezel Overlay

The Commodore 1702 bezel frame (WebP with transparent screen hole) is drawn on top. The CRT-treated PETSCII image shows through the transparency.

## Commodore 1702 Monitor Characteristics

| Property | Value |
|----------|-------|
| Tube | Hitachi 370KNB22, 13-inch |
| Mask type | Slot mask (vertical phosphor stripes) |
| Dot pitch | 0.64mm |
| Aspect ratio | 4:3 |
| Signal | NTSC composite / S-Video |
| Visible scanlines | ~200 in 240-line active area |
| Manufacturer | JVC (for Commodore) |

## What We Don't Simulate (Yet)

- **Phosphor mask / slot mask pattern** — the RGB sub-pixel stripe pattern visible on close inspection. Would require a tiled `createPattern` with `multiply` compositing. Omitted because at 720p the tile would be 2-3 pixels wide, below the threshold of natural appearance.
- **Chromatic aberration** — slight R/G/B channel misregistration toward screen edges. Would require `getImageData` per-pixel channel offset. Omitted for performance.
- **Screen curvature** — barrel distortion of the CRT glass. Would require pixel remapping. The bezel overlay photo already captures some visual curvature.
- **PAL delay-line color artifacts** — the characteristic PAL chroma averaging that VICE simulates. Only relevant for PAL signal path; our source is already in RGB.
- **Phosphor persistence / decay** — temporal effect, not applicable to a static screenshot.
- **Interlace flicker** — temporal effect, not applicable to a static screenshot.

## Tuning Parameters

All values are in `src/utils/bezelPreview.ts`:

| Parameter | Current Value | Range | Effect |
|-----------|--------------|-------|--------|
| Analog blur | 0.6px | 0-2px | Horizontal softness |
| Bloom blur | 4px | 2-8px | Phosphor glow radius |
| Bloom alpha | 0.10 | 0.05-0.20 | Glow intensity |
| Scanline pitch | 3px | 2-4px | Gap between scan lines |
| Scanline base alpha | 0.28 | 0.15-0.40 | Max darkness (black rows) |
| Scanline bloom factor | 0.55 | 0.3-0.7 | Bright row gap reduction |
| Vignette corner darkness | 0.35 | 0.2-0.5 | Edge/corner dimming |
| Brightness compensation | 1.12x | 1.0-1.3x | Offset darkening |
| Color boost | 1.1/1.15/1.1 | varies | Initial saturation/contrast |
