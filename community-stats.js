(function (root, createApi) {
  const api = createApi();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CommunityStats = api;
})(globalThis, function () {
  const MINIMUM_SUBMISSIONS = 101;

  function calculate(subjectKeys, marks, statsBySubject) {
    if (!Array.isArray(subjectKeys) || !Array.isArray(marks) || subjectKeys.length !== 3 || marks.length !== 3) {
      return { status: 'invalid' };
    }

    const pending = [];
    const scores = subjectKeys.map((key, index) => {
      const stats = statsBySubject[key];
      if (stats && stats.contributionCount >= MINIMUM_SUBMISSIONS && !stats.ready) {
        return { unavailable: true, key };
      }
      if (!stats || !stats.ready || stats.contributionCount < MINIMUM_SUBMISSIONS) {
        pending.push({ key, contributionCount: Number(stats?.contributionCount) || 0 });
        return null;
      }
      if (!Number.isFinite(stats.mean) || !Number.isFinite(stats.standardDeviation) || stats.standardDeviation <= 0) {
        return null;
      }
      return { key, score: (Number(marks[index]) - stats.mean) / stats.standardDeviation };
    });

    const unavailable = scores.find(score => score?.unavailable);
    if (unavailable) return { status: 'unavailable', subjectKey: unavailable.key };
    if (pending.length || scores.some(score => score === null)) {
      return { status: 'pending', pending };
    }
    return {
      status: 'ready',
      scores,
      overall: scores.reduce((sum, item) => sum + item.score, 0) / scores.length
    };
  }

  function indexStats(records) {
    return Object.fromEntries((Array.isArray(records) ? records : []).map(record => [record.subjectKey, {
      contributionCount: Number(record.contributionCount) || 0,
      mean: record.mean === null ? null : Number(record.mean),
      standardDeviation: record.standardDeviation === null ? null : Number(record.standardDeviation),
      ready: record.ready === true
    }]));
  }

  return { MINIMUM_SUBMISSIONS, calculate, indexStats };
});
