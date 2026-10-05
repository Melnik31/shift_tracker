import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { ONBOARDING_COMPLETE_STEP } from '../../lib/constants';
import { storedAfterStep, WizardStep, wizardStepFromStored } from '../../lib/onboardingSteps';
import AuthShell from '../../components/AuthShell';
import { WizardSteps } from './WizardParts';
import StepCampuses from './StepCampuses';
import StepLayout from './StepLayout';
import StepFields from './StepFields';

// Three-step setup wizard: Campuses -> Layout -> Fields. The workspace's name
// and sign-in code are collected at signup now, so there's no separate
// Workspace step. Progress is stored in Workspace.onboardingStep (see
// lib/onboardingSteps.ts for how it maps onto these steps).
export default function Onboarding() {
  const { data: me, refresh } = useAuth();
  const [step, setStep] = useState<WizardStep>(wizardStepFromStored(me?.workspace.onboardingStep ?? 0));
  const navigate = useNavigate();

  async function completeStep(from: WizardStep) {
    await api.patch('/layout/onboarding-step', { step: storedAfterStep(from, ONBOARDING_COMPLETE_STEP) });
    if (from === 3) {
      // Refresh so the route guards see the workspace as set up.
      await refresh();
      navigate('/matrix');
    } else {
      setStep((from + 1) as WizardStep);
    }
  }

  async function skip() {
    await api.post('/layout/skip-onboarding');
    await refresh();
    navigate('/matrix');
  }

  return (
    <AuthShell center={<WizardSteps current={step} />}>
      {step === 1 && <StepCampuses onNext={() => completeStep(1)} onSkip={skip} />}
      {step === 2 && <StepLayout onBack={() => setStep(1)} onNext={() => completeStep(2)} onSkip={skip} />}
      {step === 3 && <StepFields onBack={() => setStep(2)} onFinish={() => completeStep(3)} onSkip={skip} />}
    </AuthShell>
  );
}
