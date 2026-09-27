export const MAP_TILE_SIZE = 256;
export type MapPosition = { lat: number; lon: number };
export type MapTile = { x: number; y: number; left: number; top: number; center: boolean };

export function toPixels({ lat, lon }: MapPosition, zoom: number) {
  const size = MAP_TILE_SIZE * 2 ** zoom;
  const radians = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * size, y: ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * size };
}

export function fromPixels(x: number, y: number, zoom: number): MapPosition {
  const size = MAP_TILE_SIZE * 2 ** zoom;
  return {
    lon: (((x / size) * 360) % 360 + 360) % 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * Math.max(0, Math.min(size, y))) / size))) * 180) / Math.PI,
  };
}

export function visibleTiles(center: MapPosition, zoom: number, width: number, height: number): MapTile[] {
  const world = toPixels(center, zoom);
  const firstX = Math.floor((world.x - width / 2) / MAP_TILE_SIZE);
  const lastX = Math.floor((world.x + width / 2) / MAP_TILE_SIZE);
  const firstY = Math.floor((world.y - height / 2) / MAP_TILE_SIZE);
  const lastY = Math.floor((world.y + height / 2) / MAP_TILE_SIZE);
  const max = 2 ** zoom;
  const tiles: MapTile[] = [];
  for (let y = firstY; y <= lastY; y += 1) {
    if (y < 0 || y >= max) continue;
    for (let x = firstX; x <= lastX; x += 1) tiles.push({
      x: ((x % max) + max) % max, y,
      left: x * MAP_TILE_SIZE - world.x + width / 2,
      top: y * MAP_TILE_SIZE - world.y + height / 2,
      center: x === Math.floor(world.x / MAP_TILE_SIZE) && y === Math.floor(world.y / MAP_TILE_SIZE),
    });
  }
  return tiles;
}

export function pointAtOffset(center: MapPosition, zoom: number, x: number, y: number): MapPosition {
  const origin = toPixels(center, zoom);
  return fromPixels(origin.x + x, origin.y + y, zoom);
}
