import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, PlusCircle, Users, ChevronRight, ChevronLeft, Wallet, ShieldCheck, BookOpen } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import GuideModal from "../guide/GuideModal";

export default function Sidebar({ isCollapsed, onToggleCollapse, isMobileOpen, setMobileOpen }) {
  const { user } = useAuth();
  const location = useLocation();
  const [userAssociations, setUserAssociations] = useState([]);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    if (user) {
      api.getAssociations()
        .then((data) => {
          setUserAssociations(data.filter((a) => String(a.userId) === String(user.id)));
        })
        .catch((err) => console.error("[SIDEBAR ASSOCS FETCH ERROR]", err));
    } else {
      setUserAssociations([]);
    }
  }, [user, location.pathname]);

  const navItems = [
    { to: "/", label: "الرئيسية", icon: Home },
    { to: "/create", label: "إنشاء جمعية", icon: PlusCircle },
    { to: user ? "/profile" : "/auth", label: user ? `حسابي (${user.name})` : "حساب المنظم", icon: Users },
  ];

  return (
    <>
      {/* Backdrop for Mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          fixed md:sticky top-18 h-[calc(100vh-72px)] right-0 z-40 md:z-20
          bg-card-app border-l border-app shadow-lg md:shadow-none
          flex flex-col justify-between shrink-0
          transition-all duration-300 ease-in-out
          ${isCollapsed ? "w-20" : "w-64"}
          ${isMobileOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"}
        `}
      >
        {/* Top Header inside Sidebar with Collapse Toggle */}
        <div className="p-4 flex items-center justify-between border-b border-app">
          {!isCollapsed && (
            <span className="font-bold text-xs text-app-secondary uppercase tracking-wider">
              القائمة الرئيسية
            </span>
          )}
          <button
            onClick={onToggleCollapse}
            className="hidden md:flex p-2 rounded-lg text-app-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors mx-auto"
            title={isCollapsed ? "توسيع القائمة" : "طّي القائمة"}
          >
            {isCollapsed ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 p-3 space-y-3 overflow-y-auto">
          <div className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen && setMobileOpen(false)}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-150 font-bold text-sm
                    ${
                      isActive
                        ? "bg-sky-700 text-white shadow-md font-extrabold"
                        : "text-app-primary hover:bg-black/5 dark:hover:bg-white/10"
                    }
                    ${isCollapsed ? "justify-center px-0" : ""}
                  `}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
            })}

            {/* Guide Button */}
            <button
              type="button"
              onClick={() => {
                setIsGuideOpen(true);
                if (setMobileOpen) setMobileOpen(false);
              }}
              className={`
                w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-150 font-bold text-sm
                text-app-primary hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer text-right
                ${isCollapsed ? "justify-center px-0" : ""}
              `}
              title={isCollapsed ? "دليل استخدام الجمعية" : undefined}
            >
              <BookOpen className="w-5 h-5 shrink-0 text-sky-600 dark:text-sky-400" />
              {!isCollapsed && <span className="truncate">دليل استخدام الجمعية</span>}
            </button>
          </div>

          {/* User Associations Section in Sidebar */}
          {user && userAssociations.length > 0 && (
            <div className="pt-3 border-t border-app space-y-1.5">
              {!isCollapsed && (
                <div className="px-3 text-xs font-bold text-app-secondary uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>جمعياتي ({userAssociations.length})</span>
                </div>
              )}

              {userAssociations.map((assoc) => (
                <NavLink
                  key={assoc.id}
                  to={`/association/${assoc.id}`}
                  onClick={() => setMobileOpen && setMobileOpen(false)}
                  className={({ isActive }) => `
                    flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all duration-150 text-xs font-semibold
                    ${
                      isActive
                        ? "bg-sky-700 dark:bg-sky-600 text-white shadow-xs"
                        : "text-app-primary hover:bg-black/5 dark:hover:bg-white/10"
                    }
                    ${isCollapsed ? "justify-center px-0" : ""}
                  `}
                  title={isCollapsed ? assoc.name : undefined}
                >
                  <ShieldCheck className="w-4 h-4 text-amber-300 shrink-0" />
                  {!isCollapsed && <span className="truncate">{assoc.name}</span>}
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        {/* Footer info in Sidebar */}
        {!isCollapsed && (
          <div className="p-4 m-3 rounded-xl bg-app text-xs text-app-secondary border border-app text-center space-y-1">
            <p className="font-bold text-app-primary">جمعيتي v1.0</p>
            <p className="mt-0.5">إدارة الجمعيات بسهولة ووضوح</p>
            <div className="pt-2 border-t border-app/50 text-[10px] text-app-primary dark:text-app-secondary/80 leading-relaxed">
              <p>© 2026 Mohamed Aly</p>
              <p>جميع الحقوق محفوظة</p>
            </div>
          </div>
        )}
      </aside>

      {/* Interactive User Guide Modal */}
      <GuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />
    </>
  );
}
