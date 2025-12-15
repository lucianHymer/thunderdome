/**
 * User Menu Component
 *
 * Displays user avatar and dropdown menu with settings and sign out options.
 */

import { signOut } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import Link from "next/link";

export async function UserMenu() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  return (
    <div className="relative group">
      <button className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors">
        {user.image ? (
          <img
            src={user.image}
            alt={user.name || "User"}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
            <span className="text-sm font-medium text-gray-700">
              {user.name?.charAt(0).toUpperCase() || "U"}
            </span>
          </div>
        )}
        <span className="font-medium">{user.name}</span>
      </button>

      {/* Dropdown menu */}
      <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
        <div className="py-1">
          <Link
            href="/settings"
            className="block px-4 py-2 text-sm hover:bg-gray-100"
          >
            Settings
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <button
              type="submit"
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-red-600"
            >
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
