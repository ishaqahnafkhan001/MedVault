import { UploadForm } from "@/components/upload-form";
export const metadata = { title: "Upload document" };
export default function UploadPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="eyebrow">Private upload</p>
      <h1 className="page-title mt-2">Add a medical document</h1>
      <p className="muted mb-7 mt-2">
        Tell us whether it is a report or prescription before uploading.
      </p>
      <UploadForm />
    </div>
  );
}
