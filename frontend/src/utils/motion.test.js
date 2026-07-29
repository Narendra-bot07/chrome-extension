import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTION, buttonMotion, pageVariants, reducedVariants, toastVariants
} from './motion.js';

test('motion timing and easing are centralized in the approved ranges', () => {
  assert.deepEqual(MOTION.duration, {
    instant: 0.08,
    fast: 0.14,
    base: 0.20,
    slow: 0.28,
    emphasis: 0.42
  });
  assert.deepEqual(MOTION.ease.standard, [0.2, 0, 0, 1]);
  assert.deepEqual(MOTION.ease.enter, [0.16, 1, 0.3, 1]);
  assert.deepEqual(MOTION.ease.exit, [0.4, 0, 1, 1]);
});

test('route motion is subtle and reduced motion removes transforms', () => {
  assert.equal(pageVariants.initial.y, 8);
  assert.equal(pageVariants.exit.y, -4);
  assert.equal(reducedVariants.initial.y, undefined);
  assert.equal(reducedVariants.initial.scale, undefined);
  assert.equal(reducedVariants.animate.opacity, 1);
});

test('button and toast motion use transform and opacity only', () => {
  assert.equal(buttonMotion.whileHover.y, -1);
  assert.equal(buttonMotion.whileTap.scale, 0.98);
  assert.equal(toastVariants.initial.opacity, 0);
  assert.equal('width' in toastVariants.animate, false);
  assert.equal('height' in toastVariants.animate, false);
});
