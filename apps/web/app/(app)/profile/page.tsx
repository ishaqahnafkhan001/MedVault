import { ProfileForm } from "@/components/profile-form";
export const metadata = { title: "Profile" };
export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <p className="eyebrow">Personal details</p>
      <h1 className="page-title mt-2">Your profile</h1>
      <p className="muted mb-7 mt-2">
        Keep the basics current. Your age is derived from your date of birth.
      </p>
      <ProfileForm />
    </div>
  );
}
