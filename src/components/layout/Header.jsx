import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sun, Moon, User, LogOut, Menu, PlusCircle } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";

export default function Header({ isMobileOpen, setMobileOpen }) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/auth");
  };

  return (
    <header className="bg-header-app sticky top-0 z-50 shadow-xs border-b border-app px-4 md:px-6 py-2 transition-colors duration-200">
      <div className="w-full flex items-center justify-between">
        
        {/* Right Section: Mobile Menu Toggle & Brand Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen && setMobileOpen(!isMobileOpen)}
            className="md:hidden p-2 rounded-lg text-app-primary hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="القائمة"
          >
            <Menu className="w-6 h-6" />
          </button>

          <Link to="/" className="flex items-center gap-3 font-extrabold text-xl text-app-primary">
            <img
              src="/logo.png"
              alt="جمعيتي"
              className="h-14 w-14 object-contain transition-transform duration-200 drop-shadow-sm"
            />
            <span>جمعيتي</span>
          </Link>
        </div>

        {/* Left Section: Theme Toggle, New Association, User Profile */}
        <div className="flex items-center gap-3">
          <Link
            to="/create"
            className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-lg btn-app-primary text-sm font-semibold shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>جمعية جديدة</span>
          </Link>

          {/* Theme Switcher Button */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-app-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
          >
            {theme === "dark" ? <Sun className="w-5 h-5 text-amber-300" /> : <Moon className="w-5 h-5 text-slate-700" />}
          </button>

          {/* User Account / Auth Actions */}
          {user ? (
            <div className="flex items-center gap-2 border-r border-app pr-3 mr-1">
              <div className="text-right hidden md:block">
                <div className="text-xs text-app-secondary">مرحباً،</div>
                <div className="text-sm font-bold text-app-primary leading-tight">{user.name}</div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                title="تسجيل الخروج"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-app text-sm font-medium text-app-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <User className="w-4 h-4" />
              <span>دخول المنظم</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
