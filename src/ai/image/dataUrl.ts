/** Decode a data URL into an offscreen-backed HTMLCanvasElement. */

export function imageDataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Could not decode image data URL"));
    img.src = dataUrl;
  });
}

export function canvasToDataUrl(canvas: HTMLCanvasElement, type = "image/png"): string {
  return canvas.toDataURL(type);
}