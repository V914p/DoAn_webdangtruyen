function formatValue(value) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function TagAnalyticsChart({ title, description, data, color, accentColor, metricLabel }) {
  const maxValue = Math.max(...data.map((item) => item.secondary || 0), 1);

  return (
    <article className="detail-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Chart</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-950/45 px-3 py-1.5 text-xs text-slate-300">
          {data.length} tags plotted
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-400">{description}</p>

      <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950/55 p-4">
        {data.length ? (
          <div className="space-y-3">
            {data.map((item) => {
              const value = item.secondary || 0;
              const percent = Math.max((value / maxValue) * 100, value > 0 ? 8 : 0);

              return (
                <div key={item.primary} className="grid gap-2 sm:grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{item.primary}</p>
                  </div>

                  <div className="relative h-3 overflow-hidden rounded-full bg-slate-900/90">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${percent}%`,
                        background: `linear-gradient(90deg, ${color} 0%, ${accentColor} 100%)`
                      }}
                    />
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">{formatValue(value)}</p>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{metricLabel}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-slate-800 text-sm text-slate-500">
            No hashtag data available for this chart.
          </div>
        )}
      </div>
    </article>
  );
}

export default function HashtagCharts({ postData }) {
  return (
    <div className="grid gap-4">
      <TagAnalyticsChart
        title="Top hashtags by post volume"
        description="The most used hashtags in the current result set, ranked by approved post count."
        data={postData}
        color="#f59e0b"
        accentColor="#f97316"
        metricLabel="posts"
      />
    </div>
  );
}