import { describe, it, expect } from 'vitest';
import { storedAfterStep, wizardStepFromStored } from './onboardingSteps';

describe('wizardStepFromStored', () => {
  it('maps old and new stored values onto the three wizard steps', () => {
    expect([0, 1].map(wizardStepFromStored)).toEqual([1, 1]);
    expect(wizardStepFromStored(2)).toBe(2);
    expect(wizardStepFromStored(3)).toBe(3);
  });
  it('clamps anything unexpected', () => {
    expect(wizardStepFromStored(-5)).toBe(1);
    expect(wizardStepFromStored(99)).toBe(3);
  });
});

describe('storedAfterStep', () => {
  it('advances to the next step and completes after Fields', () => {
    expect(storedAfterStep(1, 4)).toBe(2);
    expect(storedAfterStep(2, 4)).toBe(3);
    expect(storedAfterStep(3, 4)).toBe(4);
  });
});
