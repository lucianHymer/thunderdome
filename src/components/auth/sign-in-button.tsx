/**
 * Sign In Button Component
 *
 * Triggers GitHub OAuth sign in flow.
 */

import { signIn } from "@/lib/auth";

export function SignInButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("github");
      }}
    >
      <button
        type="submit"
        className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
      >
        Sign in with GitHub
      </button>
    </form>
  );
}
