/** Public LRO WAC mosaic tiles (NASA Trek). CORS allows browser use; nothing is stored in the repo.

Zoom 2 is a 2:1 equirectangular grid. Trek also publishes one extra seam column (x = 8); it is omitted.
https://trek.nasa.gov/moon/
*/
const TREK =
  "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm";

const ZOOM = 2;
const COLS = 8;
const ROWS = 4;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`NASA Trek tile failed: ${url}`));
    img.src = url;
  });
}

export async function loadTrekAlbedo(): Promise<HTMLCanvasElement> {
  const tiles = await Promise.all(
    Array.from({ length: ROWS }, (_, y) =>
      Promise.all(Array.from({ length: COLS }, (_, x) => loadImage(`${TREK}/${ZOOM}/${y}/${x}.jpg`))),
    ),
  );
  const tw = tiles[0][0].naturalWidth;
  const th = tiles[0][0].naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = tw * COLS;
  canvas.height = th * ROWS;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the NASA Trek mosaic.");
  tiles.forEach((row, y) => row.forEach((img, x) => ctx.drawImage(img, x * tw, y * th)));
  return canvas;
}
