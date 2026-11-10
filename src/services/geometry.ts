type Position = number[];
type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
type Feature = { type: 'Feature'; geometry: Geometry; properties?: Record<string, unknown> };
type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };
export function createOutsideMask(boundary: FeatureCollection): FeatureCollection {
  const holes: Position[][] = [];
  for (const feature of boundary.features) {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) if (polygon[0]?.length >= 4) holes.push(polygon[0]);
  }
  if (!holes.length) return { type: 'FeatureCollection', features: [] };
  const outer = [[-179.999,-85],[179.999,-85],[179.999,85],[-179.999,85],[-179.999,-85]];
  return { type: 'FeatureCollection', features: [{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[outer,...holes]}}] };
}
