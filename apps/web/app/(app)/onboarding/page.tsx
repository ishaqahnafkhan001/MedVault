import { ProfileForm } from "@/components/profile-form";
export const metadata = { title: "Set up your profile" };
export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <p className="eyebrow">One quick step</p>
      <h1 className="page-title mt-2">Set up your patient profile</h1>
      <p className="muted mb-7 mt-2">
        This information helps organize your records. Only your full name is required.
      </p>
      <ProfileForm onboarding />
    </div>
  );
}
