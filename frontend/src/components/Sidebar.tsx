import React from "react";
import {
  LayoutDashboard,
  LogOut,
  X,
  PanelLeftClose,
  PanelLeft,
  User,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.new";
import { useSidebar } from "../App";

// Helper to check if user has permission for a section
const hasPermission = (user: any, section: string) => {
  if (!user || !user.permissions) return false;
  // Admins have access to everything
  if (user.isAdmin || user.app_metadata?.role === 'admin') return true;

  // Check specific permission
  return user.permissions.some((p: any) =>
    (p.section === section || p.section === '*') &&
    (p.action === 'read' || p.action === '*' || p.action === 'create' || p.action === 'update' || p.action === 'delete')
  );
};

// Start with dashboard which is always visible
const getFilteredNavigation = (user: any) => {
  const items = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      section: 'dashboard',
      alwaysShow: true
    },
    {
      name: "Properties",
      href: "/properties",
      icon: LayoutDashboard,
      section: 'properties'
    },
    {
      name: "Reservations",
      href: "/reservations",
      icon: LayoutDashboard,
      section: 'reservations'
    },
    {
      name: "Cleaning",
      href: "/cleaning",
      icon: LayoutDashboard,
      section: 'cleaning'
    }
  ];

  return items.filter(item => item.alwaysShow || hasPermission(user, item.section));
};

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();

  const filteredNavigation = React.useMemo(() => getFilteredNavigation(user), [user]);

  const handleLogout = async () => {
    try {
      console.log('[Sidebar] Logout clicked');
      await signOut();
    } catch (error) {
      console.error('[Sidebar] Logout error:', error);
    }
  };

  const handleNavigation = (href: string) => {
    navigate(href);
    setIsMobileOpen(false);
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return location.pathname === "/" || location.pathname === "/dashboard";
    }
    return location.pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
            fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-gray-200
            transition-all duration-300 ease-in-out
            ${isCollapsed ? "w-16" : "w-64"}
            ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
            lg:translate-x-0 lg:static lg:h-full
          `}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          {!isCollapsed && (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-sm">PF</span>
              </div>
              <span className="font-bold text-gray-900 tracking-tight">PropertyFlow</span>
            </div>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex p-1.5 rounded-lg hover:bg-gray-100 transition-colors items-center justify-center"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <PanelLeft className="w-5 h-5 min-w-[20px] min-h-[20px] shrink-0 text-gray-600" />
            ) : (
              <PanelLeftClose className="w-5 h-5 min-w-[20px] min-h-[20px] shrink-0 text-gray-600" />
            )}
          </button>

          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 flex items-center justify-center"
          >
            <X className="w-5 h-5 min-w-[20px] min-h-[20px] shrink-0 text-gray-600" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {filteredNavigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <button
                key={item.name}
                onClick={() => handleNavigation(item.href)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                  transition-colors duration-150
                  ${active
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                  }
                  ${isCollapsed ? "justify-center" : ""}
                `}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon className={`w-5 h-5 min-w-[20px] min-h-[20px] shrink-0 ${active ? "text-blue-700" : "text-gray-500"}`} />
                {!isCollapsed && (
                  <span className="font-medium">{item.name}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-200 p-4">
          <button
            onClick={() => handleNavigation("/profile")}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
              text-gray-700 hover:bg-gray-100 transition-colors mb-2
              ${isCollapsed ? "justify-center" : ""}
            `}
            title={isCollapsed ? "Profile" : undefined}
          >
            <div className="w-8 h-8 min-w-[32px] min-h-[32px] bg-blue-100 rounded-full flex items-center justify-center shrink-0">
              <User className="w-4 h-4 min-w-[16px] min-h-[16px] shrink-0 text-blue-600" />
            </div>
            {!isCollapsed && user && (
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user.user_metadata?.full_name || user.user_metadata?.name || user.email}
                </p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            )}
          </button>

          <button
            onClick={handleLogout}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
              text-red-600 hover:bg-red-50 transition-colors
              ${isCollapsed ? "justify-center" : ""}
            `}
            title={isCollapsed ? "Logout" : undefined}
          >
            <LogOut className="w-5 h-5 min-w-[20px] min-h-[20px] shrink-0" />
            {!isCollapsed && <span className="font-medium">Logout</span>}
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
