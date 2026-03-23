import React, { useState, useRef, useEffect } from "react";
import { Menu, User, LogOut, UserCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useSidebar } from "../App";
import { useAuth } from "../contexts/AuthContext.new";
import { Breadcrumbs } from "./Breadcrumbs";
import { useBreadcrumbs } from "../hooks/useBreadcrumbs";

export default function Header() {
  const { setIsMobileOpen, isCollapsed } = useSidebar();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const crumbs = useBreadcrumbs();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userMenuOpen]);

  const handleSignOut = async () => {
    try {
      setUserMenuOpen(false);
      await signOut();
      // signOut() handles the redirect to /login
    } catch (error) {
      console.error("Error signing out:", error);
      // signOut() handles redirect even on error
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 lg:px-6">
      {/* Left section */}
      <div className="flex items-center gap-4">
        {/* Mobile menu button */}
        <button
          onClick={() => setIsMobileOpen(true)}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>

        {/* Breadcrumbs - hidden on mobile */}
        <div className="hidden md:block">
          <Breadcrumbs crumbs={crumbs} />
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="User menu"
          >
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            <span className="hidden md:block text-sm font-medium text-gray-700">
              {user?.full_name || user?.email || "User"}
            </span>
          </button>

          {/* Dropdown menu */}
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
              {/* User info */}
              <div className="px-4 py-3 border-b border-gray-200">
                <p className="text-sm font-medium text-gray-900">
                  {user?.full_name || "User"}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>

              {/* Menu items */}
              <Link
                to="/profile"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <UserCircle className="w-4 h-4" />
                Profile
              </Link>

              <div className="border-t border-gray-200 mt-1 pt-1">
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors w-full"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
