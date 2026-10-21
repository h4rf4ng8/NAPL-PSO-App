export const renderCardToBlob = async (container: HTMLElement | null, signal?: AbortSignal) => {
  signal?.throwIfAborted();
  if (!container) throw new Error('Card not ready');
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('Card SVG not found');
  const clone = svg.cloneNode(true);
  if (!(clone instanceof SVGElement)) throw new TypeError('Card SVG unavailable');
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : (svg.clientWidth || 320);
  const h = vb && vb.height ? vb.height : (svg.clientHeight || 510);
  const scale = 3; // retina-quality export
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const toDataUri = async (src: string) => {
    const resp = await fetch(src, { mode: 'cors', signal });
    if (!resp.ok) throw new Error('Image unavailable');
    const blob = await resp.blob();
    signal?.throwIfAborted();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      const abort = () => {
        r.abort();
        reject(signal?.reason);
      };
      signal?.addEventListener('abort', abort, { once: true });
      r.addEventListener('loadend', () => signal?.removeEventListener('abort', abort), { once: true });
      r.addEventListener('load', () => {
        if (typeof r.result === 'string') resolve(r.result);
        else reject(new Error('Image read failed'));
      });
      r.addEventListener('error', reject, { once: true });
      r.readAsDataURL(blob);
    });
  };
  const imgEls = [...clone.querySelectorAll('image')];
  await Promise.all(imgEls.map(async (el) => {
    const href = el.getAttribute('href') || el.getAttribute('xlink:href');
    if (href && !href.startsWith('data:')) {
      try {
        const dataUri = await toDataUri(href);
        el.setAttribute('href', dataUri);
        el.removeAttribute('xlink:href');
      } catch {
        el.remove();
      }
    }
  }));

  signal?.throwIfAborted();
  const svgString = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let abortImage: (() => void) | undefined;
    try {
      await new Promise((resolve, reject) => {
        abortImage = () => {
          img.src = '';
          reject(signal?.reason);
        };
        signal?.addEventListener('abort', abortImage, { once: true });
        img.addEventListener('load', resolve);
        img.addEventListener('error', () => reject(new Error('Could not load card image')), { once: true });
        img.src = url;
      });
    } finally {
      if (abortImage) signal?.removeEventListener('abort', abortImage);
    }

    signal?.throwIfAborted();
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Export failed')), 'image/png');
    });
    signal?.throwIfAborted();
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const downloadCardBlob = (blob: Blob, username: string) => {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.download = `${username}-ASL-card.png`;
  link.href = url;
  try {
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};
