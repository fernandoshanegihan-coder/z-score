const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate, indexStats, MINIMUM_SUBMISSIONS } = require('../community-stats.js');

test('does not calculate before each selected subject reaches the threshold', () => {
  const result = calculate(['physics', 'chemistry', 'biology'], [60, 40, 70], {
    physics: { contributionCount: 101, mean: 50, standardDeviation: 10, ready: true },
    chemistry: { contributionCount: 100, mean: null, standardDeviation: null, ready: false },
    biology: { contributionCount: 150, mean: 55, standardDeviation: 5, ready: true }
  });

  assert.equal(MINIMUM_SUBMISSIONS, 101);
  assert.equal(result.status, 'pending');
  assert.deepEqual(result.pending, [{ key: 'chemistry', contributionCount: 100 }]);
});

test('calculates the three current-cohort subject z-scores and averages them', () => {
  const stats = Object.fromEntries(['physics', 'chemistry', 'biology'].map(key => [key, {
    contributionCount: 120, mean: 50, standardDeviation: 10, ready: true
  }]));
  const result = calculate(['physics', 'chemistry', 'biology'], [60, 40, 70], stats);

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.scores.map(item => item.score), [1, -1, 2]);
  assert.equal(result.overall, 2 / 3);
});

test('does not calculate when a subject has no spread in contributed marks', () => {
  const stats = Object.fromEntries(['physics', 'chemistry', 'biology'].map(key => [key, {
    contributionCount: 101, mean: 50, standardDeviation: 0, ready: false
  }]));
  const result = calculate(['physics', 'chemistry', 'biology'], [60, 40, 70], stats);

  assert.deepEqual(result, { status: 'unavailable', subjectKey: 'physics' });
});

test('indexes the public aggregate response without exposing raw submissions', () => {
  const stats = indexStats([
    { subjectKey: 'physics', contributionCount: 101, mean: 50, standardDeviation: 10, ready: true }
  ]);

  assert.deepEqual(stats.physics, {
    contributionCount: 101,
    mean: 50,
    standardDeviation: 10,
    ready: true
  });
  assert.equal(stats.physics.marks, undefined);
});
