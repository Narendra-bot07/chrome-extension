export const formatTailoringCount = count => (
  `${count} ${count === 1 ? 'JD' : 'JDs'} extracted`
);

export const mapTailoringSeries = series => (
  (Array.isArray(series) ? series : []).map(item => {
    const key = String(item.date || '').slice(0, 10);
    const date = new Date(`${key}T00:00:00`);
    return {
      date: key,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      accessibleLabel: date.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      count: Number(item.count) || 0,
      timestamp: date.getTime(),
    };
  })
);

export const totalTailoredInSeries = series => (
  (Array.isArray(series) ? series : [])
    .reduce((total, item) => total + (Number(item.count) || 0), 0)
);
