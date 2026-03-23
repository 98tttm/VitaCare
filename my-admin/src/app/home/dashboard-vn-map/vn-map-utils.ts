export interface ProvinceCentroid {
  key: string;
  name: string;
  lat: number;
  lng: number;
}

export const TOTAL_VITACARE_STORES = 632;

export function stripVi(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCityField(raw: string | undefined | null): string {
  if (!raw) return '';
  let s = String(raw).trim();
  s = s.replace(/^T[ỉi]nh\s+/i, '').replace(/^Thành phố\s+/i, '').replace(/^TP\.?\s*/i, '').trim();
  return s;
}

export function matchProvince(
  label: string,
  provinces: ProvinceCentroid[]
): ProvinceCentroid | null {
  const a = stripVi(normalizeCityField(label));
  if (!a) return null;

  const tryMatch = (pred: (p: ProvinceCentroid) => boolean) => {
    const hit = provinces.find(pred);
    return hit ?? null;
  };

  if (a.includes('ho chi minh') || a === 'hcm' || a.includes('tp hcm')) {
    return tryMatch((p) => stripVi(p.name).includes('ho chi minh'));
  }
  if (a.includes('ha noi') || a === 'hn') {
    return tryMatch((p) => stripVi(p.name).includes('ha noi'));
  }
  if (a.includes('can tho')) {
    return tryMatch((p) => stripVi(p.name).includes('can tho'));
  }
  if (a.includes('da nang')) {
    return tryMatch((p) => stripVi(p.name).includes('da nang'));
  }

  for (const p of provinces) {
    const b = stripVi(p.name.replace(/\s+city\s*$/i, ''));
    if (!b) continue;
    if (a === b || a.includes(b) || b.includes(a)) return p;
  }
  return null;
}

export function matchProvinceFromPharmacyText(
  text: string,
  provinces: ProvinceCentroid[]
): ProvinceCentroid | null {
  const t = stripVi(text);
  if (!t) return null;
  for (const p of provinces) {
    const b = stripVi(p.name.replace(/\s+city\s*$/i, ''));
    if (b && t.includes(b)) return p;
  }
  if (t.includes('ho chi minh') || t.includes('hcm') || t.includes('tp hcm')) {
    return provinces.find((p) => stripVi(p.name).includes('ho chi minh')) ?? null;
  }
  if (t.includes('ha noi')) {
    return provinces.find((p) => stripVi(p.name).includes('ha noi')) ?? null;
  }
  return null;
}

export function distributeStores(total: number, provinces: ProvinceCentroid[]): Map<string, number> {
  const weights = provinces.map((p) => {
    let h = 0;
    for (let i = 0; i < p.name.length; i++) {
      h = (h * 31 + p.name.charCodeAt(i)) >>> 0;
    }
    return 8 + (h % 120);
  });
  const wsum = weights.reduce((x, y) => x + y, 0);
  const map = new Map<string, number>();
  let allocated = 0;
  provinces.forEach((p, i) => {
    const c = Math.floor((total * weights[i]) / wsum);
    map.set(p.name, c);
    allocated += c;
  });
  let rem = total - allocated;
  let idx = 0;
  while (rem > 0) {
    const name = provinces[idx % provinces.length].name;
    map.set(name, (map.get(name) || 0) + 1);
    rem--;
    idx++;
  }
  return map;
}

export function sampleStores(
  provinceName: string,
  count: number
): { name: string; address: string }[] {
  const n = Math.min(6, Math.max(1, Math.ceil(Math.min(count, 632) / 120)));
  return Array.from({ length: n }, (_, i) => ({
    name: `VitaCare ${provinceName} · CH ${String(i + 1).padStart(3, '0')}`,
    address: `Điểm bán ${i + 1} — khu vực ${provinceName}`
  }));
}

export interface ProvinceOrderAgg {
  total: number;
  homeDelivery: number;
  pharmacyPickup: number;
  samples: any[];
}

export function aggregateOrdersByProvince(
  orders: any[],
  provinces: ProvinceCentroid[]
): Map<string, ProvinceOrderAgg> {
  const m = new Map<string, ProvinceOrderAgg>();
  for (const o of orders || []) {
    const atPh = !!o?.atPharmacy;
    const pc = atPh
      ? matchProvinceFromPharmacyText(String(o?.pharmacyAddress || ''), provinces)
      : matchProvince(normalizeCityField(o?.shippingInfo?.address?.city), provinces);
    if (!pc) continue;
    const key = pc.name;
    if (!m.has(key)) {
      m.set(key, { total: 0, homeDelivery: 0, pharmacyPickup: 0, samples: [] });
    }
    const s = m.get(key)!;
    s.total++;
    if (atPh) s.pharmacyPickup++;
    else s.homeDelivery++;
    if (s.samples.length < 10) s.samples.push(o);
  }
  return m;
}
