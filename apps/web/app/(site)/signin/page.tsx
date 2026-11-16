import { Suspense } from "react";
import { SignIn } from "@/components/forms/SignIn";
export const metadata = { title: "Sign in or register", robots: { index: false, follow: true } };
export default function Page() {
  return (
    <div className="bg-gradient-to-b from-indigo-50 to-paper py-12 sm:py-20">
      <div className="wrap max-w-md"><div className="card p-6 sm:p-8"><Suspense><SignIn /></Suspense></div>
        <p className="note mt-4 text-center">Caregivers sign in on the Uday app. Applying? See Careers.</p></div>
    </div>
  );
}
