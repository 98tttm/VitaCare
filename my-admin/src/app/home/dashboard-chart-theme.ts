/**
 * Bảng màu VitaCare (đồng bộ color-system / --vc-*) cho Chart.js trên trang Tổng quan.
 */

export const VC = {
  primary: '#00589f',
  primaryLight: '#43a2e6',
  primarySoft: '#daecff',
  primaryHover: '#2b3e66',
  warning: '#f59e0b',
  warningHover: '#d97706',
  danger: '#c42326',
  info: '#b9a6dc',
  infoStrong: '#7b63c6',
  neutral: '#757575',
  neutralMuted: '#9e9e9e',
} as const;

export function vcRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Hiệu ứng vẽ mượt — Chart.js hỗ trợ easing dạng chuỗi */
export const chartAnimation = {
  duration: 1000,
  easing: 'easeOutQuart' as const,
};

export function doughnutSegmentBorder(isDark: boolean): string {
  return isDark ? 'rgba(15, 23, 42, 0.78)' : '#ffffff';
}

export const doughnutPaletteDark = {
  blueStrong: '#63c7ee',
  blue: '#61afd8',
  blueDeep: '#6f8fff',
  purple: '#b39cf2',
  amber: '#e3bb56',
  red: '#dc7f88',
  slate: '#a9b6c8',
} as const;

/** Vùng dưới đường: gradient xanh → tím (theo đường chéo nhẹ) */
export function revenueFillGradient(
  ctx: CanvasRenderingContext2D,
  chartArea: { top: number; bottom: number; left: number; right: number }
): CanvasGradient {
  const g = ctx.createLinearGradient(
    chartArea.left,
    chartArea.top,
    chartArea.right,
    chartArea.bottom
  );
  g.addColorStop(0, vcRgba(VC.primary, 0.34));
  g.addColorStop(0.38, vcRgba(VC.primaryLight, 0.15));
  g.addColorStop(0.68, vcRgba(VC.infoStrong, 0.11));
  g.addColorStop(1, vcRgba(VC.info, 0.04));
  return g;
}

/** Viền đường line: trái xanh → phải tím (theo trục thời gian) */
export function revenueLineStrokeGradient(
  ctx: CanvasRenderingContext2D,
  chartArea: { left: number; right: number }
): CanvasGradient {
  const g = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
  g.addColorStop(0, VC.primary);
  g.addColorStop(0.45, VC.primaryLight);
  g.addColorStop(1, VC.infoStrong);
  return g;
}

/** 5 trạng thái đơn thuốc / tư vấn đơn thuốc: chờ → … → hủy */
export const prescriptionStatusColors = [
  vcRgba(VC.warning, 0.95),
  vcRgba(VC.primary, 0.92),
  vcRgba(VC.neutralMuted, 0.88),
  vcRgba(VC.primaryLight, 0.9),
  vcRgba(VC.danger, 0.88),
] as const;
