// The setup wizard has three steps; Workspace.onboardingStep stores how far a
// workspace has got. ONBOARDING_COMPLETE_STEP (4) is unchanged, so workspaces
// that were mid-way through the old 4-step wizard resume sensibly with no
// migration: old 0 (workspace) and 1 (campuses) both land on Campuses, 2
// (sections/locations) on Layout, 3 (sub-rows) on Fields.
export type WizardStep = 1 | 2 | 3;

export const WIZARD_STEP_LABELS = ['Campuses', 'Layout', 'Fields'] as const;

export function wizardStepFromStored(stored: number): WizardStep {
  if (stored <= 1) return 1;
  if (stored === 2) return 2;
  return 3;
}

// What to store after finishing `step`: it points at the next step to show
// (Campuses done -> 2, Layout done -> 3), and finishing Fields completes it.
export function storedAfterStep(step: WizardStep, completeStep: number): number {
  return step === 3 ? completeStep : step + 1;
}
