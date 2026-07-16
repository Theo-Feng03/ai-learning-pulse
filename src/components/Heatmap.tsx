// 90 天学习热力图：纯 CSS Grid 实现，只统计已发布记录。
// 可访问性：每个格子提供 title 文本；下方提供文字统计替代。

interface HeatmapProps {
  data: Array<{ date: string; count: number }>;
  days?: number;
}

function cellColor(count: number): string {
  if (count === 0) return "bg-stone-100";
  if (count === 1) return "bg-emerald-200";
  if (count === 2) return "bg-emerald-400";
  return "bg-emerald-600";
}

export function Heatmap({ data, days = 90 }: HeatmapProps) {
  const recent = data.slice(-days);
  const total = recent.reduce((sum, d) => sum + d.count, 0);
  const activeDays = recent.filter((d) => d.count > 0).length;

  return (
    <div>
      <div
        className="grid grid-flow-col grid-rows-7 gap-1"
        role="img"
        aria-label={`最近 ${days} 天学习热力图：共 ${total} 条已发布记录，${activeDays} 个活跃日`}
      >
        {recent.map((d) => (
          <div
            key={d.date}
            title={`${d.date}：${d.count} 条已发布学习记录`}
            className={`h-3 w-3 rounded-sm ${cellColor(d.count)}`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-stone-500">
        最近 {days} 天：{total} 条已发布记录，{activeDays} 个活跃日（草稿与未发布记录不计入）
      </p>
    </div>
  );
}
