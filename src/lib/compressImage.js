// Browser-only helper: resize and JPEG-compress an image File into a small
// data URL, so large photos never get stored full-size in the database.
// Returns a Promise<string> (a `data:image/jpeg;base64,...` URL).
export function compressImageFile(file, { maxSize = 1400, quality = 0.75 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load the image"));
      img.onload = () => {
        const longestSide = Math.max(img.width, img.height) || 1;
        const scale = Math.min(1, maxSize / longestSide);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas is not available"));
          return;
        }
        // Flatten any transparency onto white so JPEG export looks right.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
