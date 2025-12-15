/**
 * Trials Page
 *
 * This will be implemented by Issue 4 (Trial Management API)
 * For now, this is a placeholder to test authentication.
 */

import { requireUser } from "@/lib/session";

export default async function TrialsPage() {
  const user = await requireUser();

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-4">Trials</h1>
      <p className="text-gray-600">Trial management will be implemented in Issue 4.</p>
      <p className="text-sm text-gray-500 mt-4">Authenticated as: {user.email}</p>
    </div>
  );
}
