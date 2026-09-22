export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  apply(docW: number, docH: number, viewW: number, viewH: number, pad = 48): void {
    const scale = Math.min((viewW - pad * 2) / docW, (viewH - pad * 2) / docH);
    if (scale <= 0 || !isFinite(scale)) return;
    this.zoom = scale;
    this.x = (viewW - docW * scale) / 2;
    this.y = (viewH - docH * scale) / 2;
  }

  clamp(docW: number, docH: number, viewW: number, viewH: number): void {
    const minZoom = 0.02;
    const maxZoom = 64;
    if (this.zoom < minZoom) this.zoom = minZoom;
    if (this.zoom > maxZoom) this.zoom = maxZoom;
    const xMax = Math.max(0, docW * this.zoom - viewW / 2);
    const yMax = Math.max(0, docH * this.zoom - viewH / 2);
    const xMin = Math.min(0, -viewW / 2 + docW * this.zoom);
    const yMin = Math.min(0, -viewH / 2 + docH * this.zoom);
    this.x = Math.max(xMin, Math.min(xMax, this.x));
    this.y = Math.max(yMin, Math.min(yMax, this.y));
  }

  toDoc(vx: number, vy: number): { x: number; y: number } {
    return { x: (vx - this.x) / this.zoom, y: (vy - this.y) / this.zoom };
  }

  toViewport(dx: number, dy: number): { x: number; y: number } {
    return { x: dx * this.zoom + this.x, y: dy * this.zoom + this.y };
  }
}

export function viewportFromEvent(
  evt: { clientX: number; clientY: number },
  element: HTMLCanvasElement
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}